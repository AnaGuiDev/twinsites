/** Conservative input suitability rules, not a design-quality classifier. */
export function captureIssue(width: number, height: number): 'small' | 'portrait' | 'large' | null {
  if (width * height > 40_000_000) return 'large';
  if (width < 640 || height < 320) return 'small';
  if (width <= 900 && height > width) return 'portrait';
  return null;
}

/** Only rejects effectively uniform RGB images. This does not detect loading/error pages. */
export function isUniformCapture(rgba: ArrayLike<number>): boolean {
  if (rgba.length < 4 || rgba.length % 4 !== 0) return true;
  const low=[255,255,255],high=[0,0,0];
  for(let i=0;i<rgba.length;i+=4)for(let c=0;c<3;c++){
    const alpha=rgba[i+3]/255;
    const value=rgba[i+c]*alpha+255*(1-alpha);
    low[c]=Math.min(low[c],value);high[c]=Math.max(high[c],value);
  }
  return high.every((value,c)=>value-low[c]<8);
}
