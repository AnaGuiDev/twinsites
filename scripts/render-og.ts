/**
 * Draws the Open Graph image and the Apple touch icon.
 * Run: npx tsx scripts/render-og.ts
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

const root = process.cwd();
const atlas = JSON.parse(await readFile("public/data/mosaic.json", "utf8")) as { cols: number; rows: number };

// The share preview is the home page in miniature: a wall of real homepages in
// grey, a few neighbours lit in colour, and the line that names them.
const COLS = 6;
const ROWS = 9;
const LIT = new Set([20, 21, 22, 23]);
const tiles = Array.from({ length: COLS * ROWS }, (_, i) => {
  const index = i + 36;
  const col = index % atlas.cols;
  const row = Math.floor(index / atlas.cols);
  const x = (col / (atlas.cols - 1)) * 100;
  const y = (row / (atlas.rows - 1)) * 100;
  return `<i class="${LIT.has(i) ? "lit" : ""}" style="background-position:${x}% ${y}%"></i>`;
}).join("");

const html = `<!doctype html>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: "Archivo";
    src: url("file://${root}/node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2") format("woff2");
    font-weight: 100 900;
    font-stretch: 62% 125%;
    font-display: block;
  }
  html, body { margin: 0; width: 1200px; height: 630px; background: #ffffff; }
  body { position: relative; overflow: hidden; color: #000; font-family: Archivo, sans-serif; }
  .mark { position: absolute; top: 52px; left: 64px; font-weight: 800; font-size: 30px; }
  h1 {
    position: absolute;
    left: 64px;
    top: 150px;
    width: 470px;
    margin: 0;
    font-stretch: 62%;
    font-weight: 820;
    font-size: 104px;
    line-height: 0.86;
  }
  p { position: absolute; left: 64px; bottom: 52px; margin: 0; font-size: 24px; font-weight: 600; }
  .wall {
    position: absolute;
    top: 0;
    left: 590px;
    display: grid;
    grid-template-columns: repeat(${COLS}, 120px);
    grid-auto-rows: 75px;
    gap: 2px;
  }
  .wall i {
    display: block;
    background-image: url("file://${root}/public/data/mosaic.webp");
    background-size: ${atlas.cols * 100}% ${atlas.rows * 100}%;
    filter: grayscale(1) contrast(0.92) brightness(1.04);
  }
  .wall i.lit { filter: none; outline: 4px solid #ffe24a; outline-offset: -4px; }
</style>
<div class="mark">Twinsites</div>
<h1>Your AI-built homepage has twins.</h1>
<p>twinsites.com</p>
<div class="wall">${tiles}</div>
`;

async function main() {
  await writeFile("/tmp/twinsites-og.html", html);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
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
