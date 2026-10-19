import type { ColorName, Traits } from "../types";

export const COLOR_ES: Record<ColorName, string> = {
  red: "rojo",
  orange: "naranja",
  amber: "ámbar",
  yellow: "amarillo",
  lime: "lima",
  green: "verde",
  teal: "turquesa",
  cyan: "cian",
  blue: "azul",
  indigo: "índigo",
  purple: "morado",
  magenta: "magenta",
  pink: "rosa",
  neutral: "neutro",
};

export const COLOR_EN: Record<ColorName, string> = {
  red: "red",
  orange: "orange",
  amber: "amber",
  yellow: "yellow",
  lime: "lime",
  green: "green",
  teal: "teal",
  cyan: "cyan",
  blue: "blue",
  indigo: "indigo",
  purple: "purple",
  magenta: "magenta",
  pink: "pink",
  neutral: "neutral",
};

const HUES: ColorName[] = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "purple",
  "magenta",
  "pink",
];

type Slot = "tone" | "hue" | "quality";

interface Signal {
  id: string;
  en: string;
  es: string;
  weight: number;
  slot: Slot;
}

type Family = "bay" | "ridge" | "bazaar" | "plaza" | "shelf";

const LANDFORMS: Record<Family, [string, string][]> = {
  bay: [
    ["Bay", "Bahía"],
    ["Reach", "Ensenada"],
    ["Atoll", "Atolón"],
    ["Shoal", "Bajío"],
    ["Drift", "Deriva"],
    ["Meadow", "Prado"],
    ["Harbor", "Puerto"],
    ["Coast", "Costa"],
  ],
  ridge: [
    ["Ridge", "Cresta"],
    ["Trench", "Fosa"],
    ["Quarry", "Cantera"],
    ["Vault", "Bóveda"],
    ["Stack", "Pilar"],
    ["Cove", "Cala"],
    ["Mine", "Mina"],
  ],
  bazaar: [
    ["Bazaar", "Bazar"],
    ["Market", "Mercado"],
    ["Falls", "Cascada"],
  ],
  plaza: [
    ["Plaza", "Plaza"],
    ["Axis", "Eje"],
  ],
  shelf: [
    ["Shelf", "Plataforma"],
    ["Isthmus", "Istmo"],
    ["Mesa", "Mesa"],
  ],
};

interface Profile {
  signals: Signal[];
  family: Family;
}

function share(traits: Traits[], pred: (trait: Traits) => boolean): number {
  if (!traits.length) return 0;
  return traits.filter(pred).length / traits.length;
}

function mean(traits: Traits[], key: keyof Traits): number {
  let sum = 0;
  for (const trait of traits) sum += Number(trait[key]) || 0;
  return sum / Math.max(1, traits.length);
}

function std(traits: Traits[], key: keyof Traits, avg: number): number {
  let sum = 0;
  for (const trait of traits) {
    const d = (Number(trait[key]) || 0) - avg;
    sum += d * d;
  }
  return Math.sqrt(sum / Math.max(1, traits.length)) || 1;
}

