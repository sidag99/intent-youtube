const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
function harness(stored = {}, start = new Date(2026, 9, 24, 12).getTime()) {
  let now = start, listener;
  const local = structuredClone(stored), session = {}, redirects = [], rules = [];
  let tabs = [{id: 1, windowId: 1, active: true, audible: false, url: 'https://www.youtube.com/'}];
  let focus = {id: 1, focused: true}, idle = 'active';
  const event = () => ({addListener() {}});
  const storage = data => ({get: async key => Object.fromEntries((Array.isArray(key) ? key : [key]).map(k => [k, structuredClone(data[k])])), set: async values => Object.assign(data, structuredClone(values)), setAccessLevel: async () => {}});
  const chrome = {
    storage: {local: storage(local), session: storage(session)},
    alarms: {get: async () => null, create: async () => {}, onAlarm: event()},
    idle: {queryState: async () => idle, setDetectionInterval() {}, onStateChanged: event()},
    tabs: {query: async () => tabs, update: async (id, info) => redirects.push({id, ...info}), sendMessage: async () => {}, onActivated: event(), onRemoved: event(), onUpdated: event()},
    windows: {getLastFocused: async () => focus, onFocusChanged: event()},
    declarativeNetRequest: {updateDynamicRules: async r => rules.push(r)},
    action: {setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}},
    runtime: {getURL: s => 'chrome-extension://intent/' + s, openOptionsPage: async () => {}, onMessage: {addListener(fn) {listener = fn;}}, onInstalled: event(), onStartup: event()}
  };
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({chrome, console, URL, Date: Clock});
  context.importScripts = () => vm.runInContext(source('core.js'), context);
  vm.runInContext(source('background.js'), context);
  const sender = {url: 'chrome-extension://intent/settings.html'};
  const send = (message, from = sender) => new Promise(resolve => listener(message, from, resolve));
  return {send, local, session, redirects, rules, advance: ms => {now += ms;}, setTabs: value => {tabs = value;}, setFocus: value => {focus = value;}, setIdle: value => {idle = value;}};
}
test('foreground use counts once across tabs; an unfocused browser stops counting', async () => {
  const h = harness(); await h.send({type: 'GET_STATE'});
  h.advance(10000); assert.equal((await h.send({type: 'GET_STATE'})).usedMs, 10000);
  h.setTabs([{id: 1, active: true, windowId: 1}, {id: 2, active: true, windowId: 2}]);
  h.advance(10000); assert.equal((await h.send({type: 'GET_STATE'})).usedMs, 20000);
  h.setFocus({focused: false}); await h.send({type: 'GET_STATE'});
  h.advance(10000); assert.equal((await h.send({type: 'GET_STATE'})).usedMs, 20000);
});
test('background playback counts and can be excluded, including multiple frame reports', async () => {
  const h = harness(); h.setFocus({focused: false});
  const from = {url: 'https://www.youtube.com/', tab: {id: 1, url: 'https://www.youtube.com/'}, frameId: 0};
  await h.send({type: 'HEARTBEAT', playing: true}, from);
  await h.send({type: 'HEARTBEAT', playing: false}, {...from, frameId: 2});
  h.advance(5000); assert.equal((await h.send({type: 'GET_STATE'})).usedMs, 5000);
  await h.send({type: 'UPDATE_SETTINGS', patch: {countPlayback: false}});
  h.advance(5000); assert.equal((await h.send({type: 'GET_STATE'})).usedMs, 5000);
});
test('budget exhaustion installs a persistent redirect rule and redirects every open YouTube tab', async () => {
  const h = harness({settings: {dailyMinutes: 1}});
  await h.send({type: 'GET_STATE'}); h.advance(30000); await h.send({type: 'GET_STATE'}); h.advance(30000);
  const state = await h.send({type: 'GET_STATE'});
  assert.equal(state.blocked, true); assert.equal(state.usedMs, 60000);
  assert.equal(h.rules.at(-1).addRules[0].action.redirect.extensionPath, '/blocked.html');
  assert.equal(h.redirects[0].url, 'chrome-extension://intent/blocked.html');
  await h.send({type: 'UPDATE_SETTINGS', patch: {dailyMinutes: 2}});
  assert.equal(h.rules.at(-1).addRules.length, 0);
});
test('stored usage survives a new worker and a midnight tick removes yesterday’s block', async () => {
  const before = new Date(2026, 9, 24, 23, 59, 55).getTime();
  const h = harness({settings: {dailyMinutes: 1}, days: {'2026-10-24': 60000}}, before);
  assert.equal((await h.send({type: 'GET_STATE'})).blocked, true);
  h.advance(10000); const state = await h.send({type: 'GET_STATE'});
  assert.equal(state.blocked, false); assert.equal(state.usedMs, 0);
  assert.equal(h.rules.at(-1).addRules.length, 0);
});
test('locked devices stop usage and webpage senders cannot change settings', async () => {
  const h = harness(); h.setIdle('locked');
  await h.send({type: 'GET_STATE'}); h.advance(10000);
  assert.equal((await h.send({type: 'GET_STATE'})).usedMs, 0);
  const result = await h.send({type: 'UPDATE_SETTINGS', patch: {limitEnabled: false}}, {url: 'https://www.youtube.com/', tab: {id: 1}});
  assert.equal(result.ok, false); assert.match(result.error, /only be changed in Intent/);
});
test('concurrent heartbeat requests are serialized without double-counting', async () => {
  const h = harness(); await h.send({type: 'GET_STATE'}); h.advance(12000);
  const results = await Promise.all(Array.from({length: 8}, () => h.send({type: 'GET_STATE'})));
  assert.ok(results.every(r => r.usedMs === 12000));
});
