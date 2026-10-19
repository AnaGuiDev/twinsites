import {
  env,
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
} from "@huggingface/transformers";

const MODEL_ID = "Xenova/mobileclip_s0";

/** Shipped byte sizes. The progress bar is bytes received over these, not a timer. */
export const WASM_BYTES = 21_596_019;
export const VISION_BYTES = 11_846_843;

type Processor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
type Vision = Awaited<ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>>;
type ProgressInfo = {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
};

let processor: Processor | null = null;
let vision: Vision | null = null;
let loading: Promise<void> | null = null;
let wasmPromise: Promise<ArrayBuffer> | null = null;
let wasmFraction = 0;
let modelFraction = 0;
const listeners = new Set<(fraction: number) => void>();

function engineFraction(): number {
  return Math.min(1, (wasmFraction * WASM_BYTES + modelFraction * VISION_BYTES) / (WASM_BYTES + VISION_BYTES));
}

function emit(): void {
  const fraction = engineFraction();
  for (const listener of listeners) listener(fraction);
}

export function subscribeEngine(listener: (fraction: number) => void): () => void {
  listeners.add(listener);
  listener(engineFraction());
  return () => listeners.delete(listener);
}

export function configureRuntime(): void {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  const base = import.meta.env.BASE_URL;
  env.localModelPath = `${base}models/`;
  const wasm = env.backends.onnx.wasm;
  if (wasm) {
    // Same-origin factory. The library's default is a CDN, which COEP would block.
    wasm.wasmPaths = `${base}ort/`;
    // The q8 vision graph is not stable with the threaded WASM runtime: the same
    // screenshot alternates between two embeddings. The catalog was encoded with
    // one thread, so the browser must do the same or twins will not match.
    wasm.numThreads = 1;
  }
}

async function fetchWasm(): Promise<ArrayBuffer> {
  if (wasmPromise) return wasmPromise;
  wasmPromise = (async () => {
    const base = import.meta.env.BASE_URL;
    const response = await fetch(`${base}ort/ort-wasm-simd-threaded.jsep.wasm`);
    if (!response.ok) throw new Error("wasm");
    const total = Number(response.headers.get("content-length")) || WASM_BYTES;
    const reader = response.body?.getReader();
    if (!reader) {
      const buffer = await response.arrayBuffer();
      wasmFraction = 1;
      emit();
      return buffer;
    }
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      wasmFraction = Math.min(1, loaded / total);
      emit();
    }
    const out = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    wasmFraction = 1;
    emit();
    return out.buffer;
  })().catch((error) => {
    wasmPromise = null;
    throw error;
  });
  return wasmPromise;
}

function noteModel(info: ProgressInfo): void {
  if (!info.file) return;
  if (info.status !== "progress" && info.status !== "done") return;
  const total = info.total && info.total > 0 ? info.total : null;
  if (info.status === "progress" && total && typeof info.loaded === "number") {
    modelFiles.set(info.file, { loaded: info.loaded, total });
  } else if (info.status === "done") {
    const prev = modelFiles.get(info.file);
    if (prev) modelFiles.set(info.file, { loaded: prev.total, total: prev.total });
  }
  let loaded = 0;
  let expected = 0;
  for (const row of modelFiles.values()) {
    loaded += row.loaded;
    expected += row.total;
  }
  if (expected > 0) {
    modelFraction = Math.min(1, loaded / expected);
    emit();
  }
}

const modelFiles = new Map<string, { loaded: number; total: number }>();

async function loadPair(): Promise<void> {
  configureRuntime();
  const binary = await fetchWasm();
  const wasm = env.backends.onnx.wasm as { wasmBinary?: ArrayBuffer } | undefined;
  if (wasm) wasm.wasmBinary = binary;
  processor = await AutoProcessor.from_pretrained(MODEL_ID, {
    progress_callback: noteModel,
  });
  vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
    dtype: "q8",
    device: "wasm",
    progress_callback: noteModel,
  });
  modelFraction = 1;
  emit();
}

export async function ensureModel(): Promise<void> {
  if (processor && vision) {
    wasmFraction = 1;
    modelFraction = 1;
    emit();
    return;
  }
  if (!loading) {
    loading = loadPair().catch((error) => {
      loading = null;
      processor = null;
      vision = null;
      throw error;
    });
  }
  await loading;
}

export function preloadEngine(): void {
  void ensureModel();
}

export async function embedBlob(file: Blob): Promise<Float32Array> {
  await ensureModel();
  if (!processor || !vision) throw new Error("model");
  const image = await RawImage.fromBlob(file);
  const inputs = await processor(image);
  const output = await vision(inputs);
  const embeds = output.image_embeds;
  const normalized = embeds.normalize();
  const listed = normalized.tolist() as number[] | number[][];
  const row = Array.isArray(listed[0]) ? (listed as number[][])[0] : (listed as number[]);
  let norm = 0;
  for (const value of row) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return Float32Array.from(row, (value) => value / norm);
}
