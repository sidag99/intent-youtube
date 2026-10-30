/* Conservative, local topic estimates for the current video and optional timer rules. */
(() => {
  const C = IntentCore;
  function videoId(value) {
    try {
      const url = new URL(value);
      if (!C.isYouTube(value) || !['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) return '';
      const id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/shorts\/([\w-]{11})(?:\/|$)/)?.[1];
      return /^[\w-]{11}$/.test(id || '') ? id : '';
    } catch {return '';}
  }
  function metadata(input = {}, id) {
    const strings = value => Array.isArray(value) ? value.slice(0, 30).filter(v => typeof v === 'string').map(v => v.slice(0, 80)) : [];
    return {id, title: String(input.title || '').slice(0, 500), channel: String(input.channel || '').slice(0, 160), description: String(input.description || '').slice(0, 1800), hashtags: strings(input.hashtags), keywords: strings(input.keywords)};
  }
  function key(settings) {
    const s = C.sanitize(settings);
    return JSON.stringify([6, s.mode, s.intentDescriptions, s.customIntents, s.customTopics]);
  }
  function estimate(decision, settings) {
    if (!decision || typeof decision.accepted !== 'boolean' || typeof decision.uncertain !== 'boolean' || !Number.isFinite(decision.similarity)) return {status: 'unavailable', categoryId: null, categoryIds: []};
    const definitions = C.modes(settings);
    const categoryId = Object.hasOwn(definitions, decision.categoryId) && Number.isFinite(decision.categorySimilarity) && decision.categorySimilarity >= .35 && Number.isFinite(decision.categoryMargin) && decision.categoryMargin >= .05 ? decision.categoryId : null;
    // Display strong overlapping categories without claiming one is exclusive.
    // This list does not relax the strict categoryId used by timer decisions.
    const categoryIds = [...new Set((Array.isArray(decision.categoryCandidates) ? decision.categoryCandidates : []).filter(candidate => candidate && Object.hasOwn(definitions, candidate.id) && Number.isFinite(candidate.similarity) && candidate.similarity >= .35 && Number.isFinite(decision.categorySimilarity) && decision.categorySimilarity - candidate.similarity <= .05).map(candidate => candidate.id))].slice(0, 2);
    if (!categoryIds.length && categoryId) categoryIds.push(categoryId);
    // Similarity is not a calibrated probability. Require strong evidence of a
    // different category before turning an exemption into counted time.
    const unrelated = decision.accepted === false && decision.uncertain === false && Number.isFinite(decision.similarity) && decision.similarity <= .18 && categoryId && categoryId !== settings.mode && decision.categorySimilarity >= .40;
    const matching = decision.accepted === true && decision.uncertain === false && Number.isFinite(decision.similarity) && decision.similarity >= .30;
    const matchedIntentIds = Array.isArray(decision.matchedIntentIds) ? [...new Set(decision.matchedIntentIds)].filter(id => typeof id === 'string' && Object.hasOwn(definitions, id)).slice(0, Object.keys(definitions).length) : null;
    const selected = Object.hasOwn(definitions, settings.mode);
    return {status: selected && unrelated ? 'unrelated' : selected && matching ? 'matching' : 'uncertain', categoryId, categoryIds, matchesIntent: selected && decision.accepted === true, ...(matchedIntentIds ? {matchedIntentIds} : {})};
  }
  globalThis.IntentTimerTopic = {videoId, metadata, key, estimate};
})();
