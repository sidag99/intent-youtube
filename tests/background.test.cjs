const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
function harness(stored = {}, start = new Date(2026, 9, 24, 12).getTime(), fetcher, judge, storedSession = {}) {
  let now = start, listener;
  const local = structuredClone(stored), session = structuredClone(storedSession), redirects = [], rules = [], sessionRules = [], broadcasts = [], badges = [], titles = [], icons = [], iconFetches = [], queries = [], queryResults = [], events = {};
  const dynamic = new Map(), perTabRules = new Map(), storageWrites = [];
  let tabs = [{id: 1, windowId: 1, active: true, audible: false, url: 'https://www.youtube.com/'}];
  let focus = {id: 1, focused: true}, idle = 'active';
  const event = name => ({addListener(fn) { if (name) events[name] = fn; }});
  const storage = data => ({get: async key => Object.fromEntries((Array.isArray(key) ? key : [key]).map(k => [k, structuredClone(data[k])])), set: async values => {storageWrites.push({area: data === local ? 'local' : 'session', values: structuredClone(values)}); Object.assign(data, structuredClone(values));}, setAccessLevel: async () => {}});
  const matchesURL = (pattern, value) => {
    try {
      const url = new URL(value), domain = pattern.match(/^\*:\/\/\*\.([^/]+)\/\*$/)?.[1];
      if (domain) return ['http:', 'https:'].includes(url.protocol) && (url.hostname === domain || url.hostname.endsWith('.' + domain));
      return new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*') + '$').test(url.href);
    } catch {return false;}
  };
  const chrome = {
    storage: {local: storage(local), session: storage(session)},
    alarms: {get: async () => null, create: async () => {}, onAlarm: event()},
    idle: {queryState: async () => idle, setDetectionInterval() {}, onStateChanged: event()},
    tabs: {query: async query => {
      queries.push(structuredClone(query));
      const patterns = query?.url ? Array.isArray(query.url) ? query.url : [query.url] : null;
      const result = patterns ? tabs.filter(tab => patterns.some(pattern => matchesURL(pattern, tab.url))) : tabs;
      queryResults.push(result.map(tab => tab.id)); return result;
    }, update: async (id, info) => redirects.push({id, ...info}), sendMessage: async (id, message) => broadcasts.push({id, message: structuredClone(message)}), onActivated: event(), onCreated: event('created'), onRemoved: event('removed'), onUpdated: event('updated')},
    windows: {getLastFocused: async () => focus, onFocusChanged: event()},
    declarativeNetRequest: {updateDynamicRules: async r => {rules.push(r); for (const id of r.removeRuleIds) dynamic.delete(id); for (const rule of r.addRules) dynamic.set(rule.id, structuredClone(rule));}, updateSessionRules: async r => {sessionRules.push(r); for (const id of r.removeRuleIds) perTabRules.delete(id); for (const rule of r.addRules) perTabRules.set(rule.id, structuredClone(rule));}},
    action: {setBadgeText: async value => badges.push(structuredClone(value)), setBadgeBackgroundColor: async () => {}, setTitle: async value => titles.push(structuredClone(value)), setIcon: async value => icons.push(structuredClone(value))},
    offscreen: {createDocument: async () => {}},
    runtime: {getContexts: async () => [{}], sendMessage: async message => message.type === 'AI_CLASSIFY' ? ({ok: true, decisions: judge ? await judge(message.videos, message.settings) : message.videos.map(() => ({accepted: true, uncertain: false}))}) : ({ok: true}), getURL: s => 'chrome-extension://intent/' + s, openOptionsPage: async () => {}, onMessage: {addListener(fn) {listener = fn;}}, onInstalled: event(), onStartup: event()}
  };
  class Clock extends Date { static now() { return now; } }
  class Canvas {
    constructor(width, height) {this.width = width; this.height = height;}
    getContext() {return {drawImage() {}, getImageData: () => {
      const data = new Uint8ClampedArray(this.width * this.height * 4);
      for (let i = 0; i < data.length; i += 4) data.set([54, 94, 75, 255], i);
      return {data, width: this.width, height: this.height};
    } };}
  }
  const context = vm.createContext({chrome, console, URL, AbortSignal, fetch: async url => {
    if (url === 'chrome-extension://intent/icons/128.png') {iconFetches.push(url); return {ok: true, blob: async () => ({})};}
    if (!fetcher) throw new Error('Unexpected network request: ' + url);
    return fetcher(url);
  }, OffscreenCanvas: Canvas, createImageBitmap: async () => ({close() {}}), Date: Clock});
  context.importScripts = (...names) => names.forEach(name => vm.runInContext(source(name), context));
  vm.runInContext(source('background.js'), context);
  const sender = {url: 'chrome-extension://intent/settings.html'};
  const send = (message, from = sender) => new Promise(resolve => listener(message, from, resolve));
  return {send, local, session, storageWrites, redirects, rules, sessionRules, dynamic, perTabRules, broadcasts, badges, titles, icons, iconFetches, queries, queryResults, drain: () => vm.runInContext('queue', context), associated: id => vm.runInContext(`associatedTab(${Number(id)})`, context), updateEvent: (id, info, tab) => events.updated(id, info, tab), removeEvent: id => events.removed(id), advance: ms => {now += ms;}, setTabs: value => {tabs = value.map(tab => ({url: 'https://www.youtube.com/', ...tab}));}, setFocus: value => {focus = value;}, setIdle: value => {idle = value;}, createTab: async tab => {tabs.push({url: 'https://www.youtube.com/', ...tab}); events.created(tab); await send({type: 'GET_STATE'});}, updateTab: async (id, info) => {tabs = tabs.map(tab => tab.id === id ? {...tab, ...info} : tab); events.updated(id, info, tabs.find(tab => tab.id === id)); await send({type: 'GET_STATE'});}, removeTab: async id => {tabs = tabs.filter(tab => tab.id !== id); events.removed(id); await send({type: 'GET_STATE'});}};
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
test('the YouTube toolbar can change only the intent mode from a trusted top-level page', async () => {
  const h = harness();
  const sender = {url: 'https://www.youtube.com/watch?v=abcdefghijk', tab: {id: 1}, frameId: 0};
  const result = await h.send({type: 'SET_MODE', mode: 'music', patch: {limitEnabled: false, hideShorts: false, dailyMinutes: 1440}}, sender);
  assert.equal(result.ok, true); assert.equal(result.settings.mode, 'music');
  assert.equal(result.settings.limitEnabled, true); assert.equal(result.settings.hideShorts, true); assert.equal(result.settings.dailyMinutes, 60);
  assert.equal((await h.send({type: 'SET_MODE', mode: 'off'}, sender)).settings.mode, 'off');
  for (const from of [{...sender, frameId: 2}, {...sender, url: 'https://example.com/'}, {...sender, url: 'https://music.youtube.com/'}, {url: sender.url}]) {
    assert.equal((await h.send({type: 'SET_MODE', mode: 'work'}, from)).ok, false);
  }
  assert.equal((await h.send({type: 'SET_MODE', mode: '__proto__'}, sender)).ok, false);
  assert.equal((await h.send({type: 'GET_STATE'})).settings.mode, 'off');
});

test('feed requests are restricted to top-level YouTube home/video pages and respect the daily block', async () => {
  let calls = 0;
  const h = harness({settings: {dailyMinutes: 1}, days: {'2026-10-24': 60000}}, undefined, async () => {calls++;});
  const sender = {url: 'https://www.youtube.com/', tab: {id: 1}, frameId: 0};
  const blocked = await h.send({type: 'GET_FEED'}, sender);
  assert.equal(blocked.blocked, true); assert.equal(calls, 0);
  h.setTabs([{id: 1, active: true, windowId: 1, url: 'https://www.youtube.com/watch?v=abcdefghijk'}]);
  assert.equal((await h.send({type: 'GET_FEED'}, {...sender, url: 'https://www.youtube.com/watch?v=abcdefghijk'})).blocked, true);
  for (const url of ['https://www.youtube.com/watch', 'https://www.youtube.com/watch?v=bad', 'https://www.youtube.com/results?search_query=music', 'https://music.youtube.com/', 'https://example.com/']) {
    assert.equal((await h.send({type: 'GET_FEED'}, {...sender, url})).ok, false, url);
  }
  assert.equal((await h.send({type: 'GET_FEED'}, {...sender, frameId: 2})).ok, false);
  assert.equal((await h.send({type: 'GET_FEED'}, {url: sender.url})).ok, false);
});
test('watch recommendations always exclude the playing video using the sender URL', async () => {
  require('../src/core.js'); require('../src/feed.js');
  const fetcher = async url => ({ok: true, url, text: async () => '<script>var ytInitialData = ' + JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: ['abcdefghijk', 'lmnopqrstuv'].map(videoId => ({videoRenderer: {videoId, title: {simpleText: 'Build a useful application'}}}))}}}}}) + ';</script>'});
  const h = harness({}, undefined, fetcher);
  const sender = {url: 'https://www.youtube.com/watch?v=abcdefghijk&t=40', tab: {id: 1}, frameId: 0};
  h.setTabs([{id: 1, active: true, windowId: 1, url: sender.url}]);
  const response = await h.send({type: 'GET_FEED', key: IntentFeed.key(IntentCore.defaults()), exclude: []}, sender);
  assert.equal(response.ok, true);
  assert.deepEqual(Array.from(response.items, v => v.id), ['lmnopqrstuv']);
});
test('an old watch-page sender cannot search after the queried live tab has changed video', async () => {
  require('../src/core.js'); require('../src/feed.js');
  let fetches = 0, judgments = 0;
  const settings = IntentCore.sanitize({metadataLimit: 0});
  const h = harness({settings}, undefined, async () => {fetches++; throw new Error('A stale page must not search');}, async () => {judgments++; return [];});
  h.setTabs([{id: 1, active: true, windowId: 1, url: 'https://www.youtube.com/watch?v=Z0000000000'}]);
  const response = await h.send({type: 'GET_FEED', key: IntentFeed.key(settings)}, {url: 'https://www.youtube.com/watch?v=Y0000000000', tab: {id: 1}, frameId: 0});
  assert.equal(response.ok, true); assert.equal(response.stale, true); assert.equal(response.items, undefined);
  assert.equal(fetches, 0); assert.equal(judgments, 0);
});
test('feed identity compares canonical URLs while retaining current-video exclusion', async () => {
  require('../src/core.js'); require('../src/feed.js');
  const settings = IntentCore.sanitize({metadataLimit: 0});
  const fetcher = async url => ({ok: true, url, text: async () => '<script>var ytInitialData = ' + JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: ['abcdefghijk', 'lmnopqrstuv'].map(videoId => ({videoRenderer: {videoId, title: {simpleText: 'Build a useful application'}}}))}}}}}) + ';</script>'});
  const h = harness({settings}, undefined, fetcher);
  h.setTabs([{id: 1, active: true, windowId: 1, url: 'https://www.youtube.com/watch?v=abcdefghijk&t=40'}]);
  const response = await h.send({type: 'GET_FEED', key: IntentFeed.key(settings)}, {url: 'https://WWW.YOUTUBE.COM:443/watch?v=abcdefghijk&t=40', tab: {id: 1}, frameId: 0});
  assert.equal(response.ok, true); assert.equal(response.stale, undefined); assert.deepEqual(Array.from(response.items, video => video.id), ['lmnopqrstuv']);
});
test('feed results and failures recheck the queried live page before replying even before its navigation event', async () => {
  require('../src/core.js'); require('../src/feed.js');
  for (const failing of [false, true]) {
    let release, requested;
    const gate = new Promise(resolve => {release = resolve;}), started = new Promise(resolve => {requested = resolve;});
    const settings = IntentCore.sanitize({metadataLimit: 0});
    const fetcher = async url => {
      requested(); await gate;
      if (failing) throw new Error('An old page search failed');
      return {ok: true, url, text: async () => '<script>var ytInitialData = ' + JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: [{videoRenderer: {videoId: 'A0000000001', title: {simpleText: 'Build a useful application'}}}]}}}}}) + ';</script>'};
    };
    const h = harness({settings}, undefined, fetcher);
    const sender = {url: 'https://www.youtube.com/watch?v=Y0000000000', tab: {id: 1}, frameId: 0};
    h.setTabs([{id: 1, active: true, windowId: 1, url: sender.url}]);
    const pending = h.send({type: 'GET_FEED', key: IntentFeed.key(settings)}, sender);
    await started;
    h.setTabs([{id: 1, active: true, windowId: 1, url: 'https://www.youtube.com/watch?v=Z0000000000'}]);
    release();
    const response = await pending;
    assert.equal(response.ok, true); assert.equal(response.stale, true); assert.equal(response.items, undefined); assert.equal(response.error, undefined);
  }
});
test('captured same-origin page URLs support SPA feeds while MessageSender retains the document creation URL', async () => {
  require('../src/core.js'); require('../src/feed.js');
  const settings = IntentCore.sanitize({metadataLimit: 0});
  let fetches = 0;
  const fetcher = async url => {
    fetches++;
    return {ok: true, url, text: async () => '<script>var ytInitialData = ' + JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: ['A0000000001', 'B0000000002'].map(videoId => ({videoRenderer: {videoId, title: {simpleText: 'Build a useful application'}}}))}}}}}) + ';</script>'};
  };
  for (const [creationURL, pageURL, expected] of [
    ['https://www.youtube.com/watch?v=Z0000000000', 'https://www.youtube.com/', ['A0000000001', 'B0000000002']],
    ['https://www.youtube.com/', 'https://www.youtube.com/watch?v=A0000000001', ['B0000000002']],
    ['https://www.youtube.com/results?search_query=code', 'https://www.youtube.com/watch?v=A0000000001', ['B0000000002']]
  ]) {
    const h = harness({settings}, undefined, fetcher);
    h.setTabs([{id: 1, active: true, windowId: 1, url: pageURL}]);
    const response = await h.send({type: 'GET_FEED', pageURL, key: IntentFeed.key(settings)}, {url: creationURL, tab: {id: 1}, frameId: 0});
    assert.equal(response.ok, true); assert.equal(response.stale, undefined); assert.deepEqual(Array.from(response.items, item => item.id), expected);
  }
  assert.ok(fetches > 0);
});
test('captured SPA routes drive native current-video exclusion and timer topic identity', async () => {
  require('../src/core.js'); require('../src/feed.js');
  const pageURL = 'https://www.youtube.com/watch?v=B0000000002';
  const sender = {url: 'https://www.youtube.com/watch?v=A0000000001', tab: {id: 1}, frameId: 0};
  const received = [], h = harness({}, undefined, undefined, async videos => {
    received.push(Array.from(videos, video => video.id));
    return videos.map(() => ({accepted: true, uncertain: false, similarity: .6, categoryId: 'work', categorySimilarity: .6, categoryMargin: .2}));
  });
  h.setTabs([{id: 1, active: true, windowId: 1, url: pageURL}]);
  const native = await h.send({type: 'FILTER_RECOMMENDATIONS', pageURL, key: IntentFeed.key(IntentCore.defaults()), videos: [{id: 'B0000000002', title: 'Current video'}, {id: 'C0000000003', title: 'Build useful software'}]}, sender);
  assert.equal(native.ok, true); assert.equal(native.stale, undefined); assert.deepEqual(Array.from(native.items, video => video.id), ['C0000000003']);
  const topic = await h.send({type: 'CHECK_TIMER_VIDEO', pageURL, video: {id: 'B0000000002', title: 'Build useful software'}}, sender);
  assert.equal(topic.ok, true); assert.equal(topic.videoTopic.videoId, 'B0000000002'); assert.equal(topic.videoTopic.status, 'matching');
  assert.deepEqual(received, [['C0000000003'], ['B0000000002']]);
});
test('captured page URLs cannot change sender origins or bypass frame, route and live-tab validation', async () => {
  require('../src/core.js'); require('../src/feed.js');
  const liveURL = 'https://www.youtube.com/watch?v=B0000000002', oldURL = 'https://www.youtube.com/watch?v=A0000000001';
  let fetches = 0, judgments = 0;
  const h = harness({}, undefined, async () => {fetches++; throw new Error('Rejected routes must not search');}, async () => {judgments++; return [];});
  h.setTabs([{id: 1, active: true, windowId: 1, url: liveURL}]);
  const sender = {url: 'https://www.youtube.com/', tab: {id: 1}, frameId: 0};
  for (const type of ['GET_FEED', 'FILTER_RECOMMENDATIONS', 'CHECK_TIMER_VIDEO']) {
    const base = {type, key: IntentFeed.key(IntentCore.defaults()), videos: [{id: 'C0000000003', title: 'Useful project'}], video: {id: 'B0000000002', title: 'Current video'}};
    for (const pageURL of [null, 42, {}, '/watch?v=B0000000002', 'https://evil.test/watch?v=B0000000002', 'https://m.youtube.com/watch?v=B0000000002', 'https://www.youtube.com/results?search_query=code']) {
      assert.equal((await h.send({...base, pageURL}, sender)).ok, false, type + ': ' + String(pageURL));
    }
    for (const source of [{...sender, frameId: 2}, {url: sender.url}, {...sender, url: 'https://evil.test/'}, {...sender, url: 'https://music.youtube.com/'}]) assert.equal((await h.send({...base, pageURL: liveURL}, source)).ok, false);
    const stale = await h.send({...base, pageURL: oldURL, video: {id: 'A0000000001', title: 'Old video'}}, sender);
    assert.equal(stale.ok, true); assert.equal(stale.stale, true);
  }
  assert.equal(fetches, 0); assert.equal(judgments, 0);
});
test('a captured SPA topic estimate is discarded after another same-document navigation', async () => {
  let release, requested;
  const gate = new Promise(resolve => {release = resolve;}), started = new Promise(resolve => {requested = resolve;});
  const h = harness({}, undefined, undefined, async () => {requested(); await gate; return [{accepted: true, uncertain: false, similarity: .6}];});
  const pageURL = 'https://www.youtube.com/watch?v=B0000000002';
  h.setTabs([{id: 1, active: true, windowId: 1, url: pageURL}]);
  const pending = h.send({type: 'CHECK_TIMER_VIDEO', pageURL, video: {id: 'B0000000002', title: 'Useful software project'}}, {url: 'https://www.youtube.com/', tab: {id: 1}, frameId: 0});
  await started; await h.updateTab(1, {url: 'https://www.youtube.com/watch?v=C0000000003'}); release();
  const response = await pending;
  assert.equal(response.ok, true); assert.equal(response.stale, true); assert.equal(response.videoTopic, undefined);
});
test('extension appearance follows the active top-level YouTube page and survives worker restart', async () => {
  const h = harness();
  const sender = {url: 'https://www.youtube.com/watch?v=abcdefghijk', tab: {id: 1, active: true}, frameId: 0};
  assert.equal((await h.send({type: 'HEARTBEAT', appearance: 'dark'}, sender)).appearance, 'dark');
  assert.equal(h.local.appearance, 'dark');
  assert.equal((await h.send({type: 'HEARTBEAT', appearance: 'light'}, {...sender, frameId: 2})).appearance, 'dark');
  assert.equal((await h.send({type: 'HEARTBEAT', appearance: 'light'}, {...sender, tab: {...sender.tab, active: false}})).appearance, 'dark');
  assert.equal((await h.send({type: 'HEARTBEAT', appearance: 'light'}, {url: 'https://example.com/', tab: {id: 2}})).appearance, 'dark');
  assert.equal((await harness(h.local).send({type: 'GET_STATE'})).appearance, 'dark');
  assert.equal((await h.send({type: 'HEARTBEAT', appearance: 'light'}, sender)).appearance, 'light');
});
test('a mode change supersedes an in-flight feed and slow search does not block accounting', async () => {
  require('../src/core.js');require('../src/feed.js');
  let release, requested;
  const gate=new Promise(r=>{release=r;});const started=new Promise(r=>{requested=r;});
  const fetcher=async url=>{requested();await gate;return {ok:true,url,text:async()=>'<script>var ytInitialData = '+JSON.stringify({contents:{twoColumnSearchResultsRenderer:{primaryContents:{sectionListRenderer:{contents:[{videoRenderer:{videoId:'abcdefghijk',title:{simpleText:'A better routine'}}}]}}}}})+';</script>'};};
  const h=harness({},undefined,fetcher);
  const sender={url:'https://www.youtube.com/',tab:{id:1},frameId:0};
  const pending=h.send({type:'GET_FEED',key:IntentFeed.key(IntentCore.defaults())},sender);
  await started;
  const changed=await h.send({type:'UPDATE_SETTINGS',patch:{mode:'music'},targetTabId:1});assert.equal(changed.settings.mode,'music');
  release();assert.equal((await pending).stale,true);
});

