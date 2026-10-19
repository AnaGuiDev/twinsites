/**
 * Pairwise cosine distribution for the catalog. The browser reads the knots;
 * it does not recompute them.
 */
import type { Calibration } from "../src/types.ts";
import { TWIN_PERCENTILE } from "../src/lib/calibrate.ts";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dot(rows: Float32Array, dim: number, i: number, j: number): number {
  let sum = 0;
  const a = i * dim;
  const b = j * dim;
  for (let d = 0; d < dim; d++) sum += rows[a + d] * rows[b + d];
  return sum;
}

/** Seeded sample of catalog pairs. Enough for a stable percentile curve, including the tail. */
export function buildCalibration(rows: Float32Array, count: number, dim: number, samples = 400_000): Calibration {
  const random = mulberry32(20261019);
  const pairs = new Float64Array(samples);
  for (let n = 0; n < samples; n++) {
    const i = Math.floor(random() * count);
    let j = Math.floor(random() * (count - 1));
    if (j >= i) j += 1;
    pairs[n] = dot(rows, dim, i, j);
  }
  pairs.sort();
  const steps = 1000;
  const knots: number[] = [];
  const last = pairs.length - 1;
  for (let step = 0; step <= steps; step++) {
    knots.push(pairs[Math.round((step / steps) * last)]);
  }
  const twinCosine = pairs[Math.min(last, Math.round((TWIN_PERCENTILE / 100) * last))];
  return { version: 1, knots, twinPercentile: TWIN_PERCENTILE, twinCosine };
}
