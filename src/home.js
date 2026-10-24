/* A filled, accessible grid independent of YouTube's fixed recommendation rows. */
(() => {
  const C = IntentCore, F = IntentFeed;
  const STYLE = `:host{display:block;max-width:1700px;margin:18px auto 48px;padding:0 28px;font:14px system-ui;color:var(--yt-spec-text-primary,#263b30)}*{box-sizing:border-box}header{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:24px 0 18px;border-bottom:1px solid #8b997333}h1{font-size:26px;font-weight:600;letter-spacing:-.8px;margin:0}h1 span{color:#788d62}.heading{flex:1;min-width:230px}p{line-height:1.6;margin:7px 0 0;color:var(--yt-spec-text-secondary,#657064);font-size:12px}button,a{font:inherit}button{border:1px solid #82936d66;border-radius:8px;background:var(--yt-spec-badge-chip-background,#edf1e6);color:inherit;padding:10px 14px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}button:focus-visible,a:focus-visible{outline:3px solid #a77e50;outline-offset:4px}.status{font-size:12px;min-height:40px;padding:15px 0;color:var(--yt-spec-text-secondary,#657064)}.status.error{color:#b56345}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:30px 20px}.card{min-width:0}.cover{display:block;position:relative;background:#dce2d3;border-radius:12px;overflow:hidden;aspect-ratio:16/9}.cover img{display:block;width:100%;height:100%;object-fit:cover}.duration{position:absolute;bottom:8px;right:8px;border-radius:4px;padding:3px 5px;background:#142019d9;color:white;font-size:11px}.title{display:block;color:inherit;text-decoration:none;font-size:15px;font-weight:600;line-height:1.45;margin:12px 0 6px;overflow-wrap:anywhere}.channel,.meta{color:var(--yt-spec-text-secondary,#657064);font-size:12px;line-height:1.6;overflow-wrap:anywhere}.more{margin:30px auto;display:block;min-width:180px}.empty{padding:48px 24px;border:1px dashed #82936d66;border-radius:12px;text-align:center;grid-column:1/-1}.empty h2{font-size:20px;margin:0}.empty p{max-width:470px;margin:10px auto 18px}.search{color:inherit;text-underline-offset:4px}.note{font-size:11px;margin-top:28px;color:var(--yt-spec-text-secondary,#657064)}[hidden]{display:none!important}@media(max-width:600px){:host{padding:0 14px}header{gap:10px;padding-top:14px}.heading{min-width:100%}h1{font-size:23px}.grid{gap:25px}}`;
  class Home {
    constructor(runtime = chrome.runtime) {
      this.runtime = runtime; this.generation = 0; this.signature = ''; this.items = []; this.round = 0; this.busy = false;
    }
    sync(settings, active) {
      if (!active || settings.mode === 'off') { this.destroy(); return; }
      this.settings = settings;
      const primary = document.querySelector('ytd-browse[page-subtype="home"] #primary,ytd-browse:not([hidden]) #primary');
      if (!primary) return;
      if (!this.host) this.create();
      if (this.host.parentElement !== primary) primary.prepend(this.host);
      document.documentElement.setAttribute('data-intent-feed', '');
      for (const child of primary.children) if (child !== this.host && !child.hasAttribute('data-intent-native-home')) {
        child.setAttribute('data-intent-native-home', '');
        child.querySelectorAll('video,audio').forEach(m => m.pause());
      }
      const signature = F.key(settings);
      if (signature !== this.signature) { this.signature = signature; this.round = 0; this.restart(false); }
    }
    create() {
      this.host = document.createElement('section'); this.host.id = 'intent-home-feed';
      const root = this.host.attachShadow({mode: 'open'});
      const style = document.createElement('style'); style.textContent = STYLE;
      const header = document.createElement('header');
      const heading = document.createElement('div'); heading.className = 'heading';
      this.title = document.createElement('h1');
      this.description = document.createElement('p');
      heading.append(this.title, this.description);
      this.refresh = document.createElement('button'); this.refresh.textContent = 'Refresh feed ↻';
      this.refresh.addEventListener('click', () => { this.round++; this.restart(true); });
      const change = document.createElement('button'); change.textContent = 'Change mode ↗';
      change.addEventListener('click', () => this.runtime.sendMessage({type: 'OPEN_SETTINGS'}).catch(() => {}));
      header.append(heading, this.refresh, change);
      this.status = document.createElement('div'); this.status.className = 'status'; this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
      this.grid = document.createElement('div'); this.grid.className = 'grid'; this.grid.setAttribute('aria-label', 'Videos for your intent');
      this.more = document.createElement('button'); this.more.className = 'more'; this.more.textContent = 'Find more videos'; this.more.hidden = true;
      this.more.addEventListener('click', () => this.load(false, false));
      const note = document.createElement('p'); note.className = 'note'; note.textContent = 'Public YouTube searches, analysed locally using titles, available descriptions and hashtags. The topic model is bundled with Intent; this does not change your YouTube recommendation algorithm.';
      root.append(style, header, this.status, this.grid, this.more, note);
    }
    restart(fresh) {
      this.generation++; this.items = []; this.cursor = 0; this.hasMore = true; this.busy = false; this.autoBatches = 0;
      this.title.textContent = `◒ ${C.MODES[this.settings.mode].name}, with intent.`;
      this.description.textContent = `${C.MODES[this.settings.mode].description} A fresh feed for what you came for.`;
      this.grid.replaceChildren(); this.more.hidden = true;
      this.load(fresh, true);
    }
    async load(fresh, auto) {
      if (this.busy || !this.hasMore || this.items.length >= 120) return;
      const generation = this.generation, signature = this.signature;
      this.busy = true; this.refresh.disabled = true; this.more.disabled = true;
      this.status.className = 'status'; this.status.textContent = this.items.length ? 'Finding more videos for your intent…' : 'Finding videos and analysing topics locally…';
      this.grid.setAttribute('aria-busy', 'true');
      this.grid.querySelector('.empty')?.remove();
      try {
        let timer;
        const response = await Promise.race([
          this.runtime.sendMessage({type: 'GET_FEED', key: signature, cursor: this.cursor, round: this.round, fresh, exclude: this.items.map(v => v.id)}),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The feed took too long to load. Try refreshing it.')), 90000); })
        ]).finally(() => clearTimeout(timer));
        if (generation !== this.generation) return;
        if (!response?.ok) throw new Error(response?.error || 'The feed could not be loaded.');
        if (response.blocked) { location.replace(this.runtime.getURL('blocked.html')); return; }
        if (response.stale || response.key !== signature) throw new Error('Your mode changed while loading. Refresh the feed to try again.');
        const seen = new Set(this.items.map(v => v.id));
        for (const video of response.items || []) if (this.items.length < 120 && /^[\w-]{11}$/.test(video.id) && !seen.has(video.id) && C.classify(video, response.semantic ? {...this.settings, mode: 'off'} : this.settings).visible) {
          seen.add(video.id); this.items.push(video); this.grid.append(this.card(video));
        }
        this.cursor = response.nextCursor; this.hasMore = response.hasMore;
        this.status.textContent = `${this.items.length} videos for ${C.MODES[this.settings.mode].name.toLowerCase()}${response.warning ? ' · ' + response.warning : ''}`;
        this.autoBatches++;
        if (auto && this.items.length < 12 && this.hasMore && this.autoBatches < 2) {
          this.busy = false; return await this.load(false, true);
        }
        if (!this.items.length) this.empty('No matching videos yet.', 'Try refreshing, loading more topics, or adding subjects and channels in Intent settings.');
      } catch (error) {
        if (generation !== this.generation) return;
        this.status.className = 'status error'; this.status.textContent = error.message;
        if (!this.items.length) this.empty('Your feed couldn’t load.', 'YouTube may be unavailable or asking for consent. Retry with Refresh feed, or open search below.');
      } finally {
        if (generation === this.generation) {
          this.busy = false; this.refresh.disabled = false; this.more.disabled = false;
          this.more.hidden = !this.hasMore || this.items.length >= 120;
          this.grid.removeAttribute('aria-busy');
        }
      }
    }
    card(video) {
      const card = document.createElement('article'); card.className = 'card'; card.dataset.videoId = video.id;
      const url = `https://www.youtube.com/watch?v=${video.id}`;
      const cover = document.createElement('a'); cover.className = 'cover'; cover.href = url; cover.tabIndex = -1; cover.setAttribute('aria-hidden', 'true');
      const image = document.createElement('img'); image.src = video.thumbnail; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.decoding = 'async';
      cover.append(image);
      if (video.duration) { const duration = document.createElement('span'); duration.className = 'duration'; duration.textContent = video.duration; cover.append(duration); }
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
    destroy() {
      if (!this.signature && !this.host?.isConnected) return;
      this.generation++; this.signature = ''; this.busy = false;
      this.host?.remove(); document.documentElement.removeAttribute('data-intent-feed');
      document.querySelectorAll('[data-intent-native-home]').forEach(el => el.removeAttribute('data-intent-native-home'));
    }
  }
  globalThis.IntentHome = Home;
})();
