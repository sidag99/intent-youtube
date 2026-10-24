const pending = new Map();
let worker, nextId = 0;
function getWorker() {
  if (!worker) {
    worker = new Worker(chrome.runtime.getURL('runtime/ai-worker.js'), {type: 'module'});
    worker.onmessage = ({data}) => {
      const job = pending.get(data.id); if (!job) return;
      clearTimeout(job.timer); pending.delete(data.id); job.respond(data);
    };
    worker.onerror = () => {
      for (const job of pending.values()) {clearTimeout(job.timer); job.respond({ok: false, error: 'The bundled topic model could not start. Reload Intent and try again.'});}
      pending.clear(); worker.terminate(); worker = undefined;
    };
  }
  return worker;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'AI_CLASSIFY' || message.target !== 'intent-ai' || sender.tab || sender.url && !sender.url.startsWith(chrome.runtime.getURL(''))) return;
  const id = ++nextId;
  const timer = setTimeout(() => {pending.delete(id); respond({ok: false, error: 'The local model took too long to respond. Try refreshing the feed.'});}, 60000);
  pending.set(id, {respond, timer});
  try { getWorker().postMessage({id, videos: message.videos, settings: message.settings}); }
  catch (error) {clearTimeout(timer); pending.delete(id); respond({ok: false, error: error.message});}
  return true;
});
