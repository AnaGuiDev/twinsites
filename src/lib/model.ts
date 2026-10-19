import {
  env,
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
} from "@huggingface/transformers";

const MODEL_ID = "Xenova/mobileclip_s0";

type Processor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
type Vision = Awaited<ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>>;

let processor: Processor | null = null;
let vision: Vision | null = null;
let loading: Promise<void> | null = null;

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

async function loadPair(): Promise<void> {
  configureRuntime();
  processor = await AutoProcessor.from_pretrained(MODEL_ID);
  vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
    dtype: "q8",
    device: "wasm",
  });
}

export async function ensureModel(): Promise<void> {
  if (processor && vision) return;
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
