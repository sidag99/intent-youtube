(() => {
  const C = IntentCore;
  let settings, pending, bar, lastText = '', lastURL = '', running = false;
  const CARDS = 'ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,yt-lockup-view-model,ytm-rich-item-renderer';
  const SHELVES = 'ytd-reel-shelf-renderer,ytd-rich-shelf-renderer[is-shorts],ytm-reel-shelf-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2';
  const isHome = () => location.pathname === '/' && !location.hostname.startsWith('music.');
  const text = (el, selector) => el.querySelector(selector)?.textContent?.trim() || '';
  function setHidden(el, hidden) {
    if (hidden !== el.hasAttribute('data-intent-hidden')) el.toggleAttribute('data-intent-hidden', hidden);
  }
  function makeBar() {
    if (bar?.isConnected) return;
    bar = document.createElement('div');
    bar.id = 'intent-home-bar';
    const root = bar.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = ':host{display:block;margin:12px 24px 22px;font:14px system-ui;color:#263b30}section{display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:#f2f5ee;border:1px solid #d4ddcd;border-radius:14px;padding:16px 20px}strong{font-size:17px;letter-spacing:-.5px}span{flex:1;min-width:160px;line-height:1.5}button{font:inherit;border:1px solid #c7d0be;background:#fff;color:#263b30;padding:9px 13px;border-radius:8px;cursor:pointer}button:focus-visible{outline:3px solid #6c8966}';
    const section = document.createElement('section');
    const brand = document.createElement('strong'); brand.textContent = '◒ intent';
    const status = document.createElement('span'); status.id = 'status';
    const button = document.createElement('button'); button.textContent = 'Change mode ↗';
    button.addEventListener('click', () => chrome.runtime.sendMessage({type: 'OPEN_SETTINGS'}).catch(() => {}));
    section.append(brand, status, button); root.append(style, section);
    bar.intentStatus = status;
    const feed = document.querySelector('ytd-browse[page-subtype="home"] #primary, ytd-browse #primary');
    if (feed) feed.prepend(bar);
  }
  function shortsGate() {
    let gate = document.getElementById('intent-shorts-gate');
    const blocked = settings.hideShorts && location.pathname.startsWith('/shorts');
    if (!blocked) { gate?.remove(); return; }
    document.querySelectorAll('video,audio').forEach(media => media.pause());
    if (gate) return;
    gate = document.createElement('div'); gate.id = 'intent-shorts-gate';
    const root = gate.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = ':host{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#f7f7f0;color:#283a30;font:16px system-ui}main{max-width:420px;text-align:center;padding:40px}h1{font-size:36px;letter-spacing:-1.5px}p{line-height:1.7;color:#657064}a{display:inline-block;margin-top:22px;border-radius:10px;padding:13px 22px;background:#365e4b;color:white;text-decoration:none}';
    const main = document.createElement('main');
    const title = document.createElement('h1'); title.textContent = 'Skip the rabbit hole.';
    const p = document.createElement('p'); p.textContent = 'Shorts are hidden by Intent. Take a breath and choose something worth your time.';
    const link = document.createElement('a'); link.href = 'https://www.youtube.com/'; link.textContent = 'Back to your home page →';
    main.append(title, p, link); root.append(style, main); document.documentElement.append(gate);
  }
  function scan() {
    pending = null;
    if (!settings || !document.documentElement) return;
    const home = isHome();
    document.documentElement.toggleAttribute('data-intent-shorts', settings.hideShorts);
    const visibleSettings = home ? settings : {...settings, mode: 'off'};
    let hidden = 0, visible = 0;
    for (const card of document.querySelectorAll(CARDS)) {
      // Modern lockups can be nested in legacy cards. Filter each visual card once.
      if (card.parentElement?.closest(CARDS)) continue;
      const title = text(card, '#video-title,.yt-lockup-metadata-view-model__title,h3');
      const channel = text(card, '#channel-name a,ytd-channel-name,.yt-content-metadata-view-model__metadata-row .yt-content-metadata-view-model__metadata-text');
      const shorts = !!card.querySelector('a[href^="/shorts/"],a[href*="youtube.com/shorts/"],ytd-reel-shelf-renderer,[is-shorts]');
      const result = C.classify({title, channel, shorts}, visibleSettings);
      // Cards containing shelves may contain many titles; unrelated shelves are hidden in a mode.
      setHidden(card, !result.visible);
      if (home) result.visible ? visible++ : hidden++;
    }
    for (const shelf of document.querySelectorAll(SHELVES)) setHidden(shelf, settings.hideShorts);
    for (const link of document.querySelectorAll('ytd-guide-entry-renderer a[href^="/shorts"],ytd-mini-guide-entry-renderer a[href^="/shorts"]')) setHidden(link.closest('ytd-guide-entry-renderer,ytd-mini-guide-entry-renderer'), settings.hideShorts);
    if (home && window.top === window) {
      makeBar();
      const mode = C.MODES[settings.mode];
      const value = `${mode ? mode.name + ' mode · ' : 'Modes off · '}${visible} shown · ${hidden} hidden${!visible && hidden ? ' — add topics or channels in settings to see more.' : ''}`;
      if (bar?.intentStatus && value !== lastText) { bar.intentStatus.textContent = value; lastText = value; }
    } else { bar?.remove(); lastText = ''; }
    shortsGate();
  }
  function schedule() { if (!pending) pending = setTimeout(scan, 120); }
  async function heartbeat() {
    if (running) return;
    running = true;
    try {
      const playing = [...document.querySelectorAll('video,audio')].some(m => !m.paused && !m.ended && m.readyState > 1);
      const state = await chrome.runtime.sendMessage({type: 'HEARTBEAT', playing});
      if (state?.ok) {
        if (JSON.stringify(settings) !== JSON.stringify(state.settings)) { settings = state.settings; schedule(); }
        if (state.blocked) {
          document.querySelectorAll('video,audio').forEach(m => m.pause());
          location.replace(chrome.runtime.getURL('blocked.html'));
        }
      }
    } catch { /* Reloading an unpacked extension invalidates old scripts; refresh YouTube. */ }
    finally { running = false; }
  }
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'SETTINGS') { settings = C.sanitize(message.settings); schedule(); }
  });
  new MutationObserver(schedule).observe(document, {childList: true, subtree: true, characterData: true});
  document.addEventListener('yt-navigate-finish', schedule);
  document.addEventListener('play', () => { shortsGateIfReady(); heartbeat(); }, true);
  document.addEventListener('pause', heartbeat, true);
  document.addEventListener('visibilitychange', heartbeat);
  function shortsGateIfReady() { if (settings) shortsGate(); }
  setInterval(() => {
    if (location.href !== lastURL) { lastURL = location.href; schedule(); }
    heartbeat();
  }, 5000);
  heartbeat();
})();
