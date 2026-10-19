import type { Calibration, Lang } from "../types";

/**
 * Loosest bar, and the curve stored in calibration.json.
 * A shown twin is not “every site above this”. See `judgeKin`.
 */
export const TWIN_PERCENTILE = 80;

/**
 * Pair-percentile bars, tightest first.
 * Chosen from the 2026-10-19 band probe (2,003 sites, Chrome embeddings):
 * a global top 5% (p95) gave the typical SaaS landing 0 twins, which kills
 * the hook, while the dark landing still had 80. A global top 20% (p80)
 * gave that dark landing 697, which reads as noise.
 * The adaptive rule keeps a specific count: the tightest band whose count
 * sits in [KIN_MIN, KIN_MAX]. A thin match (1–7) still gets the tight band
 * it actually clears. A crowd with no band inside the window is described
 * as neighbors in a zone, not as hundreds of twins. Nothing above p80 is
 * “no twin in the top 20%”.
 */
export const KIN_BANDS = [99, 97, 95, 90, 85, 80] as const;
export const KIN_MIN = 8;
export const KIN_MAX = 40;

export type KinMode = "twins" | "neighborhood" | "none";

export interface KinVerdict {
  mode: KinMode;
  /** Percentile bar. 97 means the top 3%. */
  band: number;
  top: number;
  count: number;
}

export function judgeKin(counts: ReadonlyMap<number, number>): KinVerdict {
  let thin: KinVerdict | null = null;
  let crowd: KinVerdict | null = null;
  for (const band of KIN_BANDS) {
    const count = counts.get(band) ?? 0;
    const verdict: KinVerdict = { mode: "twins", band, top: 100 - band, count };
    if (count >= KIN_MIN && count <= KIN_MAX) return verdict;
    if (count >= 1 && count < KIN_MIN && !thin) thin = verdict;
    if (count > KIN_MAX && !crowd) crowd = { ...verdict, mode: "neighborhood" };
  }
  if (thin) return thin;
  if (crowd) return crowd;
  return { mode: "none", band: TWIN_PERCENTILE, top: 100 - TWIN_PERCENTILE, count: 0 };
}

/** Percent of catalog pairs this cosine beats, from 0 to 100. */
export function percentileOf(cosine: number, knots: number[]): number {
  if (!knots.length) return 0;
  if (cosine <= knots[0]) return 0;
  const last = knots.length - 1;
  if (cosine >= knots[last]) return 100;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (knots[mid] < cosine) lo = mid + 1;
    else hi = mid;
  }
  const prev = knots[lo - 1];
  const next = knots[lo];
  const span = next - prev || 1;
  const frac = (lo - 1 + (cosine - prev) / span) / last;
  return Math.max(0, Math.min(100, frac * 100));
}

export function rankOf(cosine: number, calibration: Calibration): number {
  return Math.round(percentileOf(cosine, calibration.knots));
}

/** One decimal, so 99.1 and 99.8 do not collapse into the same card. */
export function formatPercentile(value: number, lang: Lang): string {
  const text = (Math.round(value * 10) / 10).toFixed(1);
  return lang === "es" ? text.replace(".", ",") : text;
}

export function formatRank(rank: number, lang: Lang): string {
  if (lang === "es") return `${rank}.º`;
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}

export function topShare(calibration: Calibration): number {
  return Math.round(100 - calibration.twinPercentile);
}
