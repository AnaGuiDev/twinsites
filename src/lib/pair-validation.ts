export type EvaluationPair = { id: string; a: string; b: string; split: string };

/** Pair identity is unordered; repeated sites within a split are allowed. */
export function validateEvaluationPairs(pairs: EvaluationPair[]): void {
  const ids = new Set<string>();
  const identities = new Set<string>();
  const devSites = new Set<string>();
  for (const pair of pairs) {
    if (!pair.id || ids.has(pair.id)) throw new Error(`Duplicate or empty pair ID: ${pair.id}`);
    ids.add(pair.id);
    if (!pair.a || !pair.b || pair.a === pair.b) throw new Error(`Invalid sites: ${pair.id}`);
    if (!["development", "test"].includes(pair.split)) throw new Error(`Invalid split: ${pair.id}`);
    const identity = JSON.stringify([pair.a, pair.b].sort());
    if (identities.has(identity)) throw new Error(`Duplicate unordered pair: ${pair.id}`);
    identities.add(identity);
    if (pair.split === "development") { devSites.add(pair.a); devSites.add(pair.b); }
  }
  for (const pair of pairs) {
    if (pair.split === "test" && (devSites.has(pair.a) || devSites.has(pair.b))) {
      throw new Error(`Site leakage: ${pair.id}`);
    }
  }
}
