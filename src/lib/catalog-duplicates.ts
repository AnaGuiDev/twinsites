import review from '../../quality/capture-review.json';
import audit from '../../quality/catalog-audit.json';
const quarantined=new Set<string>(review.entries.map(entry=>entry.slug));
export function isCaptureQuarantined(slug:string):boolean{return quarantined.has(slug);}
const groups=new Map<string,string[]>();
for(const group of audit.exactDuplicateGroups)for(const slug of group)groups.set(slug,group);
export function duplicateCaptureCount(slug:string):number{return groups.get(slug)?.length??1;}
/** Collapse only audited byte-identical captures in the visible list, preserving ranking. */
export function distinctCaptures<T extends {site:{slug:string}}>(items:T[]):T[]{
 const seen=new Set<string>();return items.filter(item=>{if(isCaptureQuarantined(item.site.slug))return false;const key=groups.get(item.site.slug)?.[0]??item.site.slug;if(seen.has(key))return false;seen.add(key);return true;});
}
