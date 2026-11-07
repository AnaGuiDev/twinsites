import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
const catalog=JSON.parse(await readFile("public/data/catalog.json","utf8"));
const labels=JSON.parse(await readFile("quality/pairs/labels-ai.json","utf8"));
const old=await readFile("public/data/embeddings.bin");
if(catalog.dtype !== "q8") throw new Error("Finalize once from the q8 baseline; restore baseline before repeating.");
const original = new Float32Array(new Uint8Array(old.subarray(16)).buffer);
const dot=(a:ArrayLike<number>,b:ArrayLike<number>)=>Array.from(a).reduce((sum,v,i)=>sum+v*b[i],0);
const baseline=labels.pairs.map((p:{id:string;a:string;b:string})=>{const a=catalog.sites.findIndex((s:{slug:string})=>s.slug===p.a),b=catalog.sites.findIndex((s:{slug:string})=>s.slug===p.b);return {id:p.id,cosine:dot(original.subarray(a*512,(a+1)*512),original.subarray(b*512,(b+1)*512))};});
await writeFile("quality/pairs/baseline-q8.json",JSON.stringify({model:"q8-center-crop",embeddingSha256:createHash("sha256").update(old).digest("hex"),scores:baseline},null,2)+"\n");
const all = new Map<string,number[]>(); const times:number[]=[];
for(let shard=0;shard<4;shard++){const part=JSON.parse(await readFile(`quality/generated/catalog-${shard}.json`,"utf8")); for(let i=0;i<part.rows.length;i++){if(all.has(part.slugs[i]))throw new Error("duplicate");all.set(part.slugs[i],part.rows[i]);}times.push(...part.times);}
if(all.size!==catalog.sites.length)throw new Error(`Incomplete catalog: ${all.size}`);
const vectors = new Float32Array(catalog.sites.length*512);
for(let i=0;i<catalog.sites.length;i++){const row=all.get(catalog.sites[i].slug);if(!row||row.length!==512||row.some(v=>!Number.isFinite(v)))throw new Error("Invalid row");if(Math.abs(dot(row,row)-1)>1e-5)throw new Error("Invalid norm");vectors.set(row,i*512);}
await mkdir("data/raw",{recursive:true});
await writeFile("data/raw/embedded.json",JSON.stringify(catalog.sites));
await writeFile("data/raw/vectors.f32",Buffer.from(vectors.buffer));
await writeFile("data/raw/embed-meta.json",JSON.stringify({count:catalog.sites.length,dim:512}));
times.sort((a,b)=>a-b);
await writeFile("quality/model-encoding.json",JSON.stringify({schema:1,count:all.size,dim:512,input:"Committed 420px desktop thumbnails; raw full-resolution shots unavailable",runtime:"Browser ONNX WASM, one thread per session, four independent shards",crop:"left and right overlapping squares, normalized mean",modelSha256:createHash("sha256").update(await readFile("public/models/Xenova/mobileclip_s0/onnx/vision_model_fp16.onnx")).digest("hex"),revision:"757d59c9c6870a76a4b0306f05f5061bca15c39f",vectorsSha256:createHash("sha256").update(Buffer.from(vectors.buffer)).digest("hex"),medianEncodingMs:times[Math.floor(times.length/2)],note:"Shared cloud browser throughput; not a mobile performance benchmark."},null,2)+"\n");
console.log(`Prepared ${all.size} vectors. Next: dataset:project -- --existing-thumbs`);