const fromTab = id => ({url: 'https://www.youtube.com/', tab: {id, active: true, url: 'https://www.youtube.com/'}, frameId: 0});
const tabsPair = () => [{id: 1, windowId: 1, active: true, audible: false, url: 'https://www.youtube.com/'}, {id: 2, windowId: 1, active: false, audible: false, url: 'https://www.youtube.com/'}];
const tabState = (h, id) => h.send({type: 'GET_STATE', targetTabId: id});

test('each YouTube tab keeps its own intent across reloads and worker restarts', async () => {
  const h = harness(); h.setTabs(tabsPair()); await h.send({type: 'GET_STATE'});
  await h.send({type: 'SET_MODE', mode: 'music'}, fromTab(1));
  assert.equal((await tabState(h, 1)).settings.mode, 'music');
  assert.equal((await tabState(h, 2)).settings.mode, 'work');
  await h.send({type: 'SET_MODE', mode: 'study'}, fromTab(2));
  assert.equal((await h.send({type: 'HEARTBEAT'}, fromTab(1))).settings.mode, 'music');
  assert.equal((await h.send({type: 'GET_STATE'})).settings.mode, 'study', 'global mode remembers last used');
  const latest = new Map(h.broadcasts.slice(-2).map(item => [item.id, item.message.settings.mode]));
  assert.equal(latest.get(1), 'music'); assert.equal(latest.get(2), 'study');
  const restarted = harness(h.local, undefined, undefined, undefined, h.session); restarted.setTabs(tabsPair());
  assert.equal((await tabState(restarted, 1)).settings.mode, 'music');
  assert.equal((await tabState(restarted, 2)).settings.mode, 'study');
});
test('new tabs follow last-used mode or a configured fixed mode without changing existing tabs', async () => {
  const h = harness(); await h.send({type: 'GET_STATE'});
  await h.send({type: 'SET_MODE', mode: 'music'}, fromTab(1));
  await h.createTab({id: 2, windowId: 1, active: false});
  assert.equal((await tabState(h, 2)).settings.mode, 'music');
  await h.send({type: 'UPDATE_SETTINGS', patch: {newTabMode: 'study'}});
  await h.createTab({id: 3, windowId: 1, active: false});
  assert.equal((await tabState(h, 3)).settings.mode, 'study');
  assert.equal((await tabState(h, 1)).settings.mode, 'music');
  await h.send({type: 'UPDATE_SETTINGS', patch: {mode: 'leisure'}});
  assert.equal((await tabState(h, 3)).settings.mode, 'study');
});
test('popup mode changes target one tab and webpage senders cannot spoof a target', async () => {
  const h = harness(); h.setTabs(tabsPair()); await h.send({type: 'GET_STATE'});
  const changed = await h.send({type: 'UPDATE_SETTINGS', targetTabId: 2, patch: {mode: 'music'}});
  assert.equal(changed.settings.mode, 'music'); assert.equal(changed.tabId, 2);
  assert.equal((await tabState(h, 1)).settings.mode, 'work');
  assert.equal((await h.send({type: 'GET_STATE', targetTabId: 2}, fromTab(1))).ok, false);
  assert.equal((await h.send({type: 'UPDATE_SETTINGS', targetTabId: 999, patch: {mode: 'study'}})).ok, false);
  assert.equal((await h.send({type: 'SET_MODE', mode: 'study', targetTabId: 2}, fromTab(1))).ok, false);
});
test('Music is timer-exempt by default while eligible background playback still counts once', async () => {
  const h = harness(); h.setTabs(tabsPair());
  await h.send({type: 'SET_MODE', mode: 'music'}, fromTab(1));
  h.advance(10000); assert.equal((await tabState(h, 1)).usedMs, 0);
  h.setFocus({focused: false});
  await h.send({type: 'HEARTBEAT', playing: true}, fromTab(1));
  h.advance(10000); assert.equal((await tabState(h, 1)).usedMs, 0, 'exempt playback never charges');
  await h.send({type: 'HEARTBEAT', playing: true}, fromTab(2));
  h.advance(10000); assert.equal((await tabState(h, 1)).usedMs, 10000);
  await h.send({type: 'UPDATE_SETTINGS', patch: {countModes: {work: false}}});
  h.advance(5000); assert.equal((await tabState(h, 2)).usedMs, 10000);
  assert.equal(h.local.settings.countModes.music, false, 'partial count-mode updates retain other exclusions');
});
test('timer-exempt tabs remain accessible after budget exhaustion, including newly opened exempt tabs', async () => {
  const h = harness({settings: {dailyMinutes: 1}, days: {'2026-10-24': 60000}}); h.setTabs(tabsPair());
  await h.send({type: 'UPDATE_SETTINGS', targetTabId: 2, patch: {mode: 'music'}});
  const exempt = await tabState(h, 2), work = await tabState(h, 1);
  assert.equal(exempt.budgetExhausted, true); assert.equal(exempt.blocked, false); assert.equal(exempt.timerExempt, true);
  assert.equal(work.blocked, true);
  assert.ok(h.redirects.some(item => item.id === 1)); assert.ok(!h.redirects.some(item => item.id === 2));
  assert.equal(h.dynamic.size, 0, 'last-used Music means unknown new tabs are allowed before initialization');
  const redirectRule = h.perTabRules.get(2), allowRule = h.perTabRules.get(3);
  assert.equal(redirectRule.action.type, 'redirect'); assert.ok(redirectRule.condition.tabIds.includes(1));
  assert.equal(allowRule.action.type, 'allow'); assert.ok(allowRule.condition.tabIds.includes(2));
  await h.createTab({id: 3, windowId: 1, active: false});
  assert.equal((await tabState(h, 3)).settings.mode, 'music'); assert.equal((await tabState(h, 3)).blocked, false);
  assert.ok(!h.redirects.some(item => item.id === 3));
  await h.send({type: 'UPDATE_SETTINGS', patch: {newTabMode: 'work'}});
  assert.equal(h.dynamic.get(1).action.type, 'redirect', 'fixed counted default blocks uninitialized new visits');
  assert.ok(h.perTabRules.get(3).condition.tabIds.includes(2), 'known exempt tab overrides default block');
  await h.send({type: 'UPDATE_SETTINGS', patch: {dailyMinutes: 2}});
  assert.equal(h.dynamic.size, 0); assert.equal(h.perTabRules.size, 0);
});
test('an exhausted counted default grants existing Music tabs an explicit DNR allow across reloads', async () => {
  const h = harness({settings: {dailyMinutes: 1, newTabMode: 'work'}, days: {'2026-10-24': 60000}}); h.setTabs(tabsPair());
  await h.send({type: 'UPDATE_SETTINGS', targetTabId: 2, patch: {mode: 'music'}});
  assert.ok(h.dynamic.has(1)); assert.ok(h.perTabRules.get(3).condition.tabIds.includes(2));
  const again = await h.send({type: 'HEARTBEAT', playing: true}, fromTab(2));
  assert.equal(again.blocked, false); assert.equal(again.settings.mode, 'music');
  assert.ok(!h.redirects.some(item => item.id === 2));
  await h.removeTab(2); assert.ok(!Object.hasOwn(h.session.tabModes, 2));
  assert.ok(!h.perTabRules.get(3), 'closed exempt tab rule is removed');
});
test('counted mode on the break page remains blocked even when last-used mode is exempt', async () => {
  const h = harness({settings: {mode: 'music', dailyMinutes: 1}, days: {'2026-10-24': 60000}}, undefined, undefined, undefined, {tabModes: {1: 'work'}});
  h.setTabs([{id: 1, url: 'chrome-extension://intent/blocked.html', active: true, windowId: 1}]);
  const state = await h.send({type: 'GET_STATE'}, {url: 'chrome-extension://intent/blocked.html', tab: {id: 1, url: 'chrome-extension://intent/blocked.html'}});
  assert.equal(state.settings.mode, 'work'); assert.equal(state.blocked, true);
});
test('custom intents have independent tab modes and deleted intents safely fall back', async () => {
  const h = harness(); h.setTabs(tabsPair());
  await h.send({type: 'UPDATE_SETTINGS', patch: {customIntents: {'custom-build': {name: 'Build', description: 'Create useful home furniture'}}, countModes: {'custom-build': false}, mode: 'custom-build'}, targetTabId: 1});
  assert.equal((await tabState(h, 1)).settings.mode, 'custom-build'); assert.equal((await tabState(h, 1)).timerExempt, true);
  assert.equal((await tabState(h, 2)).settings.mode, 'work');
  await h.send({type: 'UPDATE_SETTINGS', patch: {customIntents: {}}});
  assert.equal((await tabState(h, 1)).settings.mode, 'work'); assert.equal(h.session.tabModes[1], 'work');
});
test('an unrelated pre-existing browser tab picks its intent when it first opens YouTube', async () => {
  const h = harness(); h.setTabs([tabsPair()[0], {id: 2, url: 'about:blank', active: false, windowId: 1}]);
  await h.send({type: 'GET_STATE'}); assert.equal(Object.hasOwn(h.session.tabModes, 2), false);
  await h.send({type: 'SET_MODE', mode: 'music'}, fromTab(1));
  h.setTabs(tabsPair());
  assert.equal((await tabState(h, 2)).settings.mode, 'music');
});
test('a different tab changing intent cannot invalidate this tab’s in-flight feed', async () => {
  require('../src/core.js'); require('../src/feed.js');
  let release, requested;
  const gate = new Promise(resolve => {release = resolve;}), started = new Promise(resolve => {requested = resolve;});
  const fetcher = async url => {requested(); await gate; return {ok: true, url, text: async () => '<script>var ytInitialData = ' + JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: [{videoRenderer: {videoId: 'abcdefghijk', title: {simpleText: 'Build a useful application'}}}]}}}}}) + ';</script>'};};
  const h = harness({}, undefined, fetcher); h.setTabs(tabsPair());
  const pending = h.send({type: 'GET_FEED', key: IntentFeed.key(IntentCore.defaults())}, fromTab(1));
  await started; await h.send({type: 'SET_MODE', mode: 'music'}, fromTab(2)); release();
  const result = await pending; assert.equal(result.ok, true); assert.equal(result.stale, undefined); assert.equal(result.items.length, 1);
});
test('exhausted daily budgets still permit semantic feeds in timer-exempt modes', async () => {
  require('../src/core.js'); require('../src/feed.js');
  const fetcher = async url => ({ok: true, url, text: async () => '<script>var ytInitialData = ' + JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: [{videoRenderer: {videoId: 'abcdefghijk', title: {simpleText: 'Quiet jazz music'}}}]}}}}}) + ';</script>'});
  const settings = IntentCore.sanitize({mode: 'music', dailyMinutes: 1});
  const h = harness({settings, days: {'2026-10-24': 60000}}, undefined, fetcher);
  const result = await h.send({type: 'GET_FEED', key: IntentFeed.key(settings)}, fromTab(1));
  assert.equal(result.ok, true); assert.equal(result.blocked, undefined); assert.equal(result.items.length, 1);
});

