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
