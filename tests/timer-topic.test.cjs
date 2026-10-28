const {test} = require('node:test'), assert = require('node:assert/strict');
require('../src/core.js'); require('../src/timer-topic.js');
const C = IntentCore, T = IntentTimerTopic, s = C.sanitize({mode:'study'});
test('current-video topic identity only accepts native YouTube watch and Shorts video IDs',()=>{
  for(const url of ['https://www.youtube.com/watch?v=abcdefghijk','https://m.youtube.com/shorts/abcdefghijk']) assert.equal(T.videoId(url),'abcdefghijk');
  for(const url of ['https://youtube.com.evil.test/watch?v=abcdefghijk','https://www.youtube.com/results?v=abcdefghijk','https://music.youtube.com/watch?v=abcdefghijk','https://www.youtube.com/watch?v=invalid','https://youtube-nocookie.com/embed/abcdefghijk','file:///watch?v=abcdefghijk']) assert.equal(T.videoId(url),'');
});
test('only strong, valid conflicting topic evidence can remove an optional exemption',()=>{
  const unrelated={accepted:false,uncertain:false,similarity:.1,categoryId:'music',categorySimilarity:.6,categoryMargin:.3};
  assert.deepEqual(T.estimate(unrelated,s),{status:'unrelated',categoryId:'music',categoryIds:['music']});
  for(const patch of [{uncertain:true},{similarity:.19},{categorySimilarity:.39},{categoryMargin:.04},{categoryId:'fake'}, {categoryId:'study'}, {similarity:NaN}]) assert.notEqual(T.estimate({...unrelated,...patch},s).status,'unrelated');
  assert.equal(T.estimate({accepted:true,uncertain:false,similarity:.5,categoryId:'study',categorySimilarity:.5,categoryMargin:.2},s).status,'matching');
  assert.equal(T.estimate({accepted:true,uncertain:true,similarity:.5},s).status,'uncertain');
  assert.equal(T.estimate(null,s).status,'unavailable');
});
test('strong overlapping topic labels do not relax conservative timer relation gates',()=>{
  const decision={accepted:true,uncertain:true,similarity:.410,categoryId:'study',categorySimilarity:.410,categoryMargin:.025,categoryCandidates:[{id:'study',similarity:.410},{id:'work',similarity:.385}]};
  assert.deepEqual(T.estimate(decision,s),{status:'uncertain',categoryId:null,categoryIds:['study','work']});
  const mismatch=T.estimate({...decision,accepted:false,uncertain:false,similarity:.1},{...s,mode:'music'});
  assert.equal(mismatch.status,'uncertain','a displayed overlapping category cannot revoke a timer exemption');
  const invalid=T.estimate({...decision,categoryCandidates:[{id:'fake',similarity:.9},{id:'music',similarity:.2}]},s);
  assert.deepEqual(invalid.categoryIds,[],'weak or unconfigured categories are not display evidence');
});
test('metadata and model identity are bounded and all configured topic scopes invalidate the topic cache',()=>{
  const video=T.metadata({title:'a'.repeat(900),description:'x'.repeat(8000),keywords:Array(100).fill('y'.repeat(200))},'abcdefghijk');
  assert.equal(video.title.length,500);assert.equal(video.description.length,1800);assert.equal(video.keywords.length,30);assert.equal(video.keywords[0].length,80);
  assert.notEqual(T.key(s),T.key({...s,customTopics:{...s.customTopics,music:'Baroque'}}));
  assert.equal(T.key(s),T.key({...s,dailyMinutes:5,matchOnlyModes:{study:true}}),'timer preferences do not rerun the model');
});
