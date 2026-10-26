/* Mode descriptions and similarity policy shared by the bundled model worker and tests. */
(() => {
  const C = IntentCore;
  const PROFILES = {
    work: ['Software development, coding applications and engineering computer systems.', 'Professional skills, careers, jobs and business strategy.', 'Designing products, websites, user interfaces and creative professional workflows.', 'Productivity, organizing projects and effective work habits.', 'Data analysis, spreadsheets, marketing and running a company.'],
    study: ['Academic lessons, university lectures and studying for exams.', 'Learning mathematics, physics, chemistry, biology and other sciences.', 'Educational explanations of history, philosophy, languages and how the world works.', 'Step by step instruction, learning a subject and understanding new ideas.', 'Research, educational documentaries and classroom teaching.'],
    music: ['Listening to songs, albums, music playlists and musical performances.', 'Instrumental jazz, classical piano, orchestral music and acoustic guitar.', 'Ambient soundscapes, lo-fi beats and background music for concentration.', 'Live concerts, singers, bands, DJ sets and recorded music.'],
  };
  function text(video) {
    const tags = [...(video.hashtags || []), ...(video.keywords || [])].slice(0, 30).map(t => String(t).slice(0, 80)).join(', ');
    return `${String(video.title || '').slice(0, 500)}. Channel: ${String(video.channel || '').slice(0, 160)}. ${tags ? 'Topics: ' + tags + '. ' : ''}${String(video.description || '').slice(0, 1800)}`;
  }
  function profiles(settings) {
    const s = C.sanitize(settings);
    return Object.fromEntries(Object.keys(C.modes(s)).map(mode => {
      const description = s.intentDescriptions[mode] || s.customIntents[mode]?.description;
      const examples = description ? [description] : PROFILES[mode];
      return [mode, [...examples, ...C.terms(s.customTopics[mode]).slice(0, 16).map(t => `Videos about ${t}.`)]];
    }));
  }
  function dot(a, b) { let sum = 0; for (let i = 0; i < a.length; i++) sum += a[i] * b[i]; return sum; }
  function decide(vector, modeVectors, mode, customized = false) {
    const scores = Object.fromEntries(Object.entries(modeVectors).map(([k, refs]) => [k, Math.max(...refs.map(ref => dot(vector, ref)))]));
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const selected = scores[mode] || 0;
    const other = Math.max(0, ...Object.entries(scores).filter(([k]) => k !== mode).map(([, score]) => score));
    // Similarities are not calibrated probabilities. Overlapping intents can both qualify.
    return {accepted: customized ? selected >= .30 : selected >= .26 && selected >= other - .07, uncertain: selected > .18 && (selected < .40 || !customized && Math.abs(selected - other) < .07), similarity: selected, alternativeSimilarity: other, categoryId: ranked[0]?.[0] || null, categorySimilarity: ranked[0]?.[1] || 0, categoryMargin: (ranked[0]?.[1] || 0) - (ranked[1]?.[1] || 0)};
  }
  globalThis.IntentSemantic = {PROFILES, text, profiles, dot, decide};
})();
