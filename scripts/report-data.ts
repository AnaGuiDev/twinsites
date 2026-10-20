/**
 * The numbers behind /report, from the files already in public/data. No model,
 * no Chrome; runs as part of `npm run build` after precompute-explore.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { KIN_BANDS } from "../src/lib/calibrate";
import { CLICHES } from "../src/lib/cliches";
import type { Catalog } from "../src/types";

const catalog = JSON.parse(readFileSync("public/data/catalog.json", "utf8")) as Catalog;
const explore = JSON.parse(readFileSync("public/data/explore.json", "utf8")) as {
  zones: { slug: string; labelEn: string; labelEs: string; size: number }[];
  sites: { slug: string }[];
  bands: number[][];
};
const copy = JSON.parse(readFileSync("public/data/copy.json", "utf8")) as { total: number; withText: number; counts: Record<string, number> };

const sites = catalog.sites;
const total = sites.length;
const share = (count: number) => Math.round((count / total) * 1000) / 10;
const traits = sites.map((site) => site.traits);

// Layout recipes: ground, density, centring, gradient.
const recipeCounts = new Map<string, number>();
for (const t of traits) {
  const key = [t.mode, t.density, t.centered ? "centered" : "offset", t.gradient ? "gradient" : "flat"].join(" ");
  recipeCounts.set(key, (recipeCounts.get(key) ?? 0) + 1);
}
const recipes = [...recipeCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([key, count]) => {
    const [mode, density, centring, wash] = key.split(" ");
    return { mode, density, centered: centring === "centered", gradient: wash === "gradient", count, share: share(count) };
  });
const topFour = recipes.slice(0, 4).reduce((sum, recipe) => sum + recipe.count, 0);

const count = (test: (t: (typeof traits)[number]) => boolean) => traits.filter(test).length;
const colorCounts = new Map<string, number>();
for (const t of traits) colorCounts.set(t.dominantName, (colorCounts.get(t.dominantName) ?? 0) + 1);

// Twins: how many other catalog pages sit above each pair-percentile bar.
const at = (band: number) => KIN_BANDS.indexOf(band as (typeof KIN_BANDS)[number]);
const p99 = at(99);
const p95 = at(95);
const bands = explore.bands;
const withTwin = (index: number, min: number) => bands.filter((row) => (row[index] ?? 0) >= min).length;

// Sameness by category: share of its pages with at least 8 twins in the top 5%.
const slugIndex = new Map(explore.sites.map((site, index) => [site.slug, index]));
const byCategory = new Map<string, { pages: number; crowded: number }>();
for (const site of sites) {
  const index = slugIndex.get(site.slug);
  if (index === undefined) continue;
  const entry = byCategory.get(site.category) ?? { pages: 0, crowded: 0 };
  entry.pages++;
  if ((bands[index][p95] ?? 0) >= 8) entry.crowded++;
  byCategory.set(site.category, entry);
}
const categories = [...byCategory.entries()]
  .map(([key, entry]) => ({ key, pages: entry.pages, crowded: Math.round((entry.crowded / entry.pages) * 1000) / 10 }))
  .sort((a, b) => b.crowded - a.crowded);

const zones = [...explore.zones].sort((a, b) => b.size - a.size);
const labels = new Map(CLICHES.map((cliche) => [cliche.id, cliche.label]));

const report = {
  generated: catalog.generated,
  total,
  recipes,
  topFourShare: share(topFour),
  traits: {
    light: share(count((t) => t.mode === "light")),
    dark: share(count((t) => t.mode === "dark")),
    airy: share(count((t) => t.density === "airy")),
    packed: share(count((t) => t.density === "packed")),
    centered: share(count((t) => t.centered)),
    gradient: share(count((t) => t.gradient)),
    bento: share(count((t) => t.bento)),
  },
  colors: [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, n]) => ({ name, share: share(n) })),
  twins: {
    top1Any: share(withTwin(p99, 1)),
    top5Any: share(withTwin(p95, 1)),
    top5Crowd: share(withTwin(p95, 8)),
  },
  zones: {
    count: zones.length,
    topFourShare: share(zones.slice(0, 4).reduce((sum, zone) => sum + zone.size, 0)),
    largest: zones.slice(0, 5).map((zone) => ({ slug: zone.slug, labelEn: zone.labelEn, labelEs: zone.labelEs, size: zone.size })),
  },
  categories,
  phrases: {
    read: copy.withText,
    top: Object.entries(copy.counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, n]) => ({ id, label: labels.get(id) ?? id, count: n })),
  },
};

writeFileSync("public/data/report.json", JSON.stringify(report));
console.log(
  `report: top 4 recipes ${report.topFourShare}%, top-1% twin ${report.twins.top1Any}%, ${report.zones.count} zones, phrases read on ${copy.withText}`,
);
