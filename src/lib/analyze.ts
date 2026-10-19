import type { ColorName, Density, Mode, Traits } from "../types";

export function hueToName(h: number): ColorName {
  const hue = ((h % 360) + 360) % 360;
  if (hue < 15 || hue >= 345) return "red";
  if (hue < 40) return "orange";
  if (hue < 55) return "amber";
  if (hue < 72) return "yellow";
  if (hue < 100) return "lime";
  if (hue < 160) return "green";
  if (hue < 185) return "teal";
  if (hue < 205) return "cyan";
  if (hue < 250) return "blue";
  if (hue < 275) return "indigo";
  if (hue < 310) return "purple";
  if (hue < 335) return "magenta";
  return "pink";
}

export function rotateHue(h: number, delta: number): number {
  return (((h + delta) % 360) + 360) % 360;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function hex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

interface Acc {
  n: number;
  r: number;
  g: number;
  b: number;
}

function densityOf(whitespace: number, edge: number): Density {
  if (whitespace > 0.55 && edge < 0.09) return "airy";
  if (whitespace < 0.22 || edge > 0.14) return "packed";
  return "balanced";
}

/**
 * Visual traits from tightly downscaled pixels. `channels` is 3 (RGB) or 4 (RGBA).
 * The same function runs in the dataset pipeline and in the browser.
 */
export function analyzePixels(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: 3 | 4,
): Traits {
  const n = width * height;
  if (n === 0 || data.length < n * channels) {
    return {
      luminance: 1,
      saturation: 0,
      whitespace: 1,
      edge: 0,
      blockStd: 0,
      centerShare: 1,
      hue: null,
      mode: "light",
      density: "airy",
      gradient: false,
      bento: false,
      centered: true,
      dominant: "#f4f0e6",
      dominantName: "neutral",
      palette: ["#f4f0e6", "#1b1612", "#c5361b"],
    };
  }

  let lumSum = 0;
  let satSum = 0;
  let white = 0;
  let edges = 0;
  let edgeChecks = 0;
  let centerContent = 0;
  let sideContent = 0;

  const names: ColorName[] = [
    "red",
    "orange",
    "amber",
    "yellow",
    "lime",
    "green",
    "teal",
    "cyan",
    "blue",
    "indigo",
    "purple",
    "magenta",
    "pink",
  ];
  const bins = new Map<ColorName, Acc>();
  for (const name of names) bins.set(name, { n: 0, r: 0, g: 0, b: 0 });
  const neutral: Acc = { n: 0, r: 0, g: 0, b: 0 };
  let hueWeighted = 0;
  let hueWeight = 0;

  const x0 = width * 0.25;
  const x1 = width * 0.75;

  const at = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = at(x, y);
      const lum = luminance(r, g, b);
      const [h, s] = rgbToHsl(r, g, b);
      lumSum += lum;
      satSum += s;
      if (lum > 0.9) white++;
      const content = lum < 0.78 || s > 0.28;
      if (x >= x0 && x < x1) {
        if (content) centerContent++;
      } else if (content) sideContent++;

      if (s > 0.28 && lum > 0.12 && lum < 0.9) {
        const name = hueToName(h);
        const acc = bins.get(name)!;
        acc.n++;
        acc.r += r;
        acc.g += g;
        acc.b += b;
        hueWeighted += h * s;
        hueWeight += s;
      } else {
        neutral.n++;
        neutral.r += r;
        neutral.g += g;
        neutral.b += b;
      }

      if (x + 1 < width) {
        const [r2, g2, b2] = at(x + 1, y);
        if (Math.abs(lum - luminance(r2, g2, b2)) > 0.14) edges++;
        edgeChecks++;
      }
      if (y + 1 < height) {
        const [r2, g2, b2] = at(x, y + 1);
        if (Math.abs(lum - luminance(r2, g2, b2)) > 0.14) edges++;
        edgeChecks++;
      }
    }
  }

  const cols = 4;
  const rows = 4;
  const blockMeans: number[] = [];
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let sum = 0;
      let count = 0;
      const yStart = Math.floor((by * height) / rows);
      const yEnd = Math.floor(((by + 1) * height) / rows);
      const xStart = Math.floor((bx * width) / cols);
      const xEnd = Math.floor(((bx + 1) * width) / cols);
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const [r, g, b] = at(x, y);
          sum += luminance(r, g, b);
          count++;
        }
      }
      blockMeans.push(count ? sum / count : 0);
    }
  }
  const blockAvg = blockMeans.reduce((a, b) => a + b, 0) / blockMeans.length;
  const blockStd = Math.sqrt(
    blockMeans.reduce((a, b) => a + (b - blockAvg) ** 2, 0) / blockMeans.length,
  );

  const gw = 6;
  const gh = 4;
  const cellMeans: number[] = [];
  for (let by = 0; by < gh; by++) {
    for (let bx = 0; bx < gw; bx++) {
      let sum = 0;
      let count = 0;
      const yStart = Math.floor((by * height) / gh);
      const yEnd = Math.floor(((by + 1) * height) / gh);
      const xStart = Math.floor((bx * width) / gw);
      const xEnd = Math.floor(((bx + 1) * width) / gw);
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const [r, g, b] = at(x, y);
          sum += luminance(r, g, b);
          count++;
        }
      }
      cellMeans.push(count ? sum / count : 0);
    }
  }
  const globalLum = lumSum / n;
  const cards = cellMeans.filter((v) => Math.abs(v - globalLum) > 0.055);
  const cardAvg = cards.length
    ? cards.reduce((a, b) => a + b, 0) / cards.length
    : 0;
  const cardStd = cards.length
    ? Math.sqrt(cards.reduce((a, b) => a + (b - cardAvg) ** 2, 0) / cards.length)
    : 1;

  const whitespace = white / n;
  const edge = edgeChecks ? edges / edgeChecks : 0;
  const saturation = satSum / n;
  const mode: Mode = globalLum < 0.45 ? "dark" : "light";
  const gradient = blockStd > 0.1 && edge < 0.09;
  const bento =
    cards.length >= 5 && cardStd < 0.11 && edge > 0.035 && edge < 0.2 && whitespace > 0.05 && whitespace < 0.5;
  const centerShare = centerContent / (centerContent + sideContent + 1e-6);
  const centered = centerShare > 0.7;

  const ranked = [...bins.entries()].sort((a, b) => b[1].n - a[1].n);
  const top = ranked[0];
  const useColor = Boolean(top && top[1].n > n * 0.012);
  let dominantName: ColorName = "neutral";
  let dominant = hex(neutral.r / Math.max(1, neutral.n), neutral.g / Math.max(1, neutral.n), neutral.b / Math.max(1, neutral.n));
  let hue: number | null = null;
  if (useColor && top) {
    dominantName = top[0];
    const acc = top[1];
    dominant = hex(acc.r / acc.n, acc.g / acc.n, acc.b / acc.n);
    hue = hueWeight > 0 ? hueWeighted / hueWeight : null;
  } else if (neutral.n > 0) {
    dominant = hex(neutral.r / neutral.n, neutral.g / neutral.n, neutral.b / neutral.n);
  }

  const palette: string[] = [dominant];
  for (const [, acc] of ranked) {
    if (palette.length >= 3) break;
    if (acc.n < n * 0.04) break;
    const swatch = hex(acc.r / acc.n, acc.g / acc.n, acc.b / acc.n);
    if (!palette.includes(swatch)) palette.push(swatch);
  }
  if (palette.length < 3 && neutral.n > n * 0.08) {
    const swatch = hex(neutral.r / neutral.n, neutral.g / neutral.n, neutral.b / neutral.n);
    if (!palette.includes(swatch)) palette.push(swatch);
  }
  while (palette.length < 3) palette.push(mode === "dark" ? "#f3ecdf" : "#1b1612");

  return {
    luminance: round4(globalLum),
    saturation: round4(saturation),
    whitespace: round4(whitespace),
    edge: round4(edge),
    blockStd: round4(blockStd),
    centerShare: round4(centerShare),
    hue: hue === null ? null : Math.round(hue),
    mode,
    density: densityOf(whitespace, edge),
    gradient,
    bento,
    centered,
    dominant,
    dominantName,
    palette,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export async function analyzeImageSource(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Traits> {
  const canvas = document.createElement("canvas");
  const tw = 96;
  const th = 60;
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(source, 0, 0, width, height, 0, 0, tw, th);
  const image = ctx.getImageData(0, 0, tw, th);
  return analyzePixels(image.data, tw, th, 4);
}
