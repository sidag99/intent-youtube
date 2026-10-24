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
