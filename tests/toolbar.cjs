const {chromium} = require('playwright');
const path = require('path'), fs = require('fs'), assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const shots=path.resolve(process.env.INTENT_SCREENSHOTS||'test-results');fs.mkdirSync(shots,{recursive:true});
(async () => {
  const browser = await chromium.launch({channel: 'chromium', headless: true});
  try {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}});
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://www.youtube.com/**', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><style>
:root{--yt-spec-text-primary:#0f0f0f;--yt-spec-base-background:#fff}html[dark]{--yt-spec-text-primary:#f1f1f1;--yt-spec-base-background:#0f0f0f}*{box-sizing:border-box}body{margin:0;background:var(--yt-spec-base-background);color:var(--yt-spec-text-primary);font:14px Arial}ytd-masthead{display:flex;align-items:center;gap:16px;height:56px;padding:0 16px;overflow:hidden;border-bottom:1px solid #8883}#start,#end{width:100px;flex-shrink:0}#center{display:flex;align-items:center;flex:1;min-width:0;max-width:850px;margin:auto}#native-search-group{display:flex;align-items:center;gap:8px;flex:1;min-width:0}ytd-searchbox{display:block;flex:1;min-width:0}input{width:100%;height:36px;border:1px solid #888;border-radius:18px;padding:8px 12px;background:transparent;color:inherit}#voice-search{width:36px;height:36px;border:0;border-radius:50%;flex-shrink:0}main{padding:32px}#outside{margin-top:20px}@media(max-width:700px){ytd-masthead{gap:8px;padding:0 8px}#start{width:28px;font-size:0}#end{display:none}#voice-search{width:28px}#native-search-group{gap:4px}}</style><ytd-masthead><div id="start">YouTube</div><div id="center"><div id="native-search-group"><ytd-searchbox><input aria-label="Search"></ytd-searchbox><button id="voice-search" aria-label="Voice search">♪</button></div></div><div id="end">Account</div></ytd-masthead><main><h1>Intent toolbar preview</h1><button id="outside">Outside the menu</button></main>`}));
    await page.route('https://extension.test/icons/128.png', route => route.fulfill({contentType: 'image/png', body: fs.readFileSync(path.join(root, 'icons/128.png'))}));
    await page.goto('https://www.youtube.com/');
    for (const file of ['core.js', 'feed.js', 'feed-theme.js', 'home.js', 'toolbar.js']) await page.addScriptTag({path: path.join(root, 'src', file)});
    await page.evaluate(() => {
      window.testSettings = IntentCore.sanitize({mode: 'work', customIntents: {'custom-build': {name: 'Build things', description: 'Make furniture and useful wooden objects'}}});
      window.requests = []; window.changes = []; window.refreshes = 0; window.testCoverage = {state: 'active'}; window.pausedChanges = []; window.testPaused = false;
      window.onTestPaused = paused => {
        pausedChanges.push(paused); testPaused = paused;
        if (paused) {if (testCoverage.state !== 'paused') window.testResumeCoverage = {...testCoverage}; testCoverage = {state: 'paused'};}
        else testCoverage = window.testResumeCoverage || {state: 'active'};
        toolbar.sync(testSettings, true, testCoverage);
      };
      window.runtime = {getURL: value => 'https://extension.test/' + value, sendMessage: async message => {
        requests.push(message);
        if (message.type === 'SET_TAB_PAUSED') {
          if (window.delayPause) await new Promise(resolve => {window.releasePause = resolve;});
          if (window.failPause) return {ok: false, error: 'Could not pause this tab.'};
          testPaused = message.paused; return {ok: true, tabPaused: testPaused, settings: testSettings};
        }
        if (message.type === 'SET_MODE') {
          if (window.delayMode) await new Promise(resolve => {window.releaseMode = resolve;});
          if (window.failMode) return {ok: false, error: 'Try the mode again.'};
          testSettings = IntentCore.sanitize({...testSettings, mode: message.mode}); return {ok: true, settings: testSettings};
        }
        return {ok: true};
      }};
      window.toolbar = new IntentToolbar(runtime, {onSettings: settings => {changes.push(settings.mode); toolbar.sync(settings, true, testCoverage);}, onRefresh: () => {refreshes++;}, onPaused: onTestPaused});
      toolbar.sync(testSettings);
    });
    const toolbar = page.locator('#intent-toolbar'), trigger = toolbar.getByRole('combobox', {name: 'Intent mode'});
    const option = name => toolbar.getByRole('option', {name, exact: true});
    assert.equal(await toolbar.locator('select').count(), 0, 'the mode chooser has no native select outline');
    assert.equal(await trigger.getAttribute('data-mode'), 'work');
    await toolbar.locator('.logo').evaluate(image => image.decode());
    assert.equal(await toolbar.locator('.logo').getAttribute('src'), 'https://extension.test/icons/128.png', 'the original packaged logo is preserved');
    assert.equal(await page.evaluate(() => document.querySelector('#center').firstElementChild.id), 'intent-toolbar', 'toolbar stays left of the native search group');
    assert.equal(await page.evaluate(() => document.querySelector('#voice-search').previousElementSibling.tagName), 'YTD-SEARCHBOX', 'search and microphone remain grouped');
    // Mode names and coverage states occupy one stable slot, preserving the native search width.
    const stableSearch = await page.evaluate(() => {
      const original = structuredClone(testSettings), results = [];
      const variants = [
        {mode: 'work', state: 'active'},
        {mode: 'custom-wide', state: 'active'},
        {mode: 'custom-wide', state: 'loading'},
        {mode: 'custom-wide', state: 'off-here'},
        {mode: 'custom-wide', state: 'unavailable'},
        {mode: 'custom-wide', state: 'paused'},
        {mode: 'off', state: 'active'}
      ];
      for (const {mode, state} of variants) {
        const settings = IntentCore.sanitize({...original, customIntents: {...original.customIntents, 'custom-wide': {name: 'An exceptionally long saved intent for this tab', description: 'Make useful things', symbol: '🔧'}}, mode});
        toolbar.sync(settings, true, {state});
        const search = document.querySelector('ytd-searchbox').getBoundingClientRect(), host = toolbar.host.getBoundingClientRect();
        results.push({x: search.x, width: search.width, hostWidth: host.width, label: toolbar.modeName.textContent, title: toolbar.trigger.title});
      }
      toolbar.sync(original, true, testCoverage); return results;
    });
    assert.ok(stableSearch.every(item => item.hostWidth === 250 && Math.abs(item.x - stableSearch[0].x) < .1 && Math.abs(item.width - stableSearch[0].width) < .1), 'desktop search geometry is stable across intent names, loading, errors, pauses and Off');
    assert.equal(stableSearch.at(-2).label, 'Paused'); assert.match(stableSearch.at(-2).title, /An exceptionally long saved intent/);
    assert.equal(stableSearch.at(-1).label, 'Intent off');
    const selectedIcons = await page.evaluate(() => {
      const original = structuredClone(testSettings), records = [];
      for (const icon of ['tools', 'science']) {
        const settings = IntentCore.sanitize({...original, mode: 'custom-build', customIntents: {...original.customIntents, 'custom-build': {...original.customIntents['custom-build'], icon}}});
        toolbar.sync(settings, true, {state: 'active'});
        records.push({symbol: toolbar.selectedSymbol.textContent, hidden: toolbar.selectedSymbol.hidden, expected: IntentCore.INTENT_ICONS[icon], toolbarWidth: toolbar.host.getBoundingClientRect().width, searchWidth: document.querySelector('ytd-searchbox').getBoundingClientRect().width});
      }
      toolbar.sync({...original, mode: 'custom-build'}, true, {state: 'paused'}); const hiddenPaused = toolbar.selectedSymbol.hidden;
      toolbar.sync({...original, mode: 'off'}, true, {state: 'active'}); const hiddenOff = toolbar.selectedSymbol.hidden;
      toolbar.sync(original, true, testCoverage); return {records, hiddenPaused, hiddenOff, hiddenBuiltin: toolbar.selectedSymbol.hidden};
    });
    assert.ok(selectedIcons.records.every(record => !record.hidden && record.symbol === record.expected && record.toolbarWidth === 250), 'selected custom intent displays its chosen icon on the toolbar button');
    assert.notEqual(selectedIcons.records[0].symbol, selectedIcons.records[1].symbol, 'editing a custom icon updates the selected button immediately');
    assert.equal(selectedIcons.records[0].searchWidth, selectedIcons.records[1].searchWidth, 'custom icon changes preserve search width');
    assert.equal(selectedIcons.hiddenPaused, true); assert.equal(selectedIcons.hiddenOff, true); assert.equal(selectedIcons.hiddenBuiltin, true);
    assert.equal(await toolbar.locator('.selected-symbol').getAttribute('aria-hidden'), 'true');
    // A manual Off selection wins over unsupported-page coverage and does not inherit its explanation.
    await page.evaluate(() => {
      history.replaceState({}, '', '/');
      toolbar.sync(IntentCore.sanitize({...testSettings, mode: 'off'}), true, {state: 'off-here', detail: 'Intent filtering is off on search results. The saved intent applies elsewhere.'});
    });
    await trigger.click();
    await toolbar.getByRole('heading', {name: 'Intent is off', exact: true}).waitFor();
    assert.equal(await toolbar.locator('.coverage-detail').innerText(), 'Topic filtering off · timer rules apply');
    assert.doesNotMatch(await toolbar.locator('.coverage-detail').getAttribute('title'), /search results|saved intent applies elsewhere/i);
    assert.match(await trigger.getAttribute('title'), /^Intent is off\./);
    assert.equal(await trigger.getAttribute('data-filter-state'), 'off');
    await page.evaluate(() => toolbar.sync(IntentCore.sanitize({...testSettings, mode: 'off', countModes: {...testSettings.countModes, off: false}}), true, {state: 'off-here', detail: 'Unsupported search results'}));
    assert.equal(await toolbar.locator('.coverage-detail').innerText(), 'Topic filtering off · timer exempt');
    assert.match(await toolbar.locator('.coverage-detail').getAttribute('title'), /exempt from the daily timer/);
    const conciseStates = await page.evaluate(() => {
      const variants = ['active', 'loading', 'unavailable', 'off-here', 'paused'];
      const rows = variants.map(state => {
        const detail = state === 'off-here' ? 'Intent filtering is off on search results. Your selected Work intent is kept for Home and video recommendations. Distraction rules and timer policies still apply.' : `Complete explanation for ${state}: the saved intent and configured timer rules are preserved for this tab.`;
        toolbar.sync(testSettings, true, {state, detail});
        return {state, visible: toolbar.coverageDetail.textContent, long: toolbar.coverageStatus.textContent, title: toolbar.coverageDetail.title, heading: toolbar.menuHeading.textContent, height: toolbar.coverageDetail.getBoundingClientRect().height};
      });
      toolbar.sync(testSettings, true, testCoverage); return rows;
    });
    assert.ok(conciseStates.every(row => row.visible.length <= 48 && row.height <= 24 && row.title === row.long && row.long.length > row.visible.length), 'all menu states show one compact status line while keeping full explanations accessible');
    const unsupportedRow = conciseStates.find(row => row.state === 'off-here');
    assert.equal(unsupportedRow.heading, 'Intent for this tab'); assert.equal(unsupportedRow.visible, 'Off here · intent saved'); assert.match(unsupportedRow.title, /search results/);
    await page.keyboard.press('Escape');
    await trigger.click();
    await toolbar.getByRole('listbox').waitFor();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(await option('Work').getAttribute('aria-selected'), 'true');
    assert.equal(await option('Build things').count(), 1);
    assert.ok((await option('Work').locator('.option-symbol').innerText()).trim(), 'each mode has its own visible icon');
    assert.equal(await option('Work').locator('.option-symbol').getAttribute('aria-hidden'), 'true');
    assert.equal(await toolbar.locator('#intent-mode-popover').evaluate(menu => menu.matches(':popover-open')), true, 'menu uses the top layer outside masthead clipping');
    const positions = await page.evaluate(() => {const host = document.querySelector('#intent-toolbar'), root = host.shadowRoot; const trigger = root.querySelector('#intent-mode-trigger').getBoundingClientRect(), menu = root.querySelector('#intent-mode-popover').getBoundingClientRect();return {triggerBottom: trigger.bottom, menuTop: menu.top, menuLeft: menu.left, menuRight: menu.right};});
    assert.ok(positions.menuTop > positions.triggerBottom && positions.menuLeft >= 8 && positions.menuRight <= 1440 - 8);
    await page.keyboard.press('ArrowDown'); assert.equal(await option('Study').evaluate(el => el.getRootNode().activeElement === el), true);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#intent-toolbar').shadowRoot.querySelector('#intent-mode-trigger').dataset.mode === 'music');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(await page.evaluate(() => changes), ['music']);
    assert.equal(await page.evaluate(() => requests.at(-1).type), 'SET_MODE');
    await trigger.focus(); await page.keyboard.press('ArrowDown');
    assert.equal(await option('Music').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home'); assert.equal(await option('Work').evaluate(el => el.getRootNode().activeElement === el), true);
    await page.keyboard.press('End'); assert.equal(await option('Off').evaluate(el => el.getRootNode().activeElement === el), true);
    await page.keyboard.press('Escape');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false'); assert.equal(await trigger.evaluate(el => el.getRootNode().activeElement === el), true);
    await page.keyboard.press('Space'); await toolbar.getByRole('listbox').waitFor();
    await page.locator('#outside').click(); assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await trigger.click(); await page.keyboard.press('Tab');
    assert.equal(await toolbar.getByRole('button', {name: 'Pause on this tab', exact: true}).evaluate(el => el.getRootNode().activeElement === el), true, 'Tab reaches the separate tab-pause action');
    await page.keyboard.press('Tab'); assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'Tab leaves the footer without trapping focus');
    await page.evaluate(() => {document.documentElement.setAttribute('dark', ''); toolbar.updateTheme();});
    await trigger.click(); const dark = await toolbar.locator('#intent-mode-popover').evaluate(menu => ({color: getComputedStyle(menu).color, background: getComputedStyle(menu).backgroundColor}));
    assert.equal(dark.background, 'rgb(40, 40, 40)'); assert.equal(dark.color, 'rgb(241, 241, 241)');
    await page.screenshot({path:path.join(shots,'intent-toolbar-menu-dark.png'),clip:{x:0,y:0,width:900,height:480}});
    await page.keyboard.press('Escape');
    await page.evaluate(() => {document.documentElement.removeAttribute('dark'); toolbar.updateTheme();});
    await trigger.click(); const light = await toolbar.locator('#intent-mode-popover').evaluate(menu => getComputedStyle(menu).backgroundColor);
    assert.equal(light, 'rgb(255, 255, 255)');await page.screenshot({path:path.join(shots,'intent-toolbar-menu-light.png'),clip:{x:0,y:0,width:900,height:480}}); await page.keyboard.press('Escape');
    // An unsuccessful selection preserves the current tab's intent and reports the error.
    await page.evaluate(() => {failMode = true;}); await trigger.click(); await option('Study').click();
    await toolbar.getByRole('status').filter({hasText: 'Try the mode again.'}).waitFor();
    assert.equal(await trigger.getAttribute('data-mode'), 'music'); await page.evaluate(() => {failMode = false;});
    await page.evaluate(() => {delayMode = true;}); await trigger.click(); await option('Study').click();
    await page.waitForFunction(() => typeof releaseMode === 'function'); assert.equal(await trigger.isDisabled(), true);
    await page.evaluate(() => {releaseMode(); delayMode = false;}); await page.waitForFunction(() => document.querySelector('#intent-toolbar').shadowRoot.querySelector('#intent-mode-trigger').dataset.mode === 'study');
    await toolbar.getByRole('button', {name: 'Refresh feed', exact: true}).click(); assert.equal(await page.evaluate(() => refreshes), 1);
    await toolbar.getByRole('button', {name: 'Intent settings', exact: true}).click(); assert.equal(await page.evaluate(() => requests.at(-1).type), 'OPEN_SETTINGS');
    // Pause is a separate tab-local action: it never replaces the saved intent with Off.
    const beforePauseModeCalls = await page.evaluate(() => requests.filter(message => message.type === 'SET_MODE').length);
    await trigger.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab');
    await toolbar.getByRole('button', {name: 'Pause on this tab', exact: true}).waitFor();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#intent-toolbar').dataset.filterState === 'paused');
    assert.equal(await trigger.getAttribute('data-mode'), 'study');
    assert.equal(await toolbar.locator('.mode-name').innerText(), 'Paused');
    assert.equal(await toolbar.locator('.coverage-badge').isVisible(), false, 'the paused label avoids a duplicate badge');
    assert.equal(await toolbar.getByRole('button', {name: 'Refresh feed', exact: true}).isDisabled(), true);
    assert.match(await trigger.getAttribute('title'), /paused for this tab/);
    assert.deepEqual(await page.evaluate(() => requests.at(-1)), {type: 'SET_TAB_PAUSED', paused: true});
    assert.deepEqual(await page.evaluate(() => pausedChanges), [true]);
    await trigger.click();
    const resume = toolbar.getByRole('button', {name: 'Resume on this tab', exact: true});
    await resume.focus(); await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('#intent-toolbar').dataset.filterState === 'active');
    assert.equal(await trigger.getAttribute('data-mode'), 'study'); assert.deepEqual(await page.evaluate(() => pausedChanges), [true, false]);
    assert.deepEqual(await page.evaluate(() => requests.at(-1)), {type: 'SET_TAB_PAUSED', paused: false});
    assert.equal(await page.evaluate(() => requests.filter(message => message.type === 'SET_MODE').length), beforePauseModeCalls);
    await page.evaluate(() => {testCoverage = {state: 'paused'}; testPaused = true; toolbar.sync(testSettings, true, testCoverage);});
    assert.equal(await trigger.getAttribute('data-mode'), 'study', 'a paused reload preserves the saved intent');
    await trigger.click(); await resume.click(); await page.waitForFunction(() => document.querySelector('#intent-toolbar').dataset.filterState === 'active');
    await page.evaluate(() => {failPause = true;}); await trigger.click(); await toolbar.getByRole('button', {name: 'Pause on this tab', exact: true}).click();
    await toolbar.getByRole('status').filter({hasText: 'Could not pause this tab.'}).waitFor();
    assert.equal(await toolbar.getAttribute('data-filter-state'), 'active'); assert.equal(await trigger.getAttribute('data-mode'), 'study');
    await page.evaluate(() => {failPause = false; delayPause = true;}); await trigger.click(); await toolbar.getByRole('button', {name: 'Pause on this tab', exact: true}).click();
    await page.waitForFunction(() => typeof releasePause === 'function'); assert.equal(await trigger.isDisabled(), true);
    await page.evaluate(() => {releasePause(); delayPause = false;}); await page.waitForFunction(() => document.querySelector('#intent-toolbar').dataset.filterState === 'paused');
    await trigger.click(); await resume.click(); await page.waitForFunction(() => document.querySelector('#intent-toolbar').dataset.filterState === 'active');
    // Open menus and their document/window listeners are removed on destruction, then safely recreated.
    await trigger.click(); await page.evaluate(() => toolbar.destroy()); assert.equal(await toolbar.count(), 0);
    await page.evaluate(() => {const old = document.querySelector('ytd-masthead'); const fresh = old.cloneNode(true); fresh.removeAttribute('data-intent-toolbar'); old.replaceWith(fresh); toolbar.sync(testSettings);});
    assert.equal(await toolbar.count(), 1); assert.equal(await trigger.getAttribute('data-mode'), 'study'); assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await page.setViewportSize({width: 390, height: 844}); await trigger.click();
    const narrow = await toolbar.locator('#intent-mode-popover').evaluate(menu => {const r = menu.getBoundingClientRect(); return {left: r.left, right: r.right, bottom: r.bottom};});
    assert.ok(narrow.left >= 8 && narrow.right <= 382 && narrow.bottom <= 836);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'toolbar and menu fit a 390px viewport');
    const narrowStable = await page.evaluate(() => {
      const original = structuredClone(testSettings), sizes = [];
      for (const state of ['active', 'off-here', 'unavailable', 'paused']) {
        toolbar.sync(original, true, {state});
        const r = document.querySelector('ytd-searchbox').getBoundingClientRect(); sizes.push({x: r.x, width: r.width, toolbar: toolbar.host.getBoundingClientRect().width});
      }
      toolbar.sync(original, true, testCoverage); return sizes;
    });
    assert.ok(narrowStable.every(item => item.toolbar === 154 && Math.abs(item.x - narrowStable[0].x) < .1 && Math.abs(item.width - narrowStable[0].width) < .1), 'mobile search geometry is stable too');
    await page.setViewportSize({width: 360, height: 640});
    const resized = await toolbar.locator('#intent-mode-popover').boundingBox(); assert.ok(resized.x >= 8 && resized.x + resized.width <= 352, 'open menu repositions on resize');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {testSettings = IntentCore.sanitize({...testSettings, customIntents: {'custom-very-long': {name: 'A custom intent with a long name', description: 'Make things'}}}); toolbar.sync(testSettings);});
    await trigger.click(); assert.equal(await option('A custom intent with a long name').count(), 1); assert.equal(await option('Build things').count(), 0);
    await page.keyboard.press('Escape');
    // Unsupported pages clearly distinguish the saved tab intent from actual filtering coverage.
    await page.evaluate(() => {
      history.pushState({}, '', '/results?search_query=physics');
      testCoverage = {state: 'off-here'}; testSettings = IntentCore.sanitize({...testSettings, mode: 'work'});
      toolbar.destroy(); toolbar = new IntentToolbar(runtime, {onSettings: settings => {changes.push(settings.mode); toolbar.sync(settings, true, testCoverage);}, onRefresh: () => {refreshes++;}, onPaused: onTestPaused});
      toolbar.sync(testSettings, true, testCoverage);
    });
    assert.equal(await toolbar.getAttribute('data-filter-state'), 'off-here');
    assert.equal(await trigger.getAttribute('data-mode'), 'work', 'search coverage does not overwrite the saved tab intent');
    assert.equal(await trigger.getAttribute('data-filter-state'), 'off-here');
    assert.equal(await toolbar.locator('.coverage-badge').innerText(), 'Off here');
    assert.equal(await toolbar.locator('.coverage-badge').isVisible(), true);
    assert.match(await trigger.getAttribute('title'), /filtering is off on search results/);
    assert.equal(await trigger.getAttribute('aria-describedby'), 'intent-filter-status');
    assert.equal(await toolbar.getByRole('button', {name: 'Refresh feed', exact: true}).isDisabled(), true);
    await trigger.click(); await toolbar.getByRole('heading', {name: 'Intent for this tab'}).waitFor();
    assert.equal(await toolbar.locator('.coverage-detail').innerText(), 'Off here · intent saved');
    assert.equal(await toolbar.locator('.coverage-detail').getAttribute('title'), 'Intent filtering is off on search results. Saved intent applies on Home/video recommendations. Shorts/clickbait rules and timer still apply.');
    await option('Music').click();
    await page.waitForFunction(() => document.querySelector('#intent-toolbar').shadowRoot.querySelector('#intent-mode-trigger').dataset.mode === 'music');
    assert.equal(await toolbar.getAttribute('data-filter-state'), 'off-here', 'changing the saved mode on search never pretends filtering became active');
    assert.equal(await toolbar.locator('.coverage-badge').innerText(), 'Off here');
    const beforeCoverage = await page.evaluate(() => requests.length);
    await page.evaluate(() => {testCoverage = {state: 'loading', detail: 'Finding matching videos for this tab.'}; toolbar.sync(testSettings, true, testCoverage);});
    assert.equal(await toolbar.getAttribute('data-filter-state'), 'loading'); assert.equal(await toolbar.locator('.coverage-badge').innerText(), 'Loading');
    assert.match(await trigger.getAttribute('title'), /Finding matching videos/);
    await page.evaluate(() => {testCoverage = {state: 'unavailable', detail: 'Matching recommendations could not load. Shorts/clickbait rules and timer still apply.'}; toolbar.sync(testSettings, true, testCoverage);});
    assert.equal(await toolbar.getAttribute('data-filter-state'), 'unavailable'); assert.equal(await toolbar.locator('.coverage-badge').innerText(), 'Unavailable');
    assert.equal(await toolbar.getByRole('button', {name: 'Refresh feed', exact: true}).isDisabled(), false, 'failed feeds can be retried');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'coverage badge also fits narrow screens');
    await page.evaluate(() => {testCoverage = {state: 'active'}; toolbar.sync(testSettings, true, testCoverage);});
    assert.equal(await toolbar.getAttribute('data-filter-state'), 'active'); assert.equal(await toolbar.locator('.coverage-badge').isVisible(), false);
    assert.equal(await page.evaluate(() => requests.length), beforeCoverage, 'coverage updates never change saved intent or send mode requests');
    await page.evaluate(() => {testSettings = IntentCore.sanitize({...testSettings, mode: 'off'}); toolbar.sync(testSettings, true, testCoverage);});
    assert.equal(await toolbar.count(), 1, 'turning filtering off keeps the mode control available');
    assert.equal(await trigger.getAttribute('data-mode'), 'off'); assert.equal(await trigger.getAttribute('data-filter-state'), 'off');
    assert.equal(await toolbar.locator('.mode-name').innerText(), 'Intent off');
    assert.equal(await toolbar.getByRole('button', {name: 'Refresh feed', exact: true}).isDisabled(), true);
    await trigger.click(); await toolbar.getByRole('button', {name: 'Pause on this tab', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('#intent-toolbar').dataset.filterState === 'paused');
    assert.equal(await trigger.getAttribute('data-mode'), 'off', 'pause keeps an independently selected Off mode');
    await trigger.click(); await toolbar.getByRole('button', {name: 'Resume on this tab', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('#intent-toolbar').dataset.filterState === 'off');
    assert.equal(await trigger.getAttribute('data-mode'), 'off', 'resume does not implicitly choose a new intent');
    await trigger.click(); await option('Work').click();
    await page.waitForFunction(() => document.querySelector('#intent-toolbar').shadowRoot.querySelector('#intent-mode-trigger').dataset.mode === 'work');
    assert.equal(await toolbar.getAttribute('data-filter-state'), 'active', 'the retained Off control can re-enable filtering');
    await page.evaluate(() => toolbar.sync(testSettings, false)); assert.equal(await toolbar.count(), 0);
    assert.equal(await page.locator('ytd-masthead').getAttribute('data-intent-toolbar'), null);
    await page.addStyleTag({path: path.join(root, 'src/content.css')});
    await page.evaluate(() => {
      document.documentElement.setAttribute('dark', '');
      const style = document.createElement('style'); style.textContent = 'ytd-browse[page-subtype="home"]{display:block;margin-top:56px;padding-top:56px;--ytd-rich-grid-header-height:56px;--ytd-feed-filter-chip-bar-height:56px}ytd-browse[page-subtype="home"] #primary{margin-top:56px;padding-top:56px;background:#181818}ytd-browse[page-subtype="home"] #header{height:56px;padding:8px}ytd-feed-filter-chip-bar-renderer{display:block;height:40px}ytd-rich-grid-renderer{display:block;height:80px}ytd-watch-flexy #header{height:72px;padding:10px}';
      document.head.append(style);
      const browse = document.createElement('ytd-browse'); browse.setAttribute('page-subtype', 'home'); browse.innerHTML = '<div id="header"><ytd-feed-filter-chip-bar-renderer>All · Music · Gaming</ytd-feed-filter-chip-bar-renderer></div><div id="primary"><ytd-rich-grid-renderer>Native grid</ytd-rich-grid-renderer></div>';
      const watch = document.createElement('ytd-watch-flexy'); watch.innerHTML = '<div id="header">Native video header</div>'; document.body.append(browse, watch);
      const settings = IntentCore.defaults();
      window.layoutSettings = settings;
      window.measureHome = () => {const browse = document.querySelector('ytd-browse'), primary = browse.querySelector('#primary'); return {margin: getComputedStyle(browse).marginTop, padding: getComputedStyle(browse).paddingTop, primaryMargin: getComputedStyle(primary).marginTop, primaryPadding: getComputedStyle(primary).paddingTop, chipsHeight: browse.querySelector('#header').getBoundingClientRect().height, watchHeight: document.querySelector('ytd-watch-flexy #header').getBoundingClientRect().height, mastheadHeight: document.querySelector('ytd-masthead').getBoundingClientRect().height};};
      window.nativeHomeGeometry = measureHome();
      window.layoutFeed = new IntentHome({sendMessage: async () => ({ok: true, key: IntentFeed.key(settings), items: [], nextCursor: 2, hasMore: false})});
      layoutFeed.sync(settings, true);
    });
    await page.waitForFunction(() => layoutFeed.status.textContent.startsWith('0 videos'));
    const compactHome = await page.evaluate(() => ({...measureHome(), feedBackground: getComputedStyle(layoutFeed.host).backgroundColor, statusBackground: getComputedStyle(layoutFeed.status).backgroundColor, statusHeight: layoutFeed.status.getBoundingClientRect().height}));
    assert.equal(compactHome.margin, '0px'); assert.equal(compactHome.padding, '0px'); assert.equal(compactHome.primaryMargin, '0px'); assert.equal(compactHome.primaryPadding, '0px'); assert.equal(compactHome.chipsHeight, 0);
    assert.equal(compactHome.watchHeight, 72); assert.equal(compactHome.mastheadHeight, 56, 'Home cleanup never shrinks the native masthead or video header');
    assert.equal(compactHome.feedBackground, 'rgba(0, 0, 0, 0)'); assert.equal(compactHome.statusBackground, 'rgba(0, 0, 0, 0)', 'dark feed surfaces stay transparent over the actual parent color');
    assert.ok(compactHome.statusHeight <= 25, 'feed status uses a compact single line');
    await page.evaluate(() => layoutFeed.sync({...layoutSettings, mode: 'off'}, true));
    assert.deepEqual(await page.evaluate(() => measureHome()), await page.evaluate(() => nativeHomeGeometry), 'turning intent off restores all original chip spacing');
    await page.evaluate(() => {layoutFeed.sync(layoutSettings, true); layoutFeed.sync(layoutSettings, false);});
    assert.deepEqual(await page.evaluate(() => measureHome()), await page.evaluate(() => nativeHomeGeometry), 'pausing removes the same scoped layout overrides');
    assert.deepEqual(errors, []);
    console.log('PASS custom toolbar: packaged logo, top-layer menu, keyboard selection, pointer dismissal, per-tab callback, loading/errors, light/dark themes, SPA reattachment, dynamic custom intents, explicit search/off/loading/unavailable coverage, independent tab pause/resume, stable search width, transparent feed surfaces, Home spacer restoration and narrow viewport.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
