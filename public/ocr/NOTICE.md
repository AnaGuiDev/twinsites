# Text reader

Files in this folder are served from twinsites.com so the page can read the words on a screenshot without sending it anywhere.

- `worker.min.js` — tesseract.js 7.0.0, Apache License 2.0 (see `LICENSE-tesseract.js.md`).
- `tesseract-core-simd-lstm.wasm.js` — tesseract.js-core 7, a WebAssembly build of Tesseract OCR, Apache License 2.0.
- `eng.traineddata.gz`, `spa.traineddata.gz` — Tesseract `4.0.0_best_int` language data from the `@tesseract.js-data` packages, Apache License 2.0.