test('built-in name updates merge with saved names and use stable intent IDs', async () => {
  const h = harness({settings: {intentNames: {work: 'Client projects', study: 'Legal studies'}}});
  const result = await h.send({type: 'UPDATE_SETTINGS', patch: {intentNames: {work: 'Portfolio work'}}});
  assert.equal(result.settings.intentNames.work, 'Portfolio work'); assert.equal(result.settings.intentNames.study, 'Legal studies');
  assert.equal(result.settings.mode, 'work');
});
test('reset restores all preferences and tab intents while retaining usage history and appearance', async () => {
  require('../src/core.js');
  const settings = {mode: 'custom-repair', newTabMode: 'music', metadataLimit: 31, dailyMinutes: 120, hideShorts: false, hideClickbait: false, limitEnabled: false, countPlayback: false, customIntents: {'custom-repair': {name: 'Repair', description: 'Bicycle maintenance'}}, customTopics: {work: 'photography', 'custom-repair': 'wheelbuilding'}, channels: {music: 'Studio North'}, countModes: {work: false, music: true}, intentNames: {work: 'Client projects', study: 'Legal studies'}, intentDescriptions: {study: 'Contract law'}, blockedTerms: 'spoilers'};
  const days = {'2026-10-23': 50000, '2026-10-24': 70000};
  const h = harness({settings, days, appearance: 'dark'}, undefined, undefined, undefined, {tabModes: {1: 'custom-repair', 2: 'music', 3: 'study'}});
  h.setTabs([{id: 1, active: true, windowId: 1}, {id: 2, active: false, windowId: 1}, {id: 3, url: 'https://example.com/', active: false, windowId: 1}]);
  const result = await h.send({type: 'RESET_SETTINGS'});
  assert.equal(result.ok, true); assert.deepEqual(h.local.settings, IntentCore.defaults());
  assert.deepEqual(h.local.days, days); assert.equal(result.usedMs, 70000); assert.equal(result.appearance, 'dark'); assert.equal(h.local.appearance, 'dark');
  assert.deepEqual(h.session.tabModes, {'1': 'work', '2': 'work', '3': 'work'});
  assert.deepEqual(h.broadcasts.map(item => item.id), [1, 2]);
  assert.ok(h.broadcasts.every(item => item.message.reset === true && item.message.settings.mode === 'work' && Object.keys(item.message.settings.customIntents).length === 0));
  assert.equal((await h.send({type: 'GET_STATE', targetTabId: 2})).settings.mode, 'work');
});
test('webpages and embedded extension pages cannot reset settings', async () => {
  const h = harness({settings: {mode: 'music', metadataLimit: 8, intentNames: {work: 'My work'}}});
  for (const sender of [
    {url: 'https://www.youtube.com/', tab: {id: 1}, frameId: 0},
    {url: 'https://example.com/', tab: {id: 2}},
    {url: 'chrome-extension://intent.evil/settings.html'},
    {url: 'chrome-extension://intent/settings.html', tab: {id: 1, url: 'https://www.youtube.com/'}, frameId: 2}
  ]) {
    const result = await h.send({type: 'RESET_SETTINGS'}, sender);
    assert.equal(result.ok, false); assert.match(result.error, /only be reset in Intent/);
  }
  const state = await h.send({type: 'GET_STATE'});
  assert.equal(state.settings.mode, 'music'); assert.equal(state.settings.metadataLimit, 8); assert.equal(state.settings.intentNames.work, 'My work');
});
test('reset moves formerly exempt tabs into counted Work and preserves an exhausted budget', async () => {
  const h = harness({settings: {mode: 'music'}, days: {'2026-10-24': 3600000}}, undefined, undefined, undefined, {tabModes: {1: 'music'}});
  assert.equal((await h.send({type: 'GET_STATE', targetTabId: 1})).blocked, false);
  const reset = await h.send({type: 'RESET_SETTINGS', targetTabId: 1});
  assert.equal(reset.settings.mode, 'work'); assert.equal(reset.blocked, true); assert.equal(reset.budgetExhausted, true);
  assert.equal(reset.usedMs, 3600000); assert.equal(h.redirects.at(-1).url, 'chrome-extension://intent/blocked.html');
});
test('reset supersedes an in-flight feed even when restored preferences have an identical feed key', async () => {
  require('../src/core.js'); require('../src/feed.js');
  let release, requested;
  const gate = new Promise(resolve => {release = resolve;}), started = new Promise(resolve => {requested = resolve;});
  const fetcher = async url => {requested(); await gate; return {ok: true, url, text: async () => '<script>var ytInitialData = ' + JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: [{videoRenderer: {videoId: 'abcdefghijk', title: {simpleText: 'Build a useful tool'}}}]}}}}}) + ';</script>'};};
  const h = harness({}, undefined, fetcher);
  const pending = h.send({type: 'GET_FEED', key: IntentFeed.key(IntentCore.defaults())}, {url: 'https://www.youtube.com/', tab: {id: 1}, frameId: 0});
  await started;
  assert.equal((await h.send({type: 'RESET_SETTINGS'})).ok, true);
  release(); assert.equal((await pending).stale, true);
});

test('tab queries are restricted to YouTube and the owned break page; unrelated pages receive no intent badge or broadcasts', async () => {
  const h = harness({settings: {dailyMinutes: 1}, days: {'2026-10-24': 60000}});
  h.setTabs([
    {id: 1, url: 'https://www.youtube.com/', active: false, windowId: 1},
    {id: 2, url: 'https://www.youtube-nocookie.com/embed/abcdefghijk', active: false, windowId: 1},
    {id: 3, url: 'chrome-extension://intent/blocked.html', active: false, windowId: 1},
    {id: 4, url: 'https://example.com/', active: true, audible: true, windowId: 1},
    {id: 5, url: 'https://youtube.com.evil.test/', active: false, windowId: 1},
    {id: 6, url: 'chrome-extension://unrelated/blocked.html', active: false, windowId: 1}
  ]);
  await h.send({type: 'UPDATE_SETTINGS', patch: {hideShorts: false}});
  assert.ok(h.queries.every(query => JSON.stringify(query.url) === JSON.stringify(['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', 'chrome-extension://intent/blocked.html*'])));
  assert.ok(h.queryResults.every(ids => JSON.stringify(ids) === '[1,2,3]'));
  assert.deepEqual(h.broadcasts.map(item => item.id), [1, 2, 3]);
  assert.ok(h.badges.filter(item => !Object.hasOwn(item, 'tabId')).every(item => item.text === ''), 'the global badge is off on all other apps/sites');
  assert.ok(h.badges.filter(item => item.tabId).every(item => [1, 2, 3].includes(item.tabId)));
  assert.deepEqual(Object.keys(h.session.tabModes).sort(), ['1', '2', '3']);
  const redirectRules = [...h.dynamic.values(), ...h.perTabRules.values()];
  assert.ok(redirectRules.length > 0); assert.ok(redirectRules.every(rule => JSON.stringify(rule.condition.resourceTypes) === '["main_frame"]'), 'external pages’ YouTube iframes are outside budget enforcement');
});
test('new unrelated tabs get no intent, while a pending YouTube tab keeps its initial mode before its URL commits', async () => {
  const h = harness({settings: {newTabMode: 'music'}, days: {'2026-10-24': 3600000}});
  h.setTabs([{id: 8, url: 'https://example.com/', active: true, windowId: 1}]);
  await h.createTab({id: 9, url: 'https://another.example/', active: false, windowId: 1});
  assert.deepEqual(h.session.tabModes, {});
  await h.createTab({id: 10, url: 'about:blank', pendingUrl: 'https://www.youtube.com/watch?v=abcdefghijk', active: false, windowId: 1});
  assert.equal(h.session.tabModes[10], 'music');
  assert.ok(h.perTabRules.get(3)?.condition.tabIds.includes(10), 'the pending exempt tab gets its allow before navigation can hit a counted global default');
  assert.ok(!h.badges.some(item => [8, 9, 10].includes(item.tabId) && item.text), 'uncommitted/other pages receive no intent badge');
});
test('restricted-query gaps do not erase tab intent or exempt reload rules; removal does', async () => {
  const h = harness({days: {'2026-10-24': 3600000}}, undefined, undefined, undefined, {tabModes: {1: 'music'}});
  assert.equal((await h.send({type: 'GET_STATE', targetTabId: 1})).settings.mode, 'music');
  h.setTabs([{id: 1, url: 'about:blank', active: true, windowId: 1}]);
  await h.send({type: 'GET_STATE'});
  assert.equal(h.session.tabModes[1], 'music'); assert.ok(h.perTabRules.get(3)?.condition.tabIds.includes(1));
  h.setTabs([{id: 1, url: 'https://www.youtube.com/watch?v=abcdefghijk', active: true, windowId: 1}]);
  const reloaded = await h.send({type: 'GET_STATE', targetTabId: 1}); assert.equal(reloaded.settings.mode, 'music'); assert.equal(reloaded.blocked, false);
  await h.removeTab(1); assert.equal(h.session.tabModes[1], undefined); assert.equal(h.perTabRules.get(3), undefined);
});
test('confirmed navigation away clears intent, playback reports, badges and per-tab rules, then uses a fresh policy on return', async () => {
  const h = harness({settings: {mode: 'work'}, days: {'2026-10-24': 3600000}}, undefined, undefined, undefined, {tabModes: {1: 'music'}});
  await h.send({type: 'HEARTBEAT', playing: true}, {url: 'https://www.youtube.com/', tab: {id: 1, url: 'https://www.youtube.com/'}, frameId: 0});
  assert.ok(h.perTabRules.get(3)?.condition.tabIds.includes(1));
  await h.updateTab(1, {url: 'https://example.com/', audible: true});
  assert.equal(h.session.tabModes[1], undefined); assert.equal(h.perTabRules.get(3), undefined);
  assert.equal(h.badges.filter(item => item.tabId === 1).at(-1).text, '');
  assert.equal((await h.send({type: 'GET_STATE', targetTabId: 1})).ok, false, 'a popup cannot target a tab that left YouTube');
  const broadcastCount = h.broadcasts.length;
  await h.send({type: 'UPDATE_SETTINGS', patch: {newTabMode: 'study'}});
  assert.equal(h.broadcasts.length, broadcastCount, 'settings are not sent to the unrelated document');
  await h.updateTab(1, {url: 'https://www.youtube.com/'});
  assert.equal((await h.send({type: 'GET_STATE', targetTabId: 1})).settings.mode, 'study');
});
test('YouTube embeds on other sites and non-top-level frame reports cannot activate tracking, appearance or intent', async () => {
  const h = harness(); h.setTabs([{id: 7, url: 'https://example.com/', active: true, audible: true, windowId: 1}]);
  const embedded = {url: 'https://www.youtube.com/embed/abcdefghijk', tab: {id: 7, url: 'https://example.com/', active: true}, frameId: 2};
  await h.send({type: 'HEARTBEAT', playing: true, appearance: 'dark'}, embedded);
  await h.send({type: 'HEARTBEAT', playing: true, appearance: 'dark'}, {...embedded, frameId: 0});
  h.advance(10000); const state = await h.send({type: 'GET_STATE'});
  assert.equal(state.usedMs, 0); assert.equal(state.appearance, undefined); assert.deepEqual(h.session.tabModes, {});
  assert.ok(!h.badges.some(item => item.tabId === 7 && item.text));
  assert.equal((await h.send({type: 'SET_MODE', mode: 'music'}, embedded)).ok, false);
  const top = harness(); top.setFocus({focused: false});
  await top.send({type: 'HEARTBEAT', playing: false}, {url: 'https://www.youtube.com/', tab: {id: 1}, frameId: 0});
  await top.send({type: 'HEARTBEAT', playing: true}, {url: 'https://www.youtube.com/embed/abcdefghijk', tab: {id: 1}, frameId: 3});
  top.advance(10000); assert.equal((await top.send({type: 'GET_STATE'})).usedMs, 0, 'embedded playback cannot override the primary player report');
});
test('an old in-flight YouTube feed cannot recreate tab state after navigation to another site', async () => {
  require('../src/core.js'); require('../src/feed.js');
  let release, requested;
  const gate = new Promise(resolve => {release = resolve;}), started = new Promise(resolve => {requested = resolve;});
  const fetcher = async url => {requested(); await gate; return {ok: true, url, text: async () => '<script>var ytInitialData = ' + JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: [{videoRenderer: {videoId: 'abcdefghijk', title: {simpleText: 'Build a useful tool'}}}]}}}}}) + ';</script>'};};
  const h = harness({}, undefined, fetcher);
  const sender = {url: 'https://www.youtube.com/', tab: {id: 1, url: 'https://www.youtube.com/'}, frameId: 0};
  const pending = h.send({type: 'GET_FEED', key: IntentFeed.key(IntentCore.defaults())}, sender);
  await started; await h.updateTab(1, {url: 'https://example.com/'}); release();
  assert.equal((await pending).stale, true); assert.equal(h.session.tabModes[1], undefined);
  assert.equal((await h.send({type: 'GET_FEED', key: IntentFeed.key(IntentCore.defaults())}, sender)).stale, true);
  assert.equal(h.session.tabModes[1], undefined, 'a late old-page message also stays outside scope');
});

