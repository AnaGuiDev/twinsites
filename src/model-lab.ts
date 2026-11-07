import { embedBlob } from "./lib/model";
const shard = Number(new URLSearchParams(location.search).get("shard") || 0);
const status = document.querySelector<HTMLPreElement>("#status")!;
const run = document.querySelector<HTMLButtonElement>("#run")!;
const stability = document.querySelector<HTMLButtonElement>("#stability")!;
async function encode(thumb: string) { const response = await fetch(`/data/${thumb}`); if (!response.ok) throw new Error(thumb); return Array.from(await embedBlob(await response.blob())); }
async function save(name: string, body: unknown) { const response = await fetch(`/__model_lab/${name}`, {method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify(body)}); if (!response.ok) throw new Error(`Save failed: ${response.status}`); }
async function execute(mode: "catalog" | "stability") {
  run.disabled = stability.disabled = true;
  try {
    const catalog = await (await fetch("/data/catalog.json")).json();
    const rows: number[][] = []; const times: number[] = [];
    const sites = mode === "catalog" ? catalog.sites.filter((_:unknown,i:number) => i % 4 === shard) : [catalog.sites[0], catalog.sites[1001], catalog.sites[2002]];
    for (let i = 0; i < sites.length; i++) {
      const start = performance.now();
      if (mode === "catalog") rows.push(await encode(sites[i].thumb));
      else for (let repeat = 0; repeat < 3; repeat++) rows.push(await encode(sites[i].thumb));
      times.push(performance.now() - start);
      status.textContent = `${mode} shard ${shard}: ${i + 1}/${sites.length}`;
      if (mode === "catalog" && ((i+1)%100 === 0 || i+1 === sites.length)) await save(`catalog-${shard}`, {slugs: sites.slice(0,i+1).map((s: {slug:string})=>s.slug), rows, times});
    }
    if (mode === "stability") await save("stability", {rows, times, userAgent: navigator.userAgent});
    status.textContent = `${mode} complete: ${rows.length} vectors saved. ${Math.round(times.reduce((a,b)=>a+b,0)/1000)} seconds.`;
  } catch (error) { status.textContent = String(error); }
  finally { run.disabled = stability.disabled = false; }
}
run.onclick = () => void execute("catalog"); stability.onclick = () => void execute("stability");
