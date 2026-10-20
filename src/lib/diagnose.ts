import { suggest, type Suggestion } from "./suggest";
import type { Traits } from "../types";

export type TraitKey = "mode" | "color" | "density" | "gradient" | "bento" | "centered";

/** One ingredient of the look you share with your twins. */
export interface RecipePart {
  key: TraitKey;
  /** How many of the twelve twins share your value. */
  twins: number;
  /** Share of the whole catalog with your value, 0 to 1. */
  catalog: number;
}

export interface Move {
  item: Suggestion;
  /** How many of the twelve twins share the trait this move addresses. */
  twins: number;
}

export interface Diagnosis {
  recipe: RecipePart[];
  /** Twins that match every part of the recipe at once. */
  recipeTwins: number;
  /** Share of the catalog that matches every part at once, 0 to 1. */
  recipeCatalog: number;
  moves: Move[];
  twinTotal: number;
  catalogTotal: number;
}

/**
 * The traits a diagnosis may name. Checked on 200 random catalog pages
 * labelled by eye, blind to the detector (quality/, npm run reliability): the ground (light
 * or dark) agreed 99% of the time, centring 80% (90% when it says centred).
 * Density, the gradient wash and box grids did not hold up (30%, 3 in 10 and
 * 0 of 6), so they are still measured but never claimed. See /faq.
 */
const KEYS: TraitKey[] = ["mode", "color", "centered"];

function same(key: TraitKey, a: Traits, b: Traits): boolean {
  switch (key) {
    case "mode":
      return a.mode === b.mode;
    case "color":
      return a.dominantName === b.dominantName;
    case "density":
      return a.density === b.density;
    case "gradient":
      return a.gradient === b.gradient;
    case "bento":
      return a.bento === b.bento;
    case "centered":
      return a.centered === b.centered;
  }
}

function keyOf(item: Suggestion): TraitKey {
  switch (item.id) {
    case "shift-hue":
    case "add-accent":
      return "color";
    case "flip-mode":
      return "mode";
    case "open-space":
    case "add-density":
      return "density";
    case "drop-gradient":
    case "add-grain":
      return "gradient";
    case "leave-bento":
      return "bento";
    case "break-center":
      return "centered";
  }
}

/**
 * What makes a page look like its twins, read off the traits they share:
 * the recipe (the values most of the twelve have in common with you), how
 * common that recipe is across the whole catalog, and the moves that would
 * break it, strongest first.
 */
export function diagnose(user: Traits, twins: Traits[], catalog: Traits[]): Diagnosis {
  const count = (key: TraitKey) => twins.filter((twin) => same(key, user, twin)).length;
  const prevalence = (key: TraitKey) =>
    catalog.length ? catalog.filter((site) => same(key, user, site)).length / catalog.length : 0;

  const ranked = KEYS.map((key) => ({ key, twins: count(key), catalog: prevalence(key) })).sort(
    (a, b) => b.twins - a.twins || b.catalog - a.catalog,
  );
  let recipe = ranked.filter((part) => part.twins >= Math.ceil(twins.length * 0.58)).slice(0, 4);
  if (recipe.length < 2) recipe = ranked.slice(0, 2);

  const matchAll = (site: Traits, parts: RecipePart[]) => parts.every((part) => same(part.key, user, site));
  // Keep the recipe specific enough to be true of most twins.
  while (recipe.length > 1 && twins.filter((twin) => matchAll(twin, recipe)).length < Math.ceil(twins.length * 0.42)) {
    recipe = recipe.slice(0, -1);
  }
  const recipeTwins = twins.filter((twin) => matchAll(twin, recipe)).length;
  const recipeCatalog = catalog.length ? catalog.filter((site) => matchAll(site, recipe)).length / catalog.length : 0;

  // Only moves that fit this page and stand on at least half of the twins; the
  // generic fillers suggest() adds to reach three are dropped when weak.
  const fits = (item: Suggestion) => {
    switch (item.id) {
      case "break-center":
        return user.centered;
      case "drop-gradient":
        return user.gradient;
      case "add-grain":
        return !user.gradient;
      case "leave-bento":
        return user.bento;
      case "open-space":
        return user.density === "packed";
      case "add-density":
        return user.density === "airy";
      case "add-accent":
        return user.dominantName === "neutral";
      case "shift-hue":
        return user.dominantName !== "neutral";
      case "flip-mode":
        return true;
    }
  };
  const candidates = suggest(user, twins)
    .filter((item) => fits(item) && KEYS.includes(keyOf(item)))
    .map((item) => ({ item, twins: count(keyOf(item)) }));
  const strong = candidates.filter((move) => move.twins >= Math.ceil(twins.length / 2));
  const moves = strong.length ? strong : candidates.slice(0, 1);
  return { recipe, recipeTwins, recipeCatalog, moves, twinTotal: twins.length, catalogTotal: catalog.length };
}
