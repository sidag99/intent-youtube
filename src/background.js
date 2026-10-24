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
let settings, days, tracker, appearance, initialized, appliedBlock;
let queue = Promise.resolve();
const reports = new Map();
const URLS = ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'];
function serial(task) {
  const job = queue.then(task);
  queue = job.catch(error => console.error('Intent:', error));
  return job;
}
async function initialize() {
  if (!initialized) initialized = (async () => {
    await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
    const data = await chrome.storage.local.get(['settings', 'days', 'appearance']);
    settings = C.sanitize(data.settings);
    days = data.days || {};
    appearance = ['light', 'dark'].includes(data.appearance) ? data.appearance : undefined;
    const session = await chrome.storage.session.get('tracker');
    tracker = session.tracker || {lastAt: Date.now(), counting: false};
    if (!(await chrome.alarms.get('intent-tick'))) await chrome.alarms.create('intent-tick', {periodInMinutes: .5});
    chrome.idle.setDetectionInterval(60);
  })();
  return initialized;
}
async function applyBlock(blocked) {
  if (appliedBlock !== blocked) {
    await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: [1], addRules: blocked ? [{
      id: 1, priority: 1,
      action: {type: 'redirect', redirect: {extensionPath: '/blocked.html'}},
      condition: {requestDomains: ['youtube.com', 'youtube-nocookie.com'], resourceTypes: ['main_frame', 'sub_frame']}
    }] : []});
    appliedBlock = blocked;
  }
  if (blocked) {
    const tabs = await chrome.tabs.query({url: URLS});
    await Promise.allSettled(tabs.map(tab => chrome.tabs.update(tab.id, {url: chrome.runtime.getURL('blocked.html')})));
  }
  await chrome.action.setBadgeText({text: blocked ? 'END' : settings.mode === 'off' ? '' : settings.mode.slice(0, 1).toUpperCase()});
  await chrome.action.setBadgeBackgroundColor({color: blocked ? '#9b4135' : '#365e4b'});
}
async function tick(message = {}, sender = {}) {
  await initialize();
  const now = Date.now();
  days = C.advanceUsage(days, tracker.lastAt, now, tracker.counting);
  if (message.type === 'HEARTBEAT' && sender.tab && C.isYouTube(sender.url || sender.tab.url)) {
    const frames = reports.get(sender.tab.id) || new Map();
    frames.set(sender.frameId || 0, {playing: message.playing === true, expiresAt: now + 20000});
    reports.set(sender.tab.id, frames);
    if ((sender.frameId || 0) === 0 && sender.tab.active !== false && ['light', 'dark'].includes(message.appearance) && appearance !== message.appearance) {
      appearance = message.appearance;
      await chrome.storage.local.set({appearance});
      // Extension pages can follow YouTube without rebuilding forms or losing drafts.
      await chrome.runtime.sendMessage({type: 'APPEARANCE', appearance}).catch(() => {});
    }
  }
  if (message.type === 'UPDATE_SETTINGS') {
    if (!sender.url?.startsWith(chrome.runtime.getURL('')) || sender.tab && C.isYouTube(sender.tab.url)) throw new Error('Settings can only be changed in Intent.');
    settings = C.sanitize({...settings, ...message.patch});
    await chrome.storage.local.set({settings});
    const tabs = await chrome.tabs.query({url: URLS});
    await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, {type: 'SETTINGS', settings})));
  }
  const state = C.snapshot(settings, days, now);
  const [tabs, focused, idle] = await Promise.all([
    chrome.tabs.query({url: URLS}),
    chrome.windows.getLastFocused().catch(() => ({focused: false})),
    chrome.idle.queryState(60)
  ]);
  const tabIds = new Set(tabs.map(t => t.id));
  for (const [id, frames] of reports) {
    for (const [frame, report] of frames) if (report.expiresAt <= now) frames.delete(frame);
    if (!tabIds.has(id) || !frames.size) reports.delete(id);
  }
  const foreground = idle === 'active' && focused.focused && tabs.some(t => t.active && t.windowId === focused.id);
  const playing = settings.countPlayback && (tabs.some(t => t.audible) || [...reports.values()].some(frames => [...frames.values()].some(r => r.playing)));
  tracker = {lastAt: now, counting: !state.blocked && idle !== 'locked' && Boolean(foreground || playing)};
  await chrome.storage.local.set({days});
  await chrome.storage.session.set({tracker});
  await applyBlock(state.blocked);
  return {...state, appearance};
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'GET_FEED') {
    feedRequest(message, sender).then(respond, error => respond({ok: false, error: error.message}));
    return true;
  }
  if (!['HEARTBEAT', 'GET_STATE', 'UPDATE_SETTINGS', 'OPEN_SETTINGS'].includes(message?.type)) return;
  if (message.type === 'OPEN_SETTINGS') { chrome.runtime.openOptionsPage().then(() => respond({ok: true})); return true; }
  serial(() => tick(message, sender)).then(state => respond({ok: true, ...state}), error => respond({ok: false, error: error.message}));
  return true;
});
async function feedRequest(message, sender) {
  const url = new URL(sender.url || 'https://invalid.test/');
  const currentVideo = url.pathname === '/watch' && /^[\w-]{11}$/.test(url.searchParams.get('v') || '') ? url.searchParams.get('v') : '';
  if (!sender.tab || (sender.frameId || 0) !== 0 || !C.isYouTube(url.href) || !(url.pathname === '/' || currentVideo) || !['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) throw new Error('Feeds can only be requested from top-level YouTube home and video pages.');
  const state = await serial(() => tick());
  if (state.blocked) return {ok: true, blocked: true};
  if (message.key !== IntentFeed.key(state.settings)) return {ok: true, stale: true};
  // Derive the watched video from the trusted sender, even if the client omits it.
  const exclude = currentVideo ? [currentVideo, ...(Array.isArray(message.exclude) ? message.exclude : [])] : message.exclude;
  const result = await feedService.get(state.settings, {...message, exclude});
  // A mode change or exhausted budget during the fetch must supersede old results.
  if (C.snapshot(settings, days).blocked) return {ok: true, blocked: true};
  if (result.key !== IntentFeed.key(settings)) return {ok: true, stale: true};
  return {ok: true, ...result};
}
const refresh = () => { serial(() => tick()).catch(() => {}); };
chrome.alarms.onAlarm.addListener(refresh);
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onRemoved.addListener(id => { reports.delete(id); refresh(); });
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.url) reports.delete(id);
  if (info.url || info.status === 'complete' || info.audible !== undefined) refresh();
});
chrome.windows.onFocusChanged.addListener(refresh);
chrome.idle.onStateChanged.addListener(refresh);
chrome.runtime.onInstalled.addListener(refresh);
chrome.runtime.onStartup.addListener(() => serial(async () => {
  await initialize();
  tracker = {lastAt: Date.now(), counting: false};
  await tick();
}));
