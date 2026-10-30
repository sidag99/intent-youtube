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
  // Specific language-learning scopes need evidence of the target language,
  // not just generic words such as practice, grammar or training. Teaching
  // German in English remains valid; the spoken/explanation language is not a veto.
  const LANGUAGE_NAMES = ['german|deutsch|deutsche|deutschen','english|anglais|englisch','french|français|francais|französisch','spanish|español|espanol|spanisch','italian|italiano|italienisch','portuguese|português|portugues','japanese|日本語','korean|한국어','chinese|mandarin|中文|汉语','arabic|العربية','russian|русский','hindi|हिन्दी|हिंदी','dutch|nederlands','swedish|svenska','norwegian|norsk','danish|dansk','finnish|suomi','polish|polski','turkish|türkçe|turkce','greek|ελληνικά','hebrew|עברית','vietnamese|tiếng việt','thai|ภาษาไทย','ukrainian|українська'].map(names => new RegExp(`(?<![\\p{L}\\p{N}])(?:${names})(?![\\p{L}\\p{N}])`, 'iu'));
  function referenceSupported(video, description) {
    if (!video || !description) return true;
    if (C.descriptionIssue(description)) return false;
    const scope = description.split(/\b(?:rather than|instead of|exclude|excluding|except|without)\b/i)[0]
      .replace(/\b(?:explained|taught|explanations?|subtitles?|instructions?)\s+in\s+(?:(?:simple|plain)\s+)?[\p{L}-]+/giu, '')
      .replace(/\bfor\s+(?:native\s+)?[\p{L}-]+\s+speakers\b/giu, '');
    const languageLearning = /\b(?:lessons?|grammar|pronunciation|vocabulary|conversation|listening|language|learn(?:ing)?|a[12]|b[12]|c[12])\b/i.test(scope);
    if (languageLearning) {
      const languages = LANGUAGE_NAMES.filter(pattern => pattern.test(scope));
      const tags = [...(video.hashtags || []), ...(video.keywords || [])].map(tag => String(tag).replace(/^#/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^(?:learning|learn|speaking|speak|easy|slow|study)(?=[a-z])/i, ''));
      const evidence = [video.title, video.description, ...tags].join(' ');
      if (languages.length && !languages.some(pattern => pattern.test(evidence))) return false;
    }
    return true;
  }
  function scopeSupported(video, settings, mode) {
    if (!settings || !video) return true;
    const description = settings.intentDescriptions?.[mode] || settings.customIntents?.[mode]?.description || '';
    if (C.descriptionIssue(description) && C.descriptionIssue(`${description} ${settings.customTopics?.[mode] || ''}`)) return false;
    if (mode === 'study' && !description) {
      const content = `${video.title || ''} ${video.description || ''}`;
      const skit = /\b(?:pov|parody|comedy skit|comedy sketch)\b|\b(?:must|would)(?:['’]ve| have) been like\b/i.test(content);
      const teaching = /\b(?:lesson|lecture|tutorial|worked examples?|teaching|explaining|analysis of|learn how|course on)\b/i.test(content);
      if (skit && !teaching) return false;
    }
    if (C.defaultTemplate(settings, mode) === C.INTENT_TEMPLATES.fitness) {
      const content = `${video.title || ''} ${video.description || ''}`;
      const languagePractice = /\b(?:pronunciation|grammar|vocabulary|speaking|language|english|german|french|spanish)\b/i.test(content);
      const physicalTraining = /\b(?:workouts?|fitness|gym|squats?|deadlift|pushups?|push-ups?|lunges?|bodyweight|weightlifting|calisthenics|cardio|marathon|pilates|yoga|stretching|muscles?|physical (?:exercise|training)|strength training|resistance training)\b/i.test(content);
      if (languagePractice && !physicalTraining) return false;
    }
    return true;
  }
  function nonMusicalAmbience(video) {
    const content = `${String(video?.title || '').slice(0, 500)} ${String(video?.description || '').slice(0, 1800)}`;
    const excludesMusic = /\b(?:no\s+(?:background\s+)?music|no\s+(?:talking|speech|voices?)\s+or\s+music|without\s+(?:any\s+)?music)\b/i.test(content);
    const naturalSounds = /\b(?:rain(?:fall)?|thunder(?:storm)?|ocean|waves|waterfalls?|forest|birds?|wind|nature|natural sounds?|asmr)\b/i.test(content);
    const performance = /\b(?:a cappella|singing|sung|vocal performance|(?:piano|guitar|violin|cello|saxophone|drum) performance)\b/i.test(content);
    return excludesMusic && naturalSounds && !performance;
  }
  function accepts(similarities, mode, customized, video, settings) {
    if (!scopeSupported(video, settings, mode)) return false;
    // Similarities are not calibrated probabilities. Each intent qualifies independently; a higher score in another intent is not a veto.
    const selected = similarities[mode]?.[0] || 0;
    let accepted = customized ? selected >= .30 : selected >= .26;
    // A generic documentary/"solving" association alone is not study evidence.
    // Moderate matches need a second educational reference; this still allows
    // genuine lessons that also fit another intent, without a category veto.
    if (mode === 'study' && !customized) accepted = selected >= .40 || selected >= .25 && (similarities.study?.[1] || 0) >= .20;
    // Broad Music examples can match an incidental word such as "quiet" or
    // "live". Require a second musical reference for moderate scores, while
    // retaining strong specific performances and cross-intent overlap.
    if (mode === 'music' && !customized) accepted = accepted && (selected >= .40 || (similarities.music?.[1] || 0) >= .24) && !nonMusicalAmbience(video);
    return accepted;
  }
  function decide(vector, modeVectors, mode, customized = false, video, settings, profileTexts) {
    const texts = settings ? profileTexts || profiles(settings) : null;
    const raw = Object.fromEntries(Object.entries(modeVectors).map(([k, refs]) => [k, refs.map(ref => dot(vector, ref))]));
    // Filter each reference separately so an explicit additional topic can still
    // expand an intent, without letting an unsupported primary scope supply its score.
    const similarities = Object.fromEntries(Object.entries(raw).map(([k, values]) => [k, values.map((score, index) => referenceSupported(video, texts?.[k]?.[index]) ? score : 0).sort((a, b) => b - a)]));
    const scores = Object.fromEntries(Object.entries(similarities).map(([k, values]) => [k, values[0] || 0]));
    const ranked = Object.entries(scores).filter(([id, score]) => score > 0 && scopeSupported(video, settings, id)).sort((a, b) => b[1] - a[1]);
    // Preserve raw relation evidence for conservative timer decisions. Missing
    // subject evidence must not turn an uncertain exemption into a confident mismatch.
    const selected = raw[mode]?.length ? Math.max(...raw[mode]) : 0;
    const other = Math.max(0, ...Object.entries(raw).filter(([k]) => k !== mode).flatMap(([, values]) => values));
    const accepted = accepts(similarities, mode, customized, video, settings);
    const matchedIntentIds = settings ? ranked.filter(([id]) => accepts(similarities, id, Boolean(settings.intentDescriptions?.[id]?.trim() || settings.customIntents?.[id]), video, settings)).map(([id]) => id) : null;
    return {accepted, uncertain: selected > .18 && (selected < .40 || !customized && Math.abs(selected - other) < .07), similarity: selected, alternativeSimilarity: other, categoryId: ranked[0]?.[0] || null, categorySimilarity: ranked[0]?.[1] || 0, categoryMargin: (ranked[0]?.[1] || 0) - (ranked[1]?.[1] || 0), categoryCandidates: ranked.slice(0, 2).map(([id, similarity]) => ({id, similarity})), ...(matchedIntentIds ? {matchedIntentIds} : {})};
  }
  globalThis.IntentSemantic = {PROFILES, text, profiles, dot, decide};
})();
