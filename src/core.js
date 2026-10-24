/* Shared, dependency-free policy. Runs in extension pages, content scripts and tests. */
(() => {
  const MODES = {
    work: {name: 'Work', symbol: '⌘', description: 'Build something good.', topics: ['coding', 'programming', 'software', 'developer', 'javascript', 'typescript', 'python', 'react', 'engineering', 'design', 'figma', 'productivity', 'business', 'marketing', 'excel', 'career', 'startup', 'data science', 'web development', 'sql', 'git', 'docker', 'architecture', 'css', 'html']},
    study: {name: 'Study', symbol: '↗', description: 'Make room for a new idea.', topics: ['lecture', 'lesson', 'course', 'tutorial', 'learn', 'explained', 'education', 'math', 'calculus', 'physics', 'chemistry', 'biology', 'history', 'science', 'language', 'university', 'exam', 'study', 'algebra', 'statistics', 'philosophy', 'documentary']},
    music: {name: 'Music', symbol: '♫', description: 'Find your rhythm.', topics: ['music', 'song', 'album', 'playlist', 'lofi', 'lo-fi', 'jazz', 'piano', 'guitar', 'ambient', 'soundtrack', 'symphony', 'concert', 'orchestra', 'acoustic', 'beats', 'chillhop', 'classical', 'dj set', 'live set', 'lyrics', 'official audio', 'official video', 'synth', 'bossa nova']},
    leisure: {name: 'Leisure', symbol: '☀', description: 'A little downtime, on purpose.', topics: ['comedy', 'funny', 'gaming', 'gameplay', 'travel', 'cooking', 'recipe', 'film', 'movie', 'review', 'vlog', 'sports', 'football', 'basketball', 'craft', 'garden', 'art', 'hiking', 'photography', 'podcast', 'animation', 'chess', 'minecraft', 'entertainment', 'food', 'tour', 'sketch']}
  };
  const defaults = () => ({mode: 'work', hideShorts: true, hideClickbait: true, limitEnabled: true, dailyMinutes: 60, countPlayback: true, customTopics: Object.fromEntries(Object.keys(MODES).map(k => [k, ''])), channels: Object.fromEntries(Object.keys(MODES).map(k => [k, ''])), blockedTerms: ''});
  function sanitize(input = {}) {
    const out = defaults();
    if (Object.hasOwn(MODES, input.mode) || input.mode === 'off') out.mode = input.mode;
    for (const key of ['hideShorts', 'hideClickbait', 'limitEnabled', 'countPlayback']) if (typeof input[key] === 'boolean') out[key] = input[key];
    if (Number.isFinite(Number(input.dailyMinutes))) out.dailyMinutes = Math.max(1, Math.min(1440, Math.round(Number(input.dailyMinutes))));
    for (const field of ['customTopics', 'channels']) for (const mode of Object.keys(MODES)) out[field][mode] = String(input[field]?.[mode] || '').slice(0, 4000);
    out.blockedTerms = String(input.blockedTerms || '').slice(0, 4000);
    return out;
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
    const topics = [...MODES[settings.mode].topics, ...terms(settings.customTopics[settings.mode])];
    return topics.some(t => matches(video.title, t)) ? {visible: true, reason: settings.mode} : {visible: false, reason: 'outside mode'};
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
  globalThis.IntentCore = {MODES, defaults, sanitize, normalize, terms, matches, clickbait, classify, dayKey, nextMidnight, advanceUsage, isYouTube, snapshot};
})();
