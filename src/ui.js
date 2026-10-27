(() => {
  const C = IntentCore, app = document.querySelector('#app');
  const full = document.body.classList.contains('settings');
  const live = Boolean(globalThis.chrome?.runtime?.id);
  let state, editing = null, saving = false, targetTabId, targetURL, draggedIntent, libraryOpen = false, stateRevision = 0;
  // Resolve once: a popup belongs to the tab from which it was opened.
  const targetReady = !full && live && chrome.tabs?.query ? chrome.tabs.query({active: true, currentWindow: true}).then(tabs => {
    const tab = tabs[0];
    if (Number.isInteger(tab?.id) && (C.isYouTube(tab.url) || tab.url?.startsWith(chrome.runtime.getURL('blocked.html')))) {targetTabId = tab.id; targetURL = tab.url;}
  }).catch(() => {}) : Promise.resolve();
  const NEW_INTENT = '__new__';
  const drafts = {customTopics: {}, channels: {}, descriptions: {}, names: {}, icons: {}, countModes: {}, matchOnlyModes: {}};
  let blockedDraft;
  const rolePresetsUI = full ? new IntentRolePresets({getSettings: () => state.settings, update}) : null;
  const libraryUI = new IntentLibrary({getSettings: () => state.settings, update, onCreate: () => {libraryOpen = false; editing = NEW_INTENT; render();}});
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const icons = {
    ...C.MODE_ICONS,
    shorts: '<path d="m14 3-7 9h5l-2 9 7-11h-5l2-7Z"/>',
    bait: '<path d="M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7Z"/><circle cx="12" cy="12" r="3"/><path d="m3 3 18 18"/>',
    edit: '<path d="m16 3 5 5M4 20l4-1 13-13a2 2 0 0 0-5-5L3 14l-1 6Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    resume: '<path d="m8 5 11 7-11 7Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.clock}</svg>`;
  const intentIconNames = {code: 'Code', book: 'Book', music: 'Music', compass: 'Compass', game: 'Gaming', film: 'Film', tools: 'Tools', sparkles: 'Sparkles', news: 'News', plane: 'Travel', food: 'Food', fitness: 'Fitness', palette: 'Art', camera: 'Camera', language: 'Language', science: 'Science', history: 'History', finance: 'Finance', leaf: 'Nature', heart: 'Heart'};
  const customIcon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-intent-icon="${escape(Object.hasOwn(C.INTENT_ICON_PATHS, key) ? key : 'compass')}">${C.INTENT_ICON_PATHS[key] || C.INTENT_ICON_PATHS.compass}</svg>`;
  function iconPickerMarkup(value) {
    const selected = Object.hasOwn(C.INTENT_ICON_PATHS, value) ? value : 'compass';
    return `<fieldset class="intent-icon-field"><legend id="intent-icon-label">Intent icon</legend><input type="hidden" id="intent-icon" value="${selected}"><div class="intent-icon-selection"><span id="intent-icon-preview" aria-hidden="true">${customIcon(selected)}</span><span><span class="field-hint">Selected icon</span><strong id="intent-icon-name">${intentIconNames[selected]}</strong></span></div><div id="intent-icon-picker" class="intent-icon-picker" role="group" aria-labelledby="intent-icon-label" aria-describedby="intent-icon-help">${Object.keys(C.INTENT_ICON_PATHS).map(key => `<button type="button" class="intent-icon-choice" data-icon-choice="${key}" title="${intentIconNames[key]}" aria-label="${intentIconNames[key]} icon" aria-pressed="${key === selected}" tabindex="${key === selected ? 0 : -1}">${customIcon(key)}<span class="intent-icon-check" aria-hidden="true">✓</span></button>`).join('')}</div><p id="intent-icon-help" class="field-hint">Choose an icon. Use the arrow keys to browse.</p></fieldset>`;
  }
  function chooseIntentIcon(key, focus = false) {
    if (!Object.hasOwn(C.INTENT_ICON_PATHS, key)) return;
    const input = document.querySelector('#intent-icon'); if (!input) return;
    input.value = key; input.dispatchEvent(new Event('input', {bubbles: true}));
    document.querySelector('#intent-icon-preview').innerHTML = customIcon(key);
    document.querySelector('#intent-icon-name').textContent = intentIconNames[key];
    for (const button of document.querySelectorAll('[data-icon-choice]')) {const active = button.dataset.iconChoice === key; button.setAttribute('aria-pressed', String(active)); button.tabIndex = active ? 0 : -1; if (active && focus) button.focus();}
  }
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
  const previewUI = full ? new IntentPreview({getSettings: () => state.settings, live, samples}) : null;
  async function request(type, patch, options = {}) {
    if (type === 'SET_TAB_PAUSED' && typeof options.paused !== 'boolean') throw new Error('Choose whether to pause or resume this tab.');
    if (['UPDATE_SETTINGS', 'RESET_SETTINGS', 'SET_TAB_PAUSED'].includes(type)) stateRevision++;
    if (live) {
      await targetReady;
      let timer;
      const result = await Promise.race([
        chrome.runtime.sendMessage({type, ...(type === 'SET_TAB_PAUSED' ? {paused: options.paused === true} : {patch}), ...(Number.isInteger(targetTabId) ? {targetTabId} : {})}),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Intent could not start. Reload it on your browser’s Extensions page, then refresh this page.')), 10000); })
      ]).finally(() => clearTimeout(timer));
      if (!result?.ok) throw new Error(result?.error || 'Intent could not connect. Try reloading the extension.');
      return result;
    }
    const settings = type === 'RESET_SETTINGS' ? C.defaults() : C.sanitize({...state?.settings || JSON.parse(localStorage.getItem('intent-demo') || 'null') || C.defaults(), ...patch});
    localStorage.setItem('intent-demo', JSON.stringify(settings));
    return {...C.snapshot(settings, {}), ok: true};
  }
  function toggle(key, label) { return `<button type="button" class="switch" role="switch" aria-checked="${state.settings[key]}" aria-label="${label}" data-toggle="${key}"><span></span></button>`; }
  const modes = () => C.modes(state?.settings || C.defaults());
  const modeName = mode => modes()[mode]?.name || 'Modes-off browsing';
  const matchingOnly = mode => mode !== 'off' && !C.countsMode(state.settings, mode) && state.settings.matchOnlyModes?.[mode] === true;
  const timerPolicy = mode => C.countsMode(state.settings, mode) ? 'This mode counts toward the daily limit.' : matchingOnly(mode) ? 'Matching and uncertain videos are exempt; unrelated videos count.' : 'This mode is exempt from the daily limit.';
  const canPauseTab = () => !full && live && Number.isInteger(targetTabId);
  function pageScopeNotice() {
    if (full || !targetURL || canPauseTab() && state.tabPaused) return '';
    let url; try {url = new URL(targetURL);} catch {return '';}
    const supported = ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname) && (url.pathname === '/' || url.pathname === '/watch');
    if (state.settings.mode === 'off') return 'Intent filtering is off. Distraction filters and the timer still apply.';
    if (supported) return '';
    return `Intent filtering is off ${url.pathname === '/results' ? 'on search results' : 'on this page'}. Your chosen intent is saved for Home and video recommendations. Distraction filters and the timer still apply.`;
  }
  function budgetNote() {
    if (canPauseTab() && state.tabPaused) return 'The timer is paused on this tab. Other tabs keep their own timer rules.';
    const s = state.settings;
    if (!s.limitEnabled) return 'Blocking is off. Usage still follows each intent’s timer rule.';
    if (matchingOnly(s.mode)) return `Matching and uncertain ${modeName(s.mode)} videos stay exempt. Clearly unrelated videos use the daily budget and close when the limit is reached. Browsing and search remain exempt.`;
    if (!C.countsMode(s, s.mode)) return `${modeName(s.mode)} does not count toward your daily limit. It stays accessible when the limit is reached.`;
    if (state.budgetExhausted || state.usedMs >= s.dailyMinutes * 60000) return 'Daily limit reached. Counted modes are blocked until midnight. Exempt modes remain available.';
    return 'When the limit is reached, counted modes close until midnight. Exempt modes remain available.';
  }
  const timerPolicyValue = (counted, matching) => counted ? 'all' : matching ? 'off-topic' : 'none';
  const timerPolicyDescription = value => value === 'all' ? 'All browsing and videos in this intent count.' : value === 'off-topic' ? 'Only clearly unrelated videos count. Matching and uncertain videos, browsing and search stay exempt.' : 'Browsing and videos in this intent do not count.';
  function timerPolicyChoices(value, mode, name, editor = false) {
    const help = editor ? 'intent-timer-policy-help' : `timer-policy-help-${mode}`;
    return `<div class="timer-policy-group" role="radiogroup" aria-label="${escape(editor ? 'Intent time counting' : `${name} time counting`)}" aria-describedby="${help}">${[['all','Count all'], ...(mode === 'off' ? [] : [['off-topic','Off-topic only']]), ['none','Don’t count']].map(([key, label]) => `<label class="timer-policy-option"><input type="radio" name="${editor ? 'intent-timer-policy' : `timer-policy-${mode}`}" value="${key}" ${editor ? 'data-editor-timer-policy' : `data-timer-policy-mode="${mode}"`} ${value === key ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div><p id="${help}" class="timer-policy-explanation" ${editor ? 'aria-live="polite"' : ''}>${timerPolicyDescription(value)}</p>`;
  }
  function countModeToggle(mode) {
    const name = mode === 'off' ? 'Modes off' : modes()[mode].name;
    return `<div class="timer-policy-row"><h3>${escape(name)}</h3>${timerPolicyChoices(timerPolicyValue(C.countsMode(state.settings, mode), matchingOnly(mode)), mode, name)}</div>`;
  }
  function applyAppearance() {
    const appearance = state?.appearance;
    if (appearance === 'light' || appearance === 'dark') document.documentElement.dataset.theme = appearance;
    else document.documentElement.removeAttribute('data-theme');
  }
  function tabPauseControl() {
    if (!canPauseTab()) return '';
    const paused = state.tabPaused === true;
    const label = paused ? 'Resume on this tab' : 'Pause on this tab';
    const detail = paused ? 'Filters and the timer are paused here. Other tabs remain active.' : 'Pause filters and time tracking for this tab without changing its saved intent.';
    return `<div class="tab-pause-control">${paused ? '<span class="tab-pause-state" role="status">Paused</span>' : ''}<button type="button" class="tab-pause-action" id="tab-pause" aria-label="${label}" aria-pressed="${paused}" aria-describedby="tab-pause-detail" title="${label}. ${detail}">${icon(paused ? 'resume' : 'pause')}<span>${paused ? 'Resume' : 'Pause'}</span></button><span id="tab-pause-detail" class="visually-hidden">${detail}</span></div>`;
  }
  function reorderControls(id, name, index, total) {
    return `<div class="intent-reorder-controls"><button type="button" data-move-intent="${id}" data-direction="-1" aria-label="Move ${escape(name)} earlier" title="Move earlier" ${index === 0 ? 'disabled' : ''}>←</button><button type="button" class="intent-drag-handle" id="intent-reorder-${id}" data-drag-intent="${id}" draggable="true" aria-label="Reorder ${escape(name)}" title="Drag to reorder, or use arrow keys, Home and End">⠿</button><button type="button" data-move-intent="${id}" data-direction="1" aria-label="Move ${escape(name)} later" title="Move later" ${index === total - 1 ? 'disabled' : ''}>→</button></div>`;
  }
  async function moveIntent(id, position) {
    if (!full || saving) return false;
    const ids = Object.keys(modes()), index = ids.indexOf(id);
    if (index < 0 || !Number.isInteger(position)) return false;
    const target = Math.max(0, Math.min(ids.length - 1, position));
    if (target === index) return false;
    ids.splice(index, 1); ids.splice(target, 0, id);
    return update({intentOrder: ids}, `Moved ${modes()[id].name} to position ${target + 1} of ${ids.length}.`);
  }
  function clearDrag() {
    draggedIntent = null;
    for (const tile of app.querySelectorAll('.intent-dragging,.intent-drop-target')) tile.classList.remove('intent-dragging', 'intent-drop-target');
  }
  function render() {
    if (!full && live && !Number.isInteger(targetTabId)) {
      applyAppearance();
      app.innerHTML = `<header class="topbar"><span class="brand"><img class="brand-mark" src="icons/48.png" alt="" width="28" height="28">intent<span class="brand-dot">.</span></span></header><section class="outside-youtube"><span class="off-indicator">Off on this site</span><h1>Intent only runs on YouTube.</h1><p>This page is not read or filtered. Intent controls become available when you open a YouTube tab.</p><a class="button primary" href="https://www.youtube.com/" target="_blank" rel="noopener">Open YouTube</a><a class="all-settings" href="settings.html" target="_blank">Settings ↗</a></section>`;
      return;
    }

    applyAppearance();
    const s = state.settings, definitions = modes(), active = definitions[s.mode];
    app.innerHTML = `
      <header class="topbar"><span class="brand"><img class="brand-mark" src="icons/48.png" alt="" width="28" height="28">intent<span class="brand-dot">.</span></span><span class="top-note">YouTube controls</span>${tabPauseControl()}${full ? '<a class="youtube-link" href="https://www.youtube.com/" target="_blank" rel="noopener">Open YouTube ↗</a>' : ''}</header>
      ${!live ? '<div class="demo-banner">INTERACTIVE PREVIEW · Settings here are a demo. Load the extension to filter YouTube.</div>' : ''}
      ${canPauseTab() && state.tabPaused && targetURL?.startsWith(chrome.runtime.getURL('blocked.html')) ? '<button type="button" class="text-button return-paused-youtube" id="return-paused-youtube">Open YouTube in this tab ↗</button>' : ''}
      <section class="intro"><div><div class="eyebrow"><span class="tiny-dot"></span> Your feed, your choice</div><h1>YouTube, with intent.</h1><p>Choose what you want to watch. Make room for it.</p></div></section>

      <div class="workspace"><div class="main-column">
      <section class="panel modes-panel"><div class="section-head"><h2>What are you here for?</h2><button type="button" class="mode-off-button" data-mode="off" aria-pressed="${s.mode === 'off'}" aria-describedby="intent-off-help" title="Turn off topic filtering. Distraction filters and this mode’s timer rule still apply. Pause is separate and stops filters and timer on this tab.">${s.mode === 'off' ? 'Intent off' : 'Turn intent off'}</button></div><p class="section-copy">${!full && Number.isInteger(targetTabId) ? "Choose the intent for this YouTube tab. Other tabs keep their own mode." : "Choose your last used intent. Existing YouTube tabs keep their own mode."}</p><span class="visually-hidden" id="intent-off-help">Intent off stops topic filtering; distraction filters and its timer rule still apply. Pause stops all filters and timer counting on a particular tab.</span>${pageScopeNotice() ? `<p class="scope-notice" role="status">${escape(pageScopeNotice())}</p>` : ''}<div class="mode-grid">${Object.entries(definitions).map(([key, m], index) => `<div class="mode-tile" ${full ? `data-order-intent="${key}"` : ''}><button class="mode ${s.mode === key ? 'selected' : ''}" data-mode="${key}" title="${escape(m.name)}" aria-pressed="${s.mode === key}"><span class="mode-icon">${Object.hasOwn(s.customIntents, key) ? `<span class="intent-symbol" aria-hidden="true">${customIcon(m.icon)}</span>` : icon(key)}</span><span class="mode-check" aria-hidden="true">${s.mode === key ? '✓' : ''}</span><strong>${escape(m.name)}</strong><small>${key === 'work' ? 'Get in the zone' : key === 'study' ? 'Stay curious' : key === 'music' ? 'Find your rhythm' : 'Your custom intent'}</small></button><button type="button" class="edit-intent" data-edit="${key}" aria-label="Edit ${escape(m.name)} intent" title="Edit ${escape(m.name)} intent">${icon('edit')}</button>${full ? reorderControls(key, m.name, index, Object.keys(definitions).length) : ''}</div>`).join('')}</div>${!full ? `<div class="popup-intent-actions"><button type="button" class="button" id="popup-create-intent" ${Object.keys(s.customIntents).length >= C.MAX_CUSTOM_INTENTS ? 'disabled' : ''}>Create intent</button><button type="button" class="button" id="popup-intent-library">Intent library</button></div>` : ''}${full ? '<p class="field-hint intent-order-hint">Drag handles to reorder intents, or use the move buttons. Focus a handle to use arrow keys, Home or End.</p>' : ''}<div class="mode-caption"><span class="tiny-dot"></span><span>${canPauseTab() && state.tabPaused ? `${escape(modeName(s.mode))} is saved for this tab. Filters and the timer are paused here.` : active ? `${escape(active.name)} mode is ${!full && Number.isInteger(targetTabId) ? 'saved for this tab' : 'your last used intent'}. ${timerPolicy(s.mode)}` : `Modes are off. Your distraction filters still apply. ${C.countsMode(s, 'off') ? 'This browsing counts toward the daily limit.' : 'This browsing is exempt from the daily limit.'}`}</span></div></section>
      ${full ? '<section class="panel" id="intent-library" aria-label="Intent library and ordering"></section><section class="panel" id="role-presets" aria-label="Role presets"></section>' : ''}
      ${full ? `<section class="panel tab-policy-panel"><div class="section-head"><h2>New YouTube tabs</h2></div><p class="section-copy">Each tab keeps its own intent, including after a reload. Choose how newly opened YouTube tabs start.</p><label for="new-tab-mode">Intent for new YouTube tabs</label><select id="new-tab-mode"><option value="last" ${s.newTabMode === 'last' ? 'selected' : ''}>Follow last used intent</option>${[...Object.entries(definitions).map(([key, item]) => [key, item.name]), ['off', 'Modes off']].map(([key, name]) => `<option value="${key}" ${s.newTabMode === key ? 'selected' : ''}>${key === 'off' ? 'Start with modes off' : `Always ${escape(name)}`}</option>`).join('')}</select><p class="field-hint">Changing this setting affects new tabs. Open tabs keep the intent you selected for them.</p></section>` : ''}
      <section class="panel filter-panel"><div class="section-head"><h2>Distraction filters</h2><span class="subtle">YOUR FILTERS</span></div><div class="setting-row"><span class="row-icon">${icon('shorts')}</span><div><h3>Hide Shorts</h3><p>Remove Shorts from YouTube.</p></div>${toggle('hideShorts', 'Hide Shorts')}</div><div class="setting-row"><span class="row-icon">${icon('bait')}</span><div><h3>Filter clickbait</h3><p>Hide titles with common clickbait patterns.</p></div>${toggle('hideClickbait', 'Filter clickbait')}</div><p class="helper">Clickbait detection uses title patterns. It may miss some videos or hide useful ones.</p></section>

      ${full ? `<section class="panel metadata-panel"><div class="section-head"><h2>Fuller video checks</h2></div><p id="metadata-cost" class="section-copy">Each uncached check makes one additional request to a public YouTube video page. Higher limits can improve topic matching but use more network requests and may load more slowly. Cached descriptions need no extra request.</p><label for="metadata-limit">Maximum fuller checks per batch</label><div class="metadata-limit-row"><input id="metadata-limit" type="number" min="0" max="40" step="1" required value="${s.metadataLimit ?? 4}" aria-describedby="metadata-cost metadata-policy"><span>0–40 checks</span></div><p id="metadata-policy" class="field-hint">0 uses available search metadata only. Applies separately to each search batch; the first feed can load two batches. Stops earlier when enough clear matches are found. Up to four checks run at once.</p></section>` : ''}

      </div><aside class="side-column"><section class="panel budget-panel"><div class="section-head"><h2>Your daily budget</h2>${toggle('limitEnabled', 'Enable daily time limit')}</div><p class="section-copy">Set how much time you want to spend on YouTube.</p><div class="budget-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle class="ring-track" cx="100" cy="100" r="87"/><circle class="ring-value" id="ring-value" cx="100" cy="100" r="87"/></svg><div><strong id="remaining-value">60<span>min</span></strong><span id="remaining-label">left for today</span></div></div><div class="budget-summary"><span id="used-label">0 min used</span><span id="limit-label">60 min budget</span></div><div class="presets" aria-label="Daily budget presets">${[30, 60, 90].map(n => `<button data-minutes="${n}" class="${s.dailyMinutes === n ? 'active' : ''}" aria-pressed="${s.dailyMinutes === n}">${n} min</button>`).join('')}</div><label class="custom-budget" for="daily-minutes">Daily limit <span><input id="daily-minutes" type="number" min="1" max="1440" step="1" value="${s.dailyMinutes}" aria-describedby="budget-note"> min / day</span></label><p id="budget-note" class="budget-note">${escape(budgetNote())}</p><div class="playback-row"><div><h3>Count background playback</h3><p>Eligible playback follows each intent’s timer rule.</p></div>${toggle('countPlayback', 'Count background playback')}</div><p class="helper timer-explainer">The toolbar clock shows your remaining budget. Selected modes count while browsing or scrolling in the focused tab; eligible playback can also count. Multiple tabs count once. Exempt intents add no time unless matching-only exemptions identify an unrelated video. Resets at local midnight.</p></section>${full ? `<section class="panel timer-modes-panel"><div class="section-head"><h2>Time counting</h2></div><p class="section-copy">Choose how each intent uses your daily budget.</p><div class="count-mode-list">${[...Object.keys(definitions), 'off'].map(countModeToggle).join('')}</div><p class="helper">Eligible background playback follows the same rule. The daily budget is shared across tabs.</p></section>` : ''}${full ? '<div class="privacy-note"><span>↳</span><div><strong>Private by default</strong><p>Bundled local AI. No accounts or analytics.<br>Your settings and time stay in your browser.</p></div></div>' : '<a class="all-settings" href="settings.html" target="_blank">Settings <span>↗</span></a>'}</aside></div>
      ${full ? '<section class="preview-section" id="intent-preview" aria-label="Filter preview"></section>' : ''}
      ${!full ? '<dialog id="intent-library-dialog" aria-labelledby="library-dialog-heading"><header class="dialog-heading"><h2 id="library-dialog-heading">Intent library</h2><button type="button" class="icon-button" id="close-intent-library" aria-label="Close intent library">×</button></header><section id="intent-library" aria-label="Add intents"></section></dialog>' : ''}
      ${editorMarkup()}${full ? '<dialog id="reset-dialog" aria-labelledby="reset-heading"><h2 id="reset-heading">Reset settings to factory defaults?</h2><p>This restores built-in intents, the role-preset library, intent order, timer rules, new-tab preferences and fuller-check limits, and clears per-tab pauses. Your custom intents and filter rules will be removed. Daily time already used and usage history will be kept.</p><div class="dialog-actions"><button type="button" class="button" id="cancel-reset">Cancel</button><button type="button" class="button danger" id="confirm-reset">Reset to defaults</button></div></dialog>' : ''}<footer><span>Your settings stay on this device.</span>${full ? '<button type="button" class="button danger-button" id="reset-settings">Reset settings</button>' : ''}<span>intent · ${full ? '2.2.2' : 'LOCAL & PRIVATE'}</span></footer><div id="notice" role="status" aria-live="polite"></div>`;
    paintTime(); paintSamples(); rolePresetsUI?.render(); libraryUI?.render();
    const catalogue = document.querySelector('#intent-library-dialog');
    if (libraryOpen && catalogue) catalogue.showModal();
    catalogue?.addEventListener('cancel', event => {event.preventDefault(); closeLibrary();});
    catalogue?.addEventListener('click', event => {if(event.target===catalogue){const r=catalogue.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeLibrary();}});
    const editor = document.querySelector('#intent-editor');
    if (editing && editor && !editor.open) editor.showModal();
    editor?.addEventListener('cancel', event => {event.preventDefault(); closeEditor();});
    editor?.addEventListener('click', event => {if (event.target === editor) {const r=editor.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeEditor();}});
  }
  function builtinDefaultsMarkup(id) {
    const builtin = C.MODES[id]; if (!builtin) return '';
    const defaults = {...C.defaults(), mode: id};
    return `<section id="builtin-defaults" class="builtin-defaults" aria-labelledby="builtin-defaults-heading"><h3 id="builtin-defaults-heading">Built-in ${escape(builtin.name)} defaults</h3><p>Default name: <strong id="default-intent-name">${escape(builtin.name)}</strong></p><ul id="default-scope">${IntentSemantic.PROFILES[id].map(text => `<li>${escape(text)}</li>`).join('')}</ul><details><summary>Default topics and discovery searches</summary><h4>Topic keywords</h4><ul id="default-topics" class="default-tags">${builtin.topics.map(topic => `<li>${escape(topic)}</li>`).join('')}</ul><h4>Discovery searches</h4><ul id="default-searches">${IntentFeed.queries(defaults).map(query => `<li>${escape(query)}</li>`).join('')}</ul></details><p>Default extra topics and included channels: none. Extra topics add to whichever scope you choose.</p></section>`;
  }
  function scopeStatus(description) {return description.trim() ? 'Custom scope replaces the built-in scope' : 'Using built-in scope';}
  function editorMarkup() {
    const s = state.settings, creating = editing === NEW_INTENT;
    const mode = creating ? {name: 'New intent'} : modes()[editing];
    if (!mode) return '';
    const record = s.customIntents[editing];
    const custom = creating || Boolean(record);
    const description = drafts.descriptions[editing] ?? (custom ? record?.description || '' : s.intentDescriptions[editing]);
    const name = drafts.names[editing] ?? (creating ? '' : mode.name);
    const topics = drafts.customTopics[editing] ?? s.customTopics[editing] ?? '';
    const channels = drafts.channels[editing] ?? s.channels[editing] ?? '';
    const counted = drafts.countModes[editing] ?? (creating ? true : C.countsMode(s, editing));
    const matchOnly = drafts.matchOnlyModes[editing] ?? s.matchOnlyModes?.[editing] ?? false;
    const role = ['work', 'study'].includes(editing) && s.rolePresets[s.lastRolePreset];
    const template = !creating && C.defaultTemplate(s, editing);
    return `<dialog id="intent-editor" aria-labelledby="editor-heading">
      <header class="dialog-heading"><h2 id="editor-heading">${creating ? 'Create intent' : `Edit ${escape(mode.name)} intent`}</h2><button type="button" class="icon-button" id="close-editor" aria-label="Close intent editor">×</button></header>
      <form id="rules-form"><label for="intent-name">Intent name</label><input id="intent-name" required maxlength="48" value="${escape(name)}" placeholder="e.g. Learning German">
      ${custom ? iconPickerMarkup(drafts.icons[editing] ?? record?.icon ?? 'compass') : builtinDefaultsMarkup(editing)}
      ${template ? `<details class="template-scope-reference"><summary>Library matching topics</summary><p class="field-hint">These support the original library description. Editing the description replaces this scope.</p><ul class="default-tags">${template.topics.map(topic => `<li>${escape(topic)}</li>`).join('')}</ul></details>` : ''}
      ${role ? `<p class="field-hint">Last applied role preset: ${escape(role.name)}. Editing this intent is independent of the saved preset.</p>` : ''}
      <label for="intent-description">${creating ? 'What should this intent show?' : `Intent description for ${escape(mode.name.toLowerCase())}`}</label>
      ${custom ? '' : `<div class="scope-choice"><span id="intent-scope-status" role="status" aria-live="polite">${scopeStatus(description)}</span><button type="button" class="text-button" id="use-built-in-scope">Use built-in scope</button></div>`}
      <textarea id="intent-description" rows="4" maxlength="1000" ${custom ? 'required' : ''} aria-describedby="intent-description-help${custom ? '' : ' intent-scope-status'}" placeholder="${custom ? 'Describe your purpose and subjects, e.g. beginner German lessons, listening practice and pronunciation.' : 'Leave blank to use the defaults shown above.'}">${escape(description)}</textarea>
      <p id="intent-description-help" class="field-hint">Put your purpose and subjects together here. This guides matching by meaning and the main video searches.${custom ? '' : ' A custom description replaces the built-in scope and discovery searches above. Leave it blank to restore them.'} Optional extra topics in Advanced options add discovery searches without rewriting this description; they expand the scope.</p>
      <label for="channels">Always include these channels in this mode</label><textarea id="channels" rows="2" maxlength="4000" placeholder="Exact channel names, separated by commas">${escape(channels)}</textarea><p class="field-hint">Shorts, clickbait and blocked phrases still take priority.</p>
      <fieldset class="intent-timer-field"><legend>Time counting</legend>${timerPolicyChoices(timerPolicyValue(counted, matchOnly), editing, name || 'New intent', true)}</fieldset>
      <details class="intent-advanced" ${topics.trim() ? 'open' : ''}><summary>Advanced options</summary><label for="topics">Additional discovery topics (optional)</label><textarea id="topics" rows="2" maxlength="4000" placeholder="Short topics separated by commas">${escape(topics)}</textarea><p class="field-hint">These launch extra topic searches and add matching examples while keeping your main description intact. Leave this empty when the description already covers what you want.</p>
      <label for="blocked-terms">Hide these words or phrases in every mode</label><textarea id="blocked-terms" rows="2" maxlength="4000">${escape(blockedDraft ?? s.blockedTerms)}</textarea><p class="field-hint">This blocked-phrase list is shared by all intents.</p></details><p id="draft-status" class="helper">Changes apply when you save.</p>
      <div class="dialog-actions">${custom && !creating ? '<button type="button" class="button danger-button" id="delete-intent">Delete intent</button>' : ''}<button type="button" class="button" id="cancel-editor">Cancel</button><button type="submit" class="button primary">${creating ? 'Create intent' : 'Save preferences'}</button></div></form></dialog>`;
  }
  function closeLibrary() {libraryOpen = false; render(); document.querySelector('#popup-intent-library')?.focus();}
  function closeEditor() {
    if (saving) return;
    const previous = editing;
    if (previous) for (const field of Object.values(drafts)) delete field[previous];
    blockedDraft = undefined; editing = null; render();
    if (previous === NEW_INTENT) document.querySelector('#popup-create-intent,#new-intent')?.focus(); else document.querySelector(`[data-edit="${previous}"]`)?.focus();
  }
  async function factoryReset() {
    if (saving) return;
    saving = true;
    try {
      previewUI?.reset();
      state = await request('RESET_SETTINGS'); editing = null;
      for (const key of Object.keys(drafts)) drafts[key] = {};
      blockedDraft = undefined;
      render(); notify('Factory settings restored. Daily usage was kept.');
    } catch(error) {notify(error.message,true);}
    finally {saving = false;}
  }
  function paintTime() {
    const s = state.settings, ms = s.limitEnabled ? state.remainingMs : state.usedMs;
    const minutes = s.limitEnabled ? Math.ceil(ms / 60000) : Math.floor(ms / 60000);
    document.querySelector('#remaining-value').innerHTML = `${minutes}<span>min</span>`;
    const exempt = typeof state.timerExempt === 'boolean' ? state.timerExempt : !C.countsMode(s, s.mode);
    document.querySelector('#remaining-label').textContent = s.limitEnabled ? (canPauseTab() && state.tabPaused ? 'timer paused on this tab' : matchingOnly(s.mode) ? state.timerTopicState === 'unrelated' ? 'unrelated video · counts toward budget' : 'shared budget · matching-only exemption' : exempt ? 'shared budget · this mode is exempt' : state.blocked ? 'time to step away' : 'left for today') : 'used today';
    document.querySelector('#used-label').textContent = `${Math.floor(state.usedMs / 60000)} min used`;
    document.querySelector('#limit-label').textContent = s.limitEnabled ? `${s.dailyMinutes} min budget` : 'No limit';
    const ring = document.querySelector('#ring-value');
    const fraction = s.limitEnabled ? Math.max(0, state.remainingMs / (s.dailyMinutes * 60000)) : 1;
    ring.style.strokeDashoffset = String(547 * (1 - fraction));
    ring.style.stroke = state.blocked ? 'var(--danger)' : 'var(--blue)';
    document.querySelector('#budget-note').textContent = budgetNote();
  }
  function paintSamples() {previewUI?.render();}
  function notify(message, error = false) {
    const notice = document.querySelector('#notice'); notice.textContent = message;
    notice.className = `visible ${error ? 'error' : ''}`;
    clearTimeout(notify.timeout); notify.timeout = setTimeout(() => notice.className = '', 4000);
  }
  async function update(patch, message = 'Saved. Your feed follows your lead.') {
    if (saving) return false;
    const focused = document.activeElement;
    const focusSelector = focused?.dataset.timerPolicyMode ? `[data-timer-policy-mode="${focused.dataset.timerPolicyMode}"][value="${focused.value}"]` : focused?.dataset.mode ? `[data-mode="${focused.dataset.mode}"]` : focused?.dataset.toggle ? `[data-toggle="${focused.dataset.toggle}"]` : focused?.dataset.minutes ? `[data-minutes="${focused.dataset.minutes}"]` : focused?.id ? `#${focused.id}` : focused?.type === 'submit' ? '#rules-form button[type="submit"]' : null;
    saving = true; app.setAttribute('aria-busy', 'true');
    const editorControls = [...app.querySelectorAll('#intent-editor input,#intent-editor textarea,#intent-editor select,#intent-editor button')].map(control => [control, control.disabled]);
    for (const [control] of editorControls) control.disabled = true;
    try {
      state = await request('UPDATE_SETTINGS', patch);
      render(); if (focusSelector) document.querySelector(focusSelector)?.focus(); notify(message); return true;
    } catch (e) { notify(e.message, true); return false; }
    finally {
      for (const [control, disabled] of editorControls) if (control.isConnected) control.disabled = disabled;
      saving = false; app.removeAttribute('aria-busy');
    }
  }
  async function setTabPaused() {
    if (!canPauseTab() || saving) return;
    saving = true; app.setAttribute('aria-busy', 'true');
    const paused = !state.tabPaused;
    try {
      state = await request('SET_TAB_PAUSED', undefined, {paused});
      render(); document.querySelector('#tab-pause')?.focus();
      notify(state.tabPaused ? 'Filters and timer paused on this tab. Other tabs remain active.' : 'Intent resumed on this tab.');
    } catch (error) {notify(error.message, true);}
    finally {saving = false; app.removeAttribute('aria-busy');}
  }
  app.addEventListener('click', async e => {
    const button = e.target.closest('button'); if (!button) return;
    if (button.dataset.iconChoice) {chooseIntentIcon(button.dataset.iconChoice); return;}
    if (button.dataset.moveIntent) {const ids = Object.keys(modes()); await moveIntent(button.dataset.moveIntent, ids.indexOf(button.dataset.moveIntent) + Number(button.dataset.direction)); return;}
    if (button.id === 'popup-create-intent') {libraryOpen = false; editing = NEW_INTENT; render(); return;}
    if (button.id === 'popup-intent-library') {libraryOpen = true; libraryUI.catalogueOpen = true; render(); return;}
    if (button.id === 'close-intent-library') {closeLibrary(); return;}
    if (button.id === 'tab-pause') {await setTabPaused(); return;}
    if (button.id === 'return-paused-youtube' && canPauseTab() && state.tabPaused) {
      try {await chrome.tabs.update(targetTabId, {url: 'https://www.youtube.com/'});} catch (error) {notify(error.message, true);}
      return;
    }
    if (button.id === 'use-built-in-scope') {const input = document.querySelector('#intent-description'); input.value = ''; input.dispatchEvent(new Event('input', {bubbles: true})); input.focus(); return;}
    if (button.dataset.edit) {editing = button.dataset.edit; render(); return;}
    if (['close-editor','cancel-editor'].includes(button.id)) {closeEditor(); return;}
    if (button.id === 'reset-settings') {document.querySelector('#reset-dialog').showModal(); return;}
    if (button.id === 'cancel-reset') {document.querySelector('#reset-dialog').close(); return;}
    if (button.id === 'confirm-reset') {await factoryReset(); return;}
    if (button.dataset.mode) await update({mode: button.dataset.mode}, Number.isInteger(targetTabId) ? 'Intent saved for this tab. Other tabs keep their mode.' : 'Last used intent saved. Existing tabs keep their mode.');
    else if (button.dataset.toggle) await update({[button.dataset.toggle]: !state.settings[button.dataset.toggle]});
    else if (button.dataset.minutes) await update({dailyMinutes: Number(button.dataset.minutes)});
    else if (button.id === 'delete-intent' && state.settings.customIntents?.[editing]) {
      const removed = editing; const customIntents = {...state.settings.customIntents}; delete customIntents[removed]; editing = null;
      for (const field of Object.values(drafts)) delete field[removed];
      await update({customIntents, ...(state.settings.mode === removed ? {mode: 'work'} : {}), ...(state.settings.newTabMode === removed ? {newTabMode: 'last'} : {})}, 'Intent deleted. Work is now your last used intent.');
    }

  });
  app.addEventListener('dragstart', event => {
    const handle = event.target.closest('[data-drag-intent]');
    if (!full || saving || !handle || !Object.hasOwn(modes(), handle.dataset.dragIntent)) return;
    draggedIntent = handle.dataset.dragIntent;
    event.dataTransfer.setData('text/plain', draggedIntent); event.dataTransfer.effectAllowed = 'move';
    handle.closest('.mode-tile').classList.add('intent-dragging');
  });
  app.addEventListener('dragover', event => {
    if (!full || !draggedIntent || !event.target.closest('.mode-grid')) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move';
    for (const tile of app.querySelectorAll('.intent-drop-target')) tile.classList.remove('intent-drop-target');
    const tile = event.target.closest('[data-order-intent]');
    if (tile && tile.dataset.orderIntent !== draggedIntent) tile.classList.add('intent-drop-target');
  });
  app.addEventListener('drop', async event => {
    if (!full || !draggedIntent || !event.target.closest('.mode-grid')) return;
    event.preventDefault();
    const id = draggedIntent, ids = Object.keys(modes()), tile = event.target.closest('[data-order-intent]');
    const target = tile ? ids.indexOf(tile.dataset.orderIntent) : ids.length - 1;
    clearDrag();
    if (await moveIntent(id, target)) document.querySelector(`[data-drag-intent="${id}"]`)?.focus();
  });
  app.addEventListener('dragend', clearDrag);
  app.addEventListener('keydown', async event => {
    const choice = event.target.closest('[data-icon-choice]');
    if (choice && ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const keys = Object.keys(C.INTENT_ICON_PATHS), index = keys.indexOf(choice.dataset.iconChoice);
      const offset = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5}[event.key];
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (index + offset + keys.length) % keys.length;
      chooseIntentIcon(keys[target], true); return;
    }
    const handle = event.target.closest('[data-drag-intent]');
    if (!full || !handle || !['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const ids = Object.keys(modes()), index = ids.indexOf(handle.dataset.dragIntent);
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
    await moveIntent(handle.dataset.dragIntent, target);
  });
  app.addEventListener('change', e => {
    if (e.target.dataset.timerPolicyMode) {
      const mode = e.target.dataset.timerPolicyMode, value = e.target.value;
      if (e.target.checked) update({countModes: {...state.settings.countModes, [mode]: value === 'all'}, matchOnlyModes: {...state.settings.matchOnlyModes, [mode]: value === 'off-topic'}}, 'Time counting saved.');
    }
    else if (e.target.id === 'metadata-limit') {
      if (e.target.checkValidity() && e.target.value !== '') update({metadataLimit: Number(e.target.value)}, 'Fuller video check limit saved.');
      else e.target.reportValidity();
    }
    else if (e.target.id === 'new-tab-mode') update({newTabMode: e.target.value}, 'New-tab intent saved. Existing tabs keep their mode.');
    else if (e.target.id === 'daily-minutes') {
      if (e.target.checkValidity() && e.target.value !== '') update({dailyMinutes: Number(e.target.value)});
      else { e.target.reportValidity(); }
    }
  });
  app.addEventListener('input', e => {
    if (e.target.id === 'intent-description') {drafts.descriptions[editing] = e.target.value; const status = document.querySelector('#intent-scope-status'); if (status) status.textContent = scopeStatus(e.target.value);}
    if (e.target.id === 'intent-icon') drafts.icons[editing] = e.target.value;
    if (e.target.hasAttribute('data-editor-timer-policy') && e.target.checked) {drafts.countModes[editing] = e.target.value === 'all'; drafts.matchOnlyModes[editing] = e.target.value === 'off-topic'; document.querySelector('#intent-timer-policy-help').textContent = timerPolicyDescription(e.target.value);}
    if (e.target.id === 'intent-name') drafts.names[editing] = e.target.value;
    if (e.target.id === 'topics') drafts.customTopics[editing] = e.target.value;
    if (e.target.id === 'channels') drafts.channels[editing] = e.target.value;
    if (e.target.id === 'blocked-terms') blockedDraft = e.target.value;
    if ((e.target.hasAttribute('data-editor-timer-policy') || ['topics', 'channels', 'blocked-terms', 'intent-description', 'intent-name', 'intent-icon'].includes(e.target.id)) && document.querySelector('#draft-status')) document.querySelector('#draft-status').textContent = 'Unsaved preferences';
  });
  app.addEventListener('submit', async e => {
    e.preventDefault();
    if (e.target.id !== 'rules-form') return;
    if (editing === NEW_INTENT) {
      if (Object.keys(state.settings.customIntents).length >= C.MAX_CUSTOM_INTENTS) {notify('Remove an optional intent before creating another.', true); return;}
      const name = (drafts.names[NEW_INTENT] || '').trim(), description = (drafts.descriptions[NEW_INTENT] || '').trim();
      if (!name || !description) {notify('Add a name and description for your intent.', true); return;}
      const id = 'custom-' + crypto.randomUUID().slice(0, 8), s = state.settings;
      const ok = await update({customIntents: {...s.customIntents, [id]: {name, description, icon: drafts.icons[NEW_INTENT] || 'compass'}}, customTopics: {...s.customTopics, [id]: drafts.customTopics[NEW_INTENT] || ''}, channels: {...s.channels, [id]: drafts.channels[NEW_INTENT] || ''}, countModes: {...s.countModes, [id]: drafts.countModes[NEW_INTENT] ?? true}, matchOnlyModes: {...s.matchOnlyModes, [id]: drafts.matchOnlyModes[NEW_INTENT] ?? false}, blockedTerms: blockedDraft ?? s.blockedTerms, intentOrder: [...Object.keys(C.modes(s)), id], mode: id}, 'Custom intent created. Its icon, channels and timer rule are saved.');
      if (ok) {for (const field of Object.values(drafts)) delete field[NEW_INTENT]; blockedDraft = undefined; editing = null; render(); document.querySelector(`[data-edit="${id}"]`)?.focus();}
      return;
    }

    const customIntents = {...state.settings.customIntents}, intentDescriptions = {...state.settings.intentDescriptions}, intentNames = {...state.settings.intentNames};
    for (const [id, description] of Object.entries(drafts.descriptions)) {
      if (customIntents[id]) customIntents[id] = {...customIntents[id], description: description.trim()};
      else intentDescriptions[id] = description.trim();
    }
    for (const [id, name] of Object.entries(drafts.names)) {if (customIntents[id]) customIntents[id] = {...customIntents[id], name: name.trim()}; else intentNames[id] = name.trim();}
    for (const [id, value] of Object.entries(drafts.icons)) if (customIntents[id]) customIntents[id] = {...customIntents[id], icon: value};
    for (const value of Object.values(customIntents)) if (!value.name || !value.description) {notify('Custom intents need both a name and a description. Finish the draft before saving.', true); return;}
    const ok = await update({customIntents, intentDescriptions, intentNames, customTopics: {...state.settings.customTopics, ...drafts.customTopics}, channels: {...state.settings.channels, ...drafts.channels}, countModes: {...state.settings.countModes, ...drafts.countModes}, matchOnlyModes: {...state.settings.matchOnlyModes, ...drafts.matchOnlyModes}, blockedTerms: blockedDraft ?? state.settings.blockedTerms}, 'Preferences saved. Make yourself at home.');
    if (ok) {for (const key of Object.keys(drafts)) drafts[key] = {}; blockedDraft = undefined; document.querySelector('#draft-status').textContent = 'All preferences saved on this device.';}
  });
  app.innerHTML = '<div class="loading-state" role="status"><span class="brand"><img class="brand-mark" src="icons/48.png" alt="" width="28" height="28">intent.</span><p>Making a little room to focus…</p></div>';
  if (live) chrome.runtime.onMessage.addListener(message => {
    if (message.type !== 'APPEARANCE' || !state || !['light', 'dark'].includes(message.appearance)) return;
    state.appearance = message.appearance; applyAppearance();
  });
  request('GET_STATE').then(result => { state = result; render(); }).catch(e => {
    app.innerHTML = '<div class="loading-state" role="alert"><span class="brand"><img class="brand-mark" src="icons/48.png" alt="" width="28" height="28">intent.</span><p></p><button class="button primary" id="retry">Try again ↗</button></div>';
    app.querySelector('p').textContent = e.message;
    app.querySelector('#retry').addEventListener('click', () => location.reload());
  });
  setInterval(async () => {
    if (!state || saving || document.hidden) return;
    const revision = stateRevision;
    try {
      const next = await request('GET_STATE');
      // A read begun before a control was saved must not undo its newer result.
      if (revision !== stateRevision || saving) return;
      const changed = JSON.stringify(next.settings) !== JSON.stringify(state.settings) || Boolean(next.tabPaused) !== Boolean(state.tabPaused);
      state = next; applyAppearance();
      if (!full && live && !Number.isInteger(targetTabId)) return;
      if (changed) render(); else paintTime();
    } catch { /* Keep the last known state; changes will report connection failures. */ }
  }, 3000);
})();
