export const CONSENT_VERSION = "2026-10-19";
export const SUB_PER_IP = 5;

const HOUR_MS = 60 * 60 * 1000;

/** Lowercased mailbox. Rejects spaces, missing dots, and overlong values. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (/[\s\u0000]/.test(email) || email.includes("..")) return null;
  const match = /^([a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64})@([a-z0-9.-]+)$/.exec(email);
  if (!match) return null;
  const domain = match[2];
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return null;
  const labels = domain.split(".");
  if (labels.some((label) => label.length === 0 || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) return null;
  return email;
}

export function subscriberKey(hash: string): string {
  return `sub:${hash}`;
}

export function subIpKey(ip: string, now: number): string {
  return `subip:${ip}:${Math.floor(now / HOUR_MS)}`;
}

export async function hashEmail(email: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return hex(new Uint8Array(digest));
}

export async function signUnsub(secret: string, hash: string): Promise<string> {
  const payload = bytesToB64Url(new TextEncoder().encode(JSON.stringify({ v: 1, h: hash })));
  const sig = await hmac(secret, payload);
  return `${payload}.${bytesToB64Url(sig)}`;
}

/** Returns the subscriber hash when the token was signed with this secret. */
export async function verifyUnsub(secret: string, token: string): Promise<string | null> {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const provided = b64UrlToBytes(sig);
  if (!provided) return null;
  const expected = await hmac(secret, payload);
  if (expected.length !== provided.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ provided[i];
  if (diff !== 0) return null;
  const bytes = b64UrlToBytes(payload);
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { v?: unknown; h?: unknown };
    if (parsed.v !== 1 || typeof parsed.h !== "string" || !/^[a-f0-9]{64}$/.test(parsed.h)) return null;
    return parsed.h;
  } catch {
    return null;
  }
}

async function hmac(secret: string, payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return new Uint8Array(sig);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
