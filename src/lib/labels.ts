import type { ColorName, Traits } from "../types";

export const COLOR_ES: Record<ColorName, string> = {
  red: "rojo",
  orange: "naranja",
  amber: "ámbar",
  yellow: "amarillo",
  lime: "lima",
  green: "verde",
  teal: "verde azulado",
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

function majorityName(traits: Traits[]): ColorName | null {
  const counts = new Map<ColorName, number>();
  for (const trait of traits) {
    if (trait.dominantName === "neutral") continue;
    counts.set(trait.dominantName, (counts.get(trait.dominantName) ?? 0) + 1);
  }
  let best: ColorName | null = null;
  let bestN = 0;
  for (const [name, count] of counts) {
    if (count > bestN) {
      best = name;
      bestN = count;
    }
  }
  if (!best || bestN / Math.max(1, traits.length) < 0.18) return null;
  return best;
}

/** Zone names from the traits that actually dominate the group, plus anything it has more of than the field. */
export function describeCluster(members: Traits[], baseline?: Traits[]): { en: string; es: string } {
  const total = Math.max(1, members.length);
  const share = (pred: (trait: Traits) => boolean) => members.filter(pred).length / total;
  const world = baseline && baseline.length ? baseline : members;
  const worldShare = (pred: (trait: Traits) => boolean) => world.filter(pred).length / Math.max(1, world.length);
  const dark = share((trait) => trait.mode === "dark");
  const mode = dark >= 0.62 ? "dark" : dark <= 0.38 ? "light" : null;
  const color = majorityName(members);
  const gradient = share((trait) => trait.gradient) >= 0.22;
  const bento =
    share((trait) => trait.bento) - worldShare((trait) => trait.bento) > 0.08 &&
    share((trait) => trait.bento) >= 0.12;
  const airy = share((trait) => trait.density === "airy") - worldShare((trait) => trait.density === "airy") > 0.1;
  const packed =
    share((trait) => trait.density === "packed") - worldShare((trait) => trait.density === "packed") > 0.12;

  let en: string;
  let es: string;
  if (gradient && color) {
    en = `${mode === "dark" ? "dark " : ""}${COLOR_EN[color]} gradient`;
    es = `degradado ${COLOR_ES[color]}${mode === "dark" ? " oscuro" : ""}`;
  } else if (color && mode) {
    en = `${mode} ${COLOR_EN[color]}`;
    es = `${COLOR_ES[color]} ${mode === "dark" ? "oscuro" : "claro"}`;
  } else if (color) {
    en = COLOR_EN[color];
    es = COLOR_ES[color];
  } else if (mode === "dark") {
    en = "ink";
    es = "tinta";
  } else if (mode === "light") {
    en = "warm paper";
    es = "papel cálido";
  } else {
    en = "mixed field";
    es = "campo mixto";
  }

  const extraEn = bento ? "bento grid" : airy ? "airy" : packed ? "packed" : "";
  const extraEs = bento ? "bento grid" : airy ? "aireado" : packed ? "denso" : "";
  if (extraEn) {
    en = `${en} + ${extraEn}`;
    es = `${es} + ${extraEs}`;
  }
  return { en, es };
}

export function labelZones(groups: Traits[][]): { en: string; es: string }[] {
  const baseline = groups.flat();
  const labels = groups.map((group) => describeCluster(group, baseline));
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const count = seen.get(label.en) ?? 0;
    seen.set(label.en, count + 1);
    if (count === 0) return label;
    return { en: `${label.en} · ${count + 1}`, es: `${label.es} · ${count + 1}` };
  });
}
