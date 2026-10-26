/* Shared, dependency-free policy. Runs in extension pages, content scripts and tests. */
(() => {
  const MODES = {
    work: {name: 'Work', symbol: '⌘', description: 'Build something good.', topics: ['coding', 'programming', 'software', 'developer', 'javascript', 'typescript', 'python', 'react', 'engineering', 'design', 'figma', 'productivity', 'business', 'marketing', 'excel', 'career', 'startup', 'data science', 'web development', 'sql', 'git', 'docker', 'architecture', 'css', 'html']},
    study: {name: 'Study', symbol: '↗', description: 'Make room for a new idea.', topics: ['lecture', 'lesson', 'course', 'tutorial', 'learn', 'explained', 'education', 'math', 'calculus', 'physics', 'chemistry', 'biology', 'history', 'science', 'language', 'university', 'exam', 'study', 'algebra', 'statistics', 'philosophy', 'documentary']},
    music: {name: 'Music', symbol: '♫', description: 'Find your rhythm.', topics: ['music', 'song', 'album', 'playlist', 'lofi', 'lo-fi', 'jazz', 'piano', 'guitar', 'ambient', 'soundtrack', 'symphony', 'concert', 'orchestra', 'acoustic', 'beats', 'chillhop', 'classical', 'dj set', 'live set', 'lyrics', 'official audio', 'official video', 'synth', 'bossa nova']},
  };
  const MODE_ICONS = Object.freeze({
    work: '<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 12c5 3 11 3 16 0M12 12v3"/>',
    study: '<path d="M12 6C9 3 5 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 2v14"/>',
    music: '<path d="M5 13v-2a7 7 0 0 1 14 0v2"/><rect x="3" y="11" width="4" height="9" rx="2"/><rect x="17" y="11" width="4" height="9" rx="2"/>',
  });
  const MAX_CUSTOM_INTENTS = 24;
  const INTENT_ICONS = Object.freeze({code: '⌘', book: '▤', music: '♫', compass: '◈', game: '♟', film: '▣', tools: '⚒', sparkles: '✦', news: '▥', plane: '✈', food: '♨', fitness: '⚡', palette: '◉', camera: '▧', language: '文', science: '⚛', history: '⌛', finance: '¤', leaf: '❧', heart: '♡'});
  // Trusted shared 24px outline icons, used by picker, tiles and YouTube controls.
  const INTENT_ICON_PATHS = Object.freeze({
    code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
    book: MODE_ICONS.study,
    music: MODE_ICONS.music,
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
    game: '<path d="M8 7h8c3 0 4 3 5 8 1 4-2 5-4 2l-1-1H8l-1 1c-2 3-5 2-4-2 1-5 2-8 5-8ZM7 10v5m-2.5-2.5h5"/><circle cx="16" cy="11" r=".75"/><circle cx="18" cy="14" r=".75"/>',
    film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4m-4 8h4M17 8h4m-4 8h4M7 12h10"/>',
    tools: '<path d="m14 5 3 3 4-4a6 6 0 0 1-8 8L6 20a2.1 2.1 0 0 1-3-3l8-7a6 6 0 0 1 8-8l-5 3Z"/>',
    sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4M3 19v3m-1.5-1.5h3"/>',
    news: '<path d="M5 3h14v17H5a2 2 0 0 1-2-2V7h2m14 13a2 2 0 0 0 2-2V7h-2M8 7h8M8 11h3v3H8zM14 11h2m-2 3h2M8 17h8"/>',
    plane: '<path d="m21 3-6 18-4-8-8-4L21 3ZM11 13l5-5"/>',
    food: '<path d="M4 3v6c0 3 6 3 6 0V3M7 3v18M15 12h5V3c-4 2-5 6-5 9ZM20 12v9"/>',
    fitness: '<path d="m8 8 8 8M6 4l-3 3 3 3m1-7 3 3-4 4-3-3m14 7 4 4-3 3-4-4m4-4 3 3-3 3M4 4l-2-2m18 18 2 2"/>',
    palette: '<path d="M21 12a9 9 0 1 0-9 9h1a2 2 0 0 0 1-3c-1-2 0-3 2-3h2a3 3 0 0 0 3-3Z"/><circle cx="7" cy="10" r="1"/><circle cx="10" cy="6" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="6" cy="15" r="1"/>',
    camera: '<path d="M8 5 10 2h4l2 3h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4Z"/><circle cx="12" cy="13" r="4"/>',
    language: '<path d="M3 5h12M9 3v2M5 5c0 6 4 9 9 11M13 5c0 5-4 10-9 12M14 21l4-10 4 10M15.5 17h5"/>',
    science: '<ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1"/>',
    history: '<path d="M6 3h12M6 21h12M7 3v4c0 3 4 3 5 5-1 2-5 2-5 5v4M17 3v4c0 3-4 3-5 5 1 2 5 2 5 5v4M9 17h6"/>',
    finance: '<circle cx="12" cy="12" r="9"/><path d="M15 7h-4a2.5 2.5 0 0 0 0 5h2a2.5 2.5 0 0 1 0 5H9M12 5v14"/>',
    leaf: '<path d="M21 3c0 10-3 17-10 17a7 7 0 0 1-7-7C4 6 11 3 21 3ZM3 21l13-13M8 16v-5m0 5h5"/>',
    heart: '<path d="M20.5 4.5a5.2 5.2 0 0 0-7.5 0L12 5.6l-1-1.1a5.2 5.2 0 0 0-7.5 7.3L12 21l8.5-9.2a5.2 5.2 0 0 0 0-7.3Z"/>'
  });
  const INTENT_TEMPLATES = Object.freeze(Object.fromEntries(Object.entries({
    gaming: {name: 'Gaming', icon: 'game', description: 'Video games, gameplay, game reviews, strategy guides, walkthroughs, esports and gaming hardware.'},
    'tv-film': {name: 'TV & Film', icon: 'film', description: 'Film and television reviews, thoughtful criticism, story analysis, filmmaker interviews, production insights and recommendations about cinema and television.'},
    maker: {name: 'Making & Building', icon: 'tools', description: 'Hands-on making and building, both physical and digital: woodworking, metalworking, electronics, robotics, 3D printing, crafts, creative coding and practical project build logs.'},
    ai: {name: 'Artificial Intelligence', icon: 'sparkles', description: 'Artificial intelligence, machine learning, neural networks, language models, practical AI programming, tools, evaluation, research papers and technical explanations.'},
    news: {name: 'News', icon: 'news', description: 'Reported current events, public affairs, world news, science and business journalism, interviews and analysis explaining recent developments.'},
    travel: {name: 'Travel', icon: 'plane', description: 'Travel guides, destination planning, local culture, itineraries, practical travel advice and stories about exploring new places.'},
    cooking: {name: 'Cooking', icon: 'food', description: 'Cooking recipes, ingredient preparation, kitchen techniques, baking, meal planning and practical culinary skills.'},
    fitness: {name: 'Fitness', icon: 'fitness', description: 'Exercise routines, strength training, mobility, sports conditioning, movement technique and building consistent fitness habits.'},
    'art-design': {name: 'Art & Design', icon: 'palette', description: 'Drawing, painting, illustration, graphic and product design, typography, color, composition, creative processes and visual art critiques.'},
    photography: {name: 'Photography', icon: 'camera', description: 'Photography techniques, cameras, lighting, composition, photo editing and visual storytelling through still images.'},
    languages: {name: 'Languages', icon: 'language', description: 'Language lessons, vocabulary, grammar, conversation, listening practice, pronunciation and learning to communicate in another language.'},
    science: {name: 'Science', icon: 'science', description: 'Scientific explanations and experiments, physics, chemistry, biology, astronomy, scientific discoveries and understanding research.'},
    history: {name: 'History', icon: 'history', description: 'Historical documentaries, past civilizations, social and political history, historical evidence and careful analysis of events from the past.'},
    finance: {name: 'Finance', icon: 'finance', description: 'Financial education, budgeting, saving, investing principles, economic concepts and understanding personal and business finances.'},
    nature: {name: 'Nature', icon: 'leaf', description: 'Wildlife, ecology, conservation, geology, natural environments and observing and exploring the outdoors.'},
    'diy-repair': {name: 'DIY & Repair', icon: 'tools', description: 'Practical repairs and maintenance for homes, bicycles, appliances and technology, troubleshooting problems and restoring useful objects.'},
    books: {name: 'Books', icon: 'book', description: 'Book reviews, literary analysis, reading recommendations, author interviews, writing and thoughtful conversations about literature.'},
    wellbeing: {name: 'Wellbeing', icon: 'heart', description: 'Mindfulness, stress management, sleep routines, emotional wellbeing, healthy daily habits and practical self-care.'}
  }).map(([id, record]) => [id, Object.freeze({...record, symbol: INTENT_ICONS[record.icon]})])));
  const ROLE_PRESETS = Object.freeze(Object.fromEntries(Object.entries({
    general: {name: 'General', workDescription: '', studyDescription: ''},
    'software-engineer': {name: 'Software engineer', workDescription: 'Practical software engineering: implementing, testing and debugging applications, reviewing code, designing system architecture, maintaining production services and collaborating on software projects.', studyDescription: 'Learning computer science, algorithms, data structures, programming languages, operating systems, databases and software design through technical lessons and worked examples.'},
    accountant: {name: 'Accountant', workDescription: 'Accounting workflows: bookkeeping, reconciliations, financial reporting, spreadsheets, accounting systems, audit preparation and tax compliance work for accounting professionals.', studyDescription: 'Learning accounting principles, double-entry bookkeeping, financial statement analysis, cost accounting, auditing and tax concepts through lessons and worked examples.'},
    designer: {name: 'Designer', workDescription: 'Graphic and product design workflows, typography, layout, accessibility, prototyping, design systems, usability research and completing client design deliverables.', studyDescription: 'Learning visual design fundamentals, color theory, typography, interaction design, human-computer interaction and practical design critiques.'},
    researcher: {name: 'Researcher', workDescription: 'Academic research workflows, literature reviews, research methods, experimental design, data analysis, reproducible scientific coding, paper writing and research communication.', studyDescription: 'Deep explanations of scientific concepts, statistics, research methodology and critically evaluating scholarly papers, evidence and experimental results.'},
    student: {name: 'Student', workDescription: 'Completing assignments, planning coursework, taking effective notes, writing essays, using study tools and managing student projects.', studyDescription: 'University and school lessons, worked problems, exam preparation, mathematics, sciences, humanities and language learning.'}
  }).map(([id, record]) => [id, Object.freeze(record)])));
  function plainObject(value) {
    if (!value || typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || Object.hasOwn(prototype, 'constructor') && typeof prototype.constructor === 'function' && Function.prototype.toString.call(prototype.constructor) === Function.prototype.toString.call(Object);
  }
  const factoryRolePresets = () => Object.fromEntries(Object.entries(ROLE_PRESETS).map(([id, record]) => [id, {...record}]));
  function roleRecords(input) {
    if (!plainObject(input)) return factoryRolePresets();
    const records = {};
    for (const [id, value] of Object.entries(input)) {
      if (!(Object.hasOwn(ROLE_PRESETS, id) || /^custom-[a-z0-9-]{1,48}$/.test(id)) || !plainObject(value) || typeof value.name !== 'string' || typeof value.workDescription !== 'string' || typeof value.studyDescription !== 'string') continue;
      const name = value.name.trim().slice(0, 48);
      if (!name) continue;
      records[id] = {name, workDescription: value.workDescription.trim().slice(0, 1000), studyDescription: value.studyDescription.trim().slice(0, 1000)};
      if (Object.keys(records).length === 20) break;
    }
    return records;
  }
  function customRecords(input) {
    const records = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return records;
    for (const [id, value] of Object.entries(input)) {
      if (!/^custom-[a-z0-9-]{1,48}$/.test(id) || !value || typeof value.name !== 'string' || typeof value.description !== 'string') continue;
      const name = value.name.trim().slice(0, 48), description = value.description.trim().slice(0, 1000);
      if (!name || !description) continue;
      const icon = Object.hasOwn(INTENT_ICONS, value.icon) ? value.icon : 'compass';
      records[id] = {name, description, icon, ...(Object.hasOwn(INTENT_TEMPLATES, value.templateId) ? {templateId: value.templateId} : {})};
      if (Object.keys(records).length === MAX_CUSTOM_INTENTS) break;
    }
    return records;
  }
  const validMode = (mode, settings = {}) => Object.hasOwn(MODES, mode) || mode === 'off' || Object.hasOwn(customRecords(settings.customIntents), mode);
  function orderIds(ids, input) {
    return [...new Set([...(Array.isArray(input) ? input.filter(id => typeof id === 'string' && ids.includes(id)) : []), ...ids])];
  }
  const descriptionTerms = text => terms(String(text || '').replace(/[;.!?]/g, ','));
  function modes(settings = {}) {
    const builtins = Object.fromEntries(Object.entries(MODES).map(([id, mode]) => {
      const description = typeof settings.intentDescriptions?.[id] === 'string' ? settings.intentDescriptions[id].trim().slice(0, 1000) : '';
      const name = typeof settings.intentNames?.[id] === 'string' ? settings.intentNames[id].trim().slice(0, 48) : '';
      return [id, {...mode, name: name || mode.name, description: description || mode.description, topics: description ? descriptionTerms(description) : [...mode.topics]}];
    }));
    const custom = Object.fromEntries(Object.entries(customRecords(settings.customIntents)).map(([id, record]) => [id, {...record, symbol: INTENT_ICONS[record.icon], topics: descriptionTerms(record.description)}]));
    const definitions = {...builtins, ...custom};
    return Object.fromEntries(orderIds(Object.keys(definitions), settings.intentOrder).map(id => [id, definitions[id]]));
  }
  const defaults = () => ({mode: 'work', newTabMode: 'last', metadataLimit: 4, rolePresets: factoryRolePresets(), lastRolePreset: null, intentOrder: Object.keys(MODES), customIntents: {}, intentNames: Object.fromEntries(Object.entries(MODES).map(([id, mode]) => [id, mode.name])), intentDescriptions: Object.fromEntries(Object.keys(MODES).map(k => [k, ''])), countModes: {work: true, study: true, music: false, off: true}, matchOnlyModes: Object.fromEntries(Object.keys(MODES).map(id => [id, false])), hideShorts: true, hideClickbait: true, limitEnabled: true, dailyMinutes: 60, countPlayback: true, customTopics: Object.fromEntries(Object.keys(MODES).map(k => [k, ''])), channels: Object.fromEntries(Object.keys(MODES).map(k => [k, ''])), blockedTerms: ''});
  function sanitize(input = {}) {
    const out = defaults();
    out.rolePresets = roleRecords(input.rolePresets);
    if (typeof input.lastRolePreset === 'string' && Object.hasOwn(out.rolePresets, input.lastRolePreset)) out.lastRolePreset = input.lastRolePreset;
    out.customIntents = customRecords(input.customIntents);
    for (const mode of Object.keys(MODES)) if (typeof input.intentNames?.[mode] === 'string' && input.intentNames[mode].trim()) out.intentNames[mode] = input.intentNames[mode].trim().slice(0, 48);
    for (const mode of Object.keys(MODES)) if (typeof input.intentDescriptions?.[mode] === 'string') out.intentDescriptions[mode] = input.intentDescriptions[mode].trim().slice(0, 1000);
    const ids = [...Object.keys(MODES), ...Object.keys(out.customIntents)];
    out.intentOrder = orderIds(ids, input.intentOrder);
    if (validMode(input.mode, out)) out.mode = input.mode;
    if (input.newTabMode === 'last' || validMode(input.newTabMode, out)) out.newTabMode = input.newTabMode;
    else if (input.newTabMode === 'leisure') out.newTabMode = 'work';
    for (const mode of [...ids, 'off']) out.countModes[mode] = typeof input.countModes?.[mode] === 'boolean' ? input.countModes[mode] : mode !== 'music';
    out.matchOnlyModes = Object.fromEntries(ids.map(id => [id, input.matchOnlyModes?.[id] === true]));
    for (const key of ['hideShorts', 'hideClickbait', 'limitEnabled', 'countPlayback']) if (typeof input[key] === 'boolean') out[key] = input[key];
    if (Number.isFinite(Number(input.dailyMinutes))) out.dailyMinutes = Math.max(1, Math.min(1440, Math.round(Number(input.dailyMinutes))));
    if ((typeof input.metadataLimit === 'number' || typeof input.metadataLimit === 'string' && input.metadataLimit.trim()) && Number.isFinite(Number(input.metadataLimit))) out.metadataLimit = Math.max(0, Math.min(40, Math.round(Number(input.metadataLimit))));
    for (const field of ['customTopics', 'channels']) for (const mode of ids) out[field][mode] = String(input[field]?.[mode] || '').slice(0, 4000);
    out.blockedTerms = String(input.blockedTerms || '').slice(0, 4000);
    return out;
  }
  function initialMode(settings = {}) {
    const s = sanitize(settings);
    return s.newTabMode === 'last' ? s.mode : s.newTabMode;
  }
  function countsMode(settings = {}, mode = settings.mode) {
    if (!validMode(mode, settings)) return true;
    const value = settings.countModes?.[mode];
    return typeof value === 'boolean' ? value : mode !== 'music';
  }
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const terms = value => [...new Set(String(value || '').split(/[,\n]/).map(normalize).filter(Boolean))];
  function matches(text, term) {
    const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(normalize(text));
  }
  function clickbait(title) {
    const patterns = [/you won.?t believe/i, /what happens next/i, /changed my life/i, /they don.?t want you to know/i, /this changes everything/i, /gone (wrong|sexual)/i, /shocking (truth|reveal)/i, /doctors hate/i, /watch (this )?(before|until)/i, /the truth about/i, /i was wrong about/i, /\b(must watch|insane|mind.?blowing|unbelievable)\b/i, /[!?]{3,}/];
    if (patterns.some(p => p.test(title))) return true;
    const letters = String(title).replace(/[^a-zA-Z]/g, '');
    return letters.length >= 18 && letters.replace(/[^A-Z]/g, '').length / letters.length > .85;
  }
  function classify(video, settings) {
    if (settings.hideShorts && video.shorts) return {visible: false, reason: 'shorts'};
    if (!video.title?.trim()) return {visible: settings.mode === 'off', reason: 'loading'};
    if (terms(settings.blockedTerms).some(t => matches(`${video.title} ${video.channel || ''}`, t))) return {visible: false, reason: 'blocked term'};
    if (settings.hideClickbait && clickbait(video.title)) return {visible: false, reason: 'clickbait'};
    if (settings.mode === 'off') return {visible: true, reason: 'unfiltered'};
    if (terms(settings.channels[settings.mode]).includes(normalize(video.channel))) return {visible: true, reason: 'your channel'};
    const topics = [...(modes(settings)[settings.mode]?.topics || []), ...terms(settings.customTopics[settings.mode])];
    return topics.some(t => matches(`${video.title} ${video.description || ''}`, t)) ? {visible: true, reason: settings.mode} : {visible: false, reason: 'outside mode'};
  }
  function dayKey(now = Date.now()) {
    const d = new Date(now);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function nextMidnight(now = Date.now()) {
    const d = new Date(now);
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }
  function advanceUsage(days, from, to, counting) {
    const out = {...days};
    if (counting && Number.isFinite(from) && to > from) {
      // A delayed alarm after sleep must not charge hours of inactive time.
      let cursor = Math.max(from, to - 35000);
      while (cursor < to) {
        const end = Math.min(to, nextMidnight(cursor));
        const key = dayKey(cursor);
        out[key] = Math.max(0, Number(out[key]) || 0) + end - cursor;
        cursor = end;
      }
    }
    return Object.fromEntries(Object.keys(out).sort().slice(-14).map(k => [k, out[k]]));
  }
  function isYouTube(url) {
    try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) && ['youtube.com', 'youtube-nocookie.com'].some(h => u.hostname === h || u.hostname.endsWith(`.${h}`)); } catch { return false; }
  }
  function snapshot(settings, days, now = Date.now()) {
    const usedMs = days[dayKey(now)] || 0;
    return {settings, usedMs, remainingMs: Math.max(0, settings.dailyMinutes * 60000 - usedMs), blocked: settings.limitEnabled && usedMs >= settings.dailyMinutes * 60000, day: dayKey(now), resetAt: nextMidnight(now)};
  }
  globalThis.IntentCore = {MODES, MODE_ICONS, ROLE_PRESETS, INTENT_TEMPLATES, INTENT_ICONS, INTENT_ICON_PATHS, MAX_CUSTOM_INTENTS, modes, validMode, defaults, sanitize, initialMode, countsMode, normalize, terms, matches, clickbait, classify, dayKey, nextMidnight, advanceUsage, isYouTube, snapshot};
})();
