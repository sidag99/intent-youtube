importScripts('core.js', 'feed.js');
const C = IntentCore;
const feedService = IntentFeed.createService({judge: classifyLocally});
let creatingAI;
async function classifyLocally(videos, settings) {
  if (!videos.length) return [];
  const url = chrome.runtime.getURL('ai.html');
  const existing = await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url]});
  if (!existing.length) {
    if (!creatingAI) creatingAI = chrome.offscreen.createDocument({url: 'ai.html', reasons: ['WORKERS'], justification: 'Run the bundled, private topic classifier in a dedicated worker.'}).finally(() => {creatingAI = undefined;});
    await creatingAI;
  }
  const result = await chrome.runtime.sendMessage({type: 'AI_CLASSIFY', target: 'intent-ai', videos, settings});
  if (!result?.ok || !Array.isArray(result.decisions) || result.decisions.length !== videos.length) throw new Error(result?.error || 'The bundled topic model did not return a valid decision.');
  return result.decisions;
}
let settings, days, tracker, appearance, tabModes, initialized, appliedBlock;
let queue = Promise.resolve();
const reports = new Map();
const URLS = ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'];
const validMode = (mode, config = settings) => C.validMode ? C.validMode(mode, config) : Object.hasOwn(C.MODES, mode) || mode === 'off';
const initialMode = () => C.initialMode ? C.initialMode(settings) : settings.mode;
const countsMode = mode => C.countsMode ? C.countsMode(settings, mode) : settings.countModes?.[mode] !== false;
const badgeMode = mode => mode === 'off' ? '' : ((C.modes ? C.modes(settings)[mode]?.name : C.MODES[mode]?.name) || mode).slice(0, 1).toUpperCase();
const extensionSender = sender => sender.url?.startsWith(chrome.runtime.getURL('')) && !(sender.tab && C.isYouTube(sender.tab.url));
const blockedURL = () => chrome.runtime.getURL('blocked.html');
const isYouTubeTab = tab => C.isYouTube(tab.url || tab.pendingUrl) || tab.url?.startsWith(blockedURL()) || reports.has(tab.id);
function serial(task) {
  const job = queue.then(task);
  queue = job.catch(error => console.error('Intent:', error));
  return job;
}
function ensureMode(tabId) {
  if (!validMode(tabModes[tabId])) tabModes[tabId] = initialMode();
  return tabModes[tabId];
}
function effectiveSettings(tabId) {
  return {...settings, mode: Number.isInteger(tabId) ? ensureMode(tabId) : settings.mode};
}
function stateFor(tabId, now = Date.now()) {
  const effective = effectiveSettings(tabId), base = C.snapshot(effective, days, now);
  const timerExempt = !countsMode(effective.mode);
  return {...base, blocked: base.blocked && !timerExempt, budgetExhausted: base.blocked, timerExempt, appearance, tabId};
}
async function initialize() {
  if (!initialized) initialized = (async () => {
    await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
    const data = await chrome.storage.local.get(['settings', 'days', 'appearance']);
    settings = C.sanitize(data.settings); days = data.days || {};
    appearance = ['light', 'dark'].includes(data.appearance) ? data.appearance : undefined;
    const session = await chrome.storage.session.get(['tracker', 'tabModes']);
    tracker = session.tracker || {lastAt: Date.now(), counting: false};
    tabModes = {};
    for (const [id, mode] of Object.entries(session.tabModes || {})) if (/^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && validMode(mode)) tabModes[id] = mode;
    if (!(await chrome.alarms.get('intent-tick'))) await chrome.alarms.create('intent-tick', {periodInMinutes: .5});
    chrome.idle.setDetectionInterval(60);
  })();
  return initialized;
}
async function broadcast(tabs) {
  await Promise.allSettled(tabs.filter(isYouTubeTab).map(tab => chrome.tabs.sendMessage(tab.id, {type: 'SETTINGS', settings: effectiveSettings(tab.id)})));
}
async function applyBlock(exhausted, tabs) {
  const baseBlocked = exhausted && countsMode(initialMode());
  const counted = [], exempt = [];
  for (const tab of tabs) if (Object.hasOwn(tabModes, tab.id) || isYouTubeTab(tab)) (countsMode(ensureMode(tab.id)) ? counted : exempt).push(tab.id);
  counted.sort((a, b) => a - b); exempt.sort((a, b) => a - b);
  const signature = JSON.stringify([exhausted, baseBlocked, counted, exempt]);
  if (appliedBlock !== signature) {
    const condition = {requestDomains: ['youtube.com', 'youtube-nocookie.com'], resourceTypes: ['main_frame', 'sub_frame']};
    const redirect = {type: 'redirect', redirect: {extensionPath: '/blocked.html'}};
    // Known tabs always get an explicit rule. Unknown/new tabs use their configured
    // initial mode through the global rule, so exempt new tabs need no initialization race.
    const addRules = [];
    if (exhausted && counted.length) addRules.push({id: 2, priority: 2, action: redirect, condition: {...condition, tabIds: counted}});
    if (exhausted && exempt.length) addRules.push({id: 3, priority: 2, action: {type: 'allow'}, condition: {...condition, tabIds: exempt}});
    await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [2, 3], addRules});
    await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: [1], addRules: baseBlocked ? [{id: 1, priority: 1, action: redirect, condition}] : []});
    appliedBlock = signature;
  }
  if (exhausted) await Promise.allSettled(tabs.filter(tab => C.isYouTube(tab.url || tab.pendingUrl) && countsMode(ensureMode(tab.id))).map(tab => chrome.tabs.update(tab.id, {url: blockedURL()})));
  await chrome.action.setBadgeText({text: baseBlocked ? 'END' : badgeMode(initialMode())});
  await chrome.action.setBadgeBackgroundColor({color: baseBlocked ? '#9b4135' : '#365e4b'});
  await Promise.allSettled(tabs.filter(isYouTubeTab).map(async tab => {
    const mode = ensureMode(tab.id), blocked = exhausted && countsMode(mode);
    await chrome.action.setBadgeText({tabId: tab.id, text: blocked ? 'END' : badgeMode(mode)});
    await chrome.action.setBadgeBackgroundColor({tabId: tab.id, color: blocked ? '#9b4135' : '#365e4b'});
  }));
}
async function tick(message = {}, sender = {}) {
  await initialize();
  const [tabs, focused, idle] = await Promise.all([
    chrome.tabs.query({}), chrome.windows.getLastFocused().catch(() => ({focused: false})), chrome.idle.queryState(60)
  ]);
  const liveIds = new Set(tabs.map(tab => tab.id));
  for (const id of Object.keys(tabModes)) if (!liveIds.has(Number(id))) delete tabModes[id];
  for (const tab of tabs) if (Object.hasOwn(tabModes, tab.id) || isYouTubeTab(tab)) ensureMode(tab.id);
  let targetTabId = sender.tab && (C.isYouTube(sender.url || sender.tab.url) || sender.url?.startsWith(blockedURL())) ? sender.tab.id : undefined;
  if (Object.hasOwn(message, 'targetTabId')) {
    if (!extensionSender(sender)) throw new Error('A target tab can only be selected from Intent.');
    const target = tabs.find(tab => tab.id === message.targetTabId);
    if (!Number.isInteger(message.targetTabId) || !target || !isYouTubeTab(target)) throw new Error('The selected YouTube tab is no longer available.');
    targetTabId = target.id;
  }
  let patch;
  if (message.type === 'SET_MODE') {
    const url = new URL(sender.url || 'https://invalid.test/');
    if (!sender.tab || (sender.frameId || 0) !== 0 || !C.isYouTube(url.href) || !['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) throw new Error('The intent mode can only be changed from the YouTube toolbar.');
    if (!validMode(message.mode)) throw new Error('Choose a valid intent mode.');
    patch = {mode: message.mode}; targetTabId = sender.tab.id;
  } else if (message.type === 'UPDATE_SETTINGS') {
    if (!extensionSender(sender)) throw new Error('Settings can only be changed in Intent.');
    patch = message.patch || {};
  }
  let nextSettings;
  if (patch) {
    const merged = {...settings, ...patch};
    for (const field of ['countModes', 'customTopics', 'channels', 'intentDescriptions']) if (patch[field]) merged[field] = {...settings[field], ...patch[field]};
    nextSettings = C.sanitize(merged);
    if (Object.hasOwn(patch, 'mode') && !validMode(patch.mode, nextSettings)) throw new Error('Choose a valid intent mode.');
  }
  const now = Date.now();
  days = C.advanceUsage(days, tracker.lastAt, now, tracker.counting);
  if (message.type === 'HEARTBEAT' && sender.tab && C.isYouTube(sender.url || sender.tab.url)) {
    ensureMode(sender.tab.id);
    const frames = reports.get(sender.tab.id) || new Map();
    frames.set(sender.frameId || 0, {playing: message.playing === true, expiresAt: now + 20000}); reports.set(sender.tab.id, frames);
    if ((sender.frameId || 0) === 0 && sender.tab.active !== false && ['light', 'dark'].includes(message.appearance) && appearance !== message.appearance) {
      appearance = message.appearance; await chrome.storage.local.set({appearance});
      await chrome.runtime.sendMessage({type: 'APPEARANCE', appearance}).catch(() => {});
    }
  }
  if (patch) {
    settings = nextSettings;
    if (Object.hasOwn(patch, 'mode') && Number.isInteger(targetTabId)) tabModes[targetTabId] = settings.mode;
    for (const tab of tabs) if (Object.hasOwn(tabModes, tab.id) || isYouTubeTab(tab)) ensureMode(tab.id); // Deleted custom intents fall back safely.
    await chrome.storage.local.set({settings});
    await broadcast(tabs);
  }
  for (const [id, frames] of reports) {
    for (const [frame, report] of frames) if (report.expiresAt <= now) frames.delete(frame);
    if (!liveIds.has(id) || !frames.size) reports.delete(id);
  }
  const state = stateFor(targetTabId, now);
  const youtubeTabs = tabs.filter(tab => C.isYouTube(tab.url || tab.pendingUrl));
  const eligible = youtubeTabs.filter(tab => countsMode(ensureMode(tab.id)));
  const foreground = idle === 'active' && focused.focused && eligible.some(tab => tab.active && tab.windowId === focused.id);
  const playing = settings.countPlayback && eligible.some(tab => tab.audible || [...(reports.get(tab.id)?.values() || [])].some(report => report.playing));
  tracker = {lastAt: now, counting: !state.budgetExhausted && idle !== 'locked' && Boolean(foreground || playing)};
  await chrome.storage.local.set({days});
  await chrome.storage.session.set({tracker, tabModes});
  await applyBlock(state.budgetExhausted, tabs);
  return state;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'GET_FEED') {
    feedRequest(message, sender).then(respond, error => respond({ok: false, error: error.message})); return true;
  }
  if (!['HEARTBEAT', 'GET_STATE', 'UPDATE_SETTINGS', 'SET_MODE', 'OPEN_SETTINGS'].includes(message?.type)) return;
  if (message.type === 'OPEN_SETTINGS') { chrome.runtime.openOptionsPage().then(() => respond({ok: true})); return true; }
  serial(() => tick(message, sender)).then(state => respond({ok: true, ...state}), error => respond({ok: false, error: error.message})); return true;
});
async function feedRequest(message, sender) {
  const url = new URL(sender.url || 'https://invalid.test/');
  const currentVideo = url.pathname === '/watch' && /^[\w-]{11}$/.test(url.searchParams.get('v') || '') ? url.searchParams.get('v') : '';
  if (!sender.tab || (sender.frameId || 0) !== 0 || !C.isYouTube(url.href) || !(url.pathname === '/' || currentVideo) || !['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) throw new Error('Feeds can only be requested from top-level YouTube home and video pages.');
  const state = await serial(() => tick({}, sender));
  if (state.blocked) return {ok: true, blocked: true};
  if (message.key !== IntentFeed.key(state.settings)) return {ok: true, stale: true};
  const exclude = currentVideo ? [currentVideo, ...(Array.isArray(message.exclude) ? message.exclude : [])] : message.exclude;
  const result = await feedService.get(state.settings, {...message, exclude});
  const current = stateFor(sender.tab.id);
  if (current.blocked) return {ok: true, blocked: true};
  if (result.key !== IntentFeed.key(current.settings)) return {ok: true, stale: true};
  return {ok: true, ...result};
}
const refresh = () => { serial(() => tick()).catch(() => {}); };
chrome.alarms.onAlarm.addListener(refresh);
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onCreated?.addListener(tab => {
  serial(async () => { await initialize(); ensureMode(tab.id); await chrome.storage.session.set({tabModes}); await tick(); }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(id => {
  reports.delete(id);
  serial(async () => { await initialize(); delete tabModes[id]; await tick(); }).catch(() => {});
});
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.url) reports.delete(id);
  if (info.url || info.status === 'complete' || info.audible !== undefined) refresh();
});
chrome.windows.onFocusChanged.addListener(refresh);
chrome.idle.onStateChanged.addListener(refresh);
chrome.runtime.onInstalled.addListener(refresh);
chrome.runtime.onStartup.addListener(() => serial(async () => {
  await initialize(); tracker = {lastAt: Date.now(), counting: false}; await tick();
}));
