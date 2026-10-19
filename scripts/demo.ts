/** 15–30s launch recording: paste, twins, map, card. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.TWINSITES_URL ?? "http://127.0.0.1:4173";

async function main() {
  await mkdir("/tmp/twinsites-demo", { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: "/tmp/twinsites-demo", size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
  await page.locator("input[type=file]").setInputFiles("/tmp/twinsites-keep/holdout-2.png");
  await page.locator(".bar").waitFor({ timeout: 20000 });
  await page.locator(".twin-card").first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "docs/preview.png" });
  await page.waitForTimeout(2600);
  await page.locator(".map-frame").scrollIntoViewIfNeeded();
  await page.waitForTimeout(4000);
  await page.locator(".card-preview").scrollIntoViewIfNeeded();
  await page.waitForTimeout(4200);
  const video = page.video();
  await context.close();
  const saved = await video?.path();
  console.log("video", saved);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
