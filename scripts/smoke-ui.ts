/**
 * Drive the built site: one in-catalog screenshot and two holdouts.
 * Saves images under /opt/cursor/artifacts and /tmp/twinsites-ui.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.TWINSITES_URL ?? "http://127.0.0.1:4173";
const OUT = process.env.TWINSITES_OUT ?? "/opt/cursor/artifacts";
const KEEP = "/tmp/twinsites-keep";

async function runCase(
  page: import("playwright").Page,
  file: string,
  name: string,
  external: string[],
) {
  external.length = 0;
  await page.goto(BASE, { waitUntil: "networkidle" });
  const input = page.locator("input[type=file]");
  await input.setInputFiles(file);
  await page.locator(".twin-card").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(1800);
  if (name === "known") {
    await page.screenshot({ path: path.join(process.cwd(), "docs", "preview.png") });
  }
  const sim = await page.locator(".twin-card .sim").first().innerText();
  const title = await page.locator(".twin-card h3").first().innerText();
  const high = await page.locator(".again-line").innerText();
  const card = page.locator(".card-preview");
  await card.waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, `${name}-desktop.png`), fullPage: true });
  await page.locator(".map-frame").screenshot({ path: path.join(OUT, `${name}-map.png`) });
  await page.locator(".twin-grid").screenshot({ path: path.join(OUT, `${name}-twins.png`) });
  await card.screenshot({ path: path.join(OUT, `${name}-card.png`) });
  return { sim, title, high, external: [...external] };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const external: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith(BASE) || url.startsWith("blob:") || url.startsWith("data:")) return;
    external.push(url);
  });

  const known = await runCase(page, path.join(KEEP, "known.png"), "known", external);
  console.log("known", known);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(OUT, "known-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole("button", { name: "Español" }).click();
  await page.waitForTimeout(400);
  const removal = await page.locator("a.removal").innerText();
  console.log("removal", removal);
  await page.screenshot({ path: path.join(OUT, "known-es.png"), fullPage: false });
  await page.locator("button.lang").click();

  const hold1 = await runCase(page, path.join(KEEP, "holdout-1.png"), "holdout-saas", external);
  console.log("holdout-saas", hold1);

  const hold2 = await runCase(page, path.join(KEEP, "holdout-2.png"), "holdout-pixel", external);
  console.log("holdout-pixel", hold2);

  await browser.close();
  const bad = [known, hold1, hold2].flatMap((row) => row.external);
  if (bad.length) {
    console.error("external requests", bad);
    process.exit(2);
  }
  const pct = Number(known.sim.replace("%", ""));
  if (!(pct >= 90)) {
    console.error("known match was not near 100%", known.sim);
    process.exit(3);
  }
  console.log("smoke ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
