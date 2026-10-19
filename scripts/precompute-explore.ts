/**
 * Twins of catalog sites, from the stored embeddings. No model, no Chrome.
 * A catalog page is not counted as its own twin.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { KIN_BANDS, judgeKin, percentileOf } from "../src/lib/calibrate";
import { zoneSlug, type ZoneRecord } from "../src/lib/zones";
import type { Catalog, ColorName, Site } from "../src/types";

const catalog = JSON.parse(readFileSync("public/data/catalog.json", "utf8")) as Catalog;
const calibration = JSON.parse(readFileSync("public/data/calibration.json", "utf8")) as { knots: number[] };
const raw = readFileSync("public/data/embeddings.bin");
const dim = raw.readUInt32LE(8);
const count = raw.readUInt32LE(12);
if (count !== catalog.sites.length || dim !== catalog.dim) throw new Error("catalog-mismatch");
const aligned = new ArrayBuffer(count * dim * 4);
new Uint8Array(aligned).set(raw.subarray(16, 16 + count * dim * 4));
const embeddings = new Float32Array(aligned);
const knots = calibration.knots;
const bands = KIN_BANDS;

interface Slot {
  j: number;
  s: number;
  p: number;
}

const neighbors: [number, number][][] = [];
const bandCounts: number[][] = [];

for (let i = 0; i < count; i++) {
  const off = i * dim;
  const best: Slot[] = [];
  const tally = bands.map(() => 0);
  for (let j = 0; j < count; j++) {
    if (j === i) continue;
    const offj = j * dim;
    let sum = 0;
    for (let d = 0; d < dim; d++) sum += embeddings[off + d] * embeddings[offj + d];
    const percentile = percentileOf(sum, knots);
    for (let b = 0; b < bands.length; b++) {
      if (percentile >= bands[b]) tally[b] += 1;
    }
    const slot = { j, s: sum, p: percentile };
    if (best.length < 12) {
      best.push(slot);
      if (best.length === 12) best.sort((a, b) => a.s - b.s);
    } else if (sum > best[0].s) {
      best[0] = slot;
      best.sort((a, b) => a.s - b.s);
    }
  }
  best.sort((a, b) => b.s - a.s);
  neighbors.push(best.map((slot) => [slot.j, Math.round(slot.p * 10)]));
  bandCounts.push(tally);
  if (i % 250 === 0) console.log("neighbors", i, "/", count);
}

const byCluster = new Map<number, Site[]>();
for (const site of catalog.sites) {
  const list = byCluster.get(site.cluster) ?? [];
  list.push(site);
  byCluster.set(site.cluster, list);
}

const zones: ZoneRecord[] = catalog.clusters.map((cluster) => {
  const members = byCluster.get(cluster.id) ?? [];
  const n = members.length || 1;
  const share = (pred: (site: Site) => boolean) => members.filter(pred).length / n;
  const colors = new Map<ColorName, number>();
  for (const site of members) colors.set(site.traits.dominantName, (colors.get(site.traits.dominantName) ?? 0) + 1);
  let topColor: ColorName = "neutral";
  let topN = -1;
  for (const [name, hits] of colors) {
    if (hits > topN) {
      topN = hits;
      topColor = name;
    }
  }
  const examples = [...members]
    .sort((a, b) => {
      const da = (a.x - cluster.x) ** 2 + (a.y - cluster.y) ** 2;
      const db = (b.x - cluster.x) ** 2 + (b.y - cluster.y) ** 2;
      return da - db;
    })
    .slice(0, 4)
    .map((site) => site.slug);
  return {
    id: cluster.id,
    slug: zoneSlug(cluster.labelEn),
    labelEn: cluster.labelEn,
    labelEs: cluster.labelEs,
    x: cluster.x,
    y: cluster.y,
    r: cluster.r,
    color: cluster.color,
    size: members.length,
    dark: round(share((site) => site.traits.mode === "dark")),
    airy: round(share((site) => site.traits.density === "airy")),
    packed: round(share((site) => site.traits.density === "packed")),
    gradient: round(share((site) => site.traits.gradient)),
    bento: round(share((site) => site.traits.bento)),
    centered: round(share((site) => site.traits.centered)),
    topColor,
    examples,
  };
});

const slugs = new Set<string>();
for (const zone of zones) {
  if (slugs.has(zone.slug)) throw new Error(`duplicate zone slug ${zone.slug}`);
  slugs.add(zone.slug);
}

const sites = catalog.sites.map((site) => ({
  slug: site.slug,
  title: site.title,
  url: site.url,
  cluster: site.cluster,
  thumb: site.thumb,
  x: round(site.x, 4),
  y: round(site.y, 4),
  mode: site.traits.mode,
  density: site.traits.density,
  gradient: site.traits.gradient,
  bento: site.traits.bento,
  centered: site.traits.centered,
  dominant: site.traits.dominant,
  dominantName: site.traits.dominantName,
  hue: site.traits.hue,
}));

const explore = { zones, sites, neighbors, bands: bandCounts };
writeFileSync("public/data/explore.json", JSON.stringify(explore));

const featured = pickExample();
const featuredIndex = catalog.sites.findIndex((site) => site.slug === featured.slug);
const verdict = judgeKin(new Map(bands.map((band, index) => [band, bandCounts[featuredIndex][index]])));
const zone = zones.find((item) => item.id === featured.cluster);
if (!zone) throw new Error("zone");
const example = {
  slug: featured.slug,
  zone,
  verdict,
  subject: sites[featuredIndex],
  twins: neighbors[featuredIndex].map(([index, tenths]) => ({
    percentile: tenths / 10,
    site: sites[index],
  })),
};
writeFileSync("public/data/example.json", JSON.stringify(example));
console.log("example", featured.slug, featured.title, verdict.mode, verdict.count, "top", verdict.top);
console.log("explore bytes", Buffer.byteLength(JSON.stringify(explore)), "example bytes", Buffer.byteLength(JSON.stringify(example)));

function pickExample(): Site {
  const ranked = catalog.sites
    .map((site, index) => ({ site, index }))
    .filter(({ site }) => site.url.includes("lovable.app"))
    .map(({ site, index }) => {
      const verdict = judgeKin(new Map(bands.map((band, bandIndex) => [band, bandCounts[index][bandIndex]])));
      const zone = zones.find((item) => item.id === site.cluster);
      let score = 0;
      if (verdict.mode === "twins") score += 80 - Math.abs(verdict.count - 14);
      if ((zone?.centered ?? 0) >= 0.5) score += 15;
      if ((zone?.dark ?? 1) <= 0.55) score += 10;
      if (site.title.includes("—") || site.title.includes(" - ")) score += 4;
      return { site, score, verdict };
    })
    .sort((a, b) => b.score - a.score);
  console.log(
    "candidates",
    ranked.slice(0, 5).map((item) => `${item.site.slug} ${item.verdict.mode}:${item.verdict.count} ${item.score}`),
  );
  return ranked[0].site;
}

function round(value: number, digits = 2): number {
  const span = 10 ** digits;
  return Math.round(value * span) / span;
}
