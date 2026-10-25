(() => {
  const C = IntentCore;
  let settings, pending, lastURL = '', running = false, themeObserved = false, tabPaused = false, settingsRevision = 0;
  const homeFeed = window.top === window ? new IntentHome() : null;
  const watchFeed = window.top === window ? new IntentHome(chrome.runtime, 'watch') : null;
  const toolbar = window.top === window ? new IntentToolbar(chrome.runtime, {
    onSettings: value => { settingsRevision++; applySettings(value); schedule(); },
    onPaused: value => { settingsRevision++; setTabPaused(value); schedule(); },
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
  const markedShortNav = new Set(), markedShortPlayers = new Set();
  const GUIDE_ENTRIES = 'ytd-guide-entry-renderer,ytd-mini-guide-entry-renderer,ytd-guide-entry,ytd-mini-guide-entry,yt-guide-entry-view-model,yt-mini-guide-entry-view-model,yt-guide-entry-renderer,yt-mini-guide-entry-renderer,yt-guide-entry,yt-mini-guide-entry,ytm-pivot-bar-item-renderer';
  const GUIDE_AREAS = 'ytd-guide-renderer,ytd-mini-guide-renderer,yt-guide-renderer,yt-mini-guide-renderer,#guide,#guide-content,#guide-inner-content,nav,[role="navigation"]';
  const SHORT_PLAYERS = 'ytd-shorts,ytm-shorts,ytm-shorts-player,ytd-reel-video-renderer,ytm-reel-video-renderer,#shorts-player,#shorts-container,#shorts-inner-container';
  let homePendingTimer;
  const isShortsPage = () => /^\/shorts(?:\/|$)/.test(location.pathname);
  function syncTopicGuard() {
    const root = document.documentElement;
    if (!root) return;
    // YouTube changes the URL before removing the outgoing renderer. Keep both
    // recommendation surfaces protected for the lifetime of the selected intent.
    const active = window.top === window && settings && settings.mode !== 'off' && !tabPaused && !location.hostname.startsWith('music.');
    root.toggleAttribute('data-intent-topics', Boolean(active));
    root.toggleAttribute('data-intent-home-route', Boolean(active && isHome()));
  }
  function clearHomePending() {
    clearTimeout(homePendingTimer); homePendingTimer = null;
    document.documentElement?.removeAttribute('data-intent-home-pending');
  }
  function armHomePending(allowUnknown = false) {
    if (window.top !== window || tabPaused || location.hostname.startsWith('music.') || (!settings && !allowUnknown) || settings?.mode === 'off') return;
    if (!document.documentElement) return;
    document.documentElement.setAttribute('data-intent-home-pending', '');
    clearTimeout(homePendingTimer);
    // A failed navigation or unsupported layout must never leave native Home hidden.
    homePendingTimer = setTimeout(clearHomePending, 15000);
  }
  function applySettings(value) {
    settings = C.sanitize(value);
    syncTopicGuard();
    if (settings.mode === 'off' || tabPaused) {
      clearHomePending();
      if (settings.mode === 'off') {homeFeed?.destroy(); watchFeed?.destroy();}
    }
    else if (isHome() && !homeFeed?.host?.isConnected) armHomePending();
    document.documentElement?.toggleAttribute('data-intent-shorts', !tabPaused && settings.hideShorts);
    filterShortsNavigation();
    if (!settings.hideShorts) restoreShortsGate();
  }
  function restoreShortsGate() {
    document.getElementById('intent-shorts-gate')?.remove();
    for (const element of markedShortPlayers) element.removeAttribute('data-intent-shorts-player-hidden');
    markedShortPlayers.clear();
  }
  function shortsDestination(value) {
    try { const url = new URL(value, location.href); return /(^|\.)youtube\.com$/.test(url.hostname) && /^\/shorts(?:\/|$)/.test(url.pathname); }
    catch { return false; }
  }
  function filterShortsNavigation() {
    const found = new Set();
    if (settings.hideShorts && !tabPaused) {
      for (const link of document.querySelectorAll('a[href],[role="link"][href],[role="link"][data-href]')) {
        const entry = link.closest(GUIDE_ENTRIES);
        if (!(entry || link.closest(GUIDE_AREAS)) || !shortsDestination(link.getAttribute('href') || link.getAttribute('data-href'))) continue;
        found.add(entry || link);
      }
      // Native guide endpoints sometimes carry only Polymer navigation data,
      // without an href. Only official primary/mini entries may use the label
      // fallback, so a subscription channel named Shorts remains untouched.
      for (const entry of document.querySelectorAll(GUIDE_ENTRIES)) {
        const mini = entry.matches('ytd-mini-guide-entry-renderer,ytd-mini-guide-entry,yt-mini-guide-entry-view-model,yt-mini-guide-entry-renderer,yt-mini-guide-entry') || entry.closest('ytd-mini-guide-renderer,yt-mini-guide-renderer');
        if (!entry.hasAttribute('is-primary') && !mini) continue;
        const endpoint = entry.querySelector('#endpoint,a,[role="link"]');
        // An explicit destination is authoritative, including a non-Shorts href
        // on a reused entry whose old title has not been updated yet.
        if (!endpoint || endpoint.hasAttribute('href') || endpoint.hasAttribute('data-href')) continue;
        const label = endpoint.getAttribute('aria-label') || endpoint.getAttribute('title') || entry.getAttribute('aria-label') || entry.getAttribute('title') || '';
        if (/^shorts$/i.test(label.trim())) found.add(entry);
      }
    }
    for (const element of markedShortNav) if (!found.has(element)) {element.removeAttribute('data-intent-short-nav'); markedShortNav.delete(element);}
    for (const element of found) if (!element.hasAttribute('data-intent-short-nav')) {element.setAttribute('data-intent-short-nav', ''); markedShortNav.add(element);}
  }
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
    syncTopicGuard();
    if (paused) {
      clearHomePending(); homeFeed?.destroy(); watchFeed?.destroy();
      for (const element of markedHiddenElements) element.removeAttribute('data-intent-hidden');
      markedHiddenElements.clear();
      for (const shelf of markedShortShelves) shelf.removeAttribute('data-intent-short-shelf');
      markedShortShelves.clear();
      document.documentElement?.removeAttribute('data-intent-shorts');
      for (const element of markedShortNav) element.removeAttribute('data-intent-short-nav');
      markedShortNav.clear();
      restoreShortsGate();
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
    const blocked = !tabPaused && settings.hideShorts && isShortsPage();
    if (!blocked) { restoreShortsGate(); return; }
    // Hide the actual Shorts surface as well as stopping its media. The guard is
    // normal page content, so YouTube's masthead and guide remain usable.
    const players = new Set(document.querySelectorAll(SHORT_PLAYERS + ',video,audio'));
    for (const element of markedShortPlayers) if (!players.has(element)) {element.removeAttribute('data-intent-shorts-player-hidden'); markedShortPlayers.delete(element);}
    for (const element of players) if (!element.hasAttribute('data-intent-shorts-player-hidden')) {element.setAttribute('data-intent-shorts-player-hidden', ''); markedShortPlayers.add(element);}
    document.querySelectorAll('video,audio').forEach(media => {if (!media.paused) media.pause();});
    let gate = document.getElementById('intent-shorts-gate');
    const renderer = document.querySelector(SHORT_PLAYERS);
    const mount = document.querySelector('ytd-page-manager,#page-manager') || renderer?.parentElement || document.querySelector('main,[role="main"]') || document.body;
    if (!mount) return;
    if (!gate) {
      gate = document.createElement('section'); gate.id = 'intent-shorts-gate'; gate.dataset.theme = IntentHome.theme();
      const root = gate.attachShadow({mode: 'open'});
      const style = document.createElement('style');
      // Literal surface colors remain opaque even if YouTube supplies transparent tokens.
      style.textContent = (globalThis.IntentShortsTheme || '') + ':host{position:relative!important;inset:auto!important;z-index:auto!important;display:grid;place-items:center;box-sizing:border-box;width:100%;min-height:360px;min-height:min(560px,calc(100dvh - 80px));padding:24px 16px;background:#fff!important;color:#0f0f0f;font:16px Roboto,Arial,sans-serif;color-scheme:light}:host([data-theme=dark]){background:#0f0f0f!important;color:#f1f1f1;color-scheme:dark}main{box-sizing:border-box;width:100%;max-width:480px;padding:24px;text-align:center}h1{font-size:28px;font-weight:600;line-height:1.25;letter-spacing:0;margin:0 0 16px}p{font-size:14px;line-height:1.6;color:inherit;opacity:.8}a{display:inline-block;max-width:100%;box-sizing:border-box;margin-top:20px;padding:12px 20px;border-radius:24px;background:#0f0f0f;color:#fff;text-decoration:none;font-size:14px;font-weight:500}:host([data-theme=dark]) a{background:#f1f1f1;color:#0f0f0f}a:focus-visible{outline:3px solid var(--intent-accent,#365e4b);outline-offset:4px}@media(max-width:480px){main{padding:20px 8px}h1{font-size:24px}}';
      const main = document.createElement('main');
      const title = document.createElement('h1'); title.textContent = 'Shorts are hidden';
      const p = document.createElement('p'); p.textContent = 'Hide Shorts is enabled. Return Home or choose another video.';
      const link = document.createElement('a'); link.href = 'https://www.youtube.com/'; link.textContent = 'Back to Home';
      main.append(title, p, link); root.append(style, main);
    }
    if (gate.parentElement !== mount) mount.append(gate);
  }
  function intentCoverage(home, watch) {
    if (tabPaused) return {state: 'paused', detail: 'Intent is paused on this tab. Filters and timer counting are off here. Your saved intent and other tabs are unchanged.'};
    if (settings.mode === 'off') return {state: 'off-here', detail: 'Intent filtering is off. Distraction filters and the daily timer still apply.'};
    const name = C.modes(settings)[settings.mode]?.name || 'Your';
    if (location.pathname === '/results') return {state: 'off-here', detail: `Intent is off on search results. ${name} is saved for Home and video recommendations. Distraction filters and the daily timer still apply.`};
    const feed = home ? homeFeed : watch ? watchFeed : null;
    if (!feed?.host?.isConnected) return home || watch
      ? {state: 'loading', detail: 'Waiting for YouTube recommendations to finish loading. Native recommendations remain hidden while your intent is active.'}
      : {state: 'off-here', detail: 'Intent is off on this page. Your selected intent is saved for Home and video recommendations; distraction filters and the daily timer still apply.'};
    const state = ['active', 'loading', 'unavailable'].includes(feed.feedState) ? feed.feedState : 'loading';
    return {state, detail: state === 'active' ? `${name} filters these recommendations.` : state === 'loading' ? `Loading recommendations for ${name}.` : 'Intent recommendations are unavailable. Try refreshing the feed. Distraction filters and the daily timer still apply.'};
  }
  function scan() {
    pending = null;
    if (!settings || !document.documentElement) return;
    syncTopicGuard();
    observeTheme();
    const home = isHome(), watch = isWatch();
    if (tabPaused) {
      clearHomePending(); restoreShortsGate();
      toolbar?.sync(settings, !location.hostname.startsWith('music.'), intentCoverage(home, watch));
      return;
    }
    for (const element of markedHiddenElements) if (!element.isConnected) {element.removeAttribute('data-intent-hidden'); markedHiddenElements.delete(element);}
    homeFeed?.sync(settings, home);
    watchFeed?.sync(settings, watch);
    if (settings.mode === 'off' || home && homeFeed?.host?.isConnected) clearHomePending();
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
    filterShortsNavigation();
    shortsGate();
  }
  function schedule() { if (!pending) pending = setTimeout(scan, 120); }
  async function heartbeat() {
    if (running) return;
    running = true;
    const revision = settingsRevision;
    try {
      const playing = !tabPaused && [...document.querySelectorAll('video,audio')].some(m => !m.paused && !m.ended && m.readyState > 1);
      const state = await chrome.runtime.sendMessage({type: 'HEARTBEAT', playing, ...(window.top === window ? {appearance: IntentHome.theme()} : {})});
      if (state?.ok) {
        // A popup/toolbar change can arrive while an earlier snapshot is in flight.
        // Never let that older response undo a newer pause or intent selection.
        if (revision !== settingsRevision) return;
        toolbar?.updateTimer?.(state);
        if (tabPaused !== (state.tabPaused === true)) {setTabPaused(state.tabPaused); schedule();}
        if (JSON.stringify(settings) !== JSON.stringify(state.settings)) { applySettings(state.settings); schedule(); }
        if (state.blocked) {
          document.querySelectorAll('video,audio').forEach(m => m.pause());
          location.replace(chrome.runtime.getURL('blocked.html'));
        }
      }
    } catch { /* Reloading an unpacked extension invalidates old scripts; refresh YouTube. */ }
    finally { running = false; if (revision !== settingsRevision) queueMicrotask(heartbeat); }
  }
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'SETTINGS') {
      settingsRevision++;
      if (message.reset) {homeFeed?.destroy(); watchFeed?.destroy();}
      setTabPaused(message.tabPaused);
      applySettings(message.settings);
      if (tabPaused || !settings.hideShorts) {filterShortsNavigation(); restoreShortsGate();}
      heartbeat();
      schedule();
    }
  });
  new MutationObserver(() => {
    syncTopicGuard();
    // document_start can run before <html> exists. Arm the initial Home guard
    // as soon as the parser creates it, before native cards can paint.
    if (!settings && isHome() && !document.documentElement?.hasAttribute('data-intent-home-pending')) armHomePending(true);
    if (settings && !tabPaused) {filterShortsNavigation(); if (isShortsPage()) shortsGate();}
    schedule();
  }).observe(document, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'data-href', 'hidden', 'page-subtype', 'title', 'aria-label', 'is-primary']});
  function navigationDestination(event) {
    const detail = event.detail || {};
    const value = detail.url || detail.endpoint?.commandMetadata?.webCommandMetadata?.url || detail.navigationData?.endpoint?.commandMetadata?.webCommandMetadata?.url;
    if (!value) return null;
    try {return new URL(value, location.href);} catch {return null;}
  }
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
    const link = event.composedPath().find(node => node instanceof HTMLAnchorElement);
    if (!link || link.target && link.target !== '_self' || link.hasAttribute('download')) return;
    try { const url = new URL(link.href); if (url.origin === location.origin && url.pathname === '/') armHomePending(); } catch {}
  }, true);
  document.addEventListener('yt-navigate-start', event => {
    const url = navigationDestination(event);
    if (!url || url.origin === location.origin && url.pathname === '/') armHomePending();
    else clearHomePending();
  });
  document.addEventListener('yt-navigate-finish', () => {
    syncTopicGuard();
    if (pending) {clearTimeout(pending); pending = null;}
    scan();
    // Navigation has settled: unsupported layouts keep their native content.
    if (settings && (!isHome() || !homeFeed?.host?.isConnected)) clearHomePending();
  });
  window.addEventListener('popstate', () => {syncTopicGuard(); if (isHome()) armHomePending(); else clearHomePending(); schedule();});
  if (isHome()) armHomePending(true);
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
