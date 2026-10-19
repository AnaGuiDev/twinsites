/**
 * Cold-load timings.
 * Desktop: no throttle, cache disabled, 1440×900.
 * Mobile fast 4G: 375×812, 4× CPU, 40 ms latency, 9 Mbit/s down, 1.5 Mbit/s up, cache disabled.
 * Reports time until the drop zone is visible, and time from choosing a file until the first twin card.
 * A second mobile run waits on the hero so the idle preload can finish before the file is chosen.
 */
import { chromium, type Browser, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.TWINSITES_URL ?? "http://127.0.0.1:4173";
const OUT = process.env.TWINSITES_OUT ?? "/opt/cursor/artifacts";
const FILE = "/tmp/twinsites-keep/holdout-1.png";

const FAST_4G = {
  offline: false,
  latency: 40,
  downloadThroughput: (9 * 1000 * 1000) / 8,
  uploadThroughput: (1.5 * 1000 * 1000) / 8,
};

async function session(browser: Browser, mobile: boolean) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
  });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (mobile) {
    await client.send("Network.emulateNetworkConditions", FAST_4G);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  return { context, page, client };
}

async function timeToInteractive(page: Page): Promise<number> {
  const started = Date.now();
  await page.goto(BASE, { waitUntil: "commit" });
  await page.locator("button.ticket", { hasText: "Choose a file" }).waitFor({ timeout: 60000 });
  return Date.now() - started;
}

async function timeToResult(page: Page): Promise<number> {
  const started = Date.now();
  await page.locator("input[type=file]").setInputFiles(FILE);
  await page.locator(".twin-card").first().waitFor({ timeout: 300000 });
  return Date.now() - started;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const desktop = await session(browser, false);
  const desktopInteractive = await timeToInteractive(desktop.page);
  const desktopResult = await timeToResult(desktop.page);
  console.log("desktop", { interactiveMs: desktopInteractive, resultMs: desktopResult });
  await desktop.context.close();

  const heavyBefore = `(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("ort-wasm") || name.includes("vision_model") || name.includes("embeddings.bin")))()`;

  const mobile = await session(browser, true);
  const mobileInteractive = await timeToInteractive(mobile.page);
  await mobile.page.waitForTimeout(1500);
  const beforeIntent = await mobile.page.evaluate(heavyBefore);
  const firstLoad = await mobile.page.evaluate(`(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const transfer = (nav ? nav.transferSize : 0) + resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
    const encoded = (nav ? nav.encodedBodySize : 0) + resources.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0);
    const names = [document.location.pathname].concat(resources.map((entry) => entry.name.replace(location.origin, "")));
    return { transfer, encoded, names };
  })()`);
  console.log("mobile resources before intent", beforeIntent);
  console.log("mobile first load", JSON.stringify(firstLoad));
  const resultStarted = Date.now();
  await mobile.page.locator("input[type=file]").setInputFiles(FILE);
  await mobile.page.locator(".bar").waitFor({ timeout: 20000 });
  await mobile.page.waitForTimeout(700);
  await mobile.page.screenshot({ path: path.join(OUT, "progress-mobile.png") });
  await mobile.page.locator(".twin-card").first().waitFor({ timeout: 300000 });
  const mobileResult = Date.now() - resultStarted;
  console.log("mobile-immediate", { interactiveMs: mobileInteractive, resultMs: mobileResult });
  await mobile.context.close();

  const warmed = await session(browser, true);
  const warmedInteractive = await timeToInteractive(warmed.page);
  await warmed.page.getByRole("button", { name: "Choose a file" }).focus();
  const preloadMs = await warmed.page.evaluate(`(async () => {
    const started = performance.now();
    const ready = () => {
      const names = performance.getEntriesByType("resource").map((entry) => entry.name);
      const wasm = names.some((name) => name.includes("ort-wasm"));
      const vision = names.some((name) => name.includes("vision_model"));
      const rows = names.some((name) => name.includes("embeddings.bin"));
      return wasm && vision && rows;
    };
    while (!ready()) {
      if (performance.now() - started > 120000) return -1;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return Math.round(performance.now() - started);
  })()`);
  const warmedResult = await timeToResult(warmed.page);
  console.log("mobile-after-preload", { interactiveMs: warmedInteractive, preloadMs, resultMs: warmedResult });
  await warmed.context.close();

  const report = {
    profile: {
      desktop: "1440×900, no CPU or network throttle, cache disabled",
      mobile: "375×812, 4× CPU, fast 4G: 40 ms latency, 9 Mbit/s down, 1.5 Mbit/s up, cache disabled",
    },
    desktop: { interactiveMs: desktopInteractive, firstResultMs: desktopResult },
    mobileImmediate: { interactiveMs: mobileInteractive, firstResultMs: mobileResult, firstLoad },
    mobileAfterPreload: {
      interactiveMs: warmedInteractive,
      preloadMs,
      firstResultMs: warmedResult,
      note: "Mobile does not preload at idle. Focus on the file button starts the download; the file is chosen after it finishes.",
      resourcesBeforeIntent: beforeIntent,
    },
  };
  await writeFile(path.join(OUT, "perf.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
