These files are the threaded WebAssembly build shipped with `onnxruntime-web` (MIT), without the WebGPU (JSEP) layer:

- `ort-wasm-simd-threaded.mjs`
- `ort-wasm-simd-threaded.wasm`

They are vendored so the vision model never loads a runtime from a third-party CDN. The page points `wasmPaths` at this folder, and the app imports `onnxruntime-web/wasm` (see `vite.config.ts`).

Inference always runs on one thread (`numThreads = 1`), on the CPU. The WebGPU build is about twice the size and its extra layer was never used.
