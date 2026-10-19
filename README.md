# Twinsites

Every AI landing page has a twin. Twinsites shows you which ones.

Drop a screenshot of a homepage. In the browser, a small vision model lines it up against a field guide of vibe-coded websites and answers four things:

1. The dozen sites that look most like yours, as a percentile of catalog pairs, with a link to the original.
2. Where your page lands on a map of the whole catalog.
3. The marks you share with those twins, and three plain ways to step aside.
4. A PNG card you can post on X, with the sentence and `https://twinsites.com`.

Slop detectors hand out a score. Twinsites names the relatives.

[![License: MIT](https://img.shields.io/badge/license-MIT-1b1612?style=flat-square)](LICENSE)
[![Comparison on device](https://img.shields.io/badge/comparison-on%20device-b82c1a?style=flat-square)](#privacy)

![Twinsites after a screenshot](docs/preview.png)

[Watch the 20 second launch demo](docs/launch.mp4)

## Privacy

Your screenshot never leaves the browser. There is no account, no upload, and no API key. The model, the thumbnails, and the embeddings are files on this site. Comparison is a cosine similarity on your device.

The page is served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. The quantized vision graph is not stable with a threaded runtime, so comparison always uses one thread. That also keeps it working when the document is not cross-origin isolated.

Sharing uses the sentence plus `https://twinsites.com`. On a phone that can share files, the button attaches the PNG. Otherwise it opens the X composer with that text. `public/og.png` is the preview for Open Graph and the large Twitter card. The tab icon is `favicon.svg`, and `apple-touch-icon.png` is the home-screen icon.

## How it works

The offline pipeline in `scripts/` reads the public URL list, screenshots the visible 1440×900 area, and writes the static files under `public/data/`:

- `catalog.json` — titles, URLs, traits, 2D positions, zone labels
- `embeddings.bin` — one normalized vector per site
- `calibration.json` — the percentile curve of catalog pairs
- `thumbs/` — small WebP miniatures

Vectors come from the quantized MobileCLIP-S0 vision encoder (`Xenova/mobileclip_s0`, 8-bit), the same file the page loads from `/models`. They are computed in headless Chrome against a local build, because the Node ONNX runtime does not match the browser vectors. A shown percentile is how many random pairs in the catalog that cosine beats, not a pixel match. The map is a UMAP of those vectors after a PCA reduction. A new screenshot is not run through UMAP; it is placed among its nearest neighbors, which is what “landing in the neighborhood” means. Zone names are the traits that lift above the catalog average, phrased as places.

The first screen does not wait on the model. The vision runtime and the catalog start downloading in the background while a screenshot is chosen, and the progress bar is the share of those bytes that has arrived.

### What counts as a twin

A single global cut does not work. On the 2,003-site pair curve (400,000 seeded pairs), the median cosine is about 0.32 and the 80th percentile is about 0.62. Measured against that curve in Chrome:

| Screenshot | Nearest | Top 20% | Top 5% | Top 3% | Top 1% |
| --- | ---: | ---: | ---: | ---: | ---: |
| MenuThere, already in the catalog | 100th | 3 | 1 | 1 | 1 |
| Capabase, a typical SaaS landing | 88th | 15 | 0 | 0 | 0 |
| Lofi Cities, a dark scene | 99th | 697 | 80 | 31 | 4 |
| A handmade newspaper page | 73rd | 0 | 0 | 0 | 0 |

The top 5% leaves the SaaS page with no twins. The top 20% calls 697 pages a twin of the dark scene, which is the dense part of the catalog, not a likeness.

The page walks the bands 99, 97, 95, 90, 85, 80 and keeps the tightest band whose count is between 8 and 40. A thinner match still uses the tightest band it actually clears. If every non-empty band is above 40, the sentence names the zone and the neighbors instead of calling them twins. Nothing in the top 20% is “no twin in the top 20%”.

That rule, on the same four screenshots: “1 twin in the top 1%”, “15 twins in the top 20%”, “31 twins in the top 3%”, and “No twin in the top 20%”. A dark mobile landing of Linear, which sits in a packed part of the field, reads “Your site lives in Ink Dashboard Ridge with 176 neighbors in the top 1%.” The number is the real count. The wording is the part that stays shareable.


## Catalog

Homepages are drawn from [awesome-vibe-coded-apps](https://github.com/JefferyLee/awesome-vibe-coded-apps) (CC0 1.0). The legal code is in `public/data/CATALOG-CC0.txt`. Attribution and what we store is in `public/data/ATTRIBUTION.md`.

The committed field guide holds **2,003** sites. Model, runtime, and catalog together are about **53 MB**.

If your site is in the drawer and you want it gone, use the link in the header. It opens a prefilled removal issue.

## Develop

```bash
npm ci
npm run dev
```

`npm run build` writes `dist/`. `npm run preview` serves that build with the same isolation headers as dev.

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

## Deploy

`.github/workflows/deploy.yml` runs only on a push to `main`: `npm ci && npm run build`, then `rsync` of `dist/` to the web root. Pull requests do not deploy. The workflow expects an ed25519 key in the `VPS_SSH_KEY` secret. The server already speaks HTTP with SPA fallback, long-lived caching for `/assets/`, and the COOP/COEP/CORP headers.

On a local preview, the drop zone is usable in about 0.1 s on desktop and 0.4 s on an emulated phone. A cold fast-4G phone (40 ms latency, 9 Mbit/s down, 1.5 Mbit/s up, 4× CPU, cache off) spends about 31 s preloading the eye and the drawer in the background, then returns the first twins in about 4 s. Choosing a file the instant the page appears, before that preload, takes about 35 s. Desktop, with no throttle, returns the first twins in about 2.3 s.

## Next

The suggestions are rules read off shared marks. A later version can go further: one concrete move per trait (type, image, grid, motion), and a redesign prompt you can paste into Cursor or v0.

## License

MIT. Copyright Ana Gui. See [LICENSE](LICENSE).

The vision weights keep their own notice in `public/models/Xenova/mobileclip_s0/LICENSE`. The WebAssembly runtime notice is in `public/ort/NOTICE.md`.
