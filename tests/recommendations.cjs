const {chromium} = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const escape = value => String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
const ids = {legacy: 'A0000000001', modern: 'B0000000002', shorts: 'S0000000003', shortsV2: 'T0000000004', current: 'C0000000004', unsafeImage: 'U0000000005', badImageHost: 'V0000000006', next: 'N0000000007'};
function legacy(id, {title = 'A useful programming lesson', channel = 'Workshop North', description = '', metadata = ['120 views', '2 days ago'], thumbnail, href = '/watch?v=' + id} = {}) {
  return `<ytd-rich-item-renderer><a href="${escape(href)}"><img${thumbnail ? ` src="${escape(thumbnail)}"` : ''}></a><h3><a id="video-title" title="${escape(title)}">${escape(title)}</a></h3><div id="channel-name"><a href="/@workshop">${escape(channel)}</a></div><div id="description-text">${escape(description)}</div><ytd-thumbnail-overlay-time-status-renderer>12:34</ytd-thumbnail-overlay-time-status-renderer><div id="metadata-line">${metadata.map(text => `<span>${escape(text)}</span>`).join('')}</div></ytd-rich-item-renderer>`;
}
const snapshot = page => page.evaluate(() => {
  const declarations = node => Object.fromEntries([...node.style].sort().map(name => [name, [node.style.getPropertyValue(name), node.style.getPropertyPriority(name)]]));
  return {owner: declarations(document.querySelector('#native-owner')), continuation: declarations(document.querySelector('#continuation')), primary: declarations(document.querySelector('#primary')), inert: document.querySelector('#native-owner').hasAttribute('inert'), aria: document.querySelector('#native-owner').getAttribute('aria-hidden'), scrollY};
});
(async () => {
  const browser = await chromium.launch({channel: 'chromium', headless: true});
  const errors = [], network = [];
  try {
    const context = await browser.newContext({viewport: {width: 1000, height: 700}});
    const page = await context.newPage(); page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (route.request().resourceType() === 'document') return route.fulfill({contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><style>body{margin:0}ytd-masthead{display:block;position:fixed;top:0;width:100%;height:56px}#primary{margin-top:56px}[data-intent-native-home]{display:none!important}</style><ytd-masthead>YouTube fixture</ytd-masthead><main id="primary"></main>'});
      network.push({url: route.request().url(), type: route.request().resourceType()});
      return route.abort();
    });
    await page.goto('https://www.youtube.com/');
    await page.addScriptTag({path: path.join(root, 'src/core.js')});
    await page.addScriptTag({path: path.join(root, 'src/feed.js')});
    await page.addScriptTag({path: path.join(root, 'src/recommendations.js')});
    await page.evaluate(() => {
      window.accountReads = []; window.extensionRequests = [];
      for (const name of ['ytcfg', 'ytInitialData', 'ytInitialPlayerResponse']) Object.defineProperty(window, name, {configurable: true, get() {accountReads.push(name); throw new Error('Account/session state must not be read.');}});
      Object.defineProperty(document, 'cookie', {configurable: true, get() {accountReads.push('cookie'); throw new Error('Cookies must not be read.');}});
      window.fetch = async (...args) => {extensionRequests.push(['fetch', ...args.map(String)]); throw new Error('No direct network calls are permitted.');};
      window.XMLHttpRequest = class {open(...args) {extensionRequests.push(['xhr', ...args.map(String)]); throw new Error('No direct network calls are permitted.');}};
      window.linkExecuted = false;
    });
    const german = {title: 'Über Datenanalyse: sauber erklärt', channel: 'Wissen & Werkstatt', description: 'Ein verständlicher Einstieg. #DatenAnalyse #lernen', metadata: ['1,2 Mio. Aufrufe', 'vor 3 Tagen'], thumbnail: `https://i.ytimg.com/vi/${ids.legacy}/hqdefault.jpg`};
    const modern = `<yt-lockup-view-model><a href="https://youtube.com/@math">Channel</a><a href="https://m.youtube.com/watch?v=${ids.modern}&t=12"><img src="https://i.ytimg.com/vi/${ids.modern}/hqdefault.jpg"></a><h3 class="yt-lockup-metadata-view-model__title">数学の考え方 — 最初の一歩</h3><div class="yt-content-metadata-view-model"><div class="yt-content-metadata-view-model__metadata-row"><span class="yt-content-metadata-view-model__metadata-text">学びの時間</span></div><div class="yt-content-metadata-view-model__metadata-row">１２万回視聴 · ２日前</div></div><div class="description-snippet">数学を学ぶ #数学</div><span class="yt-badge-shape__text">8:20</span></yt-lockup-view-model>`;
    const shorts = `<yt-shorts-lockup-view-model><a href="/shorts/${ids.shorts}"><img></a><h3 class="shortsLockupViewModelHostMetadataTitle">Tiny guitar performance #Music</h3><div id="channel-name">Evening Studio</div></yt-shorts-lockup-view-model>`;
    const shortsV2 = `<ytm-shorts-lockup-view-model-v2><a href="/shorts/${ids.shortsV2}"><img></a><a class="shortsLockupViewModelHostMetadataTitle" title="A short mathematics explanation">A short mathematics explanation</a></ytm-shorts-lockup-view-model-v2>`;
    const rejected = [
      `<ytd-ad-slot-renderer>${legacy('D0000000010')}</ytd-ad-slot-renderer>`,
      `<ytd-rich-item-renderer><ytd-ad-slot-renderer>${legacy('D0000000013')}</ytd-ad-slot-renderer></ytd-rich-item-renderer>`,
      `<ytd-promoted-video-renderer>${legacy('D0000000011')}</ytd-promoted-video-renderer>`,
      `<ytd-promoted-sparkles-web-renderer>${legacy('D0000000012')}</ytd-promoted-sparkles-web-renderer>`,
      `<section hidden>${legacy('H0000000010')}</section>`,
      `<section id="intent-home-feed">${legacy('O0000000010')}</section>`,
      `<section id="intent-watch-feed">${legacy('O0000000011')}</section>`,
      legacy('E0000000010', {href: 'https://www.youtube.com.evil.test/watch?v=E0000000010'}),
      legacy('E0000000011', {href: 'https://evil.test/watch?v=E0000000011'}),
      legacy('E0000000012', {href: 'javascript:window.linkExecuted=true'}),
      legacy('E0000000013', {href: '/playlist?list=E0000000013'}),
      legacy('E0000000014', {title: ''}),
      legacy('bad-id', {href: '/watch?v=bad-id'})
    ].join('');
    await page.locator('#primary').evaluate((primary, html) => {primary.innerHTML = html;}, legacy(ids.legacy, german) + modern + shorts + shortsV2 + legacy(ids.legacy, {title: 'Duplicate'}) + legacy(ids.current) + legacy(ids.unsafeImage, {thumbnail: 'data:image/svg+xml,<svg></svg>'}) + legacy(ids.badImageHost, {thumbnail: 'https://i.ytimg.com.evil.test/fake.jpg'}) + rejected);
    const videos = await page.evaluate(current => IntentRecommendations.read(document.querySelector('#primary'), current), ids.current);
    assert.deepEqual(videos.map(video => video.id), [ids.legacy, ids.modern, ids.shorts, ids.shortsV2, ids.unsafeImage, ids.badImageHost]);
    assert.deepEqual(videos[0], {id: ids.legacy, ...german, metadata: german.metadata.join(' · '), duration: '12:34', shorts: false, hashtags: ['Daten Analyse', 'lernen']});
    assert.equal(videos[1].title, '数学の考え方 — 最初の一歩'); assert.equal(videos[1].channel, '学びの時間'); assert.equal(videos[1].metadata, '１２万回視聴 · ２日前'); assert.equal(videos[1].duration, '8:20');
    assert.equal(videos[2].shorts, true); assert.equal(videos[2].channel, 'Evening Studio');
    assert.equal(videos[3].shorts, true); assert.equal(videos[3].title, 'A short mathematics explanation');
    for (const video of videos.slice(4)) assert.equal(video.thumbnail, `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`, 'unsafe thumbnail hosts and data URLs get a bounded YouTube fallback');
    assert.equal(await page.evaluate(() => linkExecuted), false);
    console.log('PASS native recommendation parsing: legacy/modern cards, regional text, Shorts, deduplication and current/ad/hidden/owned/spoof exclusions');

    // Native continuation buttons are used directly. Duplicate/current-video
    // mutations cannot finish a batch before a genuinely new candidate appears.
    await page.locator('#primary').evaluate((primary, {html, current, next}) => {
      primary.innerHTML = `<div id="native-owner" data-intent-native-home style="display:none!important;color:rgb(10,20,30);position:relative" aria-hidden="false">${html}<ytd-continuation-item-renderer id="continuation" style="margin-top:9px!important"><button id="native-more">Load more</button></ytd-continuation-item-renderer></div>`;
      window.pagination = new IntentRecommendations.Pagination(); window.buttonClicks = 0; window.batchSettled = false;
      document.querySelector('#native-more').addEventListener('click', () => {
        buttonClicks++;
        const duplicate = document.createElement('ytd-video-renderer'); duplicate.innerHTML = `<a href="/watch?v=A0000000001"><h3>Duplicate</h3></a>`;
        const watched = document.createElement('ytd-video-renderer'); watched.innerHTML = `<a href="/watch?v=${current}"><h3>Current video</h3></a>`;
        document.querySelector('#native-owner').append(duplicate, watched);
        window.releaseNextBatch = () => {const card = document.createElement('ytd-video-renderer'); card.innerHTML = `<a href="/watch?v=${next}"><h3>Next native result</h3></a>`; document.querySelector('#native-owner').append(card);};
      });
      window.pendingBatch = pagination.load(primary, current).then(result => {batchSettled = true; return result;});
    }, {html: legacy(ids.legacy), current: ids.current, next: ids.next});
    const buttonBefore = await snapshot(page);
    assert.equal(await page.evaluate(() => batchSettled), false, 'duplicate/current recommendations are not a newly loaded batch');
    await page.evaluate(() => releaseNextBatch());
    const buttonResult = await page.evaluate(() => pendingBatch);
    assert.deepEqual(buttonResult, {available: true, added: true}); assert.equal(await page.evaluate(() => buttonClicks), 1);
    assert.deepEqual(await snapshot(page), buttonBefore, 'the button path does not alter native presentation');

    async function sentinelScenario({cancelled, initialInert, initialAria}) {
      await page.locator('#primary').evaluate((primary, {html, next, cancelled, initialInert, initialAria}) => {
        const aria = initialAria === null ? '' : ` aria-hidden="${initialAria}"`;
        const inert = initialInert ? ' inert' : '';
        const sentinel = `<ytd-continuation-item-renderer id="continuation" style="display:block;position:relative;top:17px!important;min-height:29px;max-height:90px"></ytd-continuation-item-renderer>`;
        primary.innerHTML = `<div id="native-owner" data-intent-native-home style="display:none!important;position:relative;left:19px;top:30px;opacity:.4;overflow:visible;width:300px;height:200px;color:rgb(20,30,40)"${aria}${inert}>${html}${sentinel}</div>`;
        const continuation = document.querySelector('#continuation');
        window.nativeOwner = document.querySelector('#native-owner');
        window.nativeContinuation = continuation;
        window.pagination = new IntentRecommendations.Pagination(); window.intersectionProof = null;
        window.nativeObserver = new IntersectionObserver(entries => {
          const entry = entries.find(item => item.target === continuation && item.isIntersecting && item.intersectionRect.width > 0 && item.intersectionRect.height > 0);
          if (!entry || intersectionProof) return;
          const owner = nativeOwner, computed = getComputedStyle(owner), rect = continuation.getBoundingClientRect();
          const link = owner.querySelector('a'); if (link) link.focus();
          window.intersectionProof = {intersects: entry.isIntersecting, width: entry.intersectionRect.width, height: entry.intersectionRect.height, rect: {top: rect.top, bottom: rect.bottom}, opacity: computed.opacity, pointerEvents: computed.pointerEvents, overflow: computed.overflow, inert: owner.inert, aria: owner.getAttribute('aria-hidden'), descendantsCannotFocus: !link || document.activeElement !== link};
          if (!cancelled) {const card = document.createElement('ytd-video-renderer'); card.innerHTML = `<a href="/watch?v=${next}"><h3>Loaded by the native intersection observer</h3></a>`; owner.append(card);}
        });
        nativeObserver.observe(continuation);
      }, {html: legacy(ids.legacy), next: ids.next, cancelled, initialInert, initialAria});
      const capture = () => page.evaluate(() => {
        const declarations = node => Object.fromEntries([...node.style].sort().map(name => [name, [node.style.getPropertyValue(name), node.style.getPropertyPriority(name)]]));
        return {owner: declarations(nativeOwner), continuation: declarations(nativeContinuation), inert: nativeOwner.hasAttribute('inert'), aria: nativeOwner.getAttribute('aria-hidden'), scrollY};
      });
      const before = await capture();
      await page.evaluate(current => {window.pendingBatch = pagination.load(document.querySelector('#primary'), current);}, ids.current);
      await page.waitForFunction(() => intersectionProof !== null);
      const during = await page.evaluate(() => intersectionProof);
      assert.equal(during.intersects, true); assert.ok(during.width > 0 && during.height > 0, 'the real browser intersection observer saw a nonempty viewport intersection');
      assert.ok(during.rect.top >= 60 && during.rect.bottom <= 700);
      assert.equal(during.opacity, '0'); assert.equal(during.pointerEvents, 'none'); assert.equal(during.overflow, 'hidden');
      assert.equal(during.inert, true); assert.equal(during.aria, 'true'); assert.equal(during.descendantsCannotFocus, true);
      if (cancelled) await page.evaluate(() => pagination.cancel());
      const result = await page.evaluate(() => pendingBatch);
      assert.deepEqual(result, cancelled ? {available: true, added: false, cancelled: true} : {available: true, added: true});
      assert.deepEqual(await capture(), before, 'native inline values/priorities, aria, inert and scroll position are restored exactly');
      await page.evaluate(() => nativeObserver.disconnect());
    }
    await sentinelScenario({cancelled: false, initialInert: false, initialAria: 'false'});
    await sentinelScenario({cancelled: true, initialInert: true, initialAria: null});
    console.log('PASS native pagination buttons and real observer intersection while the hidden parent remains transparent, clipped, inert and inaccessible; success/cancel restore original state');

    await page.locator('#primary').evaluate(primary => {primary.innerHTML = '<section hidden><ytd-continuation-item-renderer><button>Hidden</button></ytd-continuation-item-renderer></section><div id="intent-home-feed"><ytd-continuation-item-renderer><button>Own feed</button></ytd-continuation-item-renderer></div>';});
    assert.deepEqual(await page.evaluate(() => new IntentRecommendations.Pagination().load(document.querySelector('#primary'))), {available: false, added: false});
    assert.deepEqual(await page.evaluate(() => extensionRequests), []); assert.deepEqual(await page.evaluate(() => accountReads), []);
    assert.deepEqual(network.filter(request => request.type !== 'image'), [], 'the module makes no page/API requests');
    assert.deepEqual(errors, []);
    console.log('PASS recommendations use loaded DOM/native controls only, without account globals, cookies, direct fetch/XHR or API traffic');
    await context.close();
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
