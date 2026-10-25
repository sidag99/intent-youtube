const {chromium} = require('playwright');
const assert = require('assert/strict'), path = require('path');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({channel: 'chromium', headless: true});
  try {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}});
    const page = await context.newPage(); const pageErrors = [], network = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => network.push(request.url()));
    await page.route('https://preview.test/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><main><section id="intent-preview" class="preview-section" aria-label="Filter preview"></section></main>'}));
    await page.route('https://i.ytimg.com/**', route => route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#808080"/></svg>'}));
    await page.goto('https://preview.test/');
    await page.addStyleTag({path: path.join(root, 'src/ui.css')});
    for (const file of ['core.js', 'feed.js', 'preview.js']) await page.addScriptTag({path: path.join(root, 'src', file)});
    await page.evaluate(() => {
      window.savedSettings = IntentCore.sanitize({...IntentCore.defaults(), mode: 'custom-trees', customIntents: {
        'custom-trees': {name: 'Small living sculptures', description: 'Practical bonsai cultivation, seasonal pruning and miniature landscape composition.', icon: 'leaf'},
        'custom-bread': {name: 'Slow bread', description: 'Sourdough baking, fermentation and shaping loaves by hand.', icon: 'food'}
      }});
      window.sampleVideos = [{title: 'Python programming for useful tools', channel: 'An illustrative channel', cover: 'Illustrative card', color: 'sage', duration: '8:00'}];
      const video = (id, title, description = '') => ({id, title, description, channel: 'Public video channel', thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', duration: '8:00', shorts: false});
      window.acceptedTree = video('p0000000001', 'A little patience goes a long way', 'Keep a tiny tree healthy in a shallow container, shape branches and care for its roots.');
      window.exampleItems = [
        {video: acceptedTree, accepted: true, reason: 'Matches your intent by meaning'},
        {video: video('p0000000002', 'Blue notes after midnight', 'A jazz trio with saxophone and brushed drums.'), accepted: false, reason: 'Outside this intent'},
        {video: video('p0000000003', 'You won’t believe what happens next!!!'), accepted: false, reason: 'Clickbait control'}
      ];
      window.previewRequests = []; window.pendingPreviews = [];
      window.previewRuntime = {sendMessage: message => {previewRequests.push(structuredClone(message)); return new Promise((resolve, reject) => pendingPreviews.push({resolve, reject}));}};
      window.previewUI = new IntentPreview({getSettings: () => savedSettings, live: true, samples: sampleVideos, runtime: previewRuntime});
      previewUI.render();
    });
    const host = page.locator('#intent-preview');
    const requestPreview = async () => {
      const index = await page.evaluate(() => previewRequests.length);
      await host.locator('#preview-intent').click();
      await page.waitForFunction(index => previewRequests.length === index + 1, index);
      return index;
    };
    const complete = async (index, extra = {}) => page.evaluate(({index, extra}) => pendingPreviews[index].resolve({ok: true, key: previewRequests[index].key, semantic: true, previewItems: exampleItems, ...extra}), {index, extra});
    const waitIdle = async () => page.waitForFunction(() => !previewUI.busy);
    assert.equal(await page.evaluate(() => previewRequests.length), 0, 'rendering a preview never starts network/model work');
    assert.equal(network.length, 1, 'custom-intent help loads no fake cards or thumbnails');
    assert.equal(await host.locator('.sample-card').count(), 0);
    assert.match(await host.locator('.sample-empty').innerText(), /custom intent needs its own examples/);
    assert.equal(await host.locator('#show-hidden').isDisabled(), true);
    assert.match(await host.innerText(), /up to two public YouTube search requests/);
    assert.match(await host.innerText(), /No extra video-page requests/);
    assert.equal(await page.evaluate(() => IntentCore.classify(acceptedTree, savedSettings).visible), false, 'the opaque candidate would fail the keyword-only check');
    const first = await requestPreview();
    assert.equal(await host.locator('#preview-intent').isDisabled(), true);
    assert.equal(await host.locator('#sample-grid').getAttribute('aria-busy'), 'true');
    assert.deepEqual(await page.evaluate(() => Object.keys(previewRequests[0]).sort()), ['key', 'mode', 'type']);
    assert.equal(await page.evaluate(() => previewRequests[0].type), 'GET_PREVIEW');
    await complete(first); await waitIdle();
    assert.equal(await host.locator('.real-preview').count(), 1);
    assert.equal(await host.locator('.real-preview').getAttribute('data-video-id'), 'p0000000001', 'the UI respects the local model decision rather than rechecking keywords');
    assert.equal(await host.locator('.preview-verdict').innerText(), 'Matches your intent by meaning');
    assert.match(await host.locator('#preview-status').innerText(), /1 matching and 2 filtered/);
    await host.locator('#show-hidden').click();
    assert.equal(await host.locator('.real-preview').count(), 3); assert.equal(await host.locator('.real-preview.filtered').count(), 2);
    assert.ok((await host.locator('.filter-label').allTextContents()).some(text => text.includes('Clickbait control')));
    assert.equal(await page.evaluate(() => previewRequests.length), 1, 'showing filtered candidates does not refetch or rerun classification');
    await host.locator('#show-hidden').click(); assert.equal(await host.locator('.real-preview').count(), 1);
    // A later intent selection and preview must supersede older in-flight work.
    const oldIntent = await requestPreview();
    await page.evaluate(() => {savedSettings = IntentCore.sanitize({...savedSettings, mode: 'custom-bread'}); previewUI.render();});
    assert.equal(await host.locator('.real-preview').count(), 0, 'changing the saved intent clears earlier examples');
    const newIntent = await requestPreview();
    await complete(newIntent, {previewItems: [{video: {id: 'b0000000001', title: 'Warm hands, slow mornings', description: 'Mixing flour, water and a lively starter, then shaping a loaf.', channel: 'The kitchen', thumbnail: 'https://i.ytimg.com/vi/b0000000001/hqdefault.jpg'}, accepted: true, reason: 'Matches the bread intent'}]}); await waitIdle();
    await complete(oldIntent);
    await page.waitForFunction(() => pendingPreviews.length >= 3);
    assert.equal(await host.locator('.real-preview').getAttribute('data-video-id'), 'b0000000001', 'an out-of-order response cannot replace the newly selected intent');
    assert.match(await host.locator('.preview-verdict').innerText(), /bread intent/);
    // Budget blocks and service errors are declared; users can explicitly retry.
    await page.evaluate(() => {savedSettings = IntentCore.sanitize({...savedSettings, mode: 'custom-trees'}); previewUI.render();});
    const blocked = await requestPreview(); await complete(blocked, {blocked: true}); await waitIdle();
    assert.match(await host.getByRole('alert').innerText(), /daily limit/); assert.equal(await host.locator('#preview-intent').isDisabled(), false);
    const error = await requestPreview(); await complete(error, {ok: false, error: 'YouTube search is unavailable right now.'}); await waitIdle();
    assert.match(await host.getByRole('alert').innerText(), /YouTube search is unavailable/);
    const retry = await requestPreview(); await complete(retry); await waitIdle(); assert.equal(await host.locator('.real-preview').count(), 1);
    const wrongKey = await requestPreview(); await complete(wrongKey, {key: 'outdated-intent'}); await waitIdle();
    assert.match(await host.getByRole('alert').innerText(), /intent changed/);
    const noDecisions = await requestPreview(); await complete(noDecisions, {semantic: false, previewItems: null}); await waitIdle();
    assert.match(await host.getByRole('alert').innerText(), /local model did not return preview decisions/);
    const emptyResponse = await requestPreview(); await page.evaluate(index => pendingPreviews[index].resolve(undefined), emptyResponse); await waitIdle();
    assert.match(await host.getByRole('alert').innerText(), /could not load/);
    const rejectedRequest = await requestPreview(); await page.evaluate(index => pendingPreviews[index].reject(new Error('Temporary connection failure')), rejectedRequest); await waitIdle();
    assert.match(await host.getByRole('alert').innerText(), /Temporary connection failure/);
    // Invalid entries are ignored, and candidate text/thumbnails never become executable HTML.
    const malformed = await requestPreview();
    await complete(malformed, {previewItems: [null, {}, {video: {id: 'bad', title: 'Invalid id'}, accepted: true}, {video: {id: 'x0000000001'}, accepted: true}, {video: {id: 'x0000000002', title: 'Wrong decision type'}, accepted: 'yes'}, {video: {id: 'x0000000003', title: '<img src=x onerror="window.previewInjected=true">', channel: '<script>window.previewInjected=true</script>', thumbnail: 'https://untrusted.test/image.png'}, accepted: true, reason: '<b>Literal reason</b>'}]}); await waitIdle();
    assert.equal(await host.locator('.real-preview').count(), 1);
    assert.equal(await host.locator('.real-preview img').count(), 0, 'untrusted thumbnail hosts are rejected');
    assert.match(await host.locator('.real-preview h3').innerText(), /<img src=x/);
    assert.equal(await host.locator('.preview-verdict').innerText(), '<b>Literal reason</b>');
    assert.equal(await host.locator('.real-preview script').count(), 0); assert.equal(await page.evaluate(() => window.previewInjected), undefined);
    assert.equal(network.some(url => url.includes('untrusted.test')), false);
    // A demo provides honest custom-intent help instead of empty or invented "AI" matches.
    const beforeDemo = await page.evaluate(() => previewRequests.length);
    await page.evaluate(() => {previewUI = new IntentPreview({getSettings: () => savedSettings, live: false, samples: sampleVideos, runtime: previewRuntime}); previewUI.render(); return previewUI.load();});
    assert.equal(await host.locator('#preview-intent').isDisabled(), true); assert.equal(await host.locator('.sample-card').count(), 0);
    assert.match(await host.innerText(), /demo does not run the model or make YouTube requests/); assert.match(await host.locator('.sample-empty').innerText(), /Preview my intent/);
    assert.equal(await page.evaluate(() => previewRequests.length), beforeDemo);
    await page.evaluate(() => {savedSettings = IntentCore.sanitize({...savedSettings, mode: 'off'}); previewUI = new IntentPreview({getSettings: () => savedSettings, live: true, samples: sampleVideos, runtime: previewRuntime}); previewUI.render(); return previewUI.load();});
    assert.equal(await host.locator('#preview-intent').isDisabled(), true); assert.equal(await page.evaluate(() => previewRequests.length), beforeDemo, 'modes-off previews cannot start requests');
    assert.deepEqual(pageErrors, []);
    console.log('PASS opt-in real preview: explicit request costs, semantic decisions without keywords, filtered candidates, stale-generation protection, blocked/error retry, malformed response safety, escaped metadata and honest demo/off states. Runtime/model decisions mocked.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
