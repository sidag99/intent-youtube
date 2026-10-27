/* Delayed state reads must not undo completed controls; all Chrome APIs are mocked. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = name => 'file://' + path.join(root, name);

(async () => {
  const browser = await chromium.launch({channel: 'chromium', headless: true});
  try {
    const context = await browser.newContext();
    const errors = [];
    async function ui(name) {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        let preferences, paused = false, hold = false, release;
        const interval = window.setInterval;
        window.setInterval = (callback, duration, ...args) => duration === 3000 ? (window.testPoll = () => callback(...args), 1) : interval(callback, duration, ...args);
        window.startOldPoll = () => {hold = true; void testPoll();};
        window.releaseOldPoll = () => release();
        window.pollWaiting = () => Boolean(release);
        window.chrome = {
          runtime: {
            id: 'intent', getURL: name => 'chrome-extension://intent/' + name,
            onMessage: {addListener() {}},
            sendMessage: async message => {
              preferences ||= IntentCore.defaults();
              if (message.type === 'UPDATE_SETTINGS') {
                if (window.holdSave) {
                  window.holdSave = false;
                  const success = await new Promise(resolve => {window.finishSave = resolve;});
                  window.finishSave = null;
                  if (!success) throw new Error('Fixture save failed. Try again.');
                }
                preferences = IntentCore.sanitize({...preferences, ...message.patch});
              }
              if (message.type === 'RESET_SETTINGS') preferences = IntentCore.defaults();
              if (message.type === 'SET_TAB_PAUSED') paused = message.paused;
              const snapshot = {...IntentCore.snapshot(preferences, {}), ok: true, tabPaused: paused};
              if (message.type === 'GET_STATE' && hold) {hold = false; return new Promise(resolve => {release = () => {release = null; resolve(snapshot);};});}
              return snapshot;
            }
          },
          tabs: {query: async () => [{id: 42, url: 'https://www.youtube.com/'}]}
        };
        window.savedPreferences = () => preferences;
      });
      await page.goto(file(name));
      await page.getByRole('heading', {name: 'What are you here for?'}).waitFor();
      return page;
    }
    async function holdPoll(page) {await page.evaluate(() => startOldPoll()); await page.waitForFunction(() => pollWaiting());}
    async function releasePoll(page) {await page.evaluate(() => releaseOldPoll()); await page.waitForTimeout(50);}
    const settings = await ui('settings.html');
    await holdPoll(settings);
    await settings.getByRole('switch', {name: 'Hide Shorts', exact: true}).click();
    await settings.waitForFunction(() => document.querySelector('[data-toggle="hideShorts"]').getAttribute('aria-checked') === 'false');
    await releasePoll(settings);
    assert.equal(await settings.getByRole('switch', {name: 'Hide Shorts', exact: true}).getAttribute('aria-checked'), 'false', 'an earlier poll cannot undo the displayed saved filter');
    assert.equal(await settings.evaluate(() => savedPreferences().hideShorts), false);

    await holdPoll(settings);
    await settings.locator('#reset-settings').click();
    await settings.locator('#confirm-reset').click();
    await settings.getByText('Factory settings restored. Daily usage was kept.', {exact: true}).waitFor();
    await releasePoll(settings);
    assert.equal(await settings.getByRole('switch', {name: 'Hide Shorts', exact: true}).getAttribute('aria-checked'), 'true', 'an earlier poll cannot undo factory reset');

    const popup = await ui('popup.html');
    await holdPoll(popup);
    await popup.getByRole('button', {name: 'Pause on this tab', exact: true}).click();
    await popup.getByRole('button', {name: 'Resume on this tab', exact: true}).waitFor();
    await releasePoll(popup);
    assert.equal(await popup.getByRole('button', {name: 'Resume on this tab', exact: true}).count(), 1, 'an earlier poll cannot undo the displayed tab pause');
    console.log('PASS delayed UI reads preserve newer filter saves, factory reset and tab pause');

    await settings.locator('[data-edit="work"]').click();
    await settings.locator('#intent-description').fill('A scope saved without losing later typing.');
    await settings.evaluate(() => {window.holdSave = true;});
    await settings.getByRole('button', {name: 'Save preferences', exact: true}).click();
    await settings.waitForFunction(() => Boolean(window.finishSave));
    assert.equal(await settings.locator('#intent-description').isDisabled(), true, 'the scope cannot change while its save is pending');
    assert.equal(await settings.locator('#close-editor').isDisabled(), true);
    assert.equal(await settings.locator('#cancel-editor').isDisabled(), true);
    await assert.rejects(() => settings.locator('#intent-description').fill('Unsaved replacement', {timeout: 100}), /Timeout|not enabled/);
    await settings.keyboard.press('Escape');
    await settings.locator('#cancel-editor').dispatchEvent('click');
    assert.equal(await settings.locator('#intent-editor').evaluate(dialog => dialog.open), true, 'Escape and close handlers keep the saving editor open');
    await settings.evaluate(() => finishSave(true));
    await settings.getByText('All preferences saved on this device.', {exact: true}).waitFor();
    assert.equal(await settings.locator('#intent-description').isDisabled(), false);
    assert.equal(await settings.locator('#intent-description').inputValue(), 'A scope saved without losing later typing.');
    assert.equal(await settings.evaluate(() => savedPreferences().intentDescriptions.work), 'A scope saved without losing later typing.');

    await settings.locator('#intent-description').fill('Keep this draft after a failed save.');
    await settings.evaluate(() => {document.querySelector('#topics').disabled = true; window.holdSave = true;});
    await settings.getByRole('button', {name: 'Save preferences', exact: true}).click();
    await settings.waitForFunction(() => Boolean(window.finishSave));
    await settings.evaluate(() => finishSave(false));
    await settings.getByText('Fixture save failed. Try again.', {exact: true}).waitFor();
    assert.equal(await settings.locator('#intent-description').isDisabled(), false, 'failure re-enables editable controls');
    assert.equal(await settings.locator('#topics').isDisabled(), true, 'failure preserves controls that were already disabled');
    assert.equal(await settings.locator('#cancel-editor').isDisabled(), false);
    assert.equal(await settings.locator('#intent-description').inputValue(), 'Keep this draft after a failed save.');
    assert.equal(await settings.locator('#draft-status').textContent(), 'Unsaved preferences');
    await settings.getByRole('button', {name: 'Save preferences', exact: true}).click();
    await settings.getByText('All preferences saved on this device.', {exact: true}).waitFor();
    assert.equal(await settings.evaluate(() => savedPreferences().intentDescriptions.work), 'Keep this draft after a failed save.', 'the preserved draft can be retried');
    await settings.locator('#cancel-editor').click();
    assert.equal(await settings.locator('#intent-editor').count(), 0);
    assert.deepEqual(errors, [], 'closing during a delayed save never produces a missing-element exception');
    console.log('PASS saving freezes intent edits and closing; failure restores controls and keeps the retryable draft');

    const blocked = await context.newPage();
    await blocked.addInitScript(() => {
      window.blockedNow = true; window.removedTabs = [];
      window.chrome = {
        runtime: {onMessage: {addListener() {}}, sendMessage: async () => ({ok: true, blocked: blockedNow, settings: IntentCore.defaults(), resetAt: Date.now() + 3600000})},
        tabs: {getCurrent: async () => ({id: 42}), remove: async id => removedTabs.push(id)}
      };
    });
    await blocked.goto(file('blocked.html'));
    await blocked.getByText('Your budget resets in', {exact: false}).waitFor();
    await blocked.evaluate(() => {blockedNow = false; return refresh();});
    await blocked.getByRole('heading', {name: 'A fresh start is waiting.', exact: true}).waitFor();
    assert.equal(await blocked.locator('#close-tab').textContent(), 'Return to YouTube →');
    await blocked.evaluate(() => {blockedNow = true; return refresh();});
    assert.match(await blocked.locator('h1').textContent(), /whole world.*outside this tab/s, 'reblocking restores the blocked heading');
    assert.equal(await blocked.locator('#close-tab').textContent(), 'Close this tab ↗', 'reblocking restores the close action label');
    await blocked.locator('#close-tab').click();
    assert.deepEqual(await blocked.evaluate(() => removedTabs), [42], 'reblocked action closes the tab instead of returning to a blocked URL');
    console.log('PASS blocked → available → blocked restores the heading and close-tab behavior');
    await context.close();
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
