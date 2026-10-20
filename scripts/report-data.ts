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
/** Agreement of each detector with the blind labels (npm run reliability). */
const reliability = JSON.parse(readFileSync("quality/reliability.json", "utf8")) as Record<
  "ground" | "centered" | "gradient" | "density" | "bento",
  { n: number; agree: number; precision?: number | null; humanShare?: number; humanShareLo?: number; humanShareHi?: number }
>;

const sites = catalog.sites;
const total = sites.length;
const share = (count: number) => Math.round((count / total) * 1000) / 10;
const traits = sites.map((site) => site.traits);

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
  // Only traits that held up against the labels. The ground detector agrees
  // 99%, so the whole catalog is counted; centring is taken from the labelled
  // sample itself, since the detector misses some centred pages.
  ground: { light: share(count((t) => t.mode === "light")), dark: share(count((t) => t.mode === "dark")) },
  centred: {
    share: Math.round((reliability.centered.humanShare ?? 0) * 1000) / 10,
    lo: Math.round((reliability.centered.humanShareLo ?? 0) * 100),
    hi: Math.round((reliability.centered.humanShareHi ?? 0) * 100),
    n: reliability.centered.n,
  },
  reliability: {
    sample: 200,
    ground: Math.round(reliability.ground.agree * 100),
    centred: Math.round(reliability.centered.agree * 100),
    centredPrecision: Math.round((reliability.centered.precision ?? 0) * 100),
    density: Math.round(reliability.density.agree * 100),
    gradientPrecision: Math.round((reliability.gradient.precision ?? 0) * 100),
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
  `report: top-1% twin ${report.twins.top1Any}%, light ${report.ground.light}%, centred ~${report.centred.share}% (sample), ${report.zones.count} zones, phrases read on ${copy.withText}`,
);
