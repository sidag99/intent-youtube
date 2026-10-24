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
    const descriptions = {
      work: 'Accessible website engineering and client project planning',
      study: 'European contract law and legal case analysis',
      music: 'Instrumental jazz trio performances and improvised piano',
      leisure: 'Bicycle restoration and recreational hiking routes'
    };
    // Each built-in description remains editable and persists as its own scope.
    for (const [mode, description] of Object.entries(descriptions)) {
      await selectMode(page, mode);
      await page.getByLabel(`Intent description for ${mode}`, {exact: true}).fill(description);
      await page.getByRole('button', {name: 'Save preferences'}).click(); await saved(page);
    }
    await page.reload();
    for (const [mode, description] of Object.entries(descriptions)) {
      await selectMode(page, mode);
      assert.equal(await page.getByLabel(`Intent description for ${mode}`, {exact: true}).inputValue(), description);
    }
    assert.deepEqual((await stored(page)).intentDescriptions, descriptions);
    await toggleCount(page, 'Count Work time', false);
    await toggleCount(page, 'Count Music time', true);
    await page.getByLabel('Intent for new YouTube tabs', {exact: true}).selectOption('music'); await idle(page);
    await page.reload();
    assert.equal(await page.getByRole('switch', {name: 'Count Work time', exact: true}).getAttribute('aria-checked'), 'false');
    assert.equal(await page.getByRole('switch', {name: 'Count Music time', exact: true}).getAttribute('aria-checked'), 'true');
    assert.equal(await page.getByLabel('Intent for new YouTube tabs', {exact: true}).inputValue(), 'music');

    await page.getByLabel('Custom intent name', {exact: true}).fill('Bicycle & repair');
    await page.getByLabel('What should this intent show?', {exact: true}).fill('Bicycle maintenance, wheel truing and safe brake repairs');
    await page.getByRole('button', {name: 'Create intent', exact: true}).click();
    await page.getByLabel('Intent name', {exact: true}).waitFor(); await idle(page);
    const customId = (await stored(page)).mode;
    assert.match(customId, /^custom-[a-z0-9-]+$/);
    assert.equal(await page.getByLabel('Intent name', {exact: true}).inputValue(), 'Bicycle & repair');
    assert.equal(await page.getByRole('switch', {name: 'Count Bicycle & repair time', exact: true}).getAttribute('aria-checked'), 'true');
    await page.getByLabel('Intent name', {exact: true}).fill('Bike workshop');
    await page.getByLabel('Intent description for bicycle & repair', {exact: true}).fill('Restoring steel bicycles, adjusting derailleurs and rebuilding wheels');
    await page.getByLabel('Extra topics for bicycle & repair', {exact: true}).fill('wheelbuilding, touring bikes');
    await page.getByLabel('Always include these channels in this mode', {exact: true}).fill('Workshop North');
    await page.getByRole('button', {name: 'Save preferences'}).click(); await saved(page);
    await page.getByRole('button', {name: 'Bike workshop Your custom intent', exact: true}).waitFor();
    assert.equal(await page.getByLabel('Intent description for bike workshop', {exact: true}).inputValue(), 'Restoring steel bicycles, adjusting derailleurs and rebuilding wheels');
    await toggleCount(page, 'Count Bike workshop time', false);
    const policy = page.getByLabel('Intent for new YouTube tabs', {exact: true});
    assert.equal(await policy.locator(`option[value="${customId}"]`).textContent(), 'Always Bike workshop');
    await policy.selectOption(customId); await idle(page);
    await page.reload(); await page.getByLabel('Intent name', {exact: true}).waitFor();
    const withCustom = await stored(page);
    assert.deepEqual(withCustom.customIntents[customId], {name: 'Bike workshop', description: 'Restoring steel bicycles, adjusting derailleurs and rebuilding wheels'});
    assert.equal(withCustom.countModes[customId], false); assert.equal(withCustom.newTabMode, customId);
    assert.equal(withCustom.customTopics[customId], 'wheelbuilding, touring bikes');
    assert.equal(withCustom.channels[customId], 'Workshop North');
    await page.emulateMedia({colorScheme: 'dark'});
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(15, 15, 15)');
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'custom intent settings fit a narrow dark viewport');
    await page.getByRole('button', {name: 'Delete intent', exact: true}).click(); await idle(page);
    await page.waitForFunction(() => !document.querySelector('#intent-name'));
    const removed = await stored(page);
    assert.equal(removed.mode, 'work'); assert.equal(removed.newTabMode, 'last'); assert.equal(removed.customIntents[customId], undefined);
    for (const key of ['customTopics', 'channels', 'countModes']) assert.equal(removed[key][customId], undefined);
    assert.equal(await page.locator(`#new-tab-mode option[value="${customId}"]`).count(), 0);
    assert.equal(await page.getByRole('button', {name: 'Bike workshop Your custom intent', exact: true}).count(), 0);
    console.log('PASS editable built-in descriptions, custom intent create/edit/delete, dynamic timer/new-tab options, persistent settings and narrow dark layout');

    async function popupScenario(activeURL, shouldTarget) {
      const popup = await context.newPage(); popup.on('pageerror', error => errors.push(error.message));
      await popup.addInitScript(({activeURL}) => {
        window.mockRequests = []; window.mockQueries = []; window.mockListeners = [];
        window.mockActive = {id: 42, url: activeURL}; window.mockTabModes = {42: 'music', 88: 'study'};
        let preferences;
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
              const settings = {...preferences, mode: mockTabModes[message.targetTabId] || preferences.mode};
              const snapshot = IntentCore.snapshot({...settings, dailyMinutes: 1}, {[IntentCore.dayKey()]: 60000});
              return {...snapshot, ok: true, appearance: 'dark', settings: {...settings, dailyMinutes: 1}, budgetExhausted: true, timerExempt: !IntentCore.countsMode(settings, settings.mode), blocked: snapshot.blocked && IntentCore.countsMode(settings, settings.mode)};
            }
          },
          tabs: {query: async query => {mockQueries.push(structuredClone(query)); await new Promise(resolve => setTimeout(resolve, 20)); return [structuredClone(mockActive)];}}
        };
      }, {activeURL});
      await popup.goto(file('popup.html')); await popup.getByRole('heading', {name: 'Your daily budget'}).waitFor();
      assert.equal(await popup.evaluate(() => mockQueries.length), 1, 'active tab is resolved exactly once');
      assert.deepEqual(await popup.evaluate(() => mockQueries[0]), {active: true, currentWindow: true});
      const first = await popup.evaluate(() => mockRequests[0]);
      assert.equal(first.type, 'GET_STATE'); assert.equal(first.targetTabId, shouldTarget ? 42 : undefined);
      assert.equal(first.patch, undefined);
      if (shouldTarget) {
        assert.match(await popup.locator('#budget-note').textContent(), /Music does not count.*stays accessible/);
        assert.match(await popup.locator('.mode-caption').textContent(), /on for this tab.*exempt/);
        // A later active-tab change cannot retarget an already-open popup.
        await popup.evaluate(() => {mockActive = {id: 88, url: 'https://www.youtube.com/'};});
      }
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
    await popupScenario('chrome-extension://intent/blocked.html', true);
    await popupScenario('https://example.com/', false);
    console.log('PASS popup pins the originating YouTube or blocked tab once, targets updates outside patches, preserves other tabs and explains exempt Music');
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
