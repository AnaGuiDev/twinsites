import { formatRank, type KinVerdict } from "./calibrate";
import type { Lang } from "../types";

export interface CardInput {
  lang: Lang;
  verdict: KinVerdict;
  nearestRank: number;
  zone: string;
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
  ctx.fillStyle = "#b82c1a";
  ctx.fillText(input.lang === "es" ? "REGISTRO VISUAL" : "VISUAL KIN REGISTRY", 250, 78);

  const es = input.lang === "es";
  const { verdict } = input;
  const noun =
    verdict.mode === "neighborhood"
      ? es
        ? verdict.count === 1
          ? "vecina"
          : "vecinas"
        : verdict.count === 1
          ? "neighbor"
          : "neighbors"
      : es
        ? verdict.count === 1
          ? "gemela"
          : "gemelas"
        : verdict.count === 1
          ? "twin"
          : "twins";
  const headline =
    verdict.mode === "neighborhood"
      ? es
        ? "Tu web vive en"
        : "Your site lives in"
      : verdict.mode === "none"
        ? es
          ? "Ninguna gemela"
          : "No twin"
        : es
          ? "Mi web tiene"
          : "My site has";
  const figure = verdict.mode === "neighborhood" ? input.zone : String(verdict.count);
  const tail =
    verdict.mode === "neighborhood"
      ? es
        ? `con ${verdict.count} ${noun} en el ${verdict.top} % superior`
        : `with ${verdict.count} ${noun} in the top ${verdict.top}%`
      : verdict.mode === "none"
        ? es
          ? `en el ${verdict.top} % superior`
          : `in the top ${verdict.top}%`
        : es
          ? `${noun} en el ${verdict.top} % superior`
          : `${noun} in the top ${verdict.top}%`;
  const nearestLine =
    verdict.mode === "none"
      ? es
        ? `La más cercana queda en el percentil ${input.nearestRank}.`
        : `Nearest is the ${formatRank(input.nearestRank, "en")} percentile.`
      : verdict.mode === "neighborhood"
        ? es
          ? `Esas vecinas están en ese ${verdict.top} %. La más cercana, percentil ${input.nearestRank}.`
          : `Those neighbors clear that top ${verdict.top}%. Nearest, ${formatRank(input.nearestRank, "en")} percentile.`
        : es
          ? `La más cercana, percentil ${input.nearestRank}. Cada gemela está en ese ${verdict.top} %.`
          : `Nearest, ${formatRank(input.nearestRank, "en")} percentile. Each twin is in that top ${verdict.top}%.`;

  ctx.fillStyle = "#1b1612";
  ctx.font = '520 42px "Fraunces Variable", serif';
  ctx.fillText(headline, 64, 168);
  const figureSize = fitText(
    ctx,
    figure,
    600,
    verdict.mode === "neighborhood" ? 64 : 150,
    '620 SIZEpx "Fraunces Variable", serif',
  );
  ctx.font = `620 ${figureSize}px "Fraunces Variable", serif`;
  if (verdict.mode === "neighborhood") {
    wrapFill(ctx, figure, 64, 250, 600, figureSize + 4);
  } else {
    ctx.fillText(figure, 64, 330);
  }
  const tailSize = fitText(ctx, tail, 600, verdict.mode === "neighborhood" ? 32 : 40, '560 SIZEpx "Fraunces Variable", serif');
  ctx.font = `560 ${tailSize}px "Fraunces Variable", serif`;
  const tailY = verdict.mode === "neighborhood" ? 250 + figureSize + 36 : 400;
  ctx.fillText(tail, 64, tailY);

  ctx.font = '400 20px "IBM Plex Mono", monospace';
  ctx.fillStyle = "#4a4036";
  const noteSize = fitText(ctx, nearestLine, 600, 20, '400 SIZEpx "IBM Plex Mono", monospace');
  ctx.font = `400 ${noteSize}px "IBM Plex Mono", monospace`;
  wrapFill(ctx, nearestLine, 64, Math.max(tailY + 48, 470), 600, noteSize + 6);
  ctx.font = '400 20px "IBM Plex Mono", monospace';
  ctx.fillStyle = "#1b1612";
  ctx.fillText("twinsites.com", 64, 572);

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
  ctx.strokeStyle = "#b82c1a";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = '600 16px "IBM Plex Mono", monospace';
  ctx.fillStyle = "#b82c1a";
  ctx.textAlign = "center";
  ctx.fillText(input.lang === "es" ? "EN EL" : "ON", 0, -4);
  ctx.fillText(input.lang === "es" ? "EQUIPO" : "DEVICE", 0, 16);
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
