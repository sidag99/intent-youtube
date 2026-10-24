(() => {
  const C = IntentCore;
  let settings, pending, lastURL = '', running = false, themeObserved = false, tabPaused = false;
  const homeFeed = window.top === window ? new IntentHome() : null;
  const watchFeed = window.top === window ? new IntentHome(chrome.runtime, 'watch') : null;
  const toolbar = window.top === window ? new IntentToolbar(chrome.runtime, {
    onSettings: value => { settings = C.sanitize(value); schedule(); },
    onPaused: value => { setTabPaused(value); schedule(); },
    onRefresh: () => Promise.all([homeFeed?.refreshFeed(), watchFeed?.refreshFeed()])
  }) : null;
  const SHORT_ITEMS = 'ytd-reel-item-renderer,yt-shorts-lockup-view-model,yt-shorts-lockup-view-model-v2,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2';
  const CARDS = 'ytd-rich-item-renderer,ytd-rich-section-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,yt-lockup-view-model,ytm-rich-item-renderer,' + SHORT_ITEMS;
  const SHELVES = 'ytd-reel-shelf-renderer,ytd-rich-shelf-renderer[is-shorts],ytm-reel-shelf-renderer';
  const SHELF_WRAPPERS = SHELVES + ',yt-grid-shelf-view-model,yt-shelf-view-model,ytd-shelf-renderer,ytd-rich-shelf-renderer,ytm-shelf-renderer';
  const LEAF_CARDS = 'ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,yt-lockup-view-model,ytd-rich-item-renderer,ytm-rich-item-renderer';
  const SHORT_LINKS = 'a[href^="/shorts/"],a[href*="youtube.com/shorts/"]';
  const markedShortShelves = new Set();
  const markedHiddenElements = new Set();
  const isHome = () => location.pathname === '/' && !location.hostname.startsWith('music.');
  const isWatch = () => location.pathname === '/watch' && !location.hostname.startsWith('music.') && /^[\w-]{11}$/.test(new URL(location.href).searchParams.get('v') || '');
  const text = (el, selector) => el.querySelector(selector)?.textContent?.trim() || '';
  function setHidden(el, hidden) {
    if (hidden !== el.hasAttribute('data-intent-hidden')) el.toggleAttribute('data-intent-hidden', hidden);
    if (hidden) markedHiddenElements.add(el); else markedHiddenElements.delete(el);
  }
  function setTabPaused(value) {
    const paused = value === true;
    if (paused === tabPaused) return;
    tabPaused = paused;
    if (paused) {
      homeFeed?.destroy(); watchFeed?.destroy();
      for (const element of markedHiddenElements) element.removeAttribute('data-intent-hidden');
      markedHiddenElements.clear();
      for (const shelf of markedShortShelves) shelf.removeAttribute('data-intent-short-shelf');
      markedShortShelves.clear();
      document.documentElement?.removeAttribute('data-intent-shorts');
      document.getElementById('intent-shorts-gate')?.remove();
    }
  }
  function hasNormalVideos(shelf) {
    return [...shelf.querySelectorAll(LEAF_CARDS)].some(card => !card.closest(SHORT_ITEMS) && !card.querySelector(SHORT_ITEMS + ',' + SHORT_LINKS));
  }
  function fullShortsShelf(start) {
    let shelf;
    // Never climb into a search result section: it can also contain normal videos.
    for (let node = start, depth = 0; node && depth < 8; node = node.parentElement, depth++) {
      if (node.matches('ytd-item-section-renderer,ytd-section-list-renderer,ytd-rich-grid-renderer,ytm-item-section-renderer,#primary')) break;
      if (node.matches(SHELF_WRAPPERS) && !hasNormalVideos(node)) shelf = node;
      else if (shelf && node.matches('ytd-rich-section-renderer,ytd-rich-item-renderer,ytm-rich-item-renderer') && !hasNormalVideos(node)) shelf = node;
    }
    return shelf;
  }
  function hasShortsHeader(shelf) {
    const headings = shelf.querySelectorAll('yt-section-header-view-model,h2,h3,[role="heading"],#title-container,#title');
    for (const heading of [...headings].slice(0, 24)) {
      const card = heading.closest(LEAF_CARDS + ',' + SHORT_ITEMS);
      if (card && shelf.contains(card) || heading.textContent.trim().toLocaleLowerCase() !== 'shorts') continue;
      const header = heading.closest('yt-section-header-view-model,#title-container,header') || heading.parentElement;
      if (!header || !shelf.contains(header)) continue;
      if (header.querySelector('[icon*="shorts" i],[icon-name*="shorts" i],[data-icon*="shorts" i],img[alt="Shorts" i],svg[aria-label="Shorts" i]')) return true;
      // Current grid shelves render the brand as an unlabelled red SVG path.
      // The exact heading and known shelf boundary keep ordinary video titles out.
      if ([...header.querySelectorAll('svg,path')].some(icon => {
        const rgb = getComputedStyle(icon).fill.match(/^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
        return rgb && Number(rgb[1]) > 180 && Number(rgb[2]) < 90 && Number(rgb[3]) < 110;
      })) return true;
      if (header.querySelector('a[href="/shorts"],a[href="/shorts/"]') && header.querySelector('yt-icon,svg')) return true;
    }
    return false;
  }
  function filterShortsShelves() {
    const found = new Set();
    if (settings.hideShorts) {
      for (const element of document.querySelectorAll(SHELVES + ',' + SHORT_ITEMS + ',' + SHORT_LINKS)) {
        const shelf = fullShortsShelf(element);
        if (shelf) found.add(shelf);
      }
      // YouTube can remove the cards before removing the module heading/footer.
      for (const shelf of document.querySelectorAll(SHELF_WRAPPERS)) if (!hasNormalVideos(shelf) && hasShortsHeader(shelf)) found.add(fullShortsShelf(shelf) || shelf);
    }
    for (const shelf of markedShortShelves) if (!found.has(shelf)) {shelf.removeAttribute('data-intent-short-shelf'); markedShortShelves.delete(shelf);}
    for (const shelf of found) {shelf.setAttribute('data-intent-short-shelf', ''); markedShortShelves.add(shelf);}
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
    const blocked = !tabPaused && settings.hideShorts && location.pathname.startsWith('/shorts');
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
  function intentCoverage(home, watch) {
    if (tabPaused) return {state: 'paused', detail: 'Intent is paused on this tab. Filters and timer counting are off here. Your saved intent and other tabs are unchanged.'};
    if (settings.mode === 'off') return {state: 'off-here', detail: 'Intent filtering is off. Distraction filters and the daily timer still apply.'};
    const name = C.modes(settings)[settings.mode]?.name || 'Your';
    if (location.pathname === '/results') return {state: 'off-here', detail: `Intent is off on search results. ${name} is saved for Home and video recommendations. Distraction filters and the daily timer still apply.`};
    const feed = home ? homeFeed : watch ? watchFeed : null;
    if (!feed?.host?.isConnected) return {state: 'off-here', detail: home || watch ? 'Intent is off here because this YouTube layout is unavailable. Distraction filters and the daily timer still apply.' : 'Intent is off on this page. Your selected intent is saved for Home and video recommendations; distraction filters and the daily timer still apply.'};
    const state = ['active', 'loading', 'unavailable'].includes(feed.feedState) ? feed.feedState : 'loading';
    return {state, detail: state === 'active' ? `${name} filters these recommendations.` : state === 'loading' ? `Loading recommendations for ${name}.` : 'Intent recommendations are unavailable. Try refreshing the feed. Distraction filters and the daily timer still apply.'};
  }
  function scan() {
    pending = null;
    if (!settings || !document.documentElement) return;
    observeTheme();
    const home = isHome(), watch = isWatch();
    if (tabPaused) {
      toolbar?.sync(settings, !location.hostname.startsWith('music.'), intentCoverage(home, watch));
      return;
    }
    for (const element of markedHiddenElements) if (!element.isConnected) {element.removeAttribute('data-intent-hidden'); markedHiddenElements.delete(element);}
    homeFeed?.sync(settings, home);
    watchFeed?.sync(settings, watch);
    toolbar?.sync(settings, !location.hostname.startsWith('music.'), intentCoverage(home, watch));
    document.documentElement.toggleAttribute('data-intent-shorts', settings.hideShorts);
    // Mode selection is handled by the filled feeds. Native shelves must not be
    // rejected as one title when Shorts are allowed, especially during restore.
    const visibleSettings = {...settings, mode: 'off'};
    for (const card of document.querySelectorAll(CARDS)) {
      if (card.matches('ytd-rich-section-renderer') || card.querySelector(SHELF_WRAPPERS)) { setHidden(card, false); continue; }
      // Modern lockups can be nested in legacy cards. Filter each visual card once.
      const parentCard = card.parentElement?.closest(CARDS);
      if (parentCard && !parentCard.matches('ytd-rich-section-renderer') && !parentCard.querySelector(SHELF_WRAPPERS)) continue;
      const title = text(card, '#video-title,.yt-lockup-metadata-view-model__title,.shortsLockupViewModelHostMetadataTitle,h3') || card.querySelector('a[href*="/shorts/"]')?.getAttribute('title') || '';
      const channel = text(card, '#channel-name a,ytd-channel-name,.yt-content-metadata-view-model__metadata-row .yt-content-metadata-view-model__metadata-text');
      const shorts = card.matches(SHORT_ITEMS) || !!card.querySelector('a[href^="/shorts/"],a[href*="youtube.com/shorts/"],[is-shorts]');
      const result = C.classify({title, channel, shorts}, visibleSettings);
      setHidden(card, !result.visible);
    }
    filterShortsShelves();
    for (const link of document.querySelectorAll('ytd-guide-entry-renderer a[href^="/shorts"],ytd-mini-guide-entry-renderer a[href^="/shorts"]')) setHidden(link.closest('ytd-guide-entry-renderer,ytd-mini-guide-entry-renderer'), settings.hideShorts);
    shortsGate();
  }
  function schedule() { if (!pending) pending = setTimeout(scan, 120); }
  async function heartbeat() {
    if (running) return;
    running = true;
    try {
      const playing = !tabPaused && [...document.querySelectorAll('video,audio')].some(m => !m.paused && !m.ended && m.readyState > 1);
      const state = await chrome.runtime.sendMessage({type: 'HEARTBEAT', playing, ...(window.top === window ? {appearance: IntentHome.theme()} : {})});
      if (state?.ok) {
        if (tabPaused !== (state.tabPaused === true)) {setTabPaused(state.tabPaused); schedule();}
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
    if (message.type === 'SETTINGS') {
      if (message.reset) {homeFeed?.destroy(); watchFeed?.destroy();}
      setTabPaused(message.tabPaused);
      settings = C.sanitize(message.settings); schedule();
    }
  });
  new MutationObserver(schedule).observe(document, {childList: true, subtree: true, characterData: true});
  document.addEventListener('yt-navigate-finish', schedule);
  document.addEventListener('intent-feed-state-change', schedule);
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
