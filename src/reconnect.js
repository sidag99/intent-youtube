/* Restore an invalidated isolated-world controller without reloading its page. */
(() => {
  function create(api = globalThis.chrome, now = Date.now) {
    if (!api?.scripting?.executeScript || !api.scripting.insertCSS || !api.runtime?.getManifest || !api.tabs?.get) return null;
    const entry = api.runtime.getManifest().content_scripts?.find(item => item.all_frames !== true && Array.isArray(item.js) && item.js.includes('src/content.js'));
    const files = entry?.js?.filter(file => typeof file === 'string' && /^src\/[a-z0-9-]+\.js$/i.test(file)) || [];
    const css = entry?.css?.filter(file => typeof file === 'string' && /^src\/[a-z0-9-]+\.css$/i.test(file)) || [];
    if (!files.includes('src/content.js') || files.length !== entry.js.length || css.length !== (entry.css || []).length) return null;
    const mainFiles = api.runtime.getManifest().content_scripts?.filter(item=>item.world==='MAIN'&&item.all_frames!==true).flatMap(item=>item.js||[]).filter(file=>file==='src/native-renderer.js') || [];
    const jobs = new Map(), attempted = new Map();
    function trusted(tab) {
      if (!Number.isInteger(tab?.id)) return false;
      try {
        const url = new URL(tab.url);
        return ['http:', 'https:'].includes(url.protocol) && ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname) && !/^\/(?:embed|v|e)(?:\/|$)/.test(url.pathname) && (!tab.pendingUrl || new URL(tab.pendingUrl).href === url.href);
      } catch {return false;}
    }
    async function repair(tab) {
      if (!trusted(tab) || tab.active !== true) return false;
      if (jobs.has(tab.id)) return jobs.get(tab.id);
      if (jobs.size >= 32) return false;
      const job = (async () => {
        let response;
        try {response = await api.tabs.sendMessage(tab.id, {type: 'INTENT_PING'}, {frameId: 0});} catch { /* No live controller answered. */ }
        if (response?.ok === true && response.contextValid === true) return false;
        if (attempted.has(tab.id) && now() - attempted.get(tab.id) < 5000) return false;
        const latest = await api.tabs.get(tab.id);
        if (!trusted(latest) || latest.active !== true || latest.url !== tab.url) return false;
        attempted.set(tab.id, now());
        while (attempted.size > 128) attempted.delete(attempted.keys().next().value);
        const target = {tabId: tab.id, frameIds: [0]};
        const probe = await api.scripting.executeScript({target, world: 'ISOLATED', func: () => ({owned: document.documentElement?.hasAttribute('data-intent-content-owner') === true, legacy: Boolean(document.querySelector('#intent-toolbar,#intent-home-feed,#intent-watch-feed'))})});
        const ownership = probe.find(frame => frame.frameId === 0)?.result;
        // Pre-protocol pages cannot dispose old observers safely. A one-time
        // manual page refresh upgrades those tabs without duplicating controllers.
        if (!ownership || typeof ownership.owned !== 'boolean' || typeof ownership.legacy !== 'boolean' || ownership.legacy && !ownership.owned) return false;
        if (css.length) await api.scripting.insertCSS({target, files: css});
        if(mainFiles.length)await api.scripting.executeScript({target, files:mainFiles,world:'MAIN',injectImmediately:true});
        await api.scripting.executeScript({target, files, world: 'ISOLATED', injectImmediately: true});
        return true;
      })().catch(() => false);
      jobs.set(tab.id, job);
      try {return await job;} finally {if (jobs.get(tab.id) === job) jobs.delete(tab.id);}
    }
    return {
      async activate(info = {}) {if (!Number.isInteger(info.tabId)) return false; try {return await repair(await api.tabs.get(info.tabId));} catch {return false;}},
      async focus(windowId) {
        if (!Number.isInteger(windowId) || windowId < 0) return;
        const tabs = await api.tabs.query({url: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'], active: true, windowId});
        await Promise.allSettled(tabs.filter(trusted).map(repair));
      },
      async installed() {
        const tabs = await api.tabs.query({url: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'], active: true});
        await Promise.allSettled(tabs.filter(trusted).map(repair));
      },
      forget(id) {attempted.delete(id);}
    };
  }
  globalThis.IntentReconnect = {create};
})();
