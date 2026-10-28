const {test} = require('node:test');
const assert = require('node:assert/strict');
require('../src/core.js'); require('../src/semantic.js');
const C = IntentCore, S = IntentSemantic;

test('semantic profiles retain original defaults unless an intent description explicitly replaces them', () => {
  const defaults = S.profiles(C.defaults());
  assert.deepEqual(defaults.work, S.PROFILES.work);
  assert.deepEqual(defaults.study, S.PROFILES.study);
  const narrowed = S.profiles(C.sanitize({intentDescriptions: {work: 'Writing legal contracts for clients', study: 'European history, medieval archaeology'}, customTopics: {study: 'ancient manuscripts'}}));
  assert.deepEqual(narrowed.work, ['Writing legal contracts for clients']);
  assert.deepEqual(narrowed.study, ['European history, medieval archaeology', 'Videos about ancient manuscripts.']);
  assert.ok(!narrowed.study.some(text => /mathematics|physics|chemistry/.test(text)));
  assert.deepEqual(narrowed.music, defaults.music);
});
test('custom intent profiles use their own description and extra topics, and disappear after deletion', () => {
  const id = 'custom-law';
  const settings = C.sanitize({customIntents: {[id]: {name: 'Law', description: 'Contract law, case analysis and legal research'}}, customTopics: {[id]: 'civil procedure'}});
  assert.deepEqual(S.profiles(settings)[id], ['Contract law, case analysis and legal research', 'Videos about civil procedure.']);
  assert.equal(S.profiles({...settings, customIntents: {}})[id], undefined);
});
test('every intent uses an independent similarity threshold without a competing-profile veto', () => {
  const vector = [1, 0];
  const modeVectors = {study: [[.36, 0]], work: [[.75, 0]], 'custom-law': [[.34, 0]]};
  assert.equal(S.decide(vector, modeVectors, 'study').accepted, true);
  assert.equal(S.decide(vector, {...modeVectors, study: [[.25,0]]}, 'study').accepted, false, 'a weak incidental relationship still fails its own threshold');
  assert.equal(S.decide(vector, modeVectors, 'study', true).accepted, true);
  assert.equal(S.decide(vector, modeVectors, 'custom-law', true).accepted, true);
  assert.equal(S.decide(vector, {...modeVectors, 'custom-law': [[.29, 0]]}, 'custom-law', true).accepted, false);
  assert.equal(S.decide(vector, {work: [[.5, 0]]}, 'work').accepted, true);
});
test('category display candidates preserve the two strongest topics without changing their relation decision',()=>{
  const decision=S.decide([1],{study:[[.410]],work:[[.385]],music:[[.18]]},'study');
  assert.deepEqual(decision.categoryCandidates,[{id:'study',similarity:.410},{id:'work',similarity:.385}]);
  assert.equal(decision.accepted,true);assert.equal(decision.uncertain,true);assert.equal(decision.categoryId,'study');
});

test('initial semantic profiles exclude Leisure and installed templates use their own focused descriptions', () => {
  assert.equal(S.PROFILES.leisure, undefined); assert.deepEqual(Object.keys(S.profiles(C.defaults())), ['work', 'study', 'music']);
  const customIntents = Object.fromEntries(Object.entries(C.INTENT_TEMPLATES).map(([id, record]) => ['custom-' + id, {name: record.name, description: record.description, icon: record.icon, templateId: id}]));
  const settings = C.sanitize({customIntents, mode: 'custom-maker'}), profiles = S.profiles(settings);
  assert.equal(Object.keys(profiles).length, 21);
  for (const [id, record] of Object.entries(C.INTENT_TEMPLATES)) assert.deepEqual(profiles['custom-' + id], [record.description, ...record.examples]);
  assert.match(profiles['custom-maker'][0], /physical and digital/);
});
test('editing a role preset does not change semantic scope until its descriptions are explicitly applied', () => {
  const s = C.sanitize({rolePresets: {accountant: {name: 'Accounting focus', workDescription: 'Bookkeeping, audit preparation and reconciliations', studyDescription: 'Accounting lessons'}}});
  assert.deepEqual(S.profiles(s).work, S.PROFILES.work);
  const applied = C.sanitize({...s, intentDescriptions: {work: s.rolePresets.accountant.workDescription, study: s.rolePresets.accountant.studyDescription}, lastRolePreset: 'accountant'});
  assert.deepEqual(S.profiles(applied).work, [s.rolePresets.accountant.workDescription]);
  assert.deepEqual(S.profiles(applied).study, [s.rolePresets.accountant.studyDescription]);
  assert.deepEqual(S.profiles({...applied, rolePresets: {}}).work, S.profiles(applied).work);
});

