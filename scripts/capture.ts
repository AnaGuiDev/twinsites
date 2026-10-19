/**
 * Screenshot public homepages from the CC0 catalog
 * https://github.com/JefferyLee/awesome-vibe-coded-apps
 *
 * Resumable. Successful shots land in data/raw/. Two holdout sites are
 * saved under /tmp/twinsites-samples and kept out of the dataset.
 */
import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";
import { mkdir, readFile, writeFile, access, rename } from "node:fs/promises";
import path from "node:path";
import { analyzePixels } from "../src/lib/analyze.ts";

interface Project {
  slug?: string;
  title?: string;
  short_description?: string;
  live_url?: string;
  primary_category?: string;
  detected_stack?: string[];
  is_featured?: boolean;
  live_check_status?: string;
}

interface QueueItem {
  slug: string;
  title: string;
  url: string;
  category: string;
  blurb: string;
  score: number;
}

const ROOT = process.cwd();
const RAW = path.join(ROOT, "data", "raw");
const ITEMS = path.join(RAW, "items");
const SHOTS = path.join(RAW, "shots");
const THUMBS = path.join(RAW, "thumbs");
const SAMPLES = "/tmp/twinsites-samples";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i];
  if (!token.startsWith("--")) continue;
  const key = token.slice(2);
  const next = process.argv[i + 1];
  if (next && !next.startsWith("--")) {
    args.set(key, next);
    i++;
  } else args.set(key, "true");
}

const ATTEMPTS = Number(args.get("attempts") ?? 3200);
const SUCCESS_CAP = Number(args.get("success") ?? 1100);
const CONCURRENCY = Number(args.get("concurrency") ?? 4);
const CATALOG = args.get("catalog") ?? "/tmp/projects.json";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function usable(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local")) return false;
    if (/\.(pdf|zip|png|jpe?g|gif|mp4|mp3|wasm)$/i.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function safeSlug(slug: string, url: string): string {
  const base = (slug || url)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return base || "site";
}

function scoreOf(project: Project): number {
  let score = project.is_featured ? 50 : 0;
  const stack = (project.detected_stack ?? []).join(" ");
  if (/tailwind|lovable|radix|framer|shadcn/i.test(stack)) score += 6;
  if (/next\.js|astro|sveltekit|nuxt/i.test(stack)) score += 2;
  return score;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildQueue(projects: Project[]): QueueItem[] {
  const byCat = new Map<string, QueueItem[]>();
  const seen = new Set<string>();
  const usedSlugs = new Set<string>();
  for (const project of projects) {
    if (project.live_check_status && project.live_check_status !== "live") continue;
    const url = (project.live_url || "").trim();
    if (!usable(url)) continue;
    const key = url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let slug = safeSlug(project.slug || "", url);
    if (usedSlugs.has(slug)) slug = `${slug}-${hash(url).toString(36).slice(0, 4)}`;
    usedSlugs.add(slug);
    const item: QueueItem = {
      slug,
      title: (project.title || "").replace(/\s+/g, " ").trim().slice(0, 140) || new URL(url).hostname,
      url,
      category: project.primary_category || "other",
      blurb: (project.short_description || "").replace(/\s+/g, " ").trim().slice(0, 180),
      score: scoreOf(project),
    };
    const list = byCat.get(item.category) ?? [];
    list.push(item);
    byCat.set(item.category, list);
  }
  for (const list of byCat.values()) {
    list.sort((a, b) => b.score - a.score || hash(a.slug) - hash(b.slug));
  }
  const cats = [...byCat.keys()].sort();
  const cursors = new Map(cats.map((cat) => [cat, 0]));
  const out: QueueItem[] = [];
  while (out.length < ATTEMPTS) {
    let moved = false;
    for (const cat of cats) {
      const list = byCat.get(cat)!;
      const index = cursors.get(cat)!;
      if (index >= list.length) continue;
      out.push(list[index]);
      cursors.set(cat, index + 1);
      moved = true;
      if (out.length >= ATTEMPTS) break;
    }
    if (!moved) break;
  }
  return out;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function arm(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    const url = route.request().url();
    if (type === "media" || type === "websocket" || type === "manifest") return route.abort();
    if (/google-analytics|googletagmanager|doubleclick\.net|facebook\.net|hotjar|segment\.(io|com)|posthog/i.test(url)) {
      return route.abort();
    }
    return route.continue();
  });
}

async function newPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    userAgent: UA,
    locale: "en-US",
    ignoreHTTPSErrors: true,
    colorScheme: "light",
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(12000);
  page.setDefaultTimeout(8000);
  await arm(page);
  return {
    page,
    close: async () => {
      await context.close().catch(() => undefined);
    },
  };
}

async function shoot(page: Page, item: QueueItem, pngPath: string, webpPath: string | null): Promise<string | null> {
  const response = await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 12000 });
  const status = response?.status() ?? 0;
  if (status === 404 || status === 410 || status >= 500) return `http ${status}`;
  await page.waitForTimeout(900);
  const title = await page.title().catch(() => "");
  if (/just a moment|attention required|access denied|cf-browser|captcha|403 forbidden/i.test(title)) {
    return `blocked:${title.slice(0, 60)}`;
  }
  const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide", timeout: 8000 });
  const resized = await sharp(png).resize(96, 60, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const traits = analyzePixels(resized.data, resized.info.width, resized.info.height, 3);
  if (traits.whitespace > 0.97 && traits.edge < 0.012) return "blank";
  if (traits.blockStd < 0.012 && traits.edge < 0.02) return "flat";
  await writeFile(pngPath, png);
  if (webpPath) {
    await sharp(png).resize({ width: 320, withoutEnlargement: true }).webp({ quality: 44, effort: 4 }).toFile(webpPath);
  }
  if (webpPath) {
    const record = {
      slug: item.slug,
      title: item.title,
      url: item.url,
      category: item.category,
      blurb: item.blurb,
      traits,
      shot: `shots/${path.basename(pngPath)}`,
      thumb: `thumbs/${path.basename(webpPath)}`,
    };
    const finalJson = path.join(ITEMS, `${item.slug}.json`);
    const tmp = `${finalJson}.tmp`;
    await writeFile(tmp, JSON.stringify(record));
    await rename(tmp, finalJson);
  }
  return null;
}

