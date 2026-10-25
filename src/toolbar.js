/* Explicit intent controls to the left of YouTube's search field. */
(() => {
  const CSS = `
:host{position:relative;display:block;flex:0 0 250px;width:250px;min-width:250px;max-width:250px;margin-right:12px;font:14px Roboto,Arial,sans-serif;color:var(--yt-spec-text-primary,#0f0f0f);color-scheme:light;--intent-chip:#f2f2f2;--intent-hover:#e5e5e5;--intent-ink:#0f0f0f;--intent-menu:#fff;--intent-muted:#606060;--intent-line:#e5e5e5;--intent-accent:#365e4b;--intent-warning:#8a5a00;--intent-critical:#b3261e}
:host([data-theme=dark]){color-scheme:dark;--intent-chip:#272727;--intent-hover:#3f3f3f;--intent-ink:#f1f1f1;--intent-menu:#282828;--intent-muted:#aaa;--intent-line:#3f3f3f;--intent-accent:#9cc7ab;--intent-warning:#e9c46a;--intent-critical:#ffb4ab;color:var(--yt-spec-text-primary,var(--intent-ink))}
*{box-sizing:border-box}.controls{width:100%;display:flex;align-items:center;gap:0;white-space:nowrap;background:var(--yt-spec-badge-chip-background,var(--intent-chip));border:0;border-radius:20px;padding:0 3px;height:36px}button{font:inherit;border:0;background:transparent;color:inherit;cursor:pointer}button:hover{background:var(--intent-hover)}button:disabled{opacity:.5;cursor:wait}button:focus-visible{outline:2px solid var(--intent-accent);outline-offset:2px}.trigger{height:36px;flex:1 1 0;min-width:0;display:flex;align-items:center;gap:8px;padding:0 10px 0 6px;border-radius:20px;font-size:14px;font-weight:500}.logo{display:block;width:20px;height:20px;flex:0 0 20px}.compact-state{display:none}.selected-symbol{display:block;flex:0 0 14px;width:14px;font-size:14px;line-height:1;text-align:center}.mode-name{display:block;flex:1 1 0;min-width:0;text-align:left;max-width:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chevron{width:12px;height:12px;flex:0 0 12px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;opacity:.8}.trigger[aria-expanded=true] .chevron{transform:rotate(180deg)}.coverage-badge{display:inline-flex;flex:0 0 auto;align-items:center;max-width:90px;border:1px solid var(--intent-line);border-radius:5px;padding:2px 5px;font-size:10px;font-weight:500;line-height:1.2;color:var(--intent-muted);white-space:nowrap}.sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}[hidden]{display:none!important}.icon-button{flex:0 0 30px;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;padding:6px}.icon-button svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.menu{position:fixed;inset:auto;margin:0;padding:8px 0;border:1px solid var(--intent-line);border-radius:18px;background:var(--intent-menu);color:var(--intent-ink);box-shadow:0 4px 24px #0003;width:272px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:hidden;font:14px Roboto,Arial,sans-serif}.menu::backdrop{background:transparent}.menu-heading{font-size:12px;font-weight:500;color:var(--intent-ink);padding:6px 16px 4px;margin:0}.coverage-detail{font-size:12px;line-height:16px;color:var(--intent-muted);padding:0 16px 8px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.options{max-height:320px;overflow:auto;overscroll-behavior:contain;padding:0 6px}.option{display:flex;align-items:center;gap:12px;min-height:40px;width:100%;padding:9px 12px;text-align:left;border-radius:12px;line-height:1.4;overflow-wrap:anywhere}.option[aria-selected=true]{background:var(--intent-chip);font-weight:500}.option:focus-visible{outline-offset:-2px}.option-symbol svg{width:20px;height:20px}.option-symbol{display:inline-grid;place-items:center;width:20px;height:24px;flex:0 0 20px;font-size:19px;line-height:1}.option-name{flex:1;min-width:0}.check{width:18px;height:18px;flex:0 0 18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;visibility:hidden}.option[aria-selected=true] .check{visibility:visible}.menu-footer{margin-top:6px;border-top:1px solid var(--intent-line);padding:6px 6px 0}.pause-button{display:flex;align-items:center;gap:12px;width:100%;min-height:40px;padding:9px 12px;border-radius:12px;font-size:13px;text-align:left}.pause-button svg{width:18px;height:18px;flex:0 0 18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.error{position:absolute;top:46px;left:0;max-width:280px;border-radius:8px;padding:10px 12px;background:var(--intent-menu);color:inherit;box-shadow:0 2px 10px #0003;font-size:12px;white-space:normal;z-index:10}.error:empty{display:none}
@media(max-width:1100px){.settings{display:none}:host{width:210px;min-width:210px;max-width:210px;flex-basis:210px;margin-right:8px}}@media(max-width:700px){:host{width:170px;min-width:170px;max-width:170px;flex-basis:170px;margin-right:4px}.controls{height:34px;padding:0 2px}.trigger{height:34px;gap:5px;padding:0 6px 0 4px}.mode-name{font-size:12px}.trigger:has(.selected-symbol:not([hidden])){gap:3px;padding-right:4px}.icon-button{width:28px;height:28px;flex-basis:28px}}@media(max-width:480px){:host{width:154px;min-width:154px;max-width:154px;flex-basis:154px}.coverage-badge{max-width:65px;padding:2px 4px}.trigger{gap:4px}.trigger:has(.selected-symbol:not([hidden])){gap:2px;padding-right:2px}.selected-symbol{width:12px;flex-basis:12px;font-size:12px}.chevron{width:10px;flex-basis:10px}}


.timer-indicator{flex:0 0 76px;display:flex;align-items:center;justify-content:center;gap:4px;width:76px;height:30px;padding:4px 6px;border-radius:15px;cursor:default;color:var(--intent-accent);font-size:11px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}.timer-indicator[data-tab-counting=false][data-timer-state=normal]{color:var(--intent-muted)}.timer-indicator[data-timer-state=low]{color:var(--intent-warning)}.timer-indicator[data-timer-state=critical]{color:var(--intent-critical)}.timer-indicator[data-timer-state=exempt],.timer-indicator[data-timer-state=paused],.timer-indicator[data-timer-state=unlimited],.timer-indicator[data-timer-state=loading]{color:var(--intent-muted)}.timer-clock{display:block;flex:0 0 18px;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.timer-track{stroke:var(--intent-line);stroke-width:1.3}.timer-progress{stroke-width:1.5;transition:none;animation:none}.timer-value{flex:0 0 auto;white-space:nowrap;line-height:16px}.timer-indicator:focus-visible{outline:2px solid var(--intent-accent);outline-offset:2px}.timer-mobile{display:none}.timer-details{padding:12px 14px;border-radius:12px;font-size:12px;white-space:normal;pointer-events:auto}.timer-detail-heading{font-size:13px;font-weight:500;margin:0}.timer-stats{margin:10px 0}.timer-stat{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:6px 0}.timer-stats dt{color:var(--intent-muted)}.timer-stats dd{margin:0;font-variant-numeric:tabular-nums}.timer-context,.timer-reset{font-size:12px;line-height:17px;color:var(--intent-muted);margin:8px 0 0}
:host([data-filter-state=off-here]) .trigger,:host([data-filter-state=loading]) .trigger,:host([data-filter-state=unavailable]) .trigger{padding:0 3px;gap:2px}.compact-state{min-width:0;flex:1 1 0;text-align:left;overflow:hidden;text-overflow:ellipsis;font-size:12px;white-space:nowrap}:host([data-filter-state=off-here]) .compact-state,:host([data-filter-state=loading]) .compact-state,:host([data-filter-state=unavailable]) .compact-state{display:block}:host([data-filter-state=off-here]) .mode-name,:host([data-filter-state=loading]) .mode-name,:host([data-filter-state=unavailable]) .mode-name,:host([data-filter-state=off-here]) .coverage-badge,:host([data-filter-state=loading]) .coverage-badge,:host([data-filter-state=unavailable]) .coverage-badge,:host([data-filter-state=off-here]) .selected-symbol,:host([data-filter-state=loading]) .selected-symbol,:host([data-filter-state=unavailable]) .selected-symbol{display:none!important}
@media(max-width:700px){.timer-indicator{flex-basis:42px;width:42px;height:28px;padding:2px;gap:2px;font-size:10px}.timer-clock{flex-basis:12px;width:12px;height:12px}.timer-desktop{display:none}.timer-mobile{display:inline}.trigger{padding:0 3px;gap:2px}.trigger:has(.selected-symbol:not([hidden])){padding:0 3px;gap:2px}.compact-state{min-width:0;flex:1 1 0;text-align:left;overflow:hidden;text-overflow:ellipsis;font-size:10px;white-space:nowrap}:host([data-filter-state=off-here]) .compact-state,:host([data-filter-state=loading]) .compact-state,:host([data-filter-state=unavailable]) .compact-state{display:block}:host([data-filter-state=off-here]) .mode-name,:host([data-filter-state=loading]) .mode-name,:host([data-filter-state=unavailable]) .mode-name,:host([data-filter-state=off-here]) .coverage-badge,:host([data-filter-state=loading]) .coverage-badge,:host([data-filter-state=unavailable]) .coverage-badge,:host([data-filter-state=off-here]) .selected-symbol,:host([data-filter-state=loading]) .selected-symbol,:host([data-filter-state=unavailable]) .selected-symbol{display:none!important}}
@media(max-width:700px){:host([data-filter-state=off]) .trigger,:host([data-filter-state=paused]) .trigger{padding:0 2px}:host([data-filter-state=off]) .mode-name,:host([data-filter-state=paused]) .mode-name{font-size:11px}}
/* Controls occupy only unused masthead space, never the search flex row. */
:host{position:fixed;flex:none;width:var(--intent-toolbar-width,250px);min-width:var(--intent-toolbar-width,250px);max-width:var(--intent-toolbar-width,250px);margin:0;z-index:1}
:host([data-layout=hidden]){display:none}
:host([data-layout=full]) .controls{height:36px}
:host([data-layout=full]) .settings{display:grid}
:host([data-layout=compact]) .controls{height:34px;padding:0 2px}
:host([data-layout=launcher]) .controls{height:32px;padding:0}
:host([data-layout=compact]) .trigger,:host([data-layout=launcher]) .trigger{height:32px;padding:0;gap:2px;justify-content:center}
:host([data-layout=compact]) .chevron,:host([data-layout=launcher]) .chevron{width:8px;flex-basis:8px}
:host([data-layout=compact]) .mode-name,:host([data-layout=compact]) .compact-state,:host([data-layout=compact]) .selected-symbol,:host([data-layout=compact]) .coverage-badge,:host([data-layout=compact]) .icon-button,:host([data-layout=launcher]) .mode-name,:host([data-layout=launcher]) .compact-state,:host([data-layout=launcher]) .selected-symbol,:host([data-layout=launcher]) .coverage-badge,:host([data-layout=launcher]) .icon-button,:host([data-layout=launcher]) .timer-indicator{display:none!important}
:host([data-layout=compact]) .timer-indicator{flex-basis:42px;width:42px;height:28px;padding:2px;gap:2px;font-size:10px}
:host([data-layout=compact]) .timer-clock{flex-basis:12px;width:12px;height:12px}
:host([data-layout=compact]) .timer-desktop{display:none}
:host([data-layout=compact]) .timer-mobile{display:inline}
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
      this.open = false; this.timerOpen = false;
      this.outside = event => { if (!event.composedPath().includes(this.host)) {this.closeMenu(false); this.closeTimer();} };
      this.reposition = () => { if (this.open) this.positionMenu(); if (this.timerOpen) this.positionTimer(); };
      this.layoutReposition = () => {this.positionControls(); this.reposition();};
    }
    sync(settings, active = true, coverage = {state: 'active'}) {
      if (!active) { this.destroy(); return; }
      this.settings = settings;
      const state = ['active', 'loading', 'unavailable', 'off-here', 'paused'].includes(coverage?.state) ? coverage.state : 'active';
      this.coverage = {state, detail: typeof coverage?.detail === 'string' ? coverage.detail : ''};
      if (state !== 'paused') this.resumeCoverage = {...this.coverage};
      const masthead = document.querySelector('ytd-masthead:not([hidden])');
      const center = masthead?.querySelector('#center');
      const container = masthead?.querySelector('#container') || masthead;
      const start = masthead?.querySelector('#start');
      // Unsupported/mobile mastheads get no detached banner or replacement navigation.
      if (!center || !start) { this.destroy(); return; }
      if (!this.host) this.create();
      this.updateOptions(settings); this.paintSelection();
      if (this.host.parentElement !== container) {
        this.closeMenu(false); this.closeTimer();
        if (this.masthead !== masthead) this.masthead?.removeAttribute('data-intent-toolbar');
        container.append(this.host);
      }
      if (this.masthead !== masthead || this.center !== center || this.start !== start) {
        this.layoutObserver?.disconnect();
        this.layoutObserver = new ResizeObserver(this.layoutReposition);
        for (const element of [masthead, center, start]) this.layoutObserver.observe(element);
      }
      this.center = center; this.start = start;
      this.masthead = masthead; masthead.setAttribute('data-intent-toolbar', '');
      window.addEventListener('resize', this.layoutReposition); window.addEventListener('scroll', this.layoutReposition, true);
      this.positionControls(); this.updateTheme(); this.paintTimer();
      if (this.open) this.positionMenu();
    }
    positionControls() {
      if (!this.host?.isConnected || !this.masthead || !this.center || !this.start) return;
      const masthead = this.masthead.getBoundingClientRect(), start = this.start.getBoundingClientRect(), center = this.center.getBoundingClientRect();
      const logoGap = innerWidth > 700 ? 28 : 12;
      const left = Math.max(8, start.right + logoGap), available = Math.min(center.left, innerWidth - 8) - left - 12;
      const layout = masthead.height <= 0 || center.width <= 0 ? 'hidden' : available >= 250 ? 'full' : available >= 76 ? 'compact' : available >= 32 ? 'launcher' : 'hidden';
      const width = layout === 'full' ? 250 : layout === 'compact' ? 76 : 32;
      this.host.dataset.layout = layout; this.host.style.setProperty('--intent-toolbar-width', `${width}px`);
      this.host.style.left = `${Math.round(left)}px`; this.host.style.top = `${Math.round(masthead.top + (masthead.height - (layout === 'full' ? 36 : layout === 'compact' ? 34 : 32)) / 2)}px`;
      if (layout === 'launcher') this.closeTimer();
      if (layout === 'hidden') {this.closeMenu(false); this.closeTimer();}
    }
    create() {
      this.host = document.createElement('div'); this.host.id = 'intent-toolbar';
      const root = this.root = this.host.attachShadow({mode: 'open'});
      const style = document.createElement('style'); style.textContent = CSS;
      const controls = document.createElement('div'); controls.className = 'controls'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Intent controls');
      this.trigger = document.createElement('button'); this.trigger.type = 'button'; this.trigger.className = 'trigger'; this.trigger.id = 'intent-mode-trigger';
      this.trigger.setAttribute('role', 'combobox'); this.trigger.setAttribute('aria-label', 'Intent mode'); this.trigger.setAttribute('aria-haspopup', 'listbox'); this.trigger.setAttribute('aria-expanded', 'false'); this.trigger.setAttribute('aria-controls', 'intent-mode-menu'); this.trigger.setAttribute('aria-describedby', 'intent-filter-status');
      // Inline the original circle/segment mark: no cross-origin extension image
      // request for YouTube to reject during navigation or extension reloads.
      const logo = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); logo.setAttribute('class', 'logo'); logo.setAttribute('viewBox', '0 0 128 128'); logo.setAttribute('aria-hidden', 'true');
      logo.innerHTML = '<circle cx="64" cy="64" r="59" fill="#3b5b3f"/><path d="M33 40 99 82A40 40 0 1 1 33 40Z" fill="#f3f5e6"/>';
      this.modeName = document.createElement('span'); this.modeName.className = 'mode-name';
      this.selectedSymbol = document.createElement('span'); this.selectedSymbol.className = 'selected-symbol'; this.selectedSymbol.setAttribute('aria-hidden', 'true'); this.selectedSymbol.hidden = true;
      this.coverageBadge = document.createElement('span'); this.coverageBadge.className = 'coverage-badge'; this.coverageBadge.setAttribute('aria-hidden', 'true');
      this.compactState = document.createElement('span'); this.compactState.className = 'compact-state'; this.compactState.setAttribute('aria-hidden', 'true');
      this.trigger.append(logo, this.selectedSymbol, this.modeName, this.compactState, this.coverageBadge, svg('m6 9 6 6 6-6', 'chevron'));
      this.coverageStatus = document.createElement('span'); this.coverageStatus.className = 'sr-only'; this.coverageStatus.id = 'intent-filter-status'; this.coverageStatus.setAttribute('role', 'status'); this.coverageStatus.setAttribute('aria-live', 'polite');
      this.trigger.addEventListener('click', () => this.open ? this.closeMenu(true) : this.openMenu());
      this.trigger.addEventListener('keydown', event => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); this.openMenu(event.key === 'Home' ? 0 : event.key === 'End' ? this.options.length - 1 : undefined);
        } else if (event.key === 'Escape' && this.open) { event.preventDefault(); this.closeMenu(true); }
        else if (event.key === 'Tab') this.closeMenu(false);
      });
      const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'icon-button refresh'; refresh.append(svg('M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11.5-1L20 9M4 15l2.5 3A7 7 0 0 0 18 17')); refresh.title = 'Refresh feed'; refresh.setAttribute('aria-label', 'Refresh feed');
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
      this.createTimer(root, controls, refresh);
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
        const glyph = document.createElement('span'); glyph.className = 'option-symbol'; glyph.setAttribute('aria-hidden', 'true'); if (IntentCore.MODE_ICONS?.[id]) {
          const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '1.5'); icon.setAttribute('stroke-linecap', 'round'); icon.setAttribute('stroke-linejoin', 'round'); icon.innerHTML = IntentCore.MODE_ICONS[id]; glyph.append(icon);
        } else glyph.textContent = symbol;
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
      const offExempt = !IntentCore.countsMode(this.settings, 'off');
      const defaults = {
        active: 'Intent filtering is on for Home and video recommendations in this tab. Shorts/clickbait rules and timer still apply.',
        loading: 'Intent recommendations are loading. Unrelated recommendations are hidden while matching videos are found. Shorts/clickbait rules and timer still apply.',
        unavailable: 'Intent filtering is unavailable here because matching recommendations could not load. Shorts/clickbait rules and timer still apply.',
        'off-here': 'Intent filtering is off on search results. Saved intent applies on Home/video recommendations. Shorts/clickbait rules and timer still apply.',
        paused: 'Intent is paused for this tab. Your saved intent is kept. Resume Intent to apply it again.',
        off: `Intent topic filtering is turned off for this tab. Choose an intent to filter Home/video recommendations. Distraction rules still apply. ${offExempt ? 'Modes-off browsing is exempt from the daily timer.' : 'Configured timer rules still apply.'}`
      };
      const detail = state === 'off' ? defaults.off : this.coverage?.detail || defaults[state];
      const label = {'off-here': 'Off here', loading: 'Loading', unavailable: 'Unavailable'}[state] || '';
      const custom = Object.hasOwn(this.settings.customIntents || {}, this.settings.mode);
      this.selectedSymbol.textContent = IntentCore.modes(this.settings)[this.settings.mode]?.symbol || '◒';
      this.selectedSymbol.hidden = !custom || state === 'paused' || this.settings.mode === 'off';
      this.modeName.textContent = state === 'paused' ? 'Paused' : this.settings.mode === 'off' ? 'Intent off' : this.savedModeName;
      this.host.dataset.filterState = state; this.trigger.dataset.filterState = state;
      this.compactState.textContent = label; this.coverageBadge.textContent = label; this.coverageBadge.hidden = !label;
      if (this.coverageStatus.textContent !== detail) this.coverageStatus.textContent = detail;
      const shortDetail = {
        active: 'Filtering Home and recommendations',
        loading: 'Loading matching recommendations…',
        unavailable: 'Unavailable · refresh to retry',
        'off-here': 'Off here · intent saved',
        paused: 'Paused on this tab',
        off: `Topic filtering off · ${offExempt ? 'timer exempt' : 'timer rules apply'}`
      }[state];
      this.coverageDetail.textContent = shortDetail; this.coverageDetail.title = detail;
      this.menuHeading.textContent = state === 'off' ? 'Intent is off' : state === 'paused' ? 'Intent paused' : 'Intent for this tab';
      const paused = state === 'paused';
      this.pauseLabel.textContent = paused ? 'Resume on this tab' : 'Pause on this tab'; this.pauseButton.dataset.paused = String(paused); this.pauseButton.disabled = Boolean(this.pausePending);
      this.pauseIcon.firstElementChild.setAttribute('d', paused ? 'm8 5 11 7-11 7z' : 'M8 5v14M16 5v14');
      this.trigger.title = state === 'off' ? `Intent is off. ${detail}` : `Saved intent: ${this.savedModeName}. ${detail}`;
      this.refreshButton.disabled = Boolean(this.refreshPending) || state === 'off-here' || state === 'off' || state === 'paused';
    }
    selectedIndex() { return Math.max(0, this.options.findIndex(option => option.dataset.mode === this.settings.mode)); }
    focusOption(index) {
      const option = this.options[Math.max(0, Math.min(this.options.length - 1, index))];
      if (option) { option.focus({preventScroll: true}); option.scrollIntoView({block: 'nearest'}); }
    }
    openMenu(index = this.selectedIndex()) {
      if (this.timerOpen) this.closeTimer();
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
        this.updateTimer(result); this.settings = result.settings; this.updateOptions(this.settings); this.paintSelection(); this.onSettings(result.settings);
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
        this.updateTimer(result);
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
    createTimer(root, controls, before) {
      this.timerIndicator = document.createElement('span'); this.timerIndicator.tabIndex = 0; this.timerIndicator.setAttribute('role', 'group'); this.timerIndicator.id = 'intent-timer'; this.timerIndicator.className = 'timer-indicator';
      this.timerIndicator.setAttribute('aria-label', 'Daily YouTube timer'); this.timerIndicator.setAttribute('aria-describedby', 'intent-timer-tooltip');
      this.timerClock = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); this.timerClock.setAttribute('viewBox', '0 0 28 28'); this.timerClock.setAttribute('class', 'timer-clock'); this.timerClock.setAttribute('aria-hidden', 'true');
      this.timerClock.innerHTML = '<circle class="timer-track" cx="14" cy="14" r="11"/><circle class="timer-progress" cx="14" cy="14" r="11" stroke-dasharray="69.12" transform="rotate(-90 14 14)"/><path class="timer-hands" d="M14 8v6l4 3"/><path class="timer-slash" d="M5 23 23 5" hidden/>';
      this.timerProgress = this.timerClock.querySelector('.timer-progress'); this.timerHands = this.timerClock.querySelector('.timer-hands'); this.timerSlash = this.timerClock.querySelector('.timer-slash');
      this.timerValue = document.createElement('span'); this.timerValue.className = 'timer-value';
      this.timerDesktop = document.createElement('span'); this.timerDesktop.className = 'timer-desktop'; this.timerMobile = document.createElement('span'); this.timerMobile.className = 'timer-mobile'; this.timerValue.append(this.timerDesktop, this.timerMobile);
      this.timerIndicator.append(this.timerClock, this.timerValue); controls.insertBefore(this.timerIndicator, before);
      this.timerIndicator.addEventListener('pointerenter', () => {this.timerHovered = true; this.openTimer();});
      this.timerIndicator.addEventListener('pointerleave', () => {this.timerHovered = false; this.deferTimerClose();});
      this.timerIndicator.addEventListener('focus', () => this.openTimer());
      this.timerIndicator.addEventListener('blur', () => this.deferTimerClose());
      this.timerPopover = document.createElement('div'); this.timerPopover.className = 'menu timer-details'; this.timerPopover.id = 'intent-timer-tooltip'; this.timerPopover.setAttribute('popover', 'manual'); this.timerPopover.setAttribute('role', 'tooltip');
      const heading = document.createElement('p'); heading.className = 'timer-detail-heading'; heading.textContent = 'Daily budget';
      const stats = document.createElement('dl'); stats.className = 'timer-stats';
      const row = (label, id) => {const wrapper = document.createElement('div'); wrapper.className = 'timer-stat'; const term = document.createElement('dt'); term.textContent = label; const value = document.createElement('dd'); value.id = id; wrapper.append(term, value); stats.append(wrapper); return value;};
      this.timerRemaining = row('Remaining', 'intent-timer-remaining'); this.timerUsed = row('Used', 'intent-timer-used');
      this.timerContext = document.createElement('p'); this.timerContext.className = 'timer-context'; this.timerContext.id = 'intent-timer-context';
      const reset = document.createElement('p'); reset.className = 'timer-reset'; reset.textContent = 'Resets at local midnight.';
      this.timerPopover.append(heading, stats, this.timerContext, reset);
      this.timerPopover.addEventListener('pointerenter', () => {this.timerTooltipHovered = true; clearTimeout(this.timerCloseTimeout);});
      this.timerPopover.addEventListener('pointerleave', () => {this.timerTooltipHovered = false; this.deferTimerClose();});
      this.timerEscape = event => {if (event.key === 'Escape' && this.timerOpen) {event.preventDefault(); event.stopPropagation(); this.closeTimer();}};
      this.timerPopover.addEventListener('toggle', event => {if (event.newState === 'closed' && this.timerOpen) this.closeTimer();});
      root.append(this.timerPopover);
    }
    deferTimerClose() {
      clearTimeout(this.timerCloseTimeout);
      this.timerCloseTimeout = setTimeout(() => {
        if (!this.timerHovered && !this.timerTooltipHovered && this.root.activeElement !== this.timerIndicator) this.closeTimer();
      }, 120);
    }

    updateTimer(state) {
      // Only explicit accounting snapshots can advance this indicator. Coverage and
      // intent labels are deliberately not used to guess whether time is counting.
      if (!state?.settings || !Number.isFinite(state.usedMs) || !Number.isFinite(state.remainingMs)) return;
      this.timerState = {...state}; this.paintTimer();
    }
    timerDuration(milliseconds, roundUp = false) {
      const minutes = Math.max(0, (roundUp ? Math.ceil : Math.floor)(milliseconds / 60000));
      if (minutes < 60) return `${minutes} min`;
      const hours = Math.floor(minutes / 60), rest = minutes % 60;
      return `${hours}h${rest ? ` ${rest}m` : ''}`;
    }
    paintTimer() {
      if (!this.timerIndicator) return;
      const state = this.timerState, valid = Boolean(state?.settings && Number.isFinite(state.usedMs) && Number.isFinite(state.remainingMs));
      const used = valid ? Math.max(0, state.usedMs) : 0, remaining = valid ? Math.max(0, state.remainingMs) : 0;
      const paused = valid && state.tabPaused === true, exempt = valid && state.timerExempt === true, unlimited = valid && state.settings.limitEnabled === false;
      const level = !valid ? 'loading' : paused ? 'paused' : exempt ? 'exempt' : unlimited ? 'unlimited' : remaining <= 120000 ? 'critical' : remaining <= 600000 ? 'low' : 'normal';
      const running = valid && state.timerRunning === true, counting = valid && state.tabCounting === true;
      for (const element of [this.host, this.timerIndicator]) {element.dataset.timerState = level; element.dataset.timerRunning = String(running); element.dataset.tabCounting = String(counting);}
      let desktop = '—', mobile = '—';
      if (valid && !paused && !exempt) {
        const minutes = Math.max(0, unlimited ? Math.floor(used / 60000) : Math.ceil(remaining / 60000));
        const compact = minutes > 99 ? `${Math.floor(minutes / 60)}h` : null;
        desktop = compact || `${minutes}m`; mobile = compact || String(minutes);
      } else if (exempt && !paused) desktop = 'Exempt';
      this.timerDesktop.textContent = desktop; this.timerMobile.textContent = mobile;
      this.timerHands.setAttribute('d', paused ? 'M11 9v10M17 9v10' : 'M14 8v6l4 3');
      this.timerSlash.toggleAttribute('hidden', !exempt || paused);
      this.timerProgress.toggleAttribute('hidden', !valid || paused || exempt || unlimited);
      const ratio = valid && state.settings.dailyMinutes > 0 ? Math.max(0, Math.min(1, remaining / (state.settings.dailyMinutes * 60000))) : 0;
      this.timerProgress.setAttribute('stroke-dashoffset', (69.12 * (1 - ratio)).toFixed(2));
      this.timerUsed.textContent = valid ? this.timerDuration(used) : '—'; this.timerRemaining.textContent = !valid ? '—' : unlimited ? 'No limit' : this.timerDuration(remaining, true);
      let context = 'Timer status is loading.';
      if (valid) {
        if (paused) context = 'This tab is paused. Other tabs can still use the shared timer.';
        else if (exempt) context = unlimited ? 'This intent is timer-exempt. The daily limit is off.' : 'This intent is timer-exempt. Other counted tabs can still use today’s budget.';
        else if (counting) context = unlimited ? 'This tab is tracking usage. The daily limit is off.' : 'This tab is currently counting toward the daily budget.';
        else if (running) context = 'Another YouTube tab is currently using the shared timer.';
        else context = unlimited ? 'The daily limit is off. Counted usage is still tracked.' : 'The timer is not currently counting.';
      }
      this.timerContext.textContent = context;
      this.timerIndicator.setAttribute('aria-label', valid ? `Daily YouTube timer: ${unlimited ? 'no limit' : this.timerDuration(remaining, true) + ' remaining'}` : 'Daily YouTube timer: loading');
      if (this.timerOpen) this.positionTimer();
    }
    openTimer() {
      if (!this.host?.isConnected || ['launcher', 'hidden'].includes(this.host.dataset.layout) || this.open) return;
      clearTimeout(this.timerCloseTimeout);
      if (!this.timerOpen) {
        this.timerOpen = true; this.timerPopover.showPopover(); document.addEventListener('keydown', this.timerEscape);
        document.addEventListener('pointerdown', this.outside, true); window.addEventListener('resize', this.reposition); window.addEventListener('scroll', this.reposition, true);
      }
      this.positionTimer();
    }
    positionTimer() {
      if (!this.host?.isConnected) {this.closeTimer(); return;}
      const rect = this.timerIndicator.getBoundingClientRect(), edge = 8, width = Math.min(272, innerWidth - edge * 2);
      this.timerPopover.style.width = `${Math.max(0, width)}px`; this.timerPopover.style.left = `${Math.max(edge, Math.min(rect.left, innerWidth - width - edge))}px`;
      const height = this.timerPopover.getBoundingClientRect().height, below = innerHeight - rect.bottom - 6;
      this.timerPopover.style.top = `${Math.max(edge, Math.min(height > below && rect.top > below ? rect.top - height - 6 : rect.bottom + 6, innerHeight - height - edge))}px`;
    }
    closeTimer() {
      clearTimeout(this.timerCloseTimeout);
      if (!this.timerPopover || !this.timerOpen) return;
      this.timerOpen = false; this.timerTooltipHovered = false; document.removeEventListener('keydown', this.timerEscape);
      if (this.timerPopover.matches(':popover-open')) this.timerPopover.hidePopover();
      document.removeEventListener('pointerdown', this.outside, true); window.removeEventListener('resize', this.reposition); window.removeEventListener('scroll', this.reposition, true);
    }
    updateTheme() {
      if (!this.host) return;
      const theme = IntentHome.theme();
      if (this.host.dataset.theme !== theme) this.host.dataset.theme = theme;
    }
    destroy() {
      this.closeMenu(false); this.closeTimer(); this.layoutObserver?.disconnect();
      window.removeEventListener('resize', this.layoutReposition); window.removeEventListener('scroll', this.layoutReposition, true);
      this.host?.remove(); this.masthead?.removeAttribute('data-intent-toolbar'); this.masthead = null;
    }
  }
  globalThis.IntentToolbar = Toolbar;
})();
