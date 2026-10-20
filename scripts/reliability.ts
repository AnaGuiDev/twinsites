/**
 * How often each detector agrees with the blind labels in quality/, on the
 * traits stored in catalog.json. Writes quality/reliability.json, which the
 * report and the FAQ figures come from. Run it after any detector change.
 *
 *   npm run reliability
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Catalog, Traits } from "../src/types";

interface Label {
  slug: string;
  ground: "light" | "dark" | null;
  centered: boolean | null;
  gradient: boolean | null;
  density: "airy" | "balanced" | "packed" | null;
  bento: boolean | null;
}

const file = "quality/labels-2026-10-20.json";
const { labels, date } = JSON.parse(readFileSync(file, "utf8")) as { labels: Label[]; date: string };
const catalog = JSON.parse(readFileSync("public/data/catalog.json", "utf8")) as Catalog;
const traits = new Map(catalog.sites.map((site) => [site.slug, site.traits as Traits]));

/** Wilson 95% interval for k successes in n. */
function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const den = 1 + (z * z) / n;
  const mid = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(mid - half) / den, (mid + half) / den];
}
const r3 = (value: number) => Math.round(value * 1000) / 1000;

function score<T>(name: string, human: (label: Label) => T | null, detector: (t: Traits) => T, positive?: T) {
  const pairs = labels
    .map((label) => [human(label), detector(traits.get(label.slug)!)] as const)
    .filter((pair): pair is readonly [T, T] => pair[0] !== null);
  const agree = pairs.filter(([h, d]) => h === d).length;
  const [lo, hi] = wilson(agree, pairs.length);
  const row: Record<string, number | null> = { n: pairs.length, agree: r3(agree / pairs.length), lo: r3(lo), hi: r3(hi) };
  if (positive !== undefined) {
    const tp = pairs.filter(([h, d]) => h === positive && d === positive).length;
    const fp = pairs.filter(([h, d]) => h !== positive && d === positive).length;
    const fn = pairs.filter(([h, d]) => h === positive && d !== positive).length;
    row.humanPositive = tp + fn;
    row.detectorPositive = tp + fp;
    row.precision = tp + fp ? r3(tp / (tp + fp)) : null;
    row.recall = tp + fn ? r3(tp / (tp + fn)) : null;
    const [plo, phi] = wilson(tp + fn, pairs.length);
    row.humanShare = r3((tp + fn) / pairs.length);
    row.humanShareLo = r3(plo);
    row.humanShareHi = r3(phi);
  }
  console.log(
    `${name.padEnd(9)} n=${String(row.n).padStart(3)} agree ${(row.agree! * 100).toFixed(1)}% (95% ${Math.round(row.lo! * 100)}–${Math.round(row.hi! * 100)}%)` +
      (positive !== undefined ? `  precision ${row.precision === null ? "–" : Math.round(row.precision * 100) + "%"} recall ${row.recall === null ? "–" : Math.round(row.recall * 100) + "%"}` : ""),
  );
  return row;
}

const result = {
  date,
  labels: file,
  ground: score("ground", (l) => l.ground, (t) => t.mode, "dark"),
  centered: score("centered", (l) => l.centered, (t) => t.centered, true),
  gradient: score("gradient", (l) => l.gradient, (t) => t.gradient, true),
  density: score("density", (l) => l.density, (t) => t.density),
  bento: score("bento", (l) => l.bento, (t) => t.bento, true),
};
writeFileSync("quality/reliability.json", JSON.stringify(result, null, 1));
