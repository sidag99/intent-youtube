const {test} = require('node:test');
const assert = require('node:assert/strict');
require('../src/core.js');
const C = globalThis.IntentCore;
const video = (title, channel = '', shorts = false) => ({title, channel, shorts});

test('the three initial modes show related content and reject unrelated titles', () => {
  const titles = {work: 'Python programming for useful tools', study: 'Calculus lecture 2', music: 'Quiet jazz for concentration'};
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
test('fuller metadata checking has a bounded configurable cap without boolean or null coercion', () => {
  assert.equal(C.defaults().metadataLimit, 4);
  for (const invalid of [true, false, null, undefined, '', ' ', 'invalid', Infinity, NaN, [], {}]) assert.equal(C.sanitize({metadataLimit: invalid}).metadataLimit, 4);
  for (const [input, output] of [[0, 0], [4, 4], [8, 8], [23, 23], [40, 40], [-9, 0], [99, 40], [7.6, 8], ['12', 12]]) assert.equal(C.sanitize({metadataLimit: input}).metadataLimit, output);
});
test('mode accounting defaults exempt Music while counting every other intent', () => {
  const settings = C.defaults();
  assert.deepEqual(settings.countModes, {work: true, study: true, music: false, off: true, focus: true});
  for (const mode of [...Object.keys(C.MODES), 'off']) assert.equal(C.countsMode(settings, mode), mode !== 'music');
  settings.mode = 'music'; assert.equal(C.countsMode(settings), false);
  assert.equal(C.countsMode({}, 'music'), false, 'older settings inherit Music exemption');
  assert.equal(C.countsMode({}, 'work'), true);
  assert.equal(C.countsMode(settings, '__proto__'), true, 'unknown intents cannot bypass accounting');
});
test('per-mode counting settings accept booleans only and remain independent', () => {
  const settings = C.sanitize({countModes: {work: false, music: true, study: 'false', leisure: null, off: false, unknown: false}, countPlayback: false});
  assert.deepEqual(settings.countModes, {work: false, study: true, music: true, off: false, focus: true});
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
test('custom intents have safe IDs, required bounded descriptions and a 24-intent limit', () => {
  const customIntents = {'__proto__': {name: 'Unsafe', description: 'Ignore'}, 'work': {name: 'Override', description: 'No'}, 'custom-empty': {name: 'Empty', description: '  '}, 'custom-no-name': {name: ' ', description: 'Topic'}, 'custom-toolong': {name: 'n'.repeat(90), description: 'd'.repeat(1500)}};
  for (let i = 0; i < 30; i++) customIntents[`custom-topic-${i}`] = {name: `Topic ${i}`, description: 'A specific subject'};
  const s = C.sanitize({customIntents, intentDescriptions: {work: ' astronomy ', unknown: 'No'}});
  assert.equal(Object.keys(s.customIntents).length, C.MAX_CUSTOM_INTENTS);
  assert.equal(C.MAX_CUSTOM_INTENTS, 24);
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
test('built-in intent names can be edited without changing their stable mode IDs or default scope', () => {
  const s = C.sanitize({intentNames: {work: ' Client projects ', study: 'n'.repeat(80), music: '', leisure: 12, 'custom-missing': 'Unknown'}});
  assert.equal(s.intentNames.work, 'Client projects'); assert.equal(s.intentNames.study.length, 48);
  assert.equal(s.intentNames.music, 'Music'); assert.equal(s.intentNames.leisure, undefined); assert.equal(s.intentNames['custom-missing'], undefined);
  assert.equal(C.modes(s).work.name, 'Client projects'); assert.equal(C.MODES.work.name, 'Work');
  assert.equal(C.modes(s).work.description, C.MODES.work.description); assert.deepEqual(C.modes(s).work.topics, C.MODES.work.topics);
  assert.equal(C.validMode('work', s), true); assert.equal(C.validMode('Client projects', s), false);
  assert.equal(C.defaults().intentNames.work, 'Work');
  require('../src/feed.js');
  assert.notEqual(IntentFeed.key(s), IntentFeed.key({...s, intentNames: {...s.intentNames, work: 'Personal projects'}}), 'renaming invalidates labels in the active feed');
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

test('factory role presets are useful independent records and default settings clone the entire library', () => {
  const factoryIds = ['general', 'software-engineer', 'accountant', 'designer', 'researcher', 'student'];
  assert.deepEqual(Object.keys(C.ROLE_PRESETS), factoryIds);
  const a = C.defaults(), b = C.defaults();
  assert.equal(a.lastRolePreset, null); assert.deepEqual(a.rolePresets, C.ROLE_PRESETS);
  assert.equal(a.rolePresets.general.workDescription, ''); assert.equal(a.rolePresets.general.studyDescription, '');
  for (const id of factoryIds.slice(1)) {
    const role = a.rolePresets[id];
    assert.ok(role.name.length > 0 && role.name.length <= 48);
    assert.ok(role.workDescription.length > 40 && role.workDescription.length <= 1000);
    assert.ok(role.studyDescription.length > 40 && role.studyDescription.length <= 1000);
  }
  a.rolePresets.accountant.name = 'My accounting'; delete a.rolePresets.student;
  assert.equal(b.rolePresets.accountant.name, 'Accountant'); assert.ok(b.rolePresets.student);
  assert.equal(C.ROLE_PRESETS.accountant.name, 'Accountant'); assert.ok(C.ROLE_PRESETS.student);
});
test('the role library can be edited, emptied or partially deleted without recreating removed presets', () => {
  const s = C.sanitize({rolePresets: {accountant: {name: ' Client accounts ', workDescription: ' Audit workflows ', studyDescription: '  '}, 'custom-consultant': {name: 'Consultant', workDescription: '', studyDescription: 'Consulting research'}}, lastRolePreset: 'accountant'});
  assert.deepEqual(s.rolePresets, {accountant: {name: 'Client accounts', workDescription: 'Audit workflows', studyDescription: ''}, 'custom-consultant': {name: 'Consultant', workDescription: '', studyDescription: 'Consulting research'}});
  assert.equal(s.lastRolePreset, 'accountant'); assert.equal(s.rolePresets.general, undefined);
  assert.deepEqual(C.sanitize({rolePresets: {}}).rolePresets, {});
  const deleted = C.sanitize({...s, rolePresets: {'custom-consultant': s.rolePresets['custom-consultant']}});
  assert.equal(deleted.rolePresets.accountant, undefined); assert.equal(deleted.lastRolePreset, null);
});
test('role preset validation bounds records, rejects unsafe IDs and falls back only for an invalid library root', () => {
  const records = JSON.parse('{"__proto__":{"name":"Unsafe","workDescription":"x","studyDescription":"y"}}');
  Object.assign(records, {unknown: {name: 'Unknown', workDescription: '', studyDescription: ''}, 'custom-empty': {name: '  ', workDescription: '', studyDescription: ''}, 'custom-missing': {name: 'Missing', workDescription: ''}, 'custom-wrong': {name: 'Wrong', workDescription: false, studyDescription: ''}, 'custom-long': {name: 'n'.repeat(80), workDescription: 'w'.repeat(1200), studyDescription: 's'.repeat(1500)}});
  for (let i = 0; i < 24; i++) records[`custom-role-${i}`] = {name: `Role ${i}`, workDescription: '', studyDescription: ''};
  const s = C.sanitize({rolePresets: records, lastRolePreset: '__proto__'});
  assert.equal(Object.keys(s.rolePresets).length, 20); assert.equal(Object.hasOwn(s.rolePresets, '__proto__'), false);
  for (const key of ['unknown', 'custom-empty', 'custom-missing', 'custom-wrong']) assert.equal(s.rolePresets[key], undefined);
  assert.equal(s.rolePresets['custom-long'].name.length, 48); assert.equal(s.rolePresets['custom-long'].workDescription.length, 1000); assert.equal(s.rolePresets['custom-long'].studyDescription.length, 1000);
  assert.equal(s.lastRolePreset, null);
  for (const rolePresets of [undefined, null, [], 'invalid', false, new Date(), Object.create({})]) assert.deepEqual(C.sanitize({rolePresets}).rolePresets, C.defaults().rolePresets);
  const foreign = require('node:vm').runInNewContext('({accountant:{name:"Foreign realm",workDescription:"Accounting",studyDescription:""}})');
  assert.equal(C.sanitize({rolePresets: foreign}).rolePresets.accountant.name, 'Foreign realm', 'plain records from Chrome message/VM realms remain valid');
});
test('role library edits or deletion do not silently change the applied Work and Study intent descriptions', () => {
  const intentDescriptions = {work: 'Accessible website delivery', study: 'Contract law'};
  const s = C.sanitize({rolePresets: {designer: {name: 'My designer preset', workDescription: 'Typography', studyDescription: 'Color theory'}}, lastRolePreset: 'designer', intentDescriptions});
  assert.equal(s.intentDescriptions.work, intentDescriptions.work); assert.equal(s.intentDescriptions.study, intentDescriptions.study);
  const deleted = C.sanitize({...s, rolePresets: {}});
  assert.equal(deleted.lastRolePreset, null); assert.deepEqual(deleted.intentDescriptions, s.intentDescriptions);
  assert.deepEqual(C.defaults().rolePresets, C.ROLE_PRESETS, 'factory reset can restore the full original preset library');
});
test('old settings gain role presets while retaining their already-applied descriptions and custom intents', () => {
  const s = C.sanitize({mode: 'custom-lab', newTabMode: 'music', intentDescriptions: {work: 'Laboratory operations', study: 'Molecular biology'}, customIntents: {'custom-lab': {name: 'Lab', description: 'Laboratory science'}}, customTopics: {'custom-lab': 'microscopy'}, countModes: {'custom-lab': false}});
  assert.deepEqual(s.rolePresets, C.ROLE_PRESETS); assert.equal(s.lastRolePreset, null);
  assert.equal(s.intentDescriptions.work, 'Laboratory operations'); assert.equal(s.intentDescriptions.study, 'Molecular biology');
  assert.equal(s.customIntents['custom-lab'].name, 'Lab'); assert.equal(s.customIntents['custom-lab'].icon, 'compass');
  assert.equal(s.mode, 'custom-lab'); assert.equal(s.customTopics['custom-lab'], 'microscopy'); assert.equal(s.countModes['custom-lab'], false);
});
test('the optional template library provides eighteen focused intents and only allowed Unicode icons', () => {
  const ids = ['gaming', 'tv-film', 'maker', 'ai', 'news', 'travel', 'cooking', 'fitness', 'art-design', 'photography', 'languages', 'science', 'history', 'finance', 'nature', 'diy-repair', 'books', 'wellbeing'];
  assert.deepEqual(Object.keys(C.INTENT_TEMPLATES), ids);
  for (const record of Object.values(C.INTENT_TEMPLATES)) {
    assert.ok(record.name && record.name.length <= 48); assert.ok(record.description.length > 30 && record.description.length <= 1000);
    assert.equal(record.symbol, C.INTENT_ICONS[record.icon]); assert.ok(!/[<>]/.test(record.symbol));
  }
  assert.equal(C.INTENT_TEMPLATES['tv-film'].name, 'TV & Film'); assert.equal(C.INTENT_TEMPLATES.maker.name, 'Making & Building');
  assert.match(C.INTENT_TEMPLATES.maker.description, /physical and digital/); assert.match(C.INTENT_TEMPLATES.ai.name, /Artificial Intelligence/);
  assert.deepEqual(Object.keys(C.modes(C.defaults())), ['work', 'study', 'music'], 'templates are optional and do not fill the initial mode list');
});
test('custom intents preserve allowed icons and template identity, default old icons safely and remain independent of the template', () => {
  const template = C.INTENT_TEMPLATES.gaming;
  const s = C.sanitize({customIntents: {'custom-gaming': {name: 'Strategy games', description: 'Turn-based strategy and historical games', icon: template.icon, templateId: 'gaming'}, 'custom-old': {name: 'Older intent', description: 'Microscopy'}, 'custom-unsafe': {name: 'Safe', description: 'Safe topic', icon: 'https://example.com/tracker.svg', templateId: 'unknown'}}});
  assert.equal(s.customIntents['custom-gaming'].icon, 'game'); assert.equal(s.customIntents['custom-gaming'].templateId, 'gaming');
  assert.equal(C.modes(s)['custom-gaming'].symbol, C.INTENT_ICONS.game); assert.equal(s.customIntents['custom-gaming'].name, 'Strategy games');
  assert.equal(s.customIntents['custom-old'].icon, 'compass'); assert.equal(s.customIntents['custom-unsafe'].icon, 'compass'); assert.equal(s.customIntents['custom-unsafe'].templateId, undefined);
  assert.equal(C.INTENT_TEMPLATES.gaming.name, 'Gaming'); assert.equal(C.INTENT_TEMPLATES.gaming.description, template.description);
});
test('intent ordering keeps valid unique IDs, appends missing modes and follows custom-intent edits and removal', () => {
  const s = C.sanitize({customIntents: {'custom-books': {name: 'Reading', description: 'Literature'}, 'custom-maker': {name: 'Projects', description: 'Physical and digital building'}}, intentOrder: ['custom-maker', 'music', 'custom-maker', 'missing', 'leisure', 'off', null, 1]});
  assert.deepEqual(s.intentOrder, ['custom-maker', 'music', 'work', 'study', 'custom-books']);
  assert.deepEqual(Object.keys(C.modes(s)), s.intentOrder);
  const removed = C.sanitize({...s, customIntents: {'custom-books': s.customIntents['custom-books']}});
  assert.deepEqual(removed.intentOrder, ['music', 'work', 'study', 'custom-books']);
  assert.deepEqual(C.sanitize({intentOrder: 'music'}).intentOrder, ['work', 'study', 'music']);
  const defaults = C.defaults(); defaults.intentOrder.reverse(); assert.deepEqual(C.defaults().intentOrder, ['work', 'study', 'music']);
});
test('legacy Leisure selections fall back to Work and old Leisure-only settings are removed', () => {
  const s = C.sanitize({mode: 'leisure', newTabMode: 'leisure', intentNames: {leisure: 'Downtime'}, intentDescriptions: {leisure: 'Cooking'}, customTopics: {leisure: 'sourdough'}, channels: {leisure: 'A channel'}, countModes: {leisure: false}, intentOrder: ['leisure', 'music']});
  assert.equal(s.mode, 'work'); assert.equal(s.newTabMode, 'work'); assert.equal(C.initialMode(s), 'work');
  assert.equal(C.validMode('leisure', s), false); assert.equal(C.MODES.leisure, undefined);
  for (const field of ['intentNames', 'intentDescriptions', 'customTopics', 'channels', 'countModes']) assert.equal(s[field].leisure, undefined);
  assert.deepEqual(s.intentOrder, ['music', 'work', 'study']);
});

test('retired reminder preferences are discarded without changing timer policy', () => {
  for (const timerReminders of [true, false]) {
    const settings = C.sanitize({timerReminders, dailyMinutes: 45, countPlayback: false, countModes: {music: true, work: false}});
    assert.equal(Object.hasOwn(settings, 'timerReminders'), false);
    assert.equal(settings.dailyMinutes, 45); assert.equal(settings.countPlayback, false);
    assert.equal(settings.countModes.music, true); assert.equal(settings.countModes.work, false);
  }
});

test('matching-only exemptions are strictly opt-in per valid intent and do not change ordinary count rules', () => {
  const s = C.sanitize({customIntents: {'custom-law': {name: 'Law', description: 'Legal lectures'}}, matchOnlyModes: {work: true, study: 'true', music: 1, off: true, 'custom-law': true, invalid: true}, countModes: {work: false}});
  assert.equal(s.matchOnlyModes.work, true); assert.equal(s.matchOnlyModes.study, false); assert.equal(s.matchOnlyModes.music, false);
  assert.equal(s.matchOnlyModes['custom-law'], true); assert.equal(s.matchOnlyModes.off, undefined); assert.equal(s.matchOnlyModes.invalid, undefined);
  assert.equal(C.countsMode(s, 'work'), false); assert.equal(C.countsMode(s, 'study'), true);
  assert.ok(Object.values(C.defaults().matchOnlyModes).every(value => value === false));
});

test('all allowed custom icon IDs have shared trusted outline markup without remote assets', () => {
  assert.deepEqual(Object.keys(C.INTENT_ICON_PATHS), Object.keys(C.INTENT_ICONS));
  for (const markup of Object.values(C.INTENT_ICON_PATHS)) {
    assert.match(markup, /<(path|rect|circle|ellipse)\b/);
    assert.doesNotMatch(markup, /<script|foreignObject|\bhref=|\bon[a-z]+=|<image/i);
  }
  assert.equal(C.INTENT_ICON_PATHS.book, C.MODE_ICONS.study);
  assert.equal(C.INTENT_ICON_PATHS.music, C.MODE_ICONS.music);
});

test('channel rules preserve comma/quote names and exact matching with distraction precedence',()=>{
 const names=['Science, "and" More','  Another Teacher  ','another teacher'];
 const encoded=C.formatChannelTerms(names);assert.deepEqual(C.channelTerms(encoded),['science, "and" more','another teacher']);
 assert.deepEqual(C.channelTerms('Creator one,Creator two\nCreator THREE'),['creator one','creator two','creator three']);
 const settings={...C.defaults(),mode:'study',channels:{study:encoded}};
 assert.equal(C.classify(video('A day out','Science, "and" More'),settings).visible,true);
 assert.equal(C.classify(video('A day out','Science'),settings).visible,false,'a comma-containing creator is not split into partial names');
 assert.equal(C.classify(video('A day out','Science, "and" More',true),settings).visible,false);
 assert.equal(C.classify(video('You won’t believe it','Science, "and" More'),settings).visible,false);
 assert.equal(C.classify(video('Blocked phrase','Science, "and" More'),{...settings,blockedTerms:'blocked phrase'}).visible,false);
});


test('Focus is a persistent utility mode with no semantic category or channel exceptions',()=>{
 const s=C.sanitize({mode:'focus',newTabMode:'focus',matchOnlyModes:{focus:true},channels:{focus:'Any creator'},countModes:{focus:false}});
 assert.equal(s.mode,'focus');assert.equal(C.initialMode(s),'focus');assert.equal(C.validMode('focus'),true);assert.equal(C.countsMode(s,'focus'),false);assert.equal(C.countsMode(C.defaults(),'focus'),true);
 assert.equal(C.modes(s).focus,undefined,'Focus cannot appear as an inferred video topic');assert.equal(s.matchOnlyModes.focus,undefined);assert.equal(s.channels.focus,undefined);
 assert.equal(C.classify(video('A lesson','Any creator'),s).visible,false);
});
