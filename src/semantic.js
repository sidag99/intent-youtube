/* Mode descriptions and similarity policy shared by the bundled model worker and tests. */
(() => {
  const C = IntentCore;
  const PROFILES = {
    work: ['Software development, coding applications and engineering computer systems.', 'Professional skills, careers, jobs and business strategy.', 'Designing products, websites, user interfaces and creative professional workflows.', 'Productivity, organizing projects and effective work habits.', 'Data analysis, spreadsheets, marketing and running a company.', 'Accounting, bookkeeping, financial reporting, auditing and professional spreadsheet workflows.', 'Project management, leadership, operations, sales, consulting and collaborating with clients.', 'Testing, debugging, maintaining software, cybersecurity, cloud services and technical problem solving.', 'Professional writing, presentations, communication, negotiation and improving job skills.'],
    study: ['Academic lessons, university lectures and studying for exams.', 'Learning mathematics, physics, chemistry, biology and other sciences.', 'History lessons, philosophical arguments and language-learning instruction with concepts and examples.', 'Structured lessons and worked examples that teach a specific academic subject.', 'Academic research methods: designing experiments, evaluating evidence, statistics and scholarly papers.', 'Economics, psychology, sociology, law, literature, geography and the humanities explained for learners.', 'Computer science lessons, algorithms, data structures, programming concepts and worked examples.', 'Solving problems, deriving formulas, proofs, demonstrations, experiments and building an understanding of a subject.', 'Neuroscience, anatomy, ecology, geology, astronomy and scientific concepts explained clearly.', 'University lectures, scholarly analysis and classroom lessons on political science, political theory and government institutions.', 'University lectures on biology, evolution, cells, metabolism and the origin of life.', 'Physics lessons on heat, energy, motion, electricity and scientific explanations of physical phenomena.'],
    music: ['Listening to songs, albums, music playlists and musical performances.', 'Instrumental jazz, classical piano, orchestral music and acoustic guitar.', 'Ambient soundscapes, lo-fi beats and background music for concentration.', 'Live concerts, singers, bands, DJ sets and recorded music.', 'Hip hop, rap, pop, rock, metal, folk, blues, soul, funk, reggae and songs in different languages.', 'Electronic dance music, house, techno, trance, drum and bass, synthwave, remixes and musical DJ mixes.', 'Singing, vocal covers, choirs, opera, instrumental performances and karaoke versions of songs.', 'Composing, arranging, producing, recording and learning musical theory and instruments.', 'Acoustic song covers, fingerstyle guitar accompaniment and stripped-back vocal performances.'],
  };
  function text(video) {
    const tags = [...(video.hashtags || []), ...(video.keywords || [])].slice(0, 30).map(t => String(t).slice(0, 80)).join(', ');
    const description = String(video.description || '').slice(0, 1800).trim();
    // Bare Home recommendations often have only a vague title and creator name.
    // A science/business-sounding creator cannot supply the missing topic;
    // explicit user channel inclusions are handled separately in the worker.
    const channel = description.trim() || tags.trim() ? String(video.channel || '').slice(0, 160) : '';
    return `${String(video.title || '').slice(0, 500)}. Channel: ${channel}. ${tags ? 'Topics: ' + tags + '. ' : ''}${description}`;
  }
  function profiles(settings) {
    const s = C.sanitize(settings);
    return Object.fromEntries(Object.keys(C.modes(s)).map(mode => {
      const description = s.intentDescriptions[mode] || s.customIntents[mode]?.description;
      const template = C.defaultTemplate(s, mode);
      const examples = template ? [template.description, ...template.examples] : description ? [description] : PROFILES[mode];
      return [mode, [...examples, ...C.terms(s.customTopics[mode]).slice(0, 16).map(t => `Videos about ${t}.`)]];
    }));
  }
  function dot(a, b) { let sum = 0; for (let i = 0; i < a.length; i++) sum += a[i] * b[i]; return sum; }
  function nonMusicalAmbience(video) {
    const content = `${String(video?.title || '').slice(0, 500)} ${String(video?.description || '').slice(0, 1800)}`;
    const excludesMusic = /\b(?:no\s+(?:background\s+)?music|no\s+(?:talking|speech|voices?)\s+or\s+music|without\s+(?:any\s+)?music)\b/i.test(content);
    const naturalSounds = /\b(?:rain(?:fall)?|thunder(?:storm)?|ocean|waves|waterfalls?|forest|birds?|wind|nature|natural sounds?|asmr)\b/i.test(content);
    const performance = /\b(?:a cappella|singing|sung|vocal performance|(?:piano|guitar|violin|cello|saxophone|drum) performance)\b/i.test(content);
    return excludesMusic && naturalSounds && !performance;
  }
  function decide(vector, modeVectors, mode, customized = false, video) {
    const similarities = Object.fromEntries(Object.entries(modeVectors).map(([k, refs]) => [k, refs.map(ref => dot(vector, ref)).sort((a, b) => b - a)]));
    const scores = Object.fromEntries(Object.entries(similarities).map(([k, values]) => [k, values[0] || 0]));
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const selected = scores[mode] || 0;
    const other = Math.max(0, ...Object.entries(scores).filter(([k]) => k !== mode).map(([, score]) => score));
    // Similarities are not calibrated probabilities. Each intent qualifies independently; a higher score in another intent is not a veto.
    let accepted = customized ? selected >= .30 : selected >= .26;
    // A generic documentary/"solving" association alone is not study evidence.
    // Moderate matches need a second educational reference; this still allows
    // genuine lessons that also fit another intent, without a category veto.
    if (mode === 'study' && !customized) accepted = selected >= .40 || selected >= .25 && (similarities.study?.[1] || 0) >= .20;
    // Broad Music examples can match an incidental word such as "quiet" or
    // "live". Require a second musical reference for moderate scores, while
    // retaining strong specific performances and cross-intent overlap.
    if (mode === 'music' && !customized) accepted = accepted && (selected >= .40 || (similarities.music?.[1] || 0) >= .24) && !nonMusicalAmbience(video);
    return {accepted, uncertain: selected > .18 && (selected < .40 || !customized && Math.abs(selected - other) < .07), similarity: selected, alternativeSimilarity: other, categoryId: ranked[0]?.[0] || null, categorySimilarity: ranked[0]?.[1] || 0, categoryMargin: (ranked[0]?.[1] || 0) - (ranked[1]?.[1] || 0), categoryCandidates: ranked.slice(0, 2).map(([id, similarity]) => ({id, similarity}))};
  }
  globalThis.IntentSemantic = {PROFILES, text, profiles, dot, decide};
})();
