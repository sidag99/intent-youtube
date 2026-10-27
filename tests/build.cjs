const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const model = 'models/Xenova/all-MiniLM-L6-v2';
const assets = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.txt', 'onnx/model_quantized.onnx'];

async function fixture(t, source = 'self.onmessage = () => self.postMessage("fixture");') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'intent-build-'));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  for (const name of ['scripts', 'src', 'runtime', path.join(model, 'onnx')]) await fs.mkdir(path.join(directory, name), {recursive: true});
  await fs.copyFile(path.join(root, 'scripts/build.mjs'), path.join(directory, 'scripts/build.mjs'));
  const pins = await fs.readFile(path.join(root, model, 'INTEGRITY.json'), 'utf8');
  await fs.writeFile(path.join(directory, model, 'INTEGRITY.json'), pins);
  for (const asset of assets) await fs.symlink(path.join(root, model, asset), path.join(directory, model, asset));
  await fs.symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  await fs.writeFile(path.join(directory, 'src/ai-worker-source.mjs'), source);
  await fs.writeFile(path.join(directory, 'runtime/previous.txt'), 'Previous working runtime');
  const run = (args = []) => spawnSync(process.execPath, [...args, path.join(directory, 'scripts/build.mjs')], {encoding: 'utf8', timeout: 30000});
  const unchanged = async () => {
    assert.equal(await fs.readFile(path.join(directory, model, 'INTEGRITY.json'), 'utf8'), pins, 'committed hash pins must never be rewritten');
    assert.equal(await fs.readFile(path.join(directory, 'runtime/previous.txt'), 'utf8'), 'Previous working runtime', 'a failed build retains the previous runtime');
    assert.deepEqual((await fs.readdir(directory)).filter(name => name.startsWith('.runtime-build-')), [], 'failed staging is cleaned up');
  };
  return {directory, pins, run, unchanged};
}

test('a corrupt cached model is rejected without changing pins or the working runtime', async t => {
  const project = await fixture(t);
  const config = path.join(project.directory, model, 'config.json');
  await fs.unlink(config); // Never write through the fixture's link into the real model cache.
  await fs.writeFile(config, '{"corrupt":true}');
  const result = project.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /integrity mismatch: config\.json/);
  await project.unchanged();
});

test('a downloaded model is checked before being installed into the cache', async t => {
  const project = await fixture(t);
  const config = path.join(project.directory, model, 'config.json');
  await fs.unlink(config);
  const hook = path.join(project.directory, 'fetch-fixture.mjs');
  await fs.writeFile(hook, 'globalThis.fetch = async () => ({ok: true, arrayBuffer: async () => new TextEncoder().encode("corrupt download").buffer});');
  const result = project.run(['--import', hook]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /integrity mismatch: config\.json/);
  await assert.rejects(fs.stat(config), {code: 'ENOENT'});
  await project.unchanged();
});

test('a real esbuild compile failure retains the previous runtime', async t => {
  const project = await fixture(t, 'export const = ;');
  const result = project.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Build failed|Expected identifier/);
  await project.unchanged();
});

test('a failed runtime-install rename restores the previous runtime', async t => {
  const project = await fixture(t);
  const hook = path.join(project.directory, 'rename-fixture.mjs');
  await fs.writeFile(hook, `import fs from 'node:fs/promises';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
const rename = fs.rename;
fs.rename = async (from, to) => {
  if (path.basename(from) === 'runtime' && path.basename(path.dirname(from)).startsWith('.runtime-build-')) throw new Error('Fixture runtime install rename failed');
  return rename(from, to);
};
syncBuiltinESMExports();`);
  const result = project.run(['--import', hook]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Fixture runtime install rename failed/);
  await project.unchanged();
});

test('a successful real esbuild replaces the runtime after preparation and cleans staging', async t => {
  const project = await fixture(t);
  const result = project.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(await fs.readFile(path.join(project.directory, 'runtime/ai-worker.js'), 'utf8'), /fixture/);
  await assert.rejects(fs.stat(path.join(project.directory, 'runtime/previous.txt')), {code: 'ENOENT'});
  for (const asset of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
    assert.equal((await fs.stat(path.join(project.directory, 'runtime', asset))).size, (await fs.stat(path.join(root, 'node_modules/onnxruntime-web/dist', asset))).size);
  }
  assert.equal(await fs.readFile(path.join(project.directory, model, 'INTEGRITY.json'), 'utf8'), project.pins);
  assert.deepEqual((await fs.readdir(project.directory)).filter(name => name.startsWith('.runtime-build-')), []);
});
