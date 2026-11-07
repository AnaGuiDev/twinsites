import type { Lang, Traits } from "../types";

type Copy = { en: string; es: string };
export interface Trope {
  id: string;
  category: "visual" | "copy" | "trust" | "layout";
  weight: number;
  title: Copy;
  why: Copy;
  fix: Copy;
}
export const TROPES: Trope[] = [
  { id: "likeness", category: "visual", weight: 0, title: { en: "A familiar visual recipe", es: "Una receta visual repetida" }, why: { en: "Close neighbors in the catalog, not proof of AI authorship.", es: "Vecinos próximos en el catálogo; no demuestra autoría de IA." }, fix: { en: "Replace the generic hero with a real product workflow and one original visual from the product.", es: "Sustituye el hero genérico por un flujo real y una imagen original del producto." } },
  { id: "centered", category: "layout", weight: 0, title: { en: "The centered hero", es: "El hero centrado" }, why: { en: "A common composition; only a weak signal on its own.", es: "Una composición frecuente; por sí sola es una señal débil." }, fix: { en: "Try a left-aligned editorial headline beside a specific product demonstration. Keep reading order logical on mobile.", es: "Prueba un titular editorial alineado a la izquierda junto a una demostración concreta. Mantén el orden de lectura en móvil." } },
  { id: "purple-gradient", category: "visual", weight: 15, title: { en: "Purple–blue gradient", es: "Gradiente violeta–azul" }, why: { en: "A repeated decoration, not an inherently bad color choice.", es: "Una decoración repetida, no una elección de color mala por definición." }, fix: { en: "Remove decorative violet–blue washes. Use a restrained brand palette and reserve contrast for the primary action.", es: "Retira los degradados violeta–azul decorativos. Usa una paleta propia y reserva el contraste para la acción principal." } },
  { id: "emoji-cards", category: "layout", weight: 15, title: { en: "Three emoji feature cards", es: "Tres tarjetas con emoji" }, why: { en: "Identical cards can hide what the product actually does.", es: "Las tarjetas idénticas pueden ocultar lo que hace el producto." }, fix: { en: "Replace the three emoji cards with a short real-world sequence: input, action, and visible outcome. Use actual product examples.", es: "Sustituye las tres tarjetas con emoji por una secuencia real: entrada, acción y resultado visible. Usa ejemplos del producto." } },
  { id: "bento", category: "layout", weight: 15, title: { en: "Bento without hierarchy", es: "Bento sin jerarquía" }, why: { en: "Check whether each box earns its place, rather than penalizing every grid.", es: "Comprueba que cada bloque tenga una función; no se penaliza cualquier cuadrícula." }, fix: { en: "Give the page one primary story. Remove redundant boxes and size the remaining sections by importance, not symmetry.", es: "Da a la página una historia principal. Elimina cajas redundantes y dimensiona las secciones por importancia, no por simetría." } },
  { id: "glass", category: "visual", weight: 10, title: { en: "Decorative glassmorphism", es: "Glassmorphism decorativo" }, why: { en: "Blurred panels need a purpose and readable contrast.", es: "Los paneles difuminados necesitan una función y contraste legible." }, fix: { en: "Replace unnecessary blur and translucent panels with solid surfaces. Check text contrast and focus visibility.", es: "Sustituye el desenfoque y los paneles translúcidos innecesarios por superficies sólidas. Revisa contraste y foco." } },
  { id: "serif-italic", category: "visual", weight: 10, title: { en: "The decorative serif italic", es: "La cursiva serif decorativa" }, why: { en: "A stylistic convention to review, not a typography error by itself.", es: "Una convención que revisar, no un error tipográfico por sí mismo." }, fix: { en: "Remove arbitrary italic words from the headline. Use a consistent type hierarchy that reflects the brand and supports scanning.", es: "Elimina palabras en cursiva arbitrarias del titular. Usa una jerarquía coherente con la marca y fácil de leer." } },
  { id: "cliches", category: "copy", weight: 20, title: { en: "Generic promises", es: "Promesas genéricas" }, why: { en: "Stock phrases found by OCR can contain recognition errors.", es: "Las frases detectadas por OCR pueden contener errores de lectura." }, fix: { en: "Rewrite vague promises as who the product helps, what they can do, and one verifiable outcome. Do not invent numbers.", es: "Reescribe las promesas vagas: a quién ayuda, qué puede hacer y un resultado verificable. No inventes cifras." } },
  { id: "trust", category: "trust", weight: 15, title: { en: "Social proof without evidence", es: "Prueba social sin evidencia" }, why: { en: "Verify permission, attribution and sources. A screenshot cannot prove a testimonial is fabricated.", es: "Verifica permiso, atribución y fuentes. Una captura no demuestra que un testimonio sea inventado." }, fix: { en: "Verify every testimonial and client logo with the owner. Remove unsupported claims; link to attributable evidence when permitted.", es: "Verifica cada testimonio y logo con su propietario. Retira afirmaciones sin respaldo y enlaza evidencia atribuible cuando haya permiso." } },
];
export type Review = Partial<Record<string, boolean>>;
export interface SlopInput { traits: Traits; nearest: number; cliches?: number; review: Review }

/** v2 is an explainable editorial index, not a trained AI/slop classifier. Unknown checks never become passes. */
export function scoreSlop(input: SlopInput) {
  const signals = TROPES.filter(trope => trope.weight > 0).map((trope) => {
    let strength: number | null = null;
    let source: "visual" | "ocr" | "review" | "unknown" = "unknown";
    if (trope.id === "cliches" && input.cliches !== undefined) { strength = Math.min(1, input.cliches / 3); source = "ocr"; }
    if (typeof input.review[trope.id] === "boolean") { strength = input.review[trope.id] ? 1 : 0; source = "review"; }
    return { ...trope, strength, source, points: strength === null ? 0 : Math.round(strength * trope.weight) };
  });
  const score = signals.reduce((sum, item) => sum + item.points, 0);
  const coverage = signals.reduce((sum, item) => sum + (item.strength === null ? 0 : item.weight), 0);
  return { version: "editorial-v2", score, coverage, displayScore: coverage >= 80 ? score : null, upper: score + 100 - coverage, signals, priorities: signals.filter((s) => s.points > 0).sort((a, b) => b.points - a.points) };
}

export function fixPrompt(trope: Trope, lang: Lang): string {
  return lang === "es"
    ? `Revisa esta página pública. Objetivo: ${trope.fix.es}\nContexto: ${trope.why.es}\nInspecciona primero el código y el contenido. Propón un cambio concreto y aplícalo conservando funcionalidades, enlaces y accesibilidad. No inventes testimonios, clientes ni métricas. Explica qué cambiaste y comprueba móvil, teclado y contraste. No cambies elementos que ya cumplen el objetivo.`
    : `Review this public page. Goal: ${trope.fix.en}\nContext: ${trope.why.en}\nInspect the code and content first. Propose a concrete change and implement it while preserving behavior, links and accessibility. Do not invent testimonials, customers or metrics. Explain the change and check mobile, keyboard access and contrast. Leave elements that already meet the goal alone.`;
}
