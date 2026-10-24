const {chromium} = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const file = name => 'file://' + path.join(root, name);
const idle = page => page.waitForFunction(() => document.querySelector('#app')?.getAttribute('aria-busy') !== 'true');
const saved = page => page.getByText('All preferences saved on this device.', {exact: true}).waitFor();
async function selectMode(page, mode) {
  await page.locator(`[data-mode="${mode}"]`).click();
  await page.waitForFunction(value => document.querySelector(`[data-mode="${value}"]`)?.getAttribute('aria-pressed') === 'true', mode);
  await idle(page);
}
async function openEditor(page, mode) {
  await page.locator(`[data-edit="${mode}"]`).click();
  await page.locator('#intent-editor[open]').waitFor();
}
async function closeEditor(page) {
  await page.locator('#close-editor').click();
  await page.locator('#intent-editor').waitFor({state: 'detached'});
}
async function stored(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('intent-demo'))); }
async function toggleCount(page, name, enabled) {
  const control = page.getByRole('switch', {name, exact: true});
  if ((await control.getAttribute('aria-checked')) !== String(enabled)) await control.click();
  await idle(page);
  assert.equal(await control.getAttribute('aria-checked'), String(enabled));
}
(async () => {
  const browser = await chromium.launch({channel: 'chromium', headless: true});
  const errors = [];
  try {
    const context = await browser.newContext({viewport: {width: 1440, height: 1100}});
    context.setDefaultTimeout(10000);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(file('settings.html'));
    await page.getByRole('heading', {name: 'What are you here for?'}).waitFor();
    assert.equal(await page.locator('.rules-panel').count(), 0, 'intent fields stay in an editor rather than a permanent page panel');
    assert.equal(await page.locator('#tab-pause').count(), 0, 'full settings never expose a tab-specific pause control');
    const demoPopup = await context.newPage(); await demoPopup.goto(file('popup.html')); await demoPopup.getByRole('heading', {name: 'Your daily budget'}).waitFor();
    assert.equal(await demoPopup.locator('#tab-pause').count(), 0, 'a demo popup cannot pause a tab'); await demoPopup.close();
    const initialMode = (await stored(page)).mode;
    await openEditor(page, 'study');
    assert.equal((await stored(page)).mode, initialMode, 'a pencil opens its intent without changing the selected mode');
    assert.equal(await page.locator(`[data-mode="${initialMode}"]`).getAttribute('aria-pressed'), 'true');
    await page.getByLabel('Intent name', {exact: true}).fill('Discard this name');
    await page.locator('#intent-description').fill('Discard this description');
    await page.locator('#cancel-editor').click(); await page.locator('#intent-editor').waitFor({state: 'detached'});
    assert.equal(await page.evaluate(() => document.activeElement.dataset.edit), 'study', 'Cancel restores focus to the pencil');
    await openEditor(page, 'study');
    assert.equal(await page.getByLabel('Intent name', {exact: true}).inputValue(), 'Study');
    assert.equal(await page.locator('#intent-description').inputValue(), '', 'Cancel discards unsaved changes');
    await page.locator('#intent-description').fill('Also discard on Escape');
    await page.keyboard.press('Escape'); await page.locator('#intent-editor').waitFor({state: 'detached'});
    assert.equal(await page.evaluate(() => document.activeElement.dataset.edit), 'study', 'Escape restores pencil focus');
    await openEditor(page, 'study'); assert.equal(await page.locator('#intent-description').inputValue(), ''); await closeEditor(page);

    const metadataLimit = page.getByLabel('Maximum fuller checks per batch', {exact: true});
    assert.equal(await metadataLimit.inputValue(), '4', 'fuller metadata checks default to four per batch');
    assert.equal(await page.getByText('Each uncached check makes one additional request to a public YouTube video page.', {exact: false}).isVisible(), true);
    assert.match(await page.locator('#metadata-policy').textContent(), /0 uses available search metadata only.*first feed can load two batches.*Stops earlier.*four checks run at once/);
    await metadataLimit.fill('0'); await metadataLimit.press('Tab'); await idle(page);
    assert.equal((await stored(page)).metadataLimit, 0, 'zero disables fuller requests');
    await page.reload(); await metadataLimit.waitFor(); assert.equal(await metadataLimit.inputValue(), '0');
    await page.getByLabel('Custom intent name', {exact: true}).fill('Unfinished intent draft');
    await page.getByLabel('What should this intent show?', {exact: true}).fill('Keep this unsaved description while changing network preferences.');
    await metadataLimit.fill('12'); await metadataLimit.press('Tab'); await idle(page);
    assert.equal((await stored(page)).metadataLimit, 12);
    assert.equal(await page.getByLabel('Custom intent name', {exact: true}).inputValue(), 'Unfinished intent draft');
    assert.equal(await page.getByLabel('What should this intent show?', {exact: true}).inputValue(), 'Keep this unsaved description while changing network preferences.');
    assert.deepEqual((await stored(page)).customIntents, {}, 'saving a network limit does not silently create an unsaved intent');
    for (const invalid of ['-1', '41', '12.5', '']) {
      await metadataLimit.fill(invalid); await metadataLimit.dispatchEvent('change'); await idle(page);
      assert.equal(await metadataLimit.evaluate(input => input.checkValidity()), false);
      assert.equal((await stored(page)).metadataLimit, 12, 'out-of-range, fractional and empty limits are not saved');
    }
    await page.reload(); await metadataLimit.waitFor(); assert.equal(await metadataLimit.inputValue(), '12');
    const descriptions = {
      work: 'Accessible website engineering and client project planning',
      study: 'European contract law and legal case analysis',
      music: 'Instrumental jazz trio performances and improvised piano',
      leisure: 'Bicycle restoration and recreational hiking routes'
    };
    for (const [mode, description] of Object.entries(descriptions)) {
      await openEditor(page, mode); await page.locator('#intent-description').fill(description);
      await page.getByRole('button', {name: 'Save preferences'}).click(); await saved(page);
      assert.equal(await page.locator('#intent-editor').evaluate(dialog => dialog.open), true, 'saving leaves the editor open');
      assert.equal((await stored(page)).mode, initialMode, 'editing another intent does not switch the active mode');
      await closeEditor(page);
    }
    await page.reload(); await page.getByRole('heading', {name: 'What are you here for?'}).waitFor();
    for (const [mode, description] of Object.entries(descriptions)) {
      await openEditor(page, mode); assert.equal(await page.locator('#intent-description').inputValue(), description); await closeEditor(page);
    }
    assert.deepEqual((await stored(page)).intentDescriptions, descriptions);
    await openEditor(page, 'study'); await page.getByLabel('Intent name', {exact: true}).fill('Exam revision');
    await page.getByRole('button', {name: 'Save preferences'}).click(); await saved(page); await closeEditor(page);
    assert.equal((await stored(page)).intentNames.study, 'Exam revision');
    assert.equal((await stored(page)).mode, initialMode);
    assert.match(await page.locator('[data-mode="study"]').textContent(), /Exam revision/);
    assert.equal(await page.locator('#new-tab-mode option[value="study"]').textContent(), 'Always Exam revision');
    assert.equal(await page.getByRole('switch', {name: 'Count Exam revision time', exact: true}).count(), 1, 'renamed built-ins keep their stable ID across timer and new-tab controls');
    await toggleCount(page, 'Count Work time', false); await toggleCount(page, 'Count Music time', true);
    await page.getByLabel('Intent for new YouTube tabs', {exact: true}).selectOption('music'); await idle(page);
    await page.reload(); await page.getByRole('heading', {name: 'What are you here for?'}).waitFor();
    assert.equal(await page.getByRole('switch', {name: 'Count Work time', exact: true}).getAttribute('aria-checked'), 'false');
    assert.equal(await page.getByRole('switch', {name: 'Count Music time', exact: true}).getAttribute('aria-checked'), 'true');
    assert.equal(await page.getByLabel('Intent for new YouTube tabs', {exact: true}).inputValue(), 'music');

    await page.getByLabel('Custom intent name', {exact: true}).fill('Bicycle & repair');
    await page.getByLabel('What should this intent show?', {exact: true}).fill('Bicycle maintenance, wheel truing and safe brake repairs');
    await page.getByRole('button', {name: 'Create intent', exact: true}).click(); await idle(page);
    const customId = (await stored(page)).mode; assert.match(customId, /^custom-[a-z0-9-]+$/);
    assert.equal(await page.locator('#intent-editor').count(), 0, 'creation does not leave an unexpected modal over the page');
    assert.equal(await page.getByRole('switch', {name: 'Count Bicycle & repair time', exact: true}).getAttribute('aria-checked'), 'true');
    await openEditor(page, customId);
    assert.equal(await page.getByLabel('Intent name', {exact: true}).inputValue(), 'Bicycle & repair');
    await page.getByLabel('Intent name', {exact: true}).fill('Bike workshop');
    await page.locator('#intent-description').fill('Restoring steel bicycles, adjusting derailleurs and rebuilding wheels');
    await page.locator('#topics').fill('wheelbuilding, touring bikes'); await page.locator('#channels').fill('Workshop North');
    await page.getByRole('button', {name: 'Save preferences'}).click(); await saved(page);
    assert.equal(await page.getByLabel('Intent description for bike workshop', {exact: true}).inputValue(), 'Restoring steel bicycles, adjusting derailleurs and rebuilding wheels');
    await closeEditor(page); await page.getByRole('button', {name: 'Bike workshop Your custom intent', exact: true}).waitFor();
    await toggleCount(page, 'Count Bike workshop time', false);
    const policy = page.getByLabel('Intent for new YouTube tabs', {exact: true});
    assert.equal(await policy.locator(`option[value="${customId}"]`).textContent(), 'Always Bike workshop');
    await policy.selectOption(customId); await idle(page);
    await page.reload(); await page.getByRole('heading', {name: 'What are you here for?'}).waitFor();
    const withCustom = await stored(page);
    assert.deepEqual(withCustom.customIntents[customId], {name: 'Bike workshop', description: 'Restoring steel bicycles, adjusting derailleurs and rebuilding wheels'});
    assert.equal(withCustom.countModes[customId], false); assert.equal(withCustom.newTabMode, customId);
    assert.equal(withCustom.customTopics[customId], 'wheelbuilding, touring bikes'); assert.equal(withCustom.channels[customId], 'Workshop North');
    assert.equal(withCustom.metadataLimit, 12);
    await page.emulateMedia({colorScheme: 'dark'}); assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(15, 15, 15)');
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'settings fit a narrow dark viewport');
    await openEditor(page, customId);
    assert.equal(await page.getByLabel('Intent name', {exact: true}).inputValue(), 'Bike workshop');
    assert.equal(await page.locator('#intent-editor').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true, 'editor fits a narrow viewport');
    await page.getByRole('button', {name: 'Delete intent', exact: true}).click(); await idle(page);
    await page.locator('#intent-editor').waitFor({state: 'detached'});
    const removed = await stored(page);
    assert.equal(removed.mode, 'work'); assert.equal(removed.newTabMode, 'last'); assert.equal(removed.customIntents[customId], undefined);
    for (const key of ['customTopics', 'channels', 'countModes']) assert.equal(removed[key][customId], undefined);
    assert.equal(await page.locator(`#new-tab-mode option[value="${customId}"]`).count(), 0);
    await page.getByLabel('Custom intent name', {exact: true}).fill('Remove on reset');
    await page.getByLabel('What should this intent show?', {exact: true}).fill('A temporary custom intent for verifying factory reset.');
    await page.getByRole('button', {name: 'Create intent', exact: true}).click(); await idle(page);
    const beforeReset = await stored(page);
    await page.locator('#reset-settings').click(); await page.locator('#reset-dialog[open]').waitFor();
    assert.match(await page.locator('#reset-dialog').textContent(), /Daily time already used and usage history will be kept/);
    await page.locator('#cancel-reset').click(); assert.deepEqual(await stored(page), beforeReset, 'cancelling reset changes nothing');
    await page.locator('#reset-settings').click(); await page.locator('#confirm-reset').click();
    await page.getByText('Factory settings restored. Daily usage was kept.', {exact: true}).waitFor();
    assert.deepEqual(await stored(page), await page.evaluate(() => IntentCore.defaults()), 'reset restores every default, including names, descriptions, timer rules and metadata limit');
    assert.equal(await metadataLimit.inputValue(), '4'); assert.equal(await page.locator('.mode-grid [data-mode^="custom-"]').count(), 0);
    assert.equal(await page.locator('[data-mode="study"] strong').textContent(), 'Study');
    assert.equal(await page.locator('#intent-editor').count(), 0);
    console.log('PASS pencil editors, independent intent selection, cancel/Escape focus and draft discard, built-in renaming, custom intent editing, metadata controls, timer/new-tab options and confirmed factory reset');

    const liveReset = await context.newPage(); liveReset.on('pageerror', error => errors.push(error.message));
    await liveReset.addInitScript(() => {
      window.resetRequests = []; let preferences; let days;
      window.chrome = {runtime: {id: 'intent', onMessage: {addListener() {}}, sendMessage: async message => {
        resetRequests.push(structuredClone(message));
        preferences ||= IntentCore.sanitize({...IntentCore.defaults(), metadataLimit: 12, intentNames: {study: 'Exam revision'}, customIntents: {'custom-reset-test': {name: 'Reset me', description: 'A temporary intent'}}});
        days ||= {[IntentCore.dayKey()]: 180000};
        if (message.type === 'RESET_SETTINGS') preferences = IntentCore.defaults();
        return {...IntentCore.snapshot(preferences, days), ok: true, appearance: 'dark'};
      }}};
    });
    await liveReset.goto(file('settings.html')); await liveReset.getByRole('heading', {name: 'Your daily budget'}).waitFor();
    assert.equal(await liveReset.locator('#used-label').textContent(), '3 min used');
    await liveReset.locator('#reset-settings').click(); await liveReset.locator('#confirm-reset').click();
    await liveReset.getByText('Factory settings restored. Daily usage was kept.', {exact: true}).waitFor();
    assert.equal(await liveReset.locator('#used-label').textContent(), '3 min used', 'reset keeps the usage returned by the background rather than zeroing the display');
    assert.equal(await liveReset.getByLabel('Maximum fuller checks per batch', {exact: true}).inputValue(), '4');
    const resetMessage = await liveReset.evaluate(() => resetRequests.find(message => message.type === 'RESET_SETTINGS'));
    assert.ok(resetMessage); assert.equal(resetMessage.patch, undefined); assert.equal(resetMessage.targetTabId, undefined, 'factory reset requests reset preferences globally without passing usage data');
    await liveReset.close();
    console.log('PASS factory reset preserves displayed daily usage and sends the dedicated settings-only reset request');

    async function popupScenario(activeURL, shouldTarget) {
      const popup = await context.newPage(); popup.on('pageerror', error => errors.push(error.message));
      await popup.addInitScript(({activeURL}) => {
        window.mockRequests = []; window.mockQueries = []; window.mockListeners = [];
        window.mockActive = {id: 42, url: activeURL}; window.mockTabModes = {42: 'music', 88: 'study'}; window.mockTabPaused = {42: false, 88: false}; window.mockTabUpdates = [];
        let preferences; window.mockPreferences = () => structuredClone(preferences);
        window.chrome = {
          runtime: {
            id: 'intent', getURL: value => 'chrome-extension://intent/' + value,
            onMessage: {addListener: fn => mockListeners.push(fn)}, openOptionsPage: async () => {},
            sendMessage: async message => {
              mockRequests.push(structuredClone(message));
              preferences ||= IntentCore.defaults();
              if (message.type === 'UPDATE_SETTINGS') {
                preferences = IntentCore.sanitize({...preferences, ...message.patch});
                if (message.targetTabId && Object.hasOwn(message.patch, 'mode')) mockTabModes[message.targetTabId] = message.patch.mode;
              }
              if (message.type === 'SET_TAB_PAUSED') mockTabPaused[message.targetTabId] = message.paused;
              const tabPaused = mockTabPaused[message.targetTabId] === true;
              const settings = {...preferences, mode: mockTabModes[message.targetTabId] || preferences.mode};
              const snapshot = IntentCore.snapshot({...settings, dailyMinutes: 1}, {[IntentCore.dayKey()]: 60000});
              return {...snapshot, ok: true, appearance: 'dark', tabPaused, settings: {...settings, dailyMinutes: 1}, budgetExhausted: true, timerExempt: !IntentCore.countsMode(settings, settings.mode), blocked: !tabPaused && snapshot.blocked && IntentCore.countsMode(settings, settings.mode)};
            }
          },
          tabs: {query: async query => {mockQueries.push(structuredClone(query)); await new Promise(resolve => setTimeout(resolve, 20)); return [structuredClone(mockActive)];}, update: async (id, changes) => {mockTabUpdates.push({id, ...structuredClone(changes)});return{id,...changes};}}
        };
      }, {activeURL});
      await popup.goto(file('popup.html'));
      if(!shouldTarget){
        await popup.getByRole('heading',{name:'Intent only runs on YouTube.',exact:true}).waitFor();
        assert.equal(await popup.getByText('Off on this site',{exact:true}).isVisible(),true);
        assert.equal(await popup.locator('[data-mode]').count(),0,'no active intent controls on other sites');
        assert.equal(await popup.getByRole('switch').count(),0,'filter switches are unavailable outside YouTube');
        assert.equal(await popup.locator('#tab-pause').count(),0,'other sites cannot pause YouTube tabs');
        assert.equal(await popup.evaluate(()=>mockRequests.some(message=>message.type==='SET_TAB_PAUSED')),false);
        assert.equal(await popup.evaluate(()=>mockRequests.some(message=>message.type==='UPDATE_SETTINGS')),false);
        assert.equal(await popup.evaluate(()=>mockQueries.length),1);
        await popup.close();return;
      }
      await popup.getByRole('heading', {name: 'Your daily budget'}).waitFor();
      assert.equal(await popup.evaluate(() => mockQueries.length), 1, 'active tab is resolved exactly once');
      assert.deepEqual(await popup.evaluate(() => mockQueries[0]), {active: true, currentWindow: true});
      assert.equal(await popup.getByRole('link', {name: 'Topic analysis settings', exact: false}).count(), 1);
      assert.equal(await popup.getByRole('heading', {name: 'Fuller video checks', exact: true}).count(), 0, 'detailed network controls stay on the settings page');
      if(activeURL.includes('/results?'))assert.match(await popup.locator('.scope-notice').textContent(),/filtering is off on search results/);
      const first = await popup.evaluate(() => mockRequests[0]);
      assert.equal(first.type, 'GET_STATE'); assert.equal(first.targetTabId, shouldTarget ? 42 : undefined);
      assert.equal(first.patch, undefined);
      if (shouldTarget) {
        assert.match(await popup.locator('#budget-note').textContent(), /Music does not count.*stays accessible/);
        assert.match(await popup.locator('.mode-caption').textContent(), /saved for this tab.*exempt/);
        // A later active-tab change cannot retarget an already-open popup.
        await popup.evaluate(() => {mockActive = {id: 88, url: 'https://www.youtube.com/'};});
      }
      const preferencesBeforePause = await popup.evaluate(() => mockPreferences());
      assert.equal(await popup.getByRole('button', {name: 'Pause on this tab', exact: true}).count(), 1);
      await popup.getByRole('button', {name: 'Pause on this tab', exact: true}).click();
      await popup.getByRole('button', {name: 'Resume on this tab', exact: true}).waitFor(); await idle(popup);
      assert.equal(await popup.locator('.tab-pause-state').textContent(), 'Paused');
      assert.match(await popup.locator('#tab-pause-detail').textContent(), /Filters and the timer are paused here.*Other tabs remain active/);
      assert.match(await popup.locator('#budget-note').textContent(), /timer is paused on this tab/);
      assert.equal(await popup.locator('.scope-notice').count(), 0, 'paused status replaces any conflicting timer-still-applies notice');
      assert.deepEqual(await popup.evaluate(() => mockPreferences()), preferencesBeforePause, 'pausing never changes saved intents or preferences');
      assert.deepEqual(await popup.evaluate(() => mockTabModes), {'42': 'music', '88': 'study'});
      assert.deepEqual(await popup.evaluate(() => mockTabPaused), {'42': true, '88': false}, 'pause affects only the originating tab');
      const pauseMessage = await popup.evaluate(() => mockRequests.find(message => message.type === 'SET_TAB_PAUSED'));
      assert.deepEqual(pauseMessage, {type: 'SET_TAB_PAUSED', paused: true, targetTabId: 42}, 'pause is a dedicated top-level flag, not a saved settings patch');
      assert.equal(await popup.evaluate(() => mockTabUpdates.length), 0, 'pausing never navigates a tab automatically');
      if (activeURL.includes('/blocked.html')) {
        await popup.getByRole('button', {name: 'Open YouTube in this tab', exact: false}).click();
        assert.deepEqual(await popup.evaluate(() => mockTabUpdates), [{id: 42, url: 'https://www.youtube.com/'}], 'return opens YouTube in the same paused tab');
      }
      await selectMode(popup, 'work');
      assert.equal(await popup.getByRole('button', {name: 'Resume on this tab', exact: true}).count(), 1, 'choosing a saved intent does not resume a paused tab');
      assert.equal(await popup.evaluate(() => mockTabPaused[42]), true);
      assert.match(await popup.locator('.mode-caption').textContent(), /Work is saved.*paused/);
      await selectMode(popup, 'music');
      await popup.getByRole('button', {name: 'Resume on this tab', exact: true}).click();
      await popup.getByRole('button', {name: 'Pause on this tab', exact: true}).waitFor(); await idle(popup);
      assert.equal(await popup.locator('.tab-pause-state').textContent(), 'Active');
      assert.deepEqual(await popup.evaluate(() => mockTabPaused), {'42': false, '88': false});
      assert.deepEqual(await popup.evaluate(() => mockRequests.filter(message => message.type === 'SET_TAB_PAUSED')), [{type: 'SET_TAB_PAUSED', paused: true, targetTabId: 42}, {type: 'SET_TAB_PAUSED', paused: false, targetTabId: 42}]);
      await selectMode(popup, 'work');
      assert.match(await popup.locator('#budget-note').textContent(), /Daily limit reached/);
      await selectMode(popup, 'music');
      assert.match(await popup.locator('#budget-note').textContent(), /Music does not count/);
      await popup.getByRole('switch', {name: 'Hide Shorts', exact: true}).click(); await idle(popup);
      const messages = await popup.evaluate(() => mockRequests);
      assert.ok(messages.some(message => message.type === 'UPDATE_SETTINGS' && message.patch.mode === 'work'));
      assert.ok(messages.some(message => message.type === 'UPDATE_SETTINGS' && message.patch.mode === 'music'));
      assert.ok(messages.some(message => message.type === 'UPDATE_SETTINGS' && message.patch.hideShorts === false));
      assert.ok(messages.every(message => message.targetTabId === (shouldTarget ? 42 : undefined)), 'GET and UPDATE consistently target only the original supported tab');
      assert.ok(messages.every(message => !message.patch || !Object.hasOwn(message.patch, 'targetTabId')), 'targetTabId is message metadata, never a saved preference');
      assert.equal(await popup.evaluate(() => mockQueries.length), 1);
      if (shouldTarget) assert.deepEqual(await popup.evaluate(() => mockTabModes), {'42': 'music', '88': 'study'}, 'popup mode changes preserve other tabs');
      assert.equal(await popup.evaluate(() => document.documentElement.dataset.theme), 'dark');
      await popup.close();
    }
    await popupScenario('https://www.youtube.com/watch?v=abcdefghijk', true);
    await popupScenario('https://www.youtube.com/results?search_query=jazz', true);
    await popupScenario('chrome-extension://intent/blocked.html', true);
    await popupScenario('https://example.com/', false);
    console.log('PASS targeted popup pause/resume, saved intent preservation, explicit status, manual return from a blocked tab, read-only other sites and exempt Music');
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
