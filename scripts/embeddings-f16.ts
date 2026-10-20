/**
 * The browser's copy of the catalog vectors at half precision: same header
 * ("TWEM", version 2 = float16), half the bytes. Float32 vectors barely
 * compress, so this is the saving. A cosine moves by about 1e-5, far below
 * one percentile step; embeddings.bin stays the source for every script.
 * Runs as part of `npm run build`.
 */
import { readFileSync, writeFileSync } from "node:fs";

const raw = readFileSync("public/data/embeddings.bin");
if (raw.toString("ascii", 0, 4) !== "TWEM") throw new Error("bad embeddings.bin");
const dim = raw.readUInt32LE(8);
const count = raw.readUInt32LE(12);
const values = new Float32Array(raw.buffer.slice(raw.byteOffset + 16, raw.byteOffset + 16 + count * dim * 4));

const half = new Uint16Array(values.length);
for (let i = 0; i < values.length; i++) half[i] = toHalf(values[i]);

const header = Buffer.alloc(16);
header.write("TWEM", 0, "ascii");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(dim, 8);
header.writeUInt32LE(count, 12);
writeFileSync("public/data/embeddings.f16.bin", Buffer.concat([header, Buffer.from(half.buffer)]));

// Worst cosine change between a catalog vector and its half-precision copy, as a check.
let worst = 0;
for (let row = 0; row < count; row++) {
  let dot = 0;
  for (let j = 0; j < dim; j++) dot += values[row * dim + j] * fromHalf(half[row * dim + j]);
  worst = Math.max(worst, Math.abs(1 - dot));
}
console.log(`embeddings.f16.bin: ${count}×${dim}, worst self-cosine change ${worst.toExponential(1)}`);

/** IEEE 754 float32 → float16, round to nearest even. */
function toHalf(value: number): number {
  const f32 = new Float32Array([value]);
  const bits = new Uint32Array(f32.buffer)[0];
  const sign = (bits >>> 16) & 0x8000;
  const exponent = ((bits >>> 23) & 0xff) - 127 + 15;
  let mantissa = bits & 0x7fffff;
  if (exponent <= 0) {
    if (exponent < -10) return sign;
    mantissa |= 0x800000;
    const shift = 14 - exponent;
    let half = mantissa >> shift;
    const rest = mantissa & ((1 << shift) - 1);
    const midpoint = 1 << (shift - 1);
    if (rest > midpoint || (rest === midpoint && half & 1)) half++;
    return sign | half;
  }
  if (exponent >= 31) return sign | 0x7c00;
  let half = (exponent << 10) | (mantissa >> 13);
  const rest = mantissa & 0x1fff;
  if (rest > 0x1000 || (rest === 0x1000 && half & 1)) half++;
  return sign | half;
}

function fromHalf(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}
