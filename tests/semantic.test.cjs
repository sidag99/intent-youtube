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
test('customized intent acceptance uses its own positive similarity threshold without a broad competing-profile veto', () => {
  const vector = [1, 0];
  const modeVectors = {study: [[.36, 0]], work: [[.75, 0]], 'custom-law': [[.34, 0]]};
  assert.equal(S.decide(vector, modeVectors, 'study').accepted, false);
  assert.equal(S.decide(vector, modeVectors, 'study', true).accepted, true);
  assert.equal(S.decide(vector, modeVectors, 'custom-law', true).accepted, true);
  assert.equal(S.decide(vector, {...modeVectors, 'custom-law': [[.29, 0]]}, 'custom-law', true).accepted, false);
  assert.equal(S.decide(vector, {work: [[.5, 0]]}, 'work').accepted, true);
});
