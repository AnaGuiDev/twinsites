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
    removal: "Is your site here and you want it removed?",
    langName: "Español",
    title: "Your AI-built landing page has twins. Meet them.",
    lede: "Slop detectors give you a score. Twinsites names the relatives, and runs entirely in your browser.",
    privacy:
      "If you upload a screenshot, it never leaves your browser. If you paste a URL, a Cloudflare worker visits that public page to take the screenshot and doesn't store it.",
    analyticsNote:
      "No cookies. If a counter is on, it records only aggregate events: a visit, an example, an upload, a result, a share.",
    dropTitle: "Drop a screenshot",
    dropHint: "Paste, or browse. PNG, JPG, WebP. Nothing is uploaded.",
    noUpload: "No upload",
    browse: "Choose a file",
    factModel: "Quantized MobileCLIP, on device",
    factCatalog: (n: number) => `${grouped(n, "en")} public homepages`,
    factNoUpload: "No upload. No account.",
    tryExample: "Try an example",
    browseZones: "Browse zones",
    navZones: "Zones",
    searchLabel: "Search the catalog",
    searchPlaceholder: "Search 2,003 sites by name or URL",
    searchEmpty: "No site with that name.",
    phoneInvite: "Uploading is meant for a desktop capture. On a phone, try the example or search the catalog.",
    shotLabel: "Or paste a public page",
    shotButton: "Use this URL",
    shotVerifying: "verifying…",
    shotHint: "https://…",
    stageRead: "Reading the screenshot",
    stageModel: "Starting the on-device model",
    stageData: "Loading the catalog",
    stageMatch: "Comparing",
    another: "Try another screenshot",
    twinsTitle: "Twelve twins",
    twinsDek: "The twelve sites whose first screen sits nearest to yours.",
    itsTwins: "See its twins",
    openSite: "Open site",
    simLabel: "percentile",
    scoreNote: "Percentile, not a copy score: 90 means closer than 90% of pairs in this catalog.",
    resultLine: (verdict: KinVerdict, percentile: number) => resultSentence("en", verdict, percentile),
    progressLabel: "Loading progress",
    mapTitle: "The map",
    mapDek: "Every dot is an AI-built site. Closer dots look more alike. Yours lands in a zone.",
    mapHint: "Drag to pan. Scroll to zoom. Click a dot to open the site.",
    fit: "Reset view",
    you: "Your screenshot",
    traitsTitle: "Shared marks",
    traitsDek: "What you and those twelve have in common.",
    suggestTitle: "Three ways to step aside",
    suggestDek: "Plain moves, read off the marks above. A direction, not a redesign.",
    shareTitle: "A card for X",
    shareDek: "Drawn in this tab. The post includes the sentence and the zone link.",
    download: "Download PNG",
    includeMine: "Include my screenshot on the card",
    post: "Post the line on X",
    shareNote:
      "On a phone, the share button can attach the card. Otherwise the post opens with the sentence and the link, and the image stays here until you attach it.",
    footerPrivacy: "Screenshots stay in the tab that opened them.",
    footerCatalog: "Homepages from the CC0 catalog awesome-vibe-coded-apps.",
    footerLicense: "Twinsites is MIT.",
    dominant: "Dominant color",
    mode: "Ground",
    density: "Density",
    gradient: "Gradient",
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
    errorShot: "That page didn't yield a screenshot. Try the example, or upload a desktop capture.",
    errorVerify: "Verification expired, try again",
    errorBusy: "Busy right now, try again in a minute",
    errorCatalog: "The catalog is missing from this build.",
    missingSite: "That site is not in this catalog.",
    loadingCatalog: "Opening the catalog…",
    atlasTitle: "Zones",
    atlasLede: "Each zone is a group of AI-built homepages that share a look. Open one to see the pages inside.",
    zoneCount: (n: number) => `${grouped(n, "en")} sites`,
    loadingIdle: "Waiting for a screenshot",
    zone: "Zone",
    colorName: (name: ColorName) => COLOR_EN[name],
    suggestion: (item: Suggestion) => suggestionEn(item),
    cardLine: (verdict: KinVerdict, zone: string, total: number) => cardSentence("en", verdict, zone, total),
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
    removal: "¿Tu web aparece y quieres retirarla?",
    langName: "English",
    title: "Tu página de inicio hecha con IA tiene gemelas. Conócelas.",
    lede: "Los detectores de páginas genéricas te dan una nota. Twinsites nombra a las parientes, y funciona entero en tu navegador.",
    privacy:
      "Si subes una captura, no sale de tu navegador. Si pegas una URL, un worker de Cloudflare visita esa página pública para hacer la captura y no la guarda.",
    analyticsNote:
      "Sin cookies. Si hay un contador, solo anota eventos agregados: visita, ejemplo, subida, resultado y compartir.",
    dropTitle: "Suelta una captura",
    dropHint: "Pega, o elige un archivo. PNG, JPG, WebP. No se sube nada.",
    noUpload: "Sin subida",
    browse: "Elegir archivo",
    tryExample: "Prueba con un ejemplo",
    browseZones: "Ver zonas",
    navZones: "Zonas",
    searchLabel: "Buscar en el catálogo",
    searchPlaceholder: "Busca entre 2.003 webs por nombre o URL",
    searchEmpty: "Ninguna web con ese nombre.",
    phoneInvite: "Subir una captura está pensado para el escritorio. En el teléfono, prueba el ejemplo o busca en el catálogo.",
    shotLabel: "O pega una página pública",
    shotButton: "Usar esta URL",
    shotVerifying: "comprobando…",
    shotHint: "https://…",
    factModel: "MobileCLIP cuantizado, en el dispositivo",
    factCatalog: (n: number) => `${grouped(n, "es")} portadas públicas`,
    factNoUpload: "Sin subida. Sin cuenta.",
    stageRead: "Leyendo la captura",
    stageModel: "Arrancando el modelo en el dispositivo",
    stageData: "Cargando el catálogo",
    stageMatch: "Comparando",
    another: "Probar otra captura",
    twinsTitle: "Doce gemelas",
    twinsDek: "Las doce webs cuya primera pantalla queda más cerca de la tuya.",
    itsTwins: "Ver sus gemelas",
    openSite: "Abrir web",
    simLabel: "percentil",
    scoreNote: "Percentil, no un porcentaje de copia: 90 significa más cerca que el 90 % de las parejas del catálogo.",
    resultLine: (verdict: KinVerdict, percentile: number) => resultSentence("es", verdict, percentile),
    progressLabel: "Progreso de carga",
    mapTitle: "El mapa",
    mapDek: "Cada punto es una web hecha con IA. Los puntos cercanos se parecen más. La tuya cae en una zona.",
    mapHint: "Arrastra para moverte. La rueda acerca la vista. Un clic abre la web.",
    fit: "Reencuadrar",
    you: "Tu captura",
    traitsTitle: "Marcas compartidas",
    traitsDek: "Lo que tienes en común con esas doce.",
    suggestTitle: "Tres modos de apartarte",
    suggestDek: "Gestos sencillos, leídos de las marcas de arriba. Una dirección, no un rediseño.",
    shareTitle: "Una tarjeta para X",
    shareDek: "Dibujada en esta pestaña. La publicación incluye la frase y el enlace de la zona.",
    download: "Descargar PNG",
    includeMine: "Incluir mi captura en la tarjeta",
    post: "Publicar la frase en X",
    shareNote:
      "En el móvil, el botón de compartir puede adjuntar la tarjeta. Si no, la publicación se abre con la frase y el enlace, y la imagen se queda aquí hasta que la adjuntes.",
    footerPrivacy: "Las capturas se quedan en la pestaña que las abrió.",
    footerCatalog: "Portadas del catálogo CC0 awesome-vibe-coded-apps.",
    footerLicense: "Twinsites es MIT.",
    dominant: "Color dominante",
    mode: "Fondo",
    density: "Densidad",
    gradient: "Degradado",
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
    errorShot: "Esa página no dejó una captura. Prueba el ejemplo, o sube una captura de escritorio.",
    errorVerify: "La verificación caducó, inténtalo de nuevo",
    errorBusy: "Ahora está ocupado, inténtalo dentro de un minuto",
    cropNote: "Se compara solo la parte de arriba, la misma primera pantalla que guarda el catálogo.",
    portraitNote: "Parece una captura de teléfono. El catálogo son portadas de escritorio, así que el parecido es orientativo.",
    errorCatalog: "A esta versión le falta el catálogo.",
    missingSite: "Esa web no está en este catálogo.",
    loadingCatalog: "Abriendo el catálogo…",
    atlasTitle: "Zonas",
    atlasLede: "Cada zona agrupa páginas de inicio hechas con IA que comparten un aspecto. Ábrela para ver las webs de dentro.",
    zoneCount: (n: number) => `${grouped(n, "es")} webs`,
    loadingIdle: "Esperando una captura",
    zone: "Zona",
    colorName: (name: ColorName) => COLOR_ES[name],
    suggestion: (item: Suggestion) => suggestionEs(item),
    cardLine: (verdict: KinVerdict, zone: string, total: number) => cardSentence("es", verdict, zone, total),
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

