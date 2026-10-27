import {build} from 'esbuild';
import {mkdir, copyFile, readFile, writeFile, readdir, stat, rm, rename, mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const repository = 'Xenova/all-MiniLM-L6-v2';
const revision = '751bff37182d3f1213fa05d7196b954e230abad9';
const modelDir = path.join(root, 'models', repository);
const runtime = path.join(root, 'runtime');
const files = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.txt', 'onnx/model_quantized.onnx'];
// These committed pins are the trust source, never generated from the local cache.
const integrity = JSON.parse(await readFile(path.join(modelDir, 'INTEGRITY.json'), 'utf8'));
if (integrity.repository !== repository || integrity.revision !== revision || files.some(file => !/^[a-f0-9]{64}$/.test(integrity.sha256?.[file] || ''))) throw new Error('The committed model integrity pins are missing or invalid.');
const staging = await mkdtemp(path.join(root, '.runtime-build-'));
const nextRuntime = path.join(staging, 'runtime'), previousRuntime = path.join(staging, 'previous-runtime');
let preserveStaging = false;
try {
  await mkdir(nextRuntime);
  for (const file of files) {
    const target = path.join(modelDir, file);
    let bytes, downloaded = false;
    try {bytes = await readFile(target);} catch (error) {if (error.code !== 'ENOENT') throw error;}
    if (!bytes) {
      const response = await fetch(`https://huggingface.co/${repository}/resolve/${revision}/${file}`, {signal: AbortSignal.timeout(180000)});
      if (!response.ok) throw new Error(`Could not fetch model asset ${file}: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer()); downloaded = true;
    }
    if (createHash('sha256').update(bytes).digest('hex') !== integrity.sha256[file]) throw new Error(`Model asset integrity mismatch: ${file}. Restore the pinned asset before rebuilding.`);
    if (downloaded) {
      const temporary = path.join(staging, 'model-download');
      await writeFile(temporary, bytes); await mkdir(path.dirname(target), {recursive: true}); await rename(temporary, target);
    }
    console.log(`Bundled ${file} (${(bytes.length / 1048576).toFixed(2)} MiB)`);
  }
  await build({entryPoints: [path.join(root, 'src/ai-worker-source.mjs')], outfile: path.join(nextRuntime, 'ai-worker.js'), bundle: true, platform: 'browser', format: 'esm', target: 'chrome120', minify: true, legalComments: 'external'});
  const ort = path.join(root, 'node_modules/onnxruntime-web/dist');
  // The text-only WASM pipeline uses this pair. Don't ship unused GPU/alternate runtimes.
  for (const file of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) await copyFile(path.join(ort, file), path.join(nextRuntime, file));
  const licenses = [['@huggingface/transformers', 'LICENSE'], ['@huggingface/jinja', 'LICENSE'], ['onnxruntime-web', 'LICENSE']];
  for (const [pkg, name] of licenses) {
    try {await copyFile(path.join(root, 'node_modules', pkg, name), path.join(nextRuntime, pkg.replaceAll('/', '-').replaceAll('@', '') + '-LICENSE.txt'));} catch {}
  }
  let total = 0;
  for (const file of await readdir(nextRuntime)) total += (await stat(path.join(nextRuntime, file))).size;
  let backedUp = false;
  try {await rename(runtime, previousRuntime); backedUp = true;} catch (error) {if (error.code !== 'ENOENT') throw error;}
  try {await rename(nextRuntime, runtime);} catch (error) {
    if (backedUp) {
      try {await rename(previousRuntime, runtime);} catch (rollbackError) {
        preserveStaging = true;
        throw new AggregateError([error, rollbackError], `Runtime installation and rollback failed. The previous runtime is preserved at ${previousRuntime}.`);
      }
    }
    throw error;
  }
  console.log(`Local inference runtime bundled: ${(total / 1048576).toFixed(1)} MiB. End users need no model download or companion app.`);
} finally {
  if (!preserveStaging) await rm(staging, {recursive: true, force: true});
}
