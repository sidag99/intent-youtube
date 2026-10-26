const {chromium} = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({channel: 'chromium', headless: true});
  try {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}}); context.setDefaultTimeout(10000);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://www.youtube.com/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><html lang="en-GB"><head><style>body{margin:0;font-family:Arial}#primary{width:1100px;margin:24px auto}</style></head><body><ytd-browse page-subtype="home"><div id="primary"><div id="native-home">Native recommendations</div></div></ytd-browse><script type="application/json">ytcfg.set({"HL":"en-GB","GL":"GB"});</script></body></html>'}));
    await page.route('https://i.ytimg.com/**', route => route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#365e4b"/></svg>'}));
    await page.goto('https://www.youtube.com/');
    for (const file of ['core.js', 'feed.js', 'feed-theme.js', 'home.js']) await page.addScriptTag({path: root + '/src/' + file});
    await page.addStyleTag({path: root + '/src/content.css'});
    await page.evaluate(() => {
      window.fetches = []; window.feedRequests = []; window.batches = []; window.failedContinuation = false; window.forceExpired = false; window.longFeed = false;
      const config = {INNERTUBE_CONTEXT_CLIENT_NAME: 1, INNERTUBE_CONTEXT_CLIENT_VERSION: '2.20261023.01.00', INNERTUBE_API_KEY: 'PublicBootstrapKey_1234567890'};
      const continuation = token => ({continuationItemRenderer: {continuationEndpoint: {continuationCommand: {token, request: 'CONTINUATION_REQUEST_TYPE_SEARCH'}}}});
      const entry = (query, index) => ({videoRenderer: {videoId: (query.startsWith('Professional') ? 'w' : query.startsWith('Academic') ? 's' : query.startsWith('Instrumental') ? 'm' : longFeed ? 'l' : 'c') + String(index).padStart(10, '0'), title: {simpleText: query + ' · Lesson ' + index}, ownerText: {simpleText: 'A real creator'}, shortViewCountText: {simpleText: '3.6M views'}, lengthText: {simpleText: '12:30'}, thumbnail: {thumbnails: [{url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'}]}}});
      const service = IntentFeed.createService({fetcher: async (url, options) => {
        fetches.push({url, method: options.method || 'GET'});
        const body = options.body ? JSON.parse(options.body) : null, token = body?.continuation;
        const query = token ? token.slice(0, token.lastIndexOf('_')) : new URL(url).searchParams.get('search_query');
        const pageNumber = token ? Number(token.slice(token.lastIndexOf('_') + 1)) : 0;
        if (query.startsWith('Precision') && pageNumber === 2 && !failedContinuation) {failedContinuation = true; throw new Error('Temporary discovery failure');}
        const entries = longFeed ? Array.from({length: 60}, (_, i) => entry(query, pageNumber * 60 + i)) : [entry(query, pageNumber)];
        const more = pageNumber < 2 ? [continuation(query.replaceAll(' ', '-') + '_' + (pageNumber + 1))] : [];
        // Public tokens are opaque to the extension; this fixture uses a reversible
        // token solely to identify which known search page the mock should return.
        if (token) {
          const clean = query.replaceAll('-', ' ');
          const actual = longFeed ? Array.from({length: 60}, (_, i) => entry(clean, pageNumber * 60 + i)) : [entry(clean, pageNumber)];
          if (clean.startsWith('Precision') && pageNumber === 2 && !failedContinuation) {failedContinuation = true; throw new Error('Temporary discovery failure');}
          return {ok: true, url, text: async () => JSON.stringify({onResponseReceivedCommands: [{appendContinuationItemsAction: {continuationItems: [{itemSectionRenderer: {contents: actual}}, ...more]}}]})};
        }
        return {ok: true, url, text: async () => '<script>ytcfg.set(' + JSON.stringify(config) + ');var ytInitialData = ' + JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: [{itemSectionRenderer: {contents: entries}}, ...more]}}}}}) + ';</script>'};
      }, judge: async videos => videos.map(() => ({accepted: true, uncertain: false}))});
      window.settings = IntentCore.sanitize({intentDescriptions: {work: 'Professional woodworking project', study: 'Academic biology lesson', music: 'Instrumental jazz performance'}, customIntents: {'custom-cabinet': {name: 'Cabinet making', description: 'Precision cabinet joinery'}}, metadataLimit: 0});
      window.home = new IntentHome({sendMessage: async message => {
        if (message.type === 'OPEN_SETTINGS') return {ok: true};
        feedRequests.push(structuredClone(message));
        if (forceExpired && message.pageCursor) {forceExpired = false; return {ok: false, error: 'Discovery continuation expired. Refresh discovery to continue.'};}
        const before = fetches.length, response = await service.get(settings, message); batches.push(fetches.length - before); return {ok: true, ...response};
      }});
      window.activate = mode => {settings = IntentCore.sanitize({...settings, mode}); home.sync(settings, true);};
      activate('work');
    });
    const feed = page.locator('#intent-home-feed');
    for (const mode of ['work', 'study', 'music', 'custom-cabinet']) {
      if (mode !== 'work') await page.evaluate(value => activate(value), mode);
      await page.waitForFunction(() => document.querySelector('#intent-home-feed')?.shadowRoot.querySelectorAll('article.card').length === 2 && !home.busy);
      assert.equal(await feed.locator('.discovery').textContent(), 'YouTube search · Filtered locally');
      assert.match(await feed.locator('.discovery').getAttribute('title'), /public YouTube searches.*filtered on your device.*selected intent/);
      assert.equal(await feed.getByRole('button', {name: 'Find more videos', exact: true}).isVisible(), true, mode + ' retains its continuation control after a single-query first page');
      assert.ok(await page.evaluate(() => feedRequests.at(-1).pageCursor), 'Home passes the opaque continuation cursor through runtime messages');
      await feed.getByRole('button', {name: 'Find more videos', exact: true}).click();
      if (mode === 'custom-cabinet') {
        await feed.getByRole('button', {name: 'Retry loading more', exact: true}).waitFor();
        assert.equal(await feed.locator('article.card').count(), 2, 'a continuation failure preserves existing cards');
        await feed.getByRole('button', {name: 'Retry loading more', exact: true}).click();
      }
      await page.waitForFunction(() => document.querySelector('#intent-home-feed')?.shadowRoot.querySelectorAll('article.card').length === 3 && !home.busy);
      assert.equal(await feed.locator('.discovery-end').isVisible(), true); assert.match(await feed.locator('.discovery-end').textContent(), /No more matching videos/);
      assert.equal(await feed.getByRole('link', {name: 'Search YouTube', exact: true}).isVisible(), true);
      assert.equal(await feed.getByRole('button', {name: 'Adjust intent', exact: true}).isVisible(), true);
      assert.equal(await feed.getByRole('button', {name: 'Find more videos', exact: true}).isVisible(), false);
      const ids = await feed.locator('article.card').evaluateAll(cards => cards.map(card => card.dataset.videoId)); assert.equal(new Set(ids).size, 3);
    }
    await page.evaluate(() => {forceExpired = true; activate('work');});
    await feed.getByRole('button', {name: 'Restart discovery', exact: true}).waitFor();
    await feed.getByRole('button', {name: 'Restart discovery', exact: true}).click();
    await feed.getByRole('button', {name: 'Find more videos', exact: true}).waitFor();
    assert.equal(await page.evaluate(() => feedRequests.filter(request => request.fresh).at(-1).pageCursor), null, 'restart discards an expired cursor instead of retrying it forever');

    await page.evaluate(() => {longFeed = true; settings = IntentCore.sanitize({...settings, customIntents: {'custom-cabinet': {name: 'Cabinet making', description: 'Long focused topic'}}}); activate('custom-cabinet');});
    await page.waitForFunction(() => document.querySelector('#intent-home-feed')?.shadowRoot.querySelectorAll('article.card').length === 60 && !home.busy);
    await feed.getByRole('button', {name: 'Find more videos', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('#intent-home-feed')?.shadowRoot.querySelectorAll('article.card').length === 120 && !home.busy);
    assert.match(await feed.locator('.discovery-end').textContent(), /120 real videos loaded/); assert.equal(await feed.getByRole('link', {name: 'Search YouTube', exact: true}).isVisible(), true);
    assert.equal(await feed.getByRole('button', {name: 'Find more videos', exact: true}).isVisible(), false, 'the bounded feed explains its cap rather than hiding more without an end state');
    assert.ok(await page.evaluate(() => batches.every(count => count <= 2)), 'every user batch makes at most two public search-page requests');
    assert.deepEqual(errors, []);
    console.log('PASS all built-in/custom discovery feeds retain real continuation paging, opaque cursors, retry/restart, no duplicate cards, explicit exhaustion/cap and honest public-video source labels');
    await context.close();
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
