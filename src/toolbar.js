/* Explicit intent controls to the left of YouTube's search field. */
(() => {
  const CSS = `
:host{position:relative;display:block;flex:0 0 250px;width:250px;min-width:250px;max-width:250px;margin-right:12px;font:14px Roboto,Arial,sans-serif;color:var(--yt-spec-text-primary,#0f0f0f);color-scheme:light;--intent-chip:#f2f2f2;--intent-hover:#e5e5e5;--intent-ink:#0f0f0f;--intent-menu:#fff;--intent-muted:#606060;--intent-line:#e5e5e5}
:host([data-theme=dark]){color-scheme:dark;--intent-chip:#272727;--intent-hover:#3f3f3f;--intent-ink:#f1f1f1;--intent-menu:#282828;--intent-muted:#aaa;--intent-line:#3f3f3f;color:var(--yt-spec-text-primary,var(--intent-ink))}
*{box-sizing:border-box}.controls{width:100%;display:flex;align-items:center;gap:0;white-space:nowrap;background:var(--yt-spec-badge-chip-background,var(--intent-chip));border:0;border-radius:20px;padding:0 3px;height:36px}button{font:inherit;border:0;background:transparent;color:inherit;cursor:pointer}button:hover{background:var(--intent-hover)}button:disabled{opacity:.5;cursor:wait}button:focus-visible{outline:2px solid #3ea6ff;outline-offset:2px}.trigger{height:36px;flex:1 1 0;min-width:0;display:flex;align-items:center;gap:8px;padding:0 10px 0 6px;border-radius:20px;font-size:14px;font-weight:500}.logo{display:block;width:20px;height:20px;flex:0 0 20px}.selected-symbol{display:block;flex:0 0 14px;width:14px;font-size:14px;line-height:1;text-align:center}.mode-name{display:block;flex:1 1 0;min-width:0;text-align:left;max-width:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chevron{width:12px;height:12px;flex:0 0 12px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;opacity:.8}.trigger[aria-expanded=true] .chevron{transform:rotate(180deg)}.coverage-badge{display:inline-flex;flex:0 0 auto;align-items:center;max-width:90px;border:1px solid var(--intent-line);border-radius:5px;padding:2px 5px;font-size:10px;font-weight:500;line-height:1.2;color:var(--intent-muted);white-space:nowrap}.sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}[hidden]{display:none!important}.icon-button{flex:0 0 30px;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;padding:6px}.icon-button svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.menu{position:fixed;inset:auto;margin:0;padding:8px 0;border:1px solid var(--intent-line);border-radius:18px;background:var(--intent-menu);color:var(--intent-ink);box-shadow:0 4px 24px #0003;width:272px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:hidden;font:14px Roboto,Arial,sans-serif}.menu::backdrop{background:transparent}.menu-heading{font-size:12px;font-weight:500;color:var(--intent-muted);padding:8px 16px 12px;margin:0}.coverage-detail{font-size:12px;line-height:1.5;color:var(--intent-muted);padding:0 16px 12px;margin:0}.options{max-height:320px;overflow:auto;overscroll-behavior:contain;padding:0 6px}.option{display:flex;align-items:center;gap:12px;min-height:40px;width:100%;padding:9px 12px;text-align:left;border-radius:12px;line-height:1.4;overflow-wrap:anywhere}.option[aria-selected=true]{background:var(--intent-chip);font-weight:500}.option:focus-visible{outline-offset:-2px}.option-symbol{display:inline-grid;place-items:center;width:20px;height:24px;flex:0 0 20px;font-size:19px;line-height:1}.option-name{flex:1;min-width:0}.check{width:18px;height:18px;flex:0 0 18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;visibility:hidden}.option[aria-selected=true] .check{visibility:visible}.menu-footer{margin-top:6px;border-top:1px solid var(--intent-line);padding:6px 6px 0}.pause-button{display:flex;align-items:center;gap:12px;width:100%;min-height:40px;padding:9px 12px;border-radius:12px;font-size:13px;text-align:left}.pause-button svg{width:18px;height:18px;flex:0 0 18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.error{position:absolute;top:46px;left:0;max-width:280px;border-radius:8px;padding:10px 12px;background:var(--intent-menu);color:inherit;box-shadow:0 2px 10px #0003;font-size:12px;white-space:normal;z-index:10}.error:empty{display:none}
@media(max-width:1100px){.settings{display:none}:host{width:210px;min-width:210px;max-width:210px;flex-basis:210px;margin-right:8px}}@media(max-width:700px){:host{width:170px;min-width:170px;max-width:170px;flex-basis:170px;margin-right:4px}.controls{height:34px;padding:0 2px}.trigger{height:34px;gap:5px;padding:0 6px 0 4px}.mode-name{font-size:12px}.trigger:has(.selected-symbol:not([hidden])){gap:3px;padding-right:4px}.icon-button{width:28px;height:28px;flex-basis:28px}}@media(max-width:480px){:host{width:154px;min-width:154px;max-width:154px;flex-basis:154px}.coverage-badge{max-width:65px;padding:2px 4px}.trigger{gap:4px}.trigger:has(.selected-symbol:not([hidden])){gap:2px;padding-right:2px}.selected-symbol{width:12px;flex-basis:12px;font-size:12px}.chevron{width:10px;flex-basis:10px}}

@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;
  const svg = (path, className = '') => {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    if (className) icon.setAttribute('class', className);
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path'); shape.setAttribute('d', path); icon.append(shape); return icon;
  };
  class Toolbar {
    constructor(runtime = chrome.runtime, {onSettings = () => {}, onRefresh = () => {}, onPaused = () => {}} = {}) {
      this.runtime = runtime; this.onSettings = onSettings; this.onRefresh = onRefresh; this.onPaused = onPaused;
      this.open = false;
      this.outside = event => { if (!event.composedPath().includes(this.host)) this.closeMenu(false); };
      this.reposition = () => { if (this.open) this.positionMenu(); };
    }
    sync(settings, active = true, coverage = {state: 'active'}) {
      if (!active) { this.destroy(); return; }
      this.settings = settings;
      const state = ['active', 'loading', 'unavailable', 'off-here', 'paused'].includes(coverage?.state) ? coverage.state : 'active';
      this.coverage = {state, detail: typeof coverage?.detail === 'string' ? coverage.detail : ''};
      if (state !== 'paused') this.resumeCoverage = {...this.coverage};
      const masthead = document.querySelector('ytd-masthead:not([hidden])');
      const center = masthead?.querySelector('#center');
      // Unsupported/mobile mastheads get no detached banner or replacement navigation.
      if (!center) { this.destroy(); return; }
      if (!this.host) this.create();
      this.updateOptions(settings); this.paintSelection();
      if (this.host.parentElement !== center) {
        this.closeMenu(false);
        if (this.masthead !== masthead) this.masthead?.removeAttribute('data-intent-toolbar');
        const search = [...center.children].find(el => el.matches('yt-searchbox,ytd-searchbox,#search,form[role=search]') || el.querySelector('yt-searchbox,ytd-searchbox,#search-form,form[role=search]'));
        if (search) search.before(this.host); else center.prepend(this.host);
      }
      this.masthead = masthead; masthead.setAttribute('data-intent-toolbar', '');
      this.updateTheme();
      if (this.open) this.positionMenu();
    }
    create() {
      this.host = document.createElement('div'); this.host.id = 'intent-toolbar';
      const root = this.root = this.host.attachShadow({mode: 'open'});
      const style = document.createElement('style'); style.textContent = CSS;
      const controls = document.createElement('div'); controls.className = 'controls'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Intent controls');
      this.trigger = document.createElement('button'); this.trigger.type = 'button'; this.trigger.className = 'trigger'; this.trigger.id = 'intent-mode-trigger';
      this.trigger.setAttribute('role', 'combobox'); this.trigger.setAttribute('aria-label', 'Intent mode'); this.trigger.setAttribute('aria-haspopup', 'listbox'); this.trigger.setAttribute('aria-expanded', 'false'); this.trigger.setAttribute('aria-controls', 'intent-mode-menu'); this.trigger.setAttribute('aria-describedby', 'intent-filter-status');
      const logo = document.createElement('img'); logo.className = 'logo'; logo.src = this.runtime.getURL('icons/128.png'); logo.alt = ''; logo.setAttribute('aria-hidden', 'true');
      this.modeName = document.createElement('span'); this.modeName.className = 'mode-name';
      this.selectedSymbol = document.createElement('span'); this.selectedSymbol.className = 'selected-symbol'; this.selectedSymbol.setAttribute('aria-hidden', 'true'); this.selectedSymbol.hidden = true;
      this.coverageBadge = document.createElement('span'); this.coverageBadge.className = 'coverage-badge'; this.coverageBadge.setAttribute('aria-hidden', 'true');
      this.trigger.append(logo, this.selectedSymbol, this.modeName, this.coverageBadge, svg('m6 9 6 6 6-6', 'chevron'));
      this.coverageStatus = document.createElement('span'); this.coverageStatus.className = 'sr-only'; this.coverageStatus.id = 'intent-filter-status'; this.coverageStatus.setAttribute('role', 'status'); this.coverageStatus.setAttribute('aria-live', 'polite');
      this.trigger.addEventListener('click', () => this.open ? this.closeMenu(true) : this.openMenu());
      this.trigger.addEventListener('keydown', event => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); this.openMenu(event.key === 'Home' ? 0 : event.key === 'End' ? this.options.length - 1 : undefined);
        } else if (event.key === 'Escape' && this.open) { event.preventDefault(); this.closeMenu(true); }
        else if (event.key === 'Tab') this.closeMenu(false);
      });
      const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'icon-button'; refresh.append(svg('M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11.5-1L20 9M4 15l2.5 3A7 7 0 0 0 18 17')); refresh.title = 'Refresh feed'; refresh.setAttribute('aria-label', 'Refresh feed');
      this.refreshButton = refresh;
      refresh.addEventListener('click', async () => {
        this.refreshPending = true; this.paintCoverage(); this.error.textContent = '';
        try { await this.onRefresh(); } catch (error) { this.error.textContent = error.message; }
        finally { this.refreshPending = false; this.paintCoverage(); }
      });
      const settings = document.createElement('button'); settings.type = 'button'; settings.className = 'icon-button settings'; settings.append(svg('m9 3-.7 2.3-2.4 1.4L3.5 6l-2 3.5 1.8 1.6v2.8l-1.8 1.6L3.5 19l2.4-.7 2.4 1.4L9 22h4l.7-2.3 2.4-1.4 2.4.7 2-3.5-1.8-1.6v-2.8l1.8-1.6-2-3.5-2.4.7-2.4-1.4L13 3z M15 12.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0')); settings.title = 'Intent settings'; settings.setAttribute('aria-label', 'Intent settings');
      settings.addEventListener('click', () => this.runtime.sendMessage({type: 'OPEN_SETTINGS'}).catch(error => { this.error.textContent = error.message; }));
      this.error = document.createElement('div'); this.error.className = 'error'; this.error.setAttribute('role', 'status');
      this.menu = document.createElement('div'); this.menu.className = 'menu'; this.menu.id = 'intent-mode-popover'; this.menu.setAttribute('popover', 'manual');
      const heading = this.menuHeading = document.createElement('h2'); heading.id = 'intent-mode-heading'; heading.className = 'menu-heading'; heading.textContent = 'Intent for this tab';
      this.list = document.createElement('div'); this.list.className = 'options'; this.list.id = 'intent-mode-menu'; this.list.setAttribute('role', 'listbox'); this.list.setAttribute('aria-labelledby', heading.id);
      this.list.addEventListener('keydown', event => this.listKey(event));
      this.coverageDetail = document.createElement('p'); this.coverageDetail.className = 'coverage-detail';
      this.pauseFooter = document.createElement('div'); this.pauseFooter.className = 'menu-footer';
      this.pauseButton = document.createElement('button'); this.pauseButton.type = 'button'; this.pauseButton.id = 'intent-tab-pause'; this.pauseButton.className = 'pause-button'; this.pauseButton.setAttribute('aria-describedby', this.coverageStatus.id);
      this.pauseIcon = svg('M8 5v14M16 5v14'); this.pauseLabel = document.createElement('span'); this.pauseButton.append(this.pauseIcon, this.pauseLabel);
      this.pauseButton.addEventListener('click', () => this.togglePaused());
      this.pauseButton.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); this.closeMenu(true); }
        else if (event.key === 'Tab') this.closeMenu(false);
      });
      this.pauseFooter.append(this.pauseButton);
      this.menu.append(heading, this.coverageDetail, this.list, this.pauseFooter);
      this.menu.addEventListener('toggle', event => { if (event.newState === 'closed' && this.open) this.closeMenu(false); });
      controls.append(this.trigger, refresh, settings); root.append(style, controls, this.coverageStatus, this.error, this.menu);
    }
    updateOptions(settings) {
      const options = [...Object.entries(IntentCore.modes(settings)).map(([id, item]) => [id, item.name, item.symbol || '◒']), ['off', 'Off', '○']];
      const signature = JSON.stringify(options);
      if (signature === this.optionSignature) return;
      const hadFocus = this.open && this.options?.includes(this.root.activeElement);
      this.optionSignature = signature;
      this.options = options.map(([id, name, symbol]) => {
        const option = document.createElement('button'); option.type = 'button'; option.className = 'option'; option.dataset.mode = id; option.id = `intent-option-${id}`; option.tabIndex = -1; option.setAttribute('role', 'option');
        const label = document.createElement('span'); label.className = 'option-name'; label.textContent = name;
        const glyph = document.createElement('span'); glyph.className = 'option-symbol'; glyph.setAttribute('aria-hidden', 'true'); glyph.textContent = symbol;
        option.append(glyph, label, svg('m5 12 4 4L19 6', 'check'));
        option.addEventListener('click', () => this.choose(id)); return option;
      });
      this.list.replaceChildren(...this.options);
      if (hadFocus) this.focusOption(this.selectedIndex());
    }
    paintSelection() {
      const mode = this.settings.mode, name = IntentCore.modes(this.settings)[mode]?.name || 'Off';
      this.trigger.dataset.mode = mode; this.trigger.value = mode; this.savedModeName = name; this.modeName.textContent = name;
      for (const option of this.options) option.setAttribute('aria-selected', String(option.dataset.mode === mode));
      this.paintCoverage();
    }
    paintCoverage() {
      if (!this.trigger) return;
      const state = this.coverage?.state === 'paused' ? 'paused' : this.settings.mode === 'off' ? 'off' : this.coverage?.state || 'active';
      const defaults = {
        active: 'Intent filtering is on for Home and video recommendations in this tab. Shorts/clickbait rules and timer still apply.',
        loading: 'Intent recommendations are loading. Unrelated recommendations are hidden while matching videos are found. Shorts/clickbait rules and timer still apply.',
        unavailable: 'Intent filtering is unavailable here because matching recommendations could not load. Shorts/clickbait rules and timer still apply.',
        'off-here': 'Intent filtering is off on search results. Saved intent applies on Home/video recommendations. Shorts/clickbait rules and timer still apply.',
        paused: 'Intent is paused for this tab. Your saved intent is kept. Resume Intent to apply it again.',
        off: 'Intent filtering is turned off for this tab. Choose an intent to filter Home/video recommendations. Shorts/clickbait rules and timer still apply.'
      };
      const detail = state === 'off' ? defaults.off : this.coverage?.detail || defaults[state];
      const label = {'off-here': 'Off here', loading: 'Loading', unavailable: 'Unavailable'}[state] || '';
      const custom = Object.hasOwn(this.settings.customIntents || {}, this.settings.mode);
      this.selectedSymbol.textContent = IntentCore.modes(this.settings)[this.settings.mode]?.symbol || '◒';
      this.selectedSymbol.hidden = !custom || state === 'paused' || this.settings.mode === 'off';
      this.modeName.textContent = state === 'paused' ? 'Paused' : this.settings.mode === 'off' ? 'Intent off' : this.savedModeName;
      this.host.dataset.filterState = state; this.trigger.dataset.filterState = state;
      this.coverageBadge.textContent = label; this.coverageBadge.hidden = !label;
      if (this.coverageStatus.textContent !== detail) this.coverageStatus.textContent = detail;
      this.coverageDetail.textContent = detail;
      this.menuHeading.textContent = state === 'off-here' ? 'Saved intent for this tab' : 'Intent for this tab';
      const paused = state === 'paused';
      this.pauseLabel.textContent = paused ? 'Resume on this tab' : 'Pause on this tab'; this.pauseButton.dataset.paused = String(paused); this.pauseButton.disabled = Boolean(this.pausePending);
      this.pauseIcon.firstElementChild.setAttribute('d', paused ? 'm8 5 11 7-11 7z' : 'M8 5v14M16 5v14');
      this.trigger.title = `Saved intent: ${this.savedModeName}. ${detail}`;
      this.refreshButton.disabled = Boolean(this.refreshPending) || state === 'off-here' || state === 'off' || state === 'paused';
    }
    selectedIndex() { return Math.max(0, this.options.findIndex(option => option.dataset.mode === this.settings.mode)); }
    focusOption(index) {
      const option = this.options[Math.max(0, Math.min(this.options.length - 1, index))];
      if (option) { option.focus({preventScroll: true}); option.scrollIntoView({block: 'nearest'}); }
    }
    openMenu(index = this.selectedIndex()) {
      if (this.trigger.disabled || !this.host.isConnected) return;
      if (!this.open) {
        this.open = true; this.menu.showPopover(); this.trigger.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', this.outside, true);
        window.addEventListener('resize', this.reposition); window.addEventListener('scroll', this.reposition, true);
      }
      this.positionMenu(); this.focusOption(index);
    }
    positionMenu() {
      if (!this.host.isConnected) { this.closeMenu(false); return; }
      const rect = this.trigger.getBoundingClientRect(), edge = 8, width = Math.min(272, innerWidth - edge * 2);
      this.menu.style.width = `${Math.max(0, width)}px`;
      this.menu.style.left = `${Math.max(edge, Math.min(rect.left, innerWidth - width - edge))}px`;
      const availableBelow = innerHeight - rect.bottom - 8, availableAbove = rect.top - 8;
      const above = availableBelow < 180 && availableAbove > availableBelow;
      const detailHeight = this.menuHeading.getBoundingClientRect().height + this.coverageDetail.getBoundingClientRect().height + this.pauseFooter.getBoundingClientRect().height + 16;
      this.list.style.maxHeight = `${Math.max(40, Math.min(320, (above ? availableAbove : availableBelow) - detailHeight))}px`;
      const height = this.menu.getBoundingClientRect().height;
      this.menu.style.top = `${Math.max(edge, Math.min(above ? rect.top - height - 6 : rect.bottom + 6, innerHeight - height - edge))}px`;
    }
    listKey(event) {
      const index = this.options.indexOf(this.root.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); this.focusOption(event.key === 'Home' ? 0 : event.key === 'End' ? this.options.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closeMenu(true); }
      else if (event.key === 'Tab' && event.shiftKey) this.closeMenu(false);
      // Forward Tab reaches the separate pause/resume action after the listbox.
      // Native buttons dispatch click for Enter/Space, keeping pointer and keyboard selection identical.
    }
    closeMenu(returnFocus) {
      if (!this.menu) return;
      this.open = false; this.trigger.setAttribute('aria-expanded', 'false');
      if (this.menu.matches(':popover-open')) this.menu.hidePopover();
      document.removeEventListener('pointerdown', this.outside, true);
      window.removeEventListener('resize', this.reposition); window.removeEventListener('scroll', this.reposition, true);
      if (returnFocus && this.host.isConnected && !this.trigger.disabled) this.trigger.focus({preventScroll: true});
    }
    async choose(mode) {
      if (this.pending || this.pausePending) return;
      this.closeMenu(true); this.trigger.disabled = true; this.trigger.setAttribute('aria-busy', 'true'); this.error.textContent = ''; this.pending = true;
      try {
        const result = await this.runtime.sendMessage({type: 'SET_MODE', mode});
        if (!result?.ok || !result.settings) throw new Error(result?.error || 'Intent could not change mode. Try again.');
        this.settings = result.settings; this.updateOptions(this.settings); this.paintSelection(); this.onSettings(result.settings);
      } catch (error) { this.error.textContent = error.message; }
      finally {
        this.pending = false; this.trigger.disabled = false; this.trigger.removeAttribute('aria-busy');
        if (this.host.isConnected && (document.activeElement === this.host || document.activeElement === document.body)) this.trigger.focus({preventScroll: true});
      }
    }
    async togglePaused() {
      if (this.pausePending || this.pending) return;
      const paused = this.coverage?.state !== 'paused';
      this.closeMenu(true); this.pausePending = true; this.trigger.disabled = true; this.trigger.setAttribute('aria-busy', 'true'); this.error.textContent = ''; this.paintCoverage();
      try {
        const result = await this.runtime.sendMessage({type: 'SET_TAB_PAUSED', paused});
        if (!result?.ok || typeof result.tabPaused !== 'boolean') throw new Error(result?.error || 'Intent could not change the pause setting. Try again.');
        this.coverage = result.tabPaused ? {state: 'paused'} : this.resumeCoverage || {state: 'loading'};
        if (result.settings) { this.settings = result.settings; this.updateOptions(this.settings); this.paintSelection(); this.onSettings(result.settings); }
        else this.paintCoverage();
        this.onPaused(result.tabPaused);
      } catch (error) { this.error.textContent = error.message; }
      finally {
        this.pausePending = false; this.trigger.disabled = false; this.trigger.removeAttribute('aria-busy'); this.paintCoverage();
        if (this.host.isConnected && (document.activeElement === this.host || document.activeElement === document.body)) this.trigger.focus({preventScroll: true});
      }
    }
    updateTheme() {
      if (!this.host) return;
      const theme = IntentHome.theme();
      if (this.host.dataset.theme !== theme) this.host.dataset.theme = theme;
    }
    destroy() {
      this.closeMenu(false); this.host?.remove(); this.masthead?.removeAttribute('data-intent-toolbar'); this.masthead = null;
    }
  }
  globalThis.IntentToolbar = Toolbar;
})();
