import { hueToName, rotateHue } from "./analyze";
import type { ColorName, Traits } from "../types";

export type Suggestion =
  | { id: "shift-hue"; from: ColorName; to: ColorName }
  | { id: "add-accent"; to: ColorName }
  | { id: "flip-mode"; mode: "light" | "dark" }
  | { id: "open-space" }
  | { id: "add-density" }
  | { id: "drop-gradient" }
  | { id: "leave-bento" }
  | { id: "break-center" }
  | { id: "add-grain" };

function share(twins: Traits[], pred: (trait: Traits) => boolean): number {
  if (!twins.length) return 0;
  return twins.filter(pred).length / twins.length;
}

function accentAway(trait: Traits): ColorName {
  const next = hueToName(rotateHue(trait.hue ?? 262, 150));
  if (next !== trait.dominantName && next !== "neutral") return next;
  return hueToName(rotateHue(trait.hue ?? 262, 200));
}

export function suggest(user: Traits, twins: Traits[]): Suggestion[] {
  const ranked: { weight: number; item: Suggestion }[] = [];
  const colorShare = share(twins, (trait) => trait.dominantName === user.dominantName);
  const neutralShare = share(twins, (trait) => trait.dominantName === "neutral");

  if (user.dominantName !== "neutral" && colorShare >= 0.45) {
    ranked.push({
      weight: colorShare + 0.2,
      item: { id: "shift-hue", from: user.dominantName, to: accentAway(user) },
    });
  } else if (user.dominantName === "neutral" && neutralShare >= 0.4) {
    ranked.push({
      weight: neutralShare,
      item: { id: "add-accent", to: accentAway(user) },
    });
  }

  const modeShare = share(twins, (trait) => trait.mode === user.mode);
  if (modeShare >= 0.6) {
    ranked.push({
      weight: modeShare,
      item: { id: "flip-mode", mode: user.mode === "dark" ? "light" : "dark" },
    });
  }

  if (user.gradient && share(twins, (trait) => trait.gradient) >= 0.4) {
    ranked.push({ weight: 0.75, item: { id: "drop-gradient" } });
  }
  if (user.bento && share(twins, (trait) => trait.bento) >= 0.35) {
    ranked.push({ weight: 0.72, item: { id: "leave-bento" } });
  }
  if (user.density === "packed" && share(twins, (trait) => trait.density === "packed") >= 0.4) {
    ranked.push({ weight: 0.66, item: { id: "open-space" } });
  }
  if (user.density === "airy" && share(twins, (trait) => trait.density === "airy") >= 0.4) {
    ranked.push({ weight: 0.64, item: { id: "add-density" } });
  }
  if (user.centered && share(twins, (trait) => trait.centered) >= 0.55) {
    ranked.push({ weight: 0.6, item: { id: "break-center" } });
  }
  if (!user.gradient && share(twins, (trait) => !trait.gradient) >= 0.7) {
    ranked.push({ weight: 0.4, item: { id: "add-grain" } });
  }

  ranked.sort((a, b) => b.weight - a.weight);
  const picked: Suggestion[] = [];
  const seen = new Set<string>();
  for (const row of ranked) {
    if (seen.has(row.item.id)) continue;
    if (row.item.id === "open-space" && seen.has("add-density")) continue;
    if (row.item.id === "add-density" && seen.has("open-space")) continue;
    seen.add(row.item.id);
    picked.push(row.item);
    if (picked.length === 3) break;
  }

  const fillers: Suggestion[] = [
    { id: "break-center" },
    { id: "add-grain" },
    { id: "add-accent", to: accentAway(user) },
    { id: "open-space" },
  ];
  for (const item of fillers) {
    if (picked.length === 3) break;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    picked.push(item);
  }
  return picked.slice(0, 3);
}
