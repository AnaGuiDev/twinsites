/**
 * Recompute the two layout traits (centered, gradient) for every catalog site
 * from the committed thumbnails, with the same analyzePixels the browser runs,
 * and write them into catalog.json, explore.json (sites and zone shares) and
 * example.json. Zone names and slugs stay as they are, so shared links hold.
 *
 *   npm run dataset:layout
 */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { analyzePixels } from "../src/lib/analyze.ts";

interface Layout {
  centered: boolean;
  gradient: boolean;
}

const catalog = JSON.parse(await readFile("public/data/catalog.json", "utf8")) as {
  sites: { slug: string; thumb: string; cluster: number; traits: Layout & Record<string, unknown> }[];
};

const bySlug = new Map<string, Layout>();
let done = 0;
for (const site of catalog.sites) {
  const raw = await sharp(`public/data/${site.thumb}`)
    .resize(96, 60, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const traits = analyzePixels(raw.data, raw.info.width, raw.info.height, 3);
  site.traits.centered = traits.centered;
  site.traits.gradient = traits.gradient;
  bySlug.set(site.slug, { centered: traits.centered, gradient: traits.gradient });
  done++;
  if (done % 500 === 0) console.log(`layout ${done}/${catalog.sites.length}`);
}
await writeFile("public/data/catalog.json", JSON.stringify(catalog));

const explore = JSON.parse(await readFile("public/data/explore.json", "utf8")) as {
  zones: { id: number; size: number; centered: number; gradient: number }[];
  sites: ({ slug: string; cluster: number } & Layout)[];
};
for (const site of explore.sites) Object.assign(site, bySlug.get(site.slug));
for (const zone of explore.zones) {
  const members = explore.sites.filter((site) => site.cluster === zone.id);
  const share = (key: keyof Layout) => Math.round((members.filter((site) => site[key]).length / Math.max(1, members.length)) * 1000) / 1000;
  zone.centered = share("centered");
  zone.gradient = share("gradient");
}
await writeFile("public/data/explore.json", JSON.stringify(explore));

const example = JSON.parse(await readFile("public/data/example.json", "utf8")) as {
  subject: { slug: string } & Layout;
  twins: { site: { slug: string } & Layout }[];
};
Object.assign(example.subject, bySlug.get(example.subject.slug));
for (const twin of example.twins) Object.assign(twin.site, bySlug.get(twin.site.slug));
await writeFile("public/data/example.json", JSON.stringify(example));

const centered = [...bySlug.values()].filter((value) => value.centered).length;
const gradient = [...bySlug.values()].filter((value) => value.gradient).length;
console.log(`updated ${bySlug.size} sites: ${centered} centered, ${gradient} gradient`);