test('per-tab pause preserves intent choices and broadcasts only the paused tab without changing defaults', async () => {
  const h = harness({settings: {mode: 'study', newTabMode: 'music'}}, undefined, undefined, undefined, {tabModes: {1: 'work', 2: 'music'}});
  h.setTabs([{id: 1, active: true, windowId: 1}, {id: 2, active: false, windowId: 1}]);
  const sender = {url: 'https://www.youtube.com/', tab: {id: 1, url: 'https://www.youtube.com/'}, frameId: 0};
  const paused = await h.send({type: 'SET_TAB_PAUSED', paused: true}, sender);
  assert.equal(paused.ok, true); assert.equal(paused.tabPaused, true); assert.equal(paused.timerExempt, true); assert.equal(paused.settings.mode, 'work');
  assert.equal((await h.send({type: 'GET_STATE'})).settings.mode, 'study'); assert.equal(paused.settings.newTabMode, 'music');
  assert.deepEqual(h.session.pausedTabs, {'1': true}); assert.deepEqual(h.session.tabModes, {'1': 'work', '2': 'music'});
  assert.deepEqual(h.broadcasts.map(item => ({id: item.id, paused: item.message.tabPaused})), [{id: 1, paused: true}]);
  const other = await h.send({type: 'GET_STATE', targetTabId: 2}); assert.equal(other.tabPaused, false); assert.equal(other.settings.mode, 'music');
  const resumed = await h.send({type: 'SET_TAB_PAUSED', paused: false}, sender);
  assert.equal(resumed.tabPaused, false); assert.equal(resumed.settings.mode, 'work'); assert.deepEqual(h.session.pausedTabs, {});
  assert.equal(h.broadcasts.at(-1).id, 1); assert.equal(h.broadcasts.at(-1).message.tabPaused, false);
});
test('pause requires a boolean and a trusted top-level YouTube or targeted extension context', async () => {
  const h = harness();
  h.setTabs([{id: 1, active: true, windowId: 1}, {id: 2, url: 'chrome-extension://intent/blocked.html', active: false, windowId: 1}, {id: 3, url: 'https://example.com/', active: false, windowId: 1}]);
  const sender = {url: 'https://www.youtube.com/', tab: {id: 1, url: 'https://www.youtube.com/'}, frameId: 0};
  for (const paused of [undefined, null, 'true', 1]) assert.equal((await h.send({type: 'SET_TAB_PAUSED', paused}, sender)).ok, false);
  for (const from of [{...sender, frameId: 2}, {...sender, url: 'https://example.com/'}, {url: 'https://www.youtube.com/embed/abcdefghijk', tab: {id: 3, url: 'https://example.com/'}, frameId: 2}]) assert.equal((await h.send({type: 'SET_TAB_PAUSED', paused: true}, from)).ok, false);
  assert.equal((await h.send({type: 'SET_TAB_PAUSED', paused: true})).ok, false, 'an extension page must identify the tab explicitly');
  assert.equal((await h.send({type: 'SET_TAB_PAUSED', paused: true, targetTabId: 1}, sender)).ok, false, 'web content cannot spoof a target');
  assert.equal((await h.send({type: 'SET_TAB_PAUSED', paused: true, targetTabId: 3})).ok, false);
  const blocked = await h.send({type: 'SET_TAB_PAUSED', paused: true, targetTabId: 2}); assert.equal(blocked.ok, true); assert.equal(blocked.tabPaused, true);
  assert.deepEqual(h.session.pausedTabs, {'2': true});
});
test('paused tabs add no foreground or playback time while other eligible tabs continue counting once', async () => {
  const h = harness();
  h.setTabs([{id: 1, active: true, audible: true, windowId: 1}, {id: 2, active: false, audible: true, windowId: 1}]);
  await h.send({type: 'SET_TAB_PAUSED', paused: true, targetTabId: 1});
  h.advance(5000); assert.equal((await h.send({type: 'GET_STATE'})).usedMs, 5000, 'unpaused background playback still counts');
  await h.send({type: 'SET_TAB_PAUSED', paused: true, targetTabId: 2});
  await h.send({type: 'HEARTBEAT', playing: true}, {url: 'https://www.youtube.com/', tab: {id: 1, url: 'https://www.youtube.com/'}, frameId: 0});
  h.advance(10000); assert.equal((await h.send({type: 'GET_STATE'})).usedMs, 5000, 'paused active and audible tabs are excluded');
  await h.send({type: 'SET_TAB_PAUSED', paused: false, targetTabId: 1});
  h.advance(5000); assert.equal((await h.send({type: 'GET_STATE'})).usedMs, 10000, 'resuming restores normal accounting without double-counting tabs');
});
test('paused counted tabs remain accessible after exhaustion and preserve their allow through reloads', async () => {
  const h = harness({days: {'2026-10-24': 3600000}});
  h.setTabs([{id: 1, active: true, windowId: 1}, {id: 2, active: false, windowId: 1}]);
  const paused = await h.send({type: 'SET_TAB_PAUSED', paused: true, targetTabId: 1});
  assert.equal(paused.blocked, false); assert.equal(paused.budgetExhausted, true); assert.equal(paused.settings.mode, 'work');
  assert.ok(h.perTabRules.get(3).condition.tabIds.includes(1)); assert.ok(h.perTabRules.get(2).condition.tabIds.includes(2));
  assert.ok(h.redirects.every(item => item.id === 2)); assert.equal(h.badges.filter(item => item.tabId === 1).at(-1).text, '');
  h.setTabs([{id: 1, url: 'about:blank', active: true, windowId: 1}, {id: 2, active: false, windowId: 1}]); await h.send({type: 'GET_STATE'});
  assert.ok(h.perTabRules.get(3).condition.tabIds.includes(1));
  h.setTabs([{id: 1, active: true, windowId: 1}, {id: 2, active: false, windowId: 1}]);
  assert.equal((await h.send({type: 'GET_STATE', targetTabId: 1})).tabPaused, true);
  const resumed = await h.send({type: 'SET_TAB_PAUSED', paused: false, targetTabId: 1});
  assert.equal(resumed.blocked, true); assert.equal(resumed.settings.mode, 'work'); assert.equal(h.perTabRules.get(3), undefined);
  assert.ok(h.redirects.some(item => item.id === 1));
});
test('pause survives worker restarts but clears when a tab closes, leaves YouTube, or preferences reset', async () => {
  const h = harness({days: {'2026-10-24': 12000}, appearance: 'dark'}, undefined, undefined, undefined, {tabModes: {1: 'study', 2: 'music'}, pausedTabs: {1: true, 2: true, bad: true, 3: 'true'}});
  h.setTabs([{id: 1, active: true, windowId: 1}, {id: 2, active: false, windowId: 1}]);
  assert.equal((await h.send({type: 'GET_STATE', targetTabId: 1})).tabPaused, true);
  assert.deepEqual(h.session.pausedTabs, {'1': true, '2': true});
  const restarted = harness(h.local, undefined, undefined, undefined, h.session);
  assert.equal((await restarted.send({type: 'GET_STATE', targetTabId: 1})).tabPaused, true);
  assert.equal((await restarted.send({type: 'GET_STATE', targetTabId: 1})).settings.mode, 'study');
  await h.removeTab(2); assert.equal(h.session.pausedTabs[2], undefined);
  await h.updateTab(1, {url: 'https://example.com/'}); assert.deepEqual(h.session.pausedTabs, {});
  await h.updateTab(1, {url: 'https://www.youtube.com/'}); assert.equal((await h.send({type: 'GET_STATE', targetTabId: 1})).tabPaused, false);
  await h.send({type: 'SET_TAB_PAUSED', paused: true, targetTabId: 1});
  const reset = await h.send({type: 'RESET_SETTINGS', targetTabId: 1});
  assert.equal(reset.tabPaused, false); assert.deepEqual(h.session.pausedTabs, {}); assert.equal(reset.usedMs, 12000); assert.equal(reset.appearance, 'dark');
  assert.equal(h.broadcasts.at(-1).message.tabPaused, false);
});
test('paused feed requests do no search, metadata or model work and return no usable items', async () => {
  require('../src/core.js'); require('../src/feed.js');
  let fetches = 0, judgments = 0;
  const h = harness({}, undefined, async () => {fetches++; throw new Error('Must not fetch while paused');}, async () => {judgments++; return [];});
  await h.send({type: 'SET_TAB_PAUSED', paused: true, targetTabId: 1});
  const response = await h.send({type: 'GET_FEED', key: IntentFeed.key(IntentCore.defaults())}, {url: 'https://www.youtube.com/', tab: {id: 1}, frameId: 0});
  assert.equal(response.ok, true); assert.equal(response.tabPaused, true); assert.equal(response.paused, true); assert.equal(response.items, undefined);
  assert.equal(fetches, 0); assert.equal(judgments, 0);
});
test('pausing during an initial search prevents later metadata/model work and suppresses the response', async () => {
  require('../src/core.js'); require('../src/feed.js');
  let release, requested, judgments = 0, metadata = 0;
  const gate = new Promise(resolve => {release = resolve;}), started = new Promise(resolve => {requested = resolve;});
  const fetcher = async url => {
    if (new URL(url).pathname === '/watch') {metadata++; throw new Error('Must not enrich a paused request');}
    requested(); await gate;
    return {ok: true, url, text: async () => '<script>var ytInitialData = ' + JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: [{videoRenderer: {videoId: 'abcdefghijk', title: {simpleText: 'Build a useful tool'}}}]}}}}}) + ';</script>'};
  };
  const h = harness({}, undefined, fetcher, async videos => {judgments++; return videos.map(() => ({accepted: false, uncertain: true}));});
  const pending = h.send({type: 'GET_FEED', key: IntentFeed.key(IntentCore.defaults())}, {url: 'https://www.youtube.com/', tab: {id: 1}, frameId: 0});
  await started; await h.send({type: 'SET_TAB_PAUSED', paused: true, targetTabId: 1}); release();
  const response = await pending; assert.equal(response.tabPaused, true); assert.equal(response.items, undefined);
  assert.equal(judgments, 0); assert.equal(metadata, 0);
});
test('pause and resume invalidate only that tab’s old feed, including when its saved intent never changed', async () => {
  require('../src/core.js'); require('../src/feed.js');
  let release, requested, judgments = 0;
  const gate = new Promise(resolve => {release = resolve;}), started = new Promise(resolve => {requested = resolve;});
  const fetcher = async url => {requested(); await gate; return {ok: true, url, text: async () => '<script>var ytInitialData = ' + JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: [{videoRenderer: {videoId: 'abcdefghijk', title: {simpleText: 'Build a useful tool'}}}]}}}}}) + ';</script>'};};
  const h = harness({}, undefined, fetcher, async videos => {judgments++; return videos.map(() => ({accepted: true, uncertain: false}));});
  h.setTabs([{id: 1, active: true, windowId: 1}, {id: 2, active: false, windowId: 1}]);
  const key = IntentFeed.key(IntentCore.defaults());
  const first = h.send({type: 'GET_FEED', key}, {url: 'https://www.youtube.com/', tab: {id: 1}, frameId: 0});
  const second = h.send({type: 'GET_FEED', key}, {url: 'https://www.youtube.com/', tab: {id: 2}, frameId: 0});
  await started; await h.send({type: 'SET_TAB_PAUSED', paused: true, targetTabId: 1}); await h.send({type: 'SET_TAB_PAUSED', paused: false, targetTabId: 1}); release();
  const [one, two] = await Promise.all([first, second]);
  assert.equal(one.stale, true); assert.equal(one.items, undefined); assert.equal(two.ok, true); assert.equal(two.items.length, 1);
  assert.equal(judgments, 1, 'only the unaffected tab reaches topic inference');
  assert.equal((await h.send({type: 'GET_STATE', targetTabId: 1})).settings.mode, 'work');
});

test('unrelated tab update and removal events create no associations, badge work or scoped queries', async () => {
  const h = harness();
  await h.send({type: 'GET_STATE'});
  const before = {queries: h.queries.length, badges: h.badges.length, rules: h.rules.length, sessionRules: h.sessionRules.length};
  h.updateEvent(99, {url: 'https://example.com/'}); await h.drain();
  assert.equal(h.associated(99), false);
  h.updateEvent(99, {url: 'https://another.example/'}); h.updateEvent(99, {status: 'loading'}, {id: 99, url: 'https://example.com/'}); h.updateEvent(99, {audible: true, status: 'complete'}); await h.drain();
  h.removeEvent(99); await h.drain();
  assert.equal(h.associated(99), false);
  assert.deepEqual({queries: h.queries.length, badges: h.badges.length, rules: h.rules.length, sessionRules: h.sessionRules.length}, before);
  assert.equal(h.session.tabModes[99], undefined); assert.equal(h.session.pausedTabs[99], undefined);
  await h.send({type: 'SET_TAB_PAUSED', paused: true, targetTabId: 1});
  await h.removeTab(1); assert.equal(h.associated(1), false, 'closed supported tabs also discard their revision bookkeeping');
});


