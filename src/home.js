/* Filled intent feeds for Home and the recommendations beside a watched video. */
(() => {
  const C = IntentCore, F = IntentFeed;
  class Home {
    constructor(runtime = chrome.runtime, surface = 'home') {
      this.runtime = runtime; this.surface = surface === 'watch' ? 'watch' : 'home';
      this.nativeMarker = `data-intent-native-${this.surface}`;
      this.pageMarker = this.surface === 'watch' ? 'data-intent-watch-feed' : 'data-intent-feed';
      this.generation = 0; this.signature = ''; this.items = []; this.round = 0; this.busy = false; this.nativeElements = new Set(); this.regularCards = [];
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
      if (this.host.parentElement !== primary) {
        // YouTube moves or replaces the related container at responsive breakpoints.
        this.restoreNative();
        primary.prepend(this.host);
      }
      this.updateTheme();
      if (this.surface === 'home') {
        if (!this.observing) {this.resizeObserver.observe(this.host); this.observing = true;}
        // Use the native grid's chosen column count, without adding an outer gutter or width cap.
        const native = primary.querySelector('ytd-rich-grid-renderer');
        const columns = native && parseInt(getComputedStyle(native).getPropertyValue('--ytd-rich-grid-items-per-row'), 10);
        if (columns >= 1 && columns <= 12) { this.host.style.setProperty('--intent-grid-columns', columns); this.host.dataset.nativeColumns = ''; }
        else { this.host.style.removeProperty('--intent-grid-columns'); delete this.host.dataset.nativeColumns; }
      }
      document.documentElement.setAttribute(this.pageMarker, '');
      for (const child of this.nativeElements) if (child.parentElement !== primary) {
        child.removeAttribute(this.nativeMarker); this.nativeElements.delete(child);
      }
      for (const child of primary.children) if (child !== this.host && !child.hasAttribute(this.nativeMarker)) {
        child.setAttribute(this.nativeMarker, ''); this.nativeElements.add(child);
        if (this.surface === 'home') child.querySelectorAll('video,audio').forEach(m => m.pause());
      }
      const signature = F.key(settings);
      const videoId = this.surface === 'watch' ? new URL(location.href).searchParams.get('v') || '' : '';
      if (signature !== this.signature || videoId !== this.videoId) {
        this.signature = signature; this.videoId = videoId; this.round = 0; this.restart(false);
      }
      this.layoutHome();
    }
    create() {
      this.host = document.createElement('section'); this.host.id = `intent-${this.surface}-feed`; this.host.dataset.surface = this.surface;
      const root = this.host.attachShadow({mode: 'open'});
      const style = document.createElement('style'); style.textContent = globalThis.IntentFeedTheme || '';
      this.title = document.createElement('h1'); this.title.className = 'sr-only';
      this.title.id = 'feed-heading';
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
      this.more.addEventListener('click', () => this.load(false, false));
      const note = document.createElement('p'); note.className = 'note'; note.textContent = 'Public YouTube searches, analysed locally using titles, available descriptions and hashtags. The topic model is bundled with Intent; this does not change your YouTube recommendation algorithm.';
      root.append(style, this.title, this.status, this.grid, this.shortShelf, this.restGrid, this.more, note);
    }
    restart(fresh) {
      this.generation++; this.items = []; this.cursor = 0; this.hasMore = true; this.busy = false; this.autoBatches = 0;
      this.metadataStats = {requests: 0, checked: 0, cacheHits: 0, sharedRequests: 0, failed: 0, remaining: 0}; this.hasMetadataStats = false;
      this.title.textContent = this.surface === 'watch' ? `${C.modes(this.settings)[this.settings.mode].name} recommendations` : `◒ ${C.modes(this.settings)[this.settings.mode].name}, with intent.`;
      this.host.setAttribute('aria-label', `${C.modes(this.settings)[this.settings.mode].name} videos`);
      this.regularCards = []; this.grid.hidden = false; this.grid.replaceChildren(); this.restGrid.replaceChildren(); this.restGrid.hidden = true; this.shortGrid.replaceChildren(); this.shortShelf.hidden = true; this.more.hidden = true;
      return this.load(fresh, true);
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
      this.busy = true; this.more.disabled = true;
      this.setFeedState(this.items.length ? 'active' : 'loading');
      this.status.className = 'status'; this.status.textContent = (this.items.length ? 'Finding more videos for your intent…' : 'Finding videos and analysing topics locally…') + (this.settings.metadataLimit ? ` Up to ${this.settings.metadataLimit} extra video-page requests per batch.` : ' Fuller checks are off.');
      this.status.removeAttribute('title');
      this.grid.setAttribute('aria-busy', 'true');
      this.grid.querySelector('.empty')?.remove();
      try {
        let timer;
        const response = await Promise.race([
          this.runtime.sendMessage({type: 'GET_FEED', key: signature, cursor: this.cursor, round: this.round, fresh, exclude: [...this.items.map(v => v.id), ...(this.videoId ? [this.videoId] : [])]}),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The feed took too long to load. Try refreshing or lowering the fuller-check limit in settings.')), 180000); })
        ]).finally(() => clearTimeout(timer));
        if (generation !== this.generation) return;
        if (!response?.ok) throw new Error(response?.error || 'The feed could not be loaded.');
        if (response.blocked) { location.replace(this.runtime.getURL('blocked.html')); return; }
        if (response.stale || response.key !== signature) throw new Error('Your mode changed while loading. Refresh the feed to try again.');
        const seen = new Set([...this.items.map(v => v.id), ...(this.videoId ? [this.videoId] : [])]);
        for (const video of response.items || []) if (this.items.length < 120 && /^[\w-]{11}$/.test(video.id) && !seen.has(video.id) && C.classify(video, response.semantic ? {...this.settings, mode: 'off'} : this.settings).visible) {
          seen.add(video.id); this.items.push(video);
          if (this.surface === 'home' && video.shorts) { this.shortShelf.hidden = false; this.shortGrid.append(this.card(video)); }
          else if (this.surface === 'home') this.regularCards.push(this.card(video));
          else this.grid.append(this.card(video));
        }
        this.layoutHome();
        this.cursor = response.nextCursor; this.hasMore = response.hasMore;
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
        this.status.className = 'status error'; this.status.textContent = error.message;
        this.setFeedState('unavailable');
        if (!this.items.length) this.empty('Your feed couldn’t load.', 'YouTube may be unavailable or asking for consent. Retry with Refresh feed, or open search below.');
      } finally {
        if (generation === this.generation) {
          this.busy = false; this.more.disabled = false;
          this.more.hidden = !this.hasMore || this.items.length >= 120;
          this.grid.removeAttribute('aria-busy');
        }
      }
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
      card.append(cover, title, channel, meta); return card;
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
      for (const el of this.nativeElements) el.removeAttribute(this.nativeMarker);
      this.nativeElements.clear();
    }
    destroy() {
      if (!this.signature && !this.host?.isConnected && !this.nativeElements.size) return;
      this.generation++; this.signature = ''; this.videoId = ''; this.busy = false;
      this.resizeObserver?.disconnect(); this.observing = false;
      this.host?.remove(); document.documentElement.removeAttribute(this.pageMarker);
      this.restoreNative();
    }
  }
  globalThis.IntentHome = Home;
})();
