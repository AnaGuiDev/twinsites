import type { Calibration, Catalog, Dataset } from "../types";

const MAGIC = "TWEM";

export async function loadDataset(): Promise<Dataset> {
  const base = import.meta.env.BASE_URL;
  const [catalogRes, binRes, calibrationRes] = await Promise.all([
    fetch(`${base}data/catalog.json`),
    fetch(`${base}data/embeddings.bin`),
    fetch(`${base}data/calibration.json`),
  ]);
  if (!catalogRes.ok || !binRes.ok || !calibrationRes.ok) {
    throw new Error("catalog-missing");
  }
  const catalog = (await catalogRes.json()) as Catalog;
  const calibration = (await calibrationRes.json()) as Calibration;
  const buffer = await binRes.arrayBuffer();
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== MAGIC) throw new Error("bad-embeddings");
  const dim = view.getUint32(8, true);
  const count = view.getUint32(12, true);
  if (dim !== catalog.dim || count !== catalog.sites.length) {
    throw new Error("catalog-mismatch");
  }
  const embeddings = new Float32Array(buffer, 16, count * dim);
  return { catalog, embeddings, dim, calibration };
}
