import { hueToName } from "./analyze";
import type { ColorName } from "../types";

/** Where on the first screen each generic trait shows, in 0–1 page coordinates. */
export interface Marks {
  /** The block the page is centred on, inside the main band. */
  centre: { x0: number; x1: number; y0: number; y1: number } | null;
  /** Horizontal bands with almost nothing in them. */
  empty: { y0: number; y1: number }[];
  /** Cells (on a 48×30 grid) where the accent colour shows. */
  accent: { x: number; y: number }[];
}

const W = 96;
const H = 60;

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function hsl(r: number, g: number, b: number): [number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s];
}

/**
 * Reads the same 96×60 downscale the traits come from, so the marks sit where
 * the diagnosis found them: the centred block, the empty bands, the accent.
 */
export async function marksFor(src: string, accentName: ColorName): Promise<Marks> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  // The screenshot is shown cropped to 16:10 from the top; read the same area.
  const sh = Math.min(image.naturalHeight, image.naturalWidth * 0.625);
  ctx.drawImage(image, 0, 0, image.naturalWidth, sh, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const at = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };

  // Background: mean colour of the most common luminance bin, as in analyze.
  const bins = Array.from({ length: 24 }, () => ({ n: 0, r: 0, g: 0, b: 0 }));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = at(x, y);
      const bin = bins[Math.min(23, Math.floor(luminance(r, g, b) * 24))];
      bin.n++;
      bin.r += r;
      bin.g += g;
      bin.b += b;
    }
  }
  const top = bins.reduce((best, bin) => (bin.n > best.n ? bin : best));
  const bg = [top.r / top.n, top.g / top.n, top.b / top.n];
  const distance = (x: number, y: number) => {
    const [r, g, b] = at(x, y);
    return Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) / 255;
  };
  const content = (x: number, y: number) => distance(x, y) > 0.14;
  // Empty means truly empty: even faint cards and panels count as something.
  const faint = (x: number, y: number) => distance(x, y) > 0.035;

  // Centred block: columns holding the middle 80% of content in the main band.
  const y0 = Math.floor(H * 0.14);
  const y1 = Math.floor(H * 0.82);
  const cols = new Array<number>(W).fill(0);
  let rowsWith: number[] = [];
  let total = 0;
  for (let y = y0; y < y1; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      if (content(x, y)) {
        cols[x]++;
        row++;
      }
    }
    total += row;
    if (row > W * 0.03) rowsWith.push(y);
  }
  let centre: Marks["centre"] = null;
  if (total > 0 && rowsWith.length) {
    let acc = 0;
    let left = 0;
    let right = W - 1;
    for (let x = 0; x < W; x++) {
      acc += cols[x];
      if (acc >= total * 0.1) {
        left = x;
        break;
      }
    }
    acc = 0;
    for (let x = W - 1; x >= 0; x--) {
      acc += cols[x];
      if (acc >= total * 0.1) {
        right = x;
        break;
      }
    }
    centre = { x0: left / W, x1: (right + 1) / W, y0: rowsWith[0] / H, y1: (rowsWith[rowsWith.length - 1] + 1) / H };
  }
  rowsWith = [];

  // Empty bands: runs of at least four rows with almost no content.
  const empty: Marks["empty"] = [];
  let start = -1;
  for (let y = 0; y <= H; y++) {
    let row = 0;
    if (y < H) for (let x = 0; x < W; x++) if (faint(x, y)) row++;
    const quiet = y < H && row < W * 0.02;
    if (quiet && start < 0) start = y;
    if (!quiet && start >= 0) {
      if (y - start >= 4) empty.push({ y0: start / H, y1: y / H });
      start = -1;
    }
  }

  // Accent: cells of a 48×30 grid where the dominant hue shows.
  const accent: Marks["accent"] = [];
  if (accentName !== "neutral") {
    const seen = new Set<string>();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const [r, g, b] = at(x, y);
        const lum = luminance(r, g, b);
        const [h, s] = hsl(r, g, b);
        if (s > 0.28 && lum > 0.12 && lum < 0.9 && hueToName(h) === accentName) {
          const key = `${x >> 1},${y >> 1}`;
          if (!seen.has(key)) {
            seen.add(key);
            accent.push({ x: (x >> 1) / 48, y: (y >> 1) / 30 });
          }
        }
      }
    }
  }
  return { centre, empty, accent };
}
