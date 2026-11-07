import sharp from 'sharp';
import {env,AutoProcessor,CLIPVisionModelWithProjection,Dinov2Model,SiglipVisionModel,RawImage} from '@huggingface/transformers';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const root='quality/generated/model-comparison';await mkdir(root+'/fixtures',{recursive:true});
const norm=(row:number[])=>{const length=Math.hypot(...row);return row.map(x=>x/length);};
const cosine=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
function page(family:number,variant:string){
 const dark=family%2===1, recolor=variant==='recolor';
 const bg=recolor?'#f4eddc':dark?'#122331':'#f6f8fc',fg=recolor?'#442810':dark?'#e9f5ff':'#152438',accent=recolor?'#b2492c':['#2165bb','#178262','#973ab5','#bb5424'][family%4];
 const changed=variant==='layout',text=variant==='text';
 const cards=Array.from({length:3},(_,i)=>`<rect x="${50+i*265}" y="${changed?160:385}" width="240" height="105" rx="${family*2}" fill="${accent}" opacity=".14"/><text x="${65+i*265}" y="${changed?197:422}" fill="${fg}" font-size="18">${text?'New choice':'Feature'} ${i+1}</text><rect x="${65+i*265}" y="${changed?215:440}" width="170" height="8" fill="${fg}" opacity=".5"/>`).join('');
 const title=text?'Ideas for your team':'Build something useful';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="563"><rect width="900" height="563" fill="${bg}"/><text x="45" y="45" font-family="sans-serif" font-size="22" fill="${fg}">Studio ${family+1}</text><rect x="710" y="20" width="140" height="36" rx="8" fill="${accent}"/><text x="${changed?130:50}" y="${changed?345:160}" font-family="sans-serif" font-size="${34+family}" fill="${fg}">${title}</text><rect x="${changed?130:50}" y="${changed?370:190}" width="360" height="12" fill="${fg}" opacity=".5"/><rect x="${changed?130:50}" y="${changed?393:216}" width="300" height="12" fill="${fg}" opacity=".3"/><rect x="${changed?130:50}" y="${changed?427:260}" width="180" height="44" rx="8" fill="${accent}"/><rect x="${changed?600:540}" y="${changed?320:105}" width="${changed?220:310}" height="${changed?180:220}" rx="${10+family*3}" fill="${accent}" opacity=".4"/><circle cx="${changed?710:695}" cy="${changed?400:215}" r="${45+family*3}" fill="${accent}"/>${cards}</svg>`;
}
const fixtures:{id:string;family:number;variant:string;bytes:Buffer}[]=[];
for(let family=0;family<8;family++)for(const variant of ['base','recolor','text','layout']){
 const bytes=await sharp(Buffer.from(page(family,variant))).png().toBuffer();const id=`family-${family}-${variant}`;
 await writeFile(`${root}/fixtures/${id}.png`,bytes);fixtures.push({id,family,variant,bytes});
}
const catalog=JSON.parse(await readFile('public/data/catalog.json','utf8'));
const samples=[];for(let k=0;k<12;k++){const site=catalog.sites[Math.floor(k*catalog.sites.length/12)];const bytes=await readFile(`public/data/${site.thumb}`);const {width:w,height:h}=await sharp(bytes).metadata();samples.push({slug:site.slug,variants:[{name:'base',bytes},{name:'jpeg60',bytes:await sharp(bytes).jpeg({quality:60}).toBuffer()},{name:'resize75',bytes:await sharp(bytes).resize(Math.round(w!*.75)).png().toBuffer()},{name:'crop2',bytes:await sharp(bytes).extract({left:Math.floor(w!*.02),top:Math.floor(h!*.02),width:Math.floor(w!*.96),height:Math.floor(h!*.96)}).resize(w,h).png().toBuffer()}]});}
const fixtureManifest=fixtures.map(({id,family,variant,bytes})=>({id,family,variant,sha256:createHash('sha256').update(bytes).digest('hex')}));
await writeFile('quality/controlled-fixtures.json',JSON.stringify({schema:1,renderer:sharp.versions,fontNote:'System sans-serif fonts; PNG hashes record actual rendered inputs. Different fonts can change results.',description:'32 SVG-rendered controlled page fixtures. Same text/colors with moved layout; recolor preserves geometry; text variant preserves geometry. These are interventions, not human similarity labels.',fixtures:fixtureManifest},null,2)+'\n');
const specs=[{name:'mobileclip',id:'Xenova/mobileclip_s0',path:'./public/models/',type:CLIPVisionModelWithProjection},{name:'dinov2',id:'onnx-community/dinov2-small',path:`./${root}/models/`,type:Dinov2Model},{name:'siglip2',id:'onnx-community/siglip2-base-patch16-224-ONNX',path:`./${root}/models/`,type:SiglipVisionModel}];
const reports=[];
for(const spec of specs){
 env.allowRemoteModels=false;env.localModelPath=spec.path;
 const processor=await AutoProcessor.from_pretrained(spec.id);const start=performance.now();
 const model=await spec.type.from_pretrained(spec.id,{dtype:'fp16',device:'cpu'});const loadMs=performance.now()-start;
 const times:number[]=[];
 async function encode(bytes:Buffer){const image=await RawImage.fromBlob(new Blob([new Uint8Array(bytes)]));const side=Math.min(image.width,image.height);const crops=await Promise.all([image.crop([0,0,side-1,side-1]),image.crop([image.width-side,0,image.width-1,side-1])]);const t=performance.now();const outputs=await model(await processor(crops));const tensor=outputs.image_embeds??outputs.pooler_output;const pooled=tensor ? tensor.tolist() as number[][] : (outputs.last_hidden_state.tolist() as number[][][]).map(row=>row[0]);const rows=pooled.map(norm);times.push(performance.now()-t);return norm(rows[0].map((v,i)=>(v+rows[1][i])/2));}
 const embedded=new Map<string,number[]>();for(const f of fixtures){embedded.set(f.id,await encode(f.bytes));}console.log(spec.name,'controlled fixtures encoded');
 const controlled=[];for(let family=0;family<8;family++){const base=embedded.get(`family-${family}-base`)!;const sim=(v:string)=>cosine(base,embedded.get(`family-${family}-${v}`)!);controlled.push({family,recolor:sim('recolor'),text:sim('text'),layout:sim('layout'),recolorAboveLayout:sim('recolor')>sim('layout'),textAboveLayout:sim('text')>sim('layout')});}
 const real=[];for(const sample of samples){const vectors=[];for(const v of sample.variants)vectors.push({name:v.name,vector:await encode(v.bytes)});real.push({slug:sample.slug,vectors});}
 const perturbations=[];for(const sample of real){const baseline=sample.vectors[0].vector;const rank=(v:number[])=>real.filter(x=>x.slug!==sample.slug).map(x=>({slug:x.slug,cosine:cosine(v,x.vectors[0].vector)})).sort((a,b)=>b.cosine-a.cosine).slice(0,3);const original=rank(baseline);for(const v of sample.vectors.slice(1)){const next=rank(v.vector);perturbations.push({slug:sample.slug,variant:v.name,cosine:cosine(baseline,v.vector),top1Unchanged:next[0].slug===original[0].slug,top3Overlap:next.filter(x=>original.some(y=>x.slug===y.slug)).length/3});}}
 times.sort((a,b)=>a-b);reports.push({name:spec.name,id:spec.id,dtype:'fp16',dim:embedded.values().next().value!.length,loadMs:Math.round(loadMs),medianEncodeMs:Math.round(times[Math.floor(times.length/2)]),controlled,summary:{recolorAboveLayout:controlled.filter(x=>x.recolorAboveLayout).length,textAboveLayout:controlled.filter(x=>x.textAboveLayout).length,families:8},perturbations});
 await model.dispose();await writeFile('quality/model-comparison.json',JSON.stringify({schema:1,complete:reports.length===specs.length,protocol:'Node CPU, same two square crops averaged after L2 normalization, each model uses its published processor. 32 controlled fixtures and 12 fixed real catalog entries × 4 versions. Real retrieval pool only 12 entries, not full catalog. No labels, threshold tuning, or semantic accuracy claim. Geometry preference is a hypothesis, not ground truth.',runtime:process.version,models:reports},null,2)+'\n');console.log(spec.name,reports.at(-1)!.summary,'median',reports.at(-1)!.medianEncodeMs);
}
