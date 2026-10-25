const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
function harness(stored = {}, start = new Date(2026, 9, 24, 12).getTime(), fetcher, judge, storedSession = {}) {
  let now = start, listener;
  const local = structuredClone(stored), session = structuredClone(storedSession), redirects = [], rules = [], sessionRules = [], broadcasts = [], badges = [], titles = [], icons = [], iconFetches = [], queries = [], queryResults = [], events = {};
  const dynamic = new Map(), perTabRules = new Map();
  let tabs = [{id: 1, windowId: 1, active: true, audible: false, url: 'https://www.youtube.com/'}];
  let focus = {id: 1, focused: true}, idle = 'active';
  const event = name => ({addListener(fn) { if (name) events[name] = fn; }});
  const storage = data => ({get: async key => Object.fromEntries((Array.isArray(key) ? key : [key]).map(k => [k, structuredClone(data[k])])), set: async values => Object.assign(data, structuredClone(values)), setAccessLevel: async () => {}});
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
  return {send, local, session, redirects, rules, sessionRules, dynamic, perTabRules, broadcasts, badges, titles, icons, iconFetches, queries, queryResults, drain: () => vm.runInContext('queue', context), associated: id => vm.runInContext(`associatedTab(${Number(id)})`, context), updateEvent: (id, info, tab) => events.updated(id, info, tab), removeEvent: id => events.removed(id), advance: ms => {now += ms;}, setTabs: value => {tabs = value.map(tab => ({url: 'https://www.youtube.com/', ...tab}));}, setFocus: value => {focus = value;}, setIdle: value => {idle = value;}, createTab: async tab => {tabs.push({url: 'https://www.youtube.com/', ...tab}); events.created(tab); await send({type: 'GET_STATE'});}, updateTab: async (id, info) => {tabs = tabs.map(tab => tab.id === id ? {...tab, ...info} : tab); events.updated(id, info, tabs.find(tab => tab.id === id)); await send({type: 'GET_STATE'});}, removeTab: async id => {tabs = tabs.filter(tab => tab.id !== id); events.removed(id); await send({type: 'GET_STATE'});}};
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
  const response = await h.send({type: 'GET_FEED', key: IntentFeed.key(IntentCore.defaults()), exclude: []}, sender);
  assert.equal(response.ok, true);
  assert.deepEqual(Array.from(response.items, v => v.id), ['lmnopqrstuv']);
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
