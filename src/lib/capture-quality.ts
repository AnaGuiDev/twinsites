/** Conservative input suitability rules, not a design-quality classifier. */
export function captureIssue(width: number, height: number): 'small' | 'portrait' | 'large' | null {
  if (width * height > 40_000_000) return 'large';
  if (width < 640 || height < 320) return 'small';
  if (width <= 900 && height > width) return 'portrait';
  return null;
}
