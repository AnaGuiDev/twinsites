import type { ColorName, Lang } from "../types";
import { COLOR_EN, COLOR_ES } from "./labels";

export interface ZoneRecord {
  id: number;
  slug: string;
  labelEn: string;
  labelEs: string;
  x: number;
  y: number;
  r: number;
  color: string;
  size: number;
  dark: number;
  airy: number;
  packed: number;
  gradient: number;
  bento: number;
  centered: number;
  topColor: ColorName;
  examples: string[];
}

export function zoneSlug(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** A curious, specific sentence. The pages belong to real people. */
export function zoneSentence(zone: ZoneRecord, lang: Lang): string {
  const es = lang === "es";
  const name = es ? zone.labelEs : zone.labelEn;
  const count = es ? String(zone.size).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : String(zone.size);
  const color = (es ? COLOR_ES : COLOR_EN)[zone.topColor];
  const looks: string[] = [];
  if (zone.dark >= 0.62) looks.push(es ? "oscuras" : "dark");
  else if (zone.dark <= 0.38) looks.push(es ? "claras" : "light");
  if (zone.centered >= 0.58) looks.push(es ? "centradas" : "centered");
  // Density, gradient and box grids are not said: by hand they did not hold up (see /faq).
  const extra: string[] = [];
  const lookText = looks.length ? (es ? `Suelen ser ${join(looks, es)}` : `The pages tend to be ${join(looks, es)}`) : "";
  const colorText = es ? `El acento que más aparece es el ${color}` : `${cap(color)} is the accent that shows up most`;
  const tail = [lookText, colorText, extra.length ? extra.join(es ? " y " : ", and ") : ""].filter(Boolean).join(". ");
  const head = es ? `${count} webs comparten ${name}.` : `${count} sites share ${name}.`;
  return `${head} ${tail}.`.replace(/\.\./g, ".");
}

function join(parts: string[], es: boolean): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return es ? `${parts[0]} y ${parts[1]}` : `${parts[0]} and ${parts[1]}`;
  return es
    ? `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`
    : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
