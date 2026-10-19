/**
 * Embed captured screenshots with the same Chrome + WASM runtime the site uses.
 *
 * onnxruntime-node does not match the browser MobileCLIP vectors (cosine often
 * lands around 0.5 for the same PNG), and the threaded runtime is unstable.
 * This step therefore serves `dist/` and asks headless Chrome to run `embedBlob`.
 * Build first (`npm run build`) so harness.html and the vendored model are in dist.
 *
 * Writes data/raw/vectors.f32 in embedded.json order. Does not rewrite traits.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium, type Page } from "playwright";

interface Item {
  slug: string;
}

const ROOT = process.cwd();
const RAW = path.join(ROOT, "data", "raw");
const DIST = path.join(ROOT, "dist");
const SHOTS = path.join(RAW, "shots");
const PORT = Number(process.env.TWINSITES_EMBED_PORT ?? 4174);
const DIM = 512;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function startServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    const rel = decodeURIComponent(url.pathname);
    const root = rel.startsWith("/shots/") ? SHOTS : DIST;
    const leaf = rel.startsWith("/shots/") ? rel.slice("/shots/".length) : rel;
    const file = path.normalize(path.join(root, leaf));
    if (!file.startsWith(root)) {
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
  return new Promise((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function openPage(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<Page> {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/harness.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.documentElement.dataset.embed === "ready", null, { timeout: 120000 });
  return page;
}

async function embedSlugs(page: Page, slugs: string[]): Promise<number[][]> {
  return page.evaluate(async (names) => {
    const hook = (window as unknown as { embedBlob?: (blob: Blob) => Promise<Float32Array> }).embedBlob;
    if (!hook) throw new Error("embedBlob missing");
    const rows: number[][] = [];
    for (const slug of names) {
      const response = await fetch(`/shots/${slug}.png`);
      if (!response.ok) throw new Error(`${slug} ${response.status}`);
      const vector = await hook(await response.blob());
      if (vector.length !== 512) throw new Error(`${slug} dim ${vector.length}`);
      rows.push(Array.from(vector));
    }
    return rows;
  }, slugs);
}

function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

async function main(): Promise<void> {
  if (!existsSync(path.join(DIST, "harness.html"))) {
    throw new Error("dist/harness.html missing. Run npm run build first.");
  }
  const items = JSON.parse(await readFile(path.join(RAW, "embedded.json"), "utf8")) as Item[];
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : items.length;
  const count = Math.min(items.length, limit);
  const vectors = new Float32Array(count * DIM);
  let done = 0;
  const progressPath = path.join(RAW, "embed-progress.json");
  if (existsSync(path.join(RAW, "vectors.f32")) && existsSync(progressPath) && count === items.length) {
    const progress = JSON.parse(await readFile(progressPath, "utf8")) as { count: number; dim: number };
    const previous = await readFile(path.join(RAW, "vectors.f32"));
    if (progress.dim === DIM && previous.length === items.length * DIM * 4 && progress.count > 0 && progress.count <= items.length) {
      const aligned = new Uint8Array(previous);
      vectors.set(new Float32Array(aligned.buffer, 0, progress.count * DIM));
      done = progress.count;
      console.log(`resuming at ${done}/${items.length}`);
    }
  }

  const server = await startServer();
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await openPage(browser);
  const started = Date.now();
  const batch = 8;
  while (done < count) {
    const slugs = items.slice(done, Math.min(count, done + batch)).map((item) => item.slug);
    const rows = await embedSlugs(page, slugs);
    for (let i = 0; i < rows.length; i++) vectors.set(rows[i], (done + i) * DIM);
    done += rows.length;
    if (count === items.length && (done % 40 === 0 || done === count)) {
      await writeFile(path.join(RAW, "vectors.f32"), Buffer.from(vectors.buffer));
      await writeFile(progressPath, JSON.stringify({ count: done, dim: DIM }));
    }
    const elapsed = (Date.now() - started) / 1000;
    if (done % 40 === 0 || done === count) console.log(`embedded ${done}/${count} ${(done / elapsed).toFixed(2)}/s`);
  }

  const checkPage = await openPage(browser);
  const checks = [0, Math.floor((count - 1) / 2), count - 1];
  let worst = 1;
  for (const index of checks) {
    const [again] = await embedSlugs(checkPage, [items[index].slug]);
    const score = cosine(vectors.subarray(index * DIM, index * DIM + DIM), again);
    worst = Math.min(worst, score);
    console.log(`self-check ${index} ${items[index].slug} ${score.toFixed(4)}`);
    if (score < 0.999) throw new Error(`Browser embedding is not stable at ${index} (${score})`);
  }

  if (count === items.length) {
    await writeFile(path.join(RAW, "vectors.f32"), Buffer.from(vectors.buffer));
    await writeFile(progressPath, JSON.stringify({ count: done, dim: DIM }));
    await writeFile(
      path.join(RAW, "embed-meta.json"),
      JSON.stringify({ dim: DIM, count: items.length, self: worst, runtime: "chrome-wasm" }),
    );
  }
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  console.log(`wrote ${count} browser vectors`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
