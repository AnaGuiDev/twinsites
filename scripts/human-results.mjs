import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
export function summarize(submissions,ids){
 const allowed=new Set(ids),sessions=new Set(),ratings=['strong','partial','superficial','none','unratable'];
 const rows=ids.map(id=>({id,ratings:Object.fromEntries(ratings.map(r=>[r,0])),responses:0,lowConfidence:0}));
 for(const s of submissions){
  if(s.schema!==1||s.dataset!=='pairs-60-v1'||typeof s.session!=='string'||!s.session||sessions.has(s.session))throw Error('Invalid dataset/schema or duplicate session');
  if(s.complete!==true||!Array.isArray(s.order)||s.order.length!==ids.length||new Set(s.order).size!==ids.length||s.order.some(id=>!allowed.has(id)))throw Error('Incomplete or incompatible questionnaire');
  if(!s.answers||Object.keys(s.answers).length!==ids.length||Object.keys(s.answers).some(id=>!allowed.has(id)))throw Error('Missing or unknown pair');
  for(const row of rows){const a=s.answers[row.id];if(!a||!ratings.includes(a.rating)||(a.rating==='unratable'?a.confidence!==null:!['high','medium','low'].includes(a.confidence))||typeof a.comment!=='string'||a.comment.length>500)throw Error('Invalid answer '+row.id);row.ratings[a.rating]++;row.responses++;if(a.confidence==='low')row.lowConfidence++;}
  sessions.add(s.session);
 }
 return {schema:1,dataset:'pairs-60-v1',sessions:sessions.size,humanIdentityVerified:false,releaseReady:false,note:'Self-reported browser sessions, not verified unique people. Exploratory reused pairs; no model accuracy or independent validation claimed.',pairs:rows.map(r=>({...r,disagreement:Object.values(r.ratings).filter(n=>n>0).length>1,needsReview:r.responses<2||r.lowConfidence>0||r.ratings.unratable>0||Object.values(r.ratings).filter(n=>n>0).length>1}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [output,...files]=process.argv.slice(2);
 if(!output||!files.length)throw Error('Usage: node scripts/human-results.mjs OUTPUT.json participant1.json [participant2.json ...]');
 if(files.some(f=>resolve(f)===resolve(output)))throw Error('Output must not overwrite input');
 const pairs=JSON.parse(await readFile(new URL('../quality/pairs/labels-ai.json',import.meta.url),'utf8')).pairs;
 const submissions=await Promise.all(files.map(async f=>{const raw=await readFile(f,'utf8');if(raw.length>1000000)throw Error('File too large');return JSON.parse(raw);}));
 const report=summarize(submissions,pairs.map(p=>p.id));await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(`${report.sessions} sessions; ${report.pairs.filter(p=>p.needsReview).length} pairs need review. No production validation claimed.`);
}
