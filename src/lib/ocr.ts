import type { Worker } from "tesseract.js";

/**
 * Reads the large text on a screenshot (headline, subhead, buttons) with
 * Tesseract, in this browser. Everything it needs is served from /ocr on this
 * site; nothing about the image leaves the page. Loaded only when asked.
 */
let pending: Promise<Worker> | null = null;

function worker(): Promise<Worker> {
  if (!pending) {
    const base = `${import.meta.env.BASE_URL}ocr/`;
    pending = import("tesseract.js")
      .then(({ createWorker, OEM }) =>
        createWorker(["eng", "spa"], OEM.LSTM_ONLY, {
          workerPath: `${base}worker.min.js`,
          // One SIMD build, supported by every current browser; the section says so if it fails.
          corePath: `${base}tesseract-core-simd-lstm.wasm.js`,
          langPath: base.replace(/\/$/, ""),
          gzip: true,
          workerBlobURL: false,
        }),
      )
      .catch((error) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}

export interface ReadText {
  /** The large lines (headline, subhead), in reading order. */
  lines: string[];
  /** All confidently read text below the navigation bar, buttons included. */
  text: string;
}

/**
 * Two passes below the navigation bar. At about 1000px wide, big display type
 * reads cleanly: those large lines become the headline shown back. At full
 * width, small type (buttons, captions) reads too: every confident line from
 * both passes is searched for stock phrases.
 */
export async function readLargeText(image: Blob): Promise<ReadText> {
  const bitmap = await createImageBitmap(image);
  const ocr = await worker();
  const large: { y: number; text: string }[] = [];
  const all: string[] = [];
  for (const target of [1000, 1440]) {
    const width = Math.min(target, bitmap.width);
    const height = Math.round((bitmap.height / bitmap.width) * width);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(bitmap, 0, 0, width, height);
    binarize(ctx, width, height);
    const { data } = await ocr.recognize(canvas, {}, { blocks: true });
    const nav = height * 0.09;
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          const text = tidy(line.text);
          if (line.bbox.y1 <= nav || !/[a-záéíóúñ]{3}/i.test(text)) continue;
          if (line.confidence >= 50) all.push(text);
          if (target === 1000 && line.bbox.y1 - line.bbox.y0 >= height * 0.02 && line.confidence >= 60) {
            large.push({ y: line.bbox.y0, text });
          }
        }
      }
    }
  }
  bitmap.close();
  large.sort((a, b) => a.y - b.y);
  return { lines: large.map((line) => line.text), text: all.join(" ") };
}

/** Drops the stray marks OCR leaves at the ends of a line. */
function tidy(raw: string): string {
  const words = raw.replace(/\s+/g, " ").trim().split(" ");
  const junk = (word: string) => !/[a-záéíóúñ0-9]/i.test(word) || (word.length === 1 && !/^[aiyoeu]$/i.test(word));
  while (words.length && junk(words[0])) words.shift();
  while (words.length && junk(words[words.length - 1])) words.pop();
  return words.join(" ");
}

/**
 * Pure black and white at Otsu's threshold, with dark text on light ground.
 * Coloured and gradient type, which Tesseract reads poorly, comes out solid.
 */
function binarize(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const hist = new Array<number>(256).fill(0);
  const lum = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const value = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    lum[p] = value;
    hist[value]++;
  }
  const total = width * height;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 128;
  for (let v = 0; v < 256; v++) {
    weightB += hist[v];
    if (!weightB) continue;
    const weightF = total - weightB;
    if (!weightF) break;
    sumB += v * hist[v];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = v;
    }
  }
  // Most of a screen is background: if most pixels are dark, the page is dark and the text light.
  let dark = 0;
  for (let p = 0; p < total; p++) if (lum[p] <= threshold) dark++;
  const invert = dark > total / 2;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const ink = invert ? lum[p] > threshold : lum[p] <= threshold;
    const value = ink ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  ctx.putImageData(image, 0, 0);
}
