/** Built release smoke with the actual nginx CSP; no commercial provider calls. */
import sharp from "sharp";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, type Page } from "playwright";

const base = "http://127.0.0.1:4327";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4327", "--strictPort"], { stdio: "inherit" });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const errors: string[] = [];
await mkdir("quality/generated/browser", { recursive: true });
async function fits(page: Page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "horizontal overflow");
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { ready = (await fetch(base)).ok; } catch { /* starting */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(ready, "preview did not start");
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "en-US" });
    await context.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", event => console.error(`CSP: ${event.effectiveDirective} ${event.blockedURI}`));
    });
    // Unexpected remote calls fail this smoke instead of touching providers.
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (["127.0.0.1", "localhost"].includes(url.hostname) || ["blob:", "data:"].includes(url.protocol)) return route.continue();
      errors.push(`Unexpected external request: ${url.origin}`);
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const response = await page.goto(base);
    assert(response?.headers()["content-security-policy"]?.includes("style-src 'self'"));
    assert(await page.evaluate(() => crossOriginIsolated));
    await page.locator(".specimen-pair img").first().waitFor();
    await page.locator('input[type=file]').first().setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not a png')});
    await page.locator('.capture-review [role=alert]').waitFor();
    assert.equal(await page.locator('.capture-review .ticket').count(),0);
    await page.locator('.capture-review .text-link').click();
    const tiny = await sharp({create:{width:300,height:200,channels:3,background:'#ffffff'}}).png().toBuffer();
    await page.locator('input[type=file]').first().setInputFiles({name:'small.png',mimeType:'image/png',buffer:tiny});
    await page.locator('.capture-review [role=alert]').waitFor();
    assert.equal(await page.locator('.capture-review .ticket').count(),0);
    await page.locator('.capture-review .text-link').click();
    const blank = await sharp({create:{width:1440,height:900,channels:3,background:'#ffffff'}}).png().toBuffer();
    await page.locator('input[type=file]').first().setInputFiles({name:'blank.png',mimeType:'image/png',buffer:blank});
    await page.locator('.capture-review [role=alert]').waitFor();
    assert.match(await page.locator('.capture-review').innerText(), /empty|uniform/);
    await page.locator('.capture-review .text-link').click();
    const usable = await sharp('public/data/thumbs/0001.webp').resize(1440,1800).png().toBuffer();
    await page.locator('input[type=file]').first().setInputFiles({name:'desktop.png',mimeType:'image/png',buffer:usable});
    await page.locator('.capture-review img').waitFor();
    assert(await page.locator('.capture-review .ticket').isDisabled());
    await page.locator('.capture-review input[type=checkbox]').check();
    assert(await page.locator('.capture-review .ticket').isEnabled());
    await fits(page);
    await page.locator('.capture-review .text-link').click();

    await fits(page);
    for (const lang of ["en", "es"]) {
      if (lang === "es") await page.getByRole("button", { name: "Español", exact: true }).click();
      await page.goto(`${base}/sample-audit`);
      await page.locator(".evidence-pin").nth(1).click();
      assert.match(await page.locator(".finding-detail").innerText(), /placeholder|relleno/);
      await page.locator(".report-toggle button").nth(1).click();
      assert.match(await page.locator(".evidence-shot img").getAttribute("src") || "", /after/);
      await page.locator(".decision-row summary").first().focus();
      await page.keyboard.press("Enter");
      assert(await page.locator(".decision-row").first().evaluate(node => (node as HTMLDetailsElement).open));
      const download = page.waitForEvent("download");
      await page.locator(".report-tools button").first().click();
      const saved = await download;
      const file = await saved.path();
      assert(file);
      assert.match(await readFile(file, "utf8"), /Acme Notes/);
      await fits(page);
      await page.screenshot({ path: `quality/generated/browser/report-${width}-${lang}.png`, fullPage: true });
      await page.goto(`${base}/method`);
      assert.equal(await page.locator(".method-browser select option").count(), 60);
      await page.locator(".method-browser select").selectOption("33");
      assert.match(await page.locator(".method-pair").innerText(), /BMP|Build My Plan/);
      await fits(page);
      await page.goto(`${base}/services`);
      await page.locator(".service-form select").nth(1).selectOption("3");
      assert.match(await page.locator(".service-form").innerText(), /147/);
      assert(await page.locator(".service-form button[type=submit]").isDisabled());
      await fits(page);
      for (const route of ["legal", "terms", "withdrawal", "privacy"]) {
        await page.goto(`${base}/${route}`);
        await page.locator("h1").waitFor();
        await fits(page);
      }
    }
    // The catalog route exercises diagnosis/action-plan editing without OCR downloads.
    const catalog = JSON.parse(await readFile("public/data/catalog.json", "utf8"));
    await page.goto(`${base}/site/${catalog.sites[0].slug}`);
    assert.match(await page.locator('.verdict-title').innerText(), /entradas|candidatos/);
    assert.equal(await page.locator('.badge-box').count(),0);
    await page.locator(".audit-checklist summary").click();
    await page.locator(".signal-row select").first().selectOption("true");
    await page.locator(".action-plan textarea").first().fill("Producto de prueba para docentes");
    const planDownload = page.waitForEvent("download");
    await page.locator(".action-plan button").click();
    const planFile = await (await planDownload).path();
    assert(planFile);
    assert.match(await readFile(planFile, "utf8"), /Producto de prueba para docentes/);
    await fits(page);
    await context.close();
    console.log(`PASS ${width}px: EN/ES report, export, keyboard, method, legal routes, closed checkout and action plan`);
  }
  assert.deepEqual(errors, [], "browser/CSP/external request errors");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
