/**
 * Builds the home page mosaic: one WebP atlas of small catalog thumbnails
 * plus a JSON index. The wall is built from real twin families (a seed from
 * each zone plus its five closest catalog twins), shuffled with a fixed seed.
 * The index carries each tile's look-alikes on the wall (pairs in the top 10%
 * of the catalog) and the verdict that tile gets against the whole catalog.
 *
 *   npm run dataset:mosaic
 */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { judgeKin, KIN_BANDS, percentileOf } from "../src/lib/calibrate.ts";

const TILE_W = 240;
const TILE_H = 150;
const COLS = 12;
const COUNT = 192;

interface CatalogSite {
  slug: string;
  title: string;
  cluster: number;
  thumb: string;
}

const catalog = JSON.parse(await readFile("public/data/catalog.json", "utf8")) as { sites: CatalogSite[] };
const sites = catalog.sites;
const explore = JSON.parse(await readFile("public/data/explore.json", "utf8")) as {
  zones: { id: number; slug: string; labelEn: string; labelEs: string }[];
  sites: { slug: string }[];
  bands: number[][];
};
const bin = await readFile("public/data/embeddings.bin");
const dim = bin.readUInt32LE(8);
const rowsAll = new Float32Array(new Uint8Array(bin.subarray(16)).buffer);

const indexBySlug = new Map(sites.map((site, index) => [site.slug, index]));
const vecAt = (row: number) => rowsAll.subarray(row * dim, (row + 1) * dim);
const dot = (a: Float32Array, b: Float32Array) => {
  let sum = 0;
  for (let d = 0; d < dim; d++) sum += a[d] * b[d];
  return sum;
};

// Nearest catalog neighbours for every site (top 8), from the full catalog.
const nearest = sites.map((_, i) => {
  const a = vecAt(i);
  const best: [number, number][] = [];
  for (let j = 0; j < sites.length; j++) {
    if (j === i) continue;
    const sim = dot(a, vecAt(j));
    if (best.length < 8 || sim > best[best.length - 1][1]) {
      best.push([j, sim]);
      best.sort((x, y) => y[1] - x[1]);
      if (best.length > 8) best.pop();
    }
  }
  return best;
});

// The wall is made of real families: seeds spread across zones, each with its
// five closest catalog twins. Seeds with the tightest families go first so the
// demo shows likeness people can see at a glance.
const byZone = new Map<number, number[]>();
sites.forEach((site, index) => {
  const list = byZone.get(site.cluster) ?? [];
  list.push(index);
  byZone.set(site.cluster, list);
});
const tightness = (i: number) => nearest[i][4]?.[1] ?? 0;
const queues = [...byZone.values()].map((list) => [...list].sort((a, b) => tightness(b) - tightness(a)));
const taken = new Set<number>();
const pickedRows: number[] = [];
let round = 0;
while (pickedRows.length < COUNT && round < 50) {
  for (const queue of queues) {
    if (pickedRows.length >= COUNT) break;
    let seed = queue.shift();
    while (seed !== undefined && taken.has(seed)) seed = queue.shift();
    if (seed === undefined) continue;
    const family = [seed, ...nearest[seed].map(([j]) => j).filter((j) => !taken.has(j)).slice(0, 5)];
    if (family.length < 4) continue;
    for (const row of family) {
      if (pickedRows.length >= COUNT) break;
      taken.add(row);
      pickedRows.push(row);
    }
  }
  round++;
}
const picked = pickedRows.map((row) => sites[row]);
// A seeded shuffle: twins land far apart on the wall, so when they light up
// together the likeness is plainly not about position.
let seedState = 20261020;
const rand = () => ((seedState = (seedState * 1664525 + 1013904223) >>> 0) / 2 ** 32);
for (let i = picked.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [picked[i], picked[j]] = [picked[j], picked[i]];
}

const rows = Math.ceil(picked.length / COLS);
const tiles = await Promise.all(
  picked.map(async (site, index) => ({
    input: await sharp(`public/data/${site.thumb}`)
      .resize(TILE_W, TILE_H, { fit: "cover", position: "top" })
      .toBuffer(),
    left: (index % COLS) * TILE_W,
    top: Math.floor(index / COLS) * TILE_H,
  })),
);
await sharp({
  create: { width: COLS * TILE_W, height: rows * TILE_H, channels: 3, background: "#e8e8e8" },
})
  .composite(tiles)
  .webp({ quality: 58, effort: 6 })
  .toFile("public/data/mosaic.webp");

// For the live demo on the wall: each tile's nearest look-alikes among the
// other tiles, and the verdict that tile gets against the whole catalog.
const exploreBySlug = new Map(explore.sites.map((site, index) => [site.slug, index]));
const zoneIndex = new Map(explore.zones.map((zone, index) => [zone.id, index]));
const calibration = JSON.parse(await readFile("public/data/calibration.json", "utf8")) as { knots: number[] };
const vectors = picked.map((site) => vecAt(indexBySlug.get(site.slug)!));
// Only pairs in the top 10% of all catalog pairs count as look-alikes here.
const near = vectors.map((a, i) =>
  vectors
    .map((b, j) => [j, percentileOf(dot(a, b), calibration.knots)] as const)
    .filter(([j, pct]) => j !== i && pct >= 90)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 8)
    .map(([j]) => j),
);
const modeCode = { twins: 0, neighborhood: 1, none: 2 } as const;
const tilesMeta = picked.map((site) => {
  const e = exploreBySlug.get(site.slug)!;
  const counts = new Map(KIN_BANDS.map((band, b) => [band, explore.bands[e][b] ?? 0]));
  const verdict = judgeKin(counts);
  return {
    slug: site.slug,
    title: site.title,
    z: zoneIndex.get(site.cluster) ?? 0,
    v: [modeCode[verdict.mode], verdict.top, verdict.count],
  };
});

await writeFile(
  "public/data/mosaic.json",
  JSON.stringify({
    tile: [TILE_W, TILE_H],
    cols: COLS,
    rows,
    zones: explore.zones.map((zone) => ({ slug: zone.slug, en: zone.labelEn, es: zone.labelEs })),
    sites: tilesMeta,
    near,
  }),
);
console.log(`mosaic: ${picked.length} tiles, ${COLS}×${rows}`);
