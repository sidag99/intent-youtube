const {chromium} = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const nativeHTML = index => `<ytd-rich-item-renderer><a href="/watch?v=N${String(index).padStart(10, '0')}"><h3 id="video-title">Programming workshop ${index}</h3></a><div id="channel-name">Workshop North</div><div id="metadata-line"><span>120.000 Aufrufe</span><span>vor 2 Tagen</span></div></ytd-rich-item-renderer>`;
(async () => {
  const browser = await chromium.launch({channel: 'chromium', headless: true});
  try {
    const context = await browser.newContext({viewport: {width: 1400, height: 850}}); context.setDefaultTimeout(8000);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://www.youtube.com/**', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="en"><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;font-family:Arial}ytd-masthead{display:flex;align-items:center;position:fixed;top:0;left:0;width:100%;height:56px;background:white;z-index:100}ytd-browse{display:block}.page-body{padding-top:56px}#primary{width:1200px;margin:auto}ytd-rich-grid-renderer{display:block}#native-contents{display:grid;grid-template-columns:repeat(var(--ytd-rich-grid-items-per-row),minmax(0,1fr));min-height:1200px}ytd-rich-item-renderer{display:block;padding:12px}ytd-continuation-item-renderer{display:block;height:1px}
      </style><ytd-masthead><button id="safe-focus">Search</button></ytd-masthead><div class="page-body"><ytd-browse page-subtype="home"><main id="primary"><ytd-rich-grid-renderer id="native-grid" style="display:block;position:relative;left:3px;top:0;opacity:.9;visibility:visible;pointer-events:auto;z-index:2;width:100%;height:auto;max-width:1200px" aria-hidden="false"><div id="native-contents">${Array.from({length: 6}, (_, index) => nativeHTML(index)).join('')}</div><ytd-continuation-item-renderer id="native-continuation" style="position:relative;min-height:1px"></ytd-continuation-item-renderer></ytd-rich-grid-renderer></main></ytd-browse></div></html>`}));
    await page.route('https://i.ytimg.com/**', route => route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#456"/></svg>'}));
    await page.goto('https://www.youtube.com/');
    for (const name of ['core.js', 'feed.js', 'feed-theme.js', 'recommendations.js', 'home.js']) await page.addScriptTag({path: path.join(root, 'src', name)});
    await page.addStyleTag({path: path.join(root, 'src/content.css')});
    await page.evaluate(() => {
      window.primary = document.querySelector('#primary'); window.native = document.querySelector('#native-grid'); window.contents = document.querySelector('#native-contents'); window.sentinel = document.querySelector('#native-continuation');
      window.settings = IntentCore.sanitize({metadataLimit: 0}); window.started = false; window.virtualizedAway = 0; window.widthSamples = []; window.frames = []; window.nextNativeId = 6; window.requested = 0; window.intersectionProofs = []; window.paginationArmed = false;
      window.originalState = () => {
        const styles = element => Object.fromEntries([...element.style].sort().map(name => [name, [element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]]));
        return {native: styles(native), sentinel: styles(sentinel), aria: native.getAttribute('aria-hidden'), inert: native.hasAttribute('inert')};
      };
      // Mimic YouTube's responsive renderer: a hidden/1px source selects one
      // column, and display:none additionally causes virtualization to remove rows.
      window.nativeResizeObserver = new ResizeObserver(() => {
        const width = native.getBoundingClientRect().width;
        const columns = Math.max(1, Math.floor(width / 300));
        native.style.setProperty('--ytd-rich-grid-items-per-row', String(columns));
        if (started) {
          widthSamples.push({width, columns});
          if (!width || getComputedStyle(native).display === 'none') {virtualizedAway++; contents.replaceChildren();}
        }
        if (window.home) home.sync(settings, true);
      });
      nativeResizeObserver.observe(native);
      window.nativeMutationObserver = new MutationObserver(() => {if (window.home) home.sync(settings, true);});
      nativeMutationObserver.observe(contents, {childList: true});
      window.hiddenState = () => {
        const style = getComputedStyle(native), point = {x: primary.getBoundingClientRect().left + 20, y: 90};
        const hit = document.elementFromPoint(point.x, point.y);
        const link = contents.querySelector('a'); document.querySelector('#safe-focus').focus(); if (link) link.focus();
        return {width: native.getBoundingClientRect().width, visibility: style.visibility, opacity: style.opacity, pointerEvents: style.pointerEvents, aria: native.getAttribute('aria-hidden'), inert: native.inert, noNativeHit: !hit || !native.contains(hit), noNativeFocus: !native.contains(document.activeElement)};
      };
      window.nativeIntersectionObserver = new IntersectionObserver(entries => {
        const entry = entries.find(value => value.target === sentinel && value.isIntersecting && value.intersectionRect.width > 0 && value.intersectionRect.height > 0);
        if (!entry || !paginationArmed) return;
        paginationArmed = false; requested++;
        // A routine scan during native continuation loading is where the previous
        // 1px owner poisoned Intent's column count.
        home.sync(settings, true);
        intersectionProofs.push({...hiddenState(), intersection: {width: entry.intersectionRect.width, height: entry.intersectionRect.height}});
        window.releaseNativeBatch = () => {
          for (let n = 0; n < 4; n++) {
            const index = nextNativeId++, card = document.createElement('ytd-rich-item-renderer');
            card.innerHTML = `<a href="/watch?v=N${String(index).padStart(10, '0')}"><h3 id="video-title">Programming workshop ${index}</h3></a><div id="channel-name">Workshop North</div>`;
            contents.append(card);
          }
          home.sync(settings, true);
        };
      });
      nativeIntersectionObserver.observe(sentinel);
      const sample = () => {
        if (started && home?.host?.isConnected) {
          const first = home.host.shadowRoot.querySelector('.first-grid'), covers = [...home.host.shadowRoot.querySelectorAll('.first-grid .cover,.recommended-grid .cover')];
          frames.push({columns: getComputedStyle(first).gridTemplateColumns.split(/\s+/).length, widest: Math.max(0, ...covers.map(node => node.getBoundingClientRect().width)), sourceWidth: native.getBoundingClientRect().width});
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.waitForFunction(() => native.getBoundingClientRect().width === 1200 && getComputedStyle(native).getPropertyValue('--ytd-rich-grid-items-per-row').trim() === '4');
    const original = await page.evaluate(() => originalState());
    await page.evaluate(() => {
      window.messages = [];
      window.home = new IntentHome({sendMessage: async message => {
        messages.push(structuredClone(message));
        if (message.type === 'FILTER_RECOMMENDATIONS') return {ok: true, key: message.key, items: message.videos};
        if (message.type === 'GET_FEED') return {ok: true, key: message.key, semantic: true, items: Array.from({length: 12}, (_, index) => ({id: 'D' + String(index).padStart(10, '0'), title: 'Useful software project ' + index, channel: 'Discovery Studio', duration: '12:30', thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg', shorts: false})), hasMore: false, nextCursor: 2};
        return {ok: true};
      }});
      const more = home.moreRecommendations.bind(home);
      home.moreRecommendations = () => {window.latestMore = more(); return latestMore;};
      document.documentElement.setAttribute('data-intent-topics', '');
      home.sync(settings, true); started = true;
    });
    await page.waitForFunction(() => !home.busy && home.recommendedItems.length === 6 && home.items.length === 12);
    const feed = page.locator('#intent-home-feed');
    const assertStable = async label => {
      await page.evaluate(() => home.sync(settings, true));
      const actual = await page.evaluate(() => ({...hiddenState(), columns: getComputedStyle(home.host.shadowRoot.querySelector('.first-grid')).gridTemplateColumns.split(/\s+/).length, widest: Math.max(...[...home.host.shadowRoot.querySelectorAll('.first-grid .cover,.recommended-grid .cover')].map(node => node.getBoundingClientRect().width)), erased: virtualizedAway}));
      assert.equal(actual.width, 1200, label + ': native source retains full content width'); assert.equal(actual.columns, 4, label + ': discovery keeps four columns');
      assert.ok(actual.widest <= 310, label + ': no thumbnail expands to a full-width card'); assert.equal(actual.erased, 0, label + ': YouTube virtualization never sees a collapsed source');
      assert.equal(actual.visibility, 'hidden'); assert.equal(actual.opacity, '0'); assert.equal(actual.pointerEvents, 'none'); assert.equal(actual.aria, 'true'); assert.equal(actual.inert, true);
      assert.equal(actual.noNativeHit, true); assert.equal(actual.noNativeFocus, true);
    };
    await assertStable('initial');
    const hiddenBaseline = await page.evaluate(() => originalState());
    const requestBatch = async () => {
      const before = await page.evaluate(() => requested);
      await page.evaluate(() => {paginationArmed = true;});
      await feed.getByRole('button', {name: 'Find more recommendations', exact: true}).click();
      await page.waitForFunction(before => requested === before + 1, before);
      await assertStable('during native continuation');
      const proof = await page.evaluate(() => intersectionProofs.at(-1));
      assert.ok(proof.intersection.width > 0 && proof.intersection.height > 0, 'native IntersectionObserver genuinely triggers the continuation');
      assert.equal(proof.visibility, 'hidden'); assert.equal(proof.inert, true); assert.equal(proof.noNativeHit, true); assert.equal(proof.noNativeFocus, true);
    };
    await requestBatch();
    await page.evaluate(() => releaseNativeBatch()); await page.evaluate(() => latestMore);
    await page.waitForFunction(() => home.recommendedItems.length === 10 && !home.nativeMoreBusy);
    await assertStable('after success'); assert.deepEqual(await page.evaluate(() => originalState()), hiddenBaseline, 'pagination restores the prepared hidden surface after success');
    assert.equal(await feed.locator('.recommended-grid .card').count(), 10, 'new native recommendations are captured while their original grid remains hidden');

    await requestBatch(); await page.evaluate(() => home.nativePagination.cancel()); await page.evaluate(() => latestMore);
    await assertStable('after cancellation'); assert.deepEqual(await page.evaluate(() => originalState()), hiddenBaseline, 'cancellation keeps the same hidden surface geometry');
    assert.equal(await feed.locator('.recommended-grid .card').count(), 10);

    // Even a stale native single-column value must not turn a desktop discovery
    // grid into one enormous thumbnail after its source width has recovered.
    await page.evaluate(() => {native.style.setProperty('--ytd-rich-grid-items-per-row', '1'); home.sync(settings, true);});
    await assertStable('stale native column value');
    await page.evaluate(() => native.style.setProperty('--ytd-rich-grid-items-per-row', '4'));

    await requestBatch();
    await page.evaluate(() => {settings = IntentCore.sanitize({...settings, mode: 'off'}); document.documentElement.removeAttribute('data-intent-topics'); home.sync(settings, true);});
    await page.evaluate(() => latestMore); await page.locator('#intent-home-feed').waitFor({state: 'detached'});
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(await page.evaluate(() => originalState()), original, 'turning Off during pagination restores original native properties instead of resurrecting hidden pagination styles');
    assert.equal(await page.locator('[data-intent-recommendation-source],[data-intent-native-home]').count(), 0);
    assert.equal(await page.locator('#native-grid').isVisible(), true);
    const sampled = await page.evaluate(() => ({frames, widths: widthSamples, erased: virtualizedAway}));
    assert.ok(sampled.frames.length > 2); assert.equal(sampled.erased, 0);
    assert.ok(sampled.frames.every(frame => frame.columns === 4 && frame.widest <= 310 && frame.sourceWidth === 1200), 'every rendered frame keeps the full-width hidden source and compact four-column cards');
    assert.ok(sampled.widths.length > 0, 'the native ResizeObserver actually ran during the active fixture');
    assert.ok(sampled.widths.every(entry => entry.width === 1200 && entry.columns === 4), 'native ResizeObserver never receives a zero/1px pagination width');
    assert.deepEqual(errors, []);
    console.log('PASS native responsive/virtualized grid keeps full geometry through recommendation loading, success/cancel and Off; discovery cards stay compact and native cards never paint, hit or focus while active');
    await context.close();
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
