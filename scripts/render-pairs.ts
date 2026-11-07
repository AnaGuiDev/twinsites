import {readFile,mkdir} from "node:fs/promises";
import sharp from "sharp";
const catalog=JSON.parse(await readFile("public/data/catalog.json","utf8"));
const {pairs}=JSON.parse(await readFile("quality/pairs/labels-ai.json","utf8"));
await mkdir("quality/generated",{recursive:true});
for(let page=0;page<6;page++) {
 const layers: sharp.OverlayOptions[]=[];
 for(let row=0;row<10;row++) {
  const pair=pairs[page*10+row];
  layers.push({input:Buffer.from(`<svg width="900" height="28"><rect width="900" height="28" fill="#111"/><text x="12" y="20" fill="white" font-size="17" font-family="sans-serif">${pair.id} · A / B · label without similarity score</text></svg>`),left:0,top:row*300});
  for(const [col,slug] of [pair.a,pair.b].entries()) {
   const site=catalog.sites.find((s:{slug:string})=>s.slug===slug);
   const input=await sharp(`public/data/${site.thumb}`).resize(420,263,{fit:"contain",background:"#ddd"}).toBuffer();
   layers.push({input,left:col*450+10,top:row*300+32});
  }
 }
 await sharp({create:{width:900,height:3000,channels:3,background:"#ddd"}}).composite(layers).png().toFile(`quality/generated/pairs-sheet-${page+1}.png`);
}
