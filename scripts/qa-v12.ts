/**
 * v1.2 QA. Example and catalog search at 375 and 1440, English and Spanish,
 * zone atlas, the eight captures, and a check that a phone does not fetch
 * the model before the first intent. The URL box stays hidden.
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

const heavy = `(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("ort-wasm") || name.includes("vision_model") || name.includes("embeddings.bin")))()`;

async function overflow(page: Page): Promise<number> {
  return page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, name) });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
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

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Your AI-built landing page has twins. Meet them." }).waitFor();
  await page.waitForTimeout(1600);
  const before = await page.evaluate(heavy);
  console.log("mobile resources before intent", before);
  if ((before as string[]).length) throw new Error(`model requested before intent ${JSON.stringify(before)}`);
  if ((await page.locator(".url-shot").count()) !== 0) throw new Error("url box visible without VITE_SHOT_ENDPOINT");
  const privacy = await page.locator(".privacy").first().innerText();
  if (!privacy.includes("If you paste a URL")) throw new Error(`privacy ${privacy}`);
  await shot(page, "v12-mobile-home.png");

  await page.getByRole("button", { name: "Try an example" }).click();
  await page.locator("h1.zone-title").waitFor({ timeout: 20000 });
  await page.locator(".reveal img").nth(1).waitFor();
  await page.locator(".card-preview").waitFor({ timeout: 20000 });
  const zone = await page.locator("h1.zone-title").innerText();
  const line = await page.locator(".again-line").innerText();
  console.log("example", page.url(), zone, line);
  if (!page.url().includes("/site/")) throw new Error(`example url ${page.url()}`);
  if (zone.length < 3) throw new Error("missing zone headline");
  if ((await page.locator(".include").count()) !== 0) throw new Error("upload toggle on a catalog result");
  const afterExample = await page.evaluate(heavy);
  console.log("mobile resources after example", afterExample);
  if ((afterExample as string[]).length) throw new Error(`model requested by example ${JSON.stringify(afterExample)}`);
  await page.evaluate("window.scrollTo(0, 0)");
  await shot(page, "v12-example-reveal.png");
  await page.locator(".card-preview").scrollIntoViewIfNeeded();
  await page.locator(".card-preview").screenshot({ path: path.join(OUT, "v12-share-card.png") });
  if ((await overflow(page)) > 1) throw new Error("example overflow 375");

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator("#catalog-search").click();
  await page.locator("#catalog-search").fill("vocab");
  await page.locator(".search-list button").first().waitFor({ timeout: 20000 });
  const hit = await page.locator(".search-list button").first().innerText();
  await page.locator(".search-list button").first().click();
  await page.locator("h1.zone-title").waitFor({ timeout: 20000 });
  console.log("search", hit.replace(/\s+/g, " "), page.url());
  if (!page.url().includes("/site/")) throw new Error(`search url ${page.url()}`);
  const afterSearch = await page.evaluate(heavy);
  if ((afterSearch as string[]).length) throw new Error(`model requested by search ${JSON.stringify(afterSearch)}`);

  await page.goto(`${BASE}/zones`, { waitUntil: "domcontentloaded" });
  await page.locator(".zone-card").first().waitFor({ timeout: 20000 });
  const zoneCount = await page.locator(".zone-card").count();
  console.log("zones", zoneCount);
  if (zoneCount < 16) throw new Error(`zone count ${zoneCount}`);
  await shot(page, "v12-zones-atlas.png");
  await page.locator(".zone-card").first().click();
  await page.locator(".zone-examples img").first().waitFor({ timeout: 20000 });
  const zoneHeading = await page.locator("h1").first().innerText();
  console.log("zone page", page.url(), zoneHeading);
  if (!page.url().includes("/zone/")) throw new Error(`zone url ${page.url()}`);
  await shot(page, "v12-zone-page.png");
  if ((await overflow(page)) > 1) throw new Error("zone overflow 375");

  await page.getByRole("button", { name: "Español" }).click();
  await page.waitForTimeout(200);
  const esZone = await page.locator("h1").first().innerText();
  const esBody = await page.locator("body").innerText();
  console.log("es zone", esZone);
  if (!esBody.includes("webs")) throw new Error("spanish zone copy missing");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Tu página de inicio hecha con IA tiene gemelas. Conócelas." }).waitFor();
  const esPrivacy = await page.locator(".privacy").first().innerText();
  if (!esPrivacy.includes("Si pegas una URL")) throw new Error(`es privacy ${esPrivacy}`);
  await page.getByRole("button", { name: "Prueba con un ejemplo" }).click();
  await page.locator("h1.zone-title").waitFor({ timeout: 20000 });
  const esLine = await page.locator(".again-line").innerText();
  const esSim = await page.locator(".twin-card .sim").first().innerText();
  console.log("es example", esLine, esSim);
  if (!esLine.toLowerCase().includes("gemel")) throw new Error(`es line ${esLine}`);
  if (!/^\d+,\d$/.test(esSim)) throw new Error(`es rank ${esSim}`);
  if ((await overflow(page)) > 1) throw new Error("es example overflow 375");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("heading", { name: "Your AI-built landing page has twins. Meet them." }).waitFor();
  await shot(page, "v12-desktop-home.png");
  await page.getByRole("button", { name: "Try an example" }).click();
  await page.locator(".card-preview").waitFor({ timeout: 20000 });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator("#catalog-search").click();
  await page.locator("#catalog-search").fill("lovable");
  await page.locator(".search-list button").first().waitFor({ timeout: 20000 });
  await page.locator(".search-list button").first().click();
  await page.locator("h1.zone-title").waitFor({ timeout: 20000 });
  console.log("desktop explore", page.url());
  await page.goto(`${BASE}/zones`, { waitUntil: "domcontentloaded" });
  await page.locator(".zone-card").first().waitFor();
  if ((await overflow(page)) > 1) throw new Error("desktop zones overflow");

  const rows: string[] = [];
  for (const item of cases) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.locator("input[type=file]").first().setInputFiles(path.join(KEEP, item.file));
    await page.locator(".twin-card").first().waitFor({ timeout: 180000 });
    await page.locator(".card-preview").waitFor({ timeout: 20000 });
    const high = await page.locator("h1.zone-title").innerText();
    const again = await page.locator(".again-line").innerText();
    const sims = await page.locator(".twin-card .sim").allInnerTexts();
    const notes = await page.locator(".score-note").allInnerTexts();
    const alts = await page.locator(".twin-card img").evaluateAll((images) => images.map((image) => (image as HTMLImageElement).alt));
    const toggle = page.locator(".include input");
    if ((await toggle.count()) !== 1) throw new Error(`missing include toggle ${item.name}`);
    if (await toggle.isChecked()) throw new Error(`include mine default on ${item.name}`);
    rows.push(`${item.name}\t${high}\t${again}\t${sims.slice(0, 3).join(", ")}`);
    console.log(item.name, high, again, sims.join(" | "));
    const gaps: number[] = [];
    for (const width of [1440, 768, 375]) {
      const height = width === 375 ? 812 : width === 768 ? 1024 : 900;
      await page.setViewportSize({ width, height });
      await page.evaluate("window.scrollTo(0, 0)");
      await page.waitForTimeout(80);
      gaps.push(await overflow(page));
    }
    console.log(item.name, "overflow", gaps.join("/"), "alts", alts.filter(Boolean).length, "/", alts.length);
    console.log(item.name, "notes", notes.join(" || "));
    if (gaps.some((gap) => gap > 1)) throw new Error(`overflow ${item.name} ${gaps.join("/")}`);
    if (alts.some((alt) => !alt)) throw new Error(`missing alt ${item.name}`);
    if (sims.some((sim) => !/^\d+\.\d$/.test(sim))) throw new Error(`rank not decimal ${item.name} ${sims.join(",")}`);
    const phone = notes.some((note) => note.includes("phone screenshot"));
    const crop = notes.some((note) => note.includes("Only the top"));
    if (item.name === "fullpage" && (phone || !crop)) throw new Error(`fullpage notes ${notes.join(" | ")}`);
    if ((item.name === "mobile" || item.name === "portrait") && !phone) throw new Error(`missing portrait note ${item.name}`);
    if (item.name !== "mobile" && item.name !== "portrait" && phone) throw new Error(`unexpected portrait note ${item.name}`);
  }
  console.log("summary\n" + rows.join("\n"));

  const headerRemoval = await page.locator("header a.removal").count();
  if (headerRemoval !== 0) throw new Error("removal still in header");

  await browser.close();
  if (consoleErrors.length || pageErrors.length) {
    console.error(consoleErrors, pageErrors);
    process.exit(2);
  }
  console.log("qa v12 ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
