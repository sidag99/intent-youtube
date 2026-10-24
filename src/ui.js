(() => {
  const C = IntentCore, app = document.querySelector('#app');
  const full = document.body.classList.contains('settings');
  const live = Boolean(globalThis.chrome?.runtime?.id);
  let state, selected = 'work', saving = false, showHidden = false, targetTabId;
  // Resolve once: a popup belongs to the tab from which it was opened.
  const targetReady = !full && live && chrome.tabs?.query ? chrome.tabs.query({active: true, currentWindow: true}).then(tabs => {
    const tab = tabs[0];
    if (Number.isInteger(tab?.id) && (C.isYouTube(tab.url) || tab.url?.startsWith(chrome.runtime.getURL('blocked.html')))) targetTabId = tab.id;
  }).catch(() => {}) : Promise.resolve();
  const drafts = {customTopics: {}, channels: {}, descriptions: {}, names: {}};
  const createDraft = {name: '', description: ''};
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
      await targetReady;
      let timer;
      const result = await Promise.race([
        chrome.runtime.sendMessage({type, patch, ...(Number.isInteger(targetTabId) ? {targetTabId} : {})}),
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
  const modes = () => C.modes(state?.settings || C.defaults());
  const modeName = mode => modes()[mode]?.name || 'Modes-off browsing';
  function budgetNote() {
    const s = state.settings;
    if (!s.limitEnabled) return 'Blocking is off. Only the modes selected for the timer add to daily usage.';
    if (!C.countsMode(s, s.mode)) return `${modeName(s.mode)} does not count toward your daily limit. It stays accessible when the limit is reached.`;
    if (state.budgetExhausted || state.usedMs >= s.dailyMinutes * 60000) return 'Daily limit reached. Counted modes are blocked until midnight. Exempt modes remain available.';
    return 'When the limit is reached, counted modes close until midnight. Exempt modes remain available.';
  }
  function countModeToggle(mode) {
    const name = mode === 'off' ? 'Modes off' : modes()[mode].name;
    return `<div class="count-mode-row"><span>${escape(name)}</span><button type="button" class="switch" role="switch" aria-checked="${C.countsMode(state.settings, mode)}" aria-label="${escape(mode === 'off' ? 'Count modes-off time' : `Count ${name} time`)}" data-count-mode="${mode}"><span></span></button></div>`;
  }
  function applyAppearance() {
    const appearance = state?.appearance;
    if (appearance === 'light' || appearance === 'dark') document.documentElement.dataset.theme = appearance;
    else document.documentElement.removeAttribute('data-theme');
  }
  function render() {
    applyAppearance();
    const s = state.settings, definitions = modes(), active = definitions[s.mode], mode = definitions[selected] || definitions.work;
    const isCustom = Object.hasOwn(s.customIntents || {}, selected);
    app.innerHTML = `
      <header class="topbar"><a class="brand" href="settings.html" ${full ? '' : 'target="_blank"'}><img class="brand-mark" src="icons/48.png" alt="" width="28" height="28">intent<span class="brand-dot">.</span></a><span class="top-note">${full ? 'YouTube controls' : 'YouTube controls'}</span>${full ? '<a class="youtube-link" href="https://www.youtube.com/" target="_blank" rel="noopener">Open YouTube ↗</a>' : '<button class="icon-button" id="settings" aria-label="Open all settings">↗</button>'}</header>
      ${!live ? '<div class="demo-banner">INTERACTIVE PREVIEW · Settings here are a demo. Load the extension to filter YouTube.</div>' : ''}
      <section class="intro"><div><div class="eyebrow"><span class="tiny-dot"></span> Your feed, your choice</div><h1>YouTube, with intent.</h1><p>Choose what you want to watch. Make room for it.</p></div></section>
      <div class="workspace"><div class="main-column">
      <section class="panel modes-panel"><div class="section-head"><h2>What are you here for?</h2><button class="text-button" data-mode="off" aria-pressed="${s.mode === 'off'}">${s.mode === 'off' ? 'Modes are off' : 'Turn modes off'}</button></div><p class="section-copy">${!full && Number.isInteger(targetTabId) ? "Choose the intent for this YouTube tab. Other tabs keep their own mode." : "Choose your last used intent. Existing YouTube tabs keep their own mode."}</p><div class="mode-grid">${Object.entries(definitions).map(([key, m]) => `<button class="mode ${s.mode === key ? 'selected' : ''}" data-mode="${key}" aria-pressed="${s.mode === key}"><span class="mode-icon">${icon(key)}</span><span class="mode-check" aria-hidden="true">${s.mode === key ? '✓' : ''}</span><strong>${escape(m.name)}</strong><small>${key === 'work' ? 'Get in the zone' : key === 'study' ? 'Stay curious' : key === 'music' ? 'Find your rhythm' : key === 'leisure' ? 'Enjoy your downtime' : 'Your custom intent'}</small></button>`).join('')}</div><div class="mode-caption"><span class="tiny-dot"></span><span>${active ? `${escape(active.name)} mode is ${!full && Number.isInteger(targetTabId) ? 'on for this tab' : 'your last used intent'}. ${C.countsMode(s, s.mode) ? 'This mode counts toward the daily limit.' : 'This mode is exempt from the daily limit.'}` : `Modes are off. Your distraction filters still apply. ${C.countsMode(s, 'off') ? 'This browsing counts toward the daily limit.' : 'This browsing is exempt from the daily limit.'}`}</span></div></section>
      ${full ? `<section class="panel tab-policy-panel"><div class="section-head"><h2>New YouTube tabs</h2></div><p class="section-copy">Each tab keeps its own intent, including after a reload. Choose how newly opened YouTube tabs start.</p><label for="new-tab-mode">Intent for new YouTube tabs</label><select id="new-tab-mode"><option value="last" ${s.newTabMode === 'last' ? 'selected' : ''}>Follow last used intent</option>${[...Object.entries(definitions).map(([key, item]) => [key, item.name]), ['off', 'Modes off']].map(([key, name]) => `<option value="${key}" ${s.newTabMode === key ? 'selected' : ''}>${key === 'off' ? 'Start with modes off' : `Always ${escape(name)}`}</option>`).join('')}</select><p class="field-hint">Changing this setting affects new tabs. Open tabs keep the intent you selected for them.</p></section>` : ''}
      <section class="panel filter-panel"><div class="section-head"><h2>Distraction filters</h2><span class="subtle">YOUR FILTERS</span></div><div class="setting-row"><span class="row-icon">${icon('shorts')}</span><div><h3>Hide Shorts</h3><p>Remove Shorts from YouTube.</p></div>${toggle('hideShorts', 'Hide Shorts')}</div><div class="setting-row"><span class="row-icon">${icon('bait')}</span><div><h3>Filter clickbait</h3><p>Hide titles with common clickbait patterns.</p></div>${toggle('hideClickbait', 'Filter clickbait')}</div><p class="helper">Clickbait detection uses title patterns. It may miss some videos or hide useful ones.</p></section>
      ${full ? `<section class="panel rules-panel"><div class="section-head"><h2>Make it yours</h2><span class="tag">${escape(mode.name)} mode</span></div><p class="section-copy">A bundled local model matches video titles, descriptions and hashtags to your intent. Add the subjects and channels you came for.</p><div class="topic-pills">${(mode.topics || []).slice(0, 8).map(t => `<span>${escape(t)}</span>`).join('')}${mode.topics?.length > 8 ? `<span>+${mode.topics.length - 8} built in</span>` : ''}</div><form id="rules-form">${isCustom ? `<label for="intent-name">Intent name</label><input id="intent-name" type="text" required maxlength="48" value="${escape(drafts.names[selected] ?? s.customIntents[selected].name)}">` : ''}<label for="intent-description">Intent description for ${escape(mode.name.toLowerCase())}</label><textarea id="intent-description" rows="3" maxlength="1000" ${isCustom ? 'required' : ''} placeholder="${escape(isCustom ? 'Describe the videos you want to see.' : 'Leave blank to use the built-in description.')}" aria-describedby="description-hint">${escape(drafts.descriptions[selected] ?? (isCustom ? s.customIntents[selected].description : s.intentDescriptions?.[selected] || ''))}</textarea><p id="description-hint" class="field-hint">Narrow this intent with a specific goal, such as “coding tutorials for accessible websites” instead of general work videos. Your description guides semantic matching and topic searches.${isCustom ? '' : ' Leave blank to use this mode’s built-in scope.'}</p><label for="topics">Extra topics for ${escape(mode.name.toLowerCase())}</label><textarea id="topics" rows="2" placeholder="e.g. woodworking, robotics, Blender" maxlength="4000">${escape(drafts.customTopics[selected] ?? s.customTopics[selected])}</textarea><p class="field-hint">Separate topics with commas. Add keywords in any language.</p><label for="channels">Always include these channels in this mode</label><textarea id="channels" rows="2" placeholder="Exact channel names, separated by commas" maxlength="4000">${escape(drafts.channels[selected] ?? s.channels[selected])}</textarea><p class="field-hint">Use the full displayed channel name. Shorts, clickbait and blocked terms still take priority.</p><label for="blocked-terms">Hide these words or phrases in every mode</label><textarea id="blocked-terms" rows="2" placeholder="e.g. spoilers, celebrity gossip" maxlength="4000">${escape(blockedDraft ?? s.blockedTerms)}</textarea><div class="form-end"><span id="draft-status" class="helper">${Object.keys(drafts.customTopics).length || Object.keys(drafts.channels).length || Object.keys(drafts.descriptions).length || Object.keys(drafts.names).length || blockedDraft !== undefined ? 'Unsaved topic changes' : 'Your preferences stay on this device.'}</span><button type="submit" class="button primary">Save preferences <span aria-hidden="true">↗</span></button></div></form>${isCustom ? '<button type="button" class="text-button danger-button" id="delete-intent">Delete intent</button>' : ''}</section>` : ''}
      ${full ? `<section class="panel custom-intent-panel"><div class="section-head"><h2>Create your own intent</h2></div><p class="section-copy">Use a specific goal, such as learning a language or restoring a bicycle. Custom intents have their own topics, channel rules and timer switch.</p><form id="create-intent"><label for="custom-intent-name">Custom intent name</label><input id="custom-intent-name" type="text" required maxlength="48" value="${escape(createDraft.name)}" placeholder="e.g. Learning German"><label for="custom-intent-description">What should this intent show?</label><textarea id="custom-intent-description" rows="3" required maxlength="1000" placeholder="e.g. Beginner German lessons, listening practice, pronunciation and vocabulary.">${escape(createDraft.description)}</textarea><div class="form-end"><span class="helper">${Object.keys(s.customIntents || {}).length} / 10 custom intents</span><button type="submit" class="button primary" ${Object.keys(s.customIntents || {}).length >= 10 ? 'disabled' : ''}>Create intent</button></div></form></section>` : ''}
      </div><aside class="side-column"><section class="panel budget-panel"><div class="section-head"><h2>Your daily budget</h2>${toggle('limitEnabled', 'Enable daily time limit')}</div><p class="section-copy">Set how much time you want to spend on YouTube.</p><div class="budget-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle class="ring-track" cx="100" cy="100" r="87"/><circle class="ring-value" id="ring-value" cx="100" cy="100" r="87"/></svg><div><strong id="remaining-value">60<span>min</span></strong><span id="remaining-label">left for today</span></div></div><div class="budget-summary"><span id="used-label">0 min used</span><span id="limit-label">60 min budget</span></div><div class="presets" aria-label="Daily budget presets">${[30, 60, 90].map(n => `<button data-minutes="${n}" class="${s.dailyMinutes === n ? 'active' : ''}" aria-pressed="${s.dailyMinutes === n}">${n} min</button>`).join('')}</div><label class="custom-budget" for="daily-minutes">Daily limit <span><input id="daily-minutes" type="number" min="1" max="1440" step="1" value="${s.dailyMinutes}" aria-describedby="budget-note"> min / day</span></label><p id="budget-note" class="budget-note">${escape(budgetNote())}</p><div class="playback-row"><div><h3>Count background playback</h3><p>Only modes included in the timer add time.</p></div>${toggle('countPlayback', 'Count background playback')}</div><p class="helper timer-explainer">Selected modes count while the browser is focused and you’re active. Playing media can also count. Multiple tabs count once; exempt tabs add no time. Resets at local midnight.</p></section>${full ? `<section class="panel timer-modes-panel"><div class="section-head"><h2>Modes that count</h2></div><p class="section-copy">Choose which modes use the shared daily budget. Exempt modes remain accessible after the limit is reached.</p><div class="count-mode-list">${[...Object.keys(definitions), 'off'].map(countModeToggle).join('')}</div><p class="helper">Music is excluded by default. Turning a mode on here includes foreground use and eligible playback in that mode.</p></section>` : '<a class="all-settings" href="settings.html" target="_blank">Timer settings <span>↗</span></a>'}${full ? '<div class="privacy-note"><span>↳</span><div><strong>Private by default</strong><p>Bundled local AI. No accounts or analytics.<br>Your settings and time stay in your browser.</p></div></div>' : '<a class="all-settings" href="settings.html" target="_blank">Customize topics & channels <span>↗</span></a>'}</aside></div>
      ${full ? `<section class="preview-section"><div class="section-head"><div><p class="eyebrow">FILTER PREVIEW</p><h2>Try your filters</h2></div><button id="show-hidden" class="text-button" aria-pressed="${showHidden}">${showHidden ? 'Hide filtered examples' : 'Show filtered examples'}</button></div><p class="section-copy">Sample cards demonstrate keyword and distraction controls. Your live Intent feed also uses the bundled semantic model.</p><div id="sample-grid" class="sample-grid"></div></section>` : ''}
      <footer><span>Your settings stay on this device.</span><span>intent · ${full ? '1.5.0' : 'LOCAL & PRIVATE'}</span></footer><div id="notice" role="status" aria-live="polite"></div>`;
    paintTime(); paintSamples();
  }
  function paintTime() {
    const s = state.settings, ms = s.limitEnabled ? state.remainingMs : state.usedMs;
    const minutes = s.limitEnabled ? Math.ceil(ms / 60000) : Math.floor(ms / 60000);
    document.querySelector('#remaining-value').innerHTML = `${minutes}<span>min</span>`;
    document.querySelector('#remaining-label').textContent = s.limitEnabled ? (!C.countsMode(s, s.mode) ? 'shared budget · this mode is exempt' : state.blocked ? 'time to step away' : 'left for today') : 'used today';
    document.querySelector('#used-label').textContent = `${Math.floor(state.usedMs / 60000)} min used`;
    document.querySelector('#limit-label').textContent = s.limitEnabled ? `${s.dailyMinutes} min budget` : 'No limit';
    const ring = document.querySelector('#ring-value');
    const fraction = s.limitEnabled ? Math.max(0, state.remainingMs / (s.dailyMinutes * 60000)) : 1;
    ring.style.strokeDashoffset = String(547 * (1 - fraction));
    ring.style.stroke = state.blocked ? 'var(--danger)' : 'var(--blue)';
    document.querySelector('#budget-note').textContent = budgetNote();
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
    const focusSelector = focused?.dataset.mode ? `[data-mode="${focused.dataset.mode}"]` : focused?.dataset.countMode ? `[data-count-mode="${focused.dataset.countMode}"]` : focused?.dataset.toggle ? `[data-toggle="${focused.dataset.toggle}"]` : focused?.dataset.minutes ? `[data-minutes="${focused.dataset.minutes}"]` : focused?.id ? `#${focused.id}` : focused?.type === 'submit' ? '#rules-form button[type="submit"]' : null;
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
    if (button.dataset.mode) await update({mode: button.dataset.mode}, Number.isInteger(targetTabId) ? 'Intent saved for this tab. Other tabs keep their mode.' : 'Last used intent saved. Existing tabs keep their mode.');
    else if (button.dataset.countMode) {const mode = button.dataset.countMode; await update({countModes: {...state.settings.countModes, [mode]: !C.countsMode(state.settings, mode)}}, 'Timer modes saved. Exempt modes stay accessible.');}
    else if (button.dataset.toggle) await update({[button.dataset.toggle]: !state.settings[button.dataset.toggle]});
    else if (button.dataset.minutes) await update({dailyMinutes: Number(button.dataset.minutes)});
    else if (button.id === 'delete-intent' && state.settings.customIntents?.[selected]) {
      const customIntents = {...state.settings.customIntents}; delete customIntents[selected];
      for (const field of Object.values(drafts)) delete field[selected];
      await update({customIntents, mode: 'work', ...(state.settings.newTabMode === selected ? {newTabMode: 'last'} : {})}, 'Intent deleted. Work is now your last used intent.');
    }
    else if (button.id === 'settings') { if (live) chrome.runtime.openOptionsPage(); else location.href = 'settings.html'; }
    else if (button.id === 'show-hidden') { showHidden = !showHidden; button.setAttribute('aria-pressed', showHidden); button.textContent = showHidden ? 'Hide filtered examples' : 'Show filtered examples'; paintSamples(); }
  });
  app.addEventListener('change', e => {
    if (e.target.id === 'new-tab-mode') update({newTabMode: e.target.value}, 'New-tab intent saved. Existing tabs keep their mode.');
    else if (e.target.id === 'daily-minutes') {
      if (e.target.checkValidity() && e.target.value !== '') update({dailyMinutes: Number(e.target.value)});
      else { e.target.reportValidity(); }
    }
  });
  app.addEventListener('input', e => {
    if (e.target.id === 'custom-intent-name') {createDraft.name = e.target.value; return;}
    if (e.target.id === 'custom-intent-description') {createDraft.description = e.target.value; return;}
    if (e.target.id === 'intent-description') drafts.descriptions[selected] = e.target.value;
    if (e.target.id === 'intent-name') drafts.names[selected] = e.target.value;
    if (e.target.id === 'topics') drafts.customTopics[selected] = e.target.value;
    if (e.target.id === 'channels') drafts.channels[selected] = e.target.value;
    if (e.target.id === 'blocked-terms') blockedDraft = e.target.value;
    if (document.querySelector('#draft-status')) document.querySelector('#draft-status').textContent = 'Unsaved topic changes';
  });
  app.addEventListener('submit', async e => {
    e.preventDefault();
    if (e.target.id === 'create-intent') {
      const name = createDraft.name.trim(), description = createDraft.description.trim();
      if (!name || !description) {notify('Add a name and description for your intent.', true); return;}
      const id = 'custom-' + crypto.randomUUID().slice(0, 8);
      const ok = await update({customIntents: {...state.settings.customIntents, [id]: {name, description}}, mode: id}, 'Custom intent created. Choose it in any YouTube tab.');
      if (ok) {createDraft.name = ''; createDraft.description = ''; document.querySelector('#custom-intent-name').value = ''; document.querySelector('#custom-intent-description').value = '';}
      return;
    }
    if (e.target.id !== 'rules-form') return;
    const customIntents = {...state.settings.customIntents}, intentDescriptions = {...state.settings.intentDescriptions};
    for (const [id, description] of Object.entries(drafts.descriptions)) {
      if (customIntents[id]) customIntents[id] = {...customIntents[id], description: description.trim()};
      else intentDescriptions[id] = description.trim();
    }
    for (const [id, name] of Object.entries(drafts.names)) if (customIntents[id]) customIntents[id] = {...customIntents[id], name: name.trim()};
    for (const value of Object.values(customIntents)) if (!value.name || !value.description) {notify('Custom intents need both a name and a description. Finish the draft before saving.', true); return;}
    const ok = await update({customIntents, intentDescriptions, customTopics: {...state.settings.customTopics, ...drafts.customTopics}, channels: {...state.settings.channels, ...drafts.channels}, blockedTerms: blockedDraft ?? state.settings.blockedTerms}, 'Preferences saved. Make yourself at home.');
    if (ok) {for (const key of Object.keys(drafts)) drafts[key] = {}; blockedDraft = undefined; document.querySelector('#draft-status').textContent = 'All preferences saved on this device.';}
  });
  app.innerHTML = '<div class="loading-state" role="status"><span class="brand"><img class="brand-mark" src="icons/48.png" alt="" width="28" height="28">intent.</span><p>Making a little room to focus…</p></div>';
  if (live) chrome.runtime.onMessage.addListener(message => {
    if (message.type !== 'APPEARANCE' || !state || !['light', 'dark'].includes(message.appearance)) return;
    state.appearance = message.appearance; applyAppearance();
  });
  request('GET_STATE').then(result => { state = result; selected = modes()[state.settings.mode] ? state.settings.mode : 'work'; render(); }).catch(e => {
    app.innerHTML = '<div class="loading-state" role="alert"><span class="brand"><img class="brand-mark" src="icons/48.png" alt="" width="28" height="28">intent.</span><p></p><button class="button primary" id="retry">Try again ↗</button></div>';
    app.querySelector('p').textContent = e.message;
    app.querySelector('#retry').addEventListener('click', () => location.reload());
  });
  setInterval(async () => {
    if (!state || saving || document.hidden) return;
    try {
      const next = await request('GET_STATE');
      const changed = JSON.stringify(next.settings) !== JSON.stringify(state.settings);
      state = next; applyAppearance();
      if (changed) { if (modes()[state.settings.mode]) selected = state.settings.mode; render(); } else paintTime();
    } catch { /* Keep the last known state; changes will report connection failures. */ }
  }, 3000);
})();
