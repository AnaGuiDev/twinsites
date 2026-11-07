import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {validateEvaluationPairs} from "../src/lib/pair-validation.ts";
const labels=JSON.parse(await readFile("quality/pairs/labels-ai.json","utf8"));
const catalog=JSON.parse(await readFile("public/data/catalog.json","utf8"));
const bin=await readFile("public/data/embeddings.bin");
const vectors=new Float32Array(new Uint8Array(bin.subarray(16)).buffer);
const baseline=JSON.parse(await readFile("quality/pairs/baseline-q8.json","utf8"));
validateEvaluationPairs(labels.pairs);
if (baseline.scores.length !== labels.pairs.length) throw new Error("Baseline count mismatch");
for (const pair of labels.pairs) {
 const scores = baseline.scores.filter((s:{id:string})=>s.id===pair.id);
 if (scores.length !== 1 || scores[0].a !== pair.a || scores[0].b !== pair.b || !Number.isFinite(scores[0].cosine)) throw new Error(`Baseline identity mismatch: ${pair.id}`);
}
type Row={id:string;a:string;b:string;label:number;split:string;cosine:number};
const rows:Row[]=labels.pairs.map((p:Row)=>{const a=catalog.sites.findIndex((s:{slug:string})=>s.slug===p.a),b=catalog.sites.findIndex((s:{slug:string})=>s.slug===p.b);if(a<0||b<0)throw new Error("Missing site");let cosine=0;for(let d=0;d<512;d++)cosine+=vectors[a*512+d]*vectors[b*512+d];return {...p,cosine};});
const devSites=new Set(rows.filter(r=>r.split==="development").flatMap(r=>[r.a,r.b]));if(rows.some(r=>r.split==="test"&&(devSites.has(r.a)||devSites.has(r.b))))throw new Error("Site leakage");
function metrics(data:Row[],threshold:number){let tp=0,fp=0,tn=0,fn=0;for(const r of data){if(r.label===2){if(r.cosine>=threshold)tp++;else fn++;}else{if(r.cosine>=threshold)fp++;else tn++;}}return {count:data.length,tp,fp,tn,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,balancedAccuracy:((tp/(tp+fn||1))+(tn/(tn+fp||1)))/2};}
function evaluate(data:Row[]){const dev=data.filter(r=>r.split==="development");const thresholds=[-1,...dev.map(r=>r.cosine),1.000001];thresholds.sort((a,b)=>b-a);const threshold=thresholds.reduce((best,t)=>metrics(dev,t).balancedAccuracy>metrics(dev,best).balancedAccuracy?t:best,thresholds[0]);return {threshold,development:metrics(dev,threshold),test:metrics(data.filter(r=>r.split==="test"),threshold)};}
const result={schema:2,uniquePairCount:rows.length,protocol:"Corrected exploratory evaluation after duplicate review; not a new untouched holdout. P16/P34 restored from the original seeded selection and labeled before computing replacement scores.",labelSource:"AI visual annotation, not independent human validation",humanLabelsVerified:false,positiveDefinition:"label 2 only; partial resemblance counts as negative",thresholdRule:"Maximize development balanced accuracy; ties select the higher threshold. Corrected test reported after duplicate review; not an untouched holdout.",limitations:["60 unique curated pairs; not a representative sample","P16/P34 replaced after the original evaluation was known; a fresh independent holdout is still required","Small positive class, unstable estimates","Same assistant implemented and labeled; no independent validation","Desktop thumbnails only; mobile/full-resolution equivalence not established"],labelsSha256:createHash("sha256").update(await readFile("quality/pairs/labels-ai.json")).digest("hex"),embeddingSha256:createHash("sha256").update(bin).digest("hex"),candidate:evaluate(rows),baseline:evaluate(rows.map(r=>({...r,cosine:baseline.scores.find((s:{id:string})=>s.id===r.id).cosine}))),pairs:rows.map(({id,cosine,label,split})=>({id,cosine,label,split}))};
await writeFile("quality/pairs/evaluation.json",JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({candidate:result.candidate,baseline:result.baseline},null,2));
