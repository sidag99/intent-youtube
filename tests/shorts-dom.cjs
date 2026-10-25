const {chromium} = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const brand = '<yt-section-header-view-model><yt-icon><svg viewBox="0 0 24 24"><path fill="#ff0033" d="M2 2h20v20H2z"/></svg></yt-icon><h2>Shorts</h2></yt-section-header-view-model>';
const clip = id => `<yt-shorts-lockup-view-model id="${id}"><a href="/shorts/abcdefghijk"><h3>Python programming in a minute</h3></a></yt-shorts-lockup-view-model>`;
const modern = (id, clipId) => `<yt-grid-shelf-view-model id="${id}">${brand}<div class="items">${clip(clipId)}</div><button class="show-more">Show more</button><hr class="divider"></yt-grid-shelf-view-model>`;
const normal = (id, title = 'A normal programming lesson') => `<ytd-video-renderer id="${id}"><a href="/watch?v=lmnopqrstuv"><h3 id="video-title">${title}</h3></a></ytd-video-renderer>`;
const fixture = `<!doctype html><html><meta charset="utf-8"><style>body{margin:0;font-family:Arial}ytd-item-section-renderer,ytd-video-renderer,ytd-reel-shelf-renderer,ytd-rich-section-renderer,ytd-rich-item-renderer,ytd-shelf-renderer,yt-shelf-view-model,yt-grid-shelf-view-model,yt-shorts-lockup-view-model{display:block;padding:8px;margin:4px}yt-section-header-view-model{display:flex;align-items:center}svg{width:24px;height:24px}button{display:block}[hidden]{display:none!important}</style><body><ytd-item-section-renderer id="results">${normal('before', 'Shorts')}${modern('modern', 'clip-one')}${normal('after', 'Understanding YouTube Shorts as a video format')}<yt-shelf-view-model id="header-only">${brand}<button class="show-more">Show more</button><hr></yt-shelf-view-model><ytd-rich-section-renderer id="rich-wrapper"><div><ytd-rich-item-renderer><yt-grid-shelf-view-model id="nested-grid">${brand}${clip('clip-nested')}</yt-grid-shelf-view-model></ytd-rich-item-renderer></div><button id="rich-more">Show more</button><hr id="rich-divider"></ytd-rich-section-renderer><ytd-shelf-renderer id="unrelated"><h2>Documentaries</h2>${normal('doc', 'The history of Shorts editing')}<button>Show more</button></ytd-shelf-renderer><ytd-shelf-renderer id="video-named-shorts"><h2>Recommended</h2>${normal('title-only', 'Shorts')}</ytd-shelf-renderer><ytd-shelf-renderer id="mixed">${brand}${clip('mixed-short')}${normal('mixed-normal')}</ytd-shelf-renderer><ytd-reel-shelf-renderer id="legacy">Shorts shelf</ytd-reel-shelf-renderer><ytd-shelf-renderer id="native-hidden" hidden><h2>Hidden by YouTube</h2>${normal('native-hidden-video')}</ytd-shelf-renderer></ytd-item-section-renderer></body></html>`;
(async () => {
  const browser = await chromium.launch({channel: 'chromium', headless: true});
  const errors = [];
  try {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}}); context.setDefaultTimeout(10000);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.route('https://www.youtube.com/**', route => route.fulfill({contentType: 'text/html', body: fixture}));
    await page.goto('https://www.youtube.com/results?search_query=programming');
    await page.addScriptTag({path: root + '/src/core.js'});
    await page.evaluate(() => {
      window.testSettings = {...IntentCore.defaults(), mode: 'off'}; window.testPaused = false; window.handlers = []; window.controllers = []; window.coverage = [];
      window.IntentHome = class {
        constructor(runtime, surface = 'home') {this.surface = surface; this.destroyCount = 0; controllers.push(this);}
        static theme() {return 'light';}
        sync() {} updateTheme() {} refreshFeed() {}
        destroy() {this.destroyCount++; this.host?.remove(); this.host = null;}
      };
      window.IntentToolbar = class {sync(settings, active, state) {coverage.push({settings: structuredClone(settings), active, ...state});} updateTheme() {}};
      window.chrome = {runtime: {id: 'test', getURL: value => 'https://extension.test/' + value, onMessage: {addListener: handler => handlers.push(handler)}, sendMessage: async () => ({ok: true, settings: testSettings, tabPaused: testPaused, blocked: false})}};
      window.setTestSettings = (patch, reset = false) => {testSettings = IntentCore.sanitize({...testSettings, ...patch}); handlers.forEach(handler => handler({type: 'SETTINGS', settings: testSettings, tabPaused: testPaused, reset}));};
      window.setTestPaused = value => {testPaused = value; setTestSettings({});};
    });
    await page.evaluate(() => document.body.insertAdjacentHTML('afterbegin', `<nav id="guide-test"><a id="logo" href="/">Home</a><ytd-guide-entry-renderer id="expanded-shorts"><a href="/shorts">Shorts</a></ytd-guide-entry-renderer><ytd-mini-guide-entry id="mini-shorts"><a href="/shorts/">Shorts</a></ytd-mini-guide-entry><yt-guide-entry-view-model id="modern-shorts"><a href="https://www.youtube.com/shorts/abcdefghijk">Shorts</a></yt-guide-entry-view-model><div role="link" href="/shorts" id="role-shorts">Shorts</div><ytd-guide-entry id="async-nav"><a href="/feed/history">History</a></ytd-guide-entry><a id="not-shorts" href="/shorts-history">History</a><a id="other-site" href="https://youtube.com.evil.example/shorts">External</a><a id="normal-nav" href="/feed/subscriptions">Subscriptions</a></nav>`));
    await page.addStyleTag({path: root + '/src/content.css'}); await page.addScriptTag({path: root + '/src/content.js'});
    const hiddenNavigation = ['expanded-shorts', 'mini-shorts', 'modern-shorts', 'role-shorts'];
    await page.waitForFunction(ids => ids.every(id => document.getElementById(id)?.hasAttribute('data-intent-short-nav')), hiddenNavigation);
    for (const id of hiddenNavigation) assert.equal(await page.locator('#' + id).isVisible(), false, id);
    for (const id of ['logo', 'async-nav', 'not-shorts', 'other-site', 'normal-nav']) assert.equal(await page.locator('#' + id).isVisible(), true, id);
    await page.evaluate(() => document.querySelector('#async-nav a').setAttribute('href', 'https://youtube.com/shorts/abcdefghijk'));
    await page.waitForFunction(() => document.querySelector('#async-nav').hasAttribute('data-intent-short-nav'));
    assert.equal(await page.locator('#async-nav').isVisible(), false, 'async guide destinations are filtered without replacing their renderer');
    await page.evaluate(() => document.querySelector('#async-nav a').setAttribute('href', '/feed/history'));
    await page.waitForFunction(() => !document.querySelector('#async-nav').hasAttribute('data-intent-short-nav'));
    assert.equal(await page.locator('#async-nav').isVisible(), true, 'a reused guide entry is restored when its endpoint changes');
    const hiddenShelves = ['modern', 'header-only', 'rich-wrapper', 'legacy'];
    await page.waitForFunction(ids => ids.every(id => document.getElementById(id)?.hasAttribute('data-intent-short-shelf')), hiddenShelves);
    for (const id of hiddenShelves) assert.equal(await page.locator('#' + id).isVisible(), false, id);
    assert.equal(await page.locator('#modern .show-more').isVisible(), false, 'the heading, red logo, expansion control and divider disappear together');
    assert.equal(await page.locator('#rich-more').isVisible(), false); assert.equal(await page.locator('#rich-divider').isVisible(), false);
    for (const id of ['results', 'before', 'after', 'unrelated', 'doc', 'video-named-shorts', 'title-only', 'mixed', 'mixed-normal']) assert.equal(await page.locator('#' + id).isVisible(), true, id);
    assert.equal(await page.locator('#results').getAttribute('data-intent-short-shelf'), null, 'a result section containing normal videos is never hidden');
    assert.equal(await page.locator('#mixed-short').isVisible(), false, 'a mixed shelf retains normal videos while filtering only its Shorts card');
    assert.equal(await page.locator('#native-hidden').isVisible(), false);

    await page.evaluate(() => setTestSettings({hideShorts: false}));
    await page.waitForFunction(() => !document.querySelector('[data-intent-short-shelf]'));
    for (const id of hiddenNavigation) assert.equal(await page.locator('#' + id).isVisible(), true, id);
    for (const id of [...hiddenShelves, 'clip-one', 'clip-nested', 'mixed-short', 'rich-more', 'rich-divider']) assert.equal(await page.locator('#' + id).isVisible(), true, id);
    assert.equal(await page.locator('#modern .show-more').isVisible(), true);
    assert.equal(await page.locator('#native-hidden').getAttribute('hidden'), '', 'restoration preserves YouTube’s original visibility attributes');

    await page.evaluate(() => setTestSettings({hideShorts: true}));
    await page.locator('#modern[data-intent-short-shelf]').waitFor({state: 'attached'});
    await page.evaluate(() => {window.detached = document.querySelector('#modern'); detached.remove();});
    await page.waitForFunction(() => !detached.hasAttribute('data-intent-short-shelf'));
    await page.evaluate(html => document.querySelector('#results').insertAdjacentHTML('beforeend', html), modern('async-modern', 'async-clip'));
    await page.locator('#async-modern[data-intent-short-shelf]').waitFor({state: 'attached'});
    assert.equal(await page.locator('#async-modern .show-more').isVisible(), false);
    // Cards can disappear first, leaving only the branded header and footer.
    await page.evaluate(() => document.querySelector('#async-modern .items').replaceChildren());
    await page.waitForFunction(() => document.querySelector('#async-modern')?.hasAttribute('data-intent-short-shelf'));
    assert.equal(await page.locator('#async-modern .show-more').isVisible(), false);
    // Reused shelf nodes must not remain permanently hidden after a toggle.
    await page.evaluate(() => {setTestSettings({hideShorts: false}); document.querySelector('#results').append(detached);});
    await page.waitForFunction(() => !document.querySelector('[data-intent-short-shelf]'));
    assert.equal(await page.locator('#modern').isVisible(), true);
    assert.equal(await page.locator('#async-modern .show-more').isVisible(), true);
    await page.evaluate(() => {setTestSettings({hideShorts: true}); document.querySelector('#header-only').innerHTML = '<h2>Normal recommendations</h2><ytd-video-renderer><h3 id="video-title">A regular tutorial</h3></ytd-video-renderer>';});
    await page.waitForFunction(() => !document.querySelector('#header-only').hasAttribute('data-intent-short-shelf'));
    assert.equal(await page.locator('#header-only').isVisible(), true, 'a reused module stops being filtered when it becomes a normal shelf');

    await page.evaluate(() => setTestSettings({mode: 'work'}));
    await page.waitForFunction(() => coverage.at(-1)?.settings.mode === 'work');
    let current = await page.evaluate(() => coverage.at(-1));
    assert.equal(current.state, 'off-here'); assert.match(current.detail, /off on search results.*saved for Home and video recommendations/);
    const priorDestroys = await page.evaluate(() => controllers.map(controller => controller.destroyCount));
    await page.evaluate(() => setTestSettings({}, true));
    assert.deepEqual(await page.evaluate(() => controllers.map(controller => controller.destroyCount)), priorDestroys.map(value => value + 1), 'same-key reset explicitly destroys both feed controllers');
    await page.evaluate(() => {history.pushState({}, '', '/'); setTestSettings({mode: 'off'}); document.dispatchEvent(new Event('yt-navigate-finish'));});
    await page.waitForFunction(() => coverage.at(-1)?.settings.mode === 'off');
    assert.equal(await page.locator('#modern').isVisible(), false, 'native Home still hides the complete Shorts module with intent modes off');
    current = await page.evaluate(() => coverage.at(-1)); assert.equal(current.state, 'off-here'); assert.match(current.detail, /Intent filtering is off/);
    await page.evaluate(() => setTestSettings({hideShorts: false}));
    await page.waitForFunction(() => !document.querySelector('[data-intent-short-shelf]'));
    assert.equal(await page.locator('#modern').isVisible(), true);
    await page.evaluate(() => {setTestSettings({mode: 'work'}); const feed = controllers[0]; feed.host = document.createElement('section'); document.body.append(feed.host); feed.feedState = 'active'; document.dispatchEvent(new Event('intent-feed-state-change'));});
    await page.waitForFunction(() => coverage.at(-1)?.state === 'active');
    for (const state of ['loading', 'unavailable']) {
      await page.evaluate(value => {controllers[0].feedState = value; document.dispatchEvent(new Event('intent-feed-state-change'));}, state);
      await page.waitForFunction(value => coverage.at(-1)?.state === value, state);
    }
    // Pausing is broader than the intent Off mode: all extension visibility
    // markers disappear, while YouTube's own hidden attributes are untouched.
    await page.evaluate(() => {setTestSettings({hideShorts: true});});
    await page.locator('#modern[data-intent-short-shelf]').waitFor({state: 'attached'});
    await page.evaluate(() => setTestPaused(true));
    await page.waitForFunction(() => coverage.at(-1)?.state === 'paused');
    assert.equal(await page.locator('[data-intent-hidden],[data-intent-short-shelf],[data-intent-short-nav]').count(), 0);
    for (const id of hiddenNavigation) assert.equal(await page.locator('#' + id).isVisible(), true, id);
    assert.equal(await page.locator('#modern').isVisible(), true);
    assert.equal(await page.locator('#native-hidden').getAttribute('hidden'), '');
    assert.equal(await page.evaluate(() => controllers[0].host), null, 'pause removes the filled feed');
    await page.evaluate(html => document.querySelector('#results').insertAdjacentHTML('beforeend', html), modern('paused-short', 'paused-clip'));
    await page.waitForFunction(() => coverage.at(-1)?.state === 'paused');
    assert.equal(await page.locator('#paused-short').isVisible(), true, 'new Shorts remain unfiltered while paused');
    assert.equal(await page.locator('#paused-clip').getAttribute('data-intent-hidden'), null);
    await page.evaluate(() => {history.pushState({}, '', '/shorts/abcdefghijk'); document.dispatchEvent(new Event('yt-navigate-finish'));});
    await page.waitForTimeout(180);
    assert.equal(await page.locator('#intent-shorts-gate').count(), 0, 'pause also bypasses the Shorts gate');
    await page.evaluate(() => {history.pushState({}, '', '/results?search_query=programming'); setTestPaused(false);});
    await page.locator('#paused-short[data-intent-short-shelf]').waitFor({state: 'attached'});
    assert.equal(await page.evaluate(() => coverage.at(-1).settings.mode), 'work', 'resume keeps the saved intent');
    // Capture a Home navigation while YouTube is still showing the watched URL.
    // Incoming native cards must be hidden synchronously, including cards inserted
    // after the normal coalesced scan has already run on the old route.
    await page.evaluate(() => {
      history.pushState({}, '', '/watch?v=abcdefghijk');
      document.querySelector('#logo').addEventListener('click', event => event.preventDefault());
      document.querySelector('#logo').dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, button: 0}));
      document.body.insertAdjacentHTML('beforeend', '<ytd-browse page-subtype="home"><div id="primary"><div id="incoming-home">Native recommendation</div></div></ytd-browse>');
    });
    assert.equal(await page.locator('#incoming-home').isVisible(), false, 'captured Home click guards cards before the URL or page manager changes');
    await page.waitForTimeout(180);
    assert.equal(await page.locator('#incoming-home').isVisible(), false, 'an old-watch scan cannot drop a pending Home guard');
    await page.evaluate(() => document.querySelector('#primary').insertAdjacentHTML('beforeend', '<div id="late-home">Late recommendation</div>'));
    assert.equal(await page.locator('#late-home').isVisible(), false, 'CSS also covers native cards inserted after the scan');
    await page.evaluate(() => setTestSettings({mode: 'off'}));
    assert.equal(await page.locator('#incoming-home').isVisible(), true, 'manual Off restores the pending native Home immediately');
    await page.evaluate(() => {
      setTestSettings({mode: 'work'});
      document.dispatchEvent(new CustomEvent('yt-navigate-start', {detail: {endpoint: {commandMetadata: {webCommandMetadata: {url: '/'}}}}}));
      setTestPaused(true);
    });
    assert.equal(await page.locator('#incoming-home').isVisible(), true, 'pausing immediately clears a pending navigation guard');
    await page.evaluate(() => {
      setTestPaused(false);
      document.dispatchEvent(new CustomEvent('yt-navigate-start', {detail: {url: '/'}}));
      history.pushState({}, '', '/');
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    assert.equal(await page.locator('html').getAttribute('data-intent-home-pending'), null, 'unsupported Home layout fails open when navigation settles');
    await page.clock.install();
    await page.evaluate(() => {
      history.pushState({}, '', '/watch?v=abcdefghijk');
      document.dispatchEvent(new CustomEvent('yt-navigate-start', {detail: {url: '/'}}));
    });
    assert.notEqual(await page.locator('html').getAttribute('data-intent-home-pending'), null);
    await page.clock.fastForward(15001);
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intent-home-pending'));
    assert.equal(await page.locator('#incoming-home').isVisible(), true, 'a cancelled transition has a bounded fail-open timeout');
    assert.deepEqual(errors, []);
    console.log('PASS complete modern/legacy Shorts shelves, branded empty modules, Show more/dividers, safe adjacent/mixed results, toggle restoration, asynchronous/reused DOM, explicit reset, toolbar coverage states, modern/legacy sidebar links and bounded no-flash Home transitions');
    await context.close();
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
