/* Public search-page reader and bounded, local-only recommendation cache. No page scripts execute. */
(() => {
  const C = IntentCore;
  const SEEDS = {
    work: ['software engineering tutorial', 'design workflow', 'productivity workflow', 'business strategy', 'python programming', 'web development', 'career skills', 'data science', 'accounting spreadsheet workflow', 'project management leadership', 'professional communication skills', 'business operations sales'],
    study: ['science explained', 'university lecture', 'math lesson', 'history documentary', 'language lesson', 'physics lecture', 'exam study', 'philosophy explained', 'computer science algorithms lesson', 'economics psychology explained', 'geography earth science lesson', 'worked problems proof explanation'],
    music: ['jazz music', 'ambient music', 'classical piano', 'lofi beats', 'acoustic music', 'live concert', 'world music', 'instrumental music', 'rock indie music live', 'hip hop soul music', 'electronic dance music mix', 'singing covers music production'],
  };
  function normalizeLocale(input) {
    let hl = 'en';
    const value = typeof input?.hl === 'string' ? input.hl.trim() : '';
    if (value.length <= 35 && /^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i.test(value)) {
      try { hl = Intl.getCanonicalLocales(value)[0] || 'en'; } catch { /* Use the English fallback for malformed language tags. */ }
    }
    const gl = typeof input?.gl === 'string' ? input.gl.trim().toUpperCase() : '';
    return {hl, ...(/^[A-Z]{2}$/.test(gl) ? {gl} : {})};
  }
  function key(settings, locale) {
    const s = C.sanitize(settings);
    return JSON.stringify([s.mode, s.hideShorts, s.hideClickbait, s.blockedTerms, s.customTopics[s.mode], s.channels[s.mode], s.intentDescriptions, s.customIntents, s.metadataLimit, s.intentNames, normalizeLocale(locale)]);
  }
  function queries(settings, round = 0) {
    const s = C.sanitize(settings);
    if (s.mode === 'off') return [];
    const description = s.intentDescriptions[s.mode] || s.customIntents[s.mode]?.description;
    const template = C.defaultTemplate(s, s.mode);
    const seeds = template ? template.searches : description ? description.split(/[,\n;]+/).map(t => t.trim()).filter(Boolean) : SEEDS[s.mode];
    const all = [...new Set([...C.terms(s.customTopics[s.mode]), ...C.terms(s.channels[s.mode]), ...seeds].map(q => q.slice(0, 160)))].slice(0, 24);
    const start = (Math.max(0, Math.trunc(Number(round) || 0)) * 2) % all.length;
    return [...all.slice(start), ...all.slice(0, start)];
  }
  function jsonObjectAt(text, start) {
    if (text[start] !== '{') return null;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
    return null;
  }
  function pageLocale(doc) {
    const locale = {hl: doc?.documentElement?.lang || 'en'};
    // Read public bootstrap JSON in the content script's isolated world. Never
    // execute page scripts or access YouTube's account/cookie state.
    const scripts = doc?.scripts || doc?.querySelectorAll?.('script') || [];
    let inspected = 0;
    for (const script of Array.from(scripts).slice(0, 200)) {
      const text = script.textContent || '';
      if (text.length > 8000000 || (inspected += text.length) > 8000000) continue;
      const assignments = /\bytcfg\s*\.\s*set\s*\(\s*/g;
      let match;
      while ((match = assignments.exec(text))) {
        const config = jsonObjectAt(text, assignments.lastIndex);
        if (!config) continue;
        const client = config.INNERTUBE_CONTEXT?.client;
        const hl = typeof client?.hl === 'string' ? client.hl : config.HL;
        const gl = typeof client?.gl === 'string' ? client.gl : config.GL;
        if (typeof hl === 'string' && hl.length <= 35 && /^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i.test(hl)) locale.hl = hl;
        if (typeof gl === 'string' && /^[a-z]{2}$/i.test(gl)) locale.gl = gl;
      }
    }
    return normalizeLocale(locale);
  }
  function initialData(html, player = false) {
    if (typeof html !== 'string' || html.length > 8000000) throw new Error('YouTube returned an unreadable search page.');
    const assignments = player ? /(?:\b(?:var\s+)?ytInitialPlayerResponse\s*|window\s*\[\s*["']ytInitialPlayerResponse["']\s*\]\s*)=\s*/g : /(?:\b(?:var\s+)?ytInitialData\s*|window\s*\[\s*["']ytInitialData["']\s*\]\s*)=\s*/g;
    let match;
    while ((match = assignments.exec(html))) {
      const start = assignments.lastIndex;
      if (html[start] !== '{') continue;
      const parsed = jsonObjectAt(html, start);
      if (parsed) return parsed;
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
  function searchRoot(data, continued = false) {
    if (!continued) return data.contents?.twoColumnSearchResultsRenderer?.primaryContents || data.contents?.sectionListRenderer || data.contents?.singleColumnSearchResultsRenderer;
    const commands = [...(data.onResponseReceivedCommands || []), ...(data.onResponseReceivedActions || []), ...(data.onResponseReceivedEndpoints || [])];
    const roots = commands.flatMap(command => command.appendContinuationItemsAction?.continuationItems || []);
    if (data.continuationContents?.searchContinuation?.contents) roots.push(...data.continuationContents.searchContinuation.contents);
    return roots.length ? roots : null;
  }
  function readSearch(root) {
    if (!root) throw new Error('YouTube changed its search layout or returned a consent page. Try opening YouTube search.');
    const pending = [root], seen = new Set(), videos = [];
    let visited = 0, continuation, continuationUnavailable = false;
    while (pending.length && visited++ < 80000) {
      const node = pending.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) { for (let i = node.length - 1; i >= 0; i--) pending.push(node[i]); continue; }
      const endpoint = node.continuationItemRenderer?.continuationEndpoint;
      const command = endpoint?.continuationCommand;
      if (!continuation && (command?.request === 'CONTINUATION_REQUEST_TYPE_SEARCH' || endpoint?.commandMetadata?.webCommandMetadata?.apiUrl === '/youtubei/v1/search') && typeof command?.token === 'string' && /^[A-Za-z0-9_+=/%-]{1,4096}$/.test(command.token)) continuation = command.token;
      if ((command?.request === 'CONTINUATION_REQUEST_TYPE_SEARCH' || endpoint?.commandMetadata?.webCommandMetadata?.apiUrl === '/youtubei/v1/search') && command?.token && !/^[A-Za-z0-9_+=/%-]{1,4096}$/.test(command.token)) continuationUnavailable = true;
      const short = node.reelItemRenderer || node.shortsLockupViewModel || node.shortsLockupViewModelV2;
      const video = node.videoRenderer ? legacy(node.videoRenderer) : node.lockupViewModel ? modern(node.lockupViewModel) : short ? shortVideo(short) : null;
      if (video && videos.length < 100 && !seen.has(video.id)) { seen.add(video.id); videos.push(video); }
      if (node.videoRenderer || node.lockupViewModel || node.reelItemRenderer || node.shortsLockupViewModel || node.shortsLockupViewModelV2) continue;
      for (const [name, child] of Object.entries(node)) if (!/adSlot|promoted|adPlacement|playerAds/i.test(name)) pending.push(child);
    }
    return {items: videos.map(v => ({...v, hashtags: hashtags(v.title + ' ' + v.description)})), continuation, continuationUnavailable};
  }
  function extract(html) {return readSearch(searchRoot(initialData(html))).items;}
  function publicSearchClient(html) {
    const assignments = /\bytcfg\s*\.\s*set\s*\(\s*/g;
    let match, apiKey, version, web = false;
    while ((match = assignments.exec(html))) {
      const config = jsonObjectAt(html, assignments.lastIndex);
      if (!config) continue;
      const client = config.INNERTUBE_CONTEXT?.client;
      if (client?.clientName === 'WEB' || config.INNERTUBE_CONTEXT_CLIENT_NAME === 1) web = true;
      const candidateVersion = config.INNERTUBE_CONTEXT_CLIENT_VERSION || config.INNERTUBE_CLIENT_VERSION || client?.clientVersion;
      if (typeof candidateVersion === 'string' && /^[0-9A-Za-z._-]{1,40}$/.test(candidateVersion)) version = candidateVersion;
      if (typeof config.INNERTUBE_API_KEY === 'string' && /^[A-Za-z0-9_-]{20,120}$/.test(config.INNERTUBE_API_KEY)) apiKey = config.INNERTUBE_API_KEY;
    }
    // Only these public, anonymous WEB fields are retained. Never copy user,
    // visitor, authorization or click-tracking context from the bootstrap.
    return web && version && apiKey ? {version, apiKey} : null;
  }
  function tokenFingerprint(token) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
    return token.length + ':' + (hash >>> 0).toString(36);
  }
  function createService({fetcher = globalThis.fetch, now = Date.now, judge} = {}) {
    const cache = new Map(), inflight = new Map(), metadataCache = new Map(), metadataInflight = new Map(), cursors = new Map();
    let cursorSequence = 0;
    const ttl = 600000;
    function rememberCursor(context, tasks) {
      for (const [id, value] of cursors) if (now() - value.at >= ttl) cursors.delete(id);
      const id = 'discovery-' + (++cursorSequence).toString(36) + '-' + now().toString(36);
      cursors.set(id, {at: now(), context, tasks: tasks.slice(0, 24)});
      while (cursors.size > 128) cursors.delete(cursors.keys().next().value);
      return id;
    }
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
    async function search(task, fresh, locale) {
      const context = normalizeLocale(locale), cacheKey = JSON.stringify([task.query, context.hl, context.gl || '', task.token || '']);
      if (task.token && now() - task.at >= ttl) throw new Error('Discovery continuation expired. Refresh discovery to continue.');
      const cached = cache.get(cacheKey);
      if (!fresh && cached && now() - cached.at < ttl) return cached.page;
      if (inflight.has(cacheKey)) return inflight.get(cacheKey);
      const job = (async () => {
        let url, options = {credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(12000)};
        if (task.token) {
          url = new URL('https://www.youtube.com/youtubei/v1/search');
          url.searchParams.set('key', task.client.apiKey); url.searchParams.set('prettyPrint', 'false');
          const client = {clientName: 'WEB', clientVersion: task.client.version, hl: context.hl, ...(context.gl ? {gl: context.gl} : {})};
          options = {...options, method: 'POST', headers: {'Content-Type': 'application/json', 'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': client.clientVersion}, body: JSON.stringify({context: {client}, continuation: task.token})};
        } else {
          url = new URL('https://www.youtube.com/results'); url.searchParams.set('search_query', task.query); url.searchParams.set('hl', context.hl);
          if (context.gl) url.searchParams.set('gl', context.gl);
        }
        const response = await fetcher(url.href, options);
        if (!response.ok) throw new Error(`YouTube search is unavailable (${response.status}). Try again shortly.`);
        if (response.url && new URL(response.url).origin !== 'https://www.youtube.com') throw new Error('YouTube redirected this search to a consent or sign-in page. Open YouTube search and try again.');
        const text = await response.text();
        if (typeof text !== 'string' || text.length > 8000000) throw new Error('YouTube returned an unreadable search page.');
        let data;
        if (task.token) {try {data = JSON.parse(text);} catch {throw new Error('YouTube returned an unreadable discovery page. Try loading more again.');}}
        else data = initialData(text);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('YouTube returned an unreadable discovery page. Try loading more again.');
        const page = readSearch(searchRoot(data, Boolean(task.token))), client = task.client || publicSearchClient(text);
        page.nextTask = null;
        if (page.continuation && client) {
          const fingerprint = tokenFingerprint(page.continuation), trail = task.trail || [];
          if (!trail.includes(fingerprint) && trail.length < 128) page.nextTask = {query: task.query, token: page.continuation, client, at: now(), trail: [...trail, fingerprint]};
          else page.endReason = 'This public search has reached its discovery limit. Open YouTube search for more.';
        } else if (page.continuation || page.continuationUnavailable) page.endReason = 'More public search pages are unavailable. Open YouTube search for more.';
        delete page.continuation; delete page.continuationUnavailable;
        cache.delete(cacheKey); cache.set(cacheKey, {at: now(), page});
        while (cache.size > 64) cache.delete(cache.keys().next().value);
        return page;
      })();
      inflight.set(cacheKey, job);
      try { return await job; } finally { inflight.delete(cacheKey); }
    }
    async function get(settings, options = {}) {
      const ensureActive = () => {
        if (typeof options.isActive === 'function' && !options.isActive()) throw new Error('Intent is paused or this feed is no longer active.');
      };
      ensureActive();
      const preview = options.preview === true, locale = normalizeLocale(options.locale);
      const round = Math.max(0, Math.min(1000000, Math.trunc(Number(options.round) || 0)));
      const s = C.sanitize(preview ? {...settings, metadataLimit: 0} : settings), pool = queries(s, round);
      const cursor = Math.max(0, Math.min(pool.length, Math.trunc(Number(options.cursor) || 0)));
      const context = JSON.stringify([key(s, locale), round]);
      let tasks = pool.slice(cursor).map(query => ({query}));
      if (!preview && options.pageCursor != null) {
        const saved = typeof options.pageCursor === 'string' ? cursors.get(options.pageCursor) : null;
        if (!saved || saved.context !== context || now() - saved.at >= ttl) throw new Error('Discovery continuation expired or changed. Refresh discovery to continue.');
        tasks = saved.tasks;
      }
      const selected = tasks.slice(0, 2), remaining = tasks.slice(2);
      const batches = await Promise.allSettled(selected.map(task => search(task, options.fresh === true && !options.pageCursor, locale)));
      ensureActive();
      const excluded = new Set(Array.isArray(options.exclude) ? options.exclude.slice(0, 300).filter(id => /^[\w-]{11}$/.test(id)) : []);
      const items = [], seen = new Set(excluded);
      // Interleave searches so a topic doesn't fill the entire screen before the next one.
      const lists = batches.filter(b => b.status === 'fulfilled').map(b => b.value.items);
      for (let i = 0; i < Math.max(0, ...lists.map(l => l.length)); i++) for (const list of lists) {
        const video = list[i];
        if (video && !seen.has(video.id) && (preview || C.classify(video, {...s, mode: 'off'}).visible)) { seen.add(video.id); items.push(video); }
      }
      const errors = batches.filter(b => b.status === 'rejected');
      if (selected.length && errors.length === selected.length) throw new Error(errors[0].reason?.message || 'YouTube search could not be reached.');
      const nextTasks = [...selected.filter((_, index) => batches[index].status === 'rejected'), ...remaining, ...batches.filter(batch => batch.status === 'fulfilled' && batch.value.nextTask).map(batch => batch.value.nextTask)];
      const endReason = batches.find(batch => batch.status === 'fulfilled' && batch.value.endReason)?.value.endReason || '';
      const candidates = items.slice(0, preview ? 24 : 100);
      let decisions = judge ? await judge(candidates, s) : candidates.map(v => ({accepted: C.classify(v, s).visible, uncertain: false}));
      ensureActive();
      if (preview) {
        const inspected = candidates.map((video, i) => {
          const policy = C.classify(video, {...s, mode: 'off'});
          const accepted = policy.visible && decisions[i]?.accepted === true;
          const channel = C.terms(s.channels[s.mode]).includes(C.normalize(video.channel));
          return {video, accepted, reason: !policy.visible ? policy.reason : accepted ? channel ? 'Included channel' : 'Matches intent' : 'Outside intent'};
        });
        const previewItems = [...inspected.filter(item => item.accepted).slice(0, 8), ...inspected.filter(item => !item.accepted).slice(0, 4)];
        const seenIds = new Set(previewItems.map(item => item.video.id));
        for (const item of inspected) if (previewItems.length < 12 && !seenIds.has(item.video.id)) {previewItems.push(item); seenIds.add(item.video.id);}
        return {key: key(s, locale), previewItems, semantic: Boolean(judge), nextCursor: cursor + selected.length, hasMore: cursor + selected.length < pool.length, warning: errors.length ? 'Some searches were unavailable. You can retry the preview.' : ''};
      }
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
      return {key: key(s, locale), items: candidates.filter((_, i) => decisions[i]?.accepted).slice(0, 60), semantic: Boolean(judge), metadataStats: {...metadataStats}, nextCursor: Math.min(pool.length, cursor + selected.length), pageCursor: nextTasks.length ? rememberCursor(context, nextTasks) : null, hasMore: nextTasks.length > 0, endReason, warning: errors.length ? 'Some searches were unavailable. You can retry or load more.' : ''};
    }
    return {get};
  }
  globalThis.IntentFeed = {key, queries, initialData, extract, createService, hashtags, watchMetadata, normalizeLocale, pageLocale};
})();
