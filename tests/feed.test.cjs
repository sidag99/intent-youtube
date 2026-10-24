const {test} = require('node:test');
const assert = require('node:assert/strict');
require('../src/core.js'); require('../src/feed.js');
const C = IntentCore, F = IntentFeed;
const renderer = (id, title, extra = {}) => ({videoRenderer: {videoId: id, title: {runs: [{text: title}]}, ownerText: {runs: [{text: 'Studio North'}]}, thumbnail: {thumbnails: [{url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`}]}, ...extra}});
const page = entries => `<script>var ytInitialData = ${JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: [{itemSectionRenderer: {contents: entries}}]}}}}})};</script>`;
const shortRenderer = (id, title, extra = {}) => ({shortsLockupViewModel: {onTap: {innertubeCommand: {reelWatchEndpoint: {videoId: id}, commandMetadata: {webCommandMetadata: {url: `/shorts/${id}`}}}}, accessibilityText: `${title}, 12 thousand views - play Short`, overlayMetadata: {primaryText: {content: title}, secondaryText: {content: '12K views'}}, thumbnailViewModel: {thumbnailViewModel: {image: {sources: [{url: `https://i.ytimg.com/vi/${id}/oardefault.jpg`, width: 405, height: 720}]}}}, ...extra}});
test('search parsing reads balanced JSON without evaluating scripts', () => {
  const html = page([renderer('abcdefghijk', 'Python {"guide"} \\ café')]) + '<script>globalThis.feedScriptExecuted = true</script>';
  const videos = F.extract(html);
  assert.equal(videos.length, 1); assert.equal(videos[0].title, 'Python {"guide"} \\ café');
  assert.equal(globalThis.feedScriptExecuted, undefined);
  assert.equal(F.extract(html.replace('var ytInitialData', 'window["ytInitialData"]')).length, 1);
});
test('parsing excludes ads, duplicate IDs, playlists and unrelated sidebars', () => {
  const duplicate = renderer('abcdefghijk', 'Python tutorial');
  const entries = [duplicate, duplicate, {adSlotRenderer: {content: renderer('bbbbbbbbbbb', 'Python ad')}}, {lockupViewModel: {contentId: 'PLabcdefghijk', contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST'}}, renderer('bad/id', 'Bad identifier')];
  assert.deepEqual(F.extract(page(entries)).map(v => v.id), ['abcdefghijk']);
});
test('modern video lockups and safe thumbnail fallbacks are supported', () => {
  const entries = [{lockupViewModel: {contentId: 'abcdefghijk', contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', metadata: {lockupMetadataViewModel: {title: {content: 'Design a calmer workspace'}, metadata: {contentMetadataViewModel: {metadataRows: [{metadataParts: [{text: {content: 'Studio North'}}]}]}}}}, contentImage: {thumbnailViewModel: {image: {sources: [{url: 'https://tracking.evil.test/image'}]}}}}}];
  const item = F.extract(page(entries))[0];
  assert.equal(item.channel, 'Studio North'); assert.equal(item.thumbnail, 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
});
test('legacy and modern Shorts shelves are parsed with titles, endpoints and portrait thumbnails', () => {
  const entries = [{reelShelfRenderer: {items: [
    {reelItemRenderer: {videoId: 'aaaaaaaaaaa', headline: {simpleText: 'Python programming in a minute'}, viewCountText: {simpleText: '4K views'}, ownerText: {simpleText: 'Code Studio'}, thumbnail: {thumbnails: [{url: 'https://i.ytimg.com/vi/aaaaaaaaaaa/frame0.jpg'}]}}},
    shortRenderer('bbbbbbbbbbb', 'Build a tiny useful tool #SoftwareEngineering'),
    {shortsLockupViewModelV2: {onTap: {innertubeCommand: {commandMetadata: {webCommandMetadata: {url: '/shorts/ccccccccccc?feature=share'}}}}, title: {content: 'Python data structures'}, thumbnail: {sources: [{url: 'https://tracker.example/portrait.jpg'}]}}},
    shortRenderer('ddddddddddd', 'Physics explained', {overlayMetadata: undefined}),
    {shortsLockupViewModel: {onTap: {innertubeCommand: {commandMetadata: {webCommandMetadata: {url: 'https://evil.example/shorts/eeeeeeeeeee'}}}}, title: {content: 'External link'}}},
    {shortsLockupViewModel: {onTap: {innertubeCommand: {reelWatchEndpoint: {videoId: 'bad/id'}}}, title: {content: 'Invalid'}}}
  ]}}];
  const videos = F.extract(page(entries));
  assert.deepEqual(videos.map(v => v.id), ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd']);
  assert.ok(videos.every(v => v.shorts));
  assert.equal(videos[0].channel, 'Code Studio'); assert.equal(videos[0].metadata, '4K views');
  assert.equal(videos[1].thumbnail, 'https://i.ytimg.com/vi/bbbbbbbbbbb/oardefault.jpg');
  assert.deepEqual(videos[1].hashtags, ['Software Engineering']);
  assert.equal(videos[2].thumbnail, 'https://i.ytimg.com/vi/ccccccccccc/hqdefault.jpg');
  assert.equal(videos[3].title, 'Physics explained', 'accessibility text supplies a missing title');
});
test('turning Hide Shorts off admits matching Shorts from cached searches while retaining intent and distraction rules', async () => {
  let calls = 0;
  const judged = [];
  const service = F.createService({fetcher: async url => {
    calls++;
    return {ok: true, url, text: async () => page([{reelShelfRenderer: {items: [
      shortRenderer('aaaaaaaaaaa', 'Ship a useful app this weekend'),
      shortRenderer('bbbbbbbbbbb', 'Sunday football highlights'),
      shortRenderer('ccccccccccc', 'You won’t believe this Python trick!!!'),
      shortRenderer('ddddddddddd', 'Spoilers from a programming project')
    ]}}])};
  }, judge: async videos => {
    judged.push(...videos.map(v => v.id));
    return videos.map(v => ({accepted: v.id === 'aaaaaaaaaaa', uncertain: false}));
  }});
  const settings = {...C.defaults(), blockedTerms: 'spoilers'};
  assert.deepEqual((await service.get(settings)).items, []);
  assert.deepEqual(judged, [], 'hidden Shorts never reach topic inference');
  const visible = await service.get({...settings, hideShorts: false});
  assert.deepEqual(visible.items.map(v => v.id), ['aaaaaaaaaaa']);
  assert.ok(visible.items[0].shorts); assert.equal(visible.semantic, true);
  assert.deepEqual(judged, ['aaaaaaaaaaa', 'bbbbbbbbbbb'], 'clickbait and blocked Shorts remain excluded before inference');
  assert.equal(calls, 2, 'changing the toggle reuses parsed results without losing Shorts');
  assert.deepEqual((await service.get(settings)).items, [], 'turning the rule back on hides Shorts again');
});
test('consent pages, changed layouts and oversized results fail explicitly', () => {
  for (const html of ['<html>Before you continue</html>', '<script>var ytInitialData = {"contents":{"unknown":{}}};</script>', 'x'.repeat(8000001)]) assert.throws(() => F.extract(html));
});
test('mode searches include custom topics and rotate on refresh; budget changes do not reset the feed', () => {
  const s = C.defaults(); s.customTopics.work = 'robotics'; s.channels.work = 'Studio North';
  assert.deepEqual(F.queries(s).slice(0, 2), ['robotics', 'studio north']);
  assert.notDeepEqual(F.queries(s), F.queries(s, 1));
  assert.equal(F.key(s), F.key({...s, dailyMinutes: 20, countPlayback: false}));
  assert.notEqual(F.key(s), F.key({...s, mode: 'study'}));
});
test('explicit intent descriptions replace broad searches and invalidate cached feed identity', () => {
  const s = C.sanitize({mode: 'study', intentDescriptions: {study: 'European contract law, legal case analysis'}, customTopics: {study: 'civil procedure'}, channels: {study: 'Law School'}});
  assert.deepEqual(F.queries(s), ['civil procedure', 'law school', 'European contract law', 'legal case analysis']);
  assert.ok(F.queries(s).every(q => !['science explained', 'university lecture', 'math lesson'].includes(q)));
  assert.notEqual(F.key(s), F.key({...s, intentDescriptions: {...s.intentDescriptions, study: 'organic chemistry'}}));
  const id = 'custom-law';
  const custom = C.sanitize({mode: id, customIntents: {[id]: {name: 'Law', description: 'European contract law'}}, customTopics: {[id]: 'case studies'}});
  assert.deepEqual(F.queries(custom), ['case studies', 'European contract law']);
  assert.notEqual(F.key(custom), F.key({...custom, customIntents: {[id]: {name: 'Law', description: 'criminal law'}}}));
  assert.notEqual(F.key(custom), F.key({...custom, customIntents: {[id]: {name: 'Legal studies', description: 'European contract law'}}}));
});
test('feed batches fetch only bounded YouTube searches, omit cookies and reuse cache', async () => {
  const calls = [];
  const service = F.createService({fetcher: async (url, options) => {
    calls.push({url, options});
    return {ok: true, url, text: async () => page([renderer('abcdefghijk', 'A better way', {detailedMetadataSnippets: [{snippetText: {runs: [{text: 'A software engineering tutorial'}]}}]}), renderer('bbbbbbbbbbb', 'You won’t believe this Python tutorial!!!'), renderer('ccccccccccc', 'Football highlights')])};
  }});
  const first = await service.get(C.defaults());
  assert.deepEqual(first.items.map(v => v.id), ['abcdefghijk']);
  assert.equal(first.nextCursor, 2); assert.equal(first.hasMore, true);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => new URL(c.url).origin === 'https://www.youtube.com' && new URL(c.url).pathname === '/results' && c.options.credentials === 'omit'));
  await service.get(C.defaults()); assert.equal(calls.length, 2);
  const excluded = await service.get(C.defaults(), {exclude: ['abcdefghijk']}); assert.equal(excluded.items.length, 0);
  await service.get(C.defaults(), {fresh: true}); assert.equal(calls.length, 4);
});
test('a partially failed search keeps usable results, and total failure is actionable', async () => {
  let count = 0;
  const service = F.createService({fetcher: async url => {
    if (count++ === 0) throw new Error('Network unavailable');
    return {ok: true, url, text: async () => page([renderer('abcdefghijk', 'Python tutorial')])};
  }});
  const result = await service.get(C.defaults()); assert.equal(result.items.length, 1); assert.match(result.warning, /unavailable/);
  const failing = F.createService({fetcher: async () => {throw new Error('Network unavailable');}});
  await assert.rejects(failing.get(C.defaults()), /Network unavailable/);
});
test('simultaneous feeds share in-flight fetches rather than multiplying requests', async () => {
  let calls = 0, release;
  const gate = new Promise(resolve => {release = resolve;});
  const service = F.createService({fetcher: async url => {calls++; await gate; return {ok: true, url, text: async () => page([renderer('abcdefghijk', 'Python tutorial')])};}});
  const jobs = [service.get(C.defaults()), service.get(C.defaults())]; release(); await Promise.all(jobs);
  assert.equal(calls, 2);
});
test('description hashtags and video tags are read without executing the watch page', () => {
  const html = '<script>var ytInitialPlayerResponse = '+JSON.stringify({videoDetails: {videoId:'abcdefghijk',title:'An ordinary afternoon',shortDescription:'An explanation of light. #OpticalPhysics #wave_motion',keywords:['scattering','sunlight']}})+';</script><script>throw new Error("never execute")</script>';
  const info=F.watchMetadata(html,'abcdefghijk');
  assert.deepEqual(info.hashtags,['Optical Physics','wave motion']);assert.deepEqual(info.keywords,['scattering','sunlight']);
  assert.throws(()=>F.watchMetadata(html,'zzzzzzzzzzz'));
});
test('semantic judging can admit a paraphrase and enrich an uncertain title with its full description', async () => {
  let watchRequests=0, judgingPasses=0;
  const service=F.createService({fetcher:async url=>{
    if(new URL(url).pathname==='/watch'){
      watchRequests++;
      return {ok:true,url,text:async()=>'<script>var ytInitialPlayerResponse = '+JSON.stringify({videoDetails:{videoId:'abcdefghijk',shortDescription:'Organizing client deliverables and a practical daily routine. #ProfessionalSkills',keywords:['project planning']}})+';</script>'};
    }
    return {ok:true,url,text:async()=>page([renderer('abcdefghijk','Make room for what matters')])};
  },judge:async videos=>{
    judgingPasses++;
    return videos.map(v=>({accepted:Boolean(v.keywords?.includes('project planning')),uncertain:!v.keywords}));
  }});
  const result=await service.get(C.defaults());
  assert.equal(result.semantic,true);assert.equal(result.items.length,1);assert.equal(watchRequests,1);assert.equal(judgingPasses,2);
  assert.equal(C.classify(result.items[0],C.defaults()).visible,false,'semantic acceptance is not re-filtered by exact keywords');
});

function metadataHarness({count = 18, initialAccepted = true, initialConfident = 0, acceptEnriched = true, delay = 0, fail = [], beforeWatch, afterJudge, now} = {}) {
  const ids = Array.from({length: count}, (_, n) => 'm' + String(n).padStart(10, '0'));
  const watches = []; let active = 0, peak = 0;
  const service = F.createService({now, fetcher: async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname !== '/watch') return {ok: true, url, text: async () => page(ids.map((id, n) => renderer(id, 'A useful project ' + (n + 1))))};
    const id = parsed.searchParams.get('v'); watches.push({id, options}); active++; peak = Math.max(peak, active);
    try {
      if (beforeWatch) await beforeWatch(id);
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (fail.includes(id)) throw new Error('Full description unavailable');
      return {ok: true, url, text: async () => '<script>var ytInitialPlayerResponse = ' + JSON.stringify({videoDetails: {videoId: id, shortDescription: 'A fuller explanation of practical project planning.', keywords: ['full']}}) + ';</script>'};
    } finally { active--; }
  }, judge: async videos => {
    const decisions = videos.map(video => video.keywords?.includes('full') ? {accepted: acceptEnriched, uncertain: false} : {accepted: initialAccepted || ids.indexOf(video.id) < initialConfident, uncertain: ids.indexOf(video.id) >= initialConfident});
    if (videos.some(video => video.keywords?.includes('full')) && afterJudge) afterJudge();
    return decisions;
  }});
  return {service, ids, watches, peak: () => peak};
}
const stats = (limit, uncertain, checked, requests = checked, extra = {}) => ({limit, uncertain, checked, requests, cacheHits: 0, sharedRequests: 0, failed: 0, remaining: uncertain - checked, ...extra});

test('metadata caps 0, 4, 8 and a custom limit bound checks and extra watch requests in groups of four', async () => {
  for (const limit of [0, 4, 8, 7]) {
    const h = metadataHarness({delay: 2});
    const result = await h.service.get({...C.defaults(), metadataLimit: limit});
    assert.deepEqual(result.metadataStats, stats(limit, 18, limit));
    assert.equal(h.watches.length, limit); assert.ok(h.peak() <= 4);
    if (limit >= 4) assert.equal(h.peak(), 4);
    assert.equal(result.items.length, 18, 'unchecked ambiguous acceptances keep their original decision');
    assert.ok(h.watches.every(({options}) => options.credentials === 'omit' && options.cache === 'no-store' && options.signal instanceof AbortSignal));
  }
  assert.notEqual(F.key(C.defaults()), F.key({...C.defaults(), metadataLimit: 8}), 'changing the cap rebuilds the feed');
});
test('enrichment stops after enough confident matches, including matches present before the fuller checks', async () => {
  const h = metadataHarness({count: 24, initialAccepted: true});
  const enriched = await h.service.get({...C.defaults(), metadataLimit: 40});
  assert.deepEqual(enriched.metadataStats, stats(40, 24, 12));
  assert.equal(h.watches.length, 12, 'ambiguous accepted matches do not cause an immediate early stop');
  const enough = metadataHarness({count: 20, initialConfident: 12});
  assert.deepEqual((await enough.service.get({...C.defaults(), metadataLimit: 40})).metadataStats, stats(40, 8, 0));
  const nearly = metadataHarness({count: 18, initialConfident: 10});
  assert.deepEqual((await nearly.service.get({...C.defaults(), metadataLimit: 40})).metadataStats, stats(40, 8, 4));
});
test('the maximum cap still bounds requests when fuller descriptions produce no confident matches', async () => {
  const h = metadataHarness({count: 45, initialAccepted: false, acceptEnriched: false, delay: 1});
  const result = await h.service.get({...C.defaults(), metadataLimit: 40});
  assert.deepEqual(result.metadataStats, stats(40, 45, 40));
  assert.equal(h.watches.length, 40); assert.equal(h.peak(), 4); assert.equal(result.items.length, 0);
});
test('warm fuller-metadata cache is reused for a day and reported separately from new requests', async () => {
  let clock = Date.now();
  const h = metadataHarness({count: 10, now: () => clock});
  const settings = {...C.defaults(), metadataLimit: 8};
  assert.deepEqual((await h.service.get(settings)).metadataStats, stats(8, 10, 8));
  assert.deepEqual((await h.service.get(settings)).metadataStats, stats(8, 10, 8, 0, {cacheHits: 8}));
  assert.equal(h.watches.length, 8);
  clock += 86400001;
  assert.deepEqual((await h.service.get(settings)).metadataStats, stats(8, 10, 8));
  assert.equal(h.watches.length, 16);
});
test('concurrent tab feeds share in-flight full descriptions and charge new requests only to their initiator', async () => {
  let release, started;
  const gate = new Promise(resolve => {release = resolve;});
  const active = new Promise(resolve => {started = resolve;});
  let attempts = 0;
  const h = metadataHarness({count: 4, beforeWatch: async () => {if (++attempts === 4) started(); await gate;}});
  const first = h.service.get(C.defaults()), second = h.service.get(C.defaults());
  await active;
  // Both feeds have already entered their first group, so the second can join
  // existing requests before they resolve and become cache entries.
  await new Promise(resolve => setImmediate(resolve)); release();
  const results = await Promise.all([first, second]);
  assert.equal(h.watches.length, 4); assert.equal(h.peak(), 4);
  assert.deepEqual(results.map(result => result.metadataStats.requests).sort((a, b) => a - b), [0, 4]);
  assert.deepEqual(results.map(result => result.metadataStats.sharedRequests).sort((a, b) => a - b), [0, 4]);
  for (const result of results) {assert.equal(result.metadataStats.checked, 4); assert.equal(result.metadataStats.cacheHits, 0); assert.equal(result.metadataStats.failed, 0);}
});
test('failed fuller requests are counted once and leave initial decisions in place without automatic retries', async () => {
  const h = metadataHarness({count: 6, fail: ['m0000000000', 'm0000000002']});
  const result = await h.service.get(C.defaults());
  assert.deepEqual(result.metadataStats, stats(4, 6, 4, 4, {failed: 2}));
  assert.equal(new Set(h.watches.map(watch => watch.id)).size, 4);
  assert.equal(result.items.length, 6, 'failed and capped candidates retain initial accepted decisions');
});
test('the overall enrichment deadline stops additional groups and preserves initial decisions', async () => {
  let clock = Date.now();
  const h = metadataHarness({count: 20, initialAccepted: false, now: () => clock, afterJudge: () => {clock += 45001;}});
  const result = await h.service.get({...C.defaults(), metadataLimit: 40});
  assert.deepEqual(result.metadataStats, stats(40, 20, 4));
  assert.equal(h.watches.length, 4); assert.equal(result.items.length, 0);
});
test('a paused feed stops after shared searches without starting model or fuller checks', async () => {
  let active = true, judged = 0, searched = 0;
  const service = F.createService({fetcher: async url => {
    searched++; active = false;
    return {ok: true, url, text: async () => page([renderer('abcdefghijk', 'Python tutorial')])};
  }, judge: async videos => {judged++; return videos.map(() => ({accepted: true, uncertain: true}));}});
  await assert.rejects(service.get(C.defaults(), {isActive: () => active}), /paused or this feed is no longer active/);
  assert.equal(searched, 2); assert.equal(judged, 0);
  await assert.rejects(service.get(C.defaults(), {isActive: () => false}), /paused/);
  assert.equal(searched, 2, 'an already paused feed starts no requests');
});
test('pausing during fuller checks stops further groups and model calls without disrupting shared metadata', async () => {
  let active = true, calls = 0;
  const h = metadataHarness({count: 20, initialAccepted: false, beforeWatch: async () => {calls++; active = false;}});
  await assert.rejects(h.service.get({...C.defaults(), metadataLimit: 40}, {isActive: () => active}), /paused/);
  assert.equal(calls, 4, 'only the already dispatched group finishes');
  const resumed = await h.service.get({...C.defaults(), metadataLimit: 4}, {isActive: () => true});
  assert.equal(resumed.metadataStats.cacheHits, 4, 'other active feeds can reuse completed shared checks');
  assert.equal(calls, 4);
});
