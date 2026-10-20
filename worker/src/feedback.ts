/**
 * Anonymous trait corrections, sent only when someone ticks the box. A record
 * holds which trait, what Twinsites read, what the person says it is, a few
 * rounded measurements and the day. No image, no URL, no IP, no user agent.
 * The abuse counter uses a salted hash of the IP for the current hour and
 * expires within two hours; it is never stored with a correction.
 */

export const FEEDBACK_PER_IP = 20;
const HOUR_MS = 60 * 60 * 1000;

const VALUES: Record<string, readonly string[]> = {
  mode: ["light", "dark"],
  centered: ["true", "false"],
  gradient: ["true", "false"],
  bento: ["true", "false"],
  density: ["airy", "balanced", "packed"],
  color: ["red", "orange", "amber", "yellow", "lime", "green", "teal", "cyan", "blue", "indigo", "purple", "magenta", "pink", "neutral"],
};
const MEASURES = ["luminance", "saturation", "whitespace", "edge", "blockStd", "centerShare"] as const;

export interface Correction {
  trait: string;
  detected: string;
  corrected: string;
  measures: Record<(typeof MEASURES)[number], number>;
  version: string;
}

/** Returns a clean correction, or null when anything is off. */
export function parseCorrection(raw: unknown): Correction | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const trait = typeof body.trait === "string" ? body.trait : "";
  const allowed = VALUES[trait];
  if (!allowed) return null;
  const detected = String(body.detected ?? "");
  const corrected = String(body.corrected ?? "");
  if (!allowed.includes(detected) || !allowed.includes(corrected) || detected === corrected) return null;
  const version = typeof body.version === "string" ? body.version : "";
  if (!/^[a-z0-9.-]{1,24}$/.test(version)) return null;
  const input = body.measures && typeof body.measures === "object" ? (body.measures as Record<string, unknown>) : null;
  if (!input) return null;
  const measures = {} as Correction["measures"];
  for (const key of MEASURES) {
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < 0 || value > 1) return null;
    measures[key] = Math.round(value * 1000) / 1000;
  }
  return { trait, detected, corrected, measures, version };
}

export async function feedbackIpKey(ip: string, now: number, salt: string): Promise<string> {
  const hour = Math.floor(now / HOUR_MS);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${hour}:${ip}`));
  const short = [...new Uint8Array(digest).slice(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `fbip:${short}:${hour}`;
}

export function feedbackKey(now: number, id: string): string {
  return `fb:${new Date(now).toISOString().slice(0, 10)}:${id}`;
}

export function feedbackRecord(correction: Correction, now: number): string {
  return JSON.stringify({ ...correction, day: new Date(now).toISOString().slice(0, 10) });
}
