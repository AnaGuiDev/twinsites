import type { Calibration, Catalog, Dataset } from "../types";

const MAGIC = "TWEM";

let pending: Promise<Dataset> | null = null;
let fraction = 0;
const listeners = new Set<(value: number) => void>();

function emit(): void {
  for (const listener of listeners) listener(fraction);
}

export function subscribeData(listener: (value: number) => void): () => void {
  listeners.add(listener);
  listener(fraction);
  return () => listeners.delete(listener);
}

async function readBody(response: Response, onLoaded: (bytes: number) => void): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    onLoaded(buffer.byteLength);
    return buffer;
  }
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onLoaded(loaded);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

async function fetchDataset(): Promise<Dataset> {
  const base = import.meta.env.BASE_URL;
  const responses = await Promise.all([
    fetch(`${base}data/catalog.json`),
    fetch(`${base}data/embeddings.f16.bin`),
    fetch(`${base}data/calibration.json`),
  ]);
  if (responses.some((response) => !response.ok)) throw new Error("catalog-missing");
  const loaded = [0, 0, 0];
  // Stored sizes from the build: with gzip, content-length is the compressed
  // size while the stream yields decompressed bytes.
  const expected = __DATA_BYTES__.reduce((sum, bytes) => sum + bytes, 0);
  const report = () => {
    if (expected <= 0) return;
    const got = loaded.reduce((sum, bytes) => sum + bytes, 0);
    fraction = Math.min(1, got / expected);
    emit();
  };
  const buffers = await Promise.all(
    responses.map((response, index) =>
      readBody(response, (bytes) => {
        loaded[index] = bytes;
        report();
      }),
    ),
  );
  fraction = 1;
  emit();
  const catalog = JSON.parse(new TextDecoder().decode(buffers[0])) as Catalog;
  const calibration = JSON.parse(new TextDecoder().decode(buffers[2])) as Calibration;
  const buffer = buffers[1];
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== MAGIC) throw new Error("bad-embeddings");
  const version = view.getUint32(4, true);
  const dim = view.getUint32(8, true);
  const count = view.getUint32(12, true);
  if (dim !== catalog.dim || count !== catalog.sites.length) throw new Error("catalog-mismatch");
  const embeddings = version === 2 ? halfToFloat(new Uint16Array(buffer, 16, count * dim)) : new Float32Array(buffer, 16, count * dim);
  return { catalog, embeddings, dim, calibration };
}

export function loadDataset(): Promise<Dataset> {
  if (!pending) {
    pending = fetchDataset().catch((error) => {
      pending = null;
      fraction = 0;
      throw error;
    });
  }
  return pending;
}

export function preloadData(): void {
  void loadDataset();
}

/** Version 2 of the file stores float16 (half the download); matching runs on float32. */
function halfToFloat(half: Uint16Array): Float32Array {
  const table = new Float32Array(65536);
  for (let bits = 0; bits < 65536; bits++) {
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >> 10) & 0x1f;
    const fraction = bits & 0x3ff;
    table[bits] =
      exponent === 0
        ? sign * 2 ** -14 * (fraction / 1024)
        : exponent === 31
          ? fraction
            ? NaN
            : sign * Infinity
          : sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
  }
  const out = new Float32Array(half.length);
  for (let i = 0; i < half.length; i++) out[i] = table[half[i]];
  return out;
}
