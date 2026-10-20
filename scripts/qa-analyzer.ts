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
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

/** Must match the VITE_SHOT_ENDPOINT the qa build uses (package.json). */
const SHOT = "https://twinsites-shot.twinsites.workers.dev";
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

/** Static HTML must not carry a style or script that style-src/script-src 'self' would block. */
function assertNoInline(html: string, label: string): void {
  assert(!/<style[\s>]/i.test(html), `${label} has a style element`);
  assert(!/\sstyle\s*=/i.test(html), `${label} has a style attribute`);
  const inline = [...html.matchAll(/<script\b([^>]*)>/gi)].filter((match) => !/\ssrc\s*=/i.test(match[1] ?? ""));
  assert(inline.length === 0, `${label} has an inline script`);
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

/**
 * Stands in for Cloudflare: a Turnstile that passes at once, and a worker that
 * answers the capture with a screenshot and accepts /subscribe and /feedback.
 * The requests still go through the page's real CSP and COEP, which is the point.
 */
async function fakeCloudflare(context: BrowserContext, screenshot: string, sent: string[]): Promise<void> {
  const png = await readFile(screenshot);
  await context.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      headers: { "Cross-Origin-Resource-Policy": "cross-origin" },
      body: `window.turnstile = {
        render(el, options) { setTimeout(() => options.callback && options.callback("qa-token"), 20); return "qa"; },
        reset() {}, remove() {},
      };`,
    }),
  );
  await context.route(`${SHOT}/**`, async (route) => {
    const request = route.request();
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const pathname = new URL(request.url()).pathname;
    sent.push(`${pathname} ${request.postData() ?? ""}`);
    if (pathname === "/") return route.fulfill({ status: 200, contentType: "image/png", headers: cors, body: png });
    return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: '{"ok":true}' });
  });
  // A blocked resource also shows up here, so the "no console errors" check catches CSP violations.
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`CSP blocked ${event.blockedURI || "inline"} (${event.effectiveDirective})`);
    });
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

/**
 * The badge is for a page with nobody in the top 5% (bands[95] === 0), which
 * is the typical SaaS landing in this catalog, not the darker redesign.
 * The badge reuses `.prompt-text`, so prompt checks stay inside `.prompt-box`.
 */
