# Twinsites

Your AI-built landing page has twins. Meet them.

Slop detectors give you a score. Twinsites names the relatives, and runs entirely in your browser.

Drop a screenshot, try a catalog example, or search any of the 2,003 sites by name or URL. A small vision model runs only for a screenshot you supply. A catalog site already has a vector, so its twins load without the model.

1. The zone your page belongs to, then the dozen nearest sites, as a percentile to one decimal.
2. Where that zone sits on a map of the whole catalog.
3. The marks you share with those twins, and three plain ways to step aside.
4. A PNG card for X. The zone name is the headline. Your own screenshot is included only if you opt in.

[![License: MIT](https://img.shields.io/badge/license-MIT-1b1612?style=flat-square)](LICENSE)
[![Comparison on device](https://img.shields.io/badge/comparison-on%20device-b82c1a?style=flat-square)](#privacy)

[![License: MIT](https://img.shields.io/badge/license-MIT-1b1612?style=flat-square)](LICENSE)
[![Comparison on device](https://img.shields.io/badge/comparison-on%20device-b82c1a?style=flat-square)](#privacy)

![Twinsites after a screenshot](docs/preview.png)

[Watch the 20 second launch demo](docs/launch.mp4)

## Privacy

Your screenshot never leaves the browser. There is no account and no API key in the site itself. The model, the thumbnails, and the embeddings are files on this site. Comparison is a cosine similarity on your device.

If you paste a URL, that path is off unless the build was given `VITE_SHOT_ENDPOINT`. When it is on, a separate Cloudflare Worker (not this VPS) visits the public page, returns a PNG, and does not store it. Setup is in [worker/README.md](worker/README.md). The VPS still serves only static files.

No cookies. Analytics is off unless both `VITE_ANALYTICS_SRC` and `VITE_ANALYTICS_DOMAIN` are set at build time. The page then loads that script and can send aggregate events: `visit`, `example`, `upload`, `result`, `share`, `subscribe` (plus `explore` when a catalog search is opened). `VITE_ANALYTICS_DOMAIN` is written to both `data-domain` (Plausible) and `data-website-id` (Umami), so you put whichever value that provider expects. Because the site uses `Cross-Origin-Embedder-Policy: require-corp`, the analytics host must send `Cross-Origin-Resource-Policy: cross-origin` on the script. Without that header the browser blocks it. No third-party account is created by this repo.

The page is served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. The quantized vision graph is not stable with a threaded runtime, so comparison always uses one thread. That also keeps it working when the document is not cross-origin isolated.

Sharing uses the sentence plus `https://twinsites.com`. On a phone that can share files, the button attaches the PNG. Otherwise it opens the X composer with that text. `public/og.png` is the preview for Open Graph and the large Twitter card. The tab icon is `favicon.svg`, and `apple-touch-icon.png` is the home-screen icon.

## How it works

The offline pipeline in `scripts/` reads the public URL list, screenshots the visible 1440×900 area, and writes the static files under `public/data/`:

- `catalog.json` — titles, URLs, traits, 2D positions, zone labels
- `embeddings.bin` — one normalized vector per site
- `calibration.json` — the percentile curve of catalog pairs
- `thumbs/` — small WebP miniatures
- `mosaic.webp`, `mosaic.json` — the home page wall: 191 thumbnails in one atlas, each with its nearest look-alikes on the wall and its catalog verdict, for the live demo (`npm run dataset:mosaic`)

Vectors come from the quantized MobileCLIP-S0 vision encoder (`Xenova/mobileclip_s0`, 8-bit), the same file the page loads from `/models`. They are computed in headless Chrome against a local build, because the Node ONNX runtime does not match the browser vectors. A shown percentile is how many random pairs in the catalog that cosine beats, not a pixel match. The map is a UMAP of those vectors after a PCA reduction. A new screenshot is not run through UMAP; it is placed among its nearest neighbors, which is what landing in a zone means. Zone names are the traits that lift above the catalog average, phrased as places. `/zones` lists them. `/zone/<slug>` is one zone, and `/site/<slug>` is one catalog site, both served by the SPA fallback. The build also writes a static `index.html` per zone, with its own title and description, under `dist/zone/<slug>/`, and one for `/zones`. A server that tries `$uri/index.html` before the SPA fallback shows that title to a crawler. The SPA still renders the page if it does not. This release does not change nginx.

`public/data/explore.json` is the precomputed twin list (top 12 and the band counts, excluding the site itself) plus a slim directory. `public/data/example.json` is one Lovable-style page used by “Try an example”, small enough to paint before the rest of the directory arrives. `npm run build` regenerates both from the embeddings already in the repo. No Chrome step.

The first screen does not wait on the model. On a desktop without data saver, the vision runtime and the catalog start downloading in the background while a screenshot is chosen. On a phone, when `navigator.connection.saveData` is set, or on a 2G/3G link, that download starts only on intent: pointer over the drop zone, focus, drag, paste, or opening the file picker. The progress bar is the share of those bytes that has arrived.

A visitor's image is cropped to the top 16:10 before the traits and the embedding, the same band as the catalog's 1440×900 first viewport. A tall, narrow capture also gets a note that the catalog is desktop.

### Later: square letterboxing

MobileCLIP resizes the short side to 256 and then center-crops a square. On a 16:10 frame that drops about 19% on each side, often the logo and the button. Letterboxing both the catalog shots and the upload into a square would keep that margin, but it changes every stored vector, the map, and the percentile curve. The raw shots are already on disk under `data/raw` (gitignored, 2,003 files). Re-encoding them in headless Chrome and refitting the map is a dataset rebuild, so this release leaves the stored embeddings as they are. After the 16:10 crop, an upload and a catalog shot still go through the same center crop.

### From diagnosis to fix

A result does three things after naming the twins:

1. **Why you look like them.** The recipe is the set of traits (ground, accent, density, gradient, grid, centring) that most of your twelve twins share with you, with how common that exact recipe is across the catalog.
2. **What to change.** Moves that fit your page and stand on at least half of the twins, strongest first, and a redesign prompt built from them to paste into Lovable, v0, Bolt or Cursor.
3. **Before and after.** Your last screenshot check (scores and a small preview) stays in this browser's local storage. Check a new version and Twinsites compares both on the same band, then draws a card with the drop (for example 14 → 0 twins in the top 5%). There is a link to forget it.

The worked example on the home page is real: `public/example/acme-before.html` and `acme-after.html` are a made-up page and its redesign following the prompt; the card shows what Twinsites measured for both.

Layout traits read against each page's own background, so dark pages are judged like light ones. `npm run dataset:layout` recomputes `centered` and `gradient` for the catalog from the thumbnails with the same function the browser runs; zone names stay as they are.

### How a result reads

A result is one page in three steps, in plain words. On top, the answer as a sentence ("Your page looks a lot like 14 AI-built sites"), a three-level meter (a little, somewhat, a lot) and a "What does it mean?" note with the percentile behind it. Then:

1. **See your twins.** The page and its closest twin in one frame, with a divider to slide between them (it sweeps once on first view, not with reduced motion) or side by side. Thumbnails are 420px wide, so the frame stays near 760px on desktop with the other twins beside it.
2. **Why they look alike.** The traits shared with the twins, marked on the screenshot, each with "Not right?" to correct it.
3. **How to set it apart.** The moves, the prompt, and a "Changed it already?" block that takes the new screenshot and shows the before and after.

Everything else (words, competitors, ideas, the map and zone, sharing) sits folded under "More" and loads only when opened. On the map a tap pins a card with a link; dragging or scrolling across it never opens a site.

### More in a result

- **One sentence first:** why the page looks like its twins and the change with the most effect.
- **Marks on the screenshot:** the centred block, empty bands, the accent and gradient margins the diagnosis found.
- **Correct the detector:** tap a trait that was read wrong; the diagnosis and prompt update. Only with a ticked box, the correction is sent anonymously to the worker's `/feedback` (trait, both values, six rounded measurements, day; no image, URL or IP). Needs `npx wrangler secret put FEEDBACK_SALT` and a redeploy of `worker/`; until then corrections stay local.
- **What the words say:** Tesseract reads the large text in the browser (files in `public/ocr`, about 7 MB, loaded after the result; on phones only on request) and flags stock phrases from `src/lib/cliches.ts`. `npm run dataset:copy` reads the catalog thumbnails to count how many homepages use each phrase (`public/data/copy.json`, a lower bound).
- **Pages that look like nobody:** per category, the catalog pages with the fewest twins (`npm run dataset:distinct`). Different, not certified better.
- **Next to your competitors:** up to three competitor screenshots measured against the page on the twins' percentile scale, in the browser.
- **Small screenshots:** under 1000px wide, the result warns that likeness reads less reliably.
- **A badge for pages that stand apart:** with no catalog page in the top 5%, the result offers a badge to put on the site. It is self-contained HTML with an inline SVG that links to twinsites.com: it loads nothing from this server and tracks nobody.
- **On a phone:** a section index sits under the verdict, and ideas, competitors and the map start folded; their content only loads when opened.

### Report

`/report` is the catalog in numbers: how many pages have a look-alike in the top 1% and how many have eight or more in the top 5%, light versus dark backgrounds, how often the headline is centred (from the hand-checked sample), colours, the most crowded categories, stock phrases (a lower bound, from thumbnails) and the largest zones, with the method and its limits. `scripts/report-data.ts` writes `public/data/report.json` from the files already in `public/data` and runs as part of `npm run build`. The build also writes `dist/report/index.html` with its own title and description for crawlers and link previews.

### How reliable the layout rules are

`quality/labels-2026-10-20.json` holds 200 random catalog pages labelled one by one by eye, blind to the detector (by Claude, the AI that built the check, not a panel of designers). `npm run reliability` scores the stored traits against them and writes `quality/reliability.json`, which the report reads. On 2026-10-20:

| Trait | Agreement | Note |
| --- | ---: | --- |
| Light or dark background | 99% | |
| Centred headline and button | 88% | reads only the headline band (14–55% of the height); thresholds set on the even-numbered labels, 89% on the odd ones (the earlier whole-band rule: 77%) |
| Spacing (airy, balanced, packed) | 30% | counts only near-white pixels as empty, so dark and cream pages read as packed; background-relative versions and higher resolutions did not reach a useful level either |
| Gradient wash | 88% | but a detected gradient was real 3 times in 10 |
| Box grid | 95% | 0 of 6 grids found; the high agreement is just their rarity |

So the diagnosis, the zone sentences and the report only name the background, the accent colour and centring. The other traits are still computed and stored, never claimed. Rerun the script after any detector change, and add labels to the file rather than tuning on it.

### What counts as a twin

A single global cut does not work. On the 2,003-site pair curve (400,000 seeded pairs), the median cosine is about 0.32 and the 80th percentile is about 0.62. Measured against that curve in Chrome:

| Screenshot | Nearest | Top 20% | Top 5% | Top 3% | Top 1% |
| --- | ---: | ---: | ---: | ---: | ---: |
| MenuThere, already in the catalog | 100.0 | 3 | 1 | 1 | 1 |
| Capabase, a typical SaaS landing | 87.9 | 12 | 0 | 0 | 0 |
| Lofi Cities, a dark scene | 99.0 | 697 | 80 | 21 | 4 |
| A handmade newspaper page | 73.2 | 0 | 0 | 0 | 0 |

The top 5% leaves the SaaS page with no twins. A rounded count once called 697 pages a twin of the dark scene in the top 20%, which is the dense part of the catalog, not a likeness. The live top-3% count for that scene is 21.

The page walks the bands 99, 97, 95, 90, 85, 80 and keeps the tightest band whose count is between 8 and 40. A thinner match still uses the tightest band it actually clears. If every non-empty band is above 40, the sentence names the zone and the neighbors instead of calling them twins. Nothing in the top 20% is “no twin in the top 20%”.

That rule, on the same four screenshots: “1 twin in the top 1%”, “12 twins in the top 20%”, “21 twins in the top 3%”, and “No twin in the top 20%”. A phone capture of Linear, cropped to its first screen, reads “9 twins in the top 3%”, with a note that the catalog is desktop. The number is the real count. The card and the post say it as “21 twins among 2,003 AI-built sites”, so two results can be compared without the band in the sentence. The cards show the nearest percentile to one decimal, because a rounded “99th” was hiding the order inside the top percent. The band count uses that same unrounded percentile, so 98.5 does not count as the top 1%. The wide-band census in the table (697, 80, 4) is the earlier rounded pass; the sentences above are what the page says now.


## Catalog

Homepages are drawn from [awesome-vibe-coded-apps](https://github.com/JefferyLee/awesome-vibe-coded-apps) (CC0 1.0). The legal code is in `public/data/CATALOG-CC0.txt`. Attribution and what we store is in `public/data/ATTRIBUTION.md`.

The committed field guide holds **2,003** sites. Model, runtime, and catalog together are about **53 MB**.

If your site is in the drawer and you want it gone, use the link in the footer. It opens a prefilled removal issue.

## Develop

```bash
npm ci
npm run dev
```

`npm run build` writes `dist/`. `npm run qa` builds and checks the whole site end to end in headless Chromium (wall, example, FAQ, upload, before/after, other pages, phone layout); it starts and stops its own preview server. Set `CHROME_PATH` if Chromium is not where Playwright expects it. `npm run preview` serves that build with the same isolation headers as dev.

## Regenerate or extend the dataset

You need Chrome or Chromium on the machine (`CHROME_PATH` overrides `/usr/bin/google-chrome`). The capture step resumes; delete `data/raw` to start clean. That directory is gitignored. Embedding reads `dist/`, so the dataset command builds the site before it encodes screenshots.

```bash
# optional: curl the catalog JSON yourself and pass --catalog
npm run dataset -- --attempts 4000 --success 2000 --concurrency 4
```

Or run the stages separately:

```bash
npm run dataset:capture -- --attempts 4000 --success 2000
npm run dataset:embed
npm run dataset:project
```

`npm run dataset:calibrate` rewrites the zone names and the percentile curve from the files already in `public/data`, without recapturing.

Keep thumbnails small. The projection step re-encodes them to 420px WebP. Prefer that over Git LFS.

## Security headers

`ops/nginx/twinsites-security.conf` is the one copy of the security headers and the Content-Security-Policy. `vite preview` and `npm run qa` serve it (the CSP always enforced, HSTS dropped on plain HTTP), and production includes the same file in the twinsites nginx server block. `npm run qa` builds with the worker endpoint and Cloudflare's test Turnstile key, stands in for Turnstile and the worker, and fails on any CSP violation or console error, so a change that needs a new origin fails before it reaches production. Change the policy in that file, then copy it to the server.

## Deploy

`.github/workflows/deploy.yml` runs only on a push to `main`: `npm ci && npm run build`, then `rsync` of `dist/` to the web root. It does not start a process on the VPS, and it does not deploy the Worker in `/worker`. Pull requests do not deploy. Optional Actions variables (`VITE_SHOT_ENDPOINT`, `VITE_TURNSTILE_SITEKEY`, `VITE_ANALYTICS_SRC`, `VITE_ANALYTICS_DOMAIN`) are passed into the build and stay empty when unset. The workflow expects an ed25519 key in the `VPS_SSH_KEY` secret and a pinned `known_hosts` line in `VPS_KNOWN_HOSTS`. If that second secret is empty, the job warns and falls back to `ssh-keyscan`, so a push to `main` still deploys. The server already speaks HTTP with SPA fallback, long-lived caching for `/assets/`, and the COOP/COEP/CORP headers.

### Weight and speed

`npm run weight` measures what a phone downloads before its first result: a cold cache, fast 4G (9 Mbit/s down, 1.5 up, 40 ms), the CPU slowed 4×, a 390px screen, and a screenshot chosen the moment the page appears. On 2026-10-20 it read **21.6 s and 13.6 MB** (gzip). It was 47.6 s and 40.7 MB before three changes:

- **The CPU-only runtime.** The app imports `onnxruntime-web/wasm` (an alias in `vite.config.ts`) and ships `ort-wasm-simd-threaded.wasm`: 11.1 MB, 2.9 MB gzipped, against 21.6 MB for the WebGPU (JSEP) build, whose extra layer was never used. Embeddings from both runtimes are bit-identical.
- **Precompressed files.** The build writes a `.gz` next to every compressible file in `dist/`; nginx sends them with `gzip_static on;`, and `vite preview` does the same so measurements match production. The progress bars count against the stored sizes (`WASM_BYTES`, `VISION_BYTES`, `__DATA_BYTES__`), because with gzip `content-length` is the compressed size.
- **Half-precision vectors for the browser.** `scripts/embeddings-f16.ts` writes `embeddings.f16.bin` (1.9 MB gzipped instead of 3.8 MB). A cosine moves by under 1e-4; on eight test images the twelve twins were identical and one band count in 48 differed by one site at a band edge. `embeddings.bin` (float32) stays the source for every script.

What is left is mostly the vision model (7.7 MB gzipped) and the phone's CPU. On desktop without a throttle, the first result is a few seconds.

## Next

- Compare competitors by pasting their URLs, through the screenshot worker. Planned as a paid feature.

The suggestions are rules read off shared marks. A later version can go further: one concrete move per trait (type, image, grid, motion), and a redesign prompt you can paste into Cursor or v0. The square letterbox described above is the dataset half of that pass.

## License

MIT. Copyright Ana Gui. See [LICENSE](LICENSE).

The vision weights keep their own notice in `public/models/Xenova/mobileclip_s0/LICENSE`. The WebAssembly runtime notice is in `public/ort/NOTICE.md`.