function resultSentence(lang: Lang, verdict: KinVerdict, percentile: number): string {
  const shown = formatPercentile(percentile, lang);
  if (verdict.mode === "none") {
    return lang === "es"
      ? `Ninguna gemela en el ${verdict.top} % superior. La más cercana está en el percentil ${shown}.`
      : `No twin in the top ${verdict.top}%. Nearest is percentile ${shown}.`;
  }
  if (verdict.mode === "neighborhood") {
    return lang === "es"
      ? `${verdict.count} webs en el ${verdict.top} % superior.`
      : `${verdict.count} sites in the top ${verdict.top}%.`;
  }
  if (lang === "es") {
    return verdict.count === 1
      ? `1 gemela en el ${verdict.top} % superior.`
      : `${verdict.count} gemelas en el ${verdict.top} % superior.`;
  }
  return verdict.count === 1 ? `1 twin in the top ${verdict.top}%.` : `${verdict.count} twins in the top ${verdict.top}%.`;
}

function cardSentence(lang: Lang, verdict: KinVerdict, zone: string, total: number): string {
  const among = lang === "es" ? `entre ${grouped(total, "es")} webs hechas con IA` : `among ${grouped(total, "en")} AI-built sites`;
  if (verdict.mode === "none") {
    return lang === "es" ? `${zone}. Ninguna gemela ${among}` : `${zone}. No twin ${among}`;
  }
  if (verdict.mode === "neighborhood") {
    return lang === "es"
      ? `${zone}. ${verdict.count} webs en el ${verdict.top} % superior ${among}`
      : `${zone}. ${verdict.count} sites in the top ${verdict.top}% ${among}`;
  }
  const noun = lang === "es" ? (verdict.count === 1 ? "gemela" : "gemelas") : verdict.count === 1 ? "twin" : "twins";
  return `${zone}. ${verdict.count} ${noun} ${among}`;
}

