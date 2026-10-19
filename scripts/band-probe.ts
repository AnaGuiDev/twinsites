/** Count neighbors at several pair-percentiles for the launch screenshots. */
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { percentileOf } from "../src/lib/calibrate.ts";

const PORT = 4181;
const DIST = path.resolve("dist");
const FILES: Record<string, string> = {
  known: "/tmp/twinsites-keep/known.png",
  saas: "/tmp/twinsites-keep/holdout-1.png",
  dark: "/tmp/twinsites-keep/holdout-2.png",
  handmade: "/tmp/twinsites-keep/handmade.png",
};
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".png": "image/png",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

function start(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    const rel = decodeURIComponent(url.pathname);
    let file = path.normalize(path.join(DIST, rel));
    if (rel.startsWith("/shots/")) file = FILES[rel.slice("/shots/".length).replace(/\.png$/, "")] ?? "";
    if (!file.startsWith(DIST) && !Object.values(FILES).includes(file)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

const server = await start();
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/harness.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.documentElement.dataset.embed === "ready");
const names = Object.keys(FILES);
const vectors = await page.evaluate(async (keys: string[]) => {
  const hook = (window as unknown as { embedBlob: (b: Blob) => Promise<Float32Array> }).embedBlob;
  const out: Record<string, number[]> = {};
  for (const key of keys) {
    const blob = await (await fetch(`/shots/${key}.png`)).blob();
    out[key] = Array.from(await hook(blob));
  }
  return out;
}, names);
await browser.close();
server.close();

const cal = JSON.parse(await readFile("public/data/calibration.json", "utf8")) as { knots: number[] };
const catalog = JSON.parse(await readFile("public/data/catalog.json", "utf8")) as {
  sites: { cluster: number; x: number; y: number }[];
  clusters: { id: number; labelEn: string }[];
};
const bin = await readFile("public/data/embeddings.bin");
const count = bin.readUInt32LE(12);
const dim = bin.readUInt32LE(8);
const aligned = new Uint8Array(bin.subarray(16));
const rows = new Float32Array(aligned.buffer, aligned.byteOffset, count * dim);
const bands = [80, 85, 90, 95, 97, 99];

for (const name of names) {
  const vector = vectors[name];
  const scores = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    const base = i * dim;
    for (let d = 0; d < dim; d++) sum += vector[d] * rows[base + d];
    scores[i] = sum;
  }
  let best = 0;
  for (let i = 1; i < count; i++) if (scores[i] > scores[best]) best = i;
  const counts: Record<number, number> = {};
  for (const band of bands) {
    let n = 0;
    for (let i = 0; i < count; i++) if (Math.round(percentileOf(scores[i], cal.knots)) >= band) n++;
    counts[band] = n;
  }
  const label = catalog.clusters.find((cluster) => cluster.id === catalog.sites[best].cluster)?.labelEn;
  console.log(name, "nearest", scores[best].toFixed(3), "rank", Math.round(percentileOf(scores[best], cal.knots)), label, counts);
}
