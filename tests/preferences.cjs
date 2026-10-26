const {chromium} = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const file = name => 'file://' + path.join(root, name);
const idle = page => page.waitForFunction(() => document.querySelector('#app')?.getAttribute('aria-busy') !== 'true');
let builtinDefaults;
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
async function openCreate(page) {
  await page.locator('#new-intent').click();
  await page.locator('#intent-editor[open]').waitFor();
}
async function advanced(page) {
  const section = page.locator('#intent-editor .intent-advanced');
  if (!await section.evaluate(element => element.open)) await section.locator('summary').click();
}
async function closeEditor(page) {
  await page.locator('#close-editor').click();
  await page.locator('#intent-editor').waitFor({state: 'detached'});
}
async function builtinReference(page, mode) {
  const expected = builtinDefaults[mode];
  const panel = page.locator('#builtin-defaults');
  assert.equal(await panel.getByRole('heading', {name: `Built-in ${expected.name} defaults`, exact: true}).count(), 1);
  assert.equal((await page.locator('#default-intent-name').textContent()).trim(), expected.name);
  assert.deepEqual(await page.locator('#default-scope li').allTextContents(), expected.scope, 'editor shows every exact semantic description used by the built-in mode');
  assert.deepEqual(await page.locator('#default-topics li').allTextContents(), expected.topics, 'all built-in topic rules remain visible');
  const details = page.locator('#intent-editor details').filter({has: page.locator('#default-searches')});
  assert.equal(await details.count(), 1, 'default search queries have an expandable reference');
  if (await details.evaluate(element => element.open)) await details.locator('summary').click();
  assert.equal(await page.locator('#default-searches').isVisible(), false);
  await details.locator('summary').click();
  assert.equal(await page.locator('#default-searches').isVisible(), true);
  assert.deepEqual(await page.locator('#default-searches li').allTextContents(), expected.searches, 'reference queries use factory defaults rather than the customized intent');
  await details.locator('summary').click();
  assert.match(await page.locator('#intent-editor').textContent(), /extra topics[\s\S]*add[\s\S]*scope/i);
  assert.match(await panel.textContent(), /default[\s\S]*channels?[\s\S]*none|channels?[\s\S]*none[\s\S]*default/i);
}
async function scopeStatus(page, text) {
  await page.waitForFunction(text => document.querySelector('#intent-scope-status')?.textContent.trim() === text, text);
  const status = page.locator('#intent-scope-status');
  assert.ok((await status.getAttribute('aria-live')) || (await status.getAttribute('role')) === 'status', 'scope changes are announced as a live status');
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
    assert.equal(await page.getByRole('switch', {name: 'Low-time reminders', exact: true}).count(), 0, 'retired reminders are not advertised');
    assert.equal(await page.locator('[data-match-only-mode="off"]').count(),0,'modes-off browsing never offers a topic-based exemption');
    assert.equal(await page.locator('[data-match-only-mode="work"]').count(),0,'counted intents do not offer an exemption policy');
    const musicMatch=page.getByRole('switch',{name:'Only exempt matching Music videos',exact:true});
    assert.equal(await musicMatch.getAttribute('aria-checked'),'false','matching-only exemptions are opt-in');
    await musicMatch.click();await idle(page);assert.equal((await stored(page)).matchOnlyModes.music,true);
    await page.reload();await musicMatch.waitFor();assert.equal(await musicMatch.getAttribute('aria-checked'),'true','the matching-only preference survives reload');
    assert.match(await page.locator('#matching-policy-help').textContent(),/uncertain videos stay exempt.*unrelated videos count.*Browsing and search.*local model.*no extra requests/i);
    await musicMatch.click();await idle(page);
    builtinDefaults = await page.evaluate(() => Object.fromEntries(Object.entries(IntentCore.MODES).map(([mode, definition]) => [mode, {name: definition.name, scope: IntentSemantic.PROFILES[mode], topics: definition.topics, searches: IntentFeed.queries({...IntentCore.defaults(), mode})}])));
    assert.equal(await page.locator('.rules-panel').count(), 0, 'intent fields stay in an editor rather than a permanent page panel');
    assert.equal(await page.locator('#tab-pause').count(), 0, 'full settings never expose a tab-specific pause control');
    const demoPopup = await context.newPage(); await demoPopup.goto(file('popup.html')); await demoPopup.getByRole('heading', {name: 'Your daily budget'}).waitFor();
    assert.equal(await demoPopup.locator('a[href^="settings.html"]').count(), 1, 'popup has one Settings link');
    assert.equal(await demoPopup.locator('#tab-pause').count(), 0, 'a demo popup cannot pause a tab'); await demoPopup.close();
    assert.equal(await page.locator('#intent-library #new-intent').count(), 1, 'creation and library share one panel');
    const roleSize = await page.locator('#role-preset-select').evaluate(element => ({font: parseFloat(getComputedStyle(element).fontSize), height: element.getBoundingClientRect().height}));
    assert.ok(roleSize.font >= 16 && roleSize.height >= 48, 'role selector is readable');
    const initialMode = (await stored(page)).mode;
    await openEditor(page, 'study');
    await builtinReference(page, 'study'); await scopeStatus(page, 'Using built-in scope');
    await page.locator('#intent-description').fill('   '); await scopeStatus(page, 'Using built-in scope');
    assert.equal((await stored(page)).mode, initialMode, 'a pencil opens its intent without changing the selected mode');
    assert.equal(await page.locator(`[data-mode="${initialMode}"]`).getAttribute('aria-pressed'), 'true');
    await page.getByLabel('Intent name', {exact: true}).fill('Discard this name');
    await page.locator('#intent-description').fill('Discard this description'); await scopeStatus(page, 'Custom scope replaces the built-in scope');
    await page.locator('#cancel-editor').click(); await page.locator('#intent-editor').waitFor({state: 'detached'});
    assert.equal(await page.evaluate(() => document.activeElement.dataset.edit), 'study', 'Cancel restores focus to the pencil');
    await openEditor(page, 'study');
    assert.equal(await page.getByLabel('Intent name', {exact: true}).inputValue(), 'Study');
    assert.equal(await page.locator('#intent-description').inputValue(), '', 'Cancel discards unsaved changes');
    await scopeStatus(page, 'Using built-in scope'); await builtinReference(page, 'study');
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
    await openCreate(page);
    assert.equal(await page.locator('#intent-editor .intent-advanced').evaluate(element => element.open), false, 'extra discovery fields are optional Advanced options');
    await page.locator('#intent-name').fill('Unfinished intent draft');
    await page.locator('#intent-description').fill('Keep this description only if I save the new intent.');
    await page.locator('#intent-icon').selectOption('plane');
    await page.locator('#intent-count-time').uncheck();await page.locator('#intent-match-only').check();
    await page.locator('#cancel-editor').click();
    assert.deepEqual((await stored(page)).customIntents, {}, 'Cancel never creates an intent');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'new-intent');
    await openCreate(page); assert.equal(await page.locator('#intent-name').inputValue(), '', 'cancelled create draft is discarded');
    assert.equal(await page.locator('#intent-match-only-controls').isVisible(),false);assert.equal(await page.locator('#intent-match-only').isChecked(),false,'cancelled matching-only drafts are discarded');
    await page.locator('#close-editor').click();
    await metadataLimit.fill('12'); await metadataLimit.press('Tab'); await idle(page);
    assert.equal((await stored(page)).metadataLimit, 12);
    assert.deepEqual((await stored(page)).customIntents, {}, 'saving other preferences never creates an unsaved intent');
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
    };
    for (const [mode, description] of Object.entries(descriptions)) {
      await openEditor(page, mode); await builtinReference(page, mode); await scopeStatus(page, 'Using built-in scope');
      await page.locator('#intent-description').fill(' \n '); await scopeStatus(page, 'Using built-in scope');
      await page.locator('#intent-description').fill(description); await scopeStatus(page, 'Custom scope replaces the built-in scope');
      await page.getByRole('button', {name: 'Save preferences'}).click(); await saved(page);
      assert.equal(await page.locator('#intent-editor').evaluate(dialog => dialog.open), true, 'saving leaves the editor open');
      await builtinReference(page, mode); await scopeStatus(page, 'Custom scope replaces the built-in scope');
      assert.equal((await stored(page)).mode, initialMode, 'editing another intent does not switch the active mode');
      await closeEditor(page);
    }
    await page.reload(); await page.getByRole('heading', {name: 'What are you here for?'}).waitFor();
    for (const [mode, description] of Object.entries(descriptions)) {
      await openEditor(page, mode); assert.equal(await page.locator('#intent-description').inputValue(), description);
      await builtinReference(page, mode); await scopeStatus(page, 'Custom scope replaces the built-in scope'); await closeEditor(page);
    }
    assert.deepEqual((await stored(page)).intentDescriptions, descriptions);

    // Presets are an editable library; applying them changes descriptions only.
    const beforeRole = await stored(page);
    await page.locator('#role-preset-select').selectOption('accountant');
    await page.locator('#apply-role-preset').click(); await idle(page);
    const applied = await stored(page);
    assert.equal(applied.lastRolePreset, 'accountant');
    assert.equal(applied.intentDescriptions.work, applied.rolePresets.accountant.workDescription);
    assert.equal(applied.intentDescriptions.study, applied.rolePresets.accountant.studyDescription);
    assert.equal(applied.intentDescriptions.music, beforeRole.intentDescriptions.music);
    assert.equal(applied.mode, beforeRole.mode);
    assert.deepEqual(applied.countModes, beforeRole.countModes);
    await page.locator('#edit-role-preset').click();
    await page.locator('#role-preset-name').fill('Accounting practice');
    await page.locator('#role-work-description').fill('Reconciling client accounts and preparing bookkeeping reports');
    await page.getByRole('button', {name: 'Save preset', exact: true}).click(); await idle(page);
    await page.locator('#role-preset-editor').waitFor({state: 'detached'});
    assert.equal((await stored(page)).intentDescriptions.work, applied.intentDescriptions.work, 'editing a preset never silently changes applied intents');
    await page.locator('#apply-role-preset').click(); await idle(page);
    assert.equal((await stored(page)).intentDescriptions.work, 'Reconciling client accounts and preparing bookkeeping reports');
    await openEditor(page, 'work'); await page.locator('#intent-description').fill('My own weekly client workflow');
    await page.getByRole('button', {name: 'Save preferences', exact: true}).click(); await saved(page); await closeEditor(page);
    assert.equal((await stored(page)).rolePresets.accountant.workDescription, 'Reconciling client accounts and preparing bookkeeping reports', 'intent edits are independent of preset edits');
    const beforeDelete = (await stored(page)).intentDescriptions;
    await page.locator('#delete-role-preset').click();
    await page.locator('#delete-role-preset-dialog').getByRole('button', {name: 'Cancel', exact: true}).click();
    assert.ok((await stored(page)).rolePresets.accountant);
    await page.locator('#delete-role-preset').click(); await page.locator('#confirm-delete-role-preset').click(); await idle(page);
    await page.locator('#delete-role-preset-dialog').waitFor({state: 'detached'});
    assert.equal((await stored(page)).rolePresets.accountant, undefined);
    assert.equal((await stored(page)).lastRolePreset, null);
    assert.deepEqual((await stored(page)).intentDescriptions, beforeDelete);
    await page.locator('#new-role-preset').click();
    await page.locator('#role-preset-name').fill('Game development');
    await page.locator('#role-work-description').fill('Shipping video games and debugging game engines');
    await page.locator('#role-study-description').fill('Learning game physics and real time rendering');
    await page.getByRole('button', {name: 'Save preset', exact: true}).click(); await idle(page);
    await page.locator('#role-preset-editor').waitFor({state: 'detached'});
    assert.equal((await stored(page)).lastRolePreset, null, 'creating a preset does not apply it');
    assert.ok(Object.values((await stored(page)).rolePresets).some(preset => preset.name === 'Game development'));

    // Optional intent templates do not crowd or switch the installed defaults.
    assert.equal(await page.locator('[data-mode="leisure"]').count(), 0);
    await page.locator('#intent-catalogue > summary').click();
    for (const id of ['gaming', 'tv-film', 'maker', 'ai', 'news', 'travel']) {
      await page.locator(`[data-add-template="${id}"]`).click(); await idle(page);
      const value = (await stored(page)).customIntents['custom-' + id];
      assert.equal(value.templateId, id); assert.ok(value.description); assert.ok(value.icon);
      assert.equal((await stored(page)).mode, beforeRole.mode, 'adding a template does not switch the current intent');
    }
    assert.equal(await page.locator('[data-add-template="ai"]').isDisabled(), true, 'installed templates cannot be duplicated');
    await openEditor(page, 'custom-ai'); await page.locator('#intent-icon').selectOption('plane');
    await page.getByRole('button', {name: 'Save preferences', exact: true}).click(); await saved(page); await closeEditor(page);
    assert.equal((await stored(page)).customIntents['custom-ai'].icon, 'plane');
    assert.equal(await page.locator('#intent-order').count(), 0, 'ordering lives in the selector rather than a separate dropdown');
    while ((await stored(page)).intentOrder[0] !== 'custom-ai') {
      await page.locator('[data-move-intent="custom-ai"][data-direction="-1"]').click(); await idle(page);
    }
    await page.reload(); await page.getByRole('heading', {name: 'What are you here for?'}).waitFor();
    assert.equal((await stored(page)).intentOrder[0], 'custom-ai');
    assert.equal(await page.locator('.mode-grid [data-mode]').first().getAttribute('data-mode'), 'custom-ai');
    assert.equal((await stored(page)).customIntents['custom-ai'].icon, 'plane');
    assert.equal(await page.locator('[data-mode="custom-ai"] .intent-symbol').textContent(), await page.evaluate(() => IntentCore.INTENT_ICONS.plane));
    console.log('PASS role preset apply/edit/delete/create independence, optional intent library, custom icons, removal of Leisure and persistent intent ordering');

    await openEditor(page, 'study'); await page.getByLabel('Intent name', {exact: true}).fill('Exam revision');
    await page.getByRole('button', {name: 'Save preferences'}).click(); await saved(page);
    await builtinReference(page, 'study'); await scopeStatus(page, 'Custom scope replaces the built-in scope');
    assert.equal(await page.getByRole('heading', {name: 'Edit Exam revision intent', exact: true}).count(), 1);
    await closeEditor(page);
    assert.equal((await stored(page)).intentNames.study, 'Exam revision');
    assert.equal((await stored(page)).mode, initialMode);
    assert.match(await page.locator('[data-mode="study"]').textContent(), /Exam revision/);
    assert.equal(await page.locator('#new-tab-mode option[value="study"]').textContent(), 'Always Exam revision');
    assert.equal(await page.getByRole('switch', {name: 'Count Exam revision time', exact: true}).count(), 1, 'renamed built-ins keep their stable ID across timer and new-tab controls');
    const beforeMatchingDraft=await stored(page);
    await openEditor(page,'work');assert.equal(await page.locator('#intent-match-only-controls').isVisible(),false);
    await page.locator('#intent-count-time').uncheck();await page.locator('#intent-match-only').check();
    await page.locator('#intent-count-time').check();assert.equal(await page.locator('#intent-match-only-controls').isVisible(),false);
    await page.locator('#intent-count-time').uncheck();assert.equal(await page.locator('#intent-match-only').isChecked(),true,'draft matching preference survives temporarily re-enabling counted time');
    await page.locator('#cancel-editor').click();assert.deepEqual(await stored(page),beforeMatchingDraft,'Cancel discards both count and matching-only changes');
    await openEditor(page,'work');await page.locator('#intent-count-time').uncheck();await page.locator('#intent-match-only').check();
    await page.getByRole('button',{name:'Save preferences',exact:true}).click();await saved(page);await closeEditor(page);
    assert.equal((await stored(page)).matchOnlyModes.work,true,'built-in editor saves its matching-only timer rule');
    assert.equal(await page.getByRole('switch',{name:'Only exempt matching Work videos',exact:true}).getAttribute('aria-checked'),'true');
    await page.getByRole('switch',{name:'Only exempt matching Work videos',exact:true}).click();await idle(page);
    await toggleCount(page, 'Count Work time', false); await toggleCount(page, 'Count Music time', true);
    assert.equal(await musicMatch.count(),0,'enabling counted time hides its matching-only switch');
    await page.getByLabel('Intent for new YouTube tabs', {exact: true}).selectOption('music'); await idle(page);
    await page.reload(); await page.getByRole('heading', {name: 'What are you here for?'}).waitFor();
    assert.equal(await page.getByRole('switch', {name: 'Count Work time', exact: true}).getAttribute('aria-checked'), 'false');
    assert.equal(await page.getByRole('switch', {name: 'Count Music time', exact: true}).getAttribute('aria-checked'), 'true');
    assert.equal(await page.getByLabel('Intent for new YouTube tabs', {exact: true}).inputValue(), 'music');

    await openCreate(page);
    await page.locator('#intent-name').fill('Bicycle & repair');
    await page.locator('#intent-description').fill('Bicycle maintenance, wheel truing and safe brake repairs');
    await page.locator('#intent-icon').selectOption('tools');
    await page.locator('#channels').fill('Initial Workshop');
    await page.locator('#intent-count-time').uncheck();
    await page.locator('#intent-match-only').check();
    await advanced(page); await page.locator('#topics').fill('initial repairs');
    await page.getByRole('button', {name: 'Create intent', exact: true}).click(); await idle(page);
    const customId = (await stored(page)).mode; assert.match(customId, /^custom-[a-z0-9-]+$/);
    assert.equal(await page.locator('#intent-editor').count(), 0, 'creation does not leave an unexpected modal over the page');
    assert.equal(await page.getByRole('switch', {name: 'Count Bicycle & repair time', exact: true}).getAttribute('aria-checked'), 'false');
    assert.equal((await stored(page)).customIntents[customId].icon, 'tools');
    assert.equal((await stored(page)).channels[customId], 'Initial Workshop');
    assert.equal((await stored(page)).customTopics[customId], 'initial repairs');
    assert.equal((await stored(page)).matchOnlyModes[customId],true,'custom intent creation saves matching-only exemptions');
    assert.equal(await page.getByRole('switch',{name:'Only exempt matching Bicycle & repair videos',exact:true}).getAttribute('aria-checked'),'true');
    await openEditor(page, customId);
    assert.equal(await page.locator('#builtin-defaults').count(), 0, 'custom intents do not claim to have built-in defaults');
    assert.equal(await page.getByLabel('Intent name', {exact: true}).inputValue(), 'Bicycle & repair');
    await page.getByLabel('Intent name', {exact: true}).fill('Bike workshop');
    await page.locator('#intent-description').fill('Restoring steel bicycles, adjusting derailleurs and rebuilding wheels');
    await advanced(page); await page.locator('#intent-count-time').check();
    assert.equal(await page.locator('#intent-match-only-controls').isVisible(),false);
    await page.locator('#topics').fill('wheelbuilding, touring bikes'); await page.locator('#channels').fill('Workshop North');
    await page.getByRole('button', {name: 'Save preferences'}).click(); await saved(page);
    assert.equal(await page.getByLabel('Intent description for bike workshop', {exact: true}).inputValue(), 'Restoring steel bicycles, adjusting derailleurs and rebuilding wheels');
    await closeEditor(page); await page.getByRole('button', {name: 'Bike workshop Your custom intent', exact: true}).waitFor();
    assert.equal(await page.locator(`[data-match-only-mode="${customId}"]`).count(),0,'counted custom intents keep their exemption policy dormant');
    await toggleCount(page, 'Count Bike workshop time', false);
    assert.equal(await page.getByRole('switch',{name:'Only exempt matching Bike workshop videos',exact:true}).getAttribute('aria-checked'),'true','renaming and re-enabling an exemption preserves its stable policy');
    const policy = page.getByLabel('Intent for new YouTube tabs', {exact: true});
    assert.equal(await policy.locator(`option[value="${customId}"]`).textContent(), 'Always Bike workshop');
    await policy.selectOption(customId); await idle(page);
    await page.reload(); await page.getByRole('heading', {name: 'What are you here for?'}).waitFor();
    const withCustom = await stored(page);
    assert.deepEqual(withCustom.customIntents[customId], {name: 'Bike workshop', description: 'Restoring steel bicycles, adjusting derailleurs and rebuilding wheels', icon: 'tools'});
    assert.equal(withCustom.countModes[customId], false); assert.equal(withCustom.newTabMode, customId);
    assert.equal(withCustom.matchOnlyModes[customId],true);
    assert.equal(withCustom.customTopics[customId], 'wheelbuilding, touring bikes'); assert.equal(withCustom.channels[customId], 'Workshop North');
    assert.equal(withCustom.metadataLimit, 12);
    await page.emulateMedia({colorScheme: 'dark'}); assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(15, 15, 15)');
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'settings fit a narrow dark viewport');
    await openEditor(page, customId);
    assert.equal(await page.locator('#builtin-defaults').count(), 0, 'custom intents do not claim to have built-in defaults');
    assert.equal(await page.getByLabel('Intent name', {exact: true}).inputValue(), 'Bike workshop');
    assert.equal(await page.locator('#intent-editor').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true, 'editor fits a narrow viewport');
    await page.getByRole('button', {name: 'Delete intent', exact: true}).click(); await idle(page);
    await page.locator('#intent-editor').waitFor({state: 'detached'});
    const removed = await stored(page);
    assert.equal(removed.mode, 'work'); assert.equal(removed.newTabMode, 'last'); assert.equal(removed.customIntents[customId], undefined);
    for (const key of ['customTopics', 'channels', 'countModes','matchOnlyModes']) assert.equal(removed[key][customId], undefined);
    assert.equal(await page.locator(`#new-tab-mode option[value="${customId}"]`).count(), 0);
    await openCreate(page);
    await page.locator('#intent-name').fill('Remove on reset');
    await page.locator('#intent-description').fill('A temporary custom intent for verifying factory reset.');
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
    console.log('PASS transparent built-in scope/topic/search references and live replacement status, independent pencil editors, renaming, custom intents, metadata controls, timer/new-tab options and confirmed factory reset');

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
      assert.equal(await popup.locator('a[href^="settings.html"]').count(), 1);
      assert.equal(await popup.getByRole('link', {name: 'Settings', exact: false}).count(), 1);
      const off = popup.locator('.mode-off-button');
      assert.equal(await off.count(), 1); assert.equal(await off.getAttribute('aria-describedby'), 'intent-off-help');
      assert.match(await popup.locator('#intent-off-help').textContent(), /Intent off stops topic filtering.*timer rule still apply.*Pause stops all filters and timer counting/);
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
      assert.equal((await popup.locator('#tab-pause').textContent()).trim(), 'Resume', 'popup retains its compact labelled control');
      assert.equal(await popup.locator('#tab-pause svg').count(), 1);
      assert.match(await popup.locator('#tab-pause').getAttribute('title'), /Resume on this tab/);
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
      assert.equal(await popup.locator('.tab-pause-state').count(), 0);
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
