import {pipeline, env} from '@huggingface/transformers';
import './core.js';
import './semantic.js';
const C = globalThis.IntentCore, S = globalThis.IntentSemantic;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false;
env.localModelPath = new URL('../models/', import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = new URL('./', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
let extractorPromise;
const vectors = new Map();
async function embed(texts) {
  const missing = [...new Set(texts)].filter(t => !vectors.has(t));
  if (missing.length) {
    if (!extractorPromise) extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {dtype: 'q8', device: 'wasm', local_files_only: true}).catch(error => {extractorPromise = undefined; throw error;});
    const extractor = await extractorPromise;
    // Small batches bound memory on ordinary laptops. Cached vectors serve repeated videos.
    for (let i = 0; i < missing.length; i += 8) {
      const chunk = missing.slice(i, i + 8);
      const output = await extractor(chunk, {pooling: 'mean', normalize: true, truncation: true, max_length: 256});
      const rows = output.tolist();
      chunk.forEach((t, j) => vectors.set(t, rows[j]));
    }
  }
  const result = texts.map(t => vectors.get(t));
  while (vectors.size > 600) vectors.delete(vectors.keys().next().value);
  return result;
}
async function classify(videos, inputSettings) {
  const settings = C.sanitize(inputSettings);
  if (settings.mode === 'off') return videos.map(v => ({accepted: C.classify(v, settings).visible, uncertain: false}));
  const descriptions = S.profiles(settings), names = Object.keys(descriptions), all = names.flatMap(k => descriptions[k]);
  const encoded = await embed([...all, ...videos.map(S.text)]);
  let offset = 0;
  const refs = Object.fromEntries(names.map(k => {const value = encoded.slice(offset, offset + descriptions[k].length); offset += descriptions[k].length; return [k, value];}));
  const visibleSettings = {...settings, mode: 'off'};
  const channels = C.terms(settings.channels[settings.mode]);
  const customized = Boolean(settings.intentDescriptions?.[settings.mode]?.trim() || settings.customIntents?.[settings.mode]);
  return videos.map((video, i) => {
    if (!C.classify(video, visibleSettings).visible) return {accepted: false, uncertain: false};
    if (channels.includes(C.normalize(video.channel))) return {accepted: true, uncertain: false};
    return S.decide(encoded[all.length + i], refs, settings.mode, customized, video);
  });
}
let queue = Promise.resolve();
self.onmessage = event => {
  const {id, videos, settings} = event.data;
  const job = queue.then(() => classify(videos.slice(0, 120), settings));
  queue = job.catch(() => {});
  job.then(decisions => self.postMessage({id, ok: true, decisions}), error => self.postMessage({id, ok: false, error: `The local topic model could not run: ${error.message}`}));
};