test('browser action defaults to gray outside YouTube and gives supported tabs a cached colored mode icon', async () => {
  const h = harness(); h.setTabs([{id: 7, url: 'https://example.com/', active: true, windowId: 1}]);
  await h.send({type: 'GET_STATE'});
  assert.equal(h.badges.at(-1).text, ''); assert.equal(Object.hasOwn(h.badges.at(-1), 'tabId'), false);
  assert.equal(h.titles.at(-1).title, 'Intent — Off on this site. Only runs on YouTube.');
  const off = h.icons.at(-1); assert.equal(Object.hasOwn(off, 'tabId'), false);
  for (const size of [16, 32]) {
    const pixels = off.imageData[size]; assert.equal(pixels.width, size); assert.equal(pixels.height, size);
    assert.equal(pixels.data[0], pixels.data[1]); assert.equal(pixels.data[1], pixels.data[2]); assert.equal(pixels.data[3], 255);
  }
  h.setTabs([{id: 1, url: 'https://www.youtube.com/', active: true, windowId: 1}]);
  await h.send({type: 'GET_STATE'});
  assert.equal(h.badges.filter(item => item.tabId === 1).at(-1).text, 'W');
  assert.match(h.titles.filter(item => item.tabId === 1).at(-1).title, /Work intent.*timer counts toward your daily limit/);
  const active = h.icons.filter(item => item.tabId === 1).at(-1);
  assert.notEqual(active.imageData[16].data[0], active.imageData[16].data[1]);
  const calls = h.icons.length; await h.send({type: 'GET_STATE'});
  assert.equal(h.icons.length, calls, 'unchanged action state does not redraw on every heartbeat');
  assert.equal(h.iconFetches.length, 1, 'the bundled icon and both pixel sizes are cached across states');
  await h.updateTab(1, {url: 'https://example.com/'});
  assert.equal(h.badges.filter(item => item.tabId === 1).at(-1).text, '');
  assert.equal(h.titles.filter(item => item.tabId === 1).at(-1).title, 'Intent — Off on this site. Only runs on YouTube.');
  const left = h.icons.filter(item => item.tabId === 1).at(-1).imageData[16].data;
  assert.equal(left[0], left[1]); assert.equal(left[1], left[2]);
  assert.ok(h.icons.every(item => item.tabId === undefined || item.tabId === 1), 'unrelated tabs inherit the default without extra tab inspection');
});
test('browser action distinguishes paused tabs from Off and states the Off timer policy', async () => {
  const h = harness(); await h.send({type: 'GET_STATE'});
  await h.send({type: 'SET_TAB_PAUSED', paused: true, targetTabId: 1});
  assert.equal(h.badges.filter(item => item.tabId === 1).at(-1).text, '');
  assert.equal(h.titles.filter(item => item.tabId === 1).at(-1).title, 'Intent — Paused on this tab; filters and timer are off');
  const paused = h.icons.filter(item => item.tabId === 1).at(-1).imageData[32].data;
  assert.equal(paused[0], paused[1]); assert.equal(paused[1], paused[2]);
  for (const size of [16, 32]) {
    const image = h.icons.filter(item => item.tabId === 1).at(-1).imageData[size];
    const pixel = (x, y) => Array.from(image.data.slice((y * size + x) * 4, (y * size + x) * 4 + 4));
    assert.deepEqual(pixel(Math.floor(size * .35), Math.floor(size * .5)), [255, 255, 255, 255], 'left pause bar is visible in the actual icon');
    assert.deepEqual(pixel(Math.floor(size * .65), Math.floor(size * .5)), [255, 255, 255, 255], 'right pause bar is visible in the actual icon');
    assert.deepEqual(pixel(Math.floor(size * .5), Math.floor(size * .5)), [72, 72, 72, 255], 'the pause bars have a contrasting gray center');
  }
  await h.send({type: 'SET_TAB_PAUSED', paused: false, targetTabId: 1});
  await h.send({type: 'UPDATE_SETTINGS', targetTabId: 1, patch: {mode: 'off'}});
  assert.equal(h.badges.filter(item => item.tabId === 1).at(-1).text, 'OFF');
  assert.equal(h.titles.filter(item => item.tabId === 1).at(-1).title, 'Intent — Off on this tab; topic filtering is off; timer counts toward your daily limit');
  await h.send({type: 'UPDATE_SETTINGS', patch: {countModes: {off: false}}});
  assert.equal(h.badges.filter(item => item.tabId === 1).at(-1).text, 'OFF');
  assert.equal(h.titles.filter(item => item.tabId === 1).at(-1).title, 'Intent — Off on this tab; topic filtering is off; timer is exempt from your daily limit');
  const off = h.icons.filter(item => item.tabId === 1).at(-1).imageData[16].data;
  assert.equal(off[0], off[1]); assert.equal(off[1], off[2]);
  assert.notDeepEqual(Array.from(paused), Array.from(h.icons.filter(item => item.tabId === 1).at(-1).imageData[32].data), 'paused and inactive icons remain visually distinct without relying on a badge');
});

test('loading and complete automatically repaint unchanged active, Off and paused action states across reload query gaps', async () => {
  for (const scenario of [
    {mode: 'work', paused: false, badge: 'W', title: /Work intent/},
    {mode: 'off', paused: false, badge: 'OFF', title: /Off on this tab; topic filtering is off/},
    {mode: 'study', paused: true, badge: '', title: /Paused on this tab; filters and timer are off/}
  ]) {
    const h = harness({settings: {mode: scenario.mode, dailyMinutes: 1}, days: {'2026-10-24': 60000}}, undefined, undefined, undefined,
      {tabModes: {'1': scenario.mode}, pausedTabs: scenario.paused ? {'1': true} : {}});
    // Exhausted paused tabs must keep their allow rule and symbol during reload.
    if (!scenario.paused) h.local.days = {};
    await h.send({type: 'GET_STATE'});
    const saved = structuredClone({settings: h.local.settings, modes: h.session.tabModes, paused: h.session.pausedTabs, days: h.local.days});
    const expected = h.icons.filter(item => item.tabId === 1).at(-1).imageData;
    let count = h.icons.filter(item => item.tabId === 1).length;
    let badgeCount = h.badges.filter(item => item.tabId === 1).length, titleCount = h.titles.filter(item => item.tabId === 1).length;
    h.setTabs([]);
    h.updateEvent(1, {status: 'loading'}); await h.drain();
    assert.equal(h.icons.filter(item => item.tabId === 1).length, ++count, scenario.mode + ' repaints on loading without a heartbeat');
    assert.equal(h.badges.filter(item => item.tabId === 1).length, ++badgeCount);
    assert.equal(h.titles.filter(item => item.tabId === 1).length, ++titleCount);
    assert.deepEqual(h.icons.filter(item => item.tabId === 1).at(-1).imageData, expected);
    assert.equal(h.badges.filter(item => item.tabId === 1).at(-1).text, scenario.badge);
    assert.match(h.titles.filter(item => item.tabId === 1).at(-1).title, scenario.title);
    h.setTabs([{id: 1, active: true, windowId: 1}]);
    h.updateEvent(1, {status: 'complete'}); await h.drain();
    assert.equal(h.icons.filter(item => item.tabId === 1).length, ++count, scenario.mode + ' repaints on completion without a user action');
    assert.equal(h.badges.filter(item => item.tabId === 1).length, ++badgeCount);
    assert.equal(h.titles.filter(item => item.tabId === 1).length, ++titleCount);
    assert.deepEqual(h.icons.filter(item => item.tabId === 1).at(-1).imageData, expected);
    assert.equal(h.badges.filter(item => item.tabId === 1).at(-1).text, scenario.badge);
    assert.match(h.titles.filter(item => item.tabId === 1).at(-1).title, scenario.title);
    assert.deepEqual({settings: h.local.settings, modes: h.session.tabModes, paused: h.session.pausedTabs, days: h.local.days}, saved);
    assert.equal(h.iconFetches.length, 1, 'repainting reuses bundled image data');
    if (scenario.paused) assert.deepEqual(h.perTabRules.get(3).condition.tabIds, [1]);
  }
});

test('a YouTube loading event wakes a worker and restores its persisted paused indicator without interaction', async () => {
  const h = harness({}, undefined, undefined, undefined, {tabModes: {'1': 'music'}, pausedTabs: {'1': true}});
  h.setTabs([]);
  h.updateEvent(1, {status: 'loading'}, {id: 1, url: 'https://www.youtube.com/'}); await h.drain();
  assert.equal(h.badges.filter(item => item.tabId === 1).at(-1).text, '');
  assert.match(h.titles.filter(item => item.tabId === 1).at(-1).title, /Paused on this tab/);
  assert.equal(h.session.tabModes[1], 'music'); assert.equal(h.session.pausedTabs[1], true);
  h.setTabs([{id: 1, active: true, windowId: 1}]);
  const paints = h.icons.length; h.updateEvent(1, {status: 'complete'}); await h.drain();
  assert.equal(h.icons.length, paints + 1);
});

const previewPage = videos => '<script>var ytInitialData = ' + JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: videos.map(({id, title, shorts = false}) => ({videoRenderer: {videoId: id, title: {simpleText: title}, ownerText: {simpleText: 'Studio North'}, ...(shorts ? {navigationEndpoint: {commandMetadata: {webCommandMetadata: {url: '/shorts/' + id}}}} : {})}}))}}}}}) + ';</script>';
test('preview requests are restricted to the top-level settings page and cannot override saved configuration or URLs', async () => {
  require('../src/core.js'); require('../src/feed.js');
  let fetches = 0;
  const h = harness({}, undefined, async () => {fetches++; throw new Error('Forbidden request must not fetch');});
  const request = {type: 'GET_PREVIEW', mode: 'work', key: IntentFeed.key(IntentCore.defaults())};
  for (const sender of [
    {url: 'https://www.youtube.com/', tab: {id: 1}, frameId: 0},
    {url: 'https://example.com/'},
    {url: 'chrome-extension://intent/settings.html', frameId: 2},
    {url: 'chrome-extension://intent/popup.html'},
    {url: 'chrome-extension://intent/settings.html', tab: {id: 1, url: 'https://www.youtube.com/'}},
    {url: 'chrome-extension://other/settings.html'}
  ]) assert.equal((await h.send(request, sender)).ok, false);
  for (const override of [{targetTabId: 1}, {patch: {mode: 'music'}}, {url: 'https://example.com/'}, {cursor: 100}]) assert.equal((await h.send({...request, ...override})).ok, false);
  for (const mode of ['off', '__proto__', 'custom-missing', ['work']]) assert.equal((await h.send({...request, mode})).ok, false);
  assert.equal((await h.send({...request, key: 'old'})).stale, true); assert.equal(fetches, 0);
});
test('preview uses saved intent metadata and actual decisions without mutating modes, preferences, usage or tab state', async () => {
  require('../src/core.js'); require('../src/feed.js');
  const settings = IntentCore.sanitize({mode: 'music', metadataLimit: 40, intentDescriptions: {work: 'Professional project planning'}, blockedTerms: 'spoilers'});
  const days = {'2026-10-24': 12000}, pausedTabs = {'1': true}, tabModes = {'1': 'study'};
  const searches = [], judged = [];
  const fixture = previewPage([
    {id: 'aaaaaaaaaaa', title: 'Make room for what matters'},
    {id: 'bbbbbbbbbbb', title: 'Quiet notes after midnight'},
    {id: 'ccccccccccc', title: 'A practical project', shorts: true},
    {id: 'ddddddddddd', title: 'You won’t believe this workflow!!!'},
    {id: 'eeeeeeeeeee', title: 'Spoilers from a project'}
  ]);
  const h = harness({settings, days, appearance: 'dark'}, undefined, async url => {searches.push(url); return {ok: true, url, text: async () => fixture};}, async (videos, config) => {
    judged.push({videos: structuredClone(videos), settings: structuredClone(config)});
    return videos.map(video => ({accepted: video.id === 'aaaaaaaaaaa', uncertain: true}));
  }, {tabModes, pausedTabs});
  const key = IntentFeed.key({...settings, mode: 'work'});
  const result = await h.send({type: 'GET_PREVIEW', mode: 'work', key});
  assert.equal(result.ok, true); assert.equal(result.key, key); assert.equal(result.semantic, true); assert.equal(result.searchLimit, 2);
  assert.equal(result.previewItems.length, 5); assert.equal(result.items, undefined);
  assert.equal(result.previewItems.find(item => item.video.id === 'aaaaaaaaaaa').accepted, true);
  assert.equal(result.previewItems.find(item => item.video.id === 'bbbbbbbbbbb').reason, 'Outside intent');
  assert.equal(result.previewItems.find(item => item.video.id === 'ccccccccccc').reason, 'shorts');
  assert.equal(result.previewItems.find(item => item.video.id === 'ddddddddddd').reason, 'clickbait');
  assert.equal(result.previewItems.find(item => item.video.id === 'eeeeeeeeeee').reason, 'blocked term');
  assert.equal(judged.length, 1); assert.equal(judged[0].settings.mode, 'work'); assert.equal(judged[0].settings.metadataLimit, 0);
  assert.equal(judged[0].settings.intentDescriptions.work, 'Professional project planning');
  assert.ok(searches.length <= 2 && searches.every(url => new URL(url).pathname === '/results'));
  assert.deepEqual(h.local, {settings, days, appearance: 'dark'}); assert.deepEqual(h.session, {tabModes, pausedTabs});
  assert.equal(h.queries.length, 0); assert.equal(h.broadcasts.length, 0); assert.equal(h.badges.length, 0);
});
test('previews respect exhausted counted budgets while exempt intents remain previewable', async () => {
  require('../src/core.js'); require('../src/feed.js');
  const settings = IntentCore.sanitize({dailyMinutes: 1, metadataLimit: 40}); let searches = 0;
  const h = harness({settings, days: {'2026-10-24': 60000}}, undefined, async url => {searches++; return {ok: true, url, text: async () => previewPage([{id: 'abcdefghijk', title: 'Quiet notes after midnight'}])};});
  const work = await h.send({type: 'GET_PREVIEW', mode: 'work', key: IntentFeed.key(settings)});
  assert.equal(work.blocked, true); assert.equal(work.previewItems, undefined); assert.equal(searches, 0);
  const music = await h.send({type: 'GET_PREVIEW', mode: 'music', key: IntentFeed.key({...settings, mode: 'music'})});
  assert.equal(music.ok, true); assert.equal(music.previewItems.length, 1); assert.equal(music.blocked, undefined);
  assert.equal(searches, 2); assert.equal(h.local.days['2026-10-24'], 60000); assert.deepEqual(h.session, {});
});
test('preview results are stale after an intent edit or factory reset, including an identical restored key', async () => {
  require('../src/core.js'); require('../src/feed.js');
  for (const mutation of [{type: 'UPDATE_SETTINGS', patch: {intentDescriptions: {work: 'A changed professional focus'}}}, {type: 'RESET_SETTINGS'}]) {
    let release, requested, judgments = 0;
    const gate = new Promise(resolve => {release = resolve;}), started = new Promise(resolve => {requested = resolve;});
    const h = harness({}, undefined, async url => {requested(); await gate; return {ok: true, url, text: async () => previewPage([{id: 'abcdefghijk', title: 'A useful project'}])};}, async videos => {judgments++; return videos.map(() => ({accepted: true, uncertain: false}));});
    const pending = h.send({type: 'GET_PREVIEW', mode: 'work', key: IntentFeed.key(IntentCore.defaults())});
    await started; await h.send(mutation); release();
    const result = await pending; assert.equal(result.stale, true); assert.equal(result.previewItems, undefined); assert.equal(judgments, 0);
  }
});
test('a normal YouTube feed cannot enable preview mode or expose rejected examples', async () => {
  require('../src/core.js'); require('../src/feed.js');
  let judged;
  const h = harness({}, undefined, async url => ({ok: true, url, text: async () => previewPage([{id: 'aaaaaaaaaaa', title: 'Python programming'}, {id: 'bbbbbbbbbbb', title: 'Python programming short', shorts: true}])}), async videos => {judged = videos; return videos.map(() => ({accepted: true, uncertain: false}));});
  const result = await h.send({type: 'GET_FEED', key: IntentFeed.key(IntentCore.defaults()), preview: true}, {url: 'https://www.youtube.com/', tab: {id: 1}, frameId: 0});
  assert.equal(result.ok, true); assert.equal(result.previewItems, undefined); assert.equal(result.items.length, 1);
  assert.deepEqual(Array.from(judged, video => video.id), ['aaaaaaaaaaa']);
});

