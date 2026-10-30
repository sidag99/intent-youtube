const {test} = require('node:test');
const assert = require('node:assert/strict');
require('../src/core.js'); require('../src/feed.js');
const C = IntentCore, F = IntentFeed;
test('generic-only custom descriptions request a subject without searching a publisher name or invoking the model',async()=>{
 for(const description of ['stuff','Interesting stuff to learn.']){
  const settings=C.sanitize({mode:'custom-vague',customIntents:{'custom-vague':{name:'Test',description}}});assert.ok(C.descriptionIssue(description));assert.deepEqual(F.queries(settings),[]);
  const service=F.createService({fetcher:async()=>{throw Error('must not fetch');},judge:async()=>{throw Error('must not infer');}});const result=await service.get(settings);assert.equal(result.needsDescription,true);assert.deepEqual(result.items,[]);assert.equal(result.hasMore,false);assert.match(result.warning,/subject/);
 }
 for(const description of ['Chess','German','Python tutorials','Languages, culture and communication.'])assert.equal(C.descriptionIssue(description),'',description);
});
test('403 discovery failures are actionable and do not auto-retry or discard the existing page cursor',async()=>{
 let requests=0;const service=F.createService({fetcher:async()=>{requests++;return{ok:false,status:403};}});
 await assert.rejects(service.get(C.defaults()),/YouTube declined this search \(403\).*later.*YouTube search/);assert.equal(requests,2);
});
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

test('real-video previews include rejected distractions, classify at most 24 candidates and never fetch fuller metadata', async () => {
  const calls = [], judged = [];
  const entries = Array.from({length: 30}, (_, n) => renderer('p' + String(n).padStart(10, '0'), n === 0 ? 'Make room for what matters' : n === 11 ? 'You won’t believe this workflow!!!' : n === 12 ? 'Spoilers from the studio' : n === 13 ? 'Football on Sunday' : `A quiet project ${n}`, n === 10 ? {navigationEndpoint: {commandMetadata: {webCommandMetadata: {url: '/shorts/p0000000010'}}}} : {}));
  const settings = {...C.defaults(), metadataLimit: 40, blockedTerms: 'spoilers'};
  const service = F.createService({fetcher: async (url, options) => {calls.push({url, options}); return {ok: true, url, text: async () => page(entries)};}, judge: async (videos, config) => {
    assert.equal(config.metadataLimit, 0); judged.push(...videos);
    return videos.map(video => ({accepted: Number(video.id.slice(1)) < 10, uncertain: true}));
  }});
  const result = await service.get(settings, {preview: true});
  assert.equal(result.semantic, true); assert.equal(result.items, undefined); assert.equal(judged.length, 24);
  assert.equal(result.previewItems.length, 12); assert.equal(result.previewItems.filter(item => item.accepted).length, 8);
  assert.equal(result.previewItems.find(item => item.video.id === 'p0000000010').reason, 'shorts');
  assert.equal(result.previewItems.find(item => item.video.id === 'p0000000011').reason, 'clickbait');
  assert.equal(result.previewItems.find(item => item.video.id === 'p0000000012').reason, 'blocked term');
  assert.equal(result.previewItems.find(item => item.video.id === 'p0000000013').reason, 'Outside intent');
  assert.equal(result.previewItems[0].video.title, 'Make room for what matters'); assert.equal(result.previewItems[0].reason, 'Matches intent');
  assert.equal(C.classify(result.previewItems[0].video, settings).visible, false, 'semantic acceptance does not depend on literal keywords');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => new URL(call.url).origin === 'https://www.youtube.com' && new URL(call.url).pathname === '/results' && call.options.credentials === 'omit'));
});
test('preview selection fills available slots honestly when all candidates share one outcome and labels channel exceptions', async () => {
  const videos = Array.from({length: 16}, (_, n) => renderer('q' + String(n).padStart(10, '0'), 'An ordinary afternoon ' + n));
  for (const accepted of [true, false]) {
    const service = F.createService({fetcher: async url => ({ok: true, url, text: async () => page(videos)}), judge: async entries => entries.map(() => ({accepted, uncertain: false}))});
    const settings = C.sanitize({channels: {work: 'Studio North'}});
    const preview = await service.get(settings, {preview: true});
    assert.equal(preview.previewItems.length, 12); assert.equal(new Set(preview.previewItems.map(item => item.video.id)).size, 12);
    assert.ok(preview.previewItems.every(item => item.accepted === accepted && item.reason === (accepted ? 'Included channel' : 'Outside intent')));
  }
});
test('normal feeds keep distraction filtering and do not include preview-only rejected cards', async () => {
  const service = F.createService({fetcher: async url => ({ok: true, url, text: async () => page([renderer('abcdefghijk', 'Python programming'), shortRenderer('bbbbbbbbbbb', 'Python programming short'), renderer('ccccccccccc', 'You won’t believe this Python trick!!!')])}), judge: async videos => videos.map(() => ({accepted: true, uncertain: false}))});
  const normal = await service.get(C.defaults());
  assert.deepEqual(normal.items.map(video => video.id), ['abcdefghijk']); assert.equal(normal.previewItems, undefined);
});


