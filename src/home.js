/* Filled intent feeds for Home and the recommendations beside a watched video. */
(() => {
  const C = IntentCore, F = IntentFeed;
  class Home {
    constructor(runtime = chrome.runtime, surface = 'home') {
      this.runtime = runtime; this.surface = surface === 'watch' ? 'watch' : 'home';
      this.nativeMarker = `data-intent-native-${this.surface}`;
      this.pageMarker = this.surface === 'watch' ? 'data-intent-watch-feed' : 'data-intent-feed';
      this.generation = 0; this.signature = ''; this.items = []; this.round = 0; this.busy = false; this.nativeElements = new Set(); this.nativeSurfaces = new Map(); this.spacingElements = new Set(); this.regularCards = [];
    }
    static theme() {
      const html = document.documentElement;
      if (!html) return 'light';
      const background = getComputedStyle(html).getPropertyValue('--yt-spec-base-background').trim();
      const explicit = html.getAttribute('data-theme');
      let dark = html.hasAttribute('dark') || explicit === 'dark';
      // YouTube's explicit light theme takes precedence over the OS setting.
      if (!dark && explicit !== 'light' && !background && !['www.youtube.com', 'youtube.com'].includes(location.hostname)) dark = matchMedia('(prefers-color-scheme: dark)').matches;
      return dark ? 'dark' : 'light';
    }
    updateTheme() {
      const theme = Home.theme();
      if (this.host && this.host.dataset.theme !== theme) this.host.dataset.theme = theme;
    }
    sync(settings, active) {
      if (!active || settings.mode === 'off') { this.destroy(); return; }
      this.settings = settings;
      const renderers = [...document.querySelectorAll(this.surface === 'watch' ? 'ytd-watch-flexy' : 'ytd-browse')]
        .filter(node => !node.closest('[hidden]') && getComputedStyle(node).display !== 'none');
      const renderer = this.surface === 'watch' ? renderers[0]
        : renderers.find(node => node.getAttribute('page-subtype') === 'home') || renderers.find(node => !node.hasAttribute('page-subtype'));
      const primary = this.surface === 'watch'
        ? renderer?.querySelector('#secondary #related') || renderer?.querySelector('#below #related') || renderer?.querySelector('#related')
        : renderer?.querySelector('#primary');
      if (!primary) { this.destroy(); return; }
      if (!this.host) this.create();
      this.primary = primary; this.renderer = renderer;
      if (this.host.parentElement !== primary) {
        // YouTube moves or replaces the related container at responsive breakpoints.
        this.restoreNative();
        primary.prepend(this.host);
      }
      this.syncNative(primary);
      this.updateTheme();
      if (this.surface === 'home') {
        if (!this.observing) {this.resizeObserver.observe(this.host); this.observing = true;}
        // Use the native grid's chosen column count, without adding an outer gutter or width cap.
        const native = primary.querySelector('ytd-rich-grid-renderer');
        const measuredWidth = native?.getBoundingClientRect().width || 0;
        const columns = measuredWidth >= primary.getBoundingClientRect().width * .8 && measuredWidth >= 120 && parseInt(getComputedStyle(native).getPropertyValue('--ytd-rich-grid-items-per-row'), 10);
        if (columns >= 1 && columns <= 12 && (columns > 1 || measuredWidth < 640)) { this.host.style.setProperty('--intent-grid-columns', columns); this.host.dataset.nativeColumns = ''; }
        else if (!this.host.hasAttribute('data-native-columns')) this.host.style.removeProperty('--intent-grid-columns');
      }
      else this.matchWatchThumbnail(primary);
      document.documentElement.setAttribute(this.pageMarker, '');
      if (this.surface === 'home') this.collapseEmptySpacing(renderer, primary);
      // Bootstrap JSON can be large. Read it once per renderer/navigation rather
      // than reparsing it on every coalesced DOM update.
      const localeSource = `${location.href}\n${document.documentElement.lang}`;
      if (!this.locale || this.localeSource !== localeSource || this.localeRenderer !== renderer) {
        this.locale = F.pageLocale(document); this.localeSource = localeSource; this.localeRenderer = renderer;
      }
      const locale = this.locale;
      const signature = F.key(settings, locale);
      const videoId = this.surface === 'watch' ? new URL(location.href).searchParams.get('v') || '' : '';
      if (signature !== this.signature || videoId !== this.videoId) {
        this.signature = signature; this.locale = locale; this.videoId = videoId; this.round = 0; this.restart(false);
      }
      this.layoutHome(); this.syncRecommendations();
    }
    syncNative(primary) {
      for (const child of this.nativeElements) if (child.parentElement !== primary) {
        this.restoreSurface(child); child.removeAttribute(this.nativeMarker); this.nativeElements.delete(child);
      }
      const rect = primary.getBoundingClientRect(), top = Math.max(0, document.querySelector('ytd-masthead')?.getBoundingClientRect().bottom || 56);
      for (const child of primary.children) if (child !== this.host) {
        if (!child.hasAttribute(this.nativeMarker)) {
          child.setAttribute(this.nativeMarker, ''); this.nativeElements.add(child);
          if (this.surface === 'home') child.querySelectorAll('video,audio').forEach(m => m.pause());
        }
        if (rect.width < 120 || !child.matches('ytd-rich-grid-renderer,ytd-watch-next-secondary-results-renderer') && !child.querySelector('ytd-rich-item-renderer,ytd-compact-video-renderer,yt-lockup-view-model,ytd-continuation-item-renderer')) continue;
        let saved = this.nativeSurfaces.get(child);
        if (!saved) {
          saved = {styles: new Map(), hadStyle: child.hasAttribute('style'), inert: child.hasAttribute('inert'), aria: child.getAttribute('aria-hidden')}; this.nativeSurfaces.set(child, saved);
        }
        // display:none makes YouTube's responsive/virtualized renderer collapse
        // and sometimes discard its cards. Keep its real width, out of flow and
        // invisible/inert, so native recommendations remain available to filter.
        const properties = {visibility:'hidden',opacity:'0','pointer-events':'none',position:'fixed',left:`${rect.left}px`,top:`${top}px`,width:`${rect.width}px`,'max-width':'none',height:`${Math.max(1, innerHeight - top)}px`,overflow:'hidden','z-index':'-1',display:'block'};
        for (const [name, value] of Object.entries(properties)) {
          if (!saved.styles.has(name)) saved.styles.set(name, [child.style.getPropertyValue(name), child.style.getPropertyPriority(name)]);
          if (child.style.getPropertyValue(name) !== value || child.style.getPropertyPriority(name) !== 'important') child.style.setProperty(name, value, 'important');
        }
        child.setAttribute('data-intent-recommendation-source',''); child.setAttribute('inert',''); child.setAttribute('aria-hidden','true');
      }
    }
    restoreSurface(child) {
      const saved = this.nativeSurfaces.get(child); if (!saved) return;
      for (const [name, [value, priority]] of saved.styles) {if (value) child.style.setProperty(name,value,priority); else child.style.removeProperty(name);}
      if (!saved.hadStyle && !child.getAttribute('style')?.trim()) child.removeAttribute('style');
      if (!saved.inert) child.removeAttribute('inert');
      if (saved.aria === null) child.removeAttribute('aria-hidden'); else child.setAttribute('aria-hidden',saved.aria);
      child.removeAttribute('data-intent-recommendation-source'); this.nativeSurfaces.delete(child);
    }
    create() {
      this.host = document.createElement('section'); this.host.id = `intent-${this.surface}-feed`; this.host.dataset.surface = this.surface;
      const root = this.host.attachShadow({mode: 'open'});
      if(globalThis.IntentNativeCards)this.nativeCards=new IntentNativeCards(this.host,this.surface);
      const style = document.createElement('style'); style.textContent = globalThis.IntentFeedTheme || '';
      this.title = document.createElement('h1'); this.title.className = 'sr-only';
      this.title.id = 'feed-heading';
      const section = (id, label, path) => {
        const node = document.createElement('section'); node.className = 'source-section'; node.setAttribute('aria-labelledby', id);
        const header = document.createElement('div'); header.className = 'source-header';
        const heading = document.createElement('h2'); heading.id = id; heading.className = 'source-title';
        const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); symbol.setAttribute('viewBox', '0 0 24 24'); symbol.setAttribute('aria-hidden', 'true');
        const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path'); shape.setAttribute('d', path); symbol.append(shape);
        const name = document.createElement('span'); name.textContent = label; heading.append(symbol, name);
        const actions = document.createElement('div'); actions.className = 'source-actions'; header.append(heading, actions); node.append(header); return {node, header, actions};
      };
      const recommended = section(`${this.surface}-recommended-heading`, 'Your recommendations', 'M12 3 14.5 9.5 21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z');
      this.recommendedSection = recommended.node; this.recommendedSection.title = 'Videos already recommended by YouTube, filtered on your device to match your intent.'; this.recommendedSection.hidden = true; this.recommendedActions = recommended.actions;
      this.recommendedGrid = document.createElement('div'); this.recommendedGrid.className = 'grid recommended-grid'; this.recommendedGrid.setAttribute('aria-label', 'Matching YouTube recommendations');
      this.recommendedShorts = document.createElement('section'); this.recommendedShorts.className = 'recommended-shorts'; this.recommendedShorts.hidden = true; this.recommendedShorts.setAttribute('aria-label', 'Recommended Shorts');
      const shortNav = document.createElement('div'); shortNav.className = 'recommended-short-navigation';
      this.recommendedShortGrid = document.createElement('div'); this.recommendedShortGrid.className = 'recommended-short-grid'; this.recommendedShortGrid.tabIndex = 0;
      for (const [direction, label, glyph] of [[-1, 'left', '‹'], [1, 'right', '›']]) {
        const arrow = document.createElement('button'); arrow.className = 'recommended-short-arrow'; arrow.textContent = glyph; arrow.type = 'button'; arrow.setAttribute('aria-label', `Scroll recommended Shorts ${label}`);
        arrow.onclick = () => this.recommendedShortGrid.scrollBy({left: direction * Math.max(160, this.recommendedShortGrid.clientWidth * .8), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); shortNav.append(arrow);
      }
      this.recommendedShorts.append(shortNav, this.recommendedShortGrid); this.recommendedSection.append(this.recommendedGrid, this.recommendedShorts);
      const discover = section(`${this.surface}-discovery-heading`, 'Discover more', 'M21 21l-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z');
      this.discoverySection = discover.node; this.discoveryActions = discover.actions;
      this.recommendedMore = document.createElement('button'); this.recommendedMore.type = 'button'; this.recommendedMore.className = 'recommended-more'; this.recommendedMore.textContent = 'Find more recommendations';
      this.recommendedMore.title = 'Checks more loaded recommendations and asks YouTube for another batch when available.'; this.recommendedMore.onclick = () => this.moreRecommendations();
      this.discoveryActions.append(this.recommendedMore);
      this.recommendedMessage = document.createElement('p'); this.recommendedMessage.className = 'recommended-feedback'; this.recommendedMessage.setAttribute('role', 'status');
      const discovery = document.createElement('p'); discovery.className = 'discovery'; discovery.textContent = 'YouTube search · Filtered locally';
      discovery.title = 'Videos found through public YouTube searches, filtered on your device to match your selected intent.';
      discovery.style.cssText = 'margin:0 0 2px;font-size:11px;line-height:16px;color:var(--yt-spec-text-secondary,var(--intent-muted))';
      this.status = document.createElement('div'); this.status.className = 'status'; this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
      this.grid = document.createElement('div'); this.grid.className = 'grid first-grid'; this.grid.setAttribute('aria-label', 'Videos for your intent');
      this.shortShelf = document.createElement('section'); this.shortShelf.className = 'shorts-shelf'; this.shortShelf.hidden = true; this.shortShelf.setAttribute('aria-label', 'Shorts for your intent');
      const shortHeader = document.createElement('div'); shortHeader.className = 'shorts-header';
      const shortTitle = document.createElement('h2'); shortTitle.textContent = 'Shorts';
      this.shortGrid = document.createElement('div'); this.shortGrid.className = 'shorts-grid'; this.shortGrid.id = `${this.surface}-shorts-list`; this.shortGrid.tabIndex = 0; this.shortGrid.setAttribute('aria-label', 'Short videos');
      const navigation = document.createElement('div'); navigation.className = 'shorts-navigation'; navigation.setAttribute('role', 'group'); navigation.setAttribute('aria-label', 'Browse Shorts');
      this.shortPrevious = document.createElement('button'); this.shortPrevious.className = 'shorts-arrow'; this.shortPrevious.textContent = '‹'; this.shortPrevious.setAttribute('aria-label', 'Scroll Shorts left');
      this.shortNext = document.createElement('button'); this.shortNext.className = 'shorts-arrow'; this.shortNext.textContent = '›'; this.shortNext.setAttribute('aria-label', 'Scroll Shorts right');
      for (const button of [this.shortPrevious, this.shortNext]) {button.type = 'button'; button.setAttribute('aria-controls', this.shortGrid.id);}
      this.shortPrevious.addEventListener('click', () => this.scrollShorts(-1));
      this.shortNext.addEventListener('click', () => this.scrollShorts(1));
      this.shortGrid.addEventListener('scroll', () => this.updateShortArrows(), {passive: true});
      this.shortGrid.addEventListener('keydown', event => {
        if (event.target !== this.shortGrid || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault(); this.scrollShorts(event.key === 'ArrowLeft' ? -1 : 1);
      });
      navigation.append(this.shortPrevious, this.shortNext); shortHeader.append(shortTitle, navigation);
      this.shortShelf.append(shortHeader, this.shortGrid);
      this.restGrid = document.createElement('div'); this.restGrid.className = 'grid rest-grid'; this.restGrid.hidden = true; this.restGrid.setAttribute('aria-label', 'More videos for your intent');
      if (this.surface === 'home') this.resizeObserver = new ResizeObserver(() => this.layoutHome());
      this.more = document.createElement('button'); this.more.className = 'more'; this.more.textContent = 'Find more videos'; this.more.hidden = true;
      this.more.addEventListener('click', () => this.restartRequired ? this.restart(true) : this.load(false, false));
      this.endState = document.createElement('p'); this.endState.className = 'note discovery-end'; this.endState.hidden = true; this.endState.setAttribute('role', 'status');
      this.endMessage = document.createElement('span');
      this.endSearch = document.createElement('a'); this.endSearch.className = 'search'; this.endSearch.textContent = 'Search YouTube'; this.endSearch.style.marginInline = '8px';
      const adjust = document.createElement('button'); adjust.type = 'button'; adjust.textContent = 'Adjust intent'; adjust.style.marginTop = '8px';
      adjust.addEventListener('click', () => this.runtime.sendMessage({type: 'OPEN_SETTINGS'}).catch(() => {}));
      this.endState.append(this.endMessage, this.endSearch, adjust);
      const note = document.createElement('p'); note.className = 'note'; note.textContent = 'Public YouTube searches, analysed locally using titles, available descriptions and hashtags. The topic model is bundled with Intent; this does not change your YouTube recommendation algorithm.';
      this.discoveryActions.append(this.recommendedMessage);
      this.discoverySection.append(discovery, this.status, this.grid, this.shortShelf, this.restGrid, this.more, this.endState, note);
      root.append(style, this.title, this.recommendedSection, this.discoverySection);
    }
    collapseEmptySpacing(renderer, primary) {
      // YouTube sometimes removes the chip renderer but leaves its fixed-height
      // wrappers behind. Only known, otherwise empty Home chrome can be collapsed.
      const meaningful = node => {
        if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent.trim());
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        if (node.matches('[hidden],[aria-hidden="true"],script,style,template,ytd-feed-filter-chip-bar-renderer,yt-chip-cloud-renderer')) return false;
        const style = getComputedStyle(node);
        if ((style.display === 'none' && !node.hasAttribute('data-intent-empty-home-spacing')) || style.visibility === 'hidden') return false;
        if (node.matches('img,video,audio,canvas,svg,iframe,button,input,select,textarea,a[href],[role="button"],[role="link"],[contenteditable="true"]')) return true;
        return [...node.childNodes].some(meaningful);
      };
      const next = new Map();
      for (const node of renderer.querySelectorAll('#header,#chips-wrapper,#chip-bar,#filter-chip-bar,#frosted-glass')) {
        if (primary.contains(node) || node.contains(primary)) continue;
        if (![...node.childNodes].some(meaningful)) next.set(node, 'data-intent-empty-home-spacing');
      }
      // Current YouTube nests this decoration under #content. Retain only the
      // part behind the actual masthead; the empty chip-bar portion covers cards.
      const masthead = document.querySelector('ytd-masthead:not([hidden])');
      const mastheadBottom = masthead?.getBoundingClientRect().bottom;
      for (const node of document.querySelectorAll('ytd-app #frosted-glass')) {
        if (![...node.childNodes].some(meaningful)) {
          next.set(node, 'data-intent-home-glass');
          if (Number.isFinite(mastheadBottom)) node.style.setProperty('--intent-masthead-glass-height', `${Math.max(0, mastheadBottom - node.getBoundingClientRect().top)}px`);
        }
      }
      for (const node of this.spacingElements) if (!next.has(node)) {
        node.removeAttribute('data-intent-empty-home-spacing'); node.removeAttribute('data-intent-home-glass');
        node.style.removeProperty('--intent-masthead-glass-height');
      }
      this.spacingElements = new Set(next.keys());
      for (const [node, marker] of next) if (!node.hasAttribute(marker)) node.setAttribute(marker, '');
    }
    matchWatchThumbnail(primary) {
      const selector = 'ytd-compact-video-renderer ytd-thumbnail,ytd-compact-video-renderer a#thumbnail,yt-lockup-view-model .yt-lockup-view-model__content-image';
      for (const thumbnail of primary.querySelectorAll(selector)) {
        if(thumbnail.closest('#intent-home-feed,#intent-watch-feed'))continue;
        const computed = getComputedStyle(thumbnail).width;
        const width = thumbnail.getBoundingClientRect().width || (/^[\d.]+px$/.test(computed) ? parseFloat(computed) : 0);
        if (width >= 100 && width <= 320) {this.watchThumbnailWidth = width; break;}
      }
      if (this.watchThumbnailWidth) this.host.style.setProperty('--intent-watch-thumbnail-width', `${this.watchThumbnailWidth}px`);
    }
    restart(fresh) {
      this.nativePagination?.cancel(); this.nativeCards?.reset(); this.nativePool = new Map(); this.nativeChecked = new Map(); this.nativeNodes = new Map(); this.nativeScanned = new WeakMap(); this.nativeTotalChecked = 0; this.recommendedItems = []; this.nativeLimit = 96; this.nativeJob = null; this.nativeMoreBusy = false; this.nativeRetryAt = 0;
      this.recommendedSection.hidden = true; this.recommendedGrid.replaceChildren(); this.recommendedShortGrid.replaceChildren(); this.recommendedMore.disabled = false; this.recommendedMessage.textContent = 'No matching recommendations yet.'; this.recommendedMore.textContent = 'Find more recommendations'; this.discoveryActions.append(this.recommendedMore,this.recommendedMessage);
      this.generation++; this.items = []; this.cursor = 0; this.pageCursor = null; this.hasMore = true; this.busy = false; this.autoBatches = 0; this.loadFailed = false; this.restartRequired = false; this.endReason = '';
      this.endState.hidden = true; this.more.textContent = 'Find more videos';
      this.metadataStats = {requests: 0, checked: 0, cacheHits: 0, sharedRequests: 0, failed: 0, remaining: 0}; this.hasMetadataStats = false;
      this.title.textContent = this.surface === 'watch' ? `${C.modes(this.settings)[this.settings.mode].name} recommendations` : `◒ ${C.modes(this.settings)[this.settings.mode].name}, with intent.`;
      this.host.setAttribute('aria-label', `${C.modes(this.settings)[this.settings.mode].name} videos`);
      this.regularCards = []; this.grid.hidden = false; this.grid.replaceChildren(); this.restGrid.replaceChildren(); this.restGrid.hidden = true; this.shortGrid.replaceChildren(); this.shortShelf.hidden = true; this.more.hidden = true;
      this.syncRecommendations(); return this.load(fresh, true);
    }
    refreshFeed() {
      if (!this.host?.isConnected || !this.signature) return;
      this.round++; return this.restart(true);
    }
    setFeedState(state) {
      if (this.feedState === state) return;
      this.feedState = state;
      document.dispatchEvent(new Event('intent-feed-state-change'));
    }
    async load(fresh, auto) {
      if (this.busy || !this.hasMore || this.items.length >= 120) return;
      const generation = this.generation, signature = this.signature;
      this.busy = true; this.more.disabled = true; this.loadFailed = false; this.more.textContent = 'Find more videos';
      this.setFeedState(this.items.length || this.recommendedItems?.length ? 'active' : 'loading');
      this.status.className = 'status'; this.status.textContent = (this.items.length ? 'Finding more videos for your intent…' : 'Finding videos and analysing topics locally…') + (this.settings.metadataLimit ? ` Up to ${this.settings.metadataLimit} extra video-page requests per batch.` : ' Fuller checks are off.');
      this.status.removeAttribute('title');
      this.grid.setAttribute('aria-busy', 'true');
      this.grid.querySelector('.empty')?.remove();
      try {
        let timer;
        const response = await Promise.race([
          this.runtime.sendMessage({type: 'GET_FEED', key: signature, locale: this.locale, cursor: this.cursor, pageCursor: this.pageCursor, round: this.round, fresh, exclude: [...this.items.map(v => v.id), ...(this.recommendedItems || []).map(v => v.id), ...(this.videoId ? [this.videoId] : [])]}),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The feed took too long to load. Try refreshing or lowering the fuller-check limit in settings.')), 180000); })
        ]).finally(() => clearTimeout(timer));
        if (generation !== this.generation) return;
        if (!response?.ok) throw new Error(response?.error || 'The feed could not be loaded.');
        if (response.blocked) { location.replace(this.runtime.getURL('blocked.html')); return; }
        if (response.stale || response.key !== signature) throw new Error('Your mode changed while loading. Refresh the feed to try again.');
        const seen = new Set([...this.items.map(v => v.id), ...(this.recommendedItems || []).map(v => v.id), ...(this.videoId ? [this.videoId] : [])]);
        for (const video of response.items || []) if (this.items.length < 120 && /^[\w-]{11}$/.test(video.id) && !seen.has(video.id) && C.classify(video, response.semantic ? {...this.settings, mode: 'off'} : this.settings).visible) {
          seen.add(video.id); this.items.push(video);
          if (this.surface === 'home' && video.shorts) { this.shortShelf.hidden = false; this.shortGrid.append(this.card(video)); }
          else if (this.surface === 'home') this.regularCards.push(this.card(video));
          else this.grid.append(this.card(video));
        }
        this.layoutHome();
        this.cursor = response.nextCursor; this.pageCursor = response.pageCursor || null; this.hasMore = response.hasMore; this.endReason = response.endReason || ''; this.restartRequired = false;
        if (response.metadataStats) {
          this.hasMetadataStats = true;
          for (const field of Object.keys(this.metadataStats)) this.metadataStats[field] += Math.max(0, Math.min(100, Math.trunc(Number(response.metadataStats[field]) || 0)));
        }
        const stats = this.metadataStats;
        const network = this.hasMetadataStats ? ` · ${stats.requests} extra video-page request${stats.requests === 1 ? '' : 's'}${stats.cacheHits ? ` · ${stats.cacheHits} cached check${stats.cacheHits === 1 ? '' : 's'}` : ''}` : '';
        this.status.textContent = `${this.items.length} videos for ${C.modes(this.settings)[this.settings.mode].name.toLowerCase()}${network}${response.warning ? ' · ' + response.warning : ''}`;
        this.setFeedState('active');
        if (this.hasMetadataStats) this.status.title = `Fuller metadata for this feed: ${stats.checked} checks, ${stats.requests} extra network requests attempted, ${stats.cacheHits} cached results, ${stats.sharedRequests} requests shared with another feed, ${stats.failed} unavailable checks, ${stats.remaining} uncertain candidates left without a fuller check. Search-page and thumbnail requests are separate.`;
        this.autoBatches++;
        if (auto && this.items.length < 12 && this.hasMore && this.autoBatches < 2) {
          this.busy = false; return await this.load(false, true);
        }
        if (!this.items.length) this.empty('No matching videos yet.', 'Try refreshing, loading more topics, or adding subjects and channels in Intent settings.');
      } catch (error) {
        if (generation !== this.generation) return;
        this.loadFailed = true; this.restartRequired = /continuation.*expired|refresh discovery/i.test(error.message);
        if (/context invalidated/i.test(error.message || '')) {document.dispatchEvent(new Event('intent-context-lost')); return;}
        this.status.className = 'status error'; this.status.textContent = error.message;
        this.setFeedState(this.recommendedItems?.length ? 'active' : 'unavailable');
        if (!this.items.length) this.empty('Your feed couldn’t load.', 'YouTube may be unavailable or asking for consent. Retry with Refresh feed, or open search below.');
      } finally {
        if (generation === this.generation) {
          this.busy = false; this.more.disabled = false;
          this.more.hidden = !this.loadFailed && (!this.hasMore || this.items.length >= 120);
          this.more.textContent = this.loadFailed ? this.restartRequired ? 'Restart discovery' : 'Retry loading more' : 'Find more videos';
          this.endState.hidden = this.loadFailed || this.hasMore && this.items.length < 120;
          if (!this.endState.hidden) {
            this.endMessage.textContent = this.items.length >= 120 ? '120 real videos loaded. Open YouTube search to keep exploring.' : this.endReason || 'No more matching videos from these public searches.';
            const search = new URL('https://www.youtube.com/results'); search.searchParams.set('search_query', F.queries(this.settings, this.round)[0] || C.modes(this.settings)[this.settings.mode].name);
            if (this.locale?.hl) search.searchParams.set('hl', this.locale.hl); if (this.locale?.gl) search.searchParams.set('gl', this.locale.gl);
            this.endSearch.href = search.href;
          }
          this.grid.removeAttribute('aria-busy');
        }
      }
    }
    syncRecommendations() {
      const source = globalThis.IntentRecommendations;
      if (!source || !this.primary?.isConnected || !this.host?.isConnected || !this.signature || this.settings.mode === 'off') { if (this.recommendedMore) this.recommendedMore.hidden = !source; return Promise.resolve(); }
      this.recommendedMore.hidden = false;
      const declared = this.renderer?.getAttribute('video-id');
      if (this.surface === 'watch' && declared && declared !== this.videoId) return Promise.resolve();
      for (const video of this.nativePool.size<240 ? source.read(this.primary, this.videoId, {scanned: this.nativeScanned, exclude: this.nativeChecked, nodes: this.nativeNodes, limit: 240-this.nativePool.size}) : []) if (this.nativePool.size < 240 || this.nativePool.has(video.id)) this.nativePool.set(video.id, video);
      if (this.nativeJob || Date.now() < this.nativeRetryAt) return this.nativeJob || Promise.resolve();
      const generation = this.generation, signature = this.signature;
      const current = () => generation === this.generation && signature === this.signature && this.host?.isConnected;
      const pending = () => [...this.nativePool.values()].filter(v => this.nativeChecked.get(v.id)?.fingerprint !== JSON.stringify(v)).slice(0, Math.max(0, this.nativeLimit - this.nativeTotalChecked));
      if (!pending().length) return Promise.resolve();
      if (!this.recommendedItems.length) this.recommendedMessage.textContent = 'Checking your YouTube recommendations…';
      const job = (async () => {
        while (current()) {
          const videos = pending().slice(0, 48); if (!videos.length) break;
          const result = await this.runtime.sendMessage({type: 'FILTER_RECOMMENDATIONS', key: signature, locale: this.locale, videos});
          if (!current() || result?.stale || result?.paused || result?.tabPaused) return;
          if (result?.blocked) { location.replace(this.runtime.getURL('blocked.html')); return; }
          if (!result?.ok || result.key !== signature || !Array.isArray(result.items)) throw new Error(result?.error || 'Recommendations could not be checked.');
          const accepted = new Map(result.items.map(v => [v.id, v]));
          for (const video of videos) {
            const item = accepted.has(video.id) && C.classify(accepted.get(video.id), {...this.settings, mode: 'off'}).visible ? accepted.get(video.id) : null;
            this.nativeChecked.set(video.id, {fingerprint: JSON.stringify(video), item}); this.nativeTotalChecked++;
            // Keep matches and a bounded pending window, rather than filling a
            // lifetime 240-video pool with already-rejected candidates.
            if (!item) {this.nativePool.delete(video.id); this.nativeNodes.delete(video.id);}
          }
          while (this.nativeChecked.size > 2048) {const id=[...this.nativeChecked.keys()].find(id=>!this.nativePool.has(id));if(!id)break;this.nativeChecked.delete(id);}
          this.renderRecommendations();
        }
      })().catch(error => { if (current()) { if (/context invalidated/i.test(error.message || '')) {document.dispatchEvent(new Event('intent-context-lost')); return;} this.nativeRetryAt = Date.now() + 30000; this.recommendedMore.title = error.message; this.recommendedMessage.textContent = 'Recommendations could not be checked. Try again later.'; } }).finally(() => {if (this.nativeJob === job) this.nativeJob = null;});
      this.nativeJob = job; return job;
    }
    renderRecommendations() {
      this.recommendedItems = [...this.nativePool.keys()].map(id => this.nativeChecked.get(id)?.item).filter(Boolean).slice(0, 120);
      const nativeIds = new Set(this.recommendedItems.map(v => v.id));
      const focused = this.host.shadowRoot.activeElement, focusedVideo = focused?.closest('.card')?.dataset.videoId, focusedClass = focused?.className;
      this.recommendedGrid.replaceChildren(...this.recommendedItems.filter(v => this.surface === 'watch' || !v.shorts).map(v => this.card(v)));
      this.recommendedShortGrid.replaceChildren(...this.recommendedItems.filter(v => this.surface === 'home' && v.shorts).map(v => this.card(v)));
      this.recommendedShorts.hidden = !this.recommendedShortGrid.childElementCount;
      if (focusedVideo) [...this.recommendedSection.querySelectorAll('.card')].find(node => node.dataset.videoId === focusedVideo)?.querySelector(focusedClass === 'cover' ? '.cover' : '.title')?.focus({preventScroll: true});
      this.recommendedSection.hidden = !this.recommendedItems.length;
      if (!this.recommendedItems.length) this.recommendedMessage.textContent = 'No matching recommendations yet.';
      else if (/^(Checking your YouTube recommendations|No matching recommendations yet)/.test(this.recommendedMessage.textContent)) this.recommendedMessage.textContent = '';
      if (this.recommendedItems.length) this.setFeedState('active');
      const target = this.recommendedItems.length ? this.recommendedActions : this.discoveryActions;
      if (this.recommendedMore.parentElement !== target) { const focused = this.host.shadowRoot.activeElement === this.recommendedMore; target.append(this.recommendedMore,this.recommendedMessage); if (focused) this.recommendedMore.focus({preventScroll: true}); }
      // A late native match takes priority over a duplicate search result.
      if (this.items.some(v => nativeIds.has(v.id))) {
        this.items = this.items.filter(v => !nativeIds.has(v.id));
        this.regularCards = this.regularCards.filter(card => !nativeIds.has(card.dataset.videoId));
        for (const container of [this.grid, this.restGrid, this.shortGrid]) for (const card of container.querySelectorAll('.card')) if (nativeIds.has(card.dataset.videoId)) card.remove();
        this.status.textContent = this.status.textContent.replace(/^\d+ videos/, `${this.items.length} videos`); this.layoutHome();
      }
    }
    async moreRecommendations() {
      if (this.nativeMoreBusy || !this.host?.isConnected || !globalThis.IntentRecommendations) return;
      const generation = this.generation; this.nativeMoreBusy = true; this.nativeRetryAt = 0; this.recommendedMore.disabled = true; this.recommendedMore.textContent = 'Checking recommendations…'; this.recommendedMessage.textContent = '';
      const before = this.nativeTotalChecked, matches = this.recommendedItems.length;
      let batches = 0, unavailable = false, stalled = false;
      try {
        // One click may walk three native batches when early batches have no
        // matches. Work stays bounded; another click can continue further.
        for (let step = 0; step < 4 && this.recommendedItems.length < 120; step++) {
          this.nativeLimit = this.nativeTotalChecked + 96; const prior = this.nativeTotalChecked;
          await this.syncRecommendations();
          if (generation !== this.generation) return;
          if (this.nativeRetryAt > Date.now()) return;
          const checked = this.nativeTotalChecked - before, added = this.recommendedItems.length - matches;
          this.recommendedMore.textContent = `Checked ${checked} · ${added} new matches`;
          if (added >= 6) break;
          if (step === 3) break;
          // Drain loaded candidates before asking YouTube for another batch.
          if (this.nativeTotalChecked > prior && this.nativeTotalChecked >= this.nativeLimit) continue;
          this.nativePagination ||= new globalThis.IntentRecommendations.Pagination();
          const result = await this.nativePagination.load(this.primary, this.videoId, new Set([...this.nativeChecked.keys(),...this.nativePool.keys()])); batches++;
          if (generation !== this.generation || result.cancelled) return;
          if (!result.added) {unavailable = !result.available; stalled = result.available; break;}
        }
        if (generation !== this.generation) return;
        const checked = this.nativeTotalChecked - before, added = this.recommendedItems.length - matches;
        this.recommendedMessage.textContent = `${checked} more videos checked · ${added} new match${added === 1 ? '' : 'es'}.` + (unavailable ? ' YouTube has no further recommendation batch here.' : stalled ? ' YouTube did not return another batch. Try again later.' : this.recommendedItems.length >= 120 ? ' 120 matches shown.' : added ? '' : ' No additional matches in these batches; you can try again.');
        this.recommendedMore.title = `Checked ${checked} previously unseen videos across ${batches} native YouTube batch${batches === 1 ? '' : 'es'}. No public topic searches were used.`;
      } catch { if (generation === this.generation) this.recommendedMessage.textContent = 'Recommendations could not be checked. Try again later.'; }
      finally { if (generation === this.generation) { this.nativeMoreBusy = false; this.recommendedMore.disabled = false; this.recommendedMore.textContent = 'Find more recommendations'; } }
    }
    layoutHome() {
      if (this.surface !== 'home' || !this.host?.isConnected) return;
      const hasShorts = this.shortGrid.childElementCount > 0;
      const tracks = getComputedStyle(this.grid).gridTemplateColumns.match(/[\d.]+px/g);
      const columns = Math.max(1, tracks?.length || Number(this.host.style.getPropertyValue('--intent-grid-columns')) || 1);
      const firstCount = hasShorts ? columns : this.regularCards.length;
      const first = this.regularCards.slice(0, firstCount), rest = this.regularCards.slice(firstCount);
      const active = this.host.shadowRoot.activeElement;
      const place = (parent, nodes) => {
        if (parent.children.length !== nodes.length || nodes.some((node, i) => parent.children[i] !== node)) parent.replaceChildren(...nodes);
      };
      // Only move the existing cards; resize and loading more never duplicate them.
      if (this.regularCards.length) place(this.grid, first);
      place(this.restGrid, rest);
      this.grid.hidden = hasShorts && !first.length;
      this.restGrid.hidden = !rest.length;
      this.shortShelf.hidden = !hasShorts;
      if (active?.isConnected && this.host.shadowRoot.activeElement !== active) active.focus({preventScroll: true});
      this.updateShortArrows();
    }
    scrollShorts(direction) {
      this.shortGrid.scrollBy({left: direction * Math.max(160, this.shortGrid.clientWidth * .8), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
      this.updateShortArrows();
    }
    updateShortArrows() {
      if (!this.shortGrid) return;
      const end = Math.max(0, this.shortGrid.scrollWidth - this.shortGrid.clientWidth);
      this.shortPrevious.disabled = this.shortGrid.scrollLeft <= 1;
      this.shortNext.disabled = this.shortGrid.scrollLeft >= end - 1;
    }
    card(video) {
      const cached=this.nativeCards?.get(video,this.nativeNodes?.get(video.id));if(cached)return cached;
      const card = document.createElement('article'); card.className = video.shorts ? 'card shorts' : 'card'; card.dataset.videoId = video.id;
      const url = video.shorts ? `https://www.youtube.com/shorts/${video.id}` : `https://www.youtube.com/watch?v=${video.id}`;
      const cover = document.createElement('a'); cover.className = 'cover'; cover.href = url; cover.tabIndex = -1; cover.setAttribute('aria-hidden', 'true');
      const image = document.createElement('img'); image.src = video.thumbnail; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.decoding = 'async';
      cover.append(image);
      if (video.shorts) { const badge = document.createElement('span'); badge.className = 'duration'; badge.textContent = 'Shorts'; cover.append(badge); }
      else if (video.duration) { const duration = document.createElement('span'); duration.className = 'duration'; duration.textContent = video.duration; cover.append(duration); }
      const title = document.createElement('a'); title.className = 'title'; title.href = url; title.textContent = video.title;
      const channel = document.createElement('div'); channel.className = 'channel'; channel.textContent = video.channel;
      const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = video.metadata || '';
      card.append(cover, title, channel, meta); this.nativeCards?.enhance(card,video,this.nativeNodes?.get(video.id)); return card;
    }
    empty(titleText, detail) {
      if (this.grid.querySelector('.empty')) return;
      const empty = document.createElement('div'); empty.className = 'empty';
      const title = document.createElement('h2'); title.textContent = titleText;
      const p = document.createElement('p'); p.textContent = detail;
      const link = document.createElement('a'); link.className = 'search'; link.textContent = 'Open this topic on YouTube search ↗';
      const url = new URL('https://www.youtube.com/results'); url.searchParams.set('search_query', F.queries(this.settings, this.round)[0]); link.href = url.href;
      empty.append(title, p, link); this.grid.append(empty);
    }
    restoreNative() {
      // Keep references so even detached nodes are restored before YouTube reuses them.
      for (const el of this.nativeElements) {this.restoreSurface(el); el.removeAttribute(this.nativeMarker);}
      this.nativeElements.clear();
      for (const el of this.spacingElements) {el.removeAttribute('data-intent-empty-home-spacing'); el.removeAttribute('data-intent-home-glass'); el.style.removeProperty('--intent-masthead-glass-height');}
      this.spacingElements.clear();
    }
    destroy() {
      if (!this.signature && !this.host?.isConnected && !this.nativeElements.size && !this.spacingElements.size) return;
      this.nativePagination?.cancel(); this.nativeCards?.destroy(); this.nativeCards=null; this.nativeJob = null; this.nativePool?.clear(); this.nativeChecked?.clear(); this.nativeNodes?.clear(); this.recommendedItems = [];
      this.generation++; this.signature = ''; this.videoId = ''; this.busy = false;
      this.resizeObserver?.disconnect(); this.observing = false;
      this.host?.remove(); document.documentElement.removeAttribute(this.pageMarker);
      this.restoreNative();
    }
  }
  globalThis.IntentHome = Home;
})();
