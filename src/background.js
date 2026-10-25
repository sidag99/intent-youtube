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
let settings, days, tracker, appearance, tabModes, pausedTabs, initialized, appliedBlock;
let feedRevision = 0;
const tabFeedRevisions = new Map();
let queue = Promise.resolve();
const reports = new Map();
const URLS = ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'];
const validMode = (mode, config = settings) => C.validMode ? C.validMode(mode, config) : Object.hasOwn(C.MODES, mode) || mode === 'off';
const initialMode = () => C.initialMode ? C.initialMode(settings) : settings.mode;
const countsMode = mode => C.countsMode ? C.countsMode(settings, mode) : settings.countModes?.[mode] !== false;
const badgeMode = mode => mode === 'off' ? '' : ((C.modes ? C.modes(settings)[mode]?.name : C.MODES[mode]?.name) || mode).slice(0, 1).toUpperCase();
const extensionSender = sender => sender.url?.startsWith(chrome.runtime.getURL('')) && !(sender.tab && C.isYouTube(sender.tab.url));
const blockedURL = () => chrome.runtime.getURL('blocked.html');
const hasYouTubeURL = tab => C.isYouTube(tab.url) || C.isYouTube(tab.pendingUrl);
const isYouTubeTab = tab => hasYouTubeURL(tab) || tab.url?.startsWith(blockedURL()) || tab.pendingUrl?.startsWith(blockedURL());
const associatedTab = id => Object.hasOwn(tabModes || {}, id) || Object.hasOwn(pausedTabs || {}, id) || reports.has(id) || tabFeedRevisions.has(id);
const actionStates = new Map();
const OFF_SITE_TITLE = 'Intent — Off on this site. Only runs on YouTube.';
let actionImages;
function actionIconImages() {
  if (!actionImages) actionImages = (async () => {
    // Read only our bundled icon; no page data or external asset is needed.
    const response = await fetch(chrome.runtime.getURL('icons/128.png'));
    if (!response.ok) throw new Error('The bundled action icon could not load.');
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const active = {}, inactive = {};
      for (const size of [16, 32]) {
        const canvas = new OffscreenCanvas(size, size), drawing = canvas.getContext('2d', {willReadFrequently: true});
        drawing.drawImage(bitmap, 0, 0, size, size);
        active[size] = drawing.getImageData(0, 0, size, size);
        const gray = drawing.getImageData(0, 0, size, size);
        for (let i = 0; i < gray.data.length; i += 4) {
          const value = Math.round(gray.data[i] * .2126 + gray.data[i + 1] * .7152 + gray.data[i + 2] * .0722);
          gray.data[i] = gray.data[i + 1] = gray.data[i + 2] = value;
        }
        inactive[size] = gray;
      }
      return {active, inactive};
    } finally { bitmap.close?.(); }
  })().catch(error => {actionImages = undefined; throw error;});
  return actionImages;
}
async function paintAction(tabId, {text = '', title = OFF_SITE_TITLE, active = false, color = '#606060'} = {}) {
  const key = Number.isInteger(tabId) ? tabId : 'default';
  const signature = JSON.stringify([text, title, active, color]);
  if (actionStates.get(key) === signature) return;
  const scope = Number.isInteger(tabId) ? {tabId} : {};
  const images = await actionIconImages();
  await Promise.all([
    chrome.action.setBadgeText({...scope, text}),
    chrome.action.setBadgeBackgroundColor({...scope, color}),
    chrome.action.setTitle({...scope, title}),
    chrome.action.setIcon({...scope, imageData: active ? images.active : images.inactive})
  ]);
  actionStates.set(key, signature);
}
function tabAction(tab, exhausted) {
  const mode = ensureMode(tab.id), paused = pausedTabs[tab.id] === true;
  if (paused) return {text: 'PAUSE', title: 'Intent — Paused on this tab; filters and timer are off'};
  const counted = countsMode(mode), blocked = exhausted && counted;
  const timer = counted ? 'timer counts toward your daily limit' : 'timer is exempt from your daily limit';
  if (blocked) return {text: 'END', title: `Intent — Daily limit reached on this tab; ${mode === 'off' ? 'topic filtering is off' : 'YouTube access is blocked'}`, color: '#9b4135'};
  if (mode === 'off') return {text: 'OFF', title: `Intent — Off on this tab; topic filtering is off; ${timer}`};
  const name = (C.modes ? C.modes(settings)[mode]?.name : C.MODES[mode]?.name) || mode;
  return {text: badgeMode(mode), title: `Intent — ${name} intent on this tab; ${timer}`, active: true, color: '#365e4b'};
}

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
  const tabPaused = Number.isInteger(tabId) && pausedTabs[tabId] === true;
  const timerExempt = tabPaused || !countsMode(effective.mode);
  return {...base, blocked: base.blocked && !timerExempt, budgetExhausted: base.blocked, timerExempt, tabPaused, appearance, tabId};
}
async function initialize() {
  if (!initialized) initialized = (async () => {
    await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
    const data = await chrome.storage.local.get(['settings', 'days', 'appearance']);
    settings = C.sanitize(data.settings); days = data.days || {};
    appearance = ['light', 'dark'].includes(data.appearance) ? data.appearance : undefined;
    const session = await chrome.storage.session.get(['tracker', 'tabModes', 'pausedTabs']);
    tracker = session.tracker || {lastAt: Date.now(), counting: false};
    tabModes = {};
    for (const [id, mode] of Object.entries(session.tabModes || {})) if (/^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && validMode(mode)) tabModes[id] = mode;
    pausedTabs = {};
    for (const [id, paused] of Object.entries(session.pausedTabs || {})) if (/^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && paused === true) {pausedTabs[id] = true; ensureMode(Number(id));}
    if (!(await chrome.alarms.get('intent-tick'))) await chrome.alarms.create('intent-tick', {periodInMinutes: .5});
    chrome.idle.setDetectionInterval(60);
  })();
  return initialized;
}
async function broadcast(tabs, reset = false) {
  await Promise.allSettled(tabs.filter(isYouTubeTab).map(tab => chrome.tabs.sendMessage(tab.id, {type: 'SETTINGS', settings: effectiveSettings(tab.id), tabPaused: pausedTabs[tab.id] === true, ...(reset ? {reset: true} : {})})));
}
async function applyBlock(exhausted, tabs) {
  const baseBlocked = exhausted && countsMode(initialMode());
  const counted = [], exempt = [];
  // Preserve known per-tab rules while a reload briefly has no matching URL.
  // Confirmed navigation away and tab removal explicitly delete the association.
  for (const id of Object.keys(tabModes)) (!pausedTabs[id] && countsMode(ensureMode(Number(id))) ? counted : exempt).push(Number(id));
  counted.sort((a, b) => a - b); exempt.sort((a, b) => a - b);
  const signature = JSON.stringify([exhausted, baseBlocked, counted, exempt]);
  if (appliedBlock !== signature) {
    const condition = {requestDomains: ['youtube.com', 'youtube-nocookie.com'], resourceTypes: ['main_frame']};
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
  if (exhausted) await Promise.allSettled(tabs.filter(tab => hasYouTubeURL(tab) && !pausedTabs[tab.id] && countsMode(ensureMode(tab.id))).map(tab => chrome.tabs.update(tab.id, {url: blockedURL()})));
  // The default is visibly inactive on every other site; supported tabs override it.
  await paintAction();
  await Promise.allSettled(tabs.filter(isYouTubeTab).map(tab => paintAction(tab.id, tabAction(tab, exhausted))));
}
async function tick(message = {}, sender = {}) {
  await initialize();
  const [tabs, focused, idle] = await Promise.all([
    chrome.tabs.query({url: [...URLS, blockedURL() + '*']}), chrome.windows.getLastFocused().catch(() => ({focused: false})), chrome.idle.queryState(60)
  ]);
  for (const tab of tabs) if (isYouTubeTab(tab)) ensureMode(tab.id);
  const senderScoped = sender.tab && (sender.frameId || 0) === 0 && (tabs.some(tab => tab.id === sender.tab.id && isYouTubeTab(tab)) || Object.hasOwn(tabModes, sender.tab.id) && isYouTubeTab(sender.tab));
  let targetTabId = senderScoped && (C.isYouTube(sender.url || sender.tab.url) || sender.url?.startsWith(blockedURL())) ? sender.tab.id : undefined;
  if (Object.hasOwn(message, 'targetTabId')) {
    if (!extensionSender(sender)) throw new Error('A target tab can only be selected from Intent.');
    const target = tabs.find(tab => tab.id === message.targetTabId);
    if (!Number.isInteger(message.targetTabId) || !target || !isYouTubeTab(target)) throw new Error('The selected YouTube tab is no longer available.');
    targetTabId = target.id;
  }
  let patch, resetting = false, pauseChange;
  if (message.type === 'SET_MODE') {
    const url = new URL(sender.url || 'https://invalid.test/');
    if (!senderScoped || !C.isYouTube(url.href) || !['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) throw new Error('The intent mode can only be changed from the YouTube toolbar.');
    if (!validMode(message.mode)) throw new Error('Choose a valid intent mode.');
    patch = {mode: message.mode}; targetTabId = sender.tab.id;
  } else if (message.type === 'UPDATE_SETTINGS') {
    if (!extensionSender(sender)) throw new Error('Settings can only be changed in Intent.');
    patch = message.patch || {};
  } else if (message.type === 'RESET_SETTINGS') {
    if (!extensionSender(sender)) throw new Error('Settings can only be reset in Intent.');
    resetting = true; patch = C.defaults();
  } else if (message.type === 'SET_TAB_PAUSED') {
    if (typeof message.paused !== 'boolean') throw new Error('Choose a valid paused state.');
    if (extensionSender(sender)) {
      if (!Number.isInteger(message.targetTabId)) throw new Error('Choose a YouTube tab to pause.');
    } else if (!senderScoped || !C.isYouTube(sender.url || sender.tab.url)) throw new Error('Intent can only be paused from a top-level YouTube page or Intent.');
    pauseChange = message.paused;
  }
  let nextSettings;
  if (patch) {
    const merged = {...settings, ...patch};
    for (const field of ['countModes', 'customTopics', 'channels', 'intentDescriptions', 'intentNames']) if (patch[field]) merged[field] = {...settings[field], ...patch[field]};
    nextSettings = resetting ? C.defaults() : C.sanitize(merged);
    if (Object.hasOwn(patch, 'mode') && !validMode(patch.mode, nextSettings)) throw new Error('Choose a valid intent mode.');
  }
  const now = Date.now();
  days = C.advanceUsage(days, tracker.lastAt, now, tracker.counting);
  if (message.type === 'HEARTBEAT' && senderScoped && !pausedTabs[sender.tab.id] && C.isYouTube(sender.url || sender.tab.url)) {
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
    if (resetting) {
      feedRevision++;
      pausedTabs = {};
      for (const id of Object.keys(tabModes)) tabModes[id] = 'work';
      for (const tab of tabs) if (isYouTubeTab(tab)) tabModes[tab.id] = 'work';
    } else if (Object.hasOwn(patch, 'mode') && Number.isInteger(targetTabId)) tabModes[targetTabId] = settings.mode;
    for (const tab of tabs) if (Object.hasOwn(tabModes, tab.id) || isYouTubeTab(tab)) ensureMode(tab.id); // Deleted custom intents fall back safely.
    await chrome.storage.local.set({settings});
    await broadcast(tabs, resetting);
  }
  if (typeof pauseChange === 'boolean') {
    const wasPaused = pausedTabs[targetTabId] === true;
    if (pauseChange) pausedTabs[targetTabId] = true; else delete pausedTabs[targetTabId];
    if (wasPaused !== pauseChange) tabFeedRevisions.set(targetTabId, (tabFeedRevisions.get(targetTabId) || 0) + 1);
    reports.delete(targetTabId);
    await chrome.storage.session.set({tabModes, pausedTabs});
    await broadcast(tabs.filter(tab => tab.id === targetTabId));
  }
  for (const [id, frames] of reports) {
    for (const [frame, report] of frames) if (report.expiresAt <= now) frames.delete(frame);
    if (!frames.size) reports.delete(id);
  }
  const state = stateFor(targetTabId, now);
  const youtubeTabs = tabs.filter(hasYouTubeURL);
  const eligible = youtubeTabs.filter(tab => !pausedTabs[tab.id] && countsMode(ensureMode(tab.id)));
  const foreground = idle === 'active' && focused.focused && eligible.some(tab => tab.active && tab.windowId === focused.id);
  const playing = settings.countPlayback && eligible.some(tab => tab.audible || [...(reports.get(tab.id)?.values() || [])].some(report => report.playing));
  tracker = {lastAt: now, counting: !state.budgetExhausted && idle !== 'locked' && Boolean(foreground || playing)};
  await chrome.storage.local.set({days});
  await chrome.storage.session.set({tracker, tabModes, pausedTabs});
  await applyBlock(state.budgetExhausted, tabs);
  return state;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'GET_FEED') {
    feedRequest(message, sender).then(respond, error => respond({ok: false, error: error.message})); return true;
  }
  if (!['HEARTBEAT', 'GET_STATE', 'UPDATE_SETTINGS', 'RESET_SETTINGS', 'SET_MODE', 'SET_TAB_PAUSED', 'OPEN_SETTINGS'].includes(message?.type)) return;
  if (message.type === 'OPEN_SETTINGS') { chrome.runtime.openOptionsPage().then(() => respond({ok: true})); return true; }
  serial(() => tick(message, sender)).then(state => respond({ok: true, ...state}), error => respond({ok: false, error: error.message})); return true;
});
async function feedRequest(message, sender) {
  const url = new URL(sender.url || 'https://invalid.test/');
  const currentVideo = url.pathname === '/watch' && /^[\w-]{11}$/.test(url.searchParams.get('v') || '') ? url.searchParams.get('v') : '';
  if (!sender.tab || (sender.frameId || 0) !== 0 || !C.isYouTube(url.href) || !(url.pathname === '/' || currentVideo) || !['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) throw new Error('Feeds can only be requested from top-level YouTube home and video pages.');
  const state = await serial(() => tick({}, sender));
  if (!Number.isInteger(state.tabId)) return {ok: true, stale: true};
  if (state.tabPaused) return {ok: true, paused: true, tabPaused: true};
  if (state.blocked) return {ok: true, blocked: true};
  if (message.key !== IntentFeed.key(state.settings)) return {ok: true, stale: true};
  const revision = feedRevision;
  const tabRevision = tabFeedRevisions.get(sender.tab.id) || 0;
  const isActive = () => Object.hasOwn(tabModes, sender.tab.id) && !pausedTabs[sender.tab.id] && revision === feedRevision && tabRevision === (tabFeedRevisions.get(sender.tab.id) || 0) && message.key === IntentFeed.key(effectiveSettings(sender.tab.id));
  const exclude = currentVideo ? [currentVideo, ...(Array.isArray(message.exclude) ? message.exclude : [])] : message.exclude;
  let result;
  try { result = await feedService.get(state.settings, {...message, exclude, isActive}); }
  catch (error) {
    if (pausedTabs[sender.tab.id]) return {ok: true, paused: true, tabPaused: true};
    if (!isActive()) return {ok: true, stale: true};
    throw error;
  }
  if (!Object.hasOwn(tabModes, sender.tab.id)) return {ok: true, stale: true};
  const current = stateFor(sender.tab.id);
  if (current.tabPaused) return {ok: true, paused: true, tabPaused: true};
  if (current.blocked) return {ok: true, blocked: true};
  if (!isActive() || result.key !== IntentFeed.key(current.settings)) return {ok: true, stale: true};
  return {ok: true, ...result};
}
const refresh = () => { serial(() => tick()).catch(() => {}); };
chrome.alarms.onAlarm.addListener(refresh);
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onCreated?.addListener(tab => {
  if (!isYouTubeTab(tab)) return;
  serial(async () => { await initialize(); ensureMode(tab.id); await chrome.storage.session.set({tabModes}); await tick(); }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(id => {
  serial(async () => {
    await initialize();
    actionStates.delete(id);
    if (!associatedTab(id)) return;
    reports.delete(id); delete tabModes[id]; delete pausedTabs[id]; tabFeedRevisions.delete(id);
    await tick();
  }).catch(() => {});
});
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.url) {
    if (!C.isYouTube(info.url) && !info.url.startsWith(blockedURL())) {
      serial(async () => {
        await initialize();
        if (!associatedTab(id)) return;
        reports.delete(id); delete tabModes[id]; delete pausedTabs[id]; tabFeedRevisions.set(id, (tabFeedRevisions.get(id) || 0) + 1);
        await paintAction(id);
        actionStates.delete(id);
        await tick();
      }).catch(() => {});
      return;
    }
    reports.delete(id);
  }
  if (info.url || Object.hasOwn(tabModes || {}, id) && (info.status === 'complete' || info.audible !== undefined)) refresh();
});
chrome.windows.onFocusChanged.addListener(refresh);
chrome.idle.onStateChanged.addListener(refresh);
chrome.runtime.onInstalled.addListener(refresh);
chrome.runtime.onStartup.addListener(() => serial(async () => {
  await initialize(); tracker = {lastAt: Date.now(), counting: false}; await tick();
}));