test('locale codes are bounded, canonical and restricted to public language/region parameters', () => {
  assert.deepEqual(F.normalizeLocale(), {hl: 'en'});
  assert.deepEqual(F.normalizeLocale({hl: 'EN-gb', gl: 'gb'}), {hl: 'en-GB', gl: 'GB'});
  assert.deepEqual(F.normalizeLocale({hl: 'en-in', gl: 'in', url: 'https://evil.example/'}), {hl: 'en-IN', gl: 'IN'});
  assert.deepEqual(F.normalizeLocale({hl: 'zh-hant', gl: 'tw'}), {hl: 'zh-Hant', gl: 'TW'});
  for (const hl of ['', null, true, 'en&gl=IN', 'en_US', 'a'.repeat(100), 'en-invalid-toolongsubtag']) assert.equal(F.normalizeLocale({hl}).hl, 'en');
  for (const gl of ['', null, true, 'IND', 'IN&hl=hi', '../', '123']) assert.equal(F.normalizeLocale({gl}).gl, undefined);
  assert.equal(F.key(C.defaults()), F.key(C.defaults(), {hl: 'en'}), 'old callers and English page fallbacks share one key');
  assert.notEqual(F.key(C.defaults(), {hl: 'en-GB', gl: 'GB'}), F.key(C.defaults(), {hl: 'en-IN', gl: 'IN'}));
});
const localeDocument = (lang, texts) => ({documentElement: {lang}, scripts: texts.map(textContent => ({textContent}))});
test('YouTube locale follows the live document language and safely falls back to bootstrap JSON', () => {
  const escaped = 'globalThis.localeScriptExecuted = true; ytcfg.set(' + JSON.stringify({HL: 'en', GL: 'US', text: 'brace } and escaped " quote'}) + ');';
  assert.deepEqual(F.pageLocale(localeDocument('', [escaped])), {hl: 'en', gl: 'US'}, 'quoted braces and escaped quotes are balanced as JSON');
  const doc = localeDocument('', [escaped,
    'ytcfg.set({"INNERTUBE_CONTEXT":{"client":{"hl":"en-GB","gl":"GB"}},"HL":"hi","GL":"IN"});'
  ]);
  assert.deepEqual(F.pageLocale(doc), {hl: 'en-GB', gl: 'GB'});
  assert.equal(globalThis.localeScriptExecuted, undefined);
  assert.deepEqual(F.pageLocale(localeDocument('en-IN', ['ytcfg.set({"HL":"en-IN","GL":"IN"});'])), {hl: 'en-IN', gl: 'IN'});
  assert.deepEqual(F.pageLocale(localeDocument('de-DE', ['ytcfg.set({notJSON: true}); ytcfg.set({"GL":"DE"});'])), {hl: 'de-DE', gl: 'DE'});
  assert.deepEqual(F.pageLocale(localeDocument('fr', ['ytcfg.set({"HL":"en&gl=IN","GL":"IN/US"});'])), {hl: 'fr'});
  assert.deepEqual(F.pageLocale(localeDocument('ja', [])), {hl: 'ja'});
  assert.deepEqual(F.pageLocale(undefined), {hl: 'en'});
  assert.deepEqual(F.pageLocale(localeDocument('en&gl=IN', [escaped])), {hl: 'en', gl: 'US'}, 'invalid document languages retain a valid bootstrap fallback');
  assert.deepEqual(F.pageLocale(localeDocument('', ['ytcfg.set({"HL":"en-invalid-toolongsubtag","GL":"DE"});'])), {hl: 'en', gl: 'DE'});
  const switched = localeDocument('en-IN', ['ytcfg.set({"HL":"en-IN","GL":"IN","INNERTUBE_CONTEXT":{"client":{"hl":"en-IN","gl":"IN"}}});']);
  assert.deepEqual(F.pageLocale(switched), {hl: 'en-IN', gl: 'IN'});
  const oldKey = F.key(C.defaults(), F.pageLocale(switched));
  switched.documentElement.lang = 'en-GB';
  assert.deepEqual(F.pageLocale(switched), {hl: 'en-GB', gl: 'IN'}, 'a native language switch wins over stale initial-page scripts without guessing another country');
  assert.notEqual(F.key(C.defaults(), F.pageLocale(switched)), oldKey, 'the language switch invalidates regional search results and continuation state');
});
test('search requests follow the native YouTube locale and isolate regional search caches without extra requests', async () => {
  const calls = [];
  const service = F.createService({fetcher: async (url, options) => {
    calls.push({url, options});
    const language = new URL(url).searchParams.get('hl');
    const viewText = language === 'en-IN' ? '39 lakh views' : language === 'de' ? '3,9 Mio. Aufrufe' : '3.9M views';
    return {ok: true, url, text: async () => page([renderer('abcdefghijk', 'Python programming', {shortViewCountText: {simpleText: viewText}, publishedTimeText: {simpleText: '2 years ago'}, lengthText: {simpleText: '12:35'}})])};
  }});
  const settings = C.defaults(), british = {hl: 'en-GB', gl: 'GB'}, indian = {hl: 'en-IN', gl: 'IN'}, german = {hl: 'de', gl: 'DE'};
  const gb = await service.get(settings, {locale: british});
  assert.equal(calls.length, 2); assert.equal(gb.items[0].metadata, '3.9M views · 2 years ago'); assert.equal(gb.key, F.key(settings, british));
  await service.get(settings, {locale: british}); assert.equal(calls.length, 2, 'the same locale reuses both searches');
  const india = await service.get(settings, {locale: indian});
  assert.equal(calls.length, 4); assert.equal(india.items[0].metadata, '39 lakh views · 2 years ago', 'regional units stay exactly as YouTube returned them');
  assert.equal(india.items[0].duration, '12:35'); assert.equal(india.key, F.key(settings, indian));
  const de = await service.get(settings, {locale: german});
  assert.equal(calls.length, 6); assert.equal(de.items[0].metadata, '3,9 Mio. Aufrufe · 2 years ago');
  await service.get(settings, {locale: british}); assert.equal(calls.length, 6, 'a different region does not evict or overwrite a warm locale');
  for (const [i, locale] of [british, indian, german].entries()) for (const call of calls.slice(i * 2, i * 2 + 2)) {
    const url = new URL(call.url); assert.equal(url.origin, 'https://www.youtube.com'); assert.equal(url.pathname, '/results');
    assert.equal(url.searchParams.get('hl'), locale.hl); assert.equal(url.searchParams.get('gl'), locale.gl); assert.equal(call.options.headers['Accept-Language'], locale.hl); assert.equal(call.options.credentials, 'omit');
  }
});
test('an updated native English language retains its India content region while replacing stale lakh-formatted search caches', async () => {
  const doc = localeDocument('en-IN', ['ytcfg.set({"INNERTUBE_CONTEXT":{"client":{"hl":"en-IN","gl":"IN"}}});']);
  let calls = 0;
  const service = F.createService({fetcher: async url => {
    calls++; const request = new URL(url);
    assert.equal(request.searchParams.get('gl'), 'IN');
    const views = request.searchParams.get('hl') === 'en-IN' ? '2.6 crore views' : '26m views';
    return {ok: true, url, text: async () => page([renderer('abcdefghijk', 'Python programming', {shortViewCountText: {simpleText: views}, publishedTimeText: {simpleText: '2 years ago'}, lengthText: {simpleText: '12:35'}})])};
  }});
  const settings = C.defaults();
  assert.equal((await service.get(settings, {locale: F.pageLocale(doc)})).items[0].metadata, '2.6 crore views · 2 years ago');
  doc.documentElement.lang = 'en-GB';
  const british = await service.get(settings, {locale: F.pageLocale(doc)});
  assert.equal(british.items[0].metadata, '26m views · 2 years ago'); assert.equal(british.items[0].duration, '12:35'); assert.equal(calls, 4);
  await service.get(settings, {locale: F.pageLocale(doc)}); assert.equal(calls, 4, 'the corrected language uses its own warm cache');
  doc.documentElement.lang = 'en-IN';
  assert.equal((await service.get(settings, {locale: F.pageLocale(doc)})).items[0].metadata, '2.6 crore views · 2 years ago'); assert.equal(calls, 4, 'valid Indian English source labels are preserved');
});
test('simultaneous searches share requests within a locale and do not share results across locales', async () => {
  let calls = 0, release;
  const gate = new Promise(resolve => {release = resolve;});
  const service = F.createService({fetcher: async url => {calls++; await gate; return {ok: true, url, text: async () => page([renderer('abcdefghijk', 'Python programming', {viewCountText: {simpleText: new URL(url).searchParams.get('gl') === 'IN' ? '2.6 crore views' : '26M views'}})])};}});
  const british = {locale: {hl: 'en-GB', gl: 'GB'}}, indian = {locale: {hl: 'en-IN', gl: 'IN'}};
  const pending = [service.get(C.defaults(), british), service.get(C.defaults(), british), service.get(C.defaults(), indian)];
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 4, 'two locale contexts each make only their normal two search requests');
  release(); const [gb, duplicate, india] = await Promise.all(pending);
  assert.equal(gb.items[0].metadata, '26M views'); assert.deepEqual(duplicate.items, gb.items); assert.equal(india.items[0].metadata, '2.6 crore views');
});


