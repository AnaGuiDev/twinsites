import { formatRank } from "./calibrate";
import type { Lang } from "../types";

export interface CardInput {
  lang: Lang;
  count: number;
  nearestRank: number;
  top: number;
  thumbs: string[];
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, font: string): number {
  let next = size;
  do {
    ctx.font = font.replace("SIZE", String(next));
    if (ctx.measureText(text).width <= maxWidth) return next;
    next -= 2;
  } while (next > 22);
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

function roundedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.clip();
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
  ctx.strokeStyle = "rgba(27,22,18,0.2)";
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function wrapFill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  lines.slice(0, 3).forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
}

export async function renderShareCard(input: CardInput): Promise<HTMLCanvasElement> {
  await document.fonts.load('560 92px "Fraunces Variable"');
  await document.fonts.load('500 22px "IBM Plex Mono"');
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");

  ctx.fillStyle = "#e7dfd0";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = "rgba(27,22,18,0.18)";
  for (let y = 28; y < 630; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1200, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#1b1612";
  ctx.font = '500 22px "IBM Plex Mono", monospace';
  ctx.fillText("TWINSITES", 64, 78);
  ctx.fillStyle = "#c5361b";
  ctx.fillText(input.lang === "es" ? "REGISTRO VISUAL" : "VISUAL KIN REGISTRY", 250, 78);

  const headline = input.lang === "es" ? "Mi web tiene" : "My site has";
  const tail =
    input.lang === "es"
      ? `gemela${input.count === 1 ? "" : "s"} en el ${input.top} % superior`
      : `twin${input.count === 1 ? "" : "s"} in the top ${input.top}%`;
  const nearestLine =
    input.count > 0
      ? input.lang === "es"
        ? `La más cercana, percentil ${input.nearestRank}. Cada gemela está en ese ${input.top} %.`
        : `Nearest, ${formatRank(input.nearestRank, "en")} percentile. Each twin is in that top ${input.top}%.`
      : input.lang === "es"
        ? `Ninguna entra en ese ${input.top} %. La más cercana, percentil ${input.nearestRank}.`
        : `None clear that top ${input.top}%. Nearest is the ${formatRank(input.nearestRank, "en")} percentile.`;

  ctx.fillStyle = "#1b1612";
  ctx.font = '520 54px "Fraunces Variable", serif';
  ctx.fillText(headline, 64, 170);
  const countSize = fitText(ctx, String(input.count), 560, 150, '620 SIZEpx "Fraunces Variable", serif');
  ctx.font = `620 ${countSize}px "Fraunces Variable", serif`;
  ctx.fillText(String(input.count), 64, 330);
  const tailSize = fitText(ctx, tail, 600, 42, '560 SIZEpx "Fraunces Variable", serif');
  ctx.font = `560 ${tailSize}px "Fraunces Variable", serif`;
  ctx.fillText(tail, 64, 400);

  ctx.font = '400 20px "IBM Plex Mono", monospace';
  ctx.fillStyle = "#4a4036";
  const noteSize = fitText(ctx, nearestLine, 600, 20, '400 SIZEpx "IBM Plex Mono", monospace');
  ctx.font = `400 ${noteSize}px "IBM Plex Mono", monospace`;
  wrapFill(ctx, nearestLine, 64, 455, 600, noteSize + 6);
  ctx.font = '400 20px "IBM Plex Mono", monospace';
  ctx.fillText("twinsites.com", 64, 560);

  const images = (await Promise.all(input.thumbs.slice(0, 4).map(loadImage))).filter(
    (image): image is HTMLImageElement => image !== null,
  );
  images.forEach((image, index) => {
    const x = 700;
    const y = 78 + index * 128;
    ctx.fillStyle = "#f6f1e6";
    ctx.fillRect(x - 8, y - 8, 416, 116);
    roundedImage(ctx, image, x, y, 400, 100);
  });

  ctx.save();
  ctx.translate(1040, 530);
  ctx.rotate(-0.12);
  ctx.beginPath();
  ctx.arc(0, 0, 54, 0, Math.PI * 2);
  ctx.strokeStyle = "#c5361b";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = '600 16px "IBM Plex Mono", monospace';
  ctx.fillStyle = "#c5361b";
  ctx.textAlign = "center";
  ctx.fillText("ON", 0, -4);
  ctx.fillText("DEVICE", 0, 16);
  ctx.restore();

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("png"));
    }, "image/png");
  });
}
