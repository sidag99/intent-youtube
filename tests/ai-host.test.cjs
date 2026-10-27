const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/ai-host.js'), 'utf8');

function harness() {
  let listener, nextTimer = 0, constructionFailure = false;
  const timers = new Map(), workers = [], responses = [];
  class FakeWorker {
    constructor(url, options) {
      if (constructionFailure) throw new Error('Worker construction failed');
      this.url = url; this.options = options; this.messages = []; this.terminated = false; workers.push(this);
    }
    postMessage(message) {
      if (this.failPost) throw new Error('Payload could not be cloned');
      this.messages.push(message);
    }
    terminate() {this.terminated = true; this.terminations = (this.terminations || 0) + 1;}
  }
  const context = vm.createContext({
    Worker: FakeWorker,
    chrome: {runtime: {getURL: value => 'chrome-extension://intent/' + value, onMessage: {addListener: callback => {listener = callback;}}}},
    setTimeout(callback, delay) {const id = ++nextTimer; timers.set(id, {callback, delay}); return id;},
    clearTimeout(id) {timers.delete(id);}
  });
  vm.runInContext(source, context);
  const send = (overrides = {}, sender = {url: 'chrome-extension://intent/src/background.js'}) => {
    const result = {responses: []};
    result.listening = listener({type: 'AI_CLASSIFY', target: 'intent-ai', videos: [{id: 'abcdefghijk'}], settings: {mode: 'work'}, ...overrides}, sender, response => {
      const plain = structuredClone(response); result.responses.push(plain); responses.push(plain);
    });
    return result;
  };
  return {workers, timers, responses, send, pending: () => vm.runInContext('pending.size', context), failConstruction(value) {constructionFailure = value;}, expire(id = timers.keys().next().value) {const timer = timers.get(id); assert.ok(timer); timers.delete(id); timer.callback();}};
}

test('normal jobs share one module worker and responses settle independently, including out of order', () => {
  const h = harness(), first = h.send(), second = h.send({videos: [{id: 'lmnopqrstuv'}]});
  assert.equal(first.listening, true); assert.equal(second.listening, true); assert.equal(h.workers.length, 1);
  const worker = h.workers[0];
  assert.equal(worker.url, 'chrome-extension://intent/runtime/ai-worker.js'); assert.equal(worker.options.type, 'module');
  assert.equal(worker.messages.length, 2); assert.equal(h.pending(), 2);
  worker.onmessage({data: {id: worker.messages[1].id, ok: true, decisions: [{accepted: true}]}});
  assert.equal(second.responses.length, 1); assert.equal(first.responses.length, 0); assert.equal(h.pending(), 1); assert.equal(h.timers.size, 1);
  worker.onmessage({data: {id: worker.messages[0].id, ok: false, error: 'A recoverable inference failure'}});
  assert.equal(first.responses[0].error, 'A recoverable inference failure'); assert.equal(h.pending(), 0); assert.equal(h.timers.size, 0); assert.equal(worker.terminated, false);
  worker.onmessage({data: {id: worker.messages[0].id, ok: true, decisions: []}});
  assert.equal(first.responses.length, 1, 'duplicate results do not respond twice');
  h.send(); assert.equal(h.workers.length, 1, 'an ordinary inference error does not destroy the usable queue');
});

test('one model timeout terminates the hung worker, settles its whole queue and permits a fresh retry', () => {
  const h = harness(), first = h.send(), second = h.send();
  const failed = h.workers[0], oldMessage = failed.onmessage, oldError = failed.onerror;
  assert.ok([...h.timers.values()].every(timer => timer.delay === 60000));
  h.expire();
  assert.equal(failed.terminated, true); assert.equal(failed.terminations, 1); assert.equal(h.pending(), 0); assert.equal(h.timers.size, 0);
  for (const request of [first, second]) {assert.equal(request.responses.length, 1); assert.equal(request.responses[0].ok, false); assert.match(request.responses[0].error, /too long/);}
  const retry = h.send(), current = h.workers[1]; assert.ok(current); assert.equal(h.pending(), 1);
  oldMessage({data: {id: current.messages[0].id, ok: true, decisions: ['stale forged ID']}});
  oldError();
  assert.equal(current.terminated, false); assert.equal(retry.responses.length, 0); assert.equal(h.pending(), 1); assert.equal(h.timers.size, 1);
  current.onmessage({data: {id: current.messages[0].id, ok: true, decisions: [{accepted: true}]}});
  assert.equal(retry.responses[0].ok, true); assert.equal(h.pending(), 0); assert.equal(h.timers.size, 0);
});

test('worker errors reset all affected jobs and stale callbacks cannot damage its replacement', () => {
  const h = harness(), first = h.send(), second = h.send(), failed = h.workers[0];
  const staleError = failed.onerror, staleMessage = failed.onmessage;
  failed.onerror();
  assert.equal(failed.terminated, true); assert.equal(h.pending(), 0); assert.equal(h.timers.size, 0);
  assert.ok([first, second].every(job => job.responses.length === 1 && job.responses[0].ok === false));
  const retry = h.send(), replacement = h.workers[1];
  staleError(); staleMessage({data: {id: replacement.messages[0].id, ok: true}});
  assert.equal(replacement.terminated, false); assert.equal(retry.responses.length, 0);
  replacement.onmessage({data: {id: replacement.messages[0].id, ok: true, decisions: []}});
  assert.equal(retry.responses.length, 1); assert.equal(h.pending(), 0);
});

test('postMessage failures settle just the bad request and leave other queued jobs usable', () => {
  const h = harness(), first = h.send(), worker = h.workers[0];
  worker.failPost = true;
  const malformed = h.send();
  assert.equal(malformed.responses.length, 1); assert.equal(malformed.responses[0].error, 'Payload could not be cloned');
  assert.equal(first.responses.length, 0); assert.equal(h.pending(), 1); assert.equal(h.timers.size, 1); assert.equal(worker.terminated, false);
  worker.failPost = false;
  const next = h.send();
  for (const message of worker.messages) worker.onmessage({data: {id: message.id, ok: true, decisions: []}});
  assert.equal(first.responses.length, 1); assert.equal(next.responses.length, 1); assert.equal(h.pending(), 0); assert.equal(h.timers.size, 0);
});

test('construction failures leave no pending jobs and subsequent requests can start normally', () => {
  const h = harness(); h.failConstruction(true);
  const failed = h.send();
  assert.equal(failed.responses.length, 1); assert.equal(failed.responses[0].error, 'Worker construction failed'); assert.equal(h.pending(), 0); assert.equal(h.timers.size, 0);
  h.failConstruction(false); const retry = h.send(); assert.equal(h.workers.length, 1);
  h.workers[0].onmessage({data: {id: h.workers[0].messages[0].id, ok: true, decisions: []}});
  assert.equal(retry.responses[0].ok, true);
});

test('AI bridge still rejects page senders, foreign extension origins, unrelated targets and unrelated types', () => {
  const h = harness();
  for (const sender of [{url: 'https://www.youtube.com/'}, {url: 'chrome-extension://other/ai.html'}, {url: 'chrome-extension://intent.evil.test/ai.html'}, {url: 'chrome-extension://intent/ai.html', tab: {id: 1}}]) {
    const ignored = h.send({}, sender); assert.equal(ignored.listening, undefined); assert.deepEqual(ignored.responses, []);
  }
  for (const patch of [{target: 'other'}, {type: 'GET_STATE'}]) assert.equal(h.send(patch).listening, undefined);
  assert.equal(h.workers.length, 0); assert.equal(h.pending(), 0); assert.equal(h.timers.size, 0);
});
