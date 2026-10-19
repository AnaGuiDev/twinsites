/**
 * PCA + UMAP, cluster labels, and the static files the site serves.
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { Matrix, EigenvalueDecomposition } from "ml-matrix";
import { UMAP } from "umap-js";
import type { Cluster, Site, Traits } from "../src/types.ts";
import { labelZones } from "../src/lib/labels.ts";

interface Item {
  slug: string;
  title: string;
  url: string;
  category: string;
  blurb: string;
  traits: Traits;
  shot: string;
  thumb: string;
}

const ROOT = process.cwd();
const RAW = path.join(ROOT, "data", "raw");
const OUT = path.join(ROOT, "public", "data");

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

function pca(rows: Float32Array, count: number, dim: number, k: number): number[][] {
  const mean = new Float64Array(dim);
  for (let i = 0; i < count; i++) {
    for (let d = 0; d < dim; d++) mean[d] += rows[i * dim + d];
  }
  for (let d = 0; d < dim; d++) mean[d] /= count;

  const covData = new Float64Array(dim * dim);
  for (let n = 0; n < count; n++) {
    const base = n * dim;
    for (let i = 0; i < dim; i++) {
      const di = rows[base + i] - mean[i];
      const row = i * dim;
      for (let j = i; j < dim; j++) covData[row + j] += di * (rows[base + j] - mean[j]);
    }
  }
  const cov = Matrix.zeros(dim, dim);
  const scale = 1 / Math.max(1, count - 1);
  for (let i = 0; i < dim; i++) {
    for (let j = i; j < dim; j++) {
      const value = covData[i * dim + j] * scale;
      cov.set(i, j, value);
      if (i !== j) cov.set(j, i, value);
    }
  }
  const eig = new EigenvalueDecomposition(cov, { assumeSymmetric: true });
  const values = eig.realEigenvalues;
  const vectors = eig.eigenvectorMatrix;
  const order = [...values.keys()].sort((a, b) => values[b] - values[a]).slice(0, k);
  const projected: number[][] = [];
  for (let n = 0; n < count; n++) {
    const coords = new Array<number>(k);
    for (let c = 0; c < k; c++) {
      let sum = 0;
      const column = order[c];
      for (let d = 0; d < dim; d++) sum += (rows[n * dim + d] - mean[d]) * vectors.get(d, column);
      coords[c] = sum;
    }
    projected.push(coords);
  }
  return projected;
}

function kmeans(points: { x: number; y: number }[], k: number, random: () => number) {
  const centers = [{ ...points[Math.floor(random() * points.length)] }];
  while (centers.length < k) {
    const dist = points.map((point) => {
      let best = Infinity;
      for (const center of centers) {
        best = Math.min(best, (point.x - center.x) ** 2 + (point.y - center.y) ** 2);
      }
      return best;
    });
    let cursor = random() * dist.reduce((a, b) => a + b, 0);
    let index = 0;
    for (; index < dist.length; index++) {
      cursor -= dist[index];
      if (cursor <= 0) break;
    }
    centers.push({ ...points[Math.min(index, points.length - 1)] });
  }
  let assign = new Array<number>(points.length).fill(0);
  for (let iter = 0; iter < 28; iter++) {
    assign = points.map((point) => {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((center, index) => {
        const d = (point.x - center.x) ** 2 + (point.y - center.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = index;
        }
      });
      return best;
    });
    for (let index = 0; index < k; index++) {
      const members = points.filter((_, pointIndex) => assign[pointIndex] === index);
      if (!members.length) continue;
      centers[index] = {
        x: members.reduce((sum, point) => sum + point.x, 0) / members.length,
        y: members.reduce((sum, point) => sum + point.y, 0) / members.length,
      };
    }
  }
  return { assign, centers };
}

function unit(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((value) => 0.05 + (0.9 * (value - min)) / span);
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0.06;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[index];
}

async function main(): Promise<void> {
  const items = JSON.parse(await readFile(path.join(RAW, "embedded.json"), "utf8")) as Item[];
  const buf = await readFile(path.join(RAW, "vectors.f32"));
  const meta = JSON.parse(await readFile(path.join(RAW, "embed-meta.json"), "utf8")) as { dim: number; count: number };
  const vectors = new Float32Array(buf.buffer, buf.byteOffset, meta.count * meta.dim);
  console.log(`projecting ${meta.count} x ${meta.dim}`);
  const reduced = pca(vectors, meta.count, meta.dim, 32);
  console.log("pca done, umap…");
  const random = mulberry32(20261019);
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: 15,
    minDist: 0.12,
    nEpochs: meta.count > 1200 ? 200 : 250,
    random,
  });
  const embedding = umap.fit(reduced);
  const xs = unit(embedding.map((row) => row[0]));
  const ys = unit(embedding.map((row) => row[1]));
  const points = xs.map((x, index) => ({ x, y: ys[index] }));
  const k = Math.max(8, Math.min(16, Math.round(Math.sqrt(meta.count / 8))));
  const { assign, centers } = kmeans(points, k, mulberry32(7));

  await rm(path.join(OUT, "thumbs"), { recursive: true, force: true });
  await mkdir(path.join(OUT, "thumbs"), { recursive: true });

  const sites: Site[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const id = String(index + 1).padStart(4, "0");
    const thumb = `thumbs/${id}.webp`;
    const png = path.join(RAW, "shots", `${item.slug}.png`);
    await sharp(png)
      .resize({ width: 420, withoutEnlargement: true })
      .webp({ quality: 58, effort: 4 })
      .toFile(path.join(OUT, thumb));
    sites.push({
      id,
      slug: item.slug,
      title: item.title,
      url: item.url,
      category: item.category,
      blurb: item.blurb,
      x: round(points[index].x),
      y: round(points[index].y),
      cluster: assign[index],
      thumb,
      traits: item.traits,
    });
  }

  const clusterIds: number[] = [];
  const groups = [];
  for (let id = 0; id < k; id++) {
    const members = sites.filter((site) => site.cluster === id);
    if (members.length < 4) continue;
    clusterIds.push(id);
    groups.push(members);
  }
  const zoneLabels = labelZones(groups.map((members) => members.map((site) => site.traits)));
  const clusters: Cluster[] = clusterIds.map((id, index) => {
    const members = groups[index];
    const distances = members.map((site) => Math.hypot(site.x - centers[id].x, site.y - centers[id].y));
    const color = members.map((site) => site.traits.dominant).sort()[Math.floor(members.length / 2)] || "#f4efe4";
    return {
      id,
      labelEn: zoneLabels[index].en,
      labelEs: zoneLabels[index].es,
      x: round(centers[id].x),
      y: round(centers[id].y),
      r: round(Math.max(0.045, percentile(distances, 0.72))),
      color,
    };
  });

  const header = Buffer.alloc(16);
  header.write("TWEM", 0, "ascii");
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(meta.dim, 8);
  header.writeUInt32LE(meta.count, 12);
  const body = Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength);
  await writeFile(path.join(OUT, "embeddings.bin"), Buffer.concat([header, body]));

  const catalog = {
    version: 1,
    model: "Xenova/mobileclip_s0",
    dtype: "q8",
    dim: meta.dim,
    generated: new Date().toISOString(),
    count: sites.length,
    source: {
      name: "awesome-vibe-coded-apps",
      url: "https://github.com/JefferyLee/awesome-vibe-coded-apps",
      license: "CC0-1.0",
      retrieved: "2026-10-19",
    },
    clusters,
    sites,
  };
  await writeFile(path.join(OUT, "catalog.json"), JSON.stringify(catalog));

  let nearestSum = 0;
  const sample = Math.min(180, sites.length);
  const nn: number[] = [];
  for (let i = 0; i < sample; i++) {
    const index = Math.floor((i * sites.length) / sample);
    let best = -1;
    for (let j = 0; j < sites.length; j++) {
      if (j === index) continue;
      let dot = 0;
      for (let d = 0; d < meta.dim; d++) dot += vectors[index * meta.dim + d] * vectors[j * meta.dim + d];
      if (dot > best) best = dot;
    }
    nn.push(best);
    nearestSum += best;
  }
  nn.sort((a, b) => a - b);
  const stats = {
    count: sites.length,
    clusters: clusters.length,
    nearestMedian: nn[Math.floor(nn.length / 2)],
    nearestP90: nn[Math.floor(nn.length * 0.9)],
    meanNearest: nearestSum / sample,
  };
  await writeFile(path.join(OUT, "stats.json"), JSON.stringify(stats, null, 2));
  console.log(stats);
  console.log("labels", clusters.map((cluster) => cluster.labelEn).join(" | "));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
