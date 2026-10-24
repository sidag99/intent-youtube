(() => {
  const C = IntentCore;
  let settings, pending, lastURL = '', running = false, themeObserved = false;
  const homeFeed = window.top === window ? new IntentHome() : null;
  const watchFeed = window.top === window ? new IntentHome(chrome.runtime, 'watch') : null;
  const toolbar = window.top === window ? new IntentToolbar(chrome.runtime, {
    onSettings: value => { settings = C.sanitize(value); schedule(); },
    onRefresh: () => Promise.all([homeFeed?.refreshFeed(), watchFeed?.refreshFeed()])
  }) : null;
  const SHORT_ITEMS = 'ytd-reel-item-renderer,yt-shorts-lockup-view-model,yt-shorts-lockup-view-model-v2,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2';
  const CARDS = 'ytd-rich-item-renderer,ytd-rich-section-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,yt-lockup-view-model,ytm-rich-item-renderer,' + SHORT_ITEMS;
  const SHELVES = 'ytd-reel-shelf-renderer,ytd-rich-shelf-renderer[is-shorts],ytm-reel-shelf-renderer';
  const isHome = () => location.pathname === '/' && !location.hostname.startsWith('music.');
  const isWatch = () => location.pathname === '/watch' && !location.hostname.startsWith('music.') && /^[\w-]{11}$/.test(new URL(location.href).searchParams.get('v') || '');
  const text = (el, selector) => el.querySelector(selector)?.textContent?.trim() || '';
  function setHidden(el, hidden) {
    if (hidden !== el.hasAttribute('data-intent-hidden')) el.toggleAttribute('data-intent-hidden', hidden);
  }
  function refreshTheme() {
    homeFeed?.updateTheme(); watchFeed?.updateTheme(); toolbar?.updateTheme();
    const gate = document.getElementById('intent-shorts-gate');
    if (gate) gate.dataset.theme = IntentHome.theme();
    if (window.top === window) heartbeat();
  }
  function observeTheme() {
    if (themeObserved || !document.documentElement) return;
    themeObserved = true;
    new MutationObserver(refreshTheme).observe(document.documentElement, {attributes: true, attributeFilter: ['dark', 'data-theme', 'style']});
    refreshTheme();
  }
  function shortsGate() {
    let gate = document.getElementById('intent-shorts-gate');
    const blocked = settings.hideShorts && location.pathname.startsWith('/shorts');
    if (!blocked) { gate?.remove(); return; }
    document.querySelectorAll('video,audio').forEach(media => media.pause());
    if (gate) return;
    gate = document.createElement('div'); gate.id = 'intent-shorts-gate'; gate.dataset.theme = IntentHome.theme();
    const root = gate.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = ':host{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#f7f7f0;color:#283a30;font:16px system-ui}main{max-width:420px;text-align:center;padding:40px}h1{font-size:36px;letter-spacing:-1.5px}p{line-height:1.7;color:#657064}a{display:inline-block;margin-top:22px;border-radius:10px;padding:13px 22px;background:#365e4b;color:white;text-decoration:none}' + (globalThis.IntentShortsTheme || '');
    const main = document.createElement('main');
    const title = document.createElement('h1'); title.textContent = 'Skip the rabbit hole.';
    const p = document.createElement('p'); p.textContent = 'Shorts are hidden by Intent. Take a breath and choose something worth your time.';
    const link = document.createElement('a'); link.href = 'https://www.youtube.com/'; link.textContent = 'Back to your home page →';
    main.append(title, p, link); root.append(style, main); document.documentElement.append(gate);
  }
  function scan() {
    pending = null;
    if (!settings || !document.documentElement) return;
    observeTheme();
    const home = isHome();
    homeFeed?.sync(settings, home);
    watchFeed?.sync(settings, isWatch());
    toolbar?.sync(settings, !location.hostname.startsWith('music.'));
    document.documentElement.toggleAttribute('data-intent-shorts', settings.hideShorts);
    // Mode selection is handled by the filled feeds. Native shelves must not be
    // rejected as one title when Shorts are allowed, especially during restore.
    const visibleSettings = {...settings, mode: 'off'};
    for (const card of document.querySelectorAll(CARDS)) {
      if (card.querySelector(SHELVES)) { setHidden(card, settings.hideShorts); continue; }
      // Modern lockups can be nested in legacy cards. Filter each visual card once.
      const parentCard = card.parentElement?.closest(CARDS);
      if (parentCard && !parentCard.querySelector(SHELVES)) continue;
      const title = text(card, '#video-title,.yt-lockup-metadata-view-model__title,.shortsLockupViewModelHostMetadataTitle,h3') || card.querySelector('a[href*="/shorts/"]')?.getAttribute('title') || '';
      const channel = text(card, '#channel-name a,ytd-channel-name,.yt-content-metadata-view-model__metadata-row .yt-content-metadata-view-model__metadata-text');
      const shorts = card.matches(SHORT_ITEMS) || !!card.querySelector('a[href^="/shorts/"],a[href*="youtube.com/shorts/"],[is-shorts]');
      const result = C.classify({title, channel, shorts}, visibleSettings);
      setHidden(card, !result.visible);
    }
    for (const shelf of document.querySelectorAll(SHELVES)) setHidden(shelf, settings.hideShorts);
    for (const link of document.querySelectorAll('ytd-guide-entry-renderer a[href^="/shorts"],ytd-mini-guide-entry-renderer a[href^="/shorts"]')) setHidden(link.closest('ytd-guide-entry-renderer,ytd-mini-guide-entry-renderer'), settings.hideShorts);
    shortsGate();
  }
  function schedule() { if (!pending) pending = setTimeout(scan, 120); }
  async function heartbeat() {
    if (running) return;
    running = true;
    try {
      const playing = [...document.querySelectorAll('video,audio')].some(m => !m.paused && !m.ended && m.readyState > 1);
      const state = await chrome.runtime.sendMessage({type: 'HEARTBEAT', playing, ...(window.top === window ? {appearance: IntentHome.theme()} : {})});
      if (state?.ok) {
        if (JSON.stringify(settings) !== JSON.stringify(state.settings)) { settings = state.settings; schedule(); }
        if (state.blocked) {
          document.querySelectorAll('video,audio').forEach(m => m.pause());
          location.replace(chrome.runtime.getURL('blocked.html'));
        }
      }
    } catch { /* Reloading an unpacked extension invalidates old scripts; refresh YouTube. */ }
    finally { running = false; }
  }
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'SETTINGS') { settings = C.sanitize(message.settings); schedule(); }
  });
  new MutationObserver(schedule).observe(document, {childList: true, subtree: true, characterData: true});
  document.addEventListener('yt-navigate-finish', schedule);
  window.addEventListener('resize', schedule, {passive: true});
  // Theme changes do not require a reload or another network/model request.
  observeTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshTheme);
  document.addEventListener('play', () => { shortsGateIfReady(); heartbeat(); }, true);
  document.addEventListener('pause', heartbeat, true);
  document.addEventListener('visibilitychange', heartbeat);
  function shortsGateIfReady() { if (settings) shortsGate(); }
  setInterval(() => {
    if (location.href !== lastURL) { lastURL = location.href; schedule(); }
    heartbeat();
  }, 5000);
  heartbeat();
})();
