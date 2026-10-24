# Bundled components

- **all-MiniLM-L6-v2** — Sentence Transformers semantic embedding model, converted and quantized by Xenova. Apache License 2.0. Model source: https://huggingface.co/Xenova/all-MiniLM-L6-v2 at revision `751bff37182d3f1213fa05d7196b954e230abad9`. Original model: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2. The full Apache 2.0 license is included in `runtime/huggingface-transformers-LICENSE.txt`; model asset hashes are in `models/Xenova/all-MiniLM-L6-v2/INTEGRITY.json`.
- **Transformers.js** — Hugging Face, Apache License 2.0. Source: https://github.com/huggingface/transformers.js. Full license: `runtime/huggingface-transformers-LICENSE.txt`.
- **Jinja** — Hugging Face, MIT license. Full license: `runtime/huggingface-jinja-LICENSE.txt`.
- **ONNX Runtime Web** — Microsoft, MIT license. Source: https://github.com/microsoft/onnxruntime. Full license: `licenses/ONNX-Runtime-MIT.txt`. Bundled code notices are also preserved in `runtime/ai-worker.js.LEGAL.txt`.

All inference code, tokenizer files and quantized model weights are packaged with the extension. There are no model downloads or remotely hosted scripts at runtime.
