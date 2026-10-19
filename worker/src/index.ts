import { decideLimit, dayKey, hourKey } from "./limit";
import { isPrivateOrSpecialIp, shotRejection, subrequestAllowed, validatePublicUrl, MAX_IMAGE_BYTES } from "./url";

const ALLOWED_ORIGIN = "https://twinsites.com";
const TURNSTILE_HOST = "challenges.cloudflare.com";
const DNS_HOST = "cloudflare-dns.com";
const API_HOST = "api.screenshotone.com";

export interface Env {
  SHOTS: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  };
  BROWSER?: unknown;
  TURNSTILE_SECRET?: string;
  SHOT_API_KEY?: string;
  SHOT_KILL?: string;
  SHOT_DAILY_CAP?: string;
  SHOT_PROVIDER?: string;
}

interface PageLike {
  setViewport(options: { width: number; height: number }): Promise<void>;
  setRequestInterception(value: boolean): Promise<void>;
  on(event: "request", handler: (request: { url(): string; continue(): Promise<void>; abort(): Promise<void> }) => void): void;
  goto(url: string, options: { waitUntil: string; timeout: number }): Promise<unknown>;
  screenshot(options: { type: "png"; clip: { x: number; y: number; width: number; height: number } }): Promise<Uint8Array | ArrayBuffer>;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};

