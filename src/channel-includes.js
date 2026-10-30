/* A watch-page channel shortcut; saved rules share the existing intent settings. */
(() => {
  const C = IntentCore;
  const CSS = `
:host{display:inline-flex;vertical-align:middle;align-self:center;margin-inline:12px;flex:0 0 auto;font:14px Roboto,Arial,sans-serif;color:var(--yt-spec-text-primary,#0f0f0f);--accent:#365e4b;--panel:#fff;--muted:#606060;--line:#0002;--hover:#0001;color-scheme:light}
:host([data-theme=dark]){--accent:#9cc7ab;--panel:#282828;--muted:#aaa;--line:#fff3;--hover:#fff1;color:#f1f1f1;color-scheme:dark}
*{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;cursor:pointer;color:inherit}button:disabled{opacity:.55;cursor:wait}button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.trigger{display:grid;place-items:center;width:36px;height:36px;border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);border-radius:50%;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);padding:7px}.trigger:hover{background:color-mix(in srgb,var(--accent) 22%,transparent)}.trigger[data-saved=true]{background:color-mix(in srgb,var(--accent) 22%,transparent)}svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}
.panel{position:fixed;inset:auto;margin:0;width:min(360px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain;border:1px solid var(--line);border-radius:16px;background:var(--panel);color:inherit;box-shadow:0 8px 28px #0005;padding:0;font:14px/1.4 Roboto,Arial,sans-serif}.heading{display:flex;align-items:center;gap:12px;padding:16px 16px 4px}.heading h2{font-size:16px;font-weight:600;flex:1;margin:0}.close{display:grid;place-items:center;border:0;background:transparent;border-radius:50%;width:32px;height:32px;padding:6px}.close:hover{background:var(--hover)}.channel{margin:0;padding:0 16px 12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.list{max-height:45dvh;overflow:auto;padding:0 8px 8px}.row{display:flex;align-items:center;gap:14px;min-height:52px;border-radius:8px;padding:8px;cursor:pointer}.row:hover{background:var(--hover)}.row>svg{width:24px;height:24px}.name{min-width:0;flex:1;overflow-wrap:anywhere}.name small{display:block;color:var(--muted);font-size:12px;font-weight:400}input{width:18px;height:18px;accent-color:var(--accent);flex:none;cursor:pointer}.footer{padding:12px 16px 16px;border-top:1px solid var(--line)}.hint,.status{font-size:12px;color:var(--muted);margin:0 0 12px}.status:empty{display:none}.status[role=alert]{color:#d85c54}.actions{display:flex;justify-content:flex-end;gap:8px}.actions button{min-height:36px;border-radius:20px;padding:7px 16px;font-weight:500}.cancel{background:transparent;border:1px solid var(--line)}.cancel:hover{background:var(--hover)}.save{background:var(--accent);color:var(--panel);border:1px solid transparent}@media(pointer:coarse){.trigger,.close{width:44px;height:44px}.actions button{min-height:44px}}@media(forced-colors:active){button,.panel{border:1px solid ButtonText}}
`;
  function icon(markup) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('viewBox', '0 0 24 24'); node.setAttribute('aria-hidden', 'true'); node.innerHTML = markup; return node;
  }
  class ChannelIncludes {
    constructor(runtime = chrome.runtime, onSettings = () => {}) {
      this.runtime = runtime; this.onSettings = onSettings;
      this.outside = event => {if (this.open && !event.composedPath().includes(this.host)) this.close(false);};
      this.escape = event => {if (this.open && event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); this.close(true);}};
      this.reposition = () => {if (this.open) this.position();};
    }
    sync(settings, current) {
      if (!current?.anchor?.isConnected || !current.channel?.trim()) {this.destroy(); return;}
      const identity = JSON.stringify([current.videoId, current.channel]);
      const config = JSON.stringify([settings.mode, settings.intentOrder, settings.intentNames, settings.customIntents, settings.channels]);
      if (this.open && (identity !== this.identity || config !== this.config)) this.close(false);
      this.settings = settings; this.current = current; this.identity = identity; this.config = config;
      if (!this.host) this.create();
      if (current.after?.parentNode === current.anchor) {if (this.host.previousElementSibling !== current.after) current.after.insertAdjacentElement('afterend', this.host);} else if (this.host.parentNode !== current.anchor) current.anchor.append(this.host);
      this.host.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
      const saved = Object.keys(C.modes(settings)).some(id => C.channelTerms(settings.channels[id]).includes(C.normalize(current.channel)));
      this.trigger.dataset.saved = String(saved);
      this.trigger.title = saved ? 'Manage channel intents' : 'Always include channel in an intent';
      this.trigger.setAttribute('aria-label', this.trigger.title);
    }
    create() {
      this.host = document.createElement('span'); this.host.id = 'intent-channel-includes';
      const root = this.host.attachShadow({mode: 'open'}), style = document.createElement('style'); style.textContent = CSS;
      this.trigger = document.createElement('button'); this.trigger.type = 'button'; this.trigger.className = 'trigger';
      this.trigger.setAttribute('aria-haspopup', 'dialog'); this.trigger.setAttribute('aria-expanded', 'false');
      this.trigger.append(icon('<circle cx="8" cy="7" r="3"/><path d="M2 20v-2a6 6 0 0 1 12 0v2M16 9h6M19 6v6"/>'));
      this.panel = document.createElement('section'); this.panel.className = 'panel'; this.panel.id = 'channel-intents'; this.panel.setAttribute('popover', 'manual'); this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-labelledby', 'channel-intents-heading');
      this.trigger.setAttribute('aria-controls', this.panel.id);
      this.trigger.addEventListener('click', () => this.open ? this.close(true) : this.show());
      this.panel.addEventListener('click', event => event.stopPropagation());
      root.append(style, this.trigger, this.panel);
      document.addEventListener('pointerdown', this.outside, true); document.addEventListener('keydown', this.escape, true);
      window.addEventListener('resize', this.reposition); window.addEventListener('scroll', this.reposition, true);
    }
    show() {
      if (!this.current || !this.host?.isConnected) return;
      this.dialogVersion = (this.dialogVersion || 0) + 1;
      this.panel.replaceChildren();
      const heading = document.createElement('div'); heading.className = 'heading';
      const title = document.createElement('h2'); title.id = 'channel-intents-heading'; title.textContent = 'Always include in…';
      const close = document.createElement('button'); close.type = 'button'; close.className = 'close'; close.setAttribute('aria-label', 'Close channel intents'); close.append(icon('<path d="m6 6 12 12M6 18 18 6"/>')); close.onclick = () => this.close(true); heading.append(title, close);
      const channel = document.createElement('p'); channel.className = 'channel'; channel.textContent = this.current.channel; channel.title = this.current.channel;
      const list = document.createElement('div'); list.className = 'list';
      const modes = C.modes(this.settings), existing = Object.keys(modes).filter(id => C.channelTerms(this.settings.channels[id]).includes(C.normalize(this.current.channel)));
      this.inputs = new Map();
      for (const [id, mode] of Object.entries(modes)) {
        const row = document.createElement('label'); row.className = 'row';
        row.append(icon(C.MODE_ICONS[id] || C.INTENT_ICON_PATHS[mode.icon] || C.INTENT_ICON_PATHS.compass));
        const name = document.createElement('span'); name.className = 'name'; name.textContent = mode.name;
        if (id === this.settings.mode) {const note = document.createElement('small'); note.textContent = 'Current intent'; name.append(note);}
        const input = document.createElement('input'); input.type = 'checkbox'; input.value = id; input.setAttribute('aria-label', mode.name); input.checked = existing.includes(id) || !existing.length && id === this.settings.mode;
        this.inputs.set(id, input); row.append(name, input); list.append(row);
      }
      const footer = document.createElement('div'); footer.className = 'footer';
      const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = 'Videos from this channel can appear in the selected intents even when their topic differs. This applies to loaded recommendations and Discover more; it does not subscribe you to the channel. Distraction filters and timer rules still apply.';
      this.status = document.createElement('p'); this.status.className = 'status'; this.status.setAttribute('role', 'status');
      const actions = document.createElement('div'); actions.className = 'actions';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'cancel'; cancel.textContent = 'Cancel'; cancel.onclick = () => this.close(true);
      this.save = document.createElement('button'); this.save.type = 'button'; this.save.className = 'save'; this.save.textContent = 'Save'; this.save.disabled = this.saving === true; this.save.onclick = () => this.persist();
      actions.append(cancel, this.save); footer.append(hint, this.status, actions); this.panel.append(heading, channel, list, footer);
      this.open = true; this.trigger.setAttribute('aria-expanded', 'true'); this.panel.showPopover(); this.position();
      (this.inputs.get(this.settings.mode) || this.inputs.values().next().value || close).focus();
    }
    position() {
      if (!this.host?.isConnected) {this.close(false); return;}
      const rect = this.trigger.getBoundingClientRect(), width = this.panel.offsetWidth, height = this.panel.offsetHeight;
      this.panel.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + 'px';
      const below = rect.bottom + 8;
      this.panel.style.top = Math.max(12, Math.min(below + height <= window.innerHeight - 12 ? below : rect.top - height - 8, window.innerHeight - height - 12)) + 'px';
    }
    async persist() {
      if (this.saving || !this.open) return;
      const identity = this.identity, config = this.config, version = this.dialogVersion, current = {...this.current}, panel = this.panel;
      this.saving = true; this.save.disabled = true; for (const input of this.inputs.values()) input.disabled = true;
      this.status.textContent = 'Saving…'; this.status.setAttribute('role', 'status');
      try {
        const result = await this.runtime.sendMessage({type: 'SET_CHANNEL_INTENTS', pageURL: location.href, videoId: current.videoId, channel: current.channel, intentIds: [...this.inputs].filter(([, input]) => input.checked).map(([id]) => id)});
        if (!result?.ok) throw new Error(result?.error || 'Could not save channel intents. Try again.');
        if (this.identity === identity && this.panel === panel && version === this.dialogVersion) this.close(true);
        if (this.identity === identity && this.config === config) this.onSettings(result.settings);
      } catch (error) {
        if (this.identity === identity && this.panel === panel && version === this.dialogVersion && this.open) {this.status.setAttribute('role', 'alert'); this.status.textContent = error.message || 'Could not save. Try again.';}
      } finally {
        this.saving = false;
        if (this.panel === panel) {this.save.disabled = false; for (const input of this.inputs.values()) input.disabled = false;}
      }
    }
    close(focus = false) {this.open = false; this.panel?.hidePopover(); this.trigger?.setAttribute('aria-expanded', 'false'); if (focus && this.trigger?.isConnected) this.trigger.focus();}
    destroy() {
      this.close(false); this.host?.remove(); this.host = null; this.panel = null;
      this.identity = null; this.current = null; this.config = null;
      document.removeEventListener('pointerdown', this.outside, true); document.removeEventListener('keydown', this.escape, true);
      window.removeEventListener('resize', this.reposition); window.removeEventListener('scroll', this.reposition, true);
    }
  }
  // Resolve the visible watch owner independently of the topic badge/title.
  // Native recommendation links reuse the renderer; its identity can hydrate
  // after yt-navigate-finish, and the owner may not use #channel-name.
  ChannelIncludes.readCurrent = videoId => {
    const roots = [...document.querySelectorAll('ytd-watch-flexy')].filter(node => !node.closest('[hidden]') && getComputedStyle(node).display !== 'none');
    const declared = node => node.getAttribute('video-id') || node.getAttribute('data-video-id');
    const root = roots.find(node => declared(node) === videoId) || roots.find(node => !declared(node));
    if (!root) return null;
    if (!declared(root)) {
      const canonical = document.querySelector('link[rel="canonical"]')?.href;
      if (canonical) {try {if (new URL(canonical).searchParams.get('v') !== videoId) return null;} catch {return null;}}
    }
    const owner = [...root.querySelectorAll('#owner,ytd-video-owner-renderer')].find(node => !node.closest('#related,#secondary,[hidden]'));
    if (!owner) return null;
    const label = owner.querySelector('#channel-name,ytd-channel-name');
    const link = label?.querySelector('a') || owner.querySelector('#upload-info a[href],a[href^="/@"],a[href^="/channel/"]');
    const channel = (link?.textContent || label?.textContent || '').trim();
    if (!channel || channel.length > 200) return null;
    const uploadInfo = owner.querySelector('#upload-info'), component = uploadInfo?.closest('ytd-video-owner-renderer');
    const subscribe = owner.querySelector('ytd-subscribe-button-renderer,yt-subscribe-button-view-model,#subscribe-button,#subscribe');
    const after = subscribe || (component && owner.contains(component) ? component : uploadInfo || label);
    const anchor = after?.parentElement || owner;
    if (anchor.closest('a') || !anchor.isConnected) return null;
    return {videoId, channel, anchor, after};
  };
  globalThis.IntentChannelIncludes = ChannelIncludes;
})();
