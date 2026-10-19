import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ColorName, Lang } from "./types";
import type { Suggestion } from "./lib/suggest";
import { formatPercentile, type KinVerdict } from "./lib/calibrate";
import { COLOR_EN, COLOR_ES } from "./lib/labels";

const REMOVAL_URL =
  "https://github.com/AnaGuiDev/twinsites/issues/new?title=" +
  encodeURIComponent("Removal request: please take my site out of Twinsites") +
  "&body=" +
  encodeURIComponent("Site URL:\n\nWhy it should be removed:\n\nI control this site or represent the owner.\n");

export { REMOVAL_URL };

const copy = {
  en: {
    registry: "Visual kin registry",
    removal: "Is your site here and you want it removed?",
    langName: "Español",
    kicker: "Field note 01",
    title: "Find the sites that already wear your face.",
    lede: "Drop a screenshot of a landing page. Twinsites lines it up against a drawer of vibe-coded websites and names the ones with the same bones.",
    privacy:
      "Your screenshot never leaves this browser. The model, the catalog, and the comparison all run on this device.",
    dropTitle: "Drop a screenshot",
    dropHint: "Paste, or browse. PNG, JPG, WebP. Nothing is uploaded.",
    noUpload: "No upload",
    browse: "Choose a file",
    factModel: "Quantized MobileCLIP, on device",
    factCatalog: (n: number) => `${grouped(n, "en")} public homepages`,
    factNoUpload: "No upload. No account.",
    stageRead: "Reading the screenshot",
    stageModel: "Waking the on-device eye",
    stageData: "Opening the drawer",
    stageMatch: "Measuring kin",
    another: "Try another screenshot",
    twinsTitle: "Closest kin",
    twinsDek: "Twelve websites whose first screen sits nearest to yours.",
    openSite: "Open site",
    simLabel: "percentile",
    scoreNote: "Percentile, not a copy score: 90 means closer than 90% of pairs in this catalog.",
    resultLine: (verdict: KinVerdict, zone: string, rank: number) => kinLine("en", verdict, zone, rank),
    progressLabel: "Loading progress",
    mapTitle: "The field",
    mapDek: "Every dot is a vibe-coded site. Closeness is visual kinship. Yours lands in its neighborhood.",
    mapHint: "Drag to pan. Scroll to zoom. Click a dot to open the site.",
    fit: "Reset view",
    you: "Your screenshot",
    traitsTitle: "Shared marks",
    traitsDek: "What you and those twelve have in common.",
    suggestTitle: "Three ways to step aside",
    suggestDek: "Plain moves, read off the marks above. A direction, not a redesign.",
    shareTitle: "A card for X",
    shareDek: "Drawn in this tab. The post includes the sentence and twinsites.com.",
    download: "Download PNG",
    post: "Post the line on X",
    shareNote:
      "On a phone, the share button can attach the card. Otherwise the post opens with the sentence and the link, and the image stays here until you attach it.",
    footerPrivacy: "Screenshots stay in the tab that opened them.",
    footerCatalog: "Homepages from the CC0 catalog awesome-vibe-coded-apps.",
    footerLicense: "Twinsites is MIT.",
    dominant: "Dominant color",
    mode: "Ground",
    density: "Density",
    gradient: "Color field",
    bento: "Grid",
    centered: "Composition",
    shared: (k: number) => `shared with ${k} of 12`,
    modeLight: "Light",
    modeDark: "Dark",
    airy: "Airy",
    balanced: "Even",
    packed: "Packed",
    gradientYes: "Gradient",
    gradientNo: "Flat color",
    bentoYes: "Bento grid",
    bentoNo: "Not a bento",
    centeredYes: "Centered",
    centeredNo: "Off-center",
    errorImage: "That file could not be read as an image.",
    errorLarge: "Use an image under 20 MB.",
    errorModel: "Your browser couldn't start the model. Try desktop Chrome or Firefox.",
    cropNote: "Only the top of the image is compared, the same first screen the catalog keeps.",
    portraitNote: "This looks like a phone screenshot. The catalog is desktop homepages, so the match is a rough one.",
    errorCatalog: "The catalog is missing from this build.",
    loadingIdle: "Waiting for a screenshot",
    zone: "Zone",
    colorName: (name: ColorName) => COLOR_EN[name],
    suggestion: (item: Suggestion) => suggestionEn(item),
    cardLine: (verdict: KinVerdict, zone: string, total: number) => kinPost("en", verdict, zone, total),
    categories: {
      games_play: "Games",
      productivity: "Productivity",
      education: "Education",
      creative_tools: "Creative",
      ai_agents: "Agents",
      developer_tools: "Developer",
      finance_business: "Finance",
      health_wellness: "Health",
      social_community: "Social",
      utilities: "Utilities",
      other: "Other",
    } as Record<string, string>,
  },
  es: {
    registry: "Registro de parentesco visual",
    removal: "¿Tu web aparece y quieres retirarla?",
    langName: "English",
    kicker: "Nota de campo 01",
    title: "Encuentra las webs que ya llevan tu cara.",
    lede: "Suelta una captura de una página de inicio. Twinsites la pone junto a un cajón de webs hechas con IA y te dice cuáles tienen los mismos huesos.",
    privacy:
      "Tu captura no sale de este navegador. El modelo, el catálogo y la comparación ocurren en este dispositivo.",
    dropTitle: "Suelta una captura",
    dropHint: "Pega, o elige un archivo. PNG, JPG, WebP. No se sube nada.",
    noUpload: "Sin subida",
    browse: "Elegir archivo",
    factModel: "MobileCLIP cuantizado, en el dispositivo",
    factCatalog: (n: number) => `${grouped(n, "es")} portadas públicas`,
    factNoUpload: "Sin subida. Sin cuenta.",
    stageRead: "Leyendo la captura",
    stageModel: "Despertando el ojo local",
    stageData: "Abriendo el cajón",
    stageMatch: "Midiendo el parentesco",
    another: "Probar otra captura",
    twinsTitle: "Parientes más cercanos",
    twinsDek: "Doce webs cuya primera pantalla queda más cerca de la tuya.",
    openSite: "Abrir web",
    simLabel: "percentil",
    scoreNote: "Percentil, no un porcentaje de copia: 90 significa más cerca que el 90 % de las parejas del catálogo.",
    resultLine: (verdict: KinVerdict, zone: string, rank: number) => kinLine("es", verdict, zone, rank),
    progressLabel: "Progreso de carga",
    mapTitle: "El campo",
    mapDek: "Cada punto es una web hecha con IA. La cercanía es parentesco visual. La tuya aterriza en su barrio.",
    mapHint: "Arrastra para moverte. La rueda acerca la vista. Un clic abre la web.",
    fit: "Reencuadrar",
    you: "Tu captura",
    traitsTitle: "Marcas compartidas",
    traitsDek: "Lo que tienes en común con esas doce.",
    suggestTitle: "Tres modos de apartarte",
    suggestDek: "Gestos sencillos, leídos de las marcas de arriba. Una dirección, no un rediseño.",
    shareTitle: "Una tarjeta para X",
    shareDek: "Dibujada en esta pestaña. La publicación incluye la frase y twinsites.com.",
    download: "Descargar PNG",
    post: "Publicar la frase en X",
    shareNote:
      "En el móvil, el botón de compartir puede adjuntar la tarjeta. Si no, la publicación se abre con la frase y el enlace, y la imagen se queda aquí hasta que la adjuntes.",
    footerPrivacy: "Las capturas se quedan en la pestaña que las abrió.",
    footerCatalog: "Portadas del catálogo CC0 awesome-vibe-coded-apps.",
    footerLicense: "Twinsites es MIT.",
    dominant: "Color dominante",
    mode: "Fondo",
    density: "Densidad",
    gradient: "Campo de color",
    bento: "Retícula",
    centered: "Composición",
    shared: (k: number) => `compartido con ${k} de 12`,
    modeLight: "Claro",
    modeDark: "Oscuro",
    airy: "Aireado",
    balanced: "Equilibrado",
    packed: "Denso",
    gradientYes: "Degradado",
    gradientNo: "Color plano",
    bentoYes: "Retícula de cajas",
    bentoNo: "Sin retícula de cajas",
    centeredYes: "Centrado",
    centeredNo: "Descentrado",
    errorImage: "Ese archivo no se pudo leer como imagen.",
    errorLarge: "Usa una imagen de menos de 20 MB.",
    errorModel: "Tu navegador no pudo arrancar el modelo. Prueba con Chrome o Firefox en el escritorio.",
    cropNote: "Se compara solo la parte de arriba, la misma primera pantalla que guarda el catálogo.",
    portraitNote: "Parece una captura de teléfono. El catálogo son portadas de escritorio, así que el parecido es orientativo.",
    errorCatalog: "A esta versión le falta el catálogo.",
    loadingIdle: "Esperando una captura",
    zone: "Zona",
    colorName: (name: ColorName) => COLOR_ES[name],
    suggestion: (item: Suggestion) => suggestionEs(item),
    cardLine: (verdict: KinVerdict, zone: string, total: number) => kinPost("es", verdict, zone, total),
    categories: {
      games_play: "Juegos",
      productivity: "Productividad",
      education: "Educación",
      creative_tools: "Creativas",
      ai_agents: "Agentes",
      developer_tools: "Desarrollo",
      finance_business: "Finanzas",
      health_wellness: "Salud",
      social_community: "Social",
      utilities: "Utilidades",
      other: "Otras",
    } as Record<string, string>,
  },
};

