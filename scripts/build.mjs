import {build} from 'esbuild';
import {mkdir, copyFile, readFile, writeFile, readdir, stat, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const revision = '751bff37182d3f1213fa05d7196b954e230abad9';
const modelDir = path.join(root, 'models/Xenova/all-MiniLM-L6-v2');
const runtime = path.join(root, 'runtime');
await mkdir(path.join(modelDir, 'onnx'), {recursive: true}); await rm(runtime, {recursive: true, force: true}); await mkdir(runtime, {recursive: true});
const files = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.txt', 'onnx/model_quantized.onnx'];
const integrity = {};
for (const file of files) {
  const target = path.join(modelDir, file);
  let bytes;
  try {bytes = await readFile(target);} catch {}
  if (!bytes) {
    const response = await fetch(`https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/${revision}/${file}`, {signal: AbortSignal.timeout(180000)});
    if (!response.ok) throw new Error(`Could not fetch model asset ${file}: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (file.endsWith('.onnx') && bytes.length < 20000000) throw new Error('The model download was incomplete.');
    await writeFile(target, bytes);
  }
  integrity[file] = createHash('sha256').update(bytes).digest('hex');
  console.log(`Bundled ${file} (${(bytes.length / 1048576).toFixed(2)} MiB)`);
}
await writeFile(path.join(modelDir, 'INTEGRITY.json'), JSON.stringify({repository: 'Xenova/all-MiniLM-L6-v2', revision, sha256: integrity}, null, 2) + '\n');
await build({entryPoints: [path.join(root, 'src/ai-worker-source.mjs')], outfile: path.join(runtime, 'ai-worker.js'), bundle: true, platform: 'browser', format: 'esm', target: 'chrome120', minify: true, legalComments: 'external'});
const ort = path.join(root, 'node_modules/onnxruntime-web/dist');
// The text-only WASM pipeline uses this pair. Don't ship unused GPU/alternate runtimes.
for (const file of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) await copyFile(path.join(ort, file), path.join(runtime, file));
const licenses = [['@huggingface/transformers', 'LICENSE'], ['@huggingface/jinja', 'LICENSE'], ['onnxruntime-web', 'LICENSE']];
for (const [pkg, name] of licenses) {
  try {await copyFile(path.join(root, 'node_modules', pkg, name), path.join(runtime, pkg.replaceAll('/', '-').replaceAll('@', '') + '-LICENSE.txt'));} catch {}
}
let total = 0;
for (const file of await readdir(runtime)) total += (await stat(path.join(runtime, file))).size;
console.log(`Local inference runtime bundled: ${(total / 1048576).toFixed(1)} MiB. End users need no model download or companion app.`);
