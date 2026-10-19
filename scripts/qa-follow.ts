/** Language, errors, paste, focus, and top-of-page shots. The six matches already ran. */
import { chromium, type ConsoleMessage } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const BASE = "http://127.0.0.1:4173";
const OUT = "/opt/cursor/artifacts";
const KEEP = "/tmp/twinsites-keep";

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

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, "hero-1440.png") });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({ path: path.join(OUT, "hero-768.png") });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: path.join(OUT, "hero-375.png") });
  const heroOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log("hero overflow 375", heroOverflow);

  await page.getByRole("button", { name: "Español" }).click();
  await page.waitForTimeout(200);
  const esHero = {
    title: await page.locator("h1").innerText(),
    stamp: await page.locator(".stamp-mark").innerText(),
    removal: await page.locator("a.removal").innerText(),
    browse: await page.locator("button.ticket").innerText(),
    hint: await page.locator(".sleeve-hint").innerText(),
  };
  console.log("es hero", esHero);
  await page.screenshot({ path: path.join(OUT, "hero-es-375.png") });

  await page.locator("input[type=file]").setInputFiles(path.join(KEEP, "mobile.png"));
  await page.locator(".again-line").waitFor({ timeout: 180000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const esLine = await page.locator(".again-line").innerText();
  const esNote = await page.locator(".score-note").innerText();
  const esTwins = await page.locator("h2").first().innerText();
  console.log("es result", { esLine, esNote, esTwins });
  await page.screenshot({ path: path.join(OUT, "result-es-375.png") });
  await page.locator("button.lang").click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, "result-en-375.png") });

  const opened: string[] = [];
  await page.exposeFunction("qaOpened", (url: string) => opened.push(url));
  await page.evaluate(() => {
    window.open = ((url?: string | URL) => {
      void (window as unknown as { qaOpened: (value: string) => void }).qaOpened(String(url ?? ""));
      return null;
    }) as typeof window.open;
  });
  await page.getByRole("button", { name: "Post the line on X" }).click();
  console.log("intent", opened[0]);

  await page.keyboard.press("Tab");
  const focus1 = await page.evaluate(() => ({
    text: document.activeElement?.textContent?.trim()?.slice(0, 80) ?? "",
    tag: document.activeElement?.tagName ?? "",
    outline: document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : "",
    width: document.activeElement ? getComputedStyle(document.activeElement).outlineWidth : "",
  }));
  console.log("tab1", focus1);

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator("input[type=file]").setInputFiles(path.join(KEEP, "bad.png"));
  const bad = await page.locator(".error").innerText();
  console.log("bad", bad);

  await page.locator("input[type=file]").setInputFiles(path.join(KEEP, "huge.png"));
  const huge = await page.locator(".error").innerText();
  console.log("huge", huge);
  await page.screenshot({ path: path.join(OUT, "error-huge.png") });

  const png = (await readFile(path.join(KEEP, "handmade.png"))).toString("base64");
  await page.evaluate((b64) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], "paste.png", { type: "image/png" });
    const data = new DataTransfer();
    data.items.add(file);
    const event = new Event("paste", { bubbles: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    window.dispatchEvent(event);
  }, png);
  await page.locator(".twin-card").first().waitFor({ timeout: 180000 });
  const pasted = await page.locator(".again-line").innerText();
  console.log("pasted", pasted);

  const contrast = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.className = "kicker";
    probe.textContent = "Field note";
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    const bg = getComputedStyle(document.body).backgroundColor;
    probe.remove();
    return { color, bg };
  });
  console.log("kicker color", contrast);
  console.log("errors", { consoleErrors, pageErrors });
  await browser.close();
  if (consoleErrors.length || pageErrors.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