function grouped(n: number, lang: Lang): string {
  const separator = lang === "es" ? "." : ",";
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

function kinLine(lang: Lang, verdict: KinVerdict, zone: string, percentile: number): string {
  const shown = formatPercentile(percentile, lang);
  if (verdict.mode === "none") {
    return lang === "es"
      ? `Ninguna gemela en el ${verdict.top} % superior. La más cercana está en el percentil ${shown}.`
      : `No twin in the top ${verdict.top}%. Nearest is percentile ${shown}.`;
  }
  if (verdict.mode === "neighborhood") {
    if (lang === "es") {
      const noun = verdict.count === 1 ? "vecina" : "vecinas";
      return `Tu web vive en ${zone} con ${verdict.count} ${noun} en el ${verdict.top} % superior.`;
    }
    const noun = verdict.count === 1 ? "neighbor" : "neighbors";
    return `Your site lives in ${zone} with ${verdict.count} ${noun} in the top ${verdict.top}%.`;
  }
  if (lang === "es") {
    return verdict.count === 1
      ? `1 gemela en el ${verdict.top} % superior.`
      : `${verdict.count} gemelas en el ${verdict.top} % superior.`;
  }
  return verdict.count === 1
    ? `1 twin in the top ${verdict.top}%.`
    : `${verdict.count} twins in the top ${verdict.top}%.`;
}

function kinPost(lang: Lang, verdict: KinVerdict, zone: string, total: number): string {
  const among = lang === "es" ? `entre ${grouped(total, "es")} webs hechas con IA` : `among ${grouped(total, "en")} AI-built sites`;
  if (verdict.mode === "none") {
    return lang === "es" ? `Mi web no tiene ninguna gemela ${among}` : `My site has no twin ${among}`;
  }
  if (verdict.mode === "neighborhood") {
    const noun = lang === "es" ? (verdict.count === 1 ? "vecina" : "vecinas") : verdict.count === 1 ? "neighbor" : "neighbors";
    return lang === "es"
      ? `Mi web vive en ${zone} con ${verdict.count} ${noun} ${among}`
      : `My site lives in ${zone} with ${verdict.count} ${noun} ${among}`;
  }
  const noun = lang === "es" ? (verdict.count === 1 ? "gemela" : "gemelas") : verdict.count === 1 ? "twin" : "twins";
  return lang === "es" ? `Mi web tiene ${verdict.count} ${noun} ${among}` : `My site has ${verdict.count} ${noun} ${among}`;
}

function suggestionEn(item: Suggestion): string {
  switch (item.id) {
    case "shift-hue":
      return `Move the accent off ${COLOR_EN[item.from]}. That hue is the local uniform; ${COLOR_EN[item.to]}, used once, splits you from the pile.`;
    case "add-accent":
      return `The page is as neutral as its twins. One stubborn ${COLOR_EN[item.to]} accent, used a single time, is enough to break the match.`;
    case "flip-mode":
      return item.mode === "light"
        ? "Most twins are dark. A light ground changes the silhouette before the layout does."
        : "Most twins are light. Invert the page and the kinship drops before you touch the type.";
    case "open-space":
      return "This neighborhood is packed. Give the first screen one idea and a wide, quiet margin.";
    case "add-density":
      return "The twins are airy hero-and-button pages. A denser editorial stack reads as a different species.";
    case "drop-gradient":
      return "A soft gradient is the uniform here. Flat ink, or a photograph with a hard edge, steps out of it.";
    case "leave-bento":
      return "Bento grids are the local costume. One asymmetric column, or a full-bleed story, leaves it behind.";
    case "break-center":
      return "Centered headline, centered button. Push the title into a margin and let the navigation go quiet.";
    case "add-grain":
      return "The field is flat digital color. A grain, a print scan, or a single sharp rule reads as made by a hand.";
  }
}

function suggestionEs(item: Suggestion): string {
  switch (item.id) {
    case "shift-hue":
      return `Saca el acento del ${COLOR_ES[item.from]}. Ese tono es el uniforme del barrio; un ${COLOR_ES[item.to]} usado una sola vez te separa del montón.`;
    case "add-accent":
      return `La página es tan neutra como sus gemelas. Un acento terco de ${COLOR_ES[item.to]}, una sola vez, basta para romper el parecido.`;
    case "flip-mode":
      return item.mode === "light"
        ? "Casi todas las gemelas son oscuras. Un fondo claro cambia la silueta antes que la maquetación."
        : "Casi todas las gemelas son claras. Invierte la página y el parentesco baja antes de tocar la tipografía.";
    case "open-space":
      return "Este barrio está apretado. Deja la primera pantalla en una sola idea y un margen amplio y quieto.";
    case "add-density":
      return "Las gemelas son páginas aireadas de titular y botón. Una pila editorial más densa se lee como otra especie.";
    case "drop-gradient":
      return "El degradado suave es el uniforme. Tinta plana, o una foto con un borde duro, se sale de él.";
    case "leave-bento":
      return "Las retículas de cajas son el traje local. Una columna asimétrica, o una historia a sangre, lo deja atrás.";
    case "break-center":
      return "Titular al centro, botón al centro. Empuja el título a un margen y deja la navegación en silencio.";
    case "add-grain":
      return "El campo es color digital plano. Un grano, un escaneo de imprenta o una regla nítida se leen como hechos a mano.";
  }
}

export type Copy = (typeof copy)["en"];

const I18nContext = createContext<{
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Copy;
} | null>(null);

function readStoredLang(): Lang | null {
  try {
    const stored = localStorage.getItem("twinsites.lang");
    return stored === "es" || stored === "en" ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredLang(next: Lang): void {
  try {
    localStorage.setItem("twinsites.lang", next);
  } catch {
    /* Private mode and blocked storage still switch the language in memory. */
  }
}

function initialLang(): Lang {
  const stored = readStoredLang();
  if (stored) return stored;
  const language = typeof navigator === "undefined" ? "" : navigator.language || "";
  return language.toLowerCase().startsWith("es") ? "es" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = (next: Lang) => {
    writeStoredLang(next);
    setLangState(next);
  };
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t: copy[lang] }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("i18n");
  return value;
}
