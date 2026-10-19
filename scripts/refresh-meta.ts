import { readFile, writeFile } from "node:fs/promises";
import { labelZones } from "../src/lib/labels.ts";
import type { Traits } from "../src/types.ts";
import { buildCalibration } from "./calibration.ts";

const catalog = JSON.parse(await readFile("public/data/catalog.json", "utf8")) as {
  clusters: { id: number; labelEn: string; labelEs: string }[];
  sites: { cluster: number; traits: Traits }[];
};
const ids = [...new Set(catalog.sites.map((site) => site.cluster))].sort((a, b) => a - b);
const groups = ids.map((id) => catalog.sites.filter((site) => site.cluster === id).map((site) => site.traits));
const labels = labelZones(groups);
const byId = new Map(ids.map((id, index) => [id, labels[index]]));
for (const cluster of catalog.clusters) {
  const label = byId.get(cluster.id);
  if (!label) continue;
  cluster.labelEn = label.en;
  cluster.labelEs = label.es;
  console.log(cluster.id, label.en, "|", label.es);
}
await writeFile("public/data/catalog.json", JSON.stringify(catalog));

const bin = await readFile("public/data/embeddings.bin");
const count = bin.readUInt32LE(12);
const dim = bin.readUInt32LE(8);
const aligned = new Uint8Array(bin.subarray(16));
const rows = new Float32Array(aligned.buffer, aligned.byteOffset, count * dim);
const calibration = buildCalibration(rows, count, dim);
await writeFile("public/data/calibration.json", JSON.stringify(calibration));
console.log("twinCosine", calibration.twinCosine, "knots", calibration.knots.length);
