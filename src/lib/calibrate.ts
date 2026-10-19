import type { Calibration, Lang } from "../types";

/** A twin beats this share of random catalog pairs. 80 → “top 20%”. */
export const TWIN_PERCENTILE = 80;

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
