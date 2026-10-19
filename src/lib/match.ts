import { KIN_BANDS, percentileOf } from "./calibrate";
import type { Dataset, Twin } from "../types";

export function dotAt(vector: Float32Array, embeddings: Float32Array, index: number, dim: number): number {
  const offset = index * dim;
  let sum = 0;
  for (let d = 0; d < dim; d++) sum += vector[d] * embeddings[offset + d];
  return sum;
}

export function nearest(vector: Float32Array, dataset: Dataset, k: number): Twin[] {
  const { embeddings, dim, catalog } = dataset;
  const n = catalog.sites.length;
  const best: Twin[] = [];
  for (let i = 0; i < n; i++) {
    const similarity = dotAt(vector, embeddings, i, dim);
    if (best.length < k) {
      best.push({ site: catalog.sites[i], index: i, similarity });
      if (best.length === k) best.sort((a, b) => a.similarity - b.similarity);
      continue;
    }
    if (similarity <= best[0].similarity) continue;
    best[0] = { site: catalog.sites[i], index: i, similarity };
    best.sort((a, b) => a.similarity - b.similarity);
  }
  best.sort((a, b) => b.similarity - a.similarity);
  return best;
}

/**
 * How many sites clear each kin band. Counts are cumulative: p80 includes p99.
 * The test uses the unrounded percentile, so 98.5 does not count as the top 1%.
 */
export function countBands(vector: Float32Array, dataset: Dataset): Map<number, number> {
  const counts = new Map<number, number>(KIN_BANDS.map((band) => [band, 0]));
  const knots = dataset.calibration.knots;
  for (let i = 0; i < dataset.catalog.sites.length; i++) {
    const percentile = percentileOf(dotAt(vector, dataset.embeddings, i, dataset.dim), knots);
    for (const band of KIN_BANDS) {
      if (percentile >= band) counts.set(band, (counts.get(band) ?? 0) + 1);
    }
  }
  return counts;
}

export function countAtLeast(vector: Float32Array, dataset: Dataset, threshold: number): number {
  const { embeddings, dim, catalog } = dataset;
  let count = 0;
  for (let i = 0; i < catalog.sites.length; i++) {
    if (dotAt(vector, embeddings, i, dim) >= threshold) count++;
  }
  return count;
}

export function placeUser(
  vector: Float32Array,
  dataset: Dataset,
): { x: number; y: number; cluster: number } {
  const neighbors = nearest(vector, dataset, 18);
  if (!neighbors.length) return { x: 0.5, y: 0.5, cluster: 0 };
  if (neighbors[0].similarity > 0.975) {
    return {
      x: clamp(neighbors[0].site.x + 0.014, 0.03, 0.97),
      y: clamp(neighbors[0].site.y - 0.014, 0.03, 0.97),
      cluster: neighbors[0].site.cluster,
    };
  }
  let weightSum = 0;
  let x = 0;
  let y = 0;
  const votes = new Map<number, number>();
  for (const neighbor of neighbors) {
    const weight = Math.pow(Math.max(0, neighbor.similarity), 3);
    weightSum += weight;
    x += neighbor.site.x * weight;
    y += neighbor.site.y * weight;
    votes.set(neighbor.site.cluster, (votes.get(neighbor.site.cluster) ?? 0) + weight);
  }
  let cluster = neighbors[0].site.cluster;
  let best = -1;
  for (const [id, weight] of votes) {
    if (weight > best) {
      best = weight;
      cluster = id;
    }
  }
  return {
    x: clamp(weightSum ? x / weightSum : 0.5, 0.03, 0.97),
    y: clamp(weightSum ? y / weightSum : 0.5, 0.03, 0.97),
    cluster,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function percent(similarity: number): number {
  return Math.max(0, Math.min(100, Math.round(similarity * 100)));
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
