import { distinctCaptures } from './catalog-duplicates';
/** Existing percentile filter, not a calibrated probability of strong resemblance. */
export function resultCandidates<T extends {site:{slug:string};percentile:number}>(items:T[],band:number):T[]{
 if(!Number.isFinite(band)||band<0||band>100)return [];
 return distinctCaptures(items.filter(item=>Number.isFinite(item.percentile)&&item.percentile>=band))
  .sort((a,b)=>b.percentile-a.percentile).slice(0,3);
}
