(() => {
  const C = IntentCore;
  if (window.top !== window || !C.isYouTube(location.href)) return;
  document.dispatchEvent(new Event('intent-dispose-content'));
  let disposed = false;
  const cleanups = [], observers = [], intervals = [];
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const runtimeHasIdentity = 'id' in chrome.runtime;
  const alive = () => {try {return !disposed && (!runtimeHasIdentity || Boolean(chrome.runtime.id));} catch {return false;}};
  const claim = () => document.documentElement?.setAttribute('data-intent-content-owner', owner);
  const listen = (target, name, callback, options) => {const guarded = (...args) => {if (alive()) callback(...args);}; target.addEventListener(name, guarded, options); cleanups.push(() => target.removeEventListener(name, guarded, options));};
  const mutations = callback => {const observer = new MutationObserver((...args) => {if (alive()) {claim(); callback(...args);} else dispose();}); observers.push(observer); return observer;};
  const every = (callback, duration) => {const id = setInterval(() => {if (alive()) callback(); else dispose();}, duration); intervals.push(id); return id;};
  function dispose() {
    if (disposed) return; disposed = true;
    observers.forEach(observer => observer.disconnect()); intervals.forEach(clearInterval); cleanups.splice(0).forEach(fn => fn());
    clearTimeout(pending); clearTimeout(topicTimer); clearTimeout(topicNavigationTimer); clearTimeout(homePendingTimer);
    homeFeed?.destroy(); watchFeed?.destroy(); toolbar?.destroy(); clearVideoTopic(); restoreShortsGate();
    for (const [nodes, attribute] of [[markedHiddenElements, 'data-intent-hidden'], [markedShortShelves, 'data-intent-short-shelf'], [markedShortNav, 'data-intent-short-nav']]) {for (const node of nodes) node.removeAttribute(attribute); nodes.clear();}
    document.removeEventListener('intent-dispose-content', dispose); document.removeEventListener('intent-context-lost', dispose);
    try {chrome.runtime.onMessage.removeListener?.(messageListener);} catch { /* The old extension context may already be gone. */ }
    // Keep topic protection briefly while a fresh context claims this document.
    // Disabling the extension, with no replacement, restores native content.
    setTimeout(() => {if (document.documentElement?.getAttribute('data-intent-content-owner') === owner) {for (const attr of ['data-intent-content-owner','data-intent-topics','data-intent-home-route','data-intent-home-pending','data-intent-shorts']) document.documentElement.removeAttribute(attr);}}, 2000);
  }
  document.addEventListener('intent-dispose-content', dispose); document.addEventListener('intent-context-lost', dispose); claim();
  let settings, pending, lastURL = '', running = false, themeObserved = false, tabPaused = false, settingsRevision = 0;
  const homeFeed = window.top === window ? new IntentHome() : null;
  const watchFeed = window.top === window ? new IntentHome(chrome.runtime, 'watch') : null;
  const toolbar = window.top === window ? new IntentToolbar(chrome.runtime, {
    onSettings: value => { settingsRevision++; applySettings(value); schedule(); },
    onRefresh: () => Promise.all([homeFeed?.refreshFeed(), watchFeed?.refreshFeed()])
  }) : null;
  let topicBadge, topicContext, topicSignature = '', topicGeneration = 0, topicTimer, topicNavigationTimer, topicNavigating = false, topicScriptRevision = 0;
  const topicResults = new Map(), topicInlineScripts = new WeakMap(), topicInlineVideos = new Map(), topicInlineMisses = new Map();
  function currentTopicVideoId() {
    if (location.hostname.startsWith('music.')) return '';
    const url = new URL(location.href);
    const id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/shorts\/([\w-]{11})(?:\/|$)/)?.[1];
    return /^[\w-]{11}$/.test(id || '') ? id : '';
  }
  function topicConfig() {
    return JSON.stringify([settings?.mode, settings?.intentDescriptions, settings?.customIntents, settings?.customTopics, settings?.channels, settings?.intentNames, settings?.countModes, settings?.matchOnlyModes]);
  }
  function clearVideoTopic() {
    clearTimeout(topicTimer); topicTimer = null; topicGeneration++; topicSignature = ''; topicContext = null;
    topicBadge?.remove(); topicBadge = null;
  }
  function startTopicNavigation() {
    topicNavigating = true; clearVideoTopic(); clearTimeout(topicNavigationTimer);
    // A cancelled YouTube navigation must not leave its previous title unlabelled forever.
    topicNavigationTimer = setTimeout(() => {topicNavigating = false; schedule();}, 5000);
  }
  function visibleTopicRoot(selector) {
    return [...document.querySelectorAll(selector)].filter(node => !node.closest('[hidden]') && getComputedStyle(node).display !== 'none');
  }
  function inlineTopicVideo(id) {
    const feed = globalThis.IntentFeed;
    if (!feed?.initialData) return null;
    if (topicInlineVideos.has(id)) return topicInlineVideos.get(id);
    if (topicInlineMisses.get(id) === topicScriptRevision) return null;
    // Parse only bootstrap player JSON already present in the page. Repeated
    // DOM scans reuse each unchanged script instead of reparsing large pages.
    for (const script of [...document.scripts].slice(0, 200)) {
      const source = script.textContent || '';
      if (!source || source.length > 8000000 || topicInlineScripts.get(script) === source) continue;
      topicInlineScripts.set(script, source);
      if (!source.includes('ytInitialPlayerResponse')) continue;
      try {
        const details = feed.initialData(source, true)?.videoDetails;
        if (!/^[\w-]{11}$/.test(details?.videoId || '')) continue;
        topicInlineVideos.set(details.videoId, details);
        if (topicInlineVideos.size > 12) topicInlineVideos.delete(topicInlineVideos.keys().next().value);
      } catch { /* An unrelated or unfinished inline script is not video metadata. */ }
    }
    const result = topicInlineVideos.get(id) || null;
    if (!result) {
      topicInlineMisses.set(id, topicScriptRevision);
      if (topicInlineMisses.size > 24) topicInlineMisses.delete(topicInlineMisses.keys().next().value);
    }
    return result;
  }
  function changedTopicScripts(records) {
    const scriptTree = node => node.nodeType === Node.ELEMENT_NODE && (node.tagName === 'SCRIPT' || node.querySelector('script'));
    return records.some(record => record.type === 'characterData' ? record.target.parentElement?.tagName === 'SCRIPT'
      : record.type === 'childList' && (record.target.nodeName === 'SCRIPT' || [...record.addedNodes, ...record.removedNodes].some(scriptTree)));
  }
  function readTopicVideo(id) {
    const short = location.pathname.startsWith('/shorts/');
    const roots = visibleTopicRoot(short ? 'ytd-reel-video-renderer,ytm-reel-video-renderer' : 'ytd-watch-flexy');
    let root = roots.find(node => node.getAttribute('video-id') === id || node.getAttribute('data-video-id') === id);
    if (!root && short) root = roots.find(node => node.hasAttribute('is-active') || node.hasAttribute('active'));
    if (!root) root = roots.find(node => !node.hasAttribute('video-id') && !node.hasAttribute('data-video-id'));
    if (!root && short) root = visibleTopicRoot('ytd-shorts,ytm-shorts')[0];
    if (!root) return null;
    const declared = root.getAttribute('video-id') || root.getAttribute('data-video-id');
    if (declared && declared !== id) return null;
    const selectors = short ? 'h2,#title,.yt-reel-metapanel-view-model__title,.reel-player-header-title' : '#above-the-fold #title h1,ytd-watch-metadata h1,#info-contents h1,h1,h2';
    const title = [...root.querySelectorAll(selectors)].find(node => !node.closest('#related,#secondary,ytd-player,#player,.html5-video-player,[hidden]') && node.textContent.trim());
    if (!title) return null;
    const player = inlineTopicVideo(id);
    // An explicit identity takes precedence during SPA transitions; otherwise a
    // stale canonical link is evidence that the old title is still on screen.
    if (!declared && !player) {
      const canonical = document.querySelector('link[rel="canonical"]')?.href;
      if (canonical) {try {const prior = new URL(canonical); const oldId = prior.pathname === '/watch' ? prior.searchParams.get('v') : prior.pathname.split('/shorts/')[1]; if (oldId && oldId !== id) return null;} catch {}}
    }
    const currentText = selector => [...root.querySelectorAll(selector)].find(node => !node.closest('#related,#secondary,ytd-player,#player,.html5-video-player,[hidden]'))?.textContent?.trim() || '';
    const description = player?.shortDescription || currentText('#description-inline-expander #attributed-snippet-text,#description-inline-expander,#description ytd-text-inline-expander,#description,.yt-reel-metapanel-view-model__description');
    const titleText = player?.title || title.textContent.trim();
    const tags = globalThis.IntentFeed?.hashtags?.(titleText + ' ' + description) || [];
    return {title: title.closest('h1,h2') || title, video: {id, title: String(titleText).slice(0, 500), description: String(description).slice(0, 1800), channel: String(player?.author || currentText('#owner #channel-name a,#channel-name a,ytd-channel-name a,a[href^="/@"]')).slice(0, 200), hashtags: tags.slice(0, 30), keywords: (Array.isArray(player?.keywords) ? player.keywords : []).filter(value => typeof value === 'string').slice(0, 30).map(value => value.slice(0, 100))}};
  }
  function renderVideoTopic(result) {
    if (!topicContext?.title?.isConnected) return;
    if (!topicBadge) {
      topicBadge = document.createElement('span'); topicBadge.id = 'intent-video-topic'; topicBadge.setAttribute('role', 'note');
    }
    const status = ['checking', 'matching', 'unrelated', 'uncertain', 'unavailable'].includes(result?.status) ? result.status : 'uncertain';
    const modes = C.modes(settings), intent = modes[settings.mode]?.name || 'your intent';
    const categoryIds = [...new Set(Array.isArray(result?.categoryIds) ? result.categoryIds : [result?.categoryId])].filter(id => typeof id === 'string' && Object.hasOwn(modes, id)).slice(0, 2);
    const category = categoryIds.map(id => modes[id].name).join(' · ');
    const label = status === 'checking' ? 'Checking topic…' : status === 'unavailable' ? 'Topic unavailable' : !category ? 'Topic uncertain' : status === 'uncertain' || categoryIds.length > 1 ? `Likely ${category}` : status === 'unrelated' ? `${category} · Outside ${intent}` : `Topic: ${category}`;
    const relation = status === 'checking' ? `Checking this video's metadata against ${intent}.` : status === 'unavailable' ? 'The local topic check could not run. Retry when ready; your timer rule is unchanged.' : status === 'matching' ? `This video appears to match ${intent}.` : status === 'unrelated' ? `This video appears to be outside ${intent}.` : `This video's relation to ${intent} is uncertain.`;
    const detail = relation + (categoryIds.length > 1 ? ' Several configured topics overlap.' : '') + ' Local metadata estimate; the video itself is not watched or listened to.';
    if (status === 'unavailable') {
      if (topicBadge.dataset.state !== 'unavailable' || !topicBadge.querySelector('button')) {
        topicBadge.textContent = label;
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry'; retry.setAttribute('aria-label', 'Retry topic check');
        retry.style.cssText = 'margin-inline-start:8px;padding:0;border:0;background:transparent;color:inherit;text-decoration:underline;font:inherit;cursor:pointer';
        retry.addEventListener('click', () => {if (!topicContext || tabPaused || settings?.mode === 'off') return; topicResults.delete(topicSignature); clearVideoTopic(); schedule();});
        topicBadge.append(retry);
      }
    } else if (topicBadge.textContent !== label) topicBadge.textContent = label;
    if (topicBadge.title !== detail) topicBadge.title = detail;
    if (topicBadge.getAttribute('aria-label') !== label + '. ' + detail) topicBadge.setAttribute('aria-label', label + '. ' + detail);
    topicBadge.dataset.state = status; topicBadge.dataset.videoId = topicContext.video.id; topicBadge.dataset.theme = IntentHome.theme();
    if (topicBadge.previousElementSibling !== topicContext.title) topicContext.title.insertAdjacentElement('afterend', topicBadge);
  }
  function acceptVideoTopic(state) {
    const result = state?.videoTopic;
    if (!topicContext || topicNavigating || tabPaused || settings?.mode === 'off' || result?.videoId !== topicContext.video.id || result.videoId !== currentTopicVideoId()) return;
    if (!['checking', 'matching', 'unrelated', 'uncertain', 'unavailable'].includes(result.status)) return;
    topicContext.result = result; renderVideoTopic(result);
    if (!['checking', 'unavailable'].includes(result.status)) {
      topicResults.set(topicSignature, {at: Date.now(), result: {...result}});
      if (topicResults.size > 24) topicResults.delete(topicResults.keys().next().value);
    }
  }
  function syncVideoTopic() {
    const id = currentTopicVideoId();
    if (window.top !== window || !settings || settings.mode === 'off' || tabPaused || topicNavigating || !id || settings.hideShorts && location.pathname.startsWith('/shorts/')) {
      if (topicContext || topicBadge || topicTimer) clearVideoTopic();
      return;
    }
    const current = readTopicVideo(id);
    if (!current) {if (topicContext || topicBadge || topicTimer) clearVideoTopic(); return;}
    const config = topicConfig(), signature = JSON.stringify([config, current.video]);
    if (signature === topicSignature) {
      const previousResult = topicContext?.result;
      topicContext = current; topicContext.result = previousResult;
      const cached = topicResults.get(signature);
      renderVideoTopic(cached?.result || topicContext.result || {status: 'checking'});
      return;
    }
    clearVideoTopic(); topicSignature = signature; topicContext = current;
    const generation = topicGeneration, cached = topicResults.get(signature), pageURL = location.href;
    if (cached && Date.now() - cached.at < 600000) renderVideoTopic(cached.result);
    else renderVideoTopic({status: 'checking'});
    topicTimer = setTimeout(async () => {
      topicTimer = null;
      const revision = settingsRevision;
      try {
        const state = await chrome.runtime.sendMessage({type: 'CHECK_TIMER_VIDEO', pageURL, video: current.video});
        if (generation !== topicGeneration || signature !== topicSignature || config !== topicConfig() || id !== currentTopicVideoId() || topicNavigating || tabPaused || settings?.mode === 'off') return;
        if (state?.paused || state?.tabPaused) {setTabPaused(true); clearVideoTopic(); return;}
        if (state?.stale) {clearVideoTopic(); if (state.settings && revision === settingsRevision) applySettings(state.settings); return;}
        if (!state?.ok) throw new Error('Topic check unavailable');
        if (revision === settingsRevision) toolbar?.updateTimer?.(state);
        if (state.blocked && revision === settingsRevision) {document.querySelectorAll('video,audio').forEach(media => media.pause()); location.replace(chrome.runtime.getURL('blocked.html')); return;}
        if (state.videoTopic?.videoId !== id) throw new Error('Topic check unavailable');
        acceptVideoTopic(state);
      } catch {
        if (generation === topicGeneration && signature === topicSignature && id === currentTopicVideoId()) {
          const unavailable = {videoId: id, status: 'unavailable', categoryId: null, categoryIds: []};
          topicContext.result = unavailable; renderVideoTopic(unavailable);
        }
      }
    }, 350);
  }
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
    const previousTopic = topicConfig();
    settings = C.sanitize(value);
    if (previousTopic !== topicConfig() || settings.mode === 'off' || tabPaused || settings.hideShorts && location.pathname.startsWith('/shorts/')) clearVideoTopic();
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
      clearVideoTopic();
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
    if (topicBadge) topicBadge.dataset.theme = IntentHome.theme();
    if (window.top === window) heartbeat();
  }
  function observeTheme() {
    if (themeObserved || !document.documentElement) return;
    themeObserved = true;
    mutations(refreshTheme).observe(document.documentElement, {attributes: true, attributeFilter: ['dark', 'data-theme', 'style']});
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
    if (!alive()) {dispose(); return;}
    if (!settings || !document.documentElement) return;
    syncTopicGuard();
    observeTheme();
    const home = isHome(), watch = isWatch();
    syncVideoTopic();
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
  function schedule() { if (!alive()) {dispose(); return;} if (!pending) pending = setTimeout(scan, 120); }
  async function heartbeat() {
    if (!alive()) {dispose(); return;}
    if (running) return;
    running = true;
    const revision = settingsRevision;
    try {
      const playing = !tabPaused && [...document.querySelectorAll('video,audio')].some(m => !m.paused && !m.ended && m.readyState > 1);
      const state = await chrome.runtime.sendMessage({type: 'HEARTBEAT', playing, ...(window.top === window ? {appearance: IntentHome.theme()} : {})});
      if (!alive()) {dispose(); return;}
      if (state?.ok) {
        // A popup/toolbar change can arrive while an earlier snapshot is in flight.
        // Never let that older response undo a newer pause or intent selection.
        if (revision !== settingsRevision) return;
        toolbar?.updateTimer?.(state); acceptVideoTopic(state);
        if (tabPaused !== (state.tabPaused === true)) {setTabPaused(state.tabPaused); schedule();}
        if (JSON.stringify(settings) !== JSON.stringify(state.settings)) { applySettings(state.settings); schedule(); }
        if (state.blocked) {
          document.querySelectorAll('video,audio').forEach(m => m.pause());
          location.replace(chrome.runtime.getURL('blocked.html'));
        }
      }
    } catch (error) { if (!alive() || /context invalidated/i.test(error.message || '')) dispose(); }
    finally { running = false; if (alive() && revision !== settingsRevision) queueMicrotask(heartbeat); }
  }
  const messageListener = (message, sender, respond) => {
    if (message.type === 'INTENT_PING') {respond?.({ok: alive(), contextValid: alive()}); return;}
    if (!alive()) {dispose(); return;}
    if (message.type === 'SETTINGS') {
      settingsRevision++;
      if (message.reset) {homeFeed?.destroy(); watchFeed?.destroy();}
      setTabPaused(message.tabPaused);
      applySettings(message.settings);
      if (tabPaused || !settings.hideShorts) {filterShortsNavigation(); restoreShortsGate();}
      heartbeat();
      schedule();
    }
  };
  chrome.runtime.onMessage.addListener(messageListener);
  mutations(records => {
    if (changedTopicScripts(records)) topicScriptRevision++;
    if (topicContext && topicContext.video.id !== currentTopicVideoId()) clearVideoTopic();
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
  listen(document, 'click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
    const link = event.composedPath().find(node => node instanceof HTMLAnchorElement);
    if (!link || link.target && link.target !== '_self' || link.hasAttribute('download')) return;
    try { const url = new URL(link.href); if (url.origin === location.origin && url.pathname === '/') armHomePending(); } catch {}
  }, true);
  listen(document, 'yt-navigate-start', event => {
    startTopicNavigation();
    const url = navigationDestination(event);
    if (!url || url.origin === location.origin && url.pathname === '/') armHomePending();
    else clearHomePending();
  });
  listen(document, 'yt-navigate-finish', () => {
    lastURL = location.href;
    clearTimeout(topicNavigationTimer); topicNavigating = false;
    syncTopicGuard();
    if (pending) {clearTimeout(pending); pending = null;}
    scan();
    // Navigation has settled: unsupported layouts keep their native content.
    if (settings && (!isHome() || !homeFeed?.host?.isConnected)) clearHomePending();
  });
  listen(window, 'popstate', () => {startTopicNavigation(); syncTopicGuard(); if (isHome()) armHomePending(); else clearHomePending(); schedule();});
  if (isHome()) armHomePending(true);
  listen(document, 'intent-feed-state-change', schedule);
  listen(window, 'resize', schedule, {passive: true});
  // Theme changes do not require a reload or another network/model request.
  observeTheme();
  listen(matchMedia('(prefers-color-scheme: dark)'), 'change', refreshTheme);
  listen(document, 'play', () => { shortsGateIfReady(); heartbeat(); }, true);
  listen(document, 'pause', heartbeat, true);
  listen(document, 'visibilitychange', heartbeat);
  function shortsGateIfReady() { if (settings) shortsGate(); }
  every(() => {
    if (location.href !== lastURL) {const changed = Boolean(lastURL); lastURL = location.href; if (changed) clearVideoTopic(); schedule();}
    heartbeat();
  }, 5000);
  heartbeat();
})();
