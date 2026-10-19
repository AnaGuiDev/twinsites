/** Catalog shots are the first 1440×900 viewport, which is 16:10. Match that band. */
export const HERO_RATIO = 0.625;

export interface HeroFrame {
  bitmap: ImageBitmap;
  blob: Blob;
  /** Taller than it is wide: a phone capture, not a desktop homepage. */
  portrait: boolean;
  /** The source extended below the first 16:10 band, so the lower part was left out. */
  cropped: boolean;
}

export async function cropHero(file: Blob): Promise<HeroFrame> {
  const source = await createImageBitmap(file);
  // A desktop full-page capture is tall, but it is not narrow. Phone shots are.
  const portrait = source.width <= 900 && source.height > source.width;
  const targetH = Math.max(1, Math.round(source.width * HERO_RATIO));
  const cropH = Math.min(source.height, targetH);
  const cropped = cropH < source.height - 1;
  if (!cropped) {
    return { bitmap: source, blob: file, portrait, cropped: false };
  }
  const blob = await rasterTop(source, source.width, cropH);
  source.close();
  const bitmap = await createImageBitmap(blob);
  return { bitmap, blob, portrait, cropped: true };
}

async function rasterTop(source: ImageBitmap, width: number, height: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(source, 0, 0, width, height, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/png" });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(source, 0, 0, width, height, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png"))), "image/png");
  });
}
