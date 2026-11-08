import {test} from 'node:test';import assert from 'node:assert/strict';
import {distinctCaptures,duplicateCaptureCount} from '../src/lib/catalog-duplicates.ts';
test('audited identical captures collapse in order without removing different screenshots',()=>{
 const items=['twimate','unrelated','twiflux'].map(slug=>({site:{slug}}));
 assert.deepEqual(distinctCaptures(items).map(x=>x.site.slug),['twimate','unrelated']);
 assert.equal(duplicateCaptureCount('twiflux'),2);assert.equal(duplicateCaptureCount('unrelated'),1);
});
test('duplicate audit belongs to the catalog shipped with these groups',async()=>{
 const {readFile}=await import('node:fs/promises');const {createHash}=await import('node:crypto');
 const audit=JSON.parse(await readFile('quality/catalog-audit.json','utf8'));
 assert.equal(createHash('sha256').update(await readFile('public/data/catalog.json')).digest('hex'),audit.catalogSha256);
});


test('unique retrieval fills the requested slots without changing the highest scoring representative',async()=>{
 const {nearestDistinct, nearest}=await import('../src/lib/match.ts');
 const slugs=['twiflux','twimate','one','two','three'];
 const dataset={dim:1,embeddings:new Float32Array([.9,.95,.8,.7,.6]),catalog:{sites:slugs.map(slug=>({slug}))}} as any;
 const result=nearestDistinct(new Float32Array([1]),dataset,3);
 assert.deepEqual(result.map(x=>x.site.slug),['twimate','one','two']);
 assert.deepEqual(result.map(x=>x.index),[1,2,3]);
 assert.equal(nearest(new Float32Array([1]),dataset,3).length,3);
 assert.equal(nearestDistinct(new Float32Array([1]),dataset,20).length,4);
 assert.deepEqual(nearestDistinct(new Float32Array([1]),dataset,0),[]);
});

test('every audited duplicate group still contains byte-identical captures',async()=>{
 const {readFile}=await import('node:fs/promises');
 const audit=JSON.parse(await readFile('quality/catalog-audit.json','utf8'));
 const catalog=JSON.parse(await readFile('public/data/catalog.json','utf8'));
 for(const group of audit.exactDuplicateGroups){
  const images=await Promise.all(group.map(async(slug:string)=>{
   const site=catalog.sites.find((s:any)=>s.slug===slug);assert.ok(site,slug);
   return readFile('public/data/'+site.thumb);
  }));
  for(const image of images.slice(1))assert.ok(images[0].equals(image),group.join(', '));
 }
});
