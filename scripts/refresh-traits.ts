/** Recompute visual traits from saved screenshots. Embeddings stay put. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { analyzePixels } from "../src/lib/analyze.ts";
import type { Traits } from "../src/types.ts";

interface Item {
  slug: string;
  traits: Traits;
  [key: string]: unknown;
}

const RAW = path.join(process.cwd(), "data", "raw");
const items = JSON.parse(await readFile(path.join(RAW, "embedded.json"), "utf8")) as Item[];
let done = 0;
for (const item of items) {
  const png = path.join(RAW, "shots", `${item.slug}.png`);
  const resized = await sharp(png).resize(96, 60, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  item.traits = analyzePixels(resized.data, resized.info.width, resized.info.height, 3);
  done++;
  if (done % 400 === 0) console.log(`traits ${done}/${items.length}`);
}
await writeFile(path.join(RAW, "embedded.json"), JSON.stringify(items));
console.log(`updated ${items.length}`);
