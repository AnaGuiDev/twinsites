/**
 * v1.1 QA: six screenshots plus a full-page capture and a phone portrait.
 * Viewports 375, 768, 1440. English and Spanish. No console errors.
 */
import { chromium, type ConsoleMessage, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.TWINSITES_URL ?? "http://127.0.0.1:4173";
const OUT = process.env.TWINSITES_OUT ?? "/opt/cursor/artifacts";
const KEEP = "/tmp/twinsites-keep";

const cases = [
  { name: "saas", file: "holdout-1.png" },
  { name: "dark", file: "holdout-2.png" },
  { name: "ecom", file: "ecom.png" },
  { name: "portfolio", file: "portfolio.png" },
  { name: "handmade", file: "handmade.png" },
  { name: "mobile", file: "mobile.png" },
  { name: "fullpage", file: "fullpage.png" },
  { name: "portrait", file: "portrait.png" },
];

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
      console.log("CONSOLE", message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
    console.log("PAGE", String(error));
  });

  const rows: string[] = [];
  for (const item of cases) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.locator("input[type=file]").first().setInputFiles(path.join(KEEP, item.file));
    await page.locator(".twin-card").first().waitFor({ timeout: 180000 });
    await page.locator(".card-preview").waitFor({ timeout: 20000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const high = await page.locator(".again-line").innerText();
    const sims = await page.locator(".twin-card .sim").allInnerTexts();
    const notes = await page.locator(".score-note").allInnerTexts();
    const alts = await page.locator(".twin-card img").evaluateAll((images) => images.map((image) => (image as HTMLImageElement).alt));
    rows.push(`${item.name}\t${high}\t${sims.slice(0, 4).join(", ")}\tnotes:${notes.length}`);
    console.log(item.name, high, sims.join(" | "));
    const over = [1440, 768, 375];
    const gaps: number[] = [];
    for (const width of over) {
      const height = width === 375 ? 812 : width === 768 ? 1024 : 900;
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);
      gaps.push(await overflow(page));
      if (item.name === "fullpage" || item.name === "dark" || item.name === "portrait") {
        await page.screenshot({ path: path.join(OUT, `after-${item.name}-${width}.png`) });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator(".twin-grid").screenshot({ path: path.join(OUT, `after-${item.name}-ranks.png`) });
    await page.locator(".card-preview").screenshot({ path: path.join(OUT, `after-${item.name}-card.png`) });
    console.log(item.name, "overflow", gaps.join("/"), "alts", alts.filter(Boolean).length, "/", alts.length);
    console.log(item.name, "notes", notes.join(" || "));
    if (gaps.some((gap) => gap > 1)) throw new Error(`overflow ${item.name} ${gaps.join("/")}`);
    if (alts.some((alt) => !alt)) throw new Error(`missing alt ${item.name}`);
    if (sims.some((sim) => !/^\d+\.\d$/.test(sim))) throw new Error(`rank not decimal ${item.name} ${sims.join(",")}`);
    const phone = notes.some((note) => note.includes("phone screenshot"));
    const crop = notes.some((note) => note.includes("Only the top"));
    if (item.name === "fullpage" && (phone || !crop)) throw new Error(`fullpage notes ${notes.join(" | ")}`);
    if ((item.name === "mobile" || item.name === "portrait") && !phone) throw new Error(`missing portrait note ${item.name}`);
  }

  const fullNotes = rows.find((row) => row.startsWith("fullpage"));
  console.log("summary", rows.join("\n"), fullNotes);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const headerRemoval = await page.locator("header a.removal").count();
  const footerRemoval = await page.locator("footer a.removal").innerText();
  await page.getByRole("button", { name: "Español" }).click();
  await page.waitForTimeout(300);
  const esLine = await page.locator(".again-line").innerText();
  const esFooter = await page.locator("footer").innerText();
  const esSims = await page.locator(".twin-card .sim").first().innerText();
  console.log("header removal", headerRemoval, "footer", footerRemoval);
  console.log("es", esLine, esSims);
  console.log("es footer", esFooter.replace(/\s+/g, " "));
  const esGaps: number[] = [];
  for (const width of [1440, 768, 375]) {
    const height = width === 375 ? 812 : width === 768 ? 1024 : 900;
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    esGaps.push(await overflow(page));
    await page.screenshot({ path: path.join(OUT, `after-es-${width}.png`) });
  }
  console.log("es overflow", esGaps.join("/"));
  if (esGaps.some((gap) => gap > 1)) throw new Error(`es overflow ${esGaps.join("/")}`);
  if (headerRemoval !== 0) throw new Error("removal still in header");
  if (!esFooter.includes("Portadas del catálogo")) throw new Error("spanish catalog line");
  if (!/^\d+,\d$/.test(esSims)) throw new Error(`spanish rank ${esSims}`);

  await browser.close();
  if (consoleErrors.length || pageErrors.length) {
    console.error(consoleErrors, pageErrors);
    process.exit(2);
  }
  console.log("qa v11 ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
