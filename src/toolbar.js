/* Explicit intent controls to the left of YouTube's search field. The native masthead stays in charge of layout. */
(() => {
  const CSS = `:host{position:relative;display:block;flex:0 0 auto;min-width:0;margin-right:12px;font:14px Roboto,Arial,sans-serif;color:var(--yt-spec-text-primary,#0f0f0f);color-scheme:light;--intent-chip:#f2f2f2;--intent-hover:#e5e5e5;--intent-ink:#0f0f0f;--intent-line:#ddd}:host([data-theme=dark]){color-scheme:dark;--intent-chip:#272727;--intent-hover:#3f3f3f;--intent-ink:#f1f1f1;--intent-line:#3f3f3f;color:var(--yt-spec-text-primary,var(--intent-ink))}*{box-sizing:border-box}.controls{display:flex;align-items:center;gap:0;white-space:nowrap;background:var(--yt-spec-badge-chip-background,var(--intent-chip));border:1px solid var(--intent-line);border-radius:20px;padding:0 4px 0 12px;height:38px}.mode{display:flex;align-items:center;gap:7px;min-width:0}.label{font-size:12px;font-weight:500;opacity:.7}select{font:inherit;font-size:14px;font-weight:500;width:auto;max-width:140px;min-width:0;border:0;color:inherit;background:transparent;padding:6px 4px 6px 0;cursor:pointer}option{background:var(--intent-chip);color:var(--intent-ink)}button{font:inherit;border:0;border-radius:50%;background:transparent;color:inherit;width:30px;height:30px;display:grid;place-items:center;cursor:pointer}button svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}button:hover{background:var(--intent-hover)}button:disabled,select:disabled{opacity:.5;cursor:wait}button:focus-visible,select:focus-visible{outline:2px solid #3ea6ff;outline-offset:2px}.error{position:absolute;top:46px;left:0;max-width:280px;border-radius:8px;padding:10px 12px;background:var(--intent-chip);color:inherit;box-shadow:0 2px 10px #0003;font-size:12px;white-space:normal;z-index:10}.error:empty{display:none}@media(max-width:1100px){.settings{display:none}:host{margin-right:8px}select{max-width:100px}}@media(max-width:700px){:host{margin-right:4px}.controls{height:34px;padding-left:8px}.mode{gap:4px}select{font-size:12px;max-width:78px}.label{font-size:11px}button{width:26px;height:26px}}@media(max-width:480px){select{max-width:62px}.controls{padding-right:1px}.mode{gap:3px}}`;
  class Toolbar {
    constructor(runtime = chrome.runtime, {onSettings = () => {}, onRefresh = () => {}} = {}) {
      this.runtime = runtime; this.onSettings = onSettings; this.onRefresh = onRefresh;
    }
    sync(settings, active = true) {
      if (!active || settings.mode === 'off') { this.destroy(); return; }
      this.settings = settings;
      const masthead = document.querySelector('ytd-masthead:not([hidden])');
      const center = masthead?.querySelector('#center');
      // Unsupported/mobile mastheads get no detached banner or replacement navigation.
      if (!center) { this.destroy(); return; }
      if (!this.host) this.create();
      this.updateOptions(settings);
      if (this.host.parentElement !== center) {
        if (this.masthead !== masthead) this.masthead?.removeAttribute('data-intent-toolbar');
        const search = [...center.children].find(el => el.matches('yt-searchbox,ytd-searchbox,#search,form[role=search]') || el.querySelector('yt-searchbox,ytd-searchbox,#search-form,form[role=search]'));
        if (search) search.before(this.host); else center.prepend(this.host);
      }
      this.masthead = masthead; masthead.setAttribute('data-intent-toolbar', '');
      this.select.value = settings.mode;
      this.updateTheme();
    }
    create() {
      this.host = document.createElement('div'); this.host.id = 'intent-toolbar';
      const root = this.host.attachShadow({mode: 'open'});
      const style = document.createElement('style'); style.textContent = CSS;
      const controls = document.createElement('div'); controls.className = 'controls'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Intent controls');
      const mode = document.createElement('label'); mode.className = 'mode';
      const label = document.createElement('span'); label.className = 'label'; label.textContent = 'Intent'; label.setAttribute('aria-hidden', 'true');
      this.select = document.createElement('select'); this.select.setAttribute('aria-label', 'Intent mode');
      
      this.select.addEventListener('change', async () => {
        const selected = this.select.value; this.select.disabled = true; this.error.textContent = '';
        try {
          const result = await this.runtime.sendMessage({type: 'SET_MODE', mode: selected});
          if (!result?.ok || !result.settings) throw new Error(result?.error || 'Intent could not change mode. Try again.');
          this.onSettings(result.settings);
        } catch (error) { this.select.value = this.settings.mode; this.error.textContent = error.message; }
        finally { this.select.disabled = false; }
      });
      mode.append(label, this.select);
      const refresh = document.createElement('button'); refresh.type = 'button'; refresh.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11.5-1L20 9M4 15l2.5 3A7 7 0 0 0 18 17"/></svg>'; refresh.title = 'Refresh feed'; refresh.setAttribute('aria-label', 'Refresh feed');
      refresh.addEventListener('click', async () => {
        refresh.disabled = true; this.error.textContent = '';
        try { await this.onRefresh(); } catch (error) { this.error.textContent = error.message; }
        finally { refresh.disabled = false; }
      });
      const settings = document.createElement('button'); settings.type = 'button'; settings.className = 'settings'; settings.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-.7 2.3-2.4 1.4L3.5 6l-2 3.5 1.8 1.6v2.8l-1.8 1.6L3.5 19l2.4-.7 2.4 1.4L9 22h4l.7-2.3 2.4-1.4 2.4.7 2-3.5-1.8-1.6v-2.8l1.8-1.6-2-3.5-2.4.7-2.4-1.4L13 3z" transform="translate(1 0) scale(.95)"/><circle cx="12" cy="12.5" r="3"/></svg>'; settings.title = 'Intent settings'; settings.setAttribute('aria-label', 'Intent settings');
      settings.addEventListener('click', () => this.runtime.sendMessage({type: 'OPEN_SETTINGS'}).catch(error => { this.error.textContent = error.message; }));
      this.error = document.createElement('div'); this.error.className = 'error'; this.error.setAttribute('role', 'status');
      controls.append(mode, refresh, settings); root.append(style, controls, this.error);
    }
    updateOptions(settings) {
      const options = [...Object.entries(IntentCore.modes(settings)).map(([id, item]) => [id, item.name]), ['off', 'Off']];
      const signature = JSON.stringify(options);
      if (signature === this.optionSignature) return;
      this.optionSignature = signature;
      this.select.replaceChildren(...options.map(([value, name]) => {
        const option = document.createElement('option'); option.value = value; option.textContent = name; return option;
      }));
    }
    updateTheme() {
      if (!this.host) return;
      const theme = IntentHome.theme();
      if (this.host.dataset.theme !== theme) this.host.dataset.theme = theme;
    }
    destroy() {
      this.host?.remove(); this.masthead?.removeAttribute('data-intent-toolbar'); this.masthead = null;
    }
  }
  globalThis.IntentToolbar = Toolbar;
})();
