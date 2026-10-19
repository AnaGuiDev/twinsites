These files are the threaded JSEP WebAssembly build shipped with `onnxruntime-web` (MIT):

- `ort-wasm-simd-threaded.jsep.mjs`
- `ort-wasm-simd-threaded.jsep.wasm`

They are vendored so the vision model never loads a runtime from a third-party CDN. The page points `wasmPaths` at this folder.

When the document is cross-origin isolated, inference may use several threads. If it is not, the app sets `numThreads` to 1 and keeps using this same build.