const publicClient = {INNERTUBE_CONTEXT_CLIENT_NAME: 1, INNERTUBE_CONTEXT_CLIENT_VERSION: '2.20261023.01.00', INNERTUBE_API_KEY: 'PublicBootstrapKey_1234567890', INNERTUBE_CONTEXT: {client: {clientName: 'WEB', clientVersion: '2.20261023.01.00', visitorData: 'do-not-forward'}, user: {account: 'do-not-forward'}}, VISITOR_DATA: 'do-not-forward'};
const continuationItem = token => ({continuationItemRenderer: {continuationEndpoint: {commandMetadata: {webCommandMetadata: {sendPost: true, apiUrl: '/youtubei/v1/search'}}, continuationCommand: {token, request: 'CONTINUATION_REQUEST_TYPE_SEARCH'}}}});
const discoverPage = (entries, token, config = publicClient) => page([...entries, ...(token ? [continuationItem(token)] : [])]) + '<script>ytcfg.set(' + JSON.stringify(config) + ');</script>';
const continuedPage = (entries, token) => JSON.stringify({onResponseReceivedCommands: [{appendContinuationItemsAction: {continuationItems: [{itemSectionRenderer: {contents: entries}}, ...(token ? [continuationItem(token)] : [])]}}]});
const oneTopic = () => C.sanitize({intentDescriptions: {work: 'woodworking joinery'}, metadataLimit: 0});
test('explicit native-page Accept-Language prevents browser English India from overriding GET and continuation locale', async () => {
  const locale = F.pageLocale(localeDocument('en-GB', ['ytcfg.set({"INNERTUBE_CONTEXT":{"client":{"hl":"en-GB","gl":"DE"}}});']));
  const calls = [];
  const service = F.createService({fetcher: async (url, options) => {
    calls.push({url, options});
    // Match the observed public endpoint: a browser header can override ?hl=.
    const language = options.headers?.['Accept-Language'] || 'en-IN';
    const views = language === 'en-GB' ? '26m views' : '2.6 crore views';
    const item = renderer(options.method ? 'bbbbbbbbbbb' : 'aaaaaaaaaaa', 'Woodworking joinery lesson', {shortViewCountText: {simpleText: views}, publishedTimeText: {simpleText: '2 years ago'}});
    return {ok: true, url, text: async () => options.method ? continuedPage([item]) : discoverPage([item], 'next-language-page')};
  }});
  const first = await service.get(oneTopic(), {locale});
  const second = await service.get(oneTopic(), {locale, cursor: first.nextCursor, pageCursor: first.pageCursor});
  assert.equal(first.items[0].metadata, '26m views · 2 years ago'); assert.equal(second.items[0].metadata, '26m views · 2 years ago');
  assert.equal(calls.length, 2); assert.deepEqual(calls[0].options.headers, {'Accept-Language': 'en-GB'});
  const initial = new URL(calls[0].url); assert.equal(initial.searchParams.get('hl'), 'en-GB'); assert.equal(initial.searchParams.get('gl'), 'DE');
  assert.deepEqual(calls[1].options.headers, {'Accept-Language': 'en-GB', 'Content-Type': 'application/json', 'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': publicClient.INNERTUBE_CONTEXT_CLIENT_VERSION});
  assert.deepEqual(JSON.parse(calls[1].options.body).context.client, {clientName: 'WEB', clientVersion: publicClient.INNERTUBE_CONTEXT_CLIENT_VERSION, hl: 'en-GB', gl: 'DE'});
  assert.ok(calls.every(call => call.options.credentials === 'omit'));
});
test('recognized empty search continuations end discovery without a layout error', async () => {
  const endings = [
    ...['onResponseReceivedCommands', 'onResponseReceivedActions', 'onResponseReceivedEndpoints'].map(key => ({[key]: [{appendContinuationItemsAction: {continuationItems: []}}]})),
    {continuationContents: {searchContinuation: {contents: []}}}
  ];
  for (const ending of endings) {
    let calls = 0;
    const service = F.createService({fetcher: async (url, options) => {
      calls++; return {ok: true, url, text: async () => options.method ? JSON.stringify(ending) : discoverPage([renderer('aaaaaaaaaaa', 'Woodworking joinery lesson')], 'last-page')};
    }});
    const first = await service.get(oneTopic());
    const last = await service.get(oneTopic(), {cursor: first.nextCursor, pageCursor: first.pageCursor});
    assert.deepEqual(last.items, []); assert.equal(last.hasMore, false); assert.equal(last.pageCursor, null); assert.equal(last.warning, ''); assert.equal(calls, 2);
  }
});
test('dense terminal pages retain accepted overflow in a bounded context-checked cursor without extra work', async () => {
  let calls = 0, judgments = 0, time = 0;
  const ids = Array.from({length: 100}, (_, i) => 'V' + String(i).padStart(10, '0'));
  const service = F.createService({now: () => time, fetcher: async url => {
    calls++; return {ok: true, url, text: async () => discoverPage(ids.map(id => renderer(id, 'Woodworking joinery lesson')))};
  }, judge: async videos => {judgments++; return videos.map(() => ({accepted: true, uncertain: false}));}});
  const settings = oneTopic(), first = await service.get(settings);
  assert.deepEqual(first.items.map(v => v.id), ids.slice(0, 60)); assert.equal(first.hasMore, true); assert.equal(typeof first.pageCursor, 'string');
  const options = {cursor: first.nextCursor, pageCursor: first.pageCursor};
  const second = await service.get(settings, options);
  assert.deepEqual(second.items.map(v => v.id), ids.slice(60)); assert.equal(second.hasMore, false); assert.equal(second.pageCursor, null); assert.equal(second.nextCursor, first.nextCursor);
  assert.deepEqual((await service.get(settings, options)).items, second.items, 'retrying an accepted-results cursor is idempotent');
  assert.deepEqual((await service.get(settings, {...options, exclude: ids.slice(60, 63)})).items.map(v => v.id), ids.slice(63), 'new native matches are excluded when saved discovery matches are delivered');
  assert.deepEqual(second.metadataStats, {limit: 0, uncertain: 0, checked: 0, requests: 0, cacheHits: 0, sharedRequests: 0, failed: 0, remaining: 0});
  await assert.rejects(service.get(settings, {...options, isActive: () => false}), /no longer active/);
  await assert.rejects(service.get(settings, {...options, locale: {hl: 'de', gl: 'DE'}}), /continuation expired or changed/);
  await assert.rejects(service.get({...settings, hideShorts: false}, options), /continuation expired or changed/);
  time = 600001; await assert.rejects(service.get(settings, options), /continuation expired/);
  assert.equal(calls, 1); assert.equal(judgments, 1, 'saved matches do not cause another search, fuller check or inference');
});
test('accepted overflow drains before remaining public continuation tasks and honors new exclusions', async () => {
  const ids = Array.from({length: 80}, (_, i) => 'V' + String(i).padStart(10, '0'));
  let calls = 0, judgments = 0;
  const service = F.createService({fetcher: async (url, options) => {
    calls++; return {ok: true, url, text: async () => options.method ? continuedPage([renderer('N0000000001', 'Woodworking joinery next lesson')]) : discoverPage(ids.map(id => renderer(id, 'Woodworking joinery lesson')), 'next-page')};
  }, judge: async videos => {judgments++; return videos.map(() => ({accepted: true, uncertain: false}));}});
  const settings = oneTopic(), first = await service.get(settings);
  const second = await service.get(settings, {cursor: first.nextCursor, pageCursor: first.pageCursor, exclude: ids});
  assert.deepEqual(second.items, []); assert.equal(second.hasMore, true); assert.equal(typeof second.pageCursor, 'string'); assert.equal(calls, 1); assert.equal(judgments, 1);
  const third = await service.get(settings, {cursor: second.nextCursor, pageCursor: second.pageCursor, exclude: ids});
  assert.deepEqual(third.items.map(v => v.id), ['N0000000001']); assert.equal(third.hasMore, false); assert.equal(third.pageCursor, null); assert.equal(calls, 2); assert.equal(judgments, 2);
});
test('a single public topic keeps loading actual continuation pages with filters, regional context and no duplicate videos', async () => {
  const calls = [], locale = {hl: 'en-GB', gl: 'GB'}, settings = oneTopic();
  const service = F.createService({fetcher: async (url, options) => {
    calls.push({url, options}); const token = options.method === 'POST' ? JSON.parse(options.body).continuation : '';
    const text = !token ? discoverPage([renderer('aaaaaaaaaaa', 'Woodworking joinery first lesson')], 'next-one') : token === 'next-one' ? continuedPage([
      renderer('aaaaaaaaaaa', 'Woodworking joinery duplicate'), renderer('bbbbbbbbbbb', 'Woodworking joinery second lesson'), renderer('ccccccccccc', 'Jazz concert'), shortRenderer('ddddddddddd', 'Woodworking joinery short')
    ], 'next-two') : continuedPage([renderer('eeeeeeeeeee', 'Woodworking joinery third lesson')]);
    return {ok: true, url, text: async () => text};
  }});
  const first = await service.get(settings, {locale});
  assert.deepEqual(first.items.map(video => video.id), ['aaaaaaaaaaa']); assert.equal(first.hasMore, true); assert.equal(typeof first.pageCursor, 'string'); assert.equal(calls.length, 1);
  const options = {locale, cursor: first.nextCursor, pageCursor: first.pageCursor, exclude: first.items.map(video => video.id)};
  const second = await service.get(settings, options);
  assert.deepEqual(second.items.map(video => video.id), ['bbbbbbbbbbb']); assert.equal(second.hasMore, true); assert.equal(calls.length, 2);
  assert.deepEqual((await service.get(settings, options)).items, second.items); assert.equal(calls.length, 2, 'the same opaque cursor is idempotent and reuses its fetched page');
  const third = await service.get(settings, {locale, cursor: second.nextCursor, pageCursor: second.pageCursor, exclude: ['aaaaaaaaaaa', 'bbbbbbbbbbb']});
  assert.deepEqual(third.items.map(video => video.id), ['eeeeeeeeeee']); assert.equal(third.hasMore, false); assert.equal(third.pageCursor, null); assert.equal(calls.length, 3);
  for (const call of calls.slice(1)) {
    const url = new URL(call.url), body = JSON.parse(call.options.body);
    assert.equal(url.origin + url.pathname, 'https://www.youtube.com/youtubei/v1/search'); assert.equal(url.searchParams.get('key'), publicClient.INNERTUBE_API_KEY);
    assert.equal(call.options.credentials, 'omit'); assert.equal(call.options.method, 'POST');
    assert.deepEqual(body.context, {client: {clientName: 'WEB', clientVersion: '2.20261023.01.00', hl: 'en-GB', gl: 'GB'}});
    assert.deepEqual(Object.keys(body).sort(), ['context', 'continuation']); assert.ok(!JSON.stringify(call).includes('do-not-forward'));
    assert.equal(call.options.headers.Authorization, undefined); assert.equal(call.options.headers.Cookie, undefined);
    assert.equal(call.options.headers['Accept-Language'], locale.hl);
  }
});
test('discovery cursors are server-owned, expire, and cannot be reused with another intent, locale or refresh round', async () => {
  let time = 0, calls = 0;
  const service = F.createService({now: () => time, fetcher: async url => {calls++; return {ok: true, url, text: async () => discoverPage([renderer('abcdefghijk', 'Woodworking joinery')], 'next-page')};}});
  const settings = oneTopic(), first = await service.get(settings);
  for (const options of [{pageCursor: 'caller-token', url: 'https://evil.example/'}, {pageCursor: {token: 'next-page'}}, {pageCursor: first.pageCursor, locale: {hl: 'de', gl: 'DE'}}, {pageCursor: first.pageCursor, round: 1}]) await assert.rejects(service.get(settings, options), /continuation expired or changed/);
  await assert.rejects(service.get({...settings, mode: 'study'}, {pageCursor: first.pageCursor}), /continuation expired or changed/);
  assert.equal(calls, 1, 'invalid context never starts a request');
  time = 600001; await assert.rejects(service.get(settings, {pageCursor: first.pageCursor}), /continuation expired/); assert.equal(calls, 1);
});
test('partial continuation failures remain retryable and never spend more than two search-page requests per batch', async () => {
  const calls = []; let fail = true;
  const settings = C.sanitize({intentDescriptions: {work: 'woodworking, joinery'}, metadataLimit: 0});
  const service = F.createService({fetcher: async (url, options) => {
    const token = options.method === 'POST' ? JSON.parse(options.body).continuation : '';
    calls.push(token || new URL(url).searchParams.get('search_query'));
    if (token === 'wood-next' && fail) throw new Error('Temporary continuation failure');
    return {ok: true, url, text: async () => token ? continuedPage([renderer(token === 'wood-next' ? 'ccccccccccc' : 'ddddddddddd', 'Woodworking joinery next lesson')]) : discoverPage([renderer(new URL(url).searchParams.get('search_query') === 'woodworking' ? 'aaaaaaaaaaa' : 'bbbbbbbbbbb', 'Woodworking joinery lesson')], new URL(url).searchParams.get('search_query') === 'woodworking' ? 'wood-next' : 'join-next')};
  }});
  const first = await service.get(settings); assert.equal(calls.length, 2);
  const second = await service.get(settings, {cursor: first.nextCursor, pageCursor: first.pageCursor});
  assert.equal(calls.length, 4); assert.equal(second.hasMore, true); assert.match(second.warning, /Some searches/); assert.deepEqual(second.items.map(video => video.id), ['ddddddddddd']);
  fail = false;
  const retry = await service.get(settings, {cursor: second.nextCursor, pageCursor: second.pageCursor});
  assert.equal(calls.length, 5); assert.deepEqual(retry.items.map(video => video.id), ['ccccccccccc']); assert.equal(retry.hasMore, false);
});
test('failed continuation requests preserve the same cursor for retry and shared callers deduplicate in-flight pages', async () => {
  let calls = 0, fail = true, release;
  const gate = new Promise(resolve => {release = resolve;});
  const service = F.createService({fetcher: async (url, options) => {
    calls++; if (!options.method) return {ok: true, url, text: async () => discoverPage([renderer('aaaaaaaaaaa', 'Woodworking joinery')], 'next')};
    if (fail) throw new Error('Temporary failure'); await gate;
    return {ok: true, url, text: async () => continuedPage([renderer('bbbbbbbbbbb', 'Woodworking joinery next')])};
  }});
  const settings = oneTopic(), first = await service.get(settings), options = {cursor: first.nextCursor, pageCursor: first.pageCursor};
  await assert.rejects(service.get(settings, options), /Temporary failure/); assert.equal(calls, 2);
  fail = false; const pending = [service.get(settings, options), service.get(settings, options)];
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 3, 'two retries share one continuation request'); release();
  const [a, b] = await Promise.all(pending); assert.deepEqual(a.items, b.items); assert.equal(a.hasMore, false);
});
test('continuation parsing uses only search actions, bounds tokens and stops repeated continuation loops honestly', async () => {
  for (const scenario of ['loop', 'oversized', 'missing-client', 'unrelated-actions']) {
    let calls = 0;
    const service = F.createService({fetcher: async (url, options) => {
      calls++;
      const token = scenario === 'oversized' ? 'x'.repeat(4097) : 'loop-next';
      const text = !options.method ? discoverPage([renderer('aaaaaaaaaaa', 'Woodworking joinery')], token, scenario === 'missing-client' ? {} : publicClient) : scenario === 'unrelated-actions' ? JSON.stringify({unrelated: {appendContinuationItemsAction: {continuationItems: [renderer('bbbbbbbbbbb', 'Woodworking joinery unrelated response')]}}}) : continuedPage([renderer('bbbbbbbbbbb', 'Woodworking joinery next')], 'loop-next');
      return {ok: true, url, text: async () => text};
    }});
    const settings = oneTopic(), first = await service.get(settings);
    if (scenario === 'oversized' || scenario === 'missing-client') {assert.equal(first.hasMore, false); assert.match(first.endReason, /unavailable/); assert.equal(calls, 1);}
    else if (scenario === 'unrelated-actions') await assert.rejects(service.get(settings, {pageCursor: first.pageCursor}), /search layout/);
    else {const second = await service.get(settings, {pageCursor: first.pageCursor}); assert.equal(second.hasMore, false); assert.match(second.endReason, /discovery limit/); assert.equal(calls, 2);}
  }
});
test('stale continuation work does not classify or return items after its feed is cancelled', async () => {
  let active = true, calls = 0, judged = 0, release;
  const gate = new Promise(resolve => {release = resolve;});
  const service = F.createService({fetcher: async (url, options) => {calls++; if (options.method) await gate; return {ok: true, url, text: async () => options.method ? continuedPage([renderer('bbbbbbbbbbb', 'Woodworking joinery next')]) : discoverPage([renderer('aaaaaaaaaaa', 'Woodworking joinery')], 'next')};}, judge: async videos => {judged++; return videos.map(() => ({accepted: true, uncertain: false}));}});
  const settings = oneTopic(), first = await service.get(settings);
  const pending = service.get(settings, {pageCursor: first.pageCursor, isActive: () => active});
  await new Promise(resolve => setImmediate(resolve)); active = false; release(); await assert.rejects(pending, /no longer active/);
  assert.equal(calls, 2); assert.equal(judged, 1, 'the cancelled continuation never reaches the local model');
});

