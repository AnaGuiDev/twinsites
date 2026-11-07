import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
const evidence = JSON.parse(await readFile(new URL('../quality/model-encoding.json', import.meta.url), 'utf8'));
const target = new URL('../public/models/Xenova/mobileclip_s0/onnx/vision_model_fp16.onnx', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let existing;
try { existing = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (existing && digest(existing) === evidence.modelSha256) {
  console.log('FP16 model: pinned SHA-256 verified');
} else {
  const response = await fetch(`https://huggingface.co/Xenova/mobileclip_s0/resolve/${evidence.revision}/onnx/vision_model_fp16.onnx`, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== evidence.modelSha256) throw new Error('Model SHA-256 mismatch; refusing publication');
  await mkdir(new URL('.', target), { recursive: true });
  const temporary = new URL(`${target.href}.tmp-${process.pid}`);
  try { await writeFile(temporary, bytes); await rename(temporary, target); }
  finally { await rm(temporary, { force: true }); }
  console.log('FP16 model: downloaded and pinned SHA-256 verified');
}
