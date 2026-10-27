const pending = new Map();
let worker, nextId = 0;
function settle(id, result) {
  const job = pending.get(id); if (!job) return;
  clearTimeout(job.timer); pending.delete(id); job.respond(result);
}
function resetWorker(current, error) {
  if (worker !== current) return;
  worker = undefined;
  current.terminate();
  for (const [id, job] of pending) if (job.worker === current) settle(id, {ok: false, error});
}
function getWorker() {
  if (!worker) {
    const current = worker = new Worker(chrome.runtime.getURL('runtime/ai-worker.js'), {type: 'module'});
    current.onmessage = ({data}) => {
      if (worker !== current || pending.get(data.id)?.worker !== current) return;
      settle(data.id, data);
    };
    current.onerror = () => resetWorker(current, 'The bundled topic model could not start. Reload Intent and try again.');
  }
  return worker;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'AI_CLASSIFY' || message.target !== 'intent-ai' || sender.tab || sender.url && !sender.url.startsWith(chrome.runtime.getURL(''))) return;
  const id = ++nextId;
  try {
    const current = getWorker();
    const timer = setTimeout(() => resetWorker(current, 'The local model took too long to respond. Try refreshing the feed.'), 60000);
    pending.set(id, {respond, timer, worker: current});
    current.postMessage({id, videos: message.videos, settings: message.settings});
  } catch (error) {
    if (pending.has(id)) settle(id, {ok: false, error: error.message});
    else respond({ok: false, error: error.message});
  }
  return true;
});
