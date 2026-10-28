/* Keep YouTube's Watch filters in their native tree; forward only user clicks. */
(() => {
  const bars = 'yt-related-chip-cloud-renderer,ytd-related-chip-cloud-renderer';
  const chips = 'yt-chip-cloud-chip-renderer,[role="tab"]';
  const cards = 'ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,ytd-grid-video-renderer,ytd-compact-playlist-renderer,ytd-compact-radio-renderer,ytd-playlist-renderer,ytd-grid-playlist-renderer,yt-lockup-view-model,ytd-reel-item-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2,yt-shorts-lockup-view-model,yt-shorts-lockup-view-model-v2';
  class NativeFilters {
    constructor(host, container, changed) {
      this.host = host; this.container = container; this.changed = changed; this.stale = new WeakSet(); this.selection = []; this.buttons = new Map();
      this.controls = document.createElement('div'); this.controls.setAttribute('aria-label', 'YouTube recommendation filters');
      this.controls.style.cssText = 'display:flex;gap:8px;overflow-x:auto;padding:2px 0 8px;max-width:100%'; container.append(this.controls);
    }
    selected() {return this.entry ? [...this.entry.querySelectorAll(chips)].filter(node => node.hasAttribute('selected') || node.getAttribute('aria-selected') === 'true' || node.getAttribute('aria-pressed') === 'true') : [];}
    identity(card) {return [...card.querySelectorAll('a[href]')].map(link => link.getAttribute('href')).filter(href => /(?:watch\?|shorts\/|playlist\?)/.test(href)).slice(0, 12).join('\n');}
    begin() {
      this.waiting = true; clearTimeout(this.timer); this.changed('start');
      const baseline = [...this.primary.querySelectorAll(cards)].slice(0, 12000).filter(node => !this.host.contains(node));
      this.stale = new WeakSet(baseline); this.identities = new WeakMap(baseline.map(node => [node, this.identity(node)]));
      // Restoring owned original cards is not a new YouTube filter response.
      this.observer.takeRecords();
      this.timer = setTimeout(() => {if (this.waiting) this.changed('timeout');}, 12000);
    }
    render() {
      const native = this.entry ? [...this.entry.querySelectorAll(chips)].slice(0, 40) : [], selected = this.selected(), children = [];
      for (const chip of native) {
        const label = (chip.textContent || chip.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        if (!label || chip.closest('[hidden]')) continue;
        let button = this.buttons.get(chip);
        if (!button) {
          button = document.createElement('button'); button.type = 'button'; button.className = 'native-filter-chip';
          button.style.cssText = 'flex:0 0 auto;border:0;border-radius:8px;padding:8px 12px;font:500 14px Roboto,Arial,sans-serif;cursor:pointer';
          button.onclick = () => {
            if (!chip.isConnected || !this.entry?.contains(chip) || this.selected().includes(chip) || button.disabled) return;
            this.clicked = chip; this.begin(); chip.click();
          }; this.buttons.set(chip, button);
        }
        if (button.textContent !== label) button.textContent = label;
        const active = selected.includes(chip); button.setAttribute('aria-pressed', String(active));
        button.disabled = chip.hasAttribute('disabled') || chip.getAttribute('aria-disabled') === 'true';
        button.style.background = active ? 'var(--yt-spec-text-primary,var(--intent-text,#0f0f0f))' : 'var(--yt-spec-badge-chip-background,rgba(127,127,127,.18))';
        button.style.color = active ? 'var(--yt-spec-base-background,var(--intent-bg,#fff))' : 'var(--yt-spec-text-primary,var(--intent-text,#0f0f0f))';
        children.push(button);
      }
      for (const [chip] of this.buttons) if (!native.includes(chip)) this.buttons.delete(chip);
      if (this.controls.children.length !== children.length || children.some((node, i) => this.controls.children[i] !== node)) this.controls.replaceChildren(...children);
      this.container.hidden = !children.length;
    }
    observe(records) {
      records = records.filter(record => !this.host.contains(record.target));
      if (!records.length) return;
      const selected = this.selected();
      if (selected.length !== this.selection.length || selected.some((node, index) => node !== this.selection[index])) {
        this.selection = selected;
        if (!this.clicked) this.begin();
        else if (selected.includes(this.clicked)) this.clicked = null;
      }
      let fresh = false;
      const mark = node => {
        if (!(node instanceof Element) || this.host.contains(node)) return;
        const candidates = [node, ...node.querySelectorAll(cards)].filter(item => item.matches(cards));
        let parent = node.closest(cards);
        while (parent && this.primary.contains(parent)) {candidates.push(parent); parent = parent.parentElement?.closest(cards);}
        for (const card of candidates.slice(0, 12000)) if (!this.host.contains(card) && (!this.stale.has(card) || this.identity(card) !== this.identities?.get(card))) {this.stale.delete(card); fresh = true;}
      };
      for (const record of records) {
        if (this.host.contains(record.target)) continue;
        if (record.type === 'childList') for (const node of record.addedNodes) mark(node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
        else mark(record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement);
      }
      this.render();
      if (fresh && this.waiting) {this.waiting = false; this.clicked = null; clearTimeout(this.timer); this.changed('ready');}
    }
    sync(primary) {
      if (this.primary !== primary) {
        this.observer?.disconnect(); this.primary = primary;
        this.observer = new MutationObserver(records => this.observe(records));
        this.observer.observe(primary, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['selected','aria-selected','aria-pressed','disabled','aria-disabled','hidden','href','title']});
      }
      if (!this.entry?.isConnected || !primary.contains(this.entry)) {
        this.entry = [...primary.querySelectorAll(bars)].find(node => !this.host.contains(node) && !node.closest('[hidden]')) || null;
        this.selection = this.selected(); this.buttons.clear();
      }
      this.render();
    }
    destroy() {this.observer?.disconnect(); clearTimeout(this.timer); this.controls.remove(); this.buttons.clear(); this.container.hidden = true;}
  }
  globalThis.IntentNativeFilters = NativeFilters;
})();
