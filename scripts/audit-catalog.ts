import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const bytes=await readFile('public/data/catalog.json');
const catalog=JSON.parse(bytes.toString());
const exact=new Map<string,string[]>();const pixels=new Map<string,string[]>();const suspects:any[]=[];
for(const site of catalog.sites){
 try{
 const image=await readFile(`public/data/${site.thumb}`);const meta=await sharp(image).metadata();
 const raw=await sharp(image).resize(64,40,{fit:'fill'}).removeAlpha().raw().toBuffer();
 const stats=await sharp(image).stats();
 const hash=createHash('sha256').update(image).digest('hex');
 const pixelHash=createHash('sha256').update(raw).digest('hex');
 for(const [map,key] of [[exact,hash],[pixels,pixelHash]] as const){const group=map.get(key)||[];group.push(site.slug);map.set(key,group);}
 const reasons=[];
 if(!meta.width||!meta.height||meta.width<400||meta.height<200)reasons.push('unexpected-small-dimensions');
 if(meta.width&&meta.height&&Math.abs(meta.width/meta.height-1.6)>.12)reasons.push('unexpected-aspect-ratio');
 if(stats.channels.slice(0,3).every(c=>c.stdev<3))reasons.push('near-uniform-image');
 if(reasons.length)suspects.push({slug:site.slug,thumb:site.thumb,width:meta.width,height:meta.height,reasons});
 }catch(error){suspects.push({slug:site.slug,reasons:['unreadable-image'],error:String(error)});}
}
const report={schema:1,catalogSha256:createHash('sha256').update(bytes).digest('hex'),count:catalog.sites.length,policy:'Read-only audit; flags require review, no automatic deletion. Does not detect semantic error pages or banners.',exactDuplicateGroups:[...exact.values()].filter(g=>g.length>1),identicalResizedPixelGroups:[...pixels.values()].filter(g=>g.length>1),suspects};
await writeFile('quality/catalog-audit.json',JSON.stringify(report,null,2)+'\n');console.log({count:report.count,exactGroups:report.exactDuplicateGroups.length,pixelGroups:report.identicalResizedPixelGroups.length,suspects:suspects.length});