function suggestionEn(item: Suggestion): string {
  switch (item.id) {
    case "shift-hue":
      return `Move the accent off ${COLOR_EN[item.from]}. That hue shows up a lot here; ${COLOR_EN[item.to]}, used once, sets the page apart.`;
    case "add-accent":
      return `The page is as neutral as its twins. One strong ${COLOR_EN[item.to]} accent, used a single time, is enough to break the match.`;
    case "flip-mode":
      return item.mode === "light"
        ? "Most twins are dark. A light ground changes the silhouette before the layout does."
        : "Most twins are light. Invert the page and the resemblance drops before you touch the type.";
    case "open-space":
      return "These pages are packed. Give the first screen one idea and a wide, quiet margin.";
    case "add-density":
      return "The twins are airy pages with a headline and a button. A denser editorial stack reads differently.";
    case "drop-gradient":
      return "A soft gradient is common here. Flat ink, or a photograph with a hard edge, steps away from it.";
    case "leave-bento":
      return "Box grids are common here. One asymmetric column, or a full-bleed story, leaves that pattern.";
    case "break-center":
      return "Centered headline, centered button. Push the title into a margin and let the navigation go quiet.";
    case "add-grain":
      return "Most of these pages are flat digital color. A grain, a print scan, or a single sharp rule reads as made by hand.";
  }
}

function suggestionEs(item: Suggestion): string {
  switch (item.id) {
    case "shift-hue":
      return `Saca el acento del ${COLOR_ES[item.from]}. Ese tono aparece mucho aquí; un ${COLOR_ES[item.to]} usado una sola vez distingue la página.`;
    case "add-accent":
      return `La página es tan neutra como sus gemelas. Un acento firme de ${COLOR_ES[item.to]}, una sola vez, basta para romper el parecido.`;
    case "flip-mode":
      return item.mode === "light"
        ? "Casi todas las gemelas son oscuras. Un fondo claro cambia la silueta antes que la maquetación."
        : "Casi todas las gemelas son claras. Invierte la página y el parecido baja antes de tocar la tipografía.";
    case "open-space":
      return "Estas páginas están apretadas. Deja la primera pantalla en una sola idea y un margen amplio y quieto.";
    case "add-density":
      return "Las gemelas son páginas aireadas de titular y botón. Una pila editorial más densa se lee distinto.";
    case "drop-gradient":
      return "El degradado suave es habitual aquí. Tinta plana, o una foto con un borde duro, se aparta de eso.";
    case "leave-bento":
      return "Las retículas de cajas son habituales aquí. Una columna asimétrica, o una historia a sangre, deja ese patrón.";
    case "break-center":
      return "Titular al centro, botón al centro. Empuja el título a un margen y deja la navegación en silencio.";
    case "add-grain":
      return "Casi todas estas páginas son color digital plano. Un grano, un escaneo de imprenta o una regla nítida se leen como hechos a mano.";
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
