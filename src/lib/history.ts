import type { KinVerdict } from "./calibrate";

/**
 * The last screenshot check, kept only in this browser so a new version of the
 * same page can be compared with it. Nothing here is ever sent anywhere.
 */
export interface Check {
  at: number;
  verdict: KinVerdict;
  /** Sites clearing each kin band, keyed by band (99, 97, 95, 90, 85, 80). */
  bands: Record<number, number>;
  nearest: number;
  zoneEn: string;
  zoneEs: string;
  /** A small JPEG data URL of the first screen. */
  preview: string;
}

const KEY = "twinsites.lastCheck";

export function loadCheck(): Check | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const check = JSON.parse(raw) as Check;
    return check && typeof check.at === "number" && check.bands ? check : null;
  } catch {
    return null;
  }
}

export function saveCheck(check: Check): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(check));
  } catch {
    // Private mode or full storage: progress is a convenience, not a requirement.
  }
}

export function forgetCheck(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}

/** A small preview for the before/after card, drawn from the cropped first screen. */
export async function smallPreview(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const width = 480;
  const height = Math.round((bitmap.height / bitmap.width) * width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.72);
}

export interface Progress {
  band: number;
  top: number;
  before: number;
  after: number;
  nearestBefore: number;
  nearestAfter: number;
}

/** Compare on the band the earlier check was judged on, so the numbers mean the same thing. */
export function progressOf(previous: Check, bands: Record<number, number>, nearest: number): Progress {
  const band = previous.verdict.band;
  return {
    band,
    top: 100 - band,
    before: previous.bands[band] ?? 0,
    after: bands[band] ?? 0,
    nearestBefore: previous.nearest,
    nearestAfter: nearest,
  };
}