test('a preview cannot bypass a counted budget that is reached while its searches run', async () => {
  require('../src/core.js'); require('../src/feed.js');
  const now = new Date(2026, 9, 24, 12).getTime(), settings = IntentCore.sanitize({dailyMinutes: 1});
  let release, requested, judgments = 0;
  const gate = new Promise(resolve => {release = resolve;}), started = new Promise(resolve => {requested = resolve;});
  const tracker = {lastAt: now, counting: true};
  const h = harness({settings, days: {'2026-10-24': 59000}}, now, async url => {requested(); await gate; return {ok: true, url, text: async () => previewPage([{id: 'abcdefghijk', title: 'A useful project'}])};}, async videos => {judgments++; return videos.map(() => ({accepted: true, uncertain: false}));}, {tracker});
  const pending = h.send({type: 'GET_PREVIEW', mode: 'work', key: IntentFeed.key(settings)});
  await started; h.advance(2000); release();
  const result = await pending; assert.equal(result.blocked, true); assert.equal(result.previewItems, undefined); assert.equal(judgments, 0);
  assert.equal(h.local.days['2026-10-24'], 59000, 'preview budget checking projects pending usage without persisting or charging settings-page time');
  assert.deepEqual(h.session, {tracker});
});


test('timer snapshots report actual global and targeted counting with local dates and fresh timestamps', async () => {
  const start = new Date(2026, 9, 24, 12).getTime(), h = harness({}, start);
  let state = await tabState(h, 1);
  assert.equal(state.timerRunning, true); assert.equal(state.tabCounting, true);
  assert.equal(state.timerDay, '2026-10-24'); assert.equal(state.timerUpdatedAt, start);
  h.advance(1500); state = await tabState(h, 1);
  assert.equal(state.usedMs, 1500); assert.equal(state.timerUpdatedAt, start + 1500);
  h.setIdle('idle'); state = await tabState(h, 1);
  assert.equal(state.timerRunning, false); assert.equal(state.tabCounting, false, 'an idle foreground tab is not inferred to be counting');
  const stoppedAt = state.usedMs; h.advance(5000);
  assert.equal((await tabState(h, 1)).usedMs, stoppedAt);
  h.setIdle('active'); h.setFocus({id: 1, focused: false}); state = await tabState(h, 1);
  assert.equal(state.timerRunning, false); assert.equal(state.tabCounting, false, 'an unfocused silent tab is not inferred to be counting');
  await h.send({type: 'HEARTBEAT', playing: true}, fromTab(1));
  state = await tabState(h, 1); assert.equal(state.timerRunning, true); assert.equal(state.tabCounting, true, 'reported playback is an actual independent contributor');
  h.setIdle('locked'); state = await tabState(h, 1);
  assert.equal(state.timerRunning, false); assert.equal(state.tabCounting, false, 'locking the device excludes foreground use and playback');
});

test('a counted background tab can run the global timer while the visible exempt or paused tab does not contribute', async () => {
  const h = harness(); h.setTabs(tabsPair());
  await h.send({type: 'SET_MODE', mode: 'music'}, fromTab(1));
  let state = await h.send({type: 'HEARTBEAT', playing: false}, fromTab(1));
  assert.equal(state.timerRunning, false); assert.equal(state.tabCounting, false); assert.equal(state.timerExempt, true);
  await h.send({type: 'HEARTBEAT', playing: true}, {...fromTab(2), tab: {...fromTab(2).tab, active: false}});
  state = await tabState(h, 1);
  assert.equal(state.timerRunning, true); assert.equal(state.tabCounting, false, 'Music remains exempt while Work playback counts elsewhere');
  assert.equal((await tabState(h, 2)).tabCounting, true);
  await h.send({type: 'SET_TAB_PAUSED', paused: true}, fromTab(1));
  state = await tabState(h, 1); assert.equal(state.timerRunning, true); assert.equal(state.tabCounting, false); assert.equal(state.tabPaused, true);
  await h.send({type: 'UPDATE_SETTINGS', patch: {countPlayback: false}});
  state = await tabState(h, 2); assert.equal(state.timerRunning, false); assert.equal(state.tabCounting, false, 'a background tab without counted playback does not contribute');
});

const topicID = 'aaaaaaaaaaa', nextTopicID = 'bbbbbbbbbbb';
const topicURL = id => `https://www.youtube.com/watch?v=${id}`;
const topicSender = (id = 1, videoId = topicID) => ({url: topicURL(videoId), frameId: 0, tab: {id, windowId: 1, active: true, url: topicURL(videoId)}});
const topicVideo = (id = topicID, title = 'An opaque video title') => ({id, title, description: 'Description and #metadata explain the topic.', channel: 'Independent creator', hashtags: ['#metadata'], keywords: ['topic']});
const matchingTopic = () => ({accepted: true, uncertain: false, similarity: .65, categoryId: 'music', categorySimilarity: .65, categoryMargin: .20});
const unrelatedTopic = () => ({accepted: false, uncertain: false, similarity: .08, categoryId: 'study', categorySimilarity: .62, categoryMargin: .20});
function topicHarness(judge, settings = {}) {
  const h = harness({settings: {mode: 'music', matchOnlyModes: {music: true}, ...settings}}, undefined, undefined, judge);
  h.setTabs([{id: 1, windowId: 1, active: true, url: topicURL(topicID)}]);
  return h;
}
const checkTopic = (h, video = topicVideo(), sender = topicSender()) => h.send({type: 'CHECK_TIMER_VIDEO', video}, sender);

test('matching-only exemptions are opt-in while video categorization also works for counted intents', async () => {
  let calls = 0;
  const h = topicHarness(async () => {calls++; return [unrelatedTopic()];}, {matchOnlyModes: {music: false}});
  let state = await checkTopic(h);
  assert.equal(state.ok, true); assert.equal(state.videoTopic.status, 'unrelated');
  assert.equal(state.timerTopicState, 'off'); assert.equal(state.timerExempt, true);
  h.advance(10000); assert.equal((await tabState(h, 1)).usedMs, 0, 'the existing whole-intent exemption stays the default');
  state = await h.send({type: 'UPDATE_SETTINGS', patch: {matchOnlyModes: {music: true}}});
  state = await tabState(h, 1);
  assert.equal(state.timerTopicState, 'unrelated'); assert.equal(state.timerExempt, false); assert.equal(state.tabCounting, true);
  assert.equal(calls, 1, 'a timer policy change can use the existing topic estimate');

  const counted = topicHarness(async () => [matchingTopic()], {mode: 'work'});
  state = await checkTopic(counted);
  assert.equal(state.videoTopic.status, 'matching'); assert.equal(state.timerTopicState, 'off');
  assert.equal(state.timerExempt, false); assert.equal(state.tabCounting, true, 'a matching badge does not exempt a counted intent');
});

test('matching videos stay exempt and clearly unrelated videos start charging without backcharging model time', async () => {
  let release, started;
  const gate = new Promise(resolve => {release = resolve;}), began = new Promise(resolve => {started = resolve;});
  const h = topicHarness(async () => {started(); await gate; return [unrelatedTopic()];});
  const pending = checkTopic(h); await began;
  let state = await tabState(h, 1);
  assert.equal(state.timerTopicState, 'checking'); assert.equal(state.timerExempt, true); assert.equal(state.tabCounting, false);
  h.advance(10000); assert.equal((await tabState(h, 1)).usedMs, 0);
  release(); state = await pending;
  assert.equal(state.timerTopicState, 'unrelated'); assert.equal(state.timerExempt, false); assert.equal(state.usedMs, 0);
  h.advance(5000); state = await tabState(h, 1); assert.equal(state.usedMs, 5000);
  await h.updateTab(1, {url: topicURL(nextTopicID)});
  state = await tabState(h, 1); assert.equal(state.timerExempt, true, 'a newly opened video is not charged using the previous video estimate');
  h.advance(5000); assert.equal((await tabState(h, 1)).usedMs, 5000);

  const matching = topicHarness(async () => [matchingTopic()]);
  state = await checkTopic(matching); assert.equal(state.timerTopicState, 'matching'); assert.equal(state.timerExempt, true);
  matching.advance(5000); assert.equal((await tabState(matching, 1)).usedMs, 0);
});

test('weak, uncertain, malformed and failed topic decisions preserve the exemption', async () => {
  const decisions = [
    {...unrelatedTopic(), uncertain: true}, {...unrelatedTopic(), similarity: .25},
    {...unrelatedTopic(), categorySimilarity: .39}, {...unrelatedTopic(), categoryMargin: .01},
    {...unrelatedTopic(), categoryId: 'music'}, {...unrelatedTopic(), categoryId: 'not-a-saved-intent'},
    {...matchingTopic(), similarity: .29}, {}, {accepted: 'false', uncertain: false}
  ];
  for (const decision of decisions) {
    const h = topicHarness(async () => [decision]);
    const state = await checkTopic(h);
    assert.equal(state.timerTopicState, 'uncertain', JSON.stringify(decision));
    assert.equal(state.timerExempt, true); assert.equal(state.tabCounting, false);
    h.advance(10000); assert.equal((await tabState(h, 1)).usedMs, 0);
  }
  const failed = topicHarness(async () => {throw new Error('The model could not load');});
  const state = await checkTopic(failed); assert.equal(state.ok, true); assert.equal(state.timerTopicState, 'uncertain'); assert.equal(state.timerExempt, true);
});

test('topic requests require the real top-level current YouTube video and never trust a page verdict', async () => {
  let calls = 0, inspected;
  const h = topicHarness(async videos => {calls++; inspected = videos[0]; return [unrelatedTopic()];});
  const invalid = [
    {sender: {...topicSender(), frameId: 2}},
    {sender: {url: topicURL(topicID), frameId: 0}},
    {sender: {...topicSender(), url: 'https://example.com/watch?v=' + topicID}},
    {sender: {...topicSender(), url: 'https://music.youtube.com/watch?v=' + topicID}},
    {sender: {...topicSender(), url: 'https://www.youtube.com.evil.test/watch?v=' + topicID}},
    {sender: {...topicSender(), url: 'chrome-extension://intent/settings.html'}},
    {sender: {...topicSender(), url: 'https://www.youtube.com/results?search_query=music'}},
    {sender: topicSender(), video: topicVideo(nextTopicID)},
    {sender: topicSender(), video: topicVideo(topicID, '')}
  ];
  for (const {sender, video = topicVideo()} of invalid) assert.equal((await checkTopic(h, video, sender)).ok, false);
  assert.equal(calls, 0);
  const stale = await checkTopic(h, topicVideo(nextTopicID), topicSender(1, nextTopicID));
  assert.equal(stale.stale, true); assert.equal(calls, 0, 'a forged sender URL cannot replace the queried tab URL');
  const state = await checkTopic(h, {...topicVideo(), accepted: true, status: 'matching', categoryId: 'music'});
  assert.equal(state.timerTopicState, 'unrelated'); assert.equal(state.timerExempt, false);
  assert.equal(Object.hasOwn(inspected, 'accepted'), false); assert.equal(Object.hasOwn(inspected, 'status'), false);
  assert.equal(calls, 1, 'only the bundled model produces a topic verdict');
});

test('topic metadata is bounded, uses descriptions and tags, and does not apply recommendation distractions', async () => {
  let inspected, config;
  const h = topicHarness(async (videos, settings) => {inspected = videos[0]; config = settings; return [matchingTopic()];}, {hideClickbait: true, blockedTerms: 'forbidden', channels: {music: 'Only this channel'}});
  const state = await checkTopic(h, {...topicVideo(), title: 'T'.repeat(600), description: 'D'.repeat(2000), channel: 'C'.repeat(200), hashtags: Array(40).fill('#' + 'h'.repeat(100)), keywords: ['opaque', 9, 'music']});
  assert.equal(state.videoTopic.status, 'matching');
  assert.equal(inspected.title.length, 500); assert.equal(inspected.description.length, 1800); assert.equal(inspected.channel.length, 160);
  assert.equal(inspected.hashtags.length, 30); assert.ok(inspected.hashtags.every(tag => tag.length === 80));
  assert.deepEqual(Array.from(inspected.keywords), ['opaque', 'music']);
  assert.equal(config.hideClickbait, false); assert.equal(config.hideShorts, false); assert.equal(config.blockedTerms, '');
  assert.ok(Object.values(config.channels).every(value => value === ''), 'a channel allowlist is not evidence of the current video topic');
});

test('Off, paused tabs and hidden Shorts skip topic model work', async () => {
  let calls = 0;
  const h = topicHarness(async () => {calls++; return [matchingTopic()];});
  await h.send({type: 'SET_MODE', mode: 'off'}, topicSender());
  let state = await checkTopic(h); assert.equal(state.timerTopicState, 'off'); assert.equal(calls, 0);
  await h.send({type: 'SET_MODE', mode: 'music'}, topicSender());
  await h.send({type: 'SET_TAB_PAUSED', paused: true}, topicSender());
  state = await checkTopic(h); assert.equal(state.tabPaused, true); assert.equal(calls, 0);
  await h.send({type: 'SET_TAB_PAUSED', paused: false}, topicSender());
  const shortsURL = 'https://www.youtube.com/shorts/' + topicID;
  await h.updateTab(1, {url: shortsURL});
  const shortsSender = {...topicSender(), url: shortsURL, tab: {...topicSender().tab, url: shortsURL}};
  await checkTopic(h, topicVideo(), shortsSender); assert.equal(calls, 0);
  await h.send({type: 'UPDATE_SETTINGS', patch: {hideShorts: false}});
  state = await checkTopic(h, topicVideo(), shortsSender); assert.equal(calls, 1); assert.equal(state.videoTopic.status, 'matching');
});

