/* Public search-page reader and bounded, local-only recommendation cache. No page scripts execute. */
(() => {
  const C = IntentCore;
  const SEEDS = {
    work: ['software engineering tutorial', 'design workflow', 'productivity workflow', 'business strategy', 'python programming', 'web development', 'career skills', 'data science'],
    study: ['science explained', 'university lecture', 'math lesson', 'history documentary', 'language lesson', 'physics lecture', 'exam study', 'philosophy explained'],
    music: ['jazz music', 'ambient music', 'classical piano', 'lofi beats', 'acoustic music', 'live concert', 'world music', 'instrumental music'],
    leisure: ['travel vlog', 'cooking recipe', 'comedy sketch', 'gaming review', 'sports highlights', 'film review', 'photography tutorial', 'gardening ideas']
  };
  function key(settings) {
    const s = C.sanitize(settings);
    return JSON.stringify([s.mode, s.hideShorts, s.hideClickbait, s.blockedTerms, s.customTopics[s.mode], s.channels[s.mode], s.intentDescriptions, s.customIntents, s.metadataLimit, s.intentNames]);
  }
  function queries(settings, round = 0) {
    const s = C.sanitize(settings);
    if (s.mode === 'off') return [];
    const description = s.intentDescriptions[s.mode] || s.customIntents[s.mode]?.description;
    const seeds = description ? description.split(/[,\n;]+/).map(t => t.trim()).filter(Boolean) : SEEDS[s.mode];
    const all = [...new Set([...C.terms(s.customTopics[s.mode]), ...C.terms(s.channels[s.mode]), ...seeds].map(q => q.slice(0, 160)))].slice(0, 24);
    const start = (Math.max(0, Math.trunc(Number(round) || 0)) * 2) % all.length;
    return [...all.slice(start), ...all.slice(0, start)];
  }
  function initialData(html, player = false) {
    if (typeof html !== 'string' || html.length > 8000000) throw new Error('YouTube returned an unreadable search page.');
    const assignments = player ? /(?:\b(?:var\s+)?ytInitialPlayerResponse\s*|window\s*\[\s*["']ytInitialPlayerResponse["']\s*\]\s*)=\s*/g : /(?:\b(?:var\s+)?ytInitialData\s*|window\s*\[\s*["']ytInitialData["']\s*\]\s*)=\s*/g;
    let match;
    while ((match = assignments.exec(html))) {
      const start = assignments.lastIndex;
      if (html[start] !== '{') continue;
      let depth = 0, quoted = false, escaped = false;
      for (let i = start; i < html.length; i++) {
        const c = html[i];
        if (quoted) {
          if (escaped) escaped = false;
          else if (c === '\\') escaped = true;
          else if (c === '"') quoted = false;
        } else if (c === '"') quoted = true;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) {
          try { return JSON.parse(html.slice(start, i + 1)); } catch { break; }
        }
      }
    }
    throw new Error('YouTube did not return readable results. It may be asking for consent or limiting searches.');
  }
  function plain(value) {
    if (typeof value === 'string') return value;
    return value?.simpleText || value?.content || value?.runs?.map(r => r.text || '').join('') || '';
  }
  function thumbnail(url, id) {
    try { const u = new URL(url); if (u.protocol === 'https:' && (u.hostname === 'ytimg.com' || u.hostname.endsWith('.ytimg.com'))) return u.href; } catch {}
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  function hashtags(text) {
    return [...new Set((String(text).match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 30).map(t => t.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')))];
  }
  function watchMetadata(html, id) {
    const player = initialData(html, true), details = player.videoDetails;
    if (!details || details.videoId !== id) throw new Error('The full description is unavailable.');
    const description = String(details.shortDescription || '').slice(0, 12000);
    return {description: description.slice(0, 4000), keywords: (details.keywords || []).filter(k => typeof k === 'string').slice(0, 30).map(k => k.slice(0, 100)), hashtags: hashtags(description + ' ' + (details.title || ''))};
  }
  function legacy(v) {
    if (!/^[\w-]{11}$/.test(v.videoId || '') || v.unplayableText) return null;
    const title = plain(v.title).slice(0, 500);
    if (!title) return null;
    const overlays = v.thumbnailOverlays || [];
    const shorts = /\/shorts\//.test(v.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '') || overlays.some(o => o.thumbnailOverlayTimeStatusRenderer?.style === 'SHORTS');
    const sources = v.thumbnail?.thumbnails || [];
    return {id: v.videoId, title, channel: plain(v.ownerText || v.longBylineText || v.shortBylineText).slice(0, 200), description: plain(v.detailedMetadataSnippets?.[0]?.snippetText || v.descriptionSnippet).slice(0, 600), duration: plain(v.lengthText).slice(0, 30), metadata: [plain(v.shortViewCountText || v.viewCountText), plain(v.publishedTimeText)].filter(Boolean).join(' · ').slice(0, 120), thumbnail: thumbnail(sources.at(-1)?.url, v.videoId), shorts};
  }
  function modern(v) {
    if (!/^[\w-]{11}$/.test(v.contentId || '') || v.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
    const meta = v.metadata?.lockupMetadataViewModel;
    const title = plain(meta?.title).slice(0, 500);
    if (!title) return null;
    const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
    const image = v.contentImage?.thumbnailViewModel;
    const sources = image?.image?.sources || [];
    const badges = (image?.overlays || []).flatMap(o => o.thumbnailOverlayBadgeViewModel?.thumbnailBadges || []);
    return {id: v.contentId, title, channel: plain(rows[0]?.metadataParts?.[0]?.text).slice(0, 200), description: '', metadata: rows.slice(1).flatMap(r => r.metadataParts || []).map(p => plain(p.text)).filter(Boolean).join(' · ').slice(0, 120), duration: badges.map(b => plain(b.thumbnailBadgeViewModel?.text)).find(t => /^\d[\d:]*$/.test(t)) || '', thumbnail: thumbnail(sources.at(-1)?.url, v.contentId), shorts: badges.some(b => /shorts/i.test(plain(b.thumbnailBadgeViewModel?.text)))};
  }
  function shortVideo(v) {
    const commands = [v.navigationEndpoint, v.onTap?.innertubeCommand, v.onTap, v.command?.innertubeCommand, v.command, v.inlinePlayerData?.onVisible?.innertubeCommand, v.rendererContext?.commandContext?.onTap?.innertubeCommand].filter(Boolean);
    let id = [v.videoId, v.contentId, ...commands.flatMap(c => [c.reelWatchEndpoint?.videoId, c.watchEndpoint?.videoId])].find(value => /^[\w-]{11}$/.test(value || ''));
    if (!id) for (const command of commands) {
      try {
        const url = new URL(command.commandMetadata?.webCommandMetadata?.url || command.urlEndpoint?.url, 'https://www.youtube.com');
        if (url.protocol !== 'https:' || !['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) continue;
        const candidate = url.pathname.match(/^\/shorts\/([\w-]{11})\/?$/)?.[1] || (url.pathname === '/watch' ? url.searchParams.get('v') : '');
        if (/^[\w-]{11}$/.test(candidate || '')) { id = candidate; break; }
      } catch { /* An unavailable or unrelated endpoint is not a video. */ }
    }
    if (!id || v.unplayableText) return null;
    const overlay = v.overlayMetadata || {};
    const accessible = plain(v.accessibilityText || v.accessibility?.accessibilityData?.label).replace(/\s*[-–]\s*play short\s*$/i, '').replace(/,\s*[\d.,]+\s*(?:thousand|million|billion|[kmb])?\s*views\s*$/i, '');
    const title = plain(v.headline || v.title || overlay.primaryText || v.metadata?.title || accessible).slice(0, 500);
    if (!title) return null;
    const image = v.thumbnailViewModel?.thumbnailViewModel || v.thumbnailViewModel;
    const sources = image?.image?.sources || v.thumbnail?.sources || v.thumbnail?.thumbnails || commands.find(c => c.reelWatchEndpoint?.thumbnail)?.reelWatchEndpoint.thumbnail.thumbnails || [];
    return {id, title, channel: plain(v.ownerText || v.longBylineText || v.shortBylineText || v.channelName || v.metadata?.channelName).slice(0, 200), description: plain(v.descriptionSnippet || v.description).slice(0, 600), duration: plain(v.lengthText).slice(0, 30), metadata: [plain(v.viewCountText || overlay.secondaryText), plain(v.publishedTimeText)].filter(Boolean).join(' · ').slice(0, 120), thumbnail: thumbnail(sources.at(-1)?.url, id), shorts: true};
  }
  function extract(html) {
    const data = initialData(html);
    // Only search-result sections: don't mix in unrelated sidebars or player recommendations.
    const root = data.contents?.twoColumnSearchResultsRenderer?.primaryContents || data.contents?.sectionListRenderer || data.contents?.singleColumnSearchResultsRenderer;
    if (!root) throw new Error('YouTube changed its search layout or returned a consent page. Try opening YouTube search.');
    const pending = [root], seen = new Set(), videos = [];
    let visited = 0;
    while (pending.length && visited++ < 80000) {
      const node = pending.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) { for (let i = node.length - 1; i >= 0; i--) pending.push(node[i]); continue; }
      const short = node.reelItemRenderer || node.shortsLockupViewModel || node.shortsLockupViewModelV2;
      const video = node.videoRenderer ? legacy(node.videoRenderer) : node.lockupViewModel ? modern(node.lockupViewModel) : short ? shortVideo(short) : null;
      if (video && !seen.has(video.id)) { seen.add(video.id); videos.push(video); }
      if (node.videoRenderer || node.lockupViewModel || node.reelItemRenderer || node.shortsLockupViewModel || node.shortsLockupViewModelV2) continue;
      for (const [name, child] of Object.entries(node)) if (!/adSlot|promoted|adPlacement|playerAds/i.test(name)) pending.push(child);
    }
    return videos.map(v => ({...v, hashtags: hashtags(v.title + ' ' + v.description)}));
  }
  function createService({fetcher = globalThis.fetch, now = Date.now, judge} = {}) {
    const cache = new Map(), inflight = new Map(), metadataCache = new Map(), metadataInflight = new Map();
    function bounded(promise, milliseconds) {
      if (milliseconds <= 0) { Promise.resolve(promise).catch(() => {}); return Promise.reject(new Error('Fuller metadata checking reached its time limit.')); }
      let timer;
      return Promise.race([promise, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('Fuller metadata checking reached its time limit.')), milliseconds);})]).finally(() => clearTimeout(timer));
    }
    async function metadata(video, deadline, onSource) {
      if (now() >= deadline) throw new Error('Fuller metadata checking reached its time limit.');
      const cached = metadataCache.get(video.id);
      if (cached && now() - cached.at < 86400000) { onSource('cacheHits'); return cached.value; }
      let job = metadataInflight.get(video.id);
      if (job) onSource('sharedRequests');
      else {
        const timeout = Math.max(1, Math.min(12000, deadline - now()));
        onSource('requests');
        job = bounded((async () => {
          const url = new URL('https://www.youtube.com/watch'); url.searchParams.set('v', video.id); url.searchParams.set('hl', 'en');
          const response = await fetcher(url.href, {credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(timeout)});
          if (!response.ok || response.url && new URL(response.url).hostname !== 'www.youtube.com') throw new Error('The full description is unavailable.');
          return watchMetadata(await response.text(), video.id);
        })(), timeout).then(value => {
          metadataCache.set(video.id, {at: now(), value});
          while (metadataCache.size > 100) metadataCache.delete(metadataCache.keys().next().value);
          return value;
        }).finally(() => metadataInflight.delete(video.id));
        metadataInflight.set(video.id, job);
      }
      return bounded(job, deadline - now());
    }
    async function search(query, fresh) {
      const cached = cache.get(query);
      if (!fresh && cached && now() - cached.at < 600000) return cached.items;
      if (inflight.has(query)) return inflight.get(query);
      const job = (async () => {
        const url = new URL('https://www.youtube.com/results');
        url.searchParams.set('search_query', query); url.searchParams.set('hl', 'en');
        const response = await fetcher(url.href, {credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(12000)});
        if (!response.ok) throw new Error(`YouTube search is unavailable (${response.status}). Try again shortly.`);
        if (response.url && new URL(response.url).hostname !== 'www.youtube.com') throw new Error('YouTube redirected this search to a consent or sign-in page. Open YouTube search and try again.');
        const items = extract(await response.text());
        cache.delete(query); cache.set(query, {at: now(), items});
        while (cache.size > 32) cache.delete(cache.keys().next().value);
        return items;
      })();
      inflight.set(query, job);
      try { return await job; } finally { inflight.delete(query); }
    }
    async function get(settings, options = {}) {
      const ensureActive = () => {
        if (typeof options.isActive === 'function' && !options.isActive()) throw new Error('Intent is paused or this feed is no longer active.');
      };
      ensureActive();
      const s = C.sanitize(settings), pool = queries(s, options.round);
      const cursor = Math.max(0, Math.min(pool.length, Math.trunc(Number(options.cursor) || 0)));
      const selected = pool.slice(cursor, cursor + 2);
      const batches = await Promise.allSettled(selected.map(q => search(q, options.fresh === true)));
      ensureActive();
      const excluded = new Set(Array.isArray(options.exclude) ? options.exclude.slice(0, 300).filter(id => /^[\w-]{11}$/.test(id)) : []);
      const items = [], seen = new Set(excluded);
      // Interleave searches so a topic doesn't fill the entire screen before the next one.
      const lists = batches.filter(b => b.status === 'fulfilled').map(b => b.value);
      for (let i = 0; i < Math.max(0, ...lists.map(l => l.length)); i++) for (const list of lists) {
        const video = list[i];
        if (video && !seen.has(video.id) && C.classify(video, {...s, mode: 'off'}).visible) { seen.add(video.id); items.push(video); }
      }
      const errors = batches.filter(b => b.status === 'rejected');
      if (selected.length && errors.length === selected.length) throw new Error(errors[0].reason?.message || 'YouTube search could not be reached.');
      const candidates = items.slice(0, 100);
      let decisions = judge ? await judge(candidates, s) : candidates.map(v => ({accepted: C.classify(v, s).visible, uncertain: false}));
      const uncertain = decisions.map((d, i) => d.uncertain ? i : -1).filter(i => i >= 0);
      const metadataStats = {limit: s.metadataLimit, uncertain: uncertain.length, checked: 0, requests: 0, cacheHits: 0, sharedRequests: 0, failed: 0, remaining: uncertain.length};
      const deadline = now() + 45000;
      // Ambiguous acceptances still need fuller metadata. Stop only when twelve
      // confident matches are available, or the selected cap/deadline is reached.
      for (let offset = 0; judge && offset < uncertain.length && metadataStats.checked < s.metadataLimit && now() < deadline && decisions.filter(d => d.accepted && !d.uncertain).length < 12;) {
        ensureActive();
        const group = uncertain.slice(offset, offset + Math.min(4, s.metadataLimit - metadataStats.checked));
        offset += group.length;
        const details = await Promise.allSettled(group.map(i => {
          metadataStats.checked++;
          return metadata(candidates[i], deadline, source => {metadataStats[source]++;});
        }));
        ensureActive();
        const enriched = [];
        details.forEach((result, n) => {
          if (result.status === 'fulfilled') {const i = group[n]; candidates[i] = {...candidates[i], ...result.value}; enriched.push(i);}
          else metadataStats.failed++;
        });
        if (enriched.length) {
          try {
            const updated = await bounded(judge(enriched.map(i => candidates[i]), s), deadline - now());
            enriched.forEach((i, n) => {decisions[i] = updated[n];});
          } catch (error) {
            if (now() >= deadline || /reached its time limit/.test(error.message)) break;
            throw error;
          }
        }
      }
      ensureActive();
      metadataStats.remaining = uncertain.length - metadataStats.checked;
      return {key: key(s), items: candidates.filter((_, i) => decisions[i]?.accepted).slice(0, 60), semantic: Boolean(judge), metadataStats: {...metadataStats}, nextCursor: cursor + selected.length, hasMore: cursor + selected.length < pool.length, warning: errors.length ? 'Some searches were unavailable. You can retry or load more.' : ''};
    }
    return {get};
  }
  globalThis.IntentFeed = {key, queries, initialData, extract, createService, hashtags, watchMetadata};
})();
