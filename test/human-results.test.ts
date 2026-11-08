import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-ignore standalone Node importer
import {summarize} from '../scripts/human-results.mjs';
import {resultCandidates} from '../src/lib/result-candidates.ts';
const s=(session:string,rating='strong')=>({schema:1,dataset:'pairs-60-v1',session,complete:true,order:['P01'],answers:{P01:{rating,confidence:rating==='unratable'?null:'high',comment:''}}});
test('imports independent session files, preserves disagreement and rejects duplicate sessions',()=>{
 const r=summarize([s('a'),s('b','partial')],['P01']);assert.equal(r.sessions,2);assert.equal(r.pairs[0].disagreement,true);assert.equal(r.releaseReady,false);
 assert.throws(()=>summarize([s('a'),s('a')],['P01']));assert.throws(()=>summarize([{...s('a'),complete:false}],['P01']));assert.throws(()=>summarize([s('a','invented')],['P01']));
 assert.equal(summarize([s('a','unratable')],['P01']).pairs[0].needsReview,true);
});
test('candidate presentation limits to three, abstains, excludes quarantine and deduplicates',()=>{
 const items=['aria-8-polsia','twiflux','twimate','a','b','c'].map((slug,i)=>({site:{slug},percentile:99-i}));
 assert.deepEqual(resultCandidates(items,90).map(x=>x.site.slug),['twiflux','a','b']);
 assert.deepEqual(resultCandidates(items,100),[]);assert.deepEqual(resultCandidates(items,NaN),[]);
});
