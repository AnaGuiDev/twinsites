import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {env,AutoProcessor,Dinov2Model,RawImage} from '@huggingface/transformers';
import {validateEvaluationPairs} from '../src/lib/pair-validation.ts';
const labelsBytes=await readFile('quality/pairs/labels-ai.json');const labels=JSON.parse(labelsBytes.toString()).pairs;validateEvaluationPairs(labels);
const catalog=JSON.parse(await readFile('public/data/catalog.json','utf8'));
const candidate=JSON.parse(await readFile('quality/pairs/evaluation.json','utf8'));
if(candidate.labelsSha256!==createHash('sha256').update(labelsBytes).digest('hex'))throw Error('Label identity mismatch');
env.allowRemoteModels=false;env.localModelPath='./quality/generated/model-comparison/models/';
const id='onnx-community/dinov2-small';const p=await AutoProcessor.from_pretrained(id);const m=await Dinov2Model.from_pretrained(id,{dtype:'fp16',device:'cpu'});
const norm=(a:number[])=>{const n=Math.hypot(...a);return a.map(v=>v/n);};const vectors=new Map<string,number[]>();
const slugs=[...new Set<string>(labels.flatMap((x:any)=>[x.a,x.b]))].sort();
for(const slug of slugs){const site=catalog.sites.find((s:any)=>s.slug===slug);if(!site)throw Error(slug);const image=await RawImage.read(`public/data/${site.thumb}`);const side=Math.min(image.width,image.height);const crops=await Promise.all([image.crop([0,0,side-1,side-1]),image.crop([image.width-side,0,image.width-1,side-1])]);const out=await m(await p(crops));const rows=(out.last_hidden_state.tolist() as number[][][]).map(row=>norm(row[0]));vectors.set(slug,norm(rows[0].map((v,i)=>(v+rows[1][i])/2)));if(vectors.size%10===0)console.log(vectors.size,'/',slugs.length);}
const rows=labels.map((x:any)=>({...x,cosine:vectors.get(x.a)!.reduce((s,v,i)=>s+v*vectors.get(x.b)![i],0)}));
function metrics(data:any[],threshold:number){let tp=0,fp=0,tn=0,fn=0;for(const r of data){if(r.label===2){if(r.cosine>=threshold)tp++;else fn++;}else if(r.cosine>=threshold)fp++;else tn++;}return{count:data.length,tp,fp,tn,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,balancedAccuracy:((tp/(tp+fn||1))+(tn/(tn+fp||1)))/2};}
const dev=rows.filter((x:any)=>x.split==='development');const thresholds=[-1,...dev.map((x:any)=>x.cosine),1.000001].sort((a,b)=>b-a);const threshold=thresholds.reduce((best,t)=>metrics(dev,t).balancedAccuracy>metrics(dev,best).balancedAccuracy?t:best,thresholds[0]);
const report={schema:1,model:id,dtype:'fp16',runtime:'Node CPU; CLS token; normalized mean of two overlapping square crops',labelsSha256:candidate.labelsSha256,protocol:'Same 60 previously AI-labeled pairs and same development/test split; threshold maximizes development balanced accuracy, ties choose larger. Exploratory reused test, not independent human validation. MobileCLIP comparison uses committed browser-encoded catalog scores; DINOv2 uses CPU inference.',humanLabelsVerified:false,uniqueImages:slugs.length,dinov2:{threshold,development:metrics(dev,threshold),test:metrics(rows.filter((x:any)=>x.split==='test'),threshold)},mobileclip:candidate.candidate,pairs:rows.map(({id,a,b,cosine,label,split}:any)=>({id,a,b,cosine,label,split}))};
await writeFile('quality/dinov2-pairs.json',JSON.stringify(report,null,2)+'\n');console.log({dinov2:report.dinov2,mobileclip:report.mobileclip});await m.dispose();
