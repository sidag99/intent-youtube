const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
function harness(stored = {}, start = new Date(2026, 9, 24, 12).getTime(), fetcher, judge, storedSession = {}) {
  let now = start, listener;
  const local = structuredClone(stored), session = structuredClone(storedSession), redirects = [], rules = [], sessionRules = [], broadcasts = [], events = {};
  const dynamic = new Map(), perTabRules = new Map();
  let tabs = [{id: 1, windowId: 1, active: true, audible: false, url: 'https://www.youtube.com/'}];
  let focus = {id: 1, focused: true}, idle = 'active';
  const event = name => ({addListener(fn) { if (name) events[name] = fn; }});
  const storage = data => ({get: async key => Object.fromEntries((Array.isArray(key) ? key : [key]).map(k => [k, structuredClone(data[k])])), set: async values => Object.assign(data, structuredClone(values)), setAccessLevel: async () => {}});
  const chrome = {
    storage: {local: storage(local), session: storage(session)},
    alarms: {get: async () => null, create: async () => {}, onAlarm: event()},
    idle: {queryState: async () => idle, setDetectionInterval() {}, onStateChanged: event()},
    tabs: {query: async () => tabs, update: async (id, info) => redirects.push({id, ...info}), sendMessage: async (id, message) => broadcasts.push({id, message: structuredClone(message)}), onActivated: event(), onCreated: event('created'), onRemoved: event('removed'), onUpdated: event('updated')},
    windows: {getLastFocused: async () => focus, onFocusChanged: event()},
    declarativeNetRequest: {updateDynamicRules: async r => {rules.push(r); for (const id of r.removeRuleIds) dynamic.delete(id); for (const rule of r.addRules) dynamic.set(rule.id, structuredClone(rule));}, updateSessionRules: async r => {sessionRules.push(r); for (const id of r.removeRuleIds) perTabRules.delete(id); for (const rule of r.addRules) perTabRules.set(rule.id, structuredClone(rule));}},
    action: {setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}},
    offscreen: {createDocument: async () => {}},
    runtime: {getContexts: async () => [{}], sendMessage: async message => message.type === 'AI_CLASSIFY' ? ({ok: true, decisions: judge ? await judge(message.videos, message.settings) : message.videos.map(() => ({accepted: true, uncertain: false}))}) : ({ok: true}), getURL: s => 'chrome-extension://intent/' + s, openOptionsPage: async () => {}, onMessage: {addListener(fn) {listener = fn;}}, onInstalled: event(), onStartup: event()}
  };
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({chrome, console, URL, AbortSignal, fetch: fetcher, Date: Clock});
  context.importScripts = (...names) => names.forEach(name => vm.runInContext(source(name), context));
  vm.runInContext(source('background.js'), context);
  const sender = {url: 'chrome-extension://intent/settings.html'};
  const send = (message, from = sender) => new Promise(resolve => listener(message, from, resolve));
  return {send, local, session, redirects, rules, sessionRules, dynamic, perTabRules, broadcasts, advance: ms => {now += ms;}, setTabs: value => {tabs = value.map(tab => ({url: 'https://www.youtube.com/', ...tab}));}, setFocus: value => {focus = value;}, setIdle: value => {idle = value;}, createTab: async tab => {tabs.push({url: 'https://www.youtube.com/', ...tab}); events.created(tab); await send({type: 'GET_STATE'});}, removeTab: async id => {tabs = tabs.filter(tab => tab.id !== id); events.removed(id); await send({type: 'GET_STATE'});}};
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