function profile(members: Traits[], world: Traits[]): Profile {
  const keys = ["luminance", "saturation", "whitespace", "edge", "blockStd", "centerShare"] as const;
  const z = {} as Record<(typeof keys)[number], number>;
  for (const key of keys) {
    const avg = mean(world, key);
    z[key] = (mean(members, key) - avg) / std(world, key, avg);
  }
  const lift = (pred: (trait: Traits) => boolean) => share(members, pred) - share(world, pred);
  const dark = lift((trait) => trait.mode === "dark");
  const airy = lift((trait) => trait.density === "airy");
  const packed = lift((trait) => trait.density === "packed");
  const gradient = lift((trait) => trait.gradient);
  const bento = lift((trait) => trait.bento);
  const centered = lift((trait) => trait.centered);
  const neutral = lift((trait) => trait.dominantName === "neutral");

  let hue: ColorName = "blue";
  let hueLift = -1;
  for (const name of HUES) {
    const value = lift((trait) => trait.dominantName === name);
    if (value > hueLift) {
      hue = name;
      hueLift = value;
    }
  }

  const signals: Signal[] = [];
  if (z.luminance >= 1.05) signals.push({ id: "pale", en: "Pale", es: "luz pálida", weight: z.luminance, slot: "tone" });
  else if (z.luminance >= 0.45) signals.push({ id: "day", en: "Daylight", es: "luz", weight: z.luminance * 0.9, slot: "tone" });
  else if (z.luminance <= -1.05) signals.push({ id: "ink", en: "Ink", es: "tinta", weight: -z.luminance, slot: "tone" });
  else if (z.luminance <= -0.45) signals.push({ id: "dark", en: "Dark", es: "noche", weight: -z.luminance * 0.9, slot: "tone" });
  else if (z.luminance >= 0.22) signals.push({ id: "warm", en: "Warm", es: "calor", weight: 0.42, slot: "tone" });

  if (hueLift >= 0.035) {
    const en = hue === "teal" ? "Teal" : hue.charAt(0).toUpperCase() + hue.slice(1);
    signals.push({ id: `hue-${hue}`, en, es: COLOR_ES[hue], weight: hueLift * 11, slot: "hue" });
  }
  if (gradient >= 0.055) signals.push({ id: "gradient", en: "Gradient", es: "degradado", weight: gradient * 14, slot: "quality" });
  if (bento >= 0.05) signals.push({ id: "bento", en: "Bento", es: "bento", weight: bento * 12, slot: "quality" });
  if (centered >= 0.07) signals.push({ id: "centered", en: "Centered", es: "centro", weight: centered * 12, slot: "quality" });
  if (neutral >= 0.09 || z.saturation <= -0.4) {
    signals.push({
      id: "paper",
      en: "Paper",
      es: "papel",
      weight: Math.max(neutral * 8, -z.saturation),
      slot: "quality",
    });
  } else if (z.saturation >= 0.35) {
    signals.push({ id: "vivid", en: "Vivid", es: "color vivo", weight: z.saturation, slot: "quality" });
  }
  if (packed >= 0.28 && dark >= 0.25) {
    signals.push({ id: "dashboard", en: "Dashboard", es: "panel", weight: packed * 6 + dark * 4, slot: "quality" });
  }
  if (z.whitespace >= 0.5 && airy >= 0.08) {
    signals.push({ id: "open", en: "Open", es: "aire", weight: z.whitespace * 0.62, slot: "quality" });
  }
  if (z.edge <= -0.35 && gradient < 0.05) {
    signals.push({ id: "quiet", en: "Quiet", es: "calma", weight: -z.edge * 0.9, slot: "quality" });
  }
  if (z.edge >= 0.95) signals.push({ id: "busy", en: "Busy", es: "trama", weight: z.edge * 0.45, slot: "quality" });

  signals.sort((a, b) => b.weight - a.weight);

  let family: Family = "shelf";
  if (gradient >= 0.08 && z.edge >= 0.45) family = "bazaar";
  else if (packed >= 0.22 && dark >= 0.22) family = "ridge";
  else if (centered >= 0.1 && airy >= 0.12) family = "plaza";
  else if (airy >= 0.08 && z.luminance > 0) family = "bay";
  else if (packed >= 0.18) family = "ridge";

  return { signals, family };
}

function combinations(signals: Signal[]): Signal[][] {
  if (!signals.length) return [[]];
  const top = signals.slice(0, 5);
  const out: Signal[][] = [];
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) out.push([top[i], top[j]]);
    out.push([top[i]]);
  }
  out.sort((a, b) => {
    const score = (row: Signal[]) => row.reduce((sum, signal) => sum + signal.weight, 0) + (row.length === 2 ? 0.15 : 0);
    return score(b) - score(a);
  });
  return out;
}

const SLOT_ORDER: Record<Slot, number> = { tone: 0, hue: 1, quality: 2 };

function phrase(signals: Signal[], landEn: string, landEs: string): { en: string; es: string } {
  const ordered = [...signals].sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]);
  const en = `${ordered.map((signal) => signal.en).join(" ")} ${landEn}`.trim();
  const bits = ordered.map((signal) => signal.es);
  const es = bits.length > 1 ? `${landEs} de ${bits[0]} y ${bits.slice(1).join(" y ")}` : `${landEs} de ${bits[0] ?? "campo"}`;
  return { en, es };
}

/** Place names from the traits that lift above the catalog, two at a time, with no repeated pair. */
export function labelZones(groups: Traits[][]): { en: string; es: string }[] {
  const world = groups.flat();
  const profiles = groups.map((group) => profile(group, world));
  const order = profiles
    .map((item, index) => ({ index, weight: item.signals[0]?.weight ?? 0 }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  const usedPairs = new Set<string>();
  const usedLands = new Set<string>();
  const labels = new Array<{ en: string; es: string }>(groups.length);

  for (const { index } of order) {
    const item = profiles[index];
    const options = combinations(item.signals.length ? item.signals : [{ id: "field", en: "Open", es: "campo", weight: 0, slot: "quality" }]);
    let chosen = options[options.length - 1];
    for (const option of options) {
      const key = option.map((signal) => signal.id).sort().join("+");
      if (!usedPairs.has(key)) {
        chosen = option;
        usedPairs.add(key);
        break;
      }
    }
    const pool = LANDFORMS[item.family];
    let land = pool[pool.length - 1];
    for (const candidate of pool) {
      if (!usedLands.has(candidate[0])) {
        land = candidate;
        break;
      }
    }
    usedLands.add(land[0]);
    labels[index] = phrase(chosen, land[0], land[1]);
  }
  return labels;
}