test('concurrent topic checks share one model job and completed estimates survive a worker restart', async () => {
  let release, started, calls = 0;
  const gate = new Promise(resolve => {release = resolve;}), began = new Promise(resolve => {started = resolve;});
  const h = topicHarness(async () => {calls++; started(); await gate; return [unrelatedTopic()];});
  const first = checkTopic(h); await began; const second = checkTopic(h);
  await h.send({type: 'GET_STATE'}); release();
  const results = await Promise.all([first, second]);
  assert.equal(calls, 1); assert.ok(results.some(state => state.videoTopic?.status === 'unrelated'));
  assert.equal((await checkTopic(h)).videoTopic.status, 'unrelated'); assert.equal(calls, 1, 'unchanged metadata is not reclassified');
  const resumed = harness(h.local, undefined, undefined, async () => {throw new Error('A persisted estimate should be reused');}, h.session);
  resumed.setTabs([{id: 1, windowId: 1, active: true, url: topicURL(topicID)}]);
  const state = await checkTopic(resumed); assert.equal(state.timerTopicState, 'unrelated'); assert.equal(state.timerExempt, false);
});

test('an in-flight topic estimate does not block mode changes and cannot exempt the replacement mode', async () => {
  let release, started;
  const gate = new Promise(resolve => {release = resolve;}), began = new Promise(resolve => {started = resolve;});
  const h = topicHarness(async () => {started(); await gate; return [matchingTopic()];});
  const pending = checkTopic(h); await began;
  const changed = await h.send({type: 'SET_MODE', mode: 'work'}, topicSender());
  assert.equal(changed.settings.mode, 'work'); assert.equal(changed.timerExempt, false);
  h.advance(2000); assert.equal((await tabState(h, 1)).usedMs, 2000);
  release(); assert.equal((await pending).stale, true);
  const state = await tabState(h, 1); assert.equal(state.settings.mode, 'work'); assert.equal(state.timerExempt, false);
});

test('new navigation wins over an old topic response and tab removal cannot resurrect its review', async () => {
  let release, started;
  const gate = new Promise(resolve => {release = resolve;}), began = new Promise(resolve => {started = resolve;});
  const h = topicHarness(async videos => {if (videos[0].id === topicID) {started(); await gate; return [unrelatedTopic()];} return [matchingTopic()];});
  const old = checkTopic(h); await began;
  await h.updateTab(1, {url: topicURL(nextTopicID)});
  const fresh = await checkTopic(h, topicVideo(nextTopicID), topicSender(1, nextTopicID));
  assert.equal(fresh.videoTopic.videoId, nextTopicID); assert.equal(fresh.videoTopic.status, 'matching');
  release(); assert.equal((await old).stale, true);
  const state = await tabState(h, 1); assert.equal(state.videoTopic.videoId, nextTopicID); assert.equal(state.timerExempt, true);

  let finish, announce;
  const held = new Promise(resolve => {finish = resolve;}), notified = new Promise(resolve => {announce = resolve;});
  const removed = topicHarness(async () => {announce(); await held; return [unrelatedTopic()];});
  const pending = checkTopic(removed); await notified; await removed.removeTab(1); finish();
  assert.equal((await pending).stale, true); assert.equal(Object.hasOwn(removed.session.timerReviews, '1'), false);
  assert.equal(Object.hasOwn(removed.session.tabModes, '1'), false);
});

test('pausing or editing intent meaning invalidates an in-flight video estimate', async () => {
  for (const mutation of [{type: 'SET_TAB_PAUSED', paused: true}, {type: 'UPDATE_SETTINGS', patch: {intentDescriptions: {music: 'Only classical piano practice'}}}]) {
    let release, started;
    const gate = new Promise(resolve => {release = resolve;}), began = new Promise(resolve => {started = resolve;});
    const h = topicHarness(async () => {started(); await gate; return [unrelatedTopic()];});
    const pending = checkTopic(h); await began;
    await h.send(mutation, mutation.type === 'SET_TAB_PAUSED' ? topicSender() : undefined);
    release(); assert.equal((await pending).stale, true);
    const state = await tabState(h, 1); assert.equal(state.timerExempt, true); assert.equal(state.tabCounting, false);
  }
});

test('non-video pages restore the whole-intent exemption and Off follows its own timer policy', async () => {
  const h = topicHarness(async () => [unrelatedTopic()]);
  await checkTopic(h); h.advance(1000); assert.equal((await tabState(h, 1)).usedMs, 1000);
  await h.updateTab(1, {url: 'https://www.youtube.com/results?search_query=piano'});
  let state = await tabState(h, 1); assert.equal(state.timerTopicState, 'not-video'); assert.equal(state.timerExempt, true); assert.equal(state.videoTopic, null);
  h.advance(3000); assert.equal((await tabState(h, 1)).usedMs, 1000);
  await h.updateTab(1, {url: 'https://www.youtube.com/'});
  state = await tabState(h, 1); assert.equal(state.timerTopicState, 'not-video'); assert.equal(state.timerExempt, true);
  await h.send({type: 'SET_MODE', mode: 'off'}, fromTab(1));
  h.advance(2000); state = await tabState(h, 1); assert.equal(state.usedMs, 3000); assert.equal(state.timerTopicState, 'off'); assert.equal(state.timerExempt, false);
  await h.send({type: 'UPDATE_SETTINGS', patch: {countModes: {off: false}}});
  h.advance(2000); assert.equal((await tabState(h, 1)).usedMs, 3000);
});

test('unrelated exempt-mode videos reach the daily block without denying navigation to exempt videos', async () => {
  const h = harness({settings: {mode: 'music', dailyMinutes: 1, matchOnlyModes: {music: true}}, days: {'2026-10-24': 59000}}, undefined, undefined, async videos => [videos[0].id === topicID ? unrelatedTopic() : matchingTopic()]);
  h.setTabs([{id: 1, windowId: 1, active: true, url: topicURL(topicID)}, {id: 2, windowId: 1, active: false, url: topicURL(nextTopicID)}]);
  await checkTopic(h); await checkTopic(h, topicVideo(nextTopicID), topicSender(2, nextTopicID));
  h.advance(1000); const unrelated = await tabState(h, 1), matching = await tabState(h, 2);
  assert.equal(unrelated.usedMs, 60000); assert.equal(unrelated.blocked, true); assert.equal(matching.blocked, false); assert.equal(matching.timerExempt, true);
  assert.ok(h.redirects.some(change => change.id === 1 && change.url === 'chrome-extension://intent/blocked.html'));
  assert.equal(h.redirects.some(change => change.id === 2), false);
  assert.equal(h.perTabRules.get(2), undefined, 'a conditional exemption does not ban all navigation in its tab');
  assert.deepEqual(h.perTabRules.get(3).condition.tabIds, [1, 2], 'mode-based allow rules let the user leave for Home/search or a matching video');
  await h.updateTab(1, {url: 'https://www.youtube.com/'});
  const home = await tabState(h, 1); assert.equal(home.blocked, false); assert.equal(home.timerExempt, true); assert.equal(home.videoTopic, null);
});

test('clearly unrelated playback counts in the background while matching foreground videos stay exempt', async () => {
  const h = topicHarness(async videos => [videos[0].id === topicID ? unrelatedTopic() : matchingTopic()]);
  h.setTabs([{id: 1, windowId: 1, active: false, audible: true, url: topicURL(topicID)}, {id: 2, windowId: 1, active: true, url: topicURL(nextTopicID)}]);
  await checkTopic(h); await checkTopic(h, topicVideo(nextTopicID), topicSender(2, nextTopicID));
  let foreground = await tabState(h, 2);
  assert.equal(foreground.timerExempt, true); assert.equal(foreground.tabCounting, false); assert.equal(foreground.timerRunning, true);
  assert.equal((await tabState(h, 1)).tabCounting, true);
  h.advance(5000); assert.equal((await tabState(h, 2)).usedMs, 5000);
  await h.send({type: 'SET_TAB_PAUSED', paused: true}, topicSender());
  foreground = await tabState(h, 2); assert.equal(foreground.timerRunning, false);
  h.advance(5000); assert.equal((await tabState(h, 2)).usedMs, 5000, 'pausing unrelated background playback stops its contribution');
});

test('pending navigation from a conditional break page can reach Home, search and a new matching video', async () => {
  for (const destination of ['https://www.youtube.com/', 'https://www.youtube.com/results?search_query=piano', topicURL(nextTopicID)]) {
    const h = harness({settings: {mode: 'music', dailyMinutes: 1, matchOnlyModes: {music: true}}, days: {'2026-10-24': 60000}}, undefined, undefined, async videos => [videos[0].id === topicID ? unrelatedTopic() : matchingTopic()]);
    h.setTabs([{id: 1, windowId: 1, active: true, url: topicURL(topicID)}]);
    const blocked = await checkTopic(h); assert.equal(blocked.blocked, true);
    const redirectsBefore = h.redirects.length;
    // Chrome retains the old extension URL while the destination is pending.
    h.setTabs([{id: 1, windowId: 1, active: true, url: 'chrome-extension://intent/blocked.html', pendingUrl: destination}]);
    const pending = await tabState(h, 1);
    assert.equal(pending.blocked, false, destination); assert.equal(pending.timerExempt, true);
    assert.equal(pending.videoTopic, null, 'the old unrelated video cannot own a pending destination');
    assert.equal(pending.timerTopicState, destination.includes('/watch?') ? 'checking' : 'not-video');
    assert.equal(h.redirects.length, redirectsBefore, 'the old review cannot cancel the pending navigation by redirecting again');
    if (destination.includes('/watch?')) {
      h.setTabs([{id: 1, windowId: 1, active: true, url: destination}]);
      const matched = await checkTopic(h, topicVideo(nextTopicID), topicSender(1, nextTopicID));
      assert.equal(matched.videoTopic.status, 'matching'); assert.equal(matched.blocked, false);
    }
  }
});

