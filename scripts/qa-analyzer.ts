/**
 * End-to-end check of the built site: the live wall, the worked example, the
 * FAQ, an upload with its diagnosis and prompt, a second upload compared with
 * the first, the other pages, and phone layout. Starts its own preview server
 * and always stops it, so nothing is left running.
 *
 *   npm run qa            (builds first)
 *   CHROME_PATH=/path/to/chrome npm run qa
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const PORT = Number(process.env.QA_PORT ?? 4319);
const BASE = `http://127.0.0.1:${PORT}`;
const root = process.cwd();
const results: { name: string; ok: boolean; note: string }[] = [];
const errors: string[] = [];

async function check(name: string, run: () => Promise<string | void>): Promise<void> {
  try {
    const note = (await run()) ?? "";
    results.push({ name, ok: true, note });
  } catch (error) {
    results.push({ name, ok: false, note: error instanceof Error ? error.message : String(error) });
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`preview server did not start on ${BASE}`);
}

function watch(page: Page, label: string): void {
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label}: ${message.text()}`);
  });
}

async function snap(browser: Browser, file: string, out: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`file://${path.join(root, file)}`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out });
  await page.close();
}

async function upload(page: Page, file: string): Promise<void> {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.setInputFiles("input[type=file]", file);
  await page.locator(".diagnosis").waitFor({ timeout: 120_000 });
}

async function noOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

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
process.on("SIGINT", () => process.exit(130));

const work = await mkdtemp(path.join(tmpdir(), "twinsites-qa-"));
let browser: Browser | null = null;
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const before = path.join(work, "before.png");
  const after = path.join(work, "after.png");
  await snap(browser, "public/example/acme-before.html", before);
  await snap(browser, "public/example/acme-after.html", after);

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  watch(page, "desktop");

  await check("home: the wall lights up real twins", async () => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.locator(".tile.is-twin").first().waitFor({ timeout: 8_000 });
    const lit = await page.locator(".tile.is-twin").count();
    const caption = await page.locator(".demo-title").innerText();
    assert(lit >= 2, `only ${lit} twins lit`);
    return `${lit} lit for “${caption}”`;
  });

  await check("home: worked example card loads", async () => {
    const card = page.locator(".example-card");
    await card.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>(".example-card");
      return Boolean(image && image.complete && image.naturalWidth > 0);
    });
  });

  await check("home: FAQ opens", async () => {
    const items = page.locator(".faq details");
    const count = await items.count();
    assert(count >= 14, `${count} questions`);
    await items.nth(3).locator("summary").click();
    assert(await items.nth(3).evaluate((node) => (node as HTMLDetailsElement).open), "did not open");
    return `${count} questions`;
  });

  await check("upload: diagnosis and prompt", async () => {
    await upload(page, before);
    const verdict = await page.locator(".again-line").innerText();
    const recipe = await page.locator(".recipe li").count();
    const moves = await page.locator(".moves li").count();
    const prompt = await page.locator(".prompt-text").innerText();
    assert(recipe >= 1 && moves >= 1, `recipe ${recipe}, moves ${moves}`);
    assert(prompt.startsWith("Redesign the first screen"), "prompt missing");
    return `${verdict} recipe ${recipe}, moves ${moves}`;
  });

  await check("result: one-line summary and marks on the screenshot", async () => {
    const summary = await page.locator(".summary").first().innerText();
    assert(/most because|change with the most effect/i.test(summary), `summary “${summary}”`);
    await page.locator(".marks-layer").waitFor({ timeout: 10_000 });
    return summary.slice(0, 90);
  });

  await check("result: words read and stock phrases flagged", async () => {
    await page.waitForFunction(() => document.querySelectorAll(".cliches li").length > 0, null, { timeout: 90_000 });
    const found = await page.locator(".cliches li strong").allInnerTexts();
    const prompt = await page.locator(".prompt-text").innerText();
    assert(prompt.includes("stock phrases"), "prompt lacks the copy step");
    return found.join(", ");
  });

  await check("result: correcting a trait updates the prompt", async () => {
    const before = await page.locator(".prompt-text").innerText();
    await page.locator(".recipe-chip").last().click();
    await page.locator(".correct-box .ticket").first().click();
    const after = await page.locator(".prompt-text").innerText();
    assert(before !== after, "prompt unchanged");
    assert((await page.locator(".fixes li").count()) === 1, "no correction listed");
    await page.locator(".fixes li .as-button").click();
  });

  await check("result: pages that look like nobody", async () => {
    const chips = await page.locator(".inspiration .chip").count();
    const sites = await page.locator(".inspiration .sheet a").count();
    assert(chips >= 5 && sites >= 3, `chips ${chips}, sites ${sites}`);
    return `${chips} categories`;
  });

  await check("result: a competitor that is the page itself reads as a mix-up", async () => {
    await page.locator(".rivals input[type=file]").setInputFiles(before);
    await page.locator(".rival-verdict").first().waitFor({ timeout: 60_000 });
    const score = await page.locator(".rival-score strong").first().innerText();
    assert(parseFloat(score) >= 99, `score ${score}`);
    return score;
  });

  await check("second upload: before/after and progress card", async () => {
    await upload(page, after);
    await page.locator(".progress .ticket").first().click();
    const numbers = await page.locator(".progress-numbers").innerText();
    assert(/\d+\s*→\s*\d+/.test(numbers), `numbers “${numbers}”`);
    await page.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>("img.card-preview");
      return Boolean(image && image.complete && image.naturalWidth === 1200);
    });
    return numbers.replace(/\s+/g, " ");
  });

  await check("forget last check", async () => {
    await page.locator(".forget").click();
    const stored = await page.evaluate(() => localStorage.getItem("twinsites.lastCheck"));
    assert(stored === null, "still stored");
  });

  for (const [route, selector] of [
    ["/faq", ".faq-page h1"],
    ["/zones", ".zone-card"],
    ["/zone/warm-paper-atoll", ".sheet a"],
    ["/site/fancanon", ".diagnosis"],
    ["/privacy", ".privacy-page h1"],
  ] as const) {
    await check(`page ${route}`, async () => {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await page.locator(selector).first().waitFor({ timeout: 30_000 });
    });
  }

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await phone.newPage();
  watch(mobile, "phone");
  await check("phone: home fits", async () => {
    await mobile.goto(`${BASE}/`, { waitUntil: "networkidle" });
    assert(await noOverflow(mobile), "horizontal overflow");
  });
  await check("phone: result fits, words wait for a tap", async () => {
    await upload(mobile, before);
    assert(await noOverflow(mobile), "horizontal overflow");
    assert((await mobile.locator(".copy-start .ticket").count()) === 1, "reader started on its own");
  });

  await check("no console or page errors", async () => {
    assert(errors.length === 0, errors.slice(0, 3).join(" | "));
  });
} finally {
  await browser?.close();
  await rm(work, { recursive: true, force: true });
  stop();
}

for (const result of results) console.log(`${result.ok ? "ok  " : "FAIL"} ${result.name}${result.note ? ` — ${result.note}` : ""}`);
const failed = results.filter((result) => !result.ok).length;
console.log(failed ? `\n${failed} failed` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);
