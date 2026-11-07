import {
  env,
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
} from "@huggingface/transformers";

const MODEL_ID = "Xenova/mobileclip_s0";

/** Shipped byte sizes. The progress bar is bytes received over these, not a timer. */
export const WASM_BYTES = 11_133_407;
export const VISION_BYTES = 22_876_479;

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

/** Absolute same-origin URL for one runtime file, with a build query so a stale immutable response is not reused. */
export function ortRuntimeUrl(file: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}ort/${file}?v=${__ORT_BUILD__}`;
}

export function configureRuntime(): void {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  const base = import.meta.env.BASE_URL;
  env.localModelPath = `${base}models/`;
  const wasm = env.backends.onnx.wasm;
  if (wasm) {
    // Same-origin factory. The library's default is a CDN, which COEP would block.
    // Explicit file URLs: a string prefix drops ?v= when ONNX joins the filename.
    wasm.wasmPaths = {
      mjs: ortRuntimeUrl("ort-wasm-simd-threaded.mjs"),
      wasm: ortRuntimeUrl("ort-wasm-simd-threaded.wasm"),
    };
    // Keep the same single-thread runtime used to encode the FP16 catalog.
    // Cross-device / threaded equivalence is not established by the stability check.
    wasm.numThreads = 1;
  }
}

async function fetchWasm(): Promise<ArrayBuffer> {
  if (wasmPromise) return wasmPromise;
  wasmPromise = (async () => {
    const response = await fetch(ortRuntimeUrl("ort-wasm-simd-threaded.wasm"));
    if (!response.ok) throw new Error("wasm");
    // The stream yields decompressed bytes; with gzip, content-length is the compressed size.
    const total = WASM_BYTES;
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
  // The library takes content-length as the total, which is the compressed size
  // when the server sends gzip, and counts decompressed bytes: use the real size.
  const reported = info.total && info.total > 0 ? info.total : null;
  const total = info.file.endsWith(".onnx") ? VISION_BYTES : reported;
  if (info.status === "progress" && total && typeof info.loaded === "number") {
    modelFiles.set(info.file, { loaded: Math.min(info.loaded, total), total });
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
    dtype: "fp16",
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
  void ensureModel().catch(() => undefined);
}

export async function embedBlob(file: Blob): Promise<Float32Array> {
  await ensureModel();
  if (!processor || !vision) throw new Error("model");
  const image = await RawImage.fromBlob(file);
  // Two overlapping square views retain both lateral edges of the desktop hero.
  const side = Math.min(image.width, image.height);
  const left = await image.crop([0, 0, side - 1, side - 1]);
  const right = await image.crop([image.width - side, 0, image.width - 1, side - 1]);
  const inputs = await processor([left, right]);
  const output = await vision(inputs);
  const embeds = output.image_embeds;
  const normalized = embeds.normalize();
  const listed = normalized.tolist() as number[] | number[][];
  const rows = Array.isArray(listed[0]) ? listed as number[][] : [listed as number[]];
  const row = rows[0].map((_, index) => rows.reduce((sum, values) => sum + values[index], 0) / rows.length);
  let norm = 0;
  for (const value of row) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return Float32Array.from(row, (value) => value / norm);
}
