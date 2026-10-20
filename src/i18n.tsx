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
    zoneLink: (zone: string) => `See every site in ${zone}`,
    revealLabel: "Your page next to its closest twin",
    closest: "Closest twin:",
    mosaicCaption: "Real homepages from the catalog. Point at any of them to see its twins.",
    noShotTitle: "No screenshot at hand?",
    findTitle: "Already in the catalog?",
    privacyMore: "How privacy works",
    footerBy: "Made by",
    footerSource: "Source code (MIT)",
    cardYou: "Mine",
    cardTwin: "Closest twin",
    privacyShort: "Screenshots never leave your browser.",
    zonesTitle: (n: number) => `${n} zones`,
    demoVerdict: (verdict: KinVerdict, zone: string) => demoSentence("en", verdict, zone),
    demoHint: "Point at any page to see its twins.",
    demoHintTouch: "Tap any page to see its twins.",
    demoPause: "Pause",
    demoResume: "Play",
    langName: "Español",
    title: "Your AI-built homepage has twins.",
    lede: (n: number) => `Slop detectors give you a score. Twinsites shows you the relatives: out of ${grouped(n, "en")} sites built with AI tools, the ones that look most like yours.`,
    privacy: "Screenshots are compared on your device and never uploaded. A pasted URL is captured once by a Cloudflare worker and not stored.",
    dropTitle: "Drop a screenshot of your homepage",
    dropHint: "Or paste it. A PNG or JPG of the first screen.",
    browse: "Choose a file",
    tryExample: "Or see an example result",
    browseZones: "Browse all zones",
    navZones: "Zones",
    searchLabel: "Search the catalog",
    searchPlaceholder: "Search by name or URL",
    searchEmpty: "No site with that name.",
    shotLabel: "Paste the URL of a public page",
    shotButton: "Capture and compare",
    shotVerifying: "verifying…",
    shotHint: "https://…",
    stageRead: "Reading the screenshot",
    stageModel: "Starting the on-device model",
    stageData: "Loading the catalog",
    stageMatch: "Comparing",
    another: "Compare another screenshot",
    twinsTitle: "Twelve twins",
    twinsDek: "Closest first. The number is a percentile: 90 means closer than 90% of all pairs in the catalog.",
    itsTwins: "See its twins",
    openSite: "Visit site",
    simLabel: "percentile",
    scoreNote: "Percentiles compare against every pair of sites in the catalog. They measure likeness, not copying.",
    resultLine: (verdict: KinVerdict, percentile: number) => resultSentence("en", verdict, percentile),
    progressLabel: "Loading progress",
    mapTitle: "The map",
    mapDek: "Every dot is an AI-built site. Closer dots look more alike. Yours lands in a zone.",
    mapHint: "Drag to pan. Scroll to zoom. Click a dot to open the site.",
    fit: "Reset view",
    you: "Your screenshot",
    traitsTitle: "What you share with them",
    traitsDek: "Counted across the twelve twins.",
    suggestTitle: "How to step aside",
    suggestDek: "Rules of thumb read off those marks. A direction, not a redesign.",
    shareTitle: "Share your zone",
    shareDek: "The card is drawn in this tab. The post links to your zone.",
    download: "Download the card",
    includeMine: "Include my screenshot on the card",
    post: "Post on X",
    shareNote: "On a phone, sharing can attach the card. On desktop, the post opens with the sentence and the link; download the card to attach it.",
    listTitle: "Get the monthly Twins report + your redesign prompt",
    listEmail: "Email",
    listConsent: "I agree to receive emails from Twinsites. Unsubscribe anytime.",
    listPrivacy: "Privacy",
    listSend: "Send",
    listSuccess: "You're on the list. The next report will find you.",
    listError: "That didn't send. Try again in a moment.",
    footerCatalog: "Catalog: awesome-vibe-coded-apps (CC0)",
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
    atlasLede: "Groups of AI-built homepages that look alike. Open one to see who lives there.",
    zoneCount: (n: number) => `${grouped(n, "en")} sites`,
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
    zoneLink: (zone: string) => `Ver todas las webs de ${zone}`,
    revealLabel: "Tu página junto a su gemela más cercana",
    closest: "Gemela más cercana:",
    mosaicCaption: "Portadas reales del catálogo. Señala cualquiera para ver sus gemelas.",
    noShotTitle: "¿Sin captura a mano?",
    findTitle: "¿Ya está en el catálogo?",
    privacyMore: "Cómo funciona la privacidad",
    footerBy: "Hecho por",
    footerSource: "Código fuente (MIT)",
    cardYou: "La mía",
    cardTwin: "Gemela más cercana",
    privacyShort: "Las capturas nunca salen de tu navegador.",
    zonesTitle: (n: number) => `${n} zonas`,
    demoVerdict: (verdict: KinVerdict, zone: string) => demoSentence("es", verdict, zone),
    demoHint: "Señala cualquier portada para ver sus gemelas.",
    demoHintTouch: "Toca cualquier portada para ver sus gemelas.",
    demoPause: "Pausa",
    demoResume: "Reanudar",
    langName: "English",
    title: "Tu web hecha con IA tiene gemelas.",
    lede: (n: number) => `Los detectores de webs genéricas te dan una nota. Twinsites te enseña a las parientes: de ${grouped(n, "es")} webs hechas con herramientas de IA, las que más se parecen a la tuya.`,
    privacy: "Las capturas se comparan en tu dispositivo y nunca se suben. Una URL pegada la captura una vez un worker de Cloudflare, sin guardarla.",
    dropTitle: "Suelta una captura de tu portada",
    dropHint: "O pégala. Un PNG o JPG de la primera pantalla.",
    browse: "Elegir archivo",
    tryExample: "O mira un resultado de ejemplo",
    browseZones: "Ver todas las zonas",
    navZones: "Zonas",
    searchLabel: "Buscar en el catálogo",
    searchPlaceholder: "Busca por nombre o URL",
    searchEmpty: "Ninguna web con ese nombre.",
    shotLabel: "Pega la URL de una página pública",
    shotButton: "Capturar y comparar",
    shotVerifying: "comprobando…",
    shotHint: "https://…",
    stageRead: "Leyendo la captura",
    stageModel: "Arrancando el modelo en el dispositivo",
    stageData: "Cargando el catálogo",
    stageMatch: "Comparando",
    another: "Comparar otra captura",
    twinsTitle: "Doce gemelas",
    twinsDek: "De más a menos cercana. El número es un percentil: 90 significa más cerca que el 90 % de las parejas del catálogo.",
    itsTwins: "Ver sus gemelas",
    openSite: "Visitar web",
    simLabel: "percentil",
    scoreNote: "Los percentiles se calculan contra todas las parejas de webs del catálogo. Miden parecido, no copia.",
    resultLine: (verdict: KinVerdict, percentile: number) => resultSentence("es", verdict, percentile),
    progressLabel: "Progreso de carga",
    mapTitle: "El mapa",
    mapDek: "Cada punto es una web hecha con IA. Los puntos cercanos se parecen más. La tuya cae en una zona.",
    mapHint: "Arrastra para moverte. La rueda acerca la vista. Un clic abre la web.",
    fit: "Reencuadrar",
    you: "Tu captura",
    traitsTitle: "Lo que compartes con ellas",
    traitsDek: "Contado sobre las doce gemelas.",
    suggestTitle: "Cómo apartarte",
    suggestDek: "Reglas sencillas leídas de esas marcas. Una dirección, no un rediseño.",
    shareTitle: "Comparte tu zona",
    shareDek: "La tarjeta se dibuja en esta pestaña. La publicación enlaza a tu zona.",
    download: "Descargar la tarjeta",
    includeMine: "Incluir mi captura en la tarjeta",
    post: "Publicar en X",
    shareNote: "En el móvil, compartir puede adjuntar la tarjeta. En el escritorio, la publicación se abre con la frase y el enlace; descarga la tarjeta para adjuntarla.",
    listTitle: "El informe mensual de gemelas y tu indicación para rediseñar",
    listEmail: "Correo",
    listConsent: "Acepto recibir correos de Twinsites. Puedo darme de baja cuando quiera.",
    listPrivacy: "Privacidad",
    listSend: "Enviar",
    listSuccess: "Estás en la lista. El próximo informe te encontrará.",
    listError: "No se envió. Inténtalo de nuevo en un momento.",
    footerCatalog: "Catálogo: awesome-vibe-coded-apps (CC0)",
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
    atlasLede: "Grupos de webs hechas con IA que se parecen entre sí. Abre una para ver quién vive ahí.",
    zoneCount: (n: number) => `${grouped(n, "es")} webs`,
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

function demoSentence(lang: Lang, verdict: KinVerdict, zone: string): string {
  const es = lang === "es";
  const lit = es ? "Sus parecidas más cercanas en este muro están en amarillo." : "Its closest look-alikes on this wall are in yellow.";
  if (verdict.mode === "none") {
    return es ? `Ninguna gemela en el ${verdict.top} % superior: es una rara. ${lit}` : `No twin in the top ${verdict.top}%: a rare one. ${lit}`;
  }
  if (verdict.mode === "neighborhood") {
    return es
      ? `${verdict.count} vecinas en el ${verdict.top} % superior, en ${zone}. ${lit}`
      : `${verdict.count} close neighbours in the top ${verdict.top}%, in ${zone}. ${lit}`;
  }
  const noun = es ? (verdict.count === 1 ? "gemela" : "gemelas") : verdict.count === 1 ? "twin" : "twins";
  return es
    ? `${verdict.count} ${noun} en el ${verdict.top} % superior, en ${zone}. ${lit}`
    : `${verdict.count} ${noun} in the top ${verdict.top}%, in ${zone}. ${lit}`;
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