async function assertBadgeContract(page: Page): Promise<string> {
  const top5 = await page.evaluate(() => {
    const raw = localStorage.getItem("twinsites.lastCheck");
    const check = raw ? (JSON.parse(raw) as { bands?: Record<string, number> }) : null;
    const count = check?.bands?.["95"];
    return typeof count === "number" ? count : null;
  });
  assert(top5 !== null, "no top-5% count stored");
  const badges = await page.locator(".badge-box").count();
  const expectBadge = top5 === 0;
  assert(badges === (expectBadge ? 1 : 0), `badge ${badges}, top 5% count ${top5}`);
  if (!expectBadge) return `top 5% count ${top5}, no badge`;
  const code = await page.locator(".badge-code").innerText();
  assert(code.startsWith('<a href="https://twinsites.com/?ref=badge"') && code.includes("<svg"), "badge code shape");
  assert(!/<script|src=|url\(/i.test(code), "badge loads something");
  return "top 5% count 0, self-contained badge";
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
  const sent: string[] = [];
  await fakeCloudflare(desktop, before, sent);
  const page = await desktop.newPage();
  watch(page, "desktop");

  await check("headers: production CSP and isolation are served", async () => {
    const response = await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const headers = response?.headers() ?? {};
    for (const name of ["content-security-policy", "cross-origin-embedder-policy", "x-frame-options", "referrer-policy", "permissions-policy"]) {
      assert(headers[name], `missing ${name}`);
    }
    assert(await page.evaluate(() => crossOriginIsolated), "not cross-origin isolated");
  });

  await check("home: the wall lights up real twins", async () => {
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
    const badge = await assertBadgeContract(page);
    const verdict = await page.locator(".again-line").innerText();
    const recipe = await page.locator(".recipe li").count();
    const moves = await page.locator(".moves li").count();
    const prompt = await page.locator(".prompt-box .prompt-text").innerText();
    assert(recipe >= 1 && moves >= 1, `recipe ${recipe}, moves ${moves}`);
    assert(prompt.startsWith("Redesign the first screen"), "prompt missing");
    return `${verdict} recipe ${recipe}, moves ${moves}; ${badge}`;
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
    const prompt = await page.locator(".prompt-box .prompt-text").innerText();
    assert(prompt.includes("stock phrases"), "prompt lacks the copy step");
    return found.join(", ");
  });

  await check("result: correcting a trait updates the prompt", async () => {
    const beforePrompt = await page.locator(".prompt-box .prompt-text").innerText();
    await page.locator(".recipe-chip").last().click();
    await page.locator(".correct-box .ticket").first().click();
    const afterPrompt = await page.locator(".prompt-box .prompt-text").innerText();
    assert(beforePrompt !== afterPrompt, "prompt unchanged");
    assert((await page.locator(".fixes li").count()) === 1, "no correction listed");
  });

  await check("result: a correction is sent only when ticked, and holds no image or URL", async () => {
    assert(!sent.some((line) => line.startsWith("/feedback")), "sent before the box was ticked");
    await page.locator(".report-box input[type=checkbox]").check();
    const send = page.locator(".report-box .ticket");
    await send.waitFor();
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".report-box .ticket")?.disabled);
    await send.click();
    await page.getByText("Thank you. Corrections like yours").waitFor({ timeout: 10_000 });
    const body = sent.find((line) => line.startsWith("/feedback")) ?? "";
    assert(!/data:image|https?:\/\/|blob:/.test(body), "payload carries an image or a URL");
    await page.locator(".fixes li .as-button").click();
    return body.replace(/^\/feedback /, "").slice(0, 100);
  });

  await check("result: subscribe through the worker", async () => {
    const form = page.locator(".list-note");
    await form.scrollIntoViewIfNeeded();
    await form.locator("input[type=email]").fill("qa@example.com");
    await form.locator("input[type=checkbox]").check();
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".list-note button.ticket")?.disabled);
    await form.locator("button.ticket").click();
    await page.locator(".list-success").waitFor({ timeout: 10_000 });
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

  await check("result: badge follows the top 5% count", async () => {
    const badge = await assertBadgeContract(page);
    // Let the text reader finish before the next test navigates away.
    await page.waitForFunction(() => !document.querySelector(".copy-check")?.textContent?.match(/Reading|Leyendo/), null, { timeout: 90_000 });
    return badge;
  });

  await check("forget last check", async () => {
    await page.locator(".forget").click();
    const stored = await page.evaluate(() => localStorage.getItem("twinsites.lastCheck"));
    assert(stored === null, "still stored");
  });

  await check("home: a pasted URL is captured through the worker", async () => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.locator("#page-url").fill("https://example.com");
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".url-shot button.ticket")?.disabled);
    await page.locator(".url-shot button.ticket").click();
    await page.locator(".diagnosis").waitFor({ timeout: 120_000 });
  });

  for (const [route, selector] of [
    ["/faq", ".faq-page h1"],
    ["/report", ".report-stats li strong"],
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

  await check("report: crawlers get its own title and numbers", async () => {
    // nginx serves this file for /report (try_files … $uri/index.html); vite preview does not.
    const html = await (await fetch(`${BASE}/report/index.html`)).text();
    assert(/<title>What [\d,]+ AI-built homepages have in common/.test(html), "static title missing");
    assert(/[\d.]+% of [\d,]+ AI-built homepages have a look-alike/.test(html), "static description missing");
    assertNoInline(html, "/report/index.html");
  });

  await check("static pages: no inline style or script, privacy CSS applies", async () => {
    for (const file of [
      "/privacy/index.html",
      "/example/acme-before.html",
      "/example/acme-after.html",
      "/zones/index.html",
      "/zone/warm-paper-atoll/index.html",
      "/index.html",
    ]) {
      assertNoInline(await (await fetch(`${BASE}${file}`)).text(), file);
    }
    await page.goto(`${BASE}/privacy/`, { waitUntil: "networkidle" });
    await page.locator("p.kicker").waitFor();
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert(background === "rgb(230, 222, 206)", `privacy background ${background}`);
    for (const file of ["/example/acme-before.html", "/example/acme-after.html"]) {
      await page.goto(`${BASE}${file}`, { waitUntil: "networkidle" });
      await page.locator("h1").waitFor();
    }
  });

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await fakeCloudflare(phone, before, []);
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
  await check("phone: secondary sections start folded and open from the index", async () => {
    const folds = await mobile.locator("details.fold").count();
    assert(folds === 3, `${folds} folds`);
    assert((await mobile.locator(".map-frame, .rivals, .inspiration").count()) === 0, "folded content mounted early");
    await mobile.locator(".result-nav .chip", { hasText: "Competitors" }).click();
    await mobile.locator("#rivals .rivals").waitFor({ timeout: 5_000 });
    assert(await noOverflow(mobile), "horizontal overflow");
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