test('library defaults use focused discovery queries without leaking into an edited scope',()=>{
  const template=C.INTENT_TEMPLATES.gaming,id='custom-gaming';
  const s=C.sanitize({mode:id,customIntents:{[id]:{name:template.name,description:template.description,templateId:'gaming'}}});
  assert.deepEqual(F.queries(s),template.searches);
  const edited=C.sanitize({...s,customIntents:{[id]:{...s.customIntents[id],description:'Chess tournament analysis'}}});
  assert.deepEqual(F.queries(edited),['Chess tournament analysis']);
});

test('native discovery preserves only public YouTube channel artwork CDN URLs',()=>{
 const withAvatar=url=>renderer('abcdefghijk','A useful lesson',{channelThumbnailSupportedRenderers:{channelThumbnailWithLinkRenderer:{thumbnail:{thumbnails:[{url}]}}}});
 assert.equal(F.extract(page([withAvatar('https://yt3.ggpht.com/public-avatar=s68')]))[0].channelThumbnail,'https://yt3.ggpht.com/public-avatar=s68');
 for(const url of ['https://evil.test/avatar','https://yt3.ggpht.com.evil.test/avatar','https://x:secret@yt3.ggpht.com/avatar','https://yt3.ggpht.com:444/avatar'])assert.equal(F.extract(page([withAvatar(url)]))[0].channelThumbnail,undefined);
});

test('native hover preserves only the matching video public animated thumbnail',()=>{
 const animated=url=>renderer('abcdefghijk','A useful lesson',{richThumbnail:{movingThumbnailRenderer:{movingThumbnailDetails:{thumbnails:[{url}]}}}});
 const valid='https://i.ytimg.com/an_webp/abcdefghijk/mqdefault_6s.webp?public=1';
 assert.equal(F.extract(page([animated(valid)]))[0].movingThumbnail,valid);
 for(const url of ['https://evil.test/an_webp/abcdefghijk/preview.webp','https://i.ytimg.com/an_webp/bbbbbbbbbbb/preview.webp','https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'])assert.equal(F.extract(page([animated(url)]))[0].movingThumbnail,undefined);
});
