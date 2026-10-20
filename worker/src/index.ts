import { decideLimit, dayKey, hourKey } from "./limit";
import {
  CONSENT_VERSION,
  SUB_PER_IP,
  hashEmail,
  normalizeEmail,
  subIpKey,
  subscriberKey,
  verifyUnsub,
} from "./subscribe";
import { FEEDBACK_PER_IP, feedbackIpKey, feedbackKey, feedbackRecord, parseCorrection } from "./feedback";
import { isPrivateOrSpecialIp, shotRejection, subrequestAllowed, validatePublicUrl, MAX_IMAGE_BYTES } from "./url";

const ALLOWED_ORIGIN = "https://twinsites.com";
const TURNSTILE_HOST = "challenges.cloudflare.com";
const DNS_HOST = "cloudflare-dns.com";
const API_HOST = "api.screenshotone.com";

export interface Env {
  SHOTS: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete?(key: string): Promise<void>;
  };
  BROWSER?: unknown;
  TURNSTILE_SECRET?: string;
  SHOT_API_KEY?: string;
  SHOT_KILL?: string;
  SHOT_DAILY_CAP?: string;
  SHOT_PROVIDER?: string;
  UNSUB_SECRET?: string;
  /** Salt for the hourly abuse counter of /feedback. Any long random string. */
  FEEDBACK_SALT?: string;
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
  const url = new URL(request.url);
  if (url.pathname === "/unsubscribe") {
    if (request.method !== "GET") return json({ error: "method" }, 405);
    return handleUnsubscribe(url, env);
  }
  if (url.pathname === "/subscribe") return handleSubscribe(request, env);
  if (url.pathname === "/feedback") return handleFeedback(request, env);

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

async function handleSubscribe(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    if (origin !== ALLOWED_ORIGIN) return json({ error: "origin" }, 403);
    return new Response(null, { status: 204, headers: cors() });
  }
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (origin !== ALLOWED_ORIGIN) return json({ error: "origin" }, 403);
  const secret = env.UNSUB_SECRET ?? "";
  if (!secret) {
    log("subscribe-secret");
    return json({ error: "unavailable" }, 503);
  }

  let payload: { email?: unknown; consent?: unknown; consentVersion?: unknown; token?: unknown };
  try {
    payload = (await request.json()) as { email?: unknown; consent?: unknown; consentVersion?: unknown; token?: unknown };
  } catch {
    return json({ error: "invalid" }, 400);
  }
  const email = normalizeEmail(payload.email);
  if (!email) {
    log("subscribe-invalid");
    return json({ error: "invalid" }, 400);
  }
  if (payload.consent !== true || payload.consentVersion !== CONSENT_VERSION) {
    log("subscribe-consent");
    return json({ error: "invalid" }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const limitKey = subIpKey(ip, now);
  const used = Number((await env.SHOTS.get(limitKey)) ?? "0") || 0;
  if (used >= SUB_PER_IP) {
    log("subscribe-limit");
    return json({ error: "limited" }, 429, { "Retry-After": "60" });
  }
  await env.SHOTS.put(limitKey, String(used + 1), { expirationTtl: 2 * 60 * 60 });

  const token = typeof payload.token === "string" ? payload.token : "";
  const turnstileSecret = env.TURNSTILE_SECRET ?? "";
  if (!turnstileSecret || !(await turnstileOk(token, turnstileSecret, ip))) {
    log("subscribe-turnstile");
    return json({ error: "blocked" }, 403);
  }

  const hash = await hashEmail(email);
  const record = JSON.stringify({ email, at: new Date(now).toISOString(), consent: CONSENT_VERSION });
  await env.SHOTS.put(subscriberKey(hash), record);
  log("subscribe-ok");
  return json({ ok: true }, 200);
}

async function handleFeedback(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    if (origin !== ALLOWED_ORIGIN) return json({ error: "origin" }, 403);
    return new Response(null, { status: 204, headers: cors() });
  }
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (origin !== ALLOWED_ORIGIN) return json({ error: "origin" }, 403);
  const salt = env.FEEDBACK_SALT ?? "";
  if (!salt) {
    log("feedback-salt");
    return json({ error: "unavailable" }, 503);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid" }, 400);
  }
  const correction = parseCorrection(payload);
  if (!correction) {
    log("feedback-invalid");
    return json({ error: "invalid" }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const limitKey = await feedbackIpKey(ip, now, salt);
  const used = Number((await env.SHOTS.get(limitKey)) ?? "0") || 0;
  if (used >= FEEDBACK_PER_IP) {
    log("feedback-limit");
    return json({ error: "limited" }, 429, { "Retry-After": "600" });
  }
  await env.SHOTS.put(limitKey, String(used + 1), { expirationTtl: 2 * 60 * 60 });

  const token = typeof payload.token === "string" ? payload.token : "";
  const turnstileSecret = env.TURNSTILE_SECRET ?? "";
  if (!turnstileSecret || !(await turnstileOk(token, turnstileSecret, ip))) {
    log("feedback-turnstile");
    return json({ error: "blocked" }, 403);
  }

  await env.SHOTS.put(feedbackKey(now, crypto.randomUUID()), feedbackRecord(correction, now), {
    expirationTtl: 400 * 24 * 60 * 60,
  });
  log("feedback-ok");
  return json({ ok: true }, 200);
}

async function handleUnsubscribe(url: URL, env: Env): Promise<Response> {
  const secret = env.UNSUB_SECRET ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!secret || !token) {
    log("unsub-bad");
    return htmlPage("bad", 400);
  }
  const hash = await verifyUnsub(secret, token);
  if (!hash) {
    log("unsub-bad");
    return htmlPage("bad", 400);
  }
  await env.SHOTS.delete?.(subscriberKey(hash));
  log("unsub-ok");
  return htmlPage("ok", 200);
}

function htmlPage(kind: "ok" | "bad", status = 200): Response {
  const title = kind === "ok" ? "You're off the list." : "This link doesn't work.";
  const body =
    kind === "ok"
      ? "We deleted that address. You won't get the monthly report."
      : "It may already have been used.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} Twinsites</title><style>body{margin:0;background:#e6dece;color:#1b1612;font-family:Palatino,Georgia,serif}main{max-width:36rem;margin:12vh auto;padding:0 24px}a{color:#b82c1a}p.kicker{font-family:ui-monospace,monospace;letter-spacing:.08em;font-size:12px}</style></head><body><main><p class="kicker">TWINSITES</p><h1>${title}</h1><p>${body}</p><p><a href="https://twinsites.com/">Back to Twinsites</a></p></main></body></html>`;
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  return new Response(html, { status, headers });
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

function json(body: { error?: string; ok?: boolean }, status: number, extra?: Record<string, string>): Response {
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
