/**
 * Draws the Open Graph image and the Apple touch icon.
 * Run: npx tsx scripts/render-og.ts
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const html = `<!doctype html>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: "Fraunces";
    src: url("file:///workspace/node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2") format("woff2");
    font-weight: 100 900;
    font-display: block;
  }
  @font-face {
    font-family: "Plex";
    src: url("file:///workspace/node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2") format("woff2");
    font-weight: 500;
    font-display: block;
  }
  html, body { margin: 0; width: 1200px; height: 630px; background: #e6dece; }
  body {
    position: relative;
    overflow: hidden;
    color: #1b1612;
    font-family: Fraunces, serif;
  }
  .rules {
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(to bottom, transparent 0 27px, rgba(27,22,18,0.16) 27px 28px);
  }
  .kicker {
    position: absolute;
    top: 48px;
    left: 64px;
    font-family: Plex, monospace;
    font-size: 22px;
    letter-spacing: 0.08em;
  }
  .kicker b { color: #b82c1a; font-weight: 500; margin-left: 18px; }
  h1 {
    position: absolute;
    left: 64px;
    top: 140px;
    width: 680px;
    margin: 0;
    font-weight: 560;
    font-size: 68px;
    line-height: 0.96;
    letter-spacing: -0.03em;
  }
  p {
    position: absolute;
    left: 64px;
    top: 430px;
    width: 640px;
    margin: 0;
    font-family: Plex, monospace;
    font-size: 22px;
    line-height: 1.45;
  }
  .stamp {
    position: absolute;
    right: 86px;
    bottom: 78px;
    width: 132px;
    height: 132px;
    border: 3px solid #b82c1a;
    border-radius: 50%;
    color: #b82c1a;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-family: Plex, monospace;
    font-size: 16px;
    line-height: 1.25;
    transform: rotate(-12deg);
  }
  .swatches {
    position: absolute;
    right: 72px;
    top: 64px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .swatches i {
    display: block;
    width: 280px;
    height: 86px;
    background: #f4efe4;
    border: 1px solid rgba(27,22,18,0.25);
  }
  .swatches i:nth-child(1) { background: linear-gradient(120deg, #1b1612 0 42%, #b82c1a 42% 70%, #e6dece 70%); }
  .swatches i:nth-child(2) { background: linear-gradient(160deg, #24324a, #8ea4c8 70%, #e6dece); }
  .swatches i:nth-child(3) { background: linear-gradient(90deg, #f4efe4, #d7c4a4 40%, #1b1612 40% 46%, #f4efe4 46%); }
</style>
<div class="rules"></div>
<div class="kicker">TWINSITES <b>VISUAL KIN REGISTRY</b></div>
<h1>Find the sites that already wear your face.</h1>
<p>Drop a landing screenshot. The comparison stays on your device. twinsites.com</p>
<div class="swatches"><i></i><i></i><i></i></div>
<div class="stamp">ON<br />DEVICE</div>
`;

async function main() {
  await writeFile("/tmp/twinsites-og.html", html);
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto("file:///tmp/twinsites-og.html", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "public/og.png", type: "png" });
  await browser.close();
  await sharp("public/favicon.svg").resize(180, 180).png().toFile("public/apple-touch-icon.png");
  console.log("wrote public/og.png and public/apple-touch-icon.png");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
