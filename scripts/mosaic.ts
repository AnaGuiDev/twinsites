/**
 * Builds the home page mosaic: one WebP atlas of small catalog thumbnails
 * plus a JSON index. Tiles are a stratified sample across zones, ordered
 * along a Hilbert curve over the map, so neighbors in the strip look alike.
 *
 *   npm run dataset:mosaic
 */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const TILE_W = 240;
const TILE_H = 150;
const COLS = 12;
const COUNT = 192;

interface CatalogSite {
  slug: string;
  title: string;
  cluster: number;
  thumb: string;
  x: number;
  y: number;
}

const catalog = JSON.parse(await readFile("public/data/catalog.json", "utf8")) as { sites: CatalogSite[] };
const sites = catalog.sites;

// Stratified pick: each zone contributes in proportion to its size, spread over its own map extent.
const byZone = new Map<number, CatalogSite[]>();
for (const site of sites) {
  const list = byZone.get(site.cluster) ?? [];
  list.push(site);
  byZone.set(site.cluster, list);
}
const picked: CatalogSite[] = [];
for (const list of byZone.values()) {
  const quota = Math.max(1, Math.round((list.length / sites.length) * COUNT));
  const ordered = [...list].sort((a, b) => hilbert(a.x, a.y) - hilbert(b.x, b.y));
  const step = ordered.length / quota;
  for (let i = 0; i < quota && picked.length < COUNT; i++) picked.push(ordered[Math.floor(i * step)]);
}
picked.sort((a, b) => hilbert(a.x, a.y) - hilbert(b.x, b.y));

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

await writeFile(
  "public/data/mosaic.json",
  JSON.stringify({
    tile: [TILE_W, TILE_H],
    cols: COLS,
    rows,
    sites: picked.map((site) => ({ slug: site.slug, title: site.title })),
  }),
);
console.log(`mosaic: ${picked.length} tiles, ${COLS}×${rows}`);

/** Index of (x, y) in [0, 1]² along a 64×64 Hilbert curve. */
function hilbert(x: number, y: number): number {
  const n = 64;
  let xi = Math.min(n - 1, Math.max(0, Math.floor(x * n)));
  let yi = Math.min(n - 1, Math.max(0, Math.floor(y * n)));
  let d = 0;
  for (let s = n / 2; s > 0; s = Math.floor(s / 2)) {
    const rx = (xi & s) > 0 ? 1 : 0;
    const ry = (yi & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        xi = s - 1 - xi;
        yi = s - 1 - yi;
      }
      [xi, yi] = [yi, xi];
    }
  }
  return d;
}
