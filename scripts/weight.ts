/**
 * What a phone downloads before its first result, and how long it takes.
 * Cold cache, fast 4G (9 Mbit/s down, 1.5 up, 40 ms), CPU slowed 4×, 390px
 * wide; the screenshot is chosen the moment the page appears. Bytes are given
 * as stored and as gzip (what nginx sends with gzip_static and the .gz files
 * the build writes). Uses the built dist/ and its own preview server.
 *
 *   npm run build && npm run weight
 *   CHROME_PATH=/path/to/chrome npm run weight
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";

const PORT = Number(process.env.WEIGHT_PORT ?? 4327);
const BASE = `http://127.0.0.1:${PORT}`;
const root = process.cwd();
const dist = path.join(root, "dist");

const server = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  cwd: root,
  stdio: "ignore",
  detached: true,
});
const stop = () => {
  try {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  } catch {
    // already gone
  }
};
process.on("exit", stop);

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("preview server did not start");
}

/** Stored and gzip size of the file behind a same-origin URL. */
function sizes(url: string): { raw: number; gz: number } | null {
  let file = path.join(dist, decodeURIComponent(new URL(url).pathname));
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!existsSync(file)) file = path.join(dist, "index.html");
  const raw = statSync(file).size;
  if (file.endsWith(".gz")) return { raw, gz: raw };
  const gz = existsSync(`${file}.gz`) ? statSync(`${file}.gz`).size : gzipSync(readFileSync(file), { level: 9 }).length;
  return { raw, gz: Math.min(raw, gz) };
}

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
const work = await mkdtemp(path.join(tmpdir(), "twinsites-weight-"));
try {
  await waitForServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const shot = path.join(work, "page.png");
  const snap = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await snap.goto(`file://${path.join(root, "public/example/acme-before.html")}`);
  await snap.screenshot({ path: shot });
  await snap.close();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 40,
    downloadThroughput: (9_000_000 / 8) * 0.9,
    uploadThroughput: (1_500_000 / 8) * 0.9,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const seen = new Map<string, { raw: number; gz: number }>();
  page.on("response", (response) => {
    const url = response.url();
    if (!url.startsWith(BASE) || seen.has(url.split("?")[0])) return;
    const size = sizes(url);
    if (size) seen.set(url.split("?")[0], size);
  });

  const started = Date.now();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator("input[type=file]").first().setInputFiles(shot);
  await page.locator(".diagnosis").waitFor({ timeout: 300_000 });
  const seconds = (Date.now() - started) / 1000;

  const rows = [...seen.entries()].sort((a, b) => b[1].raw - a[1].raw);
  const raw = rows.reduce((sum, [, size]) => sum + size.raw, 0);
  const gz = rows.reduce((sum, [, size]) => sum + size.gz, 0);
  for (const [url, size] of rows.slice(0, 6)) console.log(`${mb(size.raw).padStart(8)} ${mb(size.gz).padStart(8)} gz  ${new URL(url).pathname}`);
  console.log(`\nfirst result: ${seconds.toFixed(1)} s on emulated fast 4G (as served by this preview)`);
  console.log(`downloaded: ${mb(raw)} stored, ${mb(gz)} with gzip, ${rows.length} files`);
  await browser.close();
} finally {
  await rm(work, { recursive: true, force: true });
  stop();
}
process.exit(0);
