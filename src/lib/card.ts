import type { Lang } from "../types";

export interface CardInput {
  lang: Lang;
  zone: string;
  secondary: string;
  traits: string;
  pageUrl: string;
  images: string[];
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
    document.fonts.load(`500 20px ${FAMILY}`),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");

  // Yellow is the colour of a match on the site; on a feed it is the brand.
  ctx.fillStyle = "#ffe24a";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "alphabetic";

  ctx.font = `800 26px ${FAMILY}`;
  ctx.fillText("Twinsites", 56, 76);

  const size = fitText(ctx, input.zone, 560, 112, `820 extra-condensed SIZEpx ${FAMILY}`);
  ctx.font = `820 extra-condensed ${size}px ${FAMILY}`;
  const lines = wrap(ctx, input.zone, 560, 3);
  const lead = Math.round(size * 0.9);
  let y = 150 + lead * 0.8;
  lines.forEach((line, index) => ctx.fillText(line, 54, y + index * lead));
  y += (lines.length - 1) * lead + 54;

  ctx.font = `650 semi-condensed 30px ${FAMILY}`;
  wrap(ctx, input.secondary, 560, 2).forEach((line, index) => ctx.fillText(line, 56, y + index * 36));
  y += 36 + 40;

  ctx.font = `500 20px ${FAMILY}`;
  ctx.fillStyle = "#3a3a3a";
  wrap(ctx, input.traits, 540, 2).forEach((line, index) => ctx.fillText(line, 56, Math.min(y, 520) + index * 28));

  ctx.fillStyle = "#000000";
  ctx.font = `600 20px ${FAMILY}`;
  ctx.fillText(input.pageUrl.replace(/^https:\/\//, ""), 56, 586);

  const loaded = (await Promise.all(input.images.map(loadImage))).filter((image): image is HTMLImageElement => image !== null);
  if (loaded.length >= 2) {
    cover(ctx, loaded[0], 660, 56, 484, 250);
    cover(ctx, loaded[1], 660, 324, 484, 250);
  } else if (loaded.length === 1) {
    cover(ctx, loaded[0], 660, 112, 484, 302);
  }

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png"))), "image/png");
  });
}

export function traitLine(labels: string[]): string {
  return labels.filter(Boolean).join(", ");
}
