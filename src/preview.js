/* Illustrative controls plus opt-in, locally classified public YouTube examples. */
(() => {
  const C = IntentCore, F = IntentFeed;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  class Preview {
    constructor({getSettings, live, samples, runtime = globalThis.chrome?.runtime}) {
      this.getSettings = getSettings; this.live = live; this.samples = samples; this.runtime = runtime; this.generation = 0;
    }
    reset() {this.generation++; this.key = null; this.result = null; this.busy = false; this.error = ''; this.showHidden = false;}
    render() {
      const host = document.getElementById('intent-preview'); if (!host) return;
      const settings = this.getSettings(), key = F.key(settings), custom = Boolean(settings.customIntents[settings.mode]);
      if (settings.mode === 'focus') {this.reset(); host.innerHTML = '<div class="section-head"><h2>Focus mode</h2></div><p class="section-copy">Home and video recommendations are hidden. Search, your library and video playback remain available. No recommendation searches run in Focus. Playing videos still show their estimated topics.</p>'; return;}
      if (key !== this.key) {this.reset(); this.key = key;}
      host.innerHTML = `<div class="section-head"><div><p class="eyebrow">FILTER PREVIEW</p><h2>Try your filters</h2></div><div class="preview-actions"><button type="button" class="button" id="preview-intent" ${!this.live || this.busy || settings.mode === 'off' ? 'disabled' : ''}>${this.busy ? 'Checking examples…' : this.result ? 'Check examples again' : 'Preview my intent'}</button><button type="button" id="show-hidden" class="button secondary" aria-pressed="${this.showHidden}" ${custom && !this.result ? 'disabled' : ''}>${this.showHidden ? 'Hide filtered examples' : 'Show filtered examples'}</button></div></div><p class="section-copy">${this.result ? 'Real YouTube candidates checked by your local model, using titles and available search descriptions. Your main feed can also use fuller video checks.' : custom ? 'Preview real videos for your saved custom intent, including titles that match by meaning rather than exact words.' : 'Illustrative cards below demonstrate basic filters. Preview my intent checks real YouTube candidates with the local model.'}</p><p class="field-hint">${this.live ? 'Preview may make up to two public YouTube search requests; cached searches can be reused. Thumbnails load from YouTube. No extra video-page requests are made for preview.' : 'Load the extension to preview real videos. This demo does not run the model or make YouTube requests.'}</p><p id="preview-status" role="${this.error ? 'alert' : 'status'}" class="${this.error ? 'preview-error' : 'field-hint'}">${escape(this.busy ? 'Loading YouTube candidates and checking their meaning locally…' : this.error || (this.result ? `${this.result.filter(item => item.accepted).length} matching and ${this.result.filter(item => !item.accepted).length} filtered candidates in this preview. Titles are from real videos, not generated examples.` : ''))}</p><div id="sample-grid" class="sample-grid" aria-busy="${Boolean(this.busy)}"></div>`;
      const grid = host.querySelector('#sample-grid');
      if (this.result) {
        const items = this.result.filter(item => this.showHidden || item.accepted);
        grid.innerHTML = items.length ? items.map(item => this.realCard(item)).join('') : '<p class="sample-empty">No matching videos in this batch. Show filtered examples to inspect the decisions, revise your description, or try again later.</p>';
      } else if (custom) {
        grid.innerHTML = '<p class="sample-empty">Your custom intent needs its own examples. Use Preview my intent to check real videos for the description you saved.</p>';
      } else {
        const videos = this.samples.map(video => ({...video, result: C.classify(video, settings)})).filter(video => this.showHidden || video.result.visible);
        grid.innerHTML = videos.length ? videos.map(video => `<article class="sample-card ${video.result.visible ? '' : 'filtered'}"><div class="sample-cover ${video.color}"><span>${escape(video.cover).replace(/\n/g, '<br>')}</span><small>${escape(video.duration)}</small>${!video.result.visible ? `<div class="filter-label">Hidden · ${escape(video.result.reason)}</div>` : ''}</div><h3>${escape(video.title)}</h3><p>${escape(video.channel)}</p></article>`).join('') : '<p class="sample-empty">These illustrative cards do not cover your description. Use Preview my intent for real locally classified examples.</p>';
      }
      host.querySelector('#show-hidden').onclick = () => {this.showHidden = !this.showHidden; this.render();};
      host.querySelector('#preview-intent').onclick = () => this.load();
    }
    realCard({video, accepted, reason}) {
      const url = `https://www.youtube.com/${video.shorts ? 'shorts/' : 'watch?v='}${video.id}`;
      let thumbnail = '';
      try {const value = new URL(video.thumbnail); if (value.protocol === 'https:' && (value.hostname === 'ytimg.com' || value.hostname.endsWith('.ytimg.com'))) thumbnail = value.href;} catch {}
      return `<article class="sample-card real-preview ${accepted ? '' : 'filtered'}" data-video-id="${video.id}" data-accepted="${accepted}"><a class="sample-cover" href="${url}" target="_blank" rel="noopener">${thumbnail ? `<img src="${escape(thumbnail)}" alt="" loading="lazy">` : ''}<small>${escape(video.duration || (video.shorts ? 'Short' : 'Video'))}</small>${accepted ? '' : `<div class="filter-label">Filtered · ${escape(reason)}</div>`}</a><h3><a href="${url}" target="_blank" rel="noopener">${escape(video.title)}</a></h3><p>${escape(video.channel || '')}</p><p class="preview-verdict">${escape(reason)}</p></article>`;
    }
    async load() {
      if (this.busy || !this.live) return;
      const settings = this.getSettings(); if (['off','focus'].includes(settings.mode)) return;
      const key = F.key(settings), generation = ++this.generation;
      this.busy = true; this.error = ''; this.render();
      try {
        let timer;
        const response = await Promise.race([
          this.runtime.sendMessage({type: 'GET_PREVIEW', mode: settings.mode, key}),
          new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('The preview took too long. Try again shortly.')), 90000);})
        ]).finally(() => clearTimeout(timer));
        if (generation !== this.generation || key !== F.key(this.getSettings())) return;
        if (!response?.ok) throw new Error(response?.error || 'The preview could not load. Try again.');
        if (response.blocked) throw new Error('This intent has reached the daily limit. Try a timer-exempt intent or adjust your budget.');
        if (response.stale || response.key !== key) throw new Error('Your intent changed while the preview was loading. Preview it again.');
        if (!response.semantic || !Array.isArray(response.previewItems)) throw new Error('The local model did not return preview decisions. Try again.');
        this.result = response.previewItems.slice(0, 12).filter(item => item?.video && /^[\w-]{11}$/.test(item.video.id) && typeof item.video.title === 'string' && typeof item.accepted === 'boolean').map(item => ({...item, reason: String(item.reason || (item.accepted ? 'Matches intent' : 'Outside intent'))}));
      } catch (error) {
        if (generation === this.generation && key === F.key(this.getSettings())) this.error = error.message;
      } finally {
        if (generation === this.generation) {this.busy = false; this.render();}
      }
    }
  }
  globalThis.IntentPreview = Preview;
})();
