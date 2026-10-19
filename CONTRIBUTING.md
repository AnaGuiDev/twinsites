# Contributing

Twinsites is a static site. Comparison runs in the browser, so pull requests should keep that promise.

## Develop

```bash
npm ci
npm run dev
```

Vite sends the COOP/COEP headers the deployed page uses. The vision model still runs on one thread: the quantized graph is not stable when the WASM runtime is threaded. `npm run preview` serves a production build the same way.

## Add sites to the catalog

The list of URLs comes from the CC0 catalog [awesome-vibe-coded-apps](https://github.com/JefferyLee/awesome-vibe-coded-apps). Do not paste screenshots from anywhere else without a similarly open license and a removal path.

```bash
npm run dataset -- --attempts 4000 --success 2000 --concurrency 4
```

That captures homepages, builds the site, embeds the screenshots in headless Chrome with the same WASM model the page loads from `public/models`, projects them, and rewrites `public/data`. Node ONNX is not a substitute: its vectors do not match the browser. The capture step resumes, and embedding resumes from `data/raw/embed-progress.json`. Delete `data/raw` to start over. `data/raw` is gitignored. Chrome is required (`CHROME_PATH` if it is not `/usr/bin/google-chrome`).

Keep the committed dataset modest. Thumbnails are small WebP files. Prefer shrinking them over Git LFS.

## Removals

If someone asks for a site to be taken down, delete its entry from `public/data/catalog.json`, its row from `public/data/embeddings.bin`, and its thumbnail, then rebuild the projection (`npm run dataset:project` only works from `data/raw`). The reliable path is to remove the raw item and rerun embed + project. The in-app link opens a prefilled GitHub issue for this.

## Please don't

- Add analytics, accounts, or a backend.
- Load the model, thumbnails, or WASM from a third-party CDN.
- Put real people's names in the source, the README, or package metadata. Site titles that arrive inside the catalog can stay, because they are the catalog.
