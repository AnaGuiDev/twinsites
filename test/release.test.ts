import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCheck,saveCheck} from "../src/lib/history.ts";
import {MODEL_VERSION} from "../src/lib/model-version.ts";
import {planMarkdown} from "../src/lib/action-plan.ts";
import {TROPES} from "../src/lib/slop.ts";
import {validateEvaluationPairs} from "../src/lib/pair-validation.ts";
test("before/after rejects older model evidence and accepts the current version",()=>{
 let raw:string|null=null;
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;}}});
 const check={at:1,bands:{99:2},nearest:99,zoneEn:"",zoneEs:"",preview:"",verdict:{band:99,count:2,kind:"twins"}};
 raw=JSON.stringify(check);assert.equal(loadCheck(),null);
 saveCheck(check as never);assert.equal(loadCheck()?.modelVersion,MODEL_VERSION);
 raw=JSON.stringify({...check,modelVersion:"different"});assert.equal(loadCheck(),null);
 delete (globalThis as Record<string,unknown>).localStorage;
});
test("all 60 exploratory labels have reasons and disjoint dev/test sites",()=>{
 const {pairs,humanLabelsVerified}=JSON.parse(readFileSync("quality/pairs/labels-ai.json","utf8"));
 assert.equal(pairs.length,60);assert.equal(humanLabelsVerified,false);
 validateEvaluationPairs(pairs);
 const dev=new Set(pairs.filter((p:any)=>p.split==="development").flatMap((p:any)=>[p.a,p.b]));
 for(const p of pairs){assert.ok([0,1,2].includes(p.label));assert.ok(p.reason.length>20);assert.notEqual(p.a,p.b);if(p.split==="test"){assert.ok(!dev.has(p.a));assert.ok(!dev.has(p.b));}}
});
test("pair validation rejects reversed duplicates, reused IDs and site leakage",()=>{
 const pair={id:"A",a:"one",b:"two",split:"development"};
 assert.throws(()=>validateEvaluationPairs([pair,{...pair,id:"B",a:"two",b:"one"}]),/Duplicate unordered pair/);
 assert.throws(()=>validateEvaluationPairs([pair,{...pair,a:"three",b:"four"}]),/pair ID/);
 assert.throws(()=>validateEvaluationPairs([pair,{id:"B",a:"two",b:"three",split:"test"}]),/Site leakage/);
 assert.doesNotThrow(()=>validateEvaluationPairs([pair,{id:"B",a:"one",b:"three",split:"development"},{id:"C",a:"four",b:"five",split:"test"}]));
});
test("action exports keep evidence and completion separate from verification",()=>{
 const signals=TROPES.filter(s=>s.weight>0);
 const md=planMarkdown(signals,{[signals[0].id]:{status:"done",evidence:"Hero: contraste por revisar"}},"Producto para docentes","es");
 assert.match(md,/Producto para docentes/);assert.match(md,/contraste por revisar/);assert.match(md,/no valida/);assert.equal((md.match(/## \d\./g)||[]).length,3);
});

test("shipped model, catalog and normalized vectors share the recorded recipe",async()=>{
 const {createHash}=await import("node:crypto");
 const evidence=JSON.parse(readFileSync("quality/model-encoding.json","utf8"));
 const release=JSON.parse(readFileSync("quality/model-release.json","utf8"));
 const catalog=JSON.parse(readFileSync("public/data/catalog.json","utf8"));
 const bin=readFileSync("public/data/embeddings.bin");
 assert.equal(catalog.recipe,MODEL_VERSION);assert.equal(release.recipe,MODEL_VERSION);
 assert.equal(bin.readUInt32LE(8),512);assert.equal(bin.readUInt32LE(12),catalog.sites.length);
 assert.equal(createHash("sha256").update(bin.subarray(16)).digest("hex"),evidence.vectorsSha256);
 assert.equal(createHash("sha256").update(readFileSync("public/models/Xenova/mobileclip_s0/onnx/vision_model_fp16.onnx")).digest("hex"),evidence.modelSha256);
 for(let row=0;row<catalog.sites.length;row++){let norm=0;for(let d=0;d<512;d++)norm+=bin.readFloatLE(16+(row*512+d)*4)**2;assert.ok(Math.abs(norm-1)<1e-5);}
});
