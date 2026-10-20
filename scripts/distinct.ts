/**
 * The pages that look like nobody: for each catalog category, the sites with
 * the fewest twins in the top 20% of catalog pairs. Blank, broken or nearly
 * empty screenshots are left out so the list is something to learn from.
 *
 *   npm run dataset:distinct
 */
import { readFile, writeFile } from "node:fs/promises";

interface CatalogSite {
  slug: string;
  title: string;
  url: string;
  thumb: string;
  category: string;
  traits: { edge: number; whitespace: number; luminance: number };
}

const PER_CATEGORY = 8;

const catalog = JSON.parse(await readFile("public/data/catalog.json", "utf8")) as { sites: CatalogSite[] };
const explore = JSON.parse(await readFile("public/data/explore.json", "utf8")) as {
  sites: { slug: string }[];
  bands: number[][];
};
const row = new Map(explore.sites.map((site, index) => [site.slug, index]));

// Almost no edges, mostly empty white or near black: a blank, a loading screen
// or a bare form, not a design to learn from. Too many edges: a cluttered dump.
const usable = (site: CatalogSite) =>
  site.traits.edge >= 0.035 && site.traits.edge <= 0.22 && site.traits.whitespace <= 0.85 && site.traits.luminance >= 0.06;

const categories: Record<string, { slug: string; title: string; url: string; thumb: string; twins: number }[]> = {};
for (const site of catalog.sites) {
  const index = row.get(site.slug);
  if (index === undefined || !usable(site)) continue;
  const bands = explore.bands[index];
  // Twins in the top 20% (the last band), then the top 10% to break ties.
  const twins = bands[bands.length - 1] ?? 0;
  const list = categories[site.category] ?? (categories[site.category] = []);
  list.push({ slug: site.slug, title: site.title, url: site.url, thumb: site.thumb, twins: twins * 10000 + (bands[3] ?? 0) });
}
for (const key of Object.keys(categories)) {
  categories[key] = categories[key]
    .sort((a, b) => a.twins - b.twins)
    .slice(0, PER_CATEGORY)
    .map((site) => ({ ...site, twins: Math.floor(site.twins / 10000) }));
}
await writeFile("public/data/distinct.json", JSON.stringify({ categories }));

// Catalog results read sites from explore.json; give them their category too,
// so the result can open on the right one.
const bySlug = new Map(catalog.sites.map((site) => [site.slug, site.category]));
const exploreFull = JSON.parse(await readFile("public/data/explore.json", "utf8")) as { sites: { slug: string; cat?: string }[] };
for (const site of exploreFull.sites) site.cat = bySlug.get(site.slug) ?? "other";
await writeFile("public/data/explore.json", JSON.stringify(exploreFull));
console.log(
  Object.entries(categories)
    .map(([key, list]) => `${key}: ${list.map((site) => site.twins).join(",")}`)
    .join("\n"),
);