export async function handle(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    if (origin !== ALLOWED_ORIGIN) return json({ error: "origin" }, 403);
    return new Response(null, { status: 204, headers: cors() });
  }
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (origin !== ALLOWED_ORIGIN) return json({ error: "origin" }, 403);
  if (killed(env)) {
    log("killed");
    return json({ error: "unavailable" }, 503);
  }

  let payload: { url?: unknown; token?: unknown };
  try {
    payload = (await request.json()) as { url?: unknown; token?: unknown };
  } catch {
    return json({ error: "invalid" }, 400);
  }
  if (typeof payload.url !== "string") return json({ error: "invalid" }, 400);
  const checked = validatePublicUrl(payload.url);
  if (!checked.ok) {
    log(`reject-${checked.reason}`);
    return json({ error: "invalid" }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const ipKey = hourKey(ip, now);
  const globalKey = dayKey(now);
  const [ipRaw, globalRaw] = await Promise.all([env.SHOTS.get(ipKey), env.SHOTS.get(globalKey)]);
  const decision = decideLimit({
    kill: false,
    ipCount: Number(ipRaw ?? "0") || 0,
    globalCount: Number(globalRaw ?? "0") || 0,
    dailyCap: dailyCap(env),
  });
  if (!decision.ok) {
    log(decision.reason === "ip" ? "limit-ip" : "limit-cap", checked.host);
    return json({ error: "limited" }, 429);
  }

  const token = typeof payload.token === "string" ? payload.token : "";
  const secret = env.TURNSTILE_SECRET ?? "";
  if (!secret || !(await turnstileOk(token, secret, ip))) {
    log("turnstile", checked.host);
    return json({ error: "blocked" }, 403);
  }
  if (!(await resolvesPublic(checked.host))) {
    log("dns", checked.host);
    return json({ error: "invalid" }, 400);
  }

  await Promise.all([
    env.SHOTS.put(ipKey, String((Number(ipRaw ?? "0") || 0) + 1), { expirationTtl: 2 * 60 * 60 }),
    env.SHOTS.put(globalKey, String((Number(globalRaw ?? "0") || 0) + 1), { expirationTtl: 2 * 24 * 60 * 60 }),
  ]);

  try {
    const shot = await withTimeout(shoot(env, payload.url), 25000);
    const reason = shotRejection(200, shot.type, shot.bytes.byteLength);
    if (reason) {
      log(`image-${reason}`, checked.host);
      return json({ error: "unavailable" }, 502);
    }
    log("ok", checked.host);
    return new Response(shot.bytes, { status: 200, headers: cors({ "content-type": shot.type }) });
  } catch (err) {
    const failure = describeShotError(err);
    log("fail", checked.host, failure);
    const extra = failure.retryAfter ? { "Retry-After": failure.retryAfter } : undefined;
    return json({ error: "unavailable" }, failure.status, extra);
  }
}

function killed(env: Env): boolean {
  const value = (env.SHOT_KILL ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

function dailyCap(env: Env): number {
  const parsed = Number(env.SHOT_DAILY_CAP ?? "40");
  return Number.isFinite(parsed) ? parsed : 40;
}

interface Shot {
  bytes: Uint8Array;
  type: "image/png" | "image/jpeg";
}

async function shoot(env: Env, target: string): Promise<Shot> {
  if ((env.SHOT_PROVIDER ?? "browser").trim().toLowerCase() === "api") return shootWithApi(env.SHOT_API_KEY ?? "", target);
  if (!env.BROWSER) throw new Error("browser");
  return shootWithBrowser(env.BROWSER, target);
}

async function shootWithApi(key: string, target: string): Promise<Shot> {
  if (!key) throw new Error("key");
  const endpoint = new URL(`https://${API_HOST}/take`);
  endpoint.searchParams.set("access_key", key);
  endpoint.searchParams.set("url", target);
  endpoint.searchParams.set("viewport_width", "1440");
  endpoint.searchParams.set("viewport_height", "900");
  endpoint.searchParams.set("format", "png");
  endpoint.searchParams.set("full_page", "false");
  const response = await fetch(endpoint, { redirect: "manual", signal: AbortSignal.timeout(15000) });
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const bytes = await readCapped(response);
  if (!bytes || (type !== "image/png" && type !== "image/jpeg")) throw new Error("provider");
  return { bytes, type };
}

async function shootWithBrowser(binding: unknown, target: string): Promise<Shot> {
  const mod = (await import("@cloudflare/puppeteer")) as {
    default: { launch: (value: unknown) => Promise<{ newPage: () => Promise<PageLike>; close: () => Promise<void> }> };
  };
  const browser = await mod.default.launch(binding);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setRequestInterception(true);
    page.on("request", (incoming) => {
      if (subrequestAllowed(incoming.url())) void incoming.continue();
      else void incoming.abort();
    });
    await page.goto(target, { waitUntil: "load", timeout: 20000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const image = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1440, height: 900 } });
    const bytes = image instanceof Uint8Array ? image : new Uint8Array(image);
    return { bytes, type: "image/png" };
  } finally {
    await browser.close();
  }
}

async function readCapped(response: Response): Promise<Uint8Array | null> {
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (shotRejection(response.status, type || "application/octet-stream", 1)) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return shotRejection(200, type, out.byteLength) ? null : out;
}

async function resolvesPublic(host: string): Promise<boolean> {
  const ips = (await Promise.all([lookup(host, "A"), lookup(host, "AAAA")])).flat();
  if (!ips.length) return false;
  return ips.every((ip) => !isPrivateOrSpecialIp(ip));
}

async function lookup(host: string, type: "A" | "AAAA"): Promise<string[]> {
  const response = await fetch(`https://${DNS_HOST}/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });
  if (response.status !== 200) return [];
  const json = (await response.json()) as { Answer?: { data?: string }[] };
  return (json.Answer ?? [])
    .map((row) => row.data ?? "")
    .filter((data) => /^\d+\.\d+\.\d+\.\d+$/.test(data) || data.includes(":"));
}

async function turnstileOk(token: string, secret: string, ip: string): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const response = await fetch(`https://${TURNSTILE_HOST}/turnstile/v0/siteverify`, {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });
  if (response.status !== 200) return false;
  const json = (await response.json()) as { success?: boolean };
  return json.success === true;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function json(body: { error: string }, status: number, extra?: Record<string, string>): Response {
  const headers = cors({ "content-type": "application/json" });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

/** Browser Rendering rate limits become 503. The message never keeps a full URL. */
export function describeShotError(error: unknown): { name: string; message: string; status: number; retryAfter?: string } {
  const name = error instanceof Error ? error.name : "Error";
  const raw = error instanceof Error ? error.message : "fail";
  const message = raw.replace(/https?:\/\/\S+/gi, "[url]").slice(0, 180);
  const coded = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : NaN;
  const limited = coded === 429 || /\b429\b|rate limit|too many requests|quota|browser limit|concurrent browsers/i.test(message);
  if (limited) return { name, message, status: 503, retryAfter: "60" };
  return { name, message, status: 504 };
}

function cors(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "content-type");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Vary", "Origin");
  headers.set("Cache-Control", "no-store");
  return headers;
}

function log(event: string, host?: string, failure?: { name: string; message: string; status: number }): void {
  const row: Record<string, string | number> = { event };
  if (host) row.host = host;
  if (failure) {
    row.name = failure.name;
    row.message = failure.message;
    row.status = failure.status;
  }
  console.log(JSON.stringify(row));
}
