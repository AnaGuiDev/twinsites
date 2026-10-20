/**
 * Read the large text (headline, subhead, buttons) on every catalog thumbnail
 * with Tesseract, and count how many homepages use each stock phrase. The page
 * shows those counts next to the phrases it finds on yours.
 *
 *   npm run dataset:copy           (all sites, a few minutes)
 *   npm run dataset:copy -- 50     (first 50, to try it)
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createScheduler, createWorker, OEM } from "tesseract.js";
import { CLICHES } from "../src/lib/cliches.ts";

const limit = Number(process.argv[2] ?? 0) || Infinity;
const catalog = JSON.parse(await readFile("public/data/catalog.json", "utf8")) as { sites: { slug: string; thumb: string }[] };
const sites = catalog.sites.slice(0, limit);

const langPath = path.resolve("public/ocr");
const scheduler = createScheduler();
const WORKERS = Math.max(2, Math.min(8, (await import("node:os")).cpus().length));
for (let i = 0; i < WORKERS; i++) {
  const worker = await createWorker(["eng", "spa"], OEM.LSTM_ONLY, {
    langPath: `${langPath}`,
    cachePath: path.resolve("node_modules/.cache/tesseract"),
    gzip: true,
    workerBlobURL: false,
  });
  scheduler.addWorker(worker);
}

const counts: Record<string, number> = Object.fromEntries(CLICHES.map((cliche) => [cliche.id, 0]));
let withText = 0;
let done = 0;
await Promise.all(
  sites.map(async (site) => {
    // The top two thirds, where the headline and buttons sit, at 2.4 times the
    // thumbnail in grey: large type becomes legible, small type does not, as intended.
    const thumb = sharp(`public/data/${site.thumb}`);
    const meta = await thumb.metadata();
    const image = await thumb
      .extract({ left: 0, top: 0, width: meta.width ?? 420, height: Math.round((meta.height ?? 263) * 0.66) })
      .resize(1000)
      .grayscale()
      .normalise()
      .png()
      .toBuffer();
    const { data } = await scheduler.addJob("recognize", image, {}, { blocks: true });
    const height = 1000 * 0.625;
    const lines: string[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          const tall = line.bbox.y1 - line.bbox.y0 >= height * 0.022;
          if (tall && line.confidence >= 55) lines.push(line.text);
        }
      }
    }
    const text = lines.join(" ").toLowerCase().replace(/\s+/g, " ");
    if (process.env.SHOW_TEXT) console.log(`${site.slug}: ${text.slice(0, 160)}`);
    if (text.trim().length >= 12) withText++;
    for (const cliche of CLICHES) if (cliche.pattern.test(text)) counts[cliche.id]++;
    done++;
    if (done % 100 === 0) console.log(`copy ${done}/${sites.length}`);
  }),
);
await scheduler.terminate();

await writeFile("public/data/copy.json", JSON.stringify({ total: sites.length, withText, counts }));
const top = Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .map(([id, n]) => `${id} ${n}`)
  .join(", ");
console.log(`read ${withText}/${sites.length} with large text; top: ${top}`);
