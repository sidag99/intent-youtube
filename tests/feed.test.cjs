const {test} = require('node:test');
const assert = require('node:assert/strict');
require('../src/core.js'); require('../src/feed.js');
const C = IntentCore, F = IntentFeed;
const renderer = (id, title, extra = {}) => ({videoRenderer: {videoId: id, title: {runs: [{text: title}]}, ownerText: {runs: [{text: 'Studio North'}]}, thumbnail: {thumbnails: [{url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`}]}, ...extra}});
const page = entries => `<script>var ytInitialData = ${JSON.stringify({contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: [{itemSectionRenderer: {contents: entries}}]}}}}})};</script>`;
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
