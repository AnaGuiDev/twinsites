/**
 * Stock phrases of AI-built landing pages, in English and Spanish. Each has an
 * id (stable, used for catalog counts), a pattern matched on lowercased text,
 * and a plainer direction to replace it with.
 */
export interface Cliche {
  id: string;
  lang: "en" | "es";
  pattern: RegExp;
  /** What the phrase looks like on the page, for display. */
  label: string;
}

const en = (id: string, label: string, pattern: RegExp): Cliche => ({ id, lang: "en", label, pattern });
const es = (id: string, label: string, pattern: RegExp): Cliche => ({ id, lang: "es", label, pattern });

export const CLICHES: Cliche[] = [
  en("supercharge", "Supercharge", /\bsupercharg(e|es|ed|ing)\b/),
  en("unlock", "Unlock", /\bunlock(s|ed|ing)?\b/),
  en("unleash", "Unleash", /\bunleash(es|ed|ing)?\b/),
  en("revolutionize", "Revolutionize", /\brevolution(ize|ise|izing|ising|ary)\b/),
  en("seamless", "Seamless(ly)", /\bseamless(ly)?\b/),
  en("effortless", "Effortless(ly)", /\beffortless(ly)?\b/),
  en("all-in-one", "All-in-one", /\ball[\s-]in[\s-]one\b/),
  // OCR often reads "AI" as "Al"; both count.
  en("ai-powered", "AI-powered / powered by AI", /\b(a[il][\s-]powered|powered by (a[il]|artificial intelligence))\b/),
  en("next-level", "To the next level", /\bnext[\s-]level\b/),
  en("next-gen", "Next-gen", /\bnext[\s-]gen(eration)?\b/),
  en("cutting-edge", "Cutting-edge", /\bcutting[\s-]edge\b/),
  en("game-changer", "Game-changer", /\bgame[\s-]chang(er|ing)\b/),
  en("transform", "Transform your…", /\btransform(s)? (your|the way)\b/),
  en("elevate", "Elevate your…", /\belevate(s)? your\b/),
  en("in-seconds", "In seconds / in minutes", /\bin (just )?(seconds|minutes)\b/),
  en("10x", "10x", /\b10x\b/),
  en("future-of", "The future of…", /\bthe future of\b/),
  en("say-goodbye", "Say goodbye to…", /\bsay goodbye to\b/),
  en("streamline", "Streamline", /\bstreamlin(e|es|ed|ing)\b/),
  en("boost", "Boost your…", /\bboost (your|productivity)\b/),
  en("made-simple", "…made simple / made easy", /\bmade (simple|easy)\b/),
  en("fingertips", "At your fingertips", /\bat your fingertips\b/),
  en("like-never-before", "Like never before", /\blike never before\b/),
  en("one-place", "In one place", /\b(in )?one (place|platform)\b/),
  en("everything-you-need", "Everything you need", /\beverything you need\b/),
  en("start-free", "Get started / start for free", /\b(get started|start) (for )?free\b/),
  en("watch-demo", "Watch demo", /\bwatch (the )?demo\b/),
  en("join-thousands", "Join thousands", /\bjoin (thousands|\d[\d,.]*\+?)\b/),
  en("trusted-by", "Trusted by…", /\btrusted by\b/),
  en("your-ai", "Your AI…", /\byour a[il]\b/),
  en("smarter", "Work smarter", /\bwork smarter\b/),
  en("magic", "Magic / magically", /\bmagic(al|ally)?\b/),
  en("lightning", "Lightning-fast", /\blightning[\s-]fast\b/),
  en("no-credit-card", "No credit card required", /\bno credit card\b/),
  es("potencia", "Potencia / potenciado", /\bpotenci(a|ado|ada|ar)\b/),
  es("revoluciona", "Revoluciona", /\brevolucion(a|ario|aria|ar)\b/),
  es("sin-esfuerzo", "Sin esfuerzo", /\bsin esfuerzo\b/),
  es("todo-en-uno", "Todo en uno", /\btodo en uno\b/),
  es("con-ia", "Con IA / impulsado por IA", /\b(impulsad[oa] por|con) (la )?([il]a|inteligencia artificial)\b/),
  es("siguiente-nivel", "Al siguiente nivel", /\bsiguiente nivel\b/),
  es("en-segundos", "En segundos / en minutos", /\ben (solo )?(segundos|minutos)\b/),
  es("olvidate", "Olvídate de…", /\bolv[ií]date de\b/),
  es("facil", "La forma más fácil", /\bla forma m[aá]s (f[aá]cil|sencilla|r[aá]pida)\b/),
  es("todo-lo-que-necesitas", "Todo lo que necesitas", /\btodo lo que necesitas\b/),
  es("un-solo-lugar", "En un solo lugar", /\ben un (solo|único|unico) lugar\b/),
  es("transforma", "Transforma tu…", /\btransforma (tu|la forma)\b/),
  es("optimiza", "Optimiza", /\boptimiz(a|ar)\b/),
  es("descubre", "Descubre el poder de…", /\bdescubre el poder\b/),
  es("futuro", "El futuro de…", /\bel futuro de\b/),
  es("empieza-gratis", "Empieza / prueba gratis", /\b(empieza|comienza|prueba)( ahora)? gratis\b/),
  es("unete", "Únete a miles", /\b[uú]nete a (miles|m[aá]s de)\b/),
  es("sin-tarjeta", "Sin tarjeta de crédito", /\bsin tarjeta\b/),
];

/** Phrases of the list found in some text. */
export function findCliches(text: string): Cliche[] {
  const lower = text.toLowerCase().replace(/\s+/g, " ");
  return CLICHES.filter((cliche) => cliche.pattern.test(lower));
}
