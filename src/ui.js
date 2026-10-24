(() => {
  const C = IntentCore, app = document.querySelector('#app');
  const full = document.body.classList.contains('settings');
  const live = Boolean(globalThis.chrome?.runtime?.id);
  let state, selected = 'work', saving = false, showHidden = false;
  const drafts = {customTopics: {}, channels: {}};
  let blockedDraft;
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const icons = {
    work: '<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 12c5 3 11 3 16 0M12 12v3"/>',
    study: '<path d="M12 6C9 3 5 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 2v14"/>',
    music: '<path d="M5 13v-2a7 7 0 0 1 14 0v2"/><rect x="3" y="11" width="4" height="9" rx="2"/><rect x="17" y="11" width="4" height="9" rx="2"/>',
    leisure: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
    shorts: '<path d="m14 3-7 9h5l-2 9 7-11h-5l2-7Z"/>',
    bait: '<path d="M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7Z"/><circle cx="12" cy="12" r="3"/><path d="m3 3 18 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.clock}</svg>`;
  const samples = [
    {title: 'Design a calmer digital workspace', channel: 'Studio Practice', color: 'sage', cover: 'A little less.\nA lot better.', duration: '12:40'},
    {title: 'Python: build your first useful tool', channel: 'Code Notebook', color: 'sand', cover: '{ make it\n  work. }', duration: '24:18'},
    {title: 'The mathematics of everyday things', channel: 'Open Classroom', color: 'blue', cover: 'A world of\npossibilities.', duration: '18:06'},
    {title: 'Quiet jazz for a slow afternoon', channel: 'Sunday Sounds', color: 'rose', cover: 'slow\nsounds ♫', duration: '1:02:00'},
    {title: 'A little cooking, a little conversation', channel: 'The Good Table', color: 'sand', cover: 'Made with\na little love.', duration: '16:32'},
    {title: 'YOU WON’T BELIEVE what happens next!!!', channel: 'Viral Daily', color: 'rose', cover: 'WAIT…\nWHAT?!', duration: '8:02'},
    {title: 'A quick productivity hack #shorts', channel: 'Everyday Ideas', color: 'blue', cover: 'Just one\nmore scroll.', duration: '0:28', shorts: true},
    {title: 'Lecture: how memory and learning work', channel: 'Open Classroom', color: 'sage', cover: 'Stay\ncurious.', duration: '32:10'}
  ];
  async function request(type, patch) {
    if (live) {
      let timer;
      const result = await Promise.race([
        chrome.runtime.sendMessage({type, patch}),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Intent could not start. Reload it on your browser’s Extensions page, then refresh this page.')), 10000); })
      ]).finally(() => clearTimeout(timer));
      if (!result?.ok) throw new Error(result?.error || 'Intent could not connect. Try reloading the extension.');
      return result;
    }
    const settings = C.sanitize({...state?.settings || JSON.parse(localStorage.getItem('intent-demo') || 'null') || C.defaults(), ...patch});
    localStorage.setItem('intent-demo', JSON.stringify(settings));
    return {...C.snapshot(settings, {}), ok: true};
  }
  function toggle(key, label) { return `<button type="button" class="switch" role="switch" aria-checked="${state.settings[key]}" aria-label="${label}" data-toggle="${key}"><span></span></button>`; }
  function applyAppearance() {
    const appearance = state?.appearance;
    if (appearance === 'light' || appearance === 'dark') document.documentElement.dataset.theme = appearance;
    else document.documentElement.removeAttribute('data-theme');
  }
  function render() {
    applyAppearance();
    const s = state.settings, active = C.MODES[s.mode], mode = C.MODES[selected];
    app.innerHTML = `
      <header class="topbar"><a class="brand" href="settings.html" ${full ? '' : 'target="_blank"'}><span class="brand-mark">◒</span>intent<span class="brand-dot">.</span></a><span class="top-note">${full ? 'YouTube controls' : 'YouTube controls'}</span>${full ? '<a class="youtube-link" href="https://www.youtube.com/" target="_blank" rel="noopener">Open YouTube ↗</a>' : '<button class="icon-button" id="settings" aria-label="Open all settings">↗</button>'}</header>
      ${!live ? '<div class="demo-banner">INTERACTIVE PREVIEW · Settings here are a demo. Load the extension to filter YouTube.</div>' : ''}
      <section class="intro"><div><div class="eyebrow"><span class="tiny-dot"></span> Your feed, your choice</div><h1>YouTube, with intent.</h1><p>Choose what you want to watch. Make room for it.</p></div></section>
      <div class="workspace"><div class="main-column">
      <section class="panel modes-panel"><div class="section-head"><h2>What are you here for?</h2><button class="text-button" data-mode="off" aria-pressed="${s.mode === 'off'}">${s.mode === 'off' ? 'Modes are off' : 'Turn modes off'}</button></div><p class="section-copy">Choose the videos you want on Home and beside the player.</p><div class="mode-grid">${Object.entries(C.MODES).map(([key, m]) => `<button class="mode ${s.mode === key ? 'selected' : ''}" data-mode="${key}" aria-pressed="${s.mode === key}"><span class="mode-icon">${icon(key)}</span><span class="mode-check" aria-hidden="true">${s.mode === key ? '✓' : ''}</span><strong>${m.name}</strong><small>${key === 'work' ? 'Get in the zone' : key === 'study' ? 'Stay curious' : key === 'music' ? 'Find your rhythm' : 'Enjoy your downtime'}</small></button>`).join('')}</div><div class="mode-caption"><span class="tiny-dot"></span><span>${active ? `${active.name} mode is on. Home and video recommendations show matching videos.` : 'Modes are off. Your distraction filters still apply.'}</span></div></section>
      <section class="panel filter-panel"><div class="section-head"><h2>Distraction filters</h2><span class="subtle">YOUR FILTERS</span></div><div class="setting-row"><span class="row-icon">${icon('shorts')}</span><div><h3>Hide Shorts</h3><p>Remove Shorts from YouTube.</p></div>${toggle('hideShorts', 'Hide Shorts')}</div><div class="setting-row"><span class="row-icon">${icon('bait')}</span><div><h3>Filter clickbait</h3><p>Hide titles with common clickbait patterns.</p></div>${toggle('hideClickbait', 'Filter clickbait')}</div><p class="helper">Clickbait detection uses title patterns. It may miss some videos or hide useful ones.</p></section>
      ${full ? `<section class="panel rules-panel"><div class="section-head"><h2>Make it yours</h2><span class="tag">${escape(mode.name)} mode</span></div><p class="section-copy">A bundled local model matches video titles, descriptions and hashtags to your intent. Add the subjects and channels you came for.</p><div class="topic-pills">${mode.topics.slice(0, 8).map(t => `<span>${escape(t)}</span>`).join('')}<span>+${mode.topics.length - 8} built in</span></div><form id="rules-form"><label for="topics">Extra topics for ${escape(mode.name.toLowerCase())}</label><textarea id="topics" rows="2" placeholder="e.g. woodworking, robotics, Blender" maxlength="4000">${escape(drafts.customTopics[selected] ?? s.customTopics[selected])}</textarea><p class="field-hint">Separate topics with commas. Add keywords in any language.</p><label for="channels">Always include these channels in this mode</label><textarea id="channels" rows="2" placeholder="Exact channel names, separated by commas" maxlength="4000">${escape(drafts.channels[selected] ?? s.channels[selected])}</textarea><p class="field-hint">Use the full displayed channel name. Shorts, clickbait and blocked terms still take priority.</p><label for="blocked-terms">Hide these words or phrases in every mode</label><textarea id="blocked-terms" rows="2" placeholder="e.g. spoilers, celebrity gossip" maxlength="4000">${escape(blockedDraft ?? s.blockedTerms)}</textarea><div class="form-end"><span id="draft-status" class="helper">${Object.keys(drafts.customTopics).length || Object.keys(drafts.channels).length || blockedDraft !== undefined ? 'Unsaved topic changes' : 'Your preferences stay on this device.'}</span><button type="submit" class="button primary">Save preferences <span aria-hidden="true">↗</span></button></div></form></section>` : ''}
      </div><aside class="side-column"><section class="panel budget-panel"><div class="section-head"><h2>Your daily budget</h2>${toggle('limitEnabled', 'Enable daily time limit')}</div><p class="section-copy">Set how much time you want to spend on YouTube.</p><div class="budget-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle class="ring-track" cx="100" cy="100" r="87"/><circle class="ring-value" id="ring-value" cx="100" cy="100" r="87"/></svg><div><strong id="remaining-value">60<span>min</span></strong><span id="remaining-label">left for today</span></div></div><div class="budget-summary"><span id="used-label">0 min used</span><span id="limit-label">60 min budget</span></div><div class="presets" aria-label="Daily budget presets">${[30, 60, 90].map(n => `<button data-minutes="${n}" class="${s.dailyMinutes === n ? 'active' : ''}" aria-pressed="${s.dailyMinutes === n}">${n} min</button>`).join('')}</div><label class="custom-budget" for="daily-minutes">Daily limit <span><input id="daily-minutes" type="number" min="1" max="1440" step="1" value="${s.dailyMinutes}" aria-describedby="budget-note"> min / day</span></label><p id="budget-note" class="budget-note">${state.blocked ? 'Budget reached. YouTube is blocked until midnight.' : s.limitEnabled ? 'When time’s up, YouTube closes for the day.' : 'Time tracking is on. Blocking is off.'}</p><div class="playback-row"><div><h3>Count background playback</h3><p>Music is time on YouTube, too.</p></div>${toggle('countPlayback', 'Count background playback')}</div><p class="helper timer-explainer">Foreground time counts while this browser is focused and you’re active. Multiple tabs count once. Resets at local midnight.</p></section>${full ? '<div class="privacy-note"><span>↳</span><div><strong>Private by default</strong><p>Bundled local AI. No accounts or analytics.<br>Your settings and time stay in your browser.</p></div></div>' : '<a class="all-settings" href="settings.html" target="_blank">Customize topics & channels <span>↗</span></a>'}</aside></div>
      ${full ? `<section class="preview-section"><div class="section-head"><div><p class="eyebrow">FILTER PREVIEW</p><h2>Try your filters</h2></div><button id="show-hidden" class="text-button" aria-pressed="${showHidden}">${showHidden ? 'Hide filtered examples' : 'Show filtered examples'}</button></div><p class="section-copy">Sample cards demonstrate keyword and distraction controls. Your live Intent feed also uses the bundled semantic model.</p><div id="sample-grid" class="sample-grid"></div></section>` : ''}
      <footer><span>Your settings stay on this device.</span><span>intent · ${full ? '1.3.0' : 'LOCAL & PRIVATE'}</span></footer><div id="notice" role="status" aria-live="polite"></div>`;
    paintTime(); paintSamples();
  }
  function paintTime() {
    const s = state.settings, ms = s.limitEnabled ? state.remainingMs : state.usedMs;
    const minutes = s.limitEnabled ? Math.ceil(ms / 60000) : Math.floor(ms / 60000);
    document.querySelector('#remaining-value').innerHTML = `${minutes}<span>min</span>`;
    document.querySelector('#remaining-label').textContent = s.limitEnabled ? (state.blocked ? 'time to step away' : 'left for today') : 'used today';
    document.querySelector('#used-label').textContent = `${Math.floor(state.usedMs / 60000)} min used`;
    document.querySelector('#limit-label').textContent = s.limitEnabled ? `${s.dailyMinutes} min budget` : 'No limit';
    const ring = document.querySelector('#ring-value');
    const fraction = s.limitEnabled ? Math.max(0, state.remainingMs / (s.dailyMinutes * 60000)) : 1;
    ring.style.strokeDashoffset = String(547 * (1 - fraction));
    ring.style.stroke = state.blocked ? 'var(--danger)' : 'var(--blue)';
    document.querySelector('#budget-note').textContent = state.blocked ? 'Budget reached. YouTube is blocked until midnight.' : s.limitEnabled ? 'When time’s up, YouTube closes for the day.' : 'Time tracking is on. Blocking is off.';
  }
  function paintSamples() {
    const grid = document.querySelector('#sample-grid'); if (!grid) return;
    const videos = samples.map(v => ({...v, result: C.classify(v, state.settings)})).filter(v => showHidden || v.result.visible);
    grid.innerHTML = videos.length ? videos.map(v => `<article class="sample-card ${v.result.visible ? '' : 'filtered'}"><div class="sample-cover ${v.color}"><span>${escape(v.cover).replace(/\n/g, '<br>')}</span><small>${v.duration}</small>${!v.result.visible ? `<div class="filter-label">Hidden · ${escape(v.result.reason)}</div>` : ''}</div><h3>${escape(v.title)}</h3><p>${escape(v.channel)}</p></article>`).join('') : '<p class="sample-empty">No example videos match these settings. Add topics or channels above to broaden your feed.</p>';
  }
  function notify(message, error = false) {
    const notice = document.querySelector('#notice'); notice.textContent = message;
    notice.className = `visible ${error ? 'error' : ''}`;
    clearTimeout(notify.timeout); notify.timeout = setTimeout(() => notice.className = '', 4000);
  }
  async function update(patch, message = 'Saved. Your feed follows your lead.') {
    if (saving) return false;
    const focused = document.activeElement;
    const focusSelector = focused?.dataset.mode ? `[data-mode="${focused.dataset.mode}"]` : focused?.dataset.toggle ? `[data-toggle="${focused.dataset.toggle}"]` : focused?.dataset.minutes ? `[data-minutes="${focused.dataset.minutes}"]` : focused?.id ? `#${focused.id}` : focused?.type === 'submit' ? '#rules-form button[type="submit"]' : null;
    saving = true; app.setAttribute('aria-busy', 'true');
    try {
      state = await request('UPDATE_SETTINGS', patch);
      if (state.settings.mode !== 'off') selected = state.settings.mode;
      render(); if (focusSelector) document.querySelector(focusSelector)?.focus(); notify(message); return true;
    } catch (e) { notify(e.message, true); return false; }
    finally { saving = false; app.removeAttribute('aria-busy'); }
  }
  app.addEventListener('click', async e => {
    const button = e.target.closest('button'); if (!button) return;
    if (button.dataset.mode) await update({mode: button.dataset.mode});
    else if (button.dataset.toggle) await update({[button.dataset.toggle]: !state.settings[button.dataset.toggle]});
    else if (button.dataset.minutes) await update({dailyMinutes: Number(button.dataset.minutes)});
    else if (button.id === 'settings') { if (live) chrome.runtime.openOptionsPage(); else location.href = 'settings.html'; }
    else if (button.id === 'show-hidden') { showHidden = !showHidden; button.setAttribute('aria-pressed', showHidden); button.textContent = showHidden ? 'Hide filtered examples' : 'Show filtered examples'; paintSamples(); }
  });
  app.addEventListener('change', e => {
    if (e.target.id === 'daily-minutes') {
      if (e.target.checkValidity() && e.target.value !== '') update({dailyMinutes: Number(e.target.value)});
      else { e.target.reportValidity(); }
    }
  });
  app.addEventListener('input', e => {
    if (e.target.id === 'topics') drafts.customTopics[selected] = e.target.value;
    if (e.target.id === 'channels') drafts.channels[selected] = e.target.value;
    if (e.target.id === 'blocked-terms') blockedDraft = e.target.value;
    if (document.querySelector('#draft-status')) document.querySelector('#draft-status').textContent = 'Unsaved topic changes';
  });
  app.addEventListener('submit', async e => {
    e.preventDefault(); if (e.target.id !== 'rules-form') return;
    const ok = await update({customTopics: {...state.settings.customTopics, ...drafts.customTopics}, channels: {...state.settings.channels, ...drafts.channels}, blockedTerms: blockedDraft ?? state.settings.blockedTerms}, 'Preferences saved. Make yourself at home.');
    if (ok) { drafts.customTopics = {}; drafts.channels = {}; blockedDraft = undefined; document.querySelector('#draft-status').textContent = 'All preferences saved on this device.'; }
  });
  app.innerHTML = '<div class="loading-state" role="status"><span class="brand">◒ intent.</span><p>Making a little room to focus…</p></div>';
  if (live) chrome.runtime.onMessage.addListener(message => {
    if (message.type !== 'APPEARANCE' || !state || !['light', 'dark'].includes(message.appearance)) return;
    state.appearance = message.appearance; applyAppearance();
  });
  request('GET_STATE').then(result => { state = result; selected = C.MODES[state.settings.mode] ? state.settings.mode : 'work'; render(); }).catch(e => {
    app.innerHTML = '<div class="loading-state" role="alert"><span class="brand">◒ intent.</span><p></p><button class="button primary" id="retry">Try again ↗</button></div>';
    app.querySelector('p').textContent = e.message;
    app.querySelector('#retry').addEventListener('click', () => location.reload());
  });
  setInterval(async () => {
    if (!state || saving || document.hidden) return;
    try {
      const next = await request('GET_STATE');
      const changed = JSON.stringify(next.settings) !== JSON.stringify(state.settings);
      state = next; applyAppearance();
      if (changed) { if (C.MODES[state.settings.mode]) selected = state.settings.mode; render(); } else paintTime();
    } catch { /* Keep the last known state; changes will report connection failures. */ }
  }, 3000);
})();