async function main(): Promise<void> {
  await mkdir(ITEMS, { recursive: true });
  await mkdir(SHOTS, { recursive: true });
  await mkdir(THUMBS, { recursive: true });
  await mkdir(SAMPLES, { recursive: true });

  const projects = JSON.parse(await readFile(CATALOG, "utf8")) as Project[];
  const queue = buildQueue(projects);
  console.log(`queue ${queue.length} attempts, cap ${SUCCESS_CAP}, concurrency ${CONCURRENCY}`);

  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--mute-audio",
      "--disable-extensions",
      "--no-first-run",
      "--disable-background-networking",
    ],
  });

  const holdouts: QueueItem[] = [];
  const excluded = new Set<string>();
  {
    const session = await newPage(browser);
    for (const item of queue) {
      if (holdouts.length >= 2) break;
      const pngPath = path.join(SAMPLES, `holdout-${holdouts.length + 1}.png`);
      try {
        const reason = await shoot(pageSafe(session.page), item, pngPath, null);
        if (reason) {
          console.log(`holdout skip ${item.url} (${reason})`);
          continue;
        }
        holdouts.push(item);
        excluded.add(item.url);
        console.log(`holdout ${holdouts.length}: ${item.url}`);
      } catch (error) {
        console.log(`holdout error ${item.url}: ${(error as Error).message?.slice(0, 120)}`);
      }
    }
    await session.close();
    await writeFile(
      path.join(SAMPLES, "holdouts.json"),
      JSON.stringify(
        holdouts.map((item, index) => ({ ...item, file: `holdout-${index + 1}.png` })),
        null,
        2,
      ),
    );
  }

  const work = queue.filter((item) => !excluded.has(item.url));
  let cursor = 0;
  let success = 0;
  let attempted = 0;
  let knownSaved = false;
  const failures = new Map<string, number>();
  const started = Date.now();

  for (const file of await listJson()) success++;
  console.log(`already captured ${success}`);

  async function listJson(): Promise<string[]> {
    const { readdir } = await import("node:fs/promises");
    const names = await readdir(ITEMS);
    return names.filter((name) => name.endsWith(".json"));
  }

  async function worker(id: number): Promise<void> {
    let session = await newPage(browser);
    let sinceRestart = 0;
    while (success < SUCCESS_CAP) {
      const index = cursor++;
      if (index >= work.length) break;
      const item = work[index];
      const jsonPath = path.join(ITEMS, `${item.slug}.json`);
      if (await exists(jsonPath)) continue;
      attempted++;
      const pngPath = path.join(SHOTS, `${item.slug}.png`);
      const webpPath = path.join(THUMBS, `${item.slug}.webp`);
      try {
        const reason = await shoot(session.page, item, pngPath, webpPath);
        sinceRestart++;
        if (reason) {
          const key = reason.split(":")[0];
          failures.set(key, (failures.get(key) ?? 0) + 1);
        } else {
          success++;
          if (!knownSaved) {
            knownSaved = true;
            const { copyFile } = await import("node:fs/promises");
            await copyFile(pngPath, path.join(SAMPLES, "known.png"));
            await writeFile(path.join(SAMPLES, "known.json"), JSON.stringify(item, null, 2));
          }
        }
      } catch (error) {
        const message = (error as Error).message || "error";
        failures.set("crash", (failures.get("crash") ?? 0) + 1);
        if (attempted % 15 === 0) console.log(`worker ${id} crash: ${message.slice(0, 140)}`);
        await session.close().catch(() => undefined);
        session = await newPage(browser);
        sinceRestart = 0;
      }
      if (sinceRestart >= 40) {
        await session.close().catch(() => undefined);
        session = await newPage(browser);
        sinceRestart = 0;
      }
      if (attempted % 20 === 0) {
        const elapsed = (Date.now() - started) / 1000;
        const rate = attempted / Math.max(elapsed, 1);
        console.log(
          `ok ${success}/${SUCCESS_CAP} tried ${attempted} rate ${rate.toFixed(2)}/s elapsed ${Math.round(elapsed)}s`,
        );
      }
    }
    await session.close().catch(() => undefined);
  }

  function pageSafe(page: Page): Page {
    return page;
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, id) => worker(id + 1)));
  await browser.close();
  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log(`done success=${success} attempted=${attempted} elapsed=${elapsed}s`);
  console.log("failures", Object.fromEntries(failures));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
