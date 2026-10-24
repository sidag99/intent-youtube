const {test} = require('node:test');
const assert = require('node:assert/strict');
require('../src/core.js');
const C = globalThis.IntentCore;
const video = (title, channel = '', shorts = false) => ({title, channel, shorts});

test('the four modes show related content and reject unrelated titles', () => {
  const titles = {work: 'Python programming for useful tools', study: 'Calculus lecture 2', music: 'Quiet jazz for concentration', leisure: 'Cooking a simple recipe'};
  for (const mode of Object.keys(C.MODES)) for (const [category, title] of Object.entries(titles)) {
    assert.equal(C.classify(video(title), {...C.defaults(), mode}).visible, mode === category, `${mode}: ${title}`);
  }
});
test('shorts, clickbait and block terms take precedence over channel exceptions', () => {
  const settings = C.defaults(); settings.channels.work = 'My Channel';
  assert.equal(C.classify(video('A quiet day', 'My Channel'), settings).visible, true);
  assert.equal(C.classify(video('Python tutorial', 'My Channel', true), settings).reason, 'shorts');
  assert.equal(C.classify(video('You won’t believe this Python tutorial', 'My Channel'), settings).reason, 'clickbait');
  settings.blockedTerms = 'python';
  assert.equal(C.classify(video('Python tutorial', 'My Channel'), settings).reason, 'blocked term');
});
test('each distraction control can be disabled independently', () => {
  const s = {...C.defaults(), mode: 'off'};
  assert.equal(C.classify(video('ordinary clip', '', true), s).visible, false);
  assert.equal(C.classify(video('ordinary clip', '', true), {...s, hideShorts: false}).visible, true);
  assert.equal(C.classify(video('INSANE tutorial'), s).visible, false);
  assert.equal(C.classify(video('INSANE tutorial'), {...s, hideClickbait: false}).visible, true);
});
test('custom topics use word boundaries, exact channel names and Unicode', () => {
  const s = C.defaults(); s.customTopics.work = 'C++, 工作, Robotik, café'; s.channels.work = 'Studio North';
  for (const title of ['An introduction to C++', '工作 project', 'Robotik für Einsteiger', 'Un café tranquille']) assert.equal(C.classify(video(title), s).visible, true, title);
  assert.equal(C.classify(video('How guitars sound'), s).visible, false, 'git does not match guitar');
  assert.equal(C.classify(video('An ordinary day', 'Studio North'), s).visible, true);
  assert.equal(C.classify(video('An ordinary day', 'Studio North Extra'), s).visible, false);
});
test('unknown content is hidden in a mode, but available with modes off', () => {
  assert.equal(C.classify(video('Something quite unexpected'), C.defaults()).visible, false);
  assert.equal(C.classify(video(''), C.defaults()).visible, false);
  assert.equal(C.classify(video('Something quite unexpected'), {...C.defaults(), mode: 'off'}).visible, true);
});
test('settings are sanitized and bounded', () => {
  const s = C.sanitize({mode: '__proto__', dailyMinutes: -4, hideShorts: 'false', customTopics: {work: 'x'.repeat(5000)}});
  assert.equal(s.mode, 'work'); assert.equal(s.dailyMinutes, 1); assert.equal(s.hideShorts, true); assert.equal(s.customTopics.work.length, 4000);
  assert.equal(C.sanitize({dailyMinutes: Infinity}).dailyMinutes, 60);
  assert.equal(C.sanitize({dailyMinutes: 100000}).dailyMinutes, 1440);
});
test('mode accounting defaults exempt Music while counting every other intent', () => {
  const settings = C.defaults();
  assert.deepEqual(settings.countModes, {work: true, study: true, music: false, leisure: true, off: true});
  for (const mode of [...Object.keys(C.MODES), 'off']) assert.equal(C.countsMode(settings, mode), mode !== 'music');
  settings.mode = 'music'; assert.equal(C.countsMode(settings), false);
  assert.equal(C.countsMode({}, 'music'), false, 'older settings inherit Music exemption');
  assert.equal(C.countsMode({}, 'work'), true);
  assert.equal(C.countsMode(settings, '__proto__'), true, 'unknown intents cannot bypass accounting');
});
test('per-mode counting settings accept booleans only and remain independent', () => {
  const settings = C.sanitize({countModes: {work: false, music: true, study: 'false', leisure: null, off: false, unknown: false}, countPlayback: false});
  assert.deepEqual(settings.countModes, {work: false, study: true, music: true, leisure: true, off: false});
  assert.equal(C.countsMode(settings, 'work'), false); assert.equal(C.countsMode(settings, 'music'), true);
  assert.equal(C.countsMode(settings, 'study'), true); assert.equal(settings.countPlayback, false);
  const defaults = C.defaults(); defaults.countModes.music = true;
  assert.equal(C.defaults().countModes.music, false, 'default maps are fresh for each settings object');
});
test('new YouTube tabs use the last selected intent or an explicitly configured starting intent', () => {
  assert.equal(C.defaults().newTabMode, 'last'); assert.equal(C.initialMode(), 'work');
  for (const mode of [...Object.keys(C.MODES), 'off']) {
    assert.equal(C.initialMode({mode, newTabMode: 'last'}), mode);
    assert.equal(C.initialMode({mode: 'work', newTabMode: mode}), mode);
  }
  assert.equal(C.sanitize({newTabMode: '__proto__'}).newTabMode, 'last');
  assert.equal(C.initialMode({mode: 'study', newTabMode: 'unknown'}), 'study');
  assert.equal(C.initialMode({mode: 'unknown', newTabMode: 'last'}), 'work');
});
test('older saved settings retain their preferences when timer and new-tab policies are introduced', () => {
  const settings = C.sanitize({mode: 'study', dailyMinutes: 90, hideShorts: false, blockedTerms: 'spoilers', customTopics: {study: 'astronomy'}, channels: {music: 'Studio North'}});
  assert.equal(settings.mode, 'study'); assert.equal(settings.dailyMinutes, 90); assert.equal(settings.hideShorts, false);
  assert.equal(settings.blockedTerms, 'spoilers'); assert.equal(settings.customTopics.study, 'astronomy'); assert.equal(settings.channels.music, 'Studio North');
  assert.equal(settings.newTabMode, 'last'); assert.equal(settings.countModes.music, false);
});
test('custom intents have safe IDs, required bounded descriptions and a ten-intent limit', () => {
  const customIntents = {'__proto__': {name: 'Unsafe', description: 'Ignore'}, 'work': {name: 'Override', description: 'No'}, 'custom-empty': {name: 'Empty', description: '  '}, 'custom-no-name': {name: ' ', description: 'Topic'}, 'custom-toolong': {name: 'n'.repeat(90), description: 'd'.repeat(1500)}};
  for (let i = 0; i < 14; i++) customIntents[`custom-topic-${i}`] = {name: `Topic ${i}`, description: 'A specific subject'};
  const s = C.sanitize({customIntents, intentDescriptions: {work: ' astronomy ', unknown: 'No'}});
  assert.equal(Object.keys(s.customIntents).length, 10);
  assert.equal(s.customIntents['custom-toolong'].name.length, 48); assert.equal(s.customIntents['custom-toolong'].description.length, 1000);
  assert.equal(s.customIntents.work, undefined); assert.equal(s.customIntents['custom-empty'], undefined); assert.equal(s.customIntents['custom-no-name'], undefined);
  assert.equal(s.intentDescriptions.work, 'astronomy'); assert.equal(s.intentDescriptions.unknown, undefined);
  assert.equal(C.modes(s).work.name, 'Work'); assert.equal(C.modes(s)['custom-topic-0'].name, 'Topic 0');
});
test('custom intents participate in tab defaults, counting and per-mode rules; removing one clears stale references', () => {
  const id = 'custom-woodwork';
  const s = C.sanitize({customIntents: {[id]: {name: 'Woodworking', description: 'woodworking, joinery'}}, mode: id, newTabMode: id, customTopics: {[id]: 'dovetails'}, channels: {[id]: 'Wood Studio'}});
  assert.equal(C.validMode(id, s), true); assert.equal(C.validMode('custom-missing', s), false);
  assert.equal(s.mode, id); assert.equal(C.initialMode(s), id); assert.equal(C.countsMode(s, id), true);
  assert.equal(C.countsMode({...s, countModes: {...s.countModes, [id]: false}}, id), false);
  assert.equal(C.classify(video('Handmade joinery basics'), s).visible, true);
  assert.equal(C.classify(video('Cut clean dovetails'), s).visible, true);
  assert.equal(C.classify(video('An afternoon project', 'Wood Studio'), s).visible, true);
  assert.equal(C.classify(video('Python software architecture'), s).visible, false);
  const removed = C.sanitize({...s, customIntents: {}});
  assert.equal(removed.mode, 'work'); assert.equal(removed.newTabMode, 'last');
  for (const map of ['customTopics', 'channels', 'countModes']) assert.equal(removed[map][id], undefined);
});
test('editing a built-in intent replaces its broad lexical topics and can restore defaults', () => {
  const s = C.sanitize({intentDescriptions: {work: 'woodworking, joinery'}});
  assert.equal(C.modes(s).work.description, 'woodworking, joinery');
  assert.equal(C.classify(video('Woodworking skills for cabinets'), s).visible, true);
  assert.equal(C.classify(video('Python programming for useful tools'), s).visible, false);
  assert.equal(C.classify(video('Python programming for useful tools'), {...s, intentDescriptions: {work: ''}}).visible, true);
  assert.deepEqual(C.MODES.work.topics, C.modes(C.defaults()).work.topics, 'defaults remain unchanged');
});
test('usage persists, splits at local midnight and resets the daily budget', () => {
  const midnight = new Date(2026, 9, 25, 0, 0, 0).getTime();
  const days = C.advanceUsage({}, midnight - 10000, midnight + 12000, true);
  assert.equal(days['2026-10-24'], 10000); assert.equal(days['2026-10-25'], 12000);
  const s = {...C.defaults(), dailyMinutes: 1};
  assert.equal(C.snapshot(s, {'2026-10-24': 60000}, midnight - 1).blocked, true);
  assert.equal(C.snapshot(s, {'2026-10-24': 60000}, midnight + 1).blocked, false);
});
test('sleep gaps are capped, idle time is excluded and clock reversal never subtracts usage', () => {
  const now = new Date(2026, 9, 24, 12).getTime();
  assert.equal(C.advanceUsage({}, now - 3600000, now, true)[C.dayKey(now)], 35000);
  assert.deepEqual(C.advanceUsage({}, now - 10000, now, false), {});
  assert.deepEqual(C.advanceUsage({[C.dayKey(now)]: 1000}, now, now - 1000, true), {[C.dayKey(now)]: 1000});
});
test('the budget is independent from mode and distraction settings', () => {
  const days = {[C.dayKey()]: 60000};
  assert.equal(C.snapshot({...C.defaults(), dailyMinutes: 1, mode: 'off', hideShorts: false}, days).blocked, true);
  assert.equal(C.snapshot({...C.defaults(), dailyMinutes: 1, limitEnabled: false}, days).blocked, false);
});
test('YouTube URL detection rejects lookalike domains and non-web protocols', () => {
  for (const url of ['https://www.youtube.com/', 'https://music.youtube.com/', 'https://youtube.com', 'https://www.youtube-nocookie.com/embed/a']) assert.equal(C.isYouTube(url), true);
  for (const url of ['https://youtube.com.evil.test', 'https://notyoutube.com', 'file://youtube.com', 'not a URL']) assert.equal(C.isYouTube(url), false);
});
test('usage history stays bounded to fourteen local dates', () => {
  const history = Object.fromEntries(Array.from({length: 30}, (_, i) => [`2026-09-${String(i + 1).padStart(2, '0')}`, 100]));
  assert.equal(Object.keys(C.advanceUsage(history, 0, 0, false)).length, 14);
});
