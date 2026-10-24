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