test('unedited library intents gain focused examples/topics/searches while edited scopes stay independent', () => {
  const template=C.INTENT_TEMPLATES.travel, id='custom-trip';
  const settings=C.sanitize({mode:id,customIntents:{[id]:{name:'My trips',description:template.description,templateId:'travel',icon:'plane'}}});
  assert.equal(C.defaultTemplate(settings,id),template);
  assert.ok(C.modes(settings)[id].topics.includes('backpacking'));
  assert.equal(S.profiles(settings)[id].length,4);
  const edited=C.sanitize({...settings,customIntents:{[id]:{...settings.customIntents[id],description:'Only scuba diving instruction'}}});
  assert.equal(C.defaultTemplate(edited,id),null);
  assert.deepEqual(S.profiles(edited)[id],['Only scuba diving instruction']);
  assert.ok(!C.modes(edited)[id].topics.includes('backpacking'));
});
test('every library definition has bounded focused examples and a varied keyword set',()=>{
  for(const template of Object.values(C.INTENT_TEMPLATES)){
    assert.ok(template.topics.length>=18&&template.topics.length<=32);
    assert.equal(new Set(template.topics).size,template.topics.length);
    assert.equal(template.examples.length,3);assert.equal(template.searches.length,4);
    assert.ok(template.examples.every(example=>example.length<400));
  }
  for(const mode of Object.values(C.MODES))assert.ok(mode.topics.length>=50);
});

test('builtin Music requires corroboration for moderate scores, without comparing other intents',()=>{
  const music=(scores,others={})=>S.decide([1],{music:scores.map(score=>[score]),...others},'music');
  assert.equal(music([.331,.210,.203],{work:[[.80]]}).accepted,false,'an incidental ambient match cannot qualify a quiet PC build');
  assert.equal(music([.354,.197,.187]).accepted,false,'an isolated live-concert match cannot qualify a camping vlog');
  assert.equal(music([.295,.263],{study:[[.90]]}).accepted,true,'corroborated country music qualifies independently of a stronger alternative');
  assert.equal(music([.396,.348]).accepted,true,'instrumentation supplied in metadata does not need an exact Music keyword');
  assert.equal(music([.455,.233]).accepted,true,'a strong operatic performance does not need a second high score');
  assert.equal(music([.259,.25]).accepted,false,'corroboration does not remove the normal confidence floor');
});

test('natural ambience explicitly advertised without music is not builtin Music, while performances and edited scopes remain valid',()=>{
  const refs={music:[[.45],[.30]],study:[[.2]]};
  for(const title of ['Eight hours of rain and thunder, no talking or music','Forest birds and wind without music','Ocean waves: no background music'])assert.equal(S.decide([1],refs,'music',false,{title}).accepted,false,title);
  assert.equal(S.decide([1],refs,'music',false,{title:'Singing in the rain without music: a cappella vocal performance'}).accepted,true);
  assert.equal(S.decide([1],refs,'music',false,{title:'Rainy window',description:'Soft piano melodies over gentle rain.'}).accepted,true);
  assert.equal(S.decide([1],{music:[[.31]]},'music',true,{title:'Forest birds without music'}).accepted,true,'an explicitly edited Music description controls its own scope');
});
