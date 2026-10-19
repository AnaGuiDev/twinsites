/**
 * Six real screenshots, three viewports, both languages, error paths, and basic a11y.
 * Run against `npm run preview` (http://127.0.0.1:4173).
 */
import { chromium, type ConsoleMessage, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.TWINSITES_URL ?? "http://127.0.0.1:4173";
const OUT = process.env.TWINSITES_OUT ?? "/opt/cursor/artifacts";
const KEEP = "/tmp/twinsites-keep";

const cases = [
  { name: "saas", file: "holdout-1.png", note: "Capabase, typical SaaS" },
  { name: "dark", file: "holdout-2.png", note: "Lofi Cities, dark scene" },
  { name: "ecom", file: "ecom.png", note: "Fabulous Beddings shop" },
  { name: "portfolio", file: "portfolio.png", note: "Rauno Freiberg portfolio" },
  { name: "handmade", file: "handmade.png", note: "Local newspaper page" },
  { name: "mobile", file: "mobile.png", note: "Linear, captured at 390px" },
];

function twinCount(line: string): number {
  if (/^no twin/i.test(line) || /^ninguna/i.test(line)) return 0;
  const match = line.match(/\d+/);
  return match ? Number(match[0]) : Number.NaN;
}

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
  const external: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith(BASE) || url.startsWith("blob:") || url.startsWith("data:")) return;
    external.push(url);
  });

  const rows: Record<string, string>[] = [];
  for (const item of cases) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.locator("input[type=file]").setInputFiles(path.join(KEEP, item.file));
    await page.locator(".twin-card").first().waitFor({ timeout: 180000 });
    await page.locator(".card-preview").waitFor({ timeout: 20000 });
    const high = await page.locator(".again-line").innerText();
    const sim = await page.locator(".twin-card .sim").first().innerText();
    const title = await page.locator(".twin-card h3").first().innerText();
    const zone = await page.locator(".map-caption").innerText();
    await page.screenshot({ path: path.join(OUT, `${item.name}-1440.png`), fullPage: true });
    await page.locator(".card-preview").screenshot({ path: path.join(OUT, `${item.name}-card.png`) });
    const over1440 = await overflow(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(200);
    const over768 = await overflow(page);
    await page.screenshot({ path: path.join(OUT, `${item.name}-768.png`), fullPage: false });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(200);
    const over375 = await overflow(page);
    await page.screenshot({ path: path.join(OUT, `${item.name}-375.png`), fullPage: false });
    rows.push({
      name: item.name,
      note: item.note,
      high,
      sim,
      title,
      zone: zone.replace(/\s+/g, " ").slice(0, 180),
      twins: String(twinCount(high)),
      over: `${over1440}/${over768}/${over375}`,
    });
    console.log(item.name, high, "overflow", over1440, over768, over375);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Español" }).click();
  await page.waitForTimeout(500);
  const esLine = await page.locator(".again-line").innerText();
  const esRemoval = await page.locator("a.removal").innerText();
  const esShare = await page.getByRole("button", { name: "Publicar la frase en X" }).innerText();
  const esStamp = await page.locator(".stamp-mark").innerText();
  await page.screenshot({ path: path.join(OUT, "mobile-es-1440.png"), fullPage: false });
  const mixed = /\b(twin|twins|percentile|upload|Choose a file|Download)\b/i.test(`${esLine} ${esRemoval} ${esShare} ${esStamp}`);
  console.log("es", { esLine, esRemoval, esShare, esStamp, mixed });

  await page.locator("button.lang").click();
  const opened: string[] = [];
  await page.exposeFunction("qaOpened", (url: string) => opened.push(url));
  await page.evaluate(() => {
    window.open = ((url?: string | URL) => {
      void (window as unknown as { qaOpened: (value: string) => void }).qaOpened(String(url ?? ""));
      return null;
    }) as typeof window.open;
  });
  await page.getByRole("button", { name: "Post the line on X" }).click();
  await page.waitForTimeout(300);
  console.log("intent", opened[0]);

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator(".sleeve").waitFor();
  const focused = await page.evaluate(() => {
    const button = document.querySelector("button.ticket") as HTMLButtonElement | null;
    button?.focus();
    const style = button ? getComputedStyle(button) : null;
    return {
      name: document.activeElement?.textContent?.trim() ?? "",
      outline: style?.outlineStyle ?? "",
    };
  });
  const alts = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    images: [...document.images].map((image) => ({ alt: image.alt, src: image.getAttribute("src") })),
  }));
  console.log("focus", focused, "alts", alts);

  await writeFile(path.join(KEEP, "bad.png"), Buffer.from("this is not a png"));
  await page.locator("input[type=file]").setInputFiles(path.join(KEEP, "bad.png"));
  await page.locator(".error").waitFor({ timeout: 10000 });
  const bad = await page.locator(".error").innerText();
  console.log("bad image", bad);
  await page.screenshot({ path: path.join(OUT, "error-bad.png") });

  await writeFile(path.join(KEEP, "huge.png"), Buffer.alloc(21 * 1024 * 1024, 1));
  await page.locator("input[type=file]").setInputFiles(path.join(KEEP, "huge.png"));
  await page.locator(".error").waitFor();
  const huge = await page.locator(".error").innerText();
  console.log("huge", huge);

  const pasted = await page.evaluate(async () => {
    const response = await fetch("/favicon.svg");
    const blob = await response.blob();
    const file = new File([blob], "paste.png", { type: "image/png" });
    const data = new DataTransfer();
    data.items.add(file);
    const event = new Event("paste", { bubbles: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    window.dispatchEvent(event);
    return true;
  });
  console.log("paste dispatched", pasted);
  const pasteResult = await Promise.race([
    page.locator(".error, .working, .twin-card").first().waitFor({ timeout: 15000 }).then(async () => {
      if (await page.locator(".error").count()) return `error:${await page.locator(".error").innerText()}`;
      if (await page.locator(".twin-card").count()) return "twins";
      return "working";
    }),
    page.waitForTimeout(15000).then(() => "timeout"),
  ]);
  console.log("paste result", pasteResult);

  await browser.close();
  await writeFile(path.join(OUT, "qa-rows.json"), JSON.stringify({ rows, consoleErrors, pageErrors, external, bad, huge, esLine, opened }, null, 2));
  if (consoleErrors.length || pageErrors.length) {
    console.error("console", consoleErrors, pageErrors);
    process.exit(2);
  }
  if (external.length) {
    console.error("external", external);
    process.exit(3);
  }
  if (rows.some((row) => row.over !== "0/0/0")) {
    console.error("overflow", rows.map((row) => [row.name, row.over]));
    process.exit(4);
  }
  console.log("qa pass collected");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
