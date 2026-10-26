const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({channel: 'chromium', headless: true});
  const errors = [], requests = [];
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (route.request().resourceType() === 'document') return route.fulfill({contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><main id="native-list"><span id="before">Before</span><span id="after">After</span></main><section id="intent-home-feed"></section><section id="intent-watch-feed"></section>'});
      requests.push(route.request().url()); return route.abort();
    });
    await page.goto('https://www.youtube.com/');
    await page.evaluate(() => {
      window.forbiddenReads = []; window.networkCalls = [];
      for (const key of ['ytcfg', 'ytInitialData', 'ytInitialPlayerResponse', 'chrome']) Object.defineProperty(window, key, {configurable: true, get() {forbiddenReads.push(key); throw new Error('Native cards cannot read account or extension APIs');}});
      Object.defineProperty(document, 'cookie', {configurable: true, get() {forbiddenReads.push('cookie'); throw new Error('Native cards cannot read cookies');}});
      window.fetch = (...args) => {networkCalls.push(['fetch', ...args.map(String)]); throw new Error('Unexpected network access');};
      window.XMLHttpRequest = class {open(...args) {networkCalls.push(['xhr', ...args.map(String)]); throw new Error('Unexpected network access');}};
      window.video = {id: 'V0000000001', title: 'Understanding derivatives', channel: '数学の時間', duration: '10:42', metadata: '１２万回視聴 · ２日前', thumbnail: 'https://i.ytimg.com/vi/V0000000001/hqdefault.jpg', shorts: false,channelThumbnail:'https://yt3.ggpht.com/public-avatar=s68',movingThumbnail:'https://i.ytimg.com/an_webp/V0000000001/mqdefault_6s.webp?public=1'};
      window.makeCard = (host, label) => {
        const shadow = host.shadowRoot || host.attachShadow({mode: 'open'});
        const card = document.createElement('article'); card.className = 'card';
        const fallback = document.createElement('a'); fallback.href = '/watch?v=V0000000001'; fallback.textContent = label;
        const details = document.createElement('div'); details.textContent = 'Fallback details';
        card.append(fallback, details); shadow.append(card); return card;
      };
      window.styleSnapshot = node => Object.fromEntries([...node.style].sort().map(key => [key, [node.style.getPropertyValue(key), node.style.getPropertyPriority(key)]]));
      window.afterNativeFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    });
    await page.addStyleTag({path:path.join(root,'src/content.css')});
    await page.addScriptTag({path: path.join(root, 'src/native-cards.js')});
    const unsupported = await page.evaluate(() => {
      window.homeHost = document.querySelector('#intent-home-feed');
      window.homeCards = new IntentNativeCards(homeHost, 'home');
      window.initialCard = makeCard(homeHost, 'Initial fallback'); homeCards.enhance(initialCard, video);
      const entry = homeCards.entries.get(video.id);
      return {visible: [...initialCard.children].every(child => !child.hidden), children: entry.node.childElementCount, requested: entry.node.hasAttribute('data-intent-native-request'), ready: initialCard.hasAttribute('data-native-card-ready')};
    });
    assert.deepEqual(unsupported, {visible: true, children: 0, requested: false, ready: false}, 'normal links stay available before native YouTube components exist');

    // These stand-ins expose the data contract and object identity; they do not
    // pretend to implement YouTube's real player or hover controllers.
    await page.evaluate(() => {
      window.nativeWrites = []; window.failNativeData = false; window.silentNativeData = false; window.deferNativeData = false;
      const nativeClass = () => class extends HTMLElement {
        constructor() {super(); this.controller = {hoverPreference: 'native', activations: 0}; this.dataWrites = 0;}
        set data(value) {
          if (failNativeData) throw new Error('Native component rejected data');
          this.dataWrites++; this.receivedData = value; this.initializationParent = this.parentElement; nativeWrites.push(this.localName);
          if (silentNativeData) return;
          const data = value.content?.videoRenderer || value, title = document.createElement('h3'), link = document.createElement('a');
          link.href = '/watch?v=' + data.videoId; link.textContent = data.title.simpleText; title.append(link); this.replaceChildren(title);
          if (deferNativeData) {this.replaceChildren(); this.finishNativeRender = () => this.replaceChildren(title);}
        }
      };
      customElements.define('ytd-rich-item-renderer', nativeClass());
      customElements.define('ytd-compact-video-renderer', nativeClass());
      window.componentsReadyCount = 0;
      document.addEventListener('intent-native-components-ready', () => componentsReadyCount++);
    });
    await page.addScriptTag({path: path.join(root, 'src/native-renderer.js')});
    await page.waitForFunction(() => initialCard.hasAttribute('data-native-card-ready'));
    assert.equal(await page.evaluate(() => componentsReadyCount), 1, 'already registered native components publish one initial readiness event; resolved whenDefined promises do not duplicate it');
    const generated = await page.evaluate(() => {
      const entry = homeCards.entries.get(video.id), native = entry.node.firstElementChild;
      return {tag: native.localName, data: native.receivedData, writes: native.dataWrites, fallbackHidden: [...initialCard.children].filter(child => child !== entry.slot).every(child => child.hidden), assigned: entry.slot.assignedElements()[0] === entry.node, rendered: entry.node.hasAttribute('data-intent-native-rendered'), requestRemoved: !entry.node.hasAttribute('data-intent-native-request')};
    });
    assert.equal(generated.tag, 'ytd-rich-item-renderer'); assert.equal(generated.writes, 1);
    assert.equal(generated.fallbackHidden, true); assert.equal(generated.assigned, true); assert.equal(generated.rendered, true); assert.equal(generated.requestRemoved, true);
    const generatedData = generated.data.content.videoRenderer;
    assert.equal(generatedData.title.simpleText, 'Understanding derivatives');
    assert.equal(generatedData.ownerText.runs[0].text, '数学の時間');
    assert.equal(generatedData.viewCountText.simpleText, '１２万回視聴'); assert.equal(generatedData.publishedTimeText.simpleText, '２日前');
    assert.equal(generatedData.navigationEndpoint.commandMetadata.webCommandMetadata.url, '/watch?v=V0000000001');
    assert.deepEqual(generatedData.inlinePlaybackEndpoint,generatedData.navigationEndpoint);
    assert.equal(generatedData.showActionMenu, false);
    assert.equal(generatedData.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer.thumbnail.thumbnails[0].url,'https://yt3.ggpht.com/public-avatar=s68');
    assert.equal(generatedData.richThumbnail.movingThumbnailRenderer.movingThumbnailDetails.thumbnails[0].url,'https://i.ytimg.com/an_webp/V0000000001/mqdefault_6s.webp?public=1');
    console.log('PASS fallback links remain usable until native components become available; generated home cards receive bounded native data through light-DOM slots');

    const preserved = await page.evaluate(() => {
      const owner = document.querySelector('#native-list');
      window.original = document.createElement('ytd-rich-item-renderer'); original.id = 'original';
      original.style.cssText = 'display:inline-flex!important;width:77%;min-width:31px;max-width:900px!important;margin:7px 9px;color:rgb(20,30,40)';
      original.setAttribute('aria-label', 'YouTube original recommendation');
      original.innerHTML = '<button>Native hover preference</button>';
      window.controllerReference = original.controller; window.originalClicks = 0;
      original.addEventListener('click', () => {originalClicks++; original.controller.activations++;});
      owner.insertBefore(original, document.querySelector('#after'));
      window.originalStyles = styleSnapshot(original);
      const card = makeCard(homeHost, 'Original fallback'), model = {...video, id: 'O0000000002'};
      homeCards.enhance(card, model, original);
      const entry = homeCards.entries.get(model.id);
      original.querySelector('button').click();
      const during = {sameNode: entry.node.firstElementChild === original, sameController: original.controller === controllerReference, originalWrites: original.dataWrites, clicks: originalClicks, activations: controllerReference.activations, slot: entry.slot.assignedElements()[0] === entry.node, placeholder: owner.childNodes[1].nodeType === Node.COMMENT_NODE, sameCard: homeCards.get(model, original) === card, aria: original.getAttribute('aria-label')};
      homeCards.reset();
      original.querySelector('button').click();
      return {during, restored: {sameNode: document.querySelector('#original') === original, sameController: original.controller === controllerReference, order: [...owner.children].map(node => node.id), styles: styleSnapshot(original), expectedStyles: originalStyles, clicks: originalClicks, activations: controllerReference.activations, wrappers: homeHost.querySelectorAll('[data-intent-native-card]').length, entries: homeCards.entries.size}};
    });
    assert.deepEqual(preserved.during, {sameNode: true, sameController: true, originalWrites: 0, clicks: 1, activations: 1, slot: true, placeholder: true, sameCard: true, aria: 'YouTube original recommendation'});
    assert.equal(preserved.restored.sameNode, true); assert.equal(preserved.restored.sameController, true);
    assert.deepEqual(preserved.restored.order, ['before', 'original', 'after']); assert.deepEqual(preserved.restored.styles, preserved.restored.expectedStyles);
    assert.equal(preserved.restored.clicks, 2); assert.equal(preserved.restored.activations, 2); assert.equal(preserved.restored.wrappers, 0); assert.equal(preserved.restored.entries, 0);

    const upgraded = await page.evaluate(async () => {
      const model = {...video, id: 'U0000000003'}, card = makeCard(homeHost, 'Discovery fallback');
      homeCards.enhance(card, model);
      await afterNativeFrames();
      const generated = homeCards.entries.get(model.id).node.firstElementChild;
      const original = document.createElement('ytd-rich-item-renderer'); original.id = 'upgraded-original';
      document.querySelector('#native-list').append(original);
      const stable = homeCards.get(model, original) === card;
      const moved = homeCards.entries.get(model.id).node.firstElementChild === original;
      homeCards.reset();
      const noStyle = !original.hasAttribute('style'), restored = original.parentElement.id === 'native-list';
      const removed = document.createElement('ytd-rich-item-renderer'); document.querySelector('#native-list').append(removed);
      homeCards.enhance(makeCard(homeHost, 'Detached source'), {...video, id: 'D0000000004'}, removed);
      homeCards.entries.get('D0000000004').original.placeholder.remove();
      homeCards.reset();
      return {stable, moved, generatedDetached: !generated.isConnected, noStyle, restored, detachedPlaceholderSafe: !removed.isConnected};
    });
    assert.deepEqual(upgraded, {stable: true, moved: true, generatedDetached: true, noStyle: true, restored: true, detachedPlaceholderSafe: true});
    console.log('PASS original native nodes, controller identity, listeners and sibling position survive filtering, cached upgrades and exact style restoration');

    const watchSize=await page.evaluate(()=>{const host=document.querySelector('#intent-watch-feed');host.style.setProperty('--intent-watch-thumbnail-width','196px');const native=document.createElement('ytd-compact-video-renderer');native.setAttribute('data-intent-created-card','');const thumbnail=document.createElement('ytd-thumbnail');thumbnail.style.cssText='display:block;width:168px;height:94px';native.append(thumbnail);host.append(native);const size={width:thumbnail.getBoundingClientRect().width,height:thumbnail.getBoundingClientRect().height};native.remove();return size;});
    assert.deepEqual(watchSize,{width:196,height:110.25},'generated compact cards follow the page measured native thumbnail size');

    const failed = await page.evaluate(async () => {
      window.watchHost = document.querySelector('#intent-watch-feed'); window.watchCards = new IntentNativeCards(watchHost, 'watch');
      window.watchCard = makeCard(watchHost, 'Watch fallback'); window.watchVideo = {...video, id: 'W0000000005'};
      failNativeData = true; watchCards.enhance(watchCard, watchVideo);
      await afterNativeFrames();
      const entry = watchCards.entries.get(watchVideo.id);
      const result = {fallbackVisible: !watchCard.firstElementChild.hidden, ready: watchCard.hasAttribute('data-native-card-ready'), requestRemoved: !entry.node.hasAttribute('data-intent-native-request'), failed: entry.node.hasAttribute('data-intent-native-failed'), noLeakedStage: document.querySelectorAll('[data-intent-native-staging]').length === 0};
      failNativeData = false; document.dispatchEvent(new Event('intent-native-components-ready'));
      await afterNativeFrames();
      const noAutomaticRetry = !watchCard.hasAttribute('data-native-card-ready') && entry.node.childElementCount === 0;
      watchCards.reset(); watchCard = makeCard(watchHost, 'Watch fallback after restart'); watchCards.enhance(watchCard, watchVideo);
      await afterNativeFrames();
      const restarted = watchCards.entries.get(watchVideo.id);
      return {...result, noAutomaticRetry, restarted: watchCard.hasAttribute('data-native-card-ready'), tag: restarted.node.firstElementChild.localName, data: restarted.node.firstElementChild.receivedData};
    });
    assert.equal(failed.fallbackVisible, true); assert.equal(failed.ready, false); assert.equal(failed.requestRemoved, true); assert.equal(failed.failed, true); assert.equal(failed.noLeakedStage, true, 'a throwing native data setter immediately disposes its hidden staging surface'); assert.equal(failed.noAutomaticRetry, true); assert.equal(failed.restarted, true);
    assert.equal(failed.tag, 'ytd-compact-video-renderer'); assert.equal(failed.data.videoId, 'W0000000005'); assert.equal(failed.data.content, undefined);
    const shortsAndDestroy = await page.evaluate(() => {
      const card = makeCard(watchHost, 'Shorts use their own card'); const before = watchHost.querySelectorAll('[data-intent-native-card]').length;
      watchCards.enhance(card, {...video, id: 'S0000000006', shorts: true});
      const shorts = {wrappersUnchanged: watchHost.querySelectorAll('[data-intent-native-card]').length === before, noEntry: !watchCards.entries.has('S0000000006'), noSlot: !card.querySelector('slot'), fallbackVisible: !card.firstElementChild.hidden};
      let flushes = 0; watchCards.flush = () => {flushes++;}; watchCards.destroy();
      document.dispatchEvent(new Event('intent-native-components-ready'));
      return {...shorts, flushes, remaining: watchHost.querySelectorAll('[data-intent-native-card]').length};
    });
    assert.deepEqual(shortsAndDestroy, {wrappersUnchanged: true, noEntry: true, noSlot: true, fallbackVisible: true, flushes: 0, remaining: 0});
    console.log('PASS failed native renderers retain the accessible fallback without retry loops, recover after restart, and clean up; Shorts stay separate');

    const staging = await page.evaluate(() => {
      window.deferredCard = makeCard(homeHost, 'Loading native renderer'); window.deferredVideo = {...video, id: 'D0000000009'};
      deferNativeData = true; homeCards.enhance(deferredCard, deferredVideo); deferNativeData = false;
      window.deferredEntry = homeCards.entries.get(deferredVideo.id);
      window.stagedNative = document.querySelector('[data-intent-native-staging] ytd-rich-item-renderer');
      window.stagedController = stagedNative.controller;
      const stage = stagedNative.parentElement, style = getComputedStyle(stage), link = document.createElement('a'); link.href = '#'; stage.append(link); link.focus();
      const result = {fallbackVisible: !deferredCard.firstElementChild.hidden, notRevealed: !deferredCard.hasAttribute('data-native-card-ready'), emptySlot: deferredEntry.node.childElementCount === 0, stagedOutsideSlot: stage.parentElement === document.body, visibility: style.visibility, pointerEvents: style.pointerEvents, inert: stage.inert, aria: stage.getAttribute('aria-hidden'), cannotFocus: document.activeElement !== link};
      stagedNative.finishNativeRender();
      return result;
    });
    assert.deepEqual(staging, {fallbackVisible: true, notRevealed: true, emptySlot: true, stagedOutsideSlot: true, visibility: 'hidden', pointerEvents: 'none', inert: true, aria: 'true', cannotFocus: true});
    await page.waitForFunction(() => deferredCard.hasAttribute('data-native-card-ready'));
    assert.deepEqual(await page.evaluate(() => ({sameNode: deferredEntry.node.firstElementChild === stagedNative, sameController: stagedNative.controller === stagedController, initializedInStage: stagedNative.initializationParent.hasAttribute('data-intent-native-staging'), stageRemoved: !stagedNative.initializationParent.isConnected, fallbackHidden: deferredCard.firstElementChild.hidden, stageCount: document.querySelectorAll('[data-intent-native-staging]').length})), {sameNode: true, sameController: true, initializedInStage: true, stageRemoved: true, fallbackHidden: true, stageCount: 0});

    await page.evaluate(() => {
      silentNativeData = true; window.silentCard = makeCard(homeHost, 'Usable fallback after timeout');
      homeCards.enhance(silentCard, {...video, id: 'T0000000010'}); silentNativeData = false;
    });
    assert.equal(await page.locator('[data-intent-native-staging]').count(), 1);
    await page.waitForFunction(() => !document.querySelector('[data-intent-native-staging]'));
    assert.deepEqual(await page.evaluate(() => ({fallbackVisible: !silentCard.firstElementChild.hidden, notReady: !silentCard.hasAttribute('data-native-card-ready'), slotEmpty: homeCards.entries.get('T0000000010').node.childElementCount === 0})), {fallbackVisible: true, notReady: true, slotEmpty: true}, 'silent native render failures leave a usable fallback instead of an empty native card');
    console.log('PASS native staging remains hidden and inert until real title/link readiness, moves the same controller into the slot, and times out to the fallback');

    const invalid = await page.evaluate(() => {
      const requests = ['{', '', 'x'.repeat(10001), 'null', '[]', JSON.stringify({...video, id: 'bad-id'}), JSON.stringify({...video, id: 12345678901}), JSON.stringify({...video, id: ['V0000000001']}), JSON.stringify({...video, title: '   '}), JSON.stringify({...video, title: {text: 'Not a string'}}), JSON.stringify({...video, shorts: true})];
      const cases = requests.map(raw => {
        const host = document.createElement('div'); homeHost.append(host); host.setAttribute('data-intent-native-request', raw);
        host.dispatchEvent(new Event('intent-render-native-card', {bubbles: true}));
        return !host.hasAttribute('data-intent-native-rendered') && host.childElementCount === 0;
      });
      const outside = document.createElement('div'); document.body.append(outside); outside.setAttribute('data-intent-native-request', JSON.stringify(video));
      outside.dispatchEvent(new Event('intent-render-native-card', {bubbles: true}));
      return {cases, outsideUntouched: outside.childElementCount === 0};
    });
    assert.equal(invalid.cases.every(Boolean), true); assert.equal(invalid.outsideUntouched, true);
    const sanitized = await page.evaluate(async () => {
      window.bridgeRender = async overrides => {
        const host = document.createElement('div'); homeHost.append(host);
        host.setAttribute('data-intent-native-request', JSON.stringify({...video, ...overrides}));
        host.dispatchEvent(new Event('intent-render-native-card', {bubbles: true}));
        await afterNativeFrames();
        return host.firstElementChild?.receivedData?.content.videoRenderer;
      };
      const thumbnails = await Promise.all(['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'https://i.ytimg.com.evil.test/image.jpg', 'http://i.ytimg.com/image.jpg', 'https://user:pass@i.ytimg.com/image.jpg', 'https://i.ytimg.com:444/image.jpg'].map(async thumbnail => (await bridgeRender({thumbnail})).thumbnail.thumbnails[0].url));
      const hostile = await bridgeRender({title: '<img src=x onerror="window.executed=true">', channel: 'C'.repeat(400), duration: 'D'.repeat(100), metadata: 'M'.repeat(400), navigationEndpoint: {url: 'javascript:alert(1)'}, thumbnail: 'https://i.ytimg.com/vi/safe.jpg'});
      const capped = await bridgeRender({title: 'T'.repeat(700)});
      const badArtwork=await bridgeRender({channelThumbnail:'https://yt3.ggpht.com.evil.test/avatar',movingThumbnail:'https://i.ytimg.com/an_webp/different12/preview.webp',richThumbnail:{unsafe:true}});
      return {badArtwork,thumbnails, hostile, cappedTitleLength: capped.title.simpleText.length, executed: !!window.executed};
    });
    assert.deepEqual(sanitized.thumbnails, Array(6).fill('https://i.ytimg.com/vi/V0000000001/hqdefault.jpg'));
    assert.equal(sanitized.badArtwork.channelThumbnailSupportedRenderers,undefined);assert.equal(sanitized.badArtwork.richThumbnail,undefined);
    assert.equal(sanitized.hostile.title.simpleText, '<img src=x onerror="window.executed=true">');
    assert.equal(sanitized.hostile.ownerText.runs[0].text.length, 200); assert.equal(sanitized.hostile.lengthText.simpleText.length, 30); assert.equal(sanitized.hostile.viewCountText.simpleText.length, 120); assert.equal(sanitized.cappedTitleLength, 500);
    assert.equal(sanitized.hostile.navigationEndpoint.commandMetadata.webCommandMetadata.url, '/watch?v=V0000000001'); assert.equal(sanitized.executed, false);
    assert.equal(sanitized.hostile.thumbnail.thumbnails[0].url, 'https://i.ytimg.com/vi/safe.jpg');

    await page.addScriptTag({path: path.join(root, 'src/native-renderer.js')});
    const reinstalled = await page.evaluate(async () => {
      let readyEvents = 0; const count = () => {readyEvents++;}; homeHost.addEventListener('intent-native-card-ready', count);
      await bridgeRender({id: 'I0000000007'}); homeHost.removeEventListener('intent-native-card-ready', count);
      document.dispatchEvent(new Event('intent-native-renderer-dispose'));
      const stopped = await bridgeRender({id: 'E0000000008'}) === undefined;
      homeCards.destroy();
      return {readyEvents, stopped};
    });
    assert.deepEqual(reinstalled, {readyEvents: 1, stopped: true}, 'reinjection replaces the page bridge and explicit disposal stops rendering');

    await page.addScriptTag({path: path.join(root, 'src/native-renderer.js')});
    const disposal = await page.evaluate(() => {
      const host = document.createElement('div'); homeHost.append(host); host.setAttribute('data-intent-native-request', JSON.stringify({...video, id: 'X0000000011'}));
      deferNativeData = true; host.dispatchEvent(new Event('intent-render-native-card', {bubbles: true})); deferNativeData = false;
      const native = document.querySelector('[data-intent-native-staging] ytd-rich-item-renderer');
      const stagedBefore = !!native; let readyEvents = 0; host.addEventListener('intent-native-card-ready', () => readyEvents++);
      document.dispatchEvent(new Event('intent-native-renderer-dispose'));
      native.finishNativeRender();
      return {stagedBefore, noStages: !document.querySelector('[data-intent-native-staging]'), detached: !native.isConnected, slotEmpty: host.childElementCount === 0, readyEvents};
    });
    assert.deepEqual(disposal, {stagedBefore: true, noStages: true, detached: true, slotEmpty: true, readyEvents: 0}, 'disposing a pending adapter removes staging and prevents late native readiness');

    const outsidePage = await context.newPage();
    await outsidePage.route('**/*', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><div id="intent-home-feed"><div id="request"></div></div>'}));
    await outsidePage.goto('https://youtube.com.evil.test/');
    await outsidePage.addScriptTag({path: path.join(root, 'src/native-renderer.js')});
    assert.equal(await outsidePage.evaluate(() => document.documentElement.hasAttribute('data-intent-native-components')), false, 'the page-world adapter does not initialize on a YouTube-lookalike origin');
    await outsidePage.close();
    await page.evaluate(() => {const frame = document.createElement('iframe'); frame.id = 'nested-frame'; frame.srcdoc = '<!doctype html><div id="intent-home-feed"></div>'; document.body.append(frame);});
    const frame = await page.locator('#nested-frame').elementHandle().then(handle => handle.contentFrame());
    await frame.waitForSelector('#intent-home-feed', {state: 'attached'});
    await frame.addScriptTag({path: path.join(root, 'src/native-renderer.js')});
    assert.equal(await frame.evaluate(() => document.documentElement.hasAttribute('data-intent-native-components')), false, 'same-origin nested frames cannot initialize the top-level bridge');
    assert.deepEqual(await page.evaluate(() => forbiddenReads), []); assert.deepEqual(await page.evaluate(() => networkCalls), []); assert.deepEqual(requests, []); assert.deepEqual(errors, []);
    console.log('PASS page bridge validates scope, IDs, lengths and image origins; ignores supplied endpoints; no account, extension API or network access');

    // Use the real feed lifecycle, rather than constructing NativeCards directly:
    // Home retains its detached host after Off/Pause and must recreate its manager.
    const lifecycle = await context.newPage(), lifecycleErrors = [];
    lifecycle.setDefaultTimeout(5000); lifecycle.on('pageerror', error => lifecycleErrors.push(error.message));
    await lifecycle.route('**/*', route => route.fulfill(route.request().resourceType() === 'image'
      ? {contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"/>'}
      : {contentType: 'text/html', body: '<!doctype html><html lang="en"><meta charset="utf-8"><style>body{margin:0}ytd-masthead{display:block;height:56px}ytd-browse,ytd-watch-flexy,ytd-rich-grid-renderer,ytd-watch-next-secondary-results-renderer{display:block}#primary{width:1000px}#related{width:400px}</style><ytd-masthead></ytd-masthead><ytd-browse page-subtype="home"><main id="primary"><ytd-rich-grid-renderer id="home-native-owner" style="--ytd-rich-grid-items-per-row:3"><span id="home-before"></span><span id="home-after"></span></ytd-rich-grid-renderer></main></ytd-browse><ytd-watch-flexy><div id="secondary"><main id="related"><ytd-watch-next-secondary-results-renderer id="watch-native-owner"><span id="watch-before"></span><span id="watch-after"></span></ytd-watch-next-secondary-results-renderer></main></div></ytd-watch-flexy>'}));
    await lifecycle.goto('https://www.youtube.com/');
    await lifecycle.evaluate(() => {
      const nativeClass = () => class extends HTMLElement {
        constructor() {super(); this.controller = {clicks: 0}; this.dataWrites = 0;}
        set data(payload) {
          this.dataWrites++; this.receivedData = payload;
          const video = payload.content?.videoRenderer || payload, title = document.createElement('h3'), link = document.createElement('a');
          link.href = '/watch?v=' + video.videoId; link.id = 'video-title'; link.textContent = video.title.simpleText; title.append(link); this.replaceChildren(title);
        }
      };
      customElements.define('ytd-rich-item-renderer', nativeClass()); customElements.define('ytd-compact-video-renderer', nativeClass());
      window.originalSources = {}; window.originalControllers = {}; window.originalStyles = {};
      window.captureStyle = node => Object.fromEntries([...node.style].sort().map(key => [key, [node.style.getPropertyValue(key), node.style.getPropertyPriority(key)]]));
      for (const [surface, tag, id] of [['home', 'ytd-rich-item-renderer', 'H0000000020'], ['watch', 'ytd-compact-video-renderer', 'W0000000021']]) {
        const node = document.createElement(tag); node.id = surface + '-original';
        node.style.cssText = 'display:inline-block!important;width:85%;margin:3px;min-width:21px;max-width:700px!important';
        node.innerHTML = `<a href="/watch?v=${id}"><h3 id="video-title">Python programming workshop</h3></a><div id="channel-name">Workshop North</div>`;
        node.addEventListener('click', () => node.controller.clicks++);
        document.querySelector('#' + surface + '-native-owner').insertBefore(node, document.querySelector('#' + surface + '-after'));
        originalSources[surface] = node; originalControllers[surface] = node.controller; originalStyles[surface] = captureStyle(node);
      }
    });
    for (const name of ['core.js', 'feed.js', 'feed-theme.js', 'recommendations.js', 'native-cards.js', 'native-renderer.js', 'home.js']) await lifecycle.addScriptTag({path: path.join(root, 'src', name)});
    await lifecycle.evaluate(() => {
      window.settings = IntentCore.sanitize({metadataLimit: 0}); window.feedInstances = {}; window.oldHosts = {}; window.oldManagers = {};
      for (const [surface, discoveryId] of [['home', 'D0000000022'], ['watch', 'D0000000023']]) {
        feedInstances[surface] = new IntentHome({sendMessage: async message => {
          if (message.type === 'FILTER_RECOMMENDATIONS') return {ok: true, key: message.key, items: message.videos};
          if (message.type === 'GET_FEED') return {ok: true, key: message.key, semantic: true, items: [{id: discoveryId, title: 'Python programming discovery lesson', channel: 'Discovery Studio', duration: '12:30', thumbnail: 'https://i.ytimg.com/vi/' + discoveryId + '/hqdefault.jpg', shorts: false}], hasMore: false, nextCursor: 1};
          return {ok: true};
        }}, surface);
      }
    });
    for (const surface of ['home', 'watch']) {
      await lifecycle.evaluate(surface => history.replaceState({}, '', surface === 'home' ? '/' : '/watch?v=C0000000024'), surface);
      for (const reason of ['off', 'pause', 'pause', 'off']) {
        const identities = await lifecycle.evaluate(surface => {
          const feed = feedInstances[surface], previousHost = oldHosts[surface], previousManager = oldManagers[surface];
          feed.sync(settings, true);
          oldHosts[surface] = feed.host; oldManagers[surface] = feed.nativeCards;
          return {hostReused: !previousHost || previousHost === feed.host, managerRecreated: !previousManager || previousManager !== feed.nativeCards, managerExists: !!feed.nativeCards};
        }, surface);
        assert.deepEqual(identities, {hostReused: true, managerRecreated: true, managerExists: true}, `${surface} ${reason}: a reused host gets a fresh native-card manager`);
        await lifecycle.waitForFunction(surface => {
          const feed = feedInstances[surface];
          return !feed.busy && feed.recommendedItems.length === 1 && feed.items.length === 1 && feed.nativeCards.entries.size === 2 && [...feed.nativeCards.entries.values()].every(entry => entry.card.hasAttribute('data-native-card-ready'));
        }, surface);
        const on = await lifecycle.evaluate(surface => {
          const feed = feedInstances[surface], source = originalSources[surface];
          source.click();
          const originalEntry = [...feed.nativeCards.entries.values()].find(entry => entry.original?.node === source);
          const generatedEntry = [...feed.nativeCards.entries.values()].find(entry => !entry.original);
          return {connected: feed.host.isConnected, originalMoved: originalEntry?.node.firstElementChild === source, sameController: source.controller === originalControllers[surface], originalDataWrites: source.dataWrites, generatedTag: generatedEntry.node.firstElementChild.localName, nativeReadyCount: feed.host.shadowRoot.querySelectorAll('.card[data-native-card-ready]').length, noStages: !document.querySelector('[data-intent-native-staging]')};
        }, surface);
        assert.deepEqual(on, {connected: true, originalMoved: true, sameController: true, originalDataWrites: 0, generatedTag: surface === 'home' ? 'ytd-rich-item-renderer' : 'ytd-compact-video-renderer', nativeReadyCount: 2, noStages: true}, `${surface} ${reason}: original and discovery native cards render after activation`);
        const off = await lifecycle.evaluate(({surface, reason}) => {
          const feed = feedInstances[surface];
          if (reason === 'off') feed.sync({...settings, mode: 'off'}, true); else feed.sync(settings, false);
          const source = originalSources[surface];
          return {hostDetached: !feed.host.isConnected, managerRemoved: feed.nativeCards === null, restored: source.parentElement.id === surface + '-native-owner', sameController: source.controller === originalControllers[surface], style: captureStyle(source), expectedStyle: originalStyles[surface], order: [...source.parentElement.children].map(node => node.id), noWrappers: !feed.host.querySelector('[data-intent-native-card]'), noStages: !document.querySelector('[data-intent-native-staging]')};
        }, {surface, reason});
        assert.equal(off.hostDetached, true); assert.equal(off.managerRemoved, true); assert.equal(off.restored, true); assert.equal(off.sameController, true); assert.deepEqual(off.style, off.expectedStyle);
        assert.deepEqual(off.order, [surface + '-before', surface + '-original', surface + '-after']); assert.equal(off.noWrappers, true); assert.equal(off.noStages, true);
      }
      assert.equal(await lifecycle.evaluate(surface => originalControllers[surface].clicks, surface), 4, 'native click handlers survive every activation and restore');
    }
    assert.deepEqual(lifecycleErrors, []); await lifecycle.close();
    console.log('PASS real Home/watch sync lifecycle recreates native managers after Off and repeated Pause, reuses hosts and restores original controllers/styles/order');
    await context.close();
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
