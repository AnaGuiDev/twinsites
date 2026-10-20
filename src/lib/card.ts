import type { Lang } from "../types";

export interface CardInput {
  lang: Lang;
  zone: string;
  secondary: string;
  traits: string;
  pageUrl: string;
  images: string[];
  /** One caption per image, drawn as a tag on it. */
  labels: string[];
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, font: string): number {
  let next = size;
  do {
    ctx.font = font.replace("SIZE", String(next));
    if (ctx.measureText(text).width <= maxWidth) return next;
    next -= 2;
  } while (next > 40);
  return next;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
  image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function cover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y, dw, dh);
  ctx.restore();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

const FAMILY = '"Archivo Variable", "Helvetica Neue", Arial, sans-serif';

export async function renderShareCard(input: CardInput): Promise<HTMLCanvasElement> {
  await Promise.all([
    document.fonts.load(`820 extra-condensed 96px ${FAMILY}`),
    document.fonts.load(`650 semi-condensed 30px ${FAMILY}`),
    document.fonts.load(`600 20px ${FAMILY}`),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  const loaded = (await Promise.all(input.images.map(loadImage))).filter((image): image is HTMLImageElement => image !== null);

  // Yellow is the colour of a match on the site; on a feed it is the brand.
  ctx.fillStyle = "#ffe24a";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "alphabetic";
  mark(ctx, 56, 44);
  ctx.font = `800 24px ${FAMILY}`;
  ctx.fillText("Twinsites", 96, 66);
  ctx.font = `600 20px ${FAMILY}`;
  const url = input.pageUrl.replace(/^https:\/\//, "");
  ctx.fillText(url, 1144 - ctx.measureText(url).width, 66);

  if (loaded.length >= 2) {
    // Side by side: the page and its closest twin, big enough to see the likeness.
    const size = fitText(ctx, input.zone, 1088, 96, `820 extra-condensed SIZEpx ${FAMILY}`);
    ctx.font = `820 extra-condensed ${size}px ${FAMILY}`;
    const zoneY = 112 + size * 0.8;
    ctx.fillText(input.zone, 54, zoneY);
    ctx.font = `650 semi-condensed 30px ${FAMILY}`;
    const lineY = zoneY + 56;
    ctx.fillText(input.secondary, 56, lineY);
    const top = Math.min(lineY + 28, 300);
    const height = 574 - top;
    const width = Math.round(height * 1.6);
    const gap = 1088 - width * 2;
    const left = 56 + Math.max(0, (gap - 24) / 2);
    const w = Math.min(width, (1088 - 24) / 2);
    cover(ctx, loaded[0], left, top, w, height);
    cover(ctx, loaded[1], left + w + 24, top, w, height);
    tag(ctx, input.labels[0] ?? "", left + 12, top + height - 14);
    tag(ctx, input.labels[1] ?? "", left + w + 24 + 12, top + height - 14, true);
  } else {
    const size = fitText(ctx, input.zone, 560, 112, `820 extra-condensed SIZEpx ${FAMILY}`);
    ctx.font = `820 extra-condensed ${size}px ${FAMILY}`;
    const lines = wrap(ctx, input.zone, 560, 3);
    const lead = Math.round(size * 0.9);
    let y = 130 + lead * 0.8;
    lines.forEach((line, index) => ctx.fillText(line, 54, y + index * lead));
    y += (lines.length - 1) * lead + 54;
    ctx.font = `650 semi-condensed 30px ${FAMILY}`;
    wrap(ctx, input.secondary, 560, 2).forEach((line, index) => ctx.fillText(line, 56, y + index * 36));
    y += 36 + 40;
    ctx.font = `500 20px ${FAMILY}`;
    ctx.fillStyle = "#3a3a3a";
    wrap(ctx, input.traits, 540, 2).forEach((line, index) => ctx.fillText(line, 56, Math.min(y, 540) + index * 28));
    if (loaded[0]) {
      cover(ctx, loaded[0], 660, 120, 484, 302);
      tag(ctx, input.labels[0] ?? "", 672, 408, true);
    }
  }
  return canvas;
}

export interface ProgressCardInput {
  before: number;
  after: number;
  /** The unit line under the numbers, e.g. "twins in the top 3%". */
  unit: string;
  /** Who they were compared with, e.g. "of 2,003 AI-built sites". */
  among: string;
  pageUrl: string;
  /** Before and after screenshots; empty strings to leave them off. */
  images: [string, string];
  labels: [string, string];
}

/** The card worth posting: the drop in twins, with the page before and after. */
export async function renderProgressCard(input: ProgressCardInput): Promise<HTMLCanvasElement> {
  await Promise.all([
    document.fonts.load(`820 extra-condensed 200px ${FAMILY}`),
    document.fonts.load(`650 semi-condensed 34px ${FAMILY}`),
    document.fonts.load(`600 20px ${FAMILY}`),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  const [beforeImage, afterImage] = await Promise.all(input.images.map((src) => (src ? loadImage(src) : Promise.resolve(null))));
  const withImages = Boolean(beforeImage && afterImage);

  ctx.fillStyle = "#ffe24a";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#000000";
  mark(ctx, 56, 44);
  ctx.font = `800 24px ${FAMILY}`;
  ctx.fillText("Twinsites", 96, 66);
  ctx.font = `600 20px ${FAMILY}`;
  const url = input.pageUrl.replace(/^https:\/\//, "");
  ctx.fillText(url, 1144 - ctx.measureText(url).width, 66);

  const textWidth = withImages ? 560 : 1088;
  const numbers = `${input.before} → ${input.after}`;
  const size = fitText(ctx, numbers, textWidth, withImages ? 210 : 260, `820 extra-condensed SIZEpx ${FAMILY}`);
  ctx.font = `820 extra-condensed ${size}px ${FAMILY}`;
  const numbersY = 130 + size * 0.8;
  ctx.fillText(numbers, 52, numbersY);
  ctx.font = `650 semi-condensed 34px ${FAMILY}`;
  const unitLines = wrap(ctx, input.unit, textWidth, 2);
  unitLines.forEach((line, index) => ctx.fillText(line, 56, numbersY + 58 + index * 40));
  ctx.font = `500 24px ${FAMILY}`;
  ctx.fillStyle = "#3a3a3a";
  wrap(ctx, input.among, textWidth, 2).forEach((line, index) =>
    ctx.fillText(line, 56, numbersY + 58 + unitLines.length * 40 + 8 + index * 30),
  );

  if (withImages && beforeImage && afterImage) {
    const w = 468;
    const h = 250;
    cover(ctx, beforeImage, 676, 100, w, h - 8);
    cover(ctx, afterImage, 676, 100 + h + 8, w, h - 8);
    tag(ctx, input.labels[0], 688, 100 + h - 22);
    tag(ctx, input.labels[1], 688, 100 + 2 * h - 14, true);
  }
  return canvas;
}

/** The Twinsites mark: four tiles, the top two lit. */
function mark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillRect(x, y, 30, 30);
  ctx.fillStyle = "#ffe24a";
  ctx.fillRect(x + 4, y + 5, 10, 8);
  ctx.fillRect(x + 16, y + 5, 10, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 4, y + 17, 10, 8);
  ctx.fillRect(x + 16, y + 17, 10, 8);
  ctx.restore();
}

/** A caption chip on an image, anchored at its bottom-left. */
function tag(ctx: CanvasRenderingContext2D, text: string, x: number, baseline: number, lit = false) {
  if (!text) return;
  ctx.save();
  ctx.font = `700 semi-condensed 20px ${FAMILY}`;
  const width = ctx.measureText(text).width + 20;
  ctx.fillStyle = lit ? "#ffe24a" : "#000000";
  ctx.fillRect(x, baseline - 24, width, 32);
  if (lit) {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, baseline - 23, width - 2, 30);
  }
  ctx.fillStyle = lit ? "#000000" : "#ffffff";
  ctx.fillText(text, x + 10, baseline - 1);
  ctx.restore();
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png"))), "image/png");
  });
}

export function traitLine(labels: string[]): string {
  return labels.filter(Boolean).join(", ");
}
