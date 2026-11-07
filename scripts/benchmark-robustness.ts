import sharp from 'sharp';
import {env,AutoProcessor,CLIPVisionModelWithProjection,RawImage} from '@huggingface/transformers';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
env.allowRemoteModels=false;env.localModelPath='./public/models/';
const model=await CLIPVisionModelWithProjection.from_pretrained('Xenova/mobileclip_s0',{dtype:'fp16',device:'cpu'});
const processor=await AutoProcessor.from_pretrained('Xenova/mobileclip_s0');
const catalog=JSON.parse(await readFile('public/data/catalog.json','utf8'));
const binary=await readFile('public/data/embeddings.bin');
const vectors=new Float32Array(new Uint8Array(binary.subarray(16)).buffer);
const cosine=(a:number[],b:ArrayLike<number>)=>a.reduce((s,v,i)=>s+v*b[i],0);
async function encode(bytes:Buffer){
 const image=await RawImage.fromBlob(new Blob([new Uint8Array(bytes)]));const side=Math.min(image.width,image.height);
 const crops=await Promise.all([image.crop([0,0,side-1,side-1]),image.crop([image.width-side,0,image.width-1,side-1])]);
 const start=performance.now();const result=await model(await processor(crops));const rows=result.image_embeds.normalize().tolist() as number[][];
 const avg=rows[0].map((_,i)=>(rows[0][i]+rows[1][i])/2);const norm=Math.hypot(...avg);return {vector:avg.map(v=>v/norm),ms:performance.now()-start};
}
function ranking(vector:number[], excluded:string){return catalog.sites.map((s:any,i:number)=>({slug:s.slug,score:cosine(vector,vectors.subarray(i*512,(i+1)*512))})).filter((row:any)=>row.slug!==excluded).sort((a:any,b:any)=>b.score-a.score).slice(0,10);}
const results=[];
for(let k=0;k<24;k++){
 const index=Math.floor(k*catalog.sites.length/24),site=catalog.sites[index];const source=await readFile(`public/data/${site.thumb}`);const base=await encode(source);const top=ranking(base.vector,site.slug);const meta=await sharp(source).metadata();const w=meta.width!,h=meta.height!;
 const variants=[['repeat',source],['jpeg-q60',await sharp(source).jpeg({quality:60}).toBuffer()],['resize-75pct',await sharp(source).resize(Math.round(w*.75)).png().toBuffer()],['crop-2pct',await sharp(source).extract({left:Math.floor(w*.02),top:Math.floor(h*.02),width:Math.floor(w*.96),height:Math.floor(h*.96)}).resize(w,h).png().toBuffer()],['brightness-105pct',await sharp(source).modulate({brightness:1.05}).png().toBuffer()]] as const;
 const measurements=[];for(const [name,bytes]of variants){const v=await encode(bytes);const ranked=ranking(v.vector,site.slug);measurements.push({name,cosineToOriginal:cosine(base.vector,v.vector),top1Unchanged:ranked[0].slug===top[0].slug,top10Overlap:ranked.filter((x:any)=>top.some((y:any)=>y.slug===x.slug)).length/10,inferenceMs:Math.round(v.ms),top3:ranked.slice(0,3)});}
 results.push({slug:site.slug,index,baselineCatalogCosine:cosine(base.vector,vectors.subarray(index*512,(index+1)*512)),variants:measurements});console.log(`${k+1}/24 ${site.slug}`);
}
const names=results[0].variants.map(x=>x.name);const summary=names.map(name=>{const rows=results.map(r=>r.variants.find(v=>v.name===name)!);return{name,minCosine:Math.min(...rows.map(r=>r.cosineToOriginal)),meanTop10Overlap:rows.reduce((s,r)=>s+r.top10Overlap,0)/rows.length,top1Unchanged:rows.filter(r=>r.top1Unchanged).length,count:rows.length};});
const report={schema:1,runtime:'ONNX Runtime Node CPU FP16; not browser/device validation',protocol:'24 evenly spaced catalog entries, 5 fixed perturbations each. No tuning or human labels. Top-k excludes query identity; this measures neighborhood stability, not semantic accuracy.',embeddingSha256:createHash('sha256').update(binary).digest('hex'),summary,results};
await writeFile('quality/robustness-node.json',JSON.stringify(report,null,2)+'\n');console.log(summary);
