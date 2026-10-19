export const MAX_URL_LENGTH = 2048;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const BLOCKED_SUFFIXES = ["localhost", "local", "internal", "localdomain", "nip.io", "sslip.io", "xip.io", "localtest.me", "lvh.me"];

export type UrlReason = "length" | "parse" | "protocol" | "auth" | "port" | "ip" | "host";

export function validatePublicUrl(raw: string): { ok: true; host: string } | { ok: false; reason: UrlReason } {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_URL_LENGTH) return { ok: false, reason: "length" };
  if (/[\s\u0000\\]/.test(raw)) return { ok: false, reason: "parse" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "parse" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "protocol" };
  if (url.username || url.password) return { ok: false, reason: "auth" };
  if (url.port && url.port !== "443") return { ok: false, reason: "port" };
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host || host.length > 253) return { ok: false, reason: "host" };
  if (isIpLiteral(host)) return { ok: false, reason: "ip" };
  if (!host.includes(".")) return { ok: false, reason: "host" };
  if (isBlockedHost(host)) return { ok: false, reason: "host" };
  return { ok: true, host };
}

/** True for IPv4 (including decimal, hex, and octal forms) and any IPv6 literal. */
export function isIpLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host.includes(":")) return true;
  if (/^0x[0-9a-f]+$/i.test(host)) return true;
  if (/^\d+$/.test(host)) return true;
  const parts = host.split(".");
  return parts.length > 0 && parts.length <= 4 && parts.every((part) => /^(0x[0-9a-f]+|\d+)$/i.test(part));
}

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return BLOCKED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Private, loopback, link-local, multicast, and metadata ranges. Unparseable input is treated as unsafe. */
export function isPrivateOrSpecialIp(ip: string): boolean {
  const host = ip.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (host.includes(":")) return isPrivateV6(host);
  const parts = parseV4(host);
  if (!parts) return true;
  return isPrivateV4(parts);
}

export function subrequestAllowed(raw: string): boolean {
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return true;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.port && url.port !== "443" && url.port !== "80") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) return false;
  if (isIpLiteral(host)) return !isPrivateOrSpecialIp(host);
  if (isBlockedHost(host)) return false;
  return true;
}

/** Why a screenshot response must be dropped. Redirects are never followed. */
export function shotRejection(status: number, contentType: string, byteLength: number): "redirect" | "status" | "type" | "size" | null {
  if (status >= 300 && status < 400) return "redirect";
  if (status !== 200) return "status";
  if (!/^image\/(png|jpeg)(\s*;|$)/i.test(contentType)) return "type";
  if (byteLength <= 0 || byteLength > MAX_IMAGE_BYTES) return "size";
  return null;
}

function parseV4(host: string): number[] | null {
  if (/^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host)) {
    const n = Number(host);
    if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  }
  const bits = host.split(".");
  if (bits.length < 1 || bits.length > 4) return null;
  const nums: number[] = [];
  for (const bit of bits) {
    const value = parsePart(bit);
    if (value == null) return null;
    nums.push(value);
  }
  if (nums.length === 4) return nums.every((n) => n <= 255) ? nums : null;
  const head = nums.slice(0, -1);
  const tail = nums[nums.length - 1];
  if (head.some((n) => n > 255)) return null;
  const missing = 4 - head.length;
  if (tail > 2 ** (8 * missing) - 1) return null;
  const out = [...head];
  for (let i = missing - 1; i >= 0; i--) out.push((tail >> (8 * i)) & 255);
  return out;
}

function parsePart(part: string): number | null {
  if (/^0x[0-9a-f]+$/i.test(part)) {
    const n = Number(part);
    return n >= 0 && n <= 0xffffffff ? n : null;
  }
  if (!/^\d+$/.test(part)) return null;
  const n = part.length > 1 && part.startsWith("0") ? Number.parseInt(part, 8) : Number(part);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function isPrivateV4(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateV6(host: string): boolean {
  if (host === "::" || host === "::1") return true;
  if (host.startsWith("::ffff:")) {
    const parts = parseV4(host.slice("::ffff:".length));
    return !parts || isPrivateV4(parts);
  }
  const first = Number.parseInt(host.split(":")[0] || "0", 16);
  if (!Number.isFinite(first)) return true;
  if (first >= 0xfc00 && first <= 0xfdff) return true;
  if (first >= 0xfe80 && first <= 0xfebf) return true;
  if (first >= 0xff00) return true;
  if (host.startsWith("2001:db8")) return true;
  return false;
}
