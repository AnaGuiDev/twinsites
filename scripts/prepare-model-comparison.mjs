import {readFile,mkdir,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const manifest=JSON.parse(await readFile('quality/model-comparison-downloads.json','utf8'));
const digest=b=>createHash('sha256').update(b).digest('hex');
for(const entry of manifest){
 const path=`quality/generated/model-comparison/models/${entry.repo}/${entry.file}`;
 let existing;try{existing=await readFile(path);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(existing&&digest(existing)===entry.sha256){console.log(`Verified ${entry.repo}/${entry.file}`);continue;}
 await mkdir(path.slice(0,path.lastIndexOf('/')),{recursive:true});
 const temp=`${path}.tmp`;
 try{
  await run('curl',['-fL','--retry','2','--max-time','240','-sS',`https://huggingface.co/${entry.repo}/resolve/${entry.revision}/${entry.file}`,'-o',temp]);
  const bytes=await readFile(temp);if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw Error(`Integrity mismatch: ${entry.repo}/${entry.file}`);
  await rename(temp,path);
 }finally{await rm(temp,{force:true});}
}
