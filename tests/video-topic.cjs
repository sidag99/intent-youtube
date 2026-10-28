const {chromium} = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const initialId = 'abcdefghijk';
const fixture = `<!doctype html><html><head><meta charset="utf-8"></head><body><header id="masthead">YouTube</header><ytd-page-manager><ytd-watch-flexy video-id="${initialId}"><div id="primary"><ytd-player><video></video><button id="play-control">Play</button></ytd-player><ytd-watch-metadata><div id="title"><h1>A quiet way to build useful things</h1></div><div id="owner"><div id="channel-name"><a>Actual channel</a></div></div><div id="description-inline-expander"><span id="attributed-snippet-text">Actual description #SoftwareEngineering</span></div></ytd-watch-metadata></div><div id="secondary"><div id="related"><h2>Unrelated recommendations</h2><div id="description">This must never be sent as the playing video.</div></div></div></ytd-watch-flexy></ytd-page-manager><script id="player-data">var ytInitialPlayerResponse = ${JSON.stringify({videoDetails: {videoId: initialId, title: 'A quiet way to build useful things', author: 'Actual channel', shortDescription: 'A real description #SoftwareEngineering ' + 'x'.repeat(3000), keywords: Array.from({length: 40}, (_, i) => 'topic-' + i)}})};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({channel: 'chromium', headless: true});
  try {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}}); context.setDefaultTimeout(10000);
    const page = await context.newPage(), errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (route.request().isNavigationRequest()) return route.fulfill({contentType: 'text/html', body: fixture});
      network.push(route.request().url()); return route.abort();
    });
    await page.goto('https://www.youtube.com/watch?v=' + initialId);
    await page.addScriptTag({path: root + '/src/core.js'}); await page.addScriptTag({path: root + '/src/feed.js'});
    await page.evaluate(() => {
      window.topicSettings = IntentCore.defaults(); window.topicPaused = false; window.checks = []; window.listeners = []; window.timerStates = []; window.pendingChecks = []; window.deferIds = new Set(); window.failIds = new Set(); window.topicStatuses = {};
      window.snapshot = () => ({ok: true, settings: structuredClone(topicSettings), tabPaused: topicPaused, blocked: false, timerRunning: false, tabCounting: false, timerDay: '2026-10-25', timerUpdatedAt: Date.now(), remainingMs: 3600000});
      window.answer = message => ({...snapshot(), videoTopic: {videoId: message.video.id, status: topicStatuses[message.video.id]?.status || 'matching', categoryId: Object.hasOwn(topicStatuses[message.video.id] || {}, 'categoryId') ? topicStatuses[message.video.id].categoryId : topicSettings.mode, ...(topicStatuses[message.video.id]?.matchesIntent !== undefined ? {matchesIntent:topicStatuses[message.video.id].matchesIntent} : {}), ...(topicStatuses[message.video.id]?.includedChannel !== undefined ? {includedChannel:topicStatuses[message.video.id].includedChannel} : {}), ...(topicStatuses[message.video.id]?.categoryIds ? {categoryIds: topicStatuses[message.video.id].categoryIds} : {})}});
      window.chrome = {runtime: {getURL: name => 'https://extension.test/' + name, onMessage: {addListener: listener => listeners.push(listener)}, sendMessage: async message => {
        if (message.type !== 'CHECK_TIMER_VIDEO') return snapshot();
        checks.push(structuredClone(message));
        if (failIds.has(message.video.id)) throw new Error('Local model unavailable');
        if (deferIds.has(message.video.id)) return new Promise(resolve => pendingChecks.push({message, resolve}));
        return answer(message);
      }}};
      window.IntentHome = class {static theme() {return document.documentElement.hasAttribute('dark') ? 'dark' : 'light';} sync() {} destroy() {} updateTheme() {} refreshFeed() {}};
      window.IntentToolbar = class {sync() {} updateTheme() {} updateTimer(state) {timerStates.push(structuredClone(state));}};
      window.changeSettings = patch => {topicSettings = IntentCore.sanitize({...topicSettings, ...patch}); listeners.forEach(listener => listener({type: 'SETTINGS', settings: structuredClone(topicSettings), tabPaused: topicPaused}));};
      window.pauseTopic = paused => {topicPaused = paused; changeSettings({});};
      window.navigateVideo = (id, title = 'A new useful lesson') => {
        document.dispatchEvent(new Event('yt-navigate-start'));
        history.pushState({}, '', '/watch?v=' + id);
        document.querySelector('ytd-watch-flexy').setAttribute('video-id', id);
        document.querySelector('h1').textContent = title;
        document.querySelector('#player-data').textContent = 'var ytInitialPlayerResponse = ' + JSON.stringify({videoDetails: {videoId: id, title, author: 'Actual channel', shortDescription: 'The current video description #CurrentTopic', keywords: ['current']}}) + ';';
        document.dispatchEvent(new Event('yt-navigate-finish'));
      };
      window.resolveCheck = id => {const item = pendingChecks.find(item => item.message.video.id === id); if (!item) throw new Error('No pending check'); item.resolve(answer(item.message));};
    });
    await page.addStyleTag({path: root + '/src/content.css'}); await page.addScriptTag({path: root + '/src/content.js'});
    await page.locator('#intent-video-topic[data-state="matching"]').waitFor();
    assert.equal(await page.locator('#intent-video-topic').textContent(), 'Topic: Work');
    assert.equal(await page.locator('#intent-video-topic').evaluate(node => node.previousElementSibling.tagName), 'H1');
    assert.equal(await page.locator('ytd-player #intent-video-topic').count(), 0, 'the badge never overlays playback controls');
    assert.equal(await page.locator('#intent-video-topic').evaluate(node => getComputedStyle(node).position), 'static');
    assert.match(await page.locator('#intent-video-topic').getAttribute('title'), /match Work.*Local metadata estimate/);
    let checks = await page.evaluate(() => checks);
    assert.equal(checks.length, 1); assert.equal(checks[0].video.id, initialId); assert.equal(checks[0].video.title, 'A quiet way to build useful things');
    assert.equal(checks[0].video.channel, 'Actual channel'); assert.equal(checks[0].video.description.length, 1800); assert.equal(checks[0].video.keywords.length, 30);
    assert.ok(checks[0].video.hashtags.includes('Software Engineering')); assert.ok(!JSON.stringify(checks[0]).includes('Unrelated recommendations'));
    await page.evaluate(() => {document.body.append(document.createElement('aside')); document.querySelector('#description').textContent = 'Another recommended video';});
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => checks.length), 1, 'badge rendering and unrelated DOM mutations do not create a classification loop');
    await page.evaluate(() => document.documentElement.setAttribute('dark', ''));
    await page.waitForFunction(() => document.querySelector('#intent-video-topic')?.dataset.theme === 'dark');

    // SPA videos usually have no matching inline bootstrap. A negative result
    // must not reread all scripts for unrelated comment or recommendation changes.
    const missing = 'hhhhhhhhhhh';
    await page.evaluate(id => {
      window.topicScriptReads = 0;
      const script = document.querySelector('#player-data'), property = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
      Object.defineProperty(script, 'textContent', {configurable: true, get() {topicScriptReads++; return property.get.call(this);}, set(value) {property.set.call(this, value);}});
      window.navigateMissingBootstrap = currentId => {
        document.dispatchEvent(new Event('yt-navigate-start')); history.pushState({}, '', '/watch?v=' + currentId);
        document.querySelector('ytd-watch-flexy').setAttribute('video-id', currentId);
        document.querySelector('h1').textContent = 'A current native lesson';
        document.dispatchEvent(new Event('yt-navigate-finish'));
      };
      navigateMissingBootstrap(id);
    }, missing);
    await page.waitForFunction(id => checks.filter(item => item.video.id === id).length === 1, missing);
    await page.locator('#intent-video-topic[data-video-id="' + missing + '"][data-state="matching"]').waitFor();
    const readsAfterMiss = await page.evaluate(() => topicScriptReads);
    await page.evaluate(() => {const busy = document.createElement('aside'); busy.id = 'busy-native'; busy.textContent = 'A new comment'; document.body.append(busy);});
    for (let i = 0; i < 4; i++) {
      await page.evaluate(value => document.querySelector('#busy-native').textContent = 'Another comment ' + value, i);
      await page.waitForTimeout(150);
    }
    assert.equal(await page.evaluate(() => topicScriptReads), readsAfterMiss, 'unchanged missing inline metadata is cached across busy native DOM updates');
    assert.equal(await page.evaluate(id => checks.filter(item => item.video.id === id).length, missing), 1, 'unrelated mutations do not repeat topic checks');
    await page.evaluate(id => {
      const wrapper = document.createElement('div'), script = document.createElement('script'); script.id = 'late-player-json'; script.type = 'application/json';
      script.textContent = 'var ytInitialPlayerResponse = ' + JSON.stringify({videoDetails: {videoId: id, title: 'A current native lesson', shortDescription: 'Late bootstrap description #ExpandedTopic', author: 'Late actual channel', keywords: ['late']}}) + ';';
      wrapper.append(script); document.body.append(wrapper);
    }, missing);
    await page.waitForFunction(id => checks.filter(item => item.video.id === id).length === 2, missing);
    assert.equal(await page.evaluate(id => checks.filter(item => item.video.id === id).at(-1).video.description, missing), 'Late bootstrap description #ExpandedTopic', 'an appended wrapper containing player JSON invalidates the miss and enriches the current video');
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(id => checks.filter(item => item.video.id === id).length, missing), 2, 'late metadata triggers exactly one enriched check');
    const replaced = 'iiiiiiiiiii';
    await page.evaluate(id => navigateMissingBootstrap(id), replaced);
    await page.waitForFunction(id => checks.filter(item => item.video.id === id).length === 1, replaced);
    await page.evaluate(id => {
      document.querySelector('#late-player-json').textContent = 'var ytInitialPlayerResponse = ' + JSON.stringify({videoDetails: {videoId: id, title: 'A current native lesson', shortDescription: 'Replacement player description', author: 'Actual replacement channel', keywords: ['replaced']}}) + ';';
    }, replaced);
    await page.waitForFunction(id => checks.filter(item => item.video.id === id).length === 2, replaced);
    assert.equal(await page.evaluate(id => checks.filter(item => item.video.id === id).at(-1).video.description, replaced), 'Replacement player description', 'replacing script text also invalidates an earlier inline metadata miss');
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(id => checks.filter(item => item.video.id === id).length, replaced), 2);

    const old = 'lmnopqrstuv', next = 'bbbbbbbbbbb';
    await page.evaluate(id => {deferIds.add(id); navigateVideo(id, 'An ambiguous old video');}, old);
    await page.waitForFunction(id => pendingChecks.some(item => item.message.video.id === id), old);
    await page.evaluate(() => document.dispatchEvent(new Event('yt-navigate-start')));
    assert.equal(await page.locator('#intent-video-topic').count(), 0, 'SPA navigation removes the old topic immediately');
    await page.evaluate(id => {topicStatuses[id] = {status: 'unrelated', categoryId: 'music'}; navigateVideo(id, 'Late night jazz performance');}, next);
    await page.locator('#intent-video-topic[data-video-id="' + next + '"][data-state="unrelated"]').waitFor();
    assert.equal(await page.locator('#intent-video-topic').textContent(), 'Music · Outside Work');
    await page.evaluate(id => resolveCheck(id), old); await page.waitForTimeout(180);
    assert.equal(await page.locator('#intent-video-topic').getAttribute('data-video-id'), next, 'late checks cannot label a different playing video');

    const pausedId = 'ccccccccccc';
    await page.evaluate(id => {deferIds.add(id); navigateVideo(id);}, pausedId);
    await page.waitForFunction(id => pendingChecks.some(item => item.message.video.id === id), pausedId);
    await page.evaluate(() => pauseTopic(true));
    assert.equal(await page.locator('#intent-video-topic').count(), 0);
    await page.evaluate(id => resolveCheck(id), pausedId); await page.waitForTimeout(180);
    assert.equal(await page.locator('#intent-video-topic').count(), 0, 'a check completed after Pause remains hidden');
    await page.evaluate(() => {pauseTopic(false); changeSettings({mode: 'off'});});
    const offCount = await page.evaluate(() => checks.length); await page.waitForTimeout(600);
    assert.equal(await page.locator('#intent-video-topic').count(), 0); assert.equal(await page.evaluate(() => checks.length), offCount, 'Off does not launch topic inference');

    const changed = 'ddddddddddd';
    await page.evaluate(id => {changeSettings({mode: 'work'}); deferIds.add(id); navigateVideo(id);}, changed);
    await page.waitForFunction(id => pendingChecks.some(item => item.message.video.id === id), changed);
    await page.evaluate(() => {deferIds.delete('ddddddddddd'); changeSettings({mode: 'study', intentNames: {study: '<b>Study</b>'}});});
    await page.waitForFunction(() => document.querySelector('#intent-video-topic')?.textContent === 'Topic: <b>Study</b>');
    assert.equal(await page.locator('#intent-video-topic b').count(), 0, 'custom category labels are text, never HTML');
    await page.evaluate(id => resolveCheck(id), changed); await page.waitForTimeout(180);
    assert.equal(await page.locator('#intent-video-topic').textContent(), 'Topic: <b>Study</b>', 'an obsolete settings response cannot replace the newer topic');

    const unsure = 'ggggggggggg';
    await page.evaluate(id => {topicStatuses[id] = {status: 'uncertain', categoryId: 'work'}; navigateVideo(id, 'A topic with an uncertain relation');}, unsure);
    await page.locator('#intent-video-topic[data-video-id="' + unsure + '"][data-state="uncertain"]').waitFor();
    assert.equal(await page.locator('#intent-video-topic').textContent(), 'Likely Work', 'the category label is separate from uncertainty about its timer relation');
    assert.match(await page.locator('#intent-video-topic').getAttribute('title'), /relation to <b>Study<\/b> is uncertain/);
    const overlap = 'hhhhhhhhhhh';
    await page.evaluate(id => {topicStatuses[id] = {status: 'uncertain', categoryIds: ['study','work']}; navigateVideo(id, 'A computer science and software lesson');}, overlap);
    await page.locator('#intent-video-topic[data-video-id="' + overlap + '"][data-state="uncertain"]').waitFor();
    assert.equal(await page.locator('#intent-video-topic').textContent(), 'Likely <b>Study</b> · Work');assert.equal(await page.locator('#intent-video-topic b').count(),0);
    assert.match(await page.locator('#intent-video-topic').getAttribute('title'),/Several configured topics overlap/);

    const acceptedUncertain='jjjjjjjjjjj';
    await page.evaluate(id=>{topicStatuses[id]={status:'uncertain',categoryId:null,categoryIds:[],matchesIntent:true};navigateVideo(id,'A corroborated academic lesson');},acceptedUncertain);
    await page.locator('#intent-video-topic[data-video-id="'+acceptedUncertain+'"][data-state="uncertain"]').waitFor();
    assert.equal(await page.locator('#intent-video-topic').textContent(),'Likely <b>Study</b>','a supported intent match is distinguished from an unknown strongest category');
    const included='kkkkkkkkkkk';
    await page.evaluate(id=>{topicStatuses[id]={status:'uncertain',categoryId:null,categoryIds:[],matchesIntent:false,includedChannel:true};navigateVideo(id,'An explicitly included channel video');},included);
    await page.locator('#intent-video-topic[data-video-id="'+included+'"][data-state="uncertain"]').waitFor();
    assert.equal(await page.locator('#intent-video-topic').textContent(),'Included channel · Topic uncertain');
    assert.match(await page.locator('#intent-video-topic').getAttribute('title'),/always include this channel/,'channel overrides are explicit rather than implying a topic match');

    const failed = 'eeeeeeeeeee';
    await page.evaluate(id => {failIds.add(id); navigateVideo(id);}, failed);
    await page.locator('#intent-video-topic[data-state="unavailable"]').waitFor();
    assert.match(await page.locator('#intent-video-topic').textContent(), /^Topic unavailable/);
    const failedChecks = await page.evaluate(id=>checks.filter(item=>item.video.id===id).length,failed);
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(id=>checks.filter(item=>item.video.id===id).length,failed),failedChecks,'an inference error is operational unavailability and never an automatic retry loop');
    await page.evaluate(id=>failIds.delete(id),failed);
    await page.getByRole('button',{name:'Retry topic check',exact:true}).click();
    await page.locator('#intent-video-topic[data-video-id="'+failed+'"][data-state="matching"]').waitFor();
    assert.equal(await page.evaluate(id=>checks.filter(item=>item.video.id===id).length,failed),failedChecks+1);assert.equal(await page.getByRole('button',{name:'Retry topic check',exact:true}).count(),0,'successful explicit retry replaces the unavailable state');

    const shortId = 'fffffffffff';
    await page.evaluate(id => {
      changeSettings({mode: 'work', hideShorts: true});
      document.dispatchEvent(new Event('yt-navigate-start')); history.pushState({}, '', '/shorts/' + id);
      document.querySelector('ytd-watch-flexy').setAttribute('hidden', '');
      document.querySelector('ytd-page-manager').insertAdjacentHTML('beforeend', '<ytd-shorts><ytd-reel-video-renderer is-active video-id="' + id + '"><h2 id="title">A short lesson</h2><video></video></ytd-reel-video-renderer></ytd-shorts>');
      document.dispatchEvent(new Event('yt-navigate-finish'));
    }, shortId);
    const beforeShorts = await page.evaluate(() => checks.length); await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => checks.length), beforeShorts); assert.equal(await page.locator('#intent-video-topic').count(), 0, 'blocked Shorts are not analysed');
    await page.evaluate(() => changeSettings({hideShorts: false}));
    await page.locator('#intent-video-topic[data-video-id="' + shortId + '"]').waitFor();
    await page.waitForFunction(id => checks.some(item => item.video.id === id), shortId);
    assert.equal(await page.locator('ytd-reel-video-renderer #intent-video-topic').count(), 1, 'allowed Shorts use their active native title');
    await page.evaluate(() => {document.dispatchEvent(new Event('yt-navigate-start')); history.pushState({}, '', '/results?search_query=topic'); document.dispatchEvent(new Event('yt-navigate-finish'));});
    assert.equal(await page.locator('#intent-video-topic').count(), 0, 'other pages never retain the prior topic tag');
    assert.deepEqual(network, [], 'topic checks require no page fetches or model downloads'); assert.deepEqual(errors, []);
    console.log('PASS current-video topic metadata and native-title badge, separate overlap display/timer relation, bounded/no-network checks, unavailable/retry recovery, no render loop, SPA/settings/Pause/Off stale protection and allowed Shorts');
    await context.close();
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
