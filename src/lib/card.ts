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
  } while (next > 28);
  return next;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
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
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
  ctx.strokeStyle = "rgba(27,22,18,0.28)";
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
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

export async function renderShareCard(input: CardInput): Promise<HTMLCanvasElement> {
  await document.fonts.load('560 72px "Fraunces Variable"');
  await document.fonts.load('500 18px "IBM Plex Mono"');
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");

  ctx.fillStyle = "#e7dfd0";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = "rgba(27,22,18,0.16)";
  for (let y = 28; y < 630; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1200, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#1b1612";
  ctx.font = '500 18px "IBM Plex Mono", monospace';
  ctx.fillText("TWINSITES", 56, 64);
  ctx.fillStyle = "#b82c1a";
  ctx.fillText(input.lang === "es" ? "ZONA" : "ZONE", 230, 64);

  const size = fitText(ctx, input.zone, 560, 68, '620 SIZEpx "Fraunces Variable", serif');
  ctx.font = `620 ${size}px "Fraunces Variable", serif`;
  ctx.fillStyle = "#1b1612";
  const lines = wrap(ctx, input.zone, 560, 3);
  lines.forEach((line, index) => ctx.fillText(line, 56, 150 + index * (size + 6)));

  let y = 150 + lines.length * (size + 6) + 18;
  const secondarySize = fitText(ctx, input.secondary, 560, 28, '520 SIZEpx "Fraunces Variable", serif');
  ctx.font = `520 ${secondarySize}px "Fraunces Variable", serif`;
  wrap(ctx, input.secondary, 560, 2).forEach((line, index) => {
    ctx.fillText(line, 56, y + index * (secondarySize + 6));
  });
  y += secondarySize + 36;
  ctx.font = '400 18px "IBM Plex Mono", monospace';
  ctx.fillStyle = "#4a4036";
  wrap(ctx, input.traits, 540, 3).forEach((line, index) => ctx.fillText(line, 56, y + index * 26));

  ctx.fillStyle = "#1b1612";
  ctx.font = '400 18px "IBM Plex Mono", monospace';
  ctx.fillText(input.pageUrl.replace(/^https:\/\//, ""), 56, 580);

  const loaded = (await Promise.all(input.images.map(loadImage))).filter((image): image is HTMLImageElement => image !== null);
  if (loaded.length >= 2) {
    cover(ctx, loaded[0], 680, 78, 460, 220);
    cover(ctx, loaded[1], 680, 318, 460, 220);
  } else if (loaded.length === 1) {
    cover(ctx, loaded[0], 680, 120, 460, 288);
  }

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png"))), "image/png");
  });
}

export function traitLine(labels: string[]): string {
  return labels.filter(Boolean).join(" · ");
}