require('../src/core.js'); require('../src/feed.js');
const nativeKey = (settings = {}, locale) => IntentFeed.key(IntentCore.sanitize(settings), locale);
const nativeVideo = (id = 'N0000000000', title = 'A useful project') => ({id, title, channel: 'Studio', description: 'How to build a useful software tool.', thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`});
const filterNative = (h, videos = [nativeVideo()], settings = {}, sender = fromTab(1), extra = {}) => h.send({type: 'FILTER_RECOMMENDATIONS', key: nativeKey(settings, extra.locale), videos, ...extra}, sender);

test('native recommendation checks return only bundled-model acceptances without search or enrichment requests', async () => {
  let inspected, searches = 0;
  const config = {metadataLimit: 40};
  const h = harness({settings: config}, undefined, async () => {searches++; throw new Error('No external fetch is permitted');}, async (videos, settings) => {inspected = {videos, settings}; return videos.map(video => ({accepted: video.id === 'N0000000000', uncertain: false}));});
  const result = await filterNative(h, [nativeVideo(), nativeVideo('N0000000001')], config);
  assert.equal(result.ok, true); assert.equal(result.semantic, true); assert.equal(result.key, nativeKey(config));
  assert.deepEqual(Array.from(result.items, video => video.id), ['N0000000000']); assert.equal(searches, 0);
  assert.equal(inspected.settings.metadataLimit, 40, 'the metadata preference cannot cause this API to fetch descriptions');
  assert.equal(h.storageWrites.some(write => Object.keys(write.values).some(key => /recommendation/i.test(key))), false, 'candidate metadata and decisions are not persisted');
});

test('native recommendation metadata is bounded, deduplicated and strips all supplied source/verdict flags', async () => {
  let inspected;
  const h = harness({}, undefined, undefined, async videos => {inspected = videos; return videos.map(() => ({accepted: true}));});
  const supplied = {...nativeVideo(), title: 't'.repeat(600), channel: 'C'.repeat(250), description: 'D'.repeat(1600), metadata: 'M'.repeat(150), duration: '0'.repeat(50), keywords: Array(40).fill('K'.repeat(150)), hashtags: ['real', 7, ...Array(35).fill('H'.repeat(150))], thumbnail: 'https://attacker.example/image.jpg', accepted: true, visible: true, semantic: true, source: 'native', categoryId: 'work', url: 'https://attacker.example/' };
  const input = [supplied, supplied, {...nativeVideo(), id: '../invalid'}, ...Array.from({length: 60}, (_, index) => nativeVideo('N' + String(index + 1).padStart(10, '0')))];
  const result = await filterNative(h, input);
  assert.equal(result.ok, true); assert.ok(inspected.length <= 48); assert.equal(new Set(inspected.map(video => video.id)).size, inspected.length);
  const first = inspected[0];
  assert.equal(first.title.length, 500); assert.equal(first.channel.length, 200); assert.equal(first.description.length, 1200); assert.equal(first.metadata.length, 120); assert.equal(first.duration.length, 30);
  assert.equal(first.keywords.length, 30); assert.ok(first.keywords.every(value => value.length === 100)); assert.ok(first.hashtags.every(value => typeof value === 'string' && value.length <= 100));
  assert.equal(first.thumbnail, 'https://i.ytimg.com/vi/N0000000000/hqdefault.jpg'); assert.equal(first.shorts, false);
  assert.deepEqual(Object.keys(first).sort(), ['channel','description','duration','hashtags','id','keywords','metadata','shorts','thumbnail','title']);
  assert.equal(inspected.some(video => Number(video.id.slice(1)) >= 46), false, 'only the first48 records are considered before validation/deduplication');
  for (const thumbnail of ['http://i.ytimg.com/a.jpg','https://ytimg.com.evil.test/a.jpg','https://user:password@i.ytimg.com/a.jpg','https://i.ytimg.com:8443/a.jpg','javascript:alert(1)']) {
    const checked = await filterNative(h, [{...nativeVideo(), thumbnail}]); assert.equal(checked.items[0].thumbnail, 'https://i.ytimg.com/vi/N0000000000/hqdefault.jpg');
  }
});

test('native recommendation authorization requires a current top-level native Home or watch page', async () => {
  let calls = 0;
  const h = harness({}, undefined, undefined, async videos => {calls++; return videos.map(() => ({accepted: true}));});
  for (const sender of [{...fromTab(1), frameId: 2}, {url: 'https://www.youtube.com/'}, {...fromTab(1), url: 'https://example.com/'}, {...fromTab(1), url: 'https://www.youtube.com.evil.test/'}, {...fromTab(1), url: 'https://music.youtube.com/'}, {...fromTab(1), url: 'https://www.youtube-nocookie.com/embed/abcdefghijk'}, {...fromTab(1), url: 'https://www.youtube.com/results?search_query=work'}, {...fromTab(1), url: 'https://www.youtube.com/watch?v=bad'}, {...fromTab(1), url: 'chrome-extension://intent/settings.html'}]) assert.equal((await filterNative(h, [nativeVideo()], {}, sender)).ok, false);
  assert.equal(calls, 0);
  assert.equal((await filterNative(h, [nativeVideo()], {}, {...fromTab(1), url: topicURL(topicID)})).stale, true, 'the sender cannot spoof the live tab identity');
  assert.equal((await filterNative(h, [nativeVideo()], {}, fromTab(1), {locale:{hl:'de',gl:'DE'},key:nativeKey()})).stale, true, 'locale is part of the feed key');
  assert.equal(calls, 0);
  h.setTabs([{id:1,windowId:1,active:true,url:topicURL(topicID)}]);
  const watch = await filterNative(h, [nativeVideo(topicID),nativeVideo(nextTopicID)], {}, topicSender());
  assert.deepEqual(Array.from(watch.items, video => video.id), [nextTopicID], 'the trusted current watch ID is always excluded');
});

test('native distractions take precedence over model acceptance and channel inclusion', async () => {
  let received;
  const config = {blockedTerms:'spoiler',channels:{work:'Trusted channel'}};
  const h = harness({settings:config}, undefined, undefined, async (videos, settings) => {received=videos;return videos.map(video=>({accepted:IntentCore.terms(settings.channels.work).includes(IntentCore.normalize(video.channel))}));});
  const result = await filterNative(h,[{...nativeVideo(),channel:'Trusted channel'}, {...nativeVideo('N0000000001'),shorts:true},nativeVideo('N0000000002','You won’t believe this!!!'),nativeVideo('N0000000003','A spoiler story'),{...nativeVideo('N0000000004','You won’t believe this!!!'),channel:'Trusted channel'}],config);
  assert.deepEqual(Array.from(received,video=>video.id),['N0000000000']);
  assert.deepEqual(Array.from(result.items,video=>video.id),['N0000000000']);
});

test('native checks skip model work for Off, Pause, stale keys and blocked budgets', async () => {
  let calls=0;
  const judge=async videos=>{calls++;return videos.map(()=>({accepted:true}));};
  const off=harness({settings:{mode:'off'}},undefined,undefined,judge);
  assert.equal((await filterNative(off,[nativeVideo()],{mode:'off'})).off,true);
  const paused=harness({},undefined,undefined,judge);await paused.send({type:'SET_TAB_PAUSED',paused:true},fromTab(1));
  assert.equal((await filterNative(paused)).paused,true);
  const blocked=harness({settings:{dailyMinutes:1},days:{'2026-10-24':60000}},undefined,undefined,judge);
  assert.equal((await filterNative(blocked,[nativeVideo()],{dailyMinutes:1})).blocked,true);
  const stale=harness({},undefined,undefined,judge);assert.equal((await filterNative(stale,[nativeVideo()],{},fromTab(1),{key:'wrong'})).stale,true);
  assert.equal(calls,0);
});

test('native model work shares in-flight/cache results and does not block accounting or mode changes', async () => {
  let calls=0,release,started;
  const gate=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{started=resolve;});
  const h=harness({},undefined,undefined,async videos=>{calls++;started();await gate;return videos.map(()=>({accepted:true}));});
  h.setTabs(tabsPair());
  const first=filterNative(h);await began;const second=filterNative(h,[nativeVideo()],{},fromTab(2));
  h.advance(5000);assert.equal((await tabState(h,1)).usedMs,5000,'accounting completes while the local model is pending');
  await h.send({type:'GET_STATE'});assert.equal(calls,1);release();
  const results=await Promise.all([first,second]);assert.ok(results.every(result=>result.items.length===1));
  await filterNative(h);assert.equal(calls,1,'identical sanitized metadata reuses the model verdict');
  h.advance(600001);await filterNative(h);assert.equal(calls,2,'cached candidate verdicts expire after ten minutes');
});

test('native results are suppressed after mode, pause/resume, reset, rules or navigation changes', async () => {
  const mutations=[
    h=>h.send({type:'SET_MODE',mode:'music'},fromTab(1)),
    async h=>{await h.send({type:'SET_MODE',mode:'music'},fromTab(1));await h.send({type:'SET_MODE',mode:'work'},fromTab(1));},
    async h=>{await h.send({type:'SET_TAB_PAUSED',paused:true},fromTab(1));await h.send({type:'SET_TAB_PAUSED',paused:false},fromTab(1));},
    h=>h.send({type:'RESET_SETTINGS'}),
    h=>h.send({type:'UPDATE_SETTINGS',patch:{intentDescriptions:{work:'A different subject'}}}),
    h=>h.updateTab(1,{url:topicURL(topicID)}),
    h=>h.updateTab(1,{url:'https://www.youtube.com/'}),
    h=>h.removeTab(1)
  ];
  for(const mutate of mutations){
    let release,started;const gate=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{started=resolve;});
    const h=harness({},undefined,undefined,async videos=>{started();await gate;return videos.map(()=>({accepted:true}));});
    const pending=filterNative(h);await began;await mutate(h);release();const result=await pending;
    assert.equal(result.stale,true);assert.equal(result.items,undefined);
  }
});

test('native model failures fail closed and exhausted budgets suppress late accepted results', async () => {
  const failed=harness({},undefined,undefined,async()=>{throw new Error('Model unavailable');});
  const error=await filterNative(failed);assert.equal(error.ok,false);assert.equal(error.items,undefined);
  let release,started;const gate=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{started=resolve;});
  const config={dailyMinutes:1},h=harness({settings:config,days:{'2026-10-24':59000}},undefined,undefined,async videos=>{started();await gate;return videos.map(()=>({accepted:true}));});
  const pending=filterNative(h,[nativeVideo()],config);await began;h.advance(2000);await h.send({type:'GET_STATE'});release();
  const result=await pending;assert.equal(result.blocked,true);assert.equal(result.items,undefined);
});

test('native model jobs and metadata caches have finite bounds without blocking ordinary state requests', async () => {
  let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
  const h=harness({},undefined,undefined,async videos=>{calls++;await gate;return videos.map(()=>({accepted:true}));});
  const pending=Array.from({length:32},(_,index)=>filterNative(h,[nativeVideo('B'+String(index).padStart(10,'0'))]));
  await h.send({type:'GET_STATE'});assert.equal(calls,32);
  const overflow=await filterNative(h,[nativeVideo('B9999999999')]);assert.equal(overflow.ok,false);assert.match(overflow.error,/already running/);assert.equal(calls,32);
  release();assert.ok((await Promise.all(pending)).every(result=>result.items.length===1));
  let cachedCalls=0;
  const cached=harness({},undefined,undefined,async videos=>{cachedCalls++;return videos.map(()=>({accepted:true}));});
  for(let index=0;index<65;index++)await filterNative(cached,[nativeVideo('C'+String(index).padStart(10,'0'))]);
  assert.equal(cachedCalls,65);
  await filterNative(cached,[nativeVideo('C0000000064')]);assert.equal(cachedCalls,65,'a recent batch remains cached');
  await filterNative(cached,[nativeVideo('C0000000000')]);assert.equal(cachedCalls,66,'the oldest batch is evicted when the64-entry bound is exceeded');
});

function recoveryHarness({ping = async () => ({ok:false}), ownership = {owned:true,legacy:true}, inject = async () => {}} = {}) {
  let time=0;
  const tabs=new Map([[1,{id:1,windowId:1,active:true,url:'https://www.youtube.com/'}]]),calls={get:[],query:[],ping:[],probe:[],css:[],files:[],reload:0,update:0};
  const manifest=JSON.parse(source('../manifest.json'));
  const api={runtime:{getManifest:()=>manifest},tabs:{
    get:async id=>{calls.get.push(id);if(!tabs.has(id))throw new Error('Tab closed');return {...tabs.get(id)};},
    query:async query=>{calls.query.push(query);return [...tabs.values()].filter(tab=>tab.active===true&&(query.windowId===undefined||tab.windowId===query.windowId)&&/^https?:\/\/(?:[^/]+\.)?youtube(?:-nocookie)?\.com\//.test(tab.url));},
    sendMessage:async(id,message,options)=>{calls.ping.push({id,message,options});return ping(id,message);},
    reload:()=>{calls.reload++;},update:()=>{calls.update++;}
  },scripting:{
    insertCSS:async options=>{calls.css.push(options);},
    executeScript:async options=>{if(options.func){calls.probe.push(options);return[{frameId:0,result:ownership}];}calls.files.push(options);await inject(options);return[];}
  }};
  const context=vm.createContext({URL,Date,console});vm.runInContext(source('reconnect.js'),context);
  const service=context.IntentReconnect.create(api,()=>time);
  return {service,api,tabs,calls,manifest,advance:milliseconds=>{time+=milliseconds;}};
}

test('recovery leaves a healthy live controller alone and performs no background tab scan on activation',async()=>{
  const h=recoveryHarness({ping:async()=>({ok:true,contextValid:true})});
  assert.equal(await h.service.activate({tabId:1}),false);assert.equal(h.calls.ping.length,1);assert.equal(h.calls.query.length,0);
  assert.equal(h.calls.probe.length,0);assert.equal(h.calls.files.length,0);assert.equal(h.calls.css.length,0);assert.equal(h.calls.reload,0);assert.equal(h.calls.update,0);
  assert.equal(h.calls.ping[0].message.type,'INTENT_PING');assert.equal(h.calls.ping[0].options.frameId,0);
});

test('invalidated supported tabs recover through owned manifest files in frame0 without reloading or touching the player',async()=>{
  const h=recoveryHarness();assert.equal(await h.service.activate({tabId:1}),true);
  assert.equal(h.calls.probe.length,1);assert.equal(h.calls.css.length,1);assert.equal(h.calls.files.length,2);
  assert.equal(h.calls.files[0].world,'MAIN');assert.deepEqual(Array.from(h.calls.files[0].files),['src/native-renderer.js']);
  const injection=h.calls.files[1];assert.deepEqual(Array.from(injection.files),h.manifest.content_scripts[0].js);
  assert.deepEqual(Array.from(h.calls.css[0].files),h.manifest.content_scripts[0].css);
  assert.equal(injection.target.tabId,1);assert.deepEqual(Array.from(injection.target.frameIds),[0]);assert.equal(injection.world,'ISOLATED');
  assert.equal(h.calls.reload,0);assert.equal(h.calls.update,0);assert.equal(h.calls.query.length,0);
});

test('recovery skips outside sites, embedded players, inactive tabs and legacy controllers without a disposal protocol',async()=>{
  const h=recoveryHarness();
  for(const url of ['https://example.com/','https://studio.youtube.com/','https://music.youtube.com/','https://www.youtube.com/embed/abcdefghijk','https://www.youtube-nocookie.com/embed/abcdefghijk','chrome-extension://intent/blocked.html']){
    h.tabs.set(1,{id:1,active:true,url});assert.equal(await h.service.activate({tabId:1}),false,url);
  }
  h.tabs.set(1,{id:1,active:false,url:'https://www.youtube.com/'});assert.equal(await h.service.activate({tabId:1}),false);
  assert.equal(h.calls.ping.length,0);assert.equal(h.calls.files.length,0);
  const legacy=recoveryHarness({ownership:{owned:false,legacy:true}});assert.equal(await legacy.service.activate({tabId:1}),false);assert.equal(legacy.calls.probe.length,1);assert.equal(legacy.calls.css.length,0);assert.equal(legacy.calls.files.length,0);
  const empty=recoveryHarness({ownership:{owned:false,legacy:false}});assert.equal(await empty.service.activate({tabId:1}),true,'a fresh page with no old controller can safely initialize');
});

test('install recovery queries only active YouTube scopes and concurrent activation deduplicates repair work',async()=>{
  let release,started;const gate=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{started=resolve;});
  const h=recoveryHarness({ping:async()=>{started();await gate;return undefined;}});
  const first=h.service.activate({tabId:1});await began;const second=h.service.activate({tabId:1});release();await Promise.all([first,second]);
  assert.equal(h.calls.ping.length,1);assert.equal(h.calls.files.length,2);
  const installed=recoveryHarness();installed.tabs.set(2,{id:2,active:false,url:'https://www.youtube.com/watch?v=abcdefghijk'});installed.tabs.set(3,{id:3,active:true,url:'https://example.com/'});installed.tabs.set(4,{id:4,active:true,url:'https://www.youtube.com/embed/abcdefghijk'});
  await installed.service.installed();assert.equal(installed.calls.query.length,1);
  assert.equal(installed.calls.query[0].active,true);assert.ok(installed.calls.query[0].url.every(pattern=>pattern.includes('youtube')));
  assert.deepEqual(installed.calls.files.map(call=>call.target.tabId),[1,1]);
});

test('recovery revalidates navigation after ping and bounds repeated failed injections without retry loops',async()=>{
  let release,started;const gate=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{started=resolve;});
  const h=recoveryHarness({ping:async()=>{started();await gate;return undefined;}});
  const pending=h.service.activate({tabId:1});await began;h.tabs.set(1,{id:1,active:true,url:'https://example.com/'});release();assert.equal(await pending,false);assert.equal(h.calls.probe.length,0);assert.equal(h.calls.files.length,0);
  const failed=recoveryHarness({inject:async()=>{throw new Error('Page navigated');}});
  assert.equal(await failed.service.activate({tabId:1}),false);assert.equal(await failed.service.activate({tabId:1}),false);assert.equal(failed.calls.files.length,1,'activation does not loop on a failed script injection');
  failed.advance(5000);assert.equal(await failed.service.activate({tabId:1}),false);assert.equal(failed.calls.files.length,2,'a later user activation can retry');
  assert.equal(failed.calls.reload,0);assert.equal(failed.calls.update,0);
});

test('returning focus repairs only the active YouTube tab in that Chrome window',async()=>{
  const h=recoveryHarness();
  h.tabs.set(2,{id:2,windowId:2,active:true,url:'https://www.youtube.com/watch?v=abcdefghijk'});
  h.tabs.set(3,{id:3,windowId:1,active:false,url:'https://www.youtube.com/'});
  await h.service.focus(-1);assert.equal(h.calls.query.length,0,'leaving Chrome does not scan tabs');
  await h.service.focus(1);assert.equal(h.calls.query.length,1);assert.equal(h.calls.query[0].windowId,1);assert.equal(h.calls.query[0].active,true);
  assert.deepEqual(h.calls.files.map(call=>call.target.tabId),[1,1]);
  assert.equal(h.calls.reload,0);assert.equal(h.calls.update,0);
});
