import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ColorName, Lang, Traits } from "./types";
import type { Suggestion } from "./lib/suggest";
import { formatPercentile, type KinVerdict } from "./lib/calibrate";
import { COLOR_EN, COLOR_ES } from "./lib/labels";
import type { Diagnosis, TraitKey } from "./lib/diagnose";
import type { Progress } from "./lib/history";
import type { RivalBand } from "./components/Rivals";

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
    summary: (input: SummaryInput) => summarySentence("en", input),
    inspoTitle: "Pages that look like nobody",
    inspoDek: "In each kind of product, the pages with the fewest twins in the catalog. Different isn't automatically better: use them as a nudge, not a template.",
    inspoCategory: "Kind of product",
    inspoTwins: (n: number) => (n === 0 ? "No twin in the top 20%" : n === 1 ? "1 twin in the top 20%" : `${n} twins in the top 20%`),
    markCentre: "Centred block and axis",
    markEmpty: "Empty bands",
    markGradient: "Gradient in the margins",
    markAccent: (color: string) => `${color} accent`,
    marksHide: "Hide the marks",
    marksShow: "Show what makes it generic",
    correctHint: "Read something wrong? Tap it to correct it; the diagnosis and the prompt update.",
    correctAsk: (label: string) => `Not “${label}”? It's actually:`,
    correctCancel: "Cancel",
    correctedLine: (from: string, to: string) => `You corrected “${from}” to “${to}”.`,
    correctUndo: "Undo",
    correctionConsent: "Send these corrections anonymously to improve Twinsites: only the trait, both values and six rounded measurements. No image, no URL.",
    correctionSend: "Send corrections",
    correctionSent: "Thank you. Corrections like yours tune the rules for everyone.",
    correctionError: "That didn't send. Try again in a moment.",
    correctionLocal: "Your corrections apply here only.",
    rivalsTitle: "Next to your competitors",
    rivalsDek: "Add screenshots of up to three competitors' homepages. Each is measured against yours on the same scale as the twins, here in your browser.",
    rivalAdd: "Add a competitor",
    rivalHint: (n: number): string => (n === 1 ? "One more screenshot of their first screen." : `Up to ${n} screenshots of their first screen.`),
    rivalName: "Competitor name",
    rivalDefault: "Competitor",
    rivalMeasuring: "Measuring…",
    rivalFailed: "That image couldn't be read.",
    rivalRemove: "Remove",
    rivalSmall: "Small image: a rough reading.",
    rivalVerdict: (band: RivalBand): string =>
      band === "mixup" ? "Easy to mix up with yours" : band === "close" ? "Close to yours" : band === "some" ? "Some likeness" : "Clearly different",
    rivalSummary: (name: string, band: RivalBand): string =>
      band === "mixup"
        ? `Visitors could mistake you for ${name}. Start with the first change above.`
        : band === "close"
          ? `${name} is the closest; the moves above will widen the gap.`
          : `None of them looks much like you. ${name} is the nearest.`,
    rivalUrlSoon: "Coming later: compare by pasting their URLs.",
    smallNote: "This image is small. Likeness reads best on a full-size desktop screenshot (1280px wide or more); small or blurry captures can match the wrong pages.",
    copyTitle: "What the words say",
    copyDek: "The large text on your first screen, read in this browser, checked against the stock phrases of AI-built landing pages.",
    copyRead: "Read the words too",
    copyWeight: "Downloads a reader of about 7 MB once. The screenshot stays on your device.",
    copyReading: "Reading the large text…",
    copyFailed: "The words couldn't be read here. The rest of the result still holds.",
    copyNothing: "No large text was readable on this screenshot.",
    copyCount: (n: number, total: number) => `on at least ${n} of ${grouped(total, "en")} catalog homepages`,
    copyClean: "No stock phrases in the large text. The words aren't what makes you look like the others.",
    copyCaveat: "Read automatically from the image: it can miss or garble words. Counts come from the catalog thumbnails, so they are a floor, not an exact figure.",
    copyMove: (phrases: string) => `Rewrite the headline and subhead without stock phrases like ${phrases}: say what the product does and for whom, in plain words.`,
    diagnosisTitle: "Why you look like them",
    diagnosisLine: (d: Diagnosis) => recipeSentence("en", d),
    traitLabel: (key: TraitKey, traits: Traits) => traitWord("en", key, traits),
    movesTitle: "What to change, strongest first",
    moveEvidence: (n: number, total: number) => `${n} of ${total} twins`,
    promptTitle: "Your redesign prompt",
    promptDek: "Paste it into Lovable, v0, Bolt or Cursor with your current page. Then check the new version here: Twinsites shows the before and after.",
    copyPrompt: "Copy prompt",
    copiedPrompt: "Copied",
    prompt: (input: PromptInput) => buildPrompt("en", input),
    progressTitle: "Since your last check",
    progressAsk: "Is this a new version of the page you checked before?",
    progressYes: "Yes, compare them",
    progressNo: "No, it's a different page",
    progressLine: (p: Progress) => `${p.before} → ${p.after} twins in the top ${p.top}%`,
    progressNearest: (p: Progress) => `Closest twin: ${p.nearestBefore.toFixed(1)} → ${p.nearestAfter.toFixed(1)} percentile.`,
    progressWorse: "More twins than before. Check the moves above and try another version.",
    progressBetter: "Fewer twins than before. This is the one worth sharing.",
    progressSame: "Same number of twins. The moves above go further.",
    forgetCheck: "Forget my last check",
    forgottenCheck: "Forgotten. Your last check only lived in this browser.",
    progressPost: (p: Progress, total: number) =>
      `My homepage went from ${p.before} to ${p.after} twins in the top ${p.top}% of ${grouped(total, "en")} AI-built sites.`,
    progressUnit: (top: number) => `twins in the top ${top}%`,
    progressAmong: (total: number) => `among ${grouped(total, "en")} AI-built homepages`,
    shareProgressTitle: "Share your progress",
    shareProgressDek: "The card is drawn in this tab. The post links to Twinsites so others can check theirs.",
    cardBefore: "Before",
    cardAfter: "After",
    includeBoth: "Show both screenshots on the card",
    exampleTitle: "What's worth sharing",
    exampleDek: "A made-up page, measured for real: checked, fixed with the prompt Twinsites wrote for it, checked again.",
    exampleSteps: ["Check your page: see its twins and why.", "Paste the redesign prompt into the tool you built it with.", "Check the new version and share the drop."],
    exampleNote: "Acme Notes is a made-up page built for this example. The numbers are what Twinsites measured; your page and your tool will give a different result. See both pages:",
    exampleBefore: "before",
    exampleAfter: "after",
    exampleAlt: "Example card: a made-up landing page went from many twins to few after following its redesign prompt.",
    navFaq: "FAQ",
    faqTitle: "Questions people ask",
    faqPageTitle: "Questions",
    faq: [
      { q: "What is a twin?", a: "A homepage whose first screen looks most like yours, out of the 2,003 in the catalog. The number next to each twin is a percentile: 90 means that pair is closer than 90% of all pairs of sites in the catalog. It measures visual likeness, not copying." },
      { q: "How does Twinsites compare pages?", a: "A small vision model (MobileCLIP) runs in your browser and turns the first screen of your page into a set of numbers. Those are compared with the same numbers for every page in the catalog, which comes from the open list awesome-vibe-coded-apps. Nothing about your page is sent to a server." },
      { q: "Is having twins bad?", a: "Not by itself. It means your first screen follows the same look as many other AI-built pages. That matters if you want people to remember your product or tell it apart from the rest. Some shared conventions, like a clear headline and one obvious button, are there because they work." },
      { q: "How reliable is “Why you look like them”?", a: "The traits (light or dark, accent colour, spacing, gradient, box grid, centring) are read from a very small version of your screenshot with simple rules. Checked by hand on random samples, they are right most of the time, roughly 3 in 4 for gradient and a bit better for centring, but not always: a dark photo behind the headline can read as a gradient, for example. Treat them as rules of thumb, not as a design review." },
      { q: "How does Twinsites read the words on my page?", a: "After the result, a text reader (Tesseract) runs in your browser and reads the large text on your screenshot. It looks for stock phrases of AI-built landing pages, like “All-in-one” or “Watch demo”, and adds a step to the prompt when it finds them. It can miss or garble words, especially on photos or decorative type. The counts next to each phrase come from reading the catalog thumbnails, so they are a minimum. On phones it only runs when you ask, because it downloads about 7 MB." },
      { q: "How does the comparison with competitors work?", a: "Add screenshots of up to three competitors' homepages. Each one is measured against yours with the same model and the same percentile scale as the twins, all in your browser. Above 95 means a visitor could mix you up. Comparing by pasting their URLs will come later." },
      { q: "Why does a small screenshot give a different result?", a: "The model compares fine detail. A small, blurry or heavily compressed image can match the wrong pages, even its own original. Use a full-size desktop screenshot, at least 1280 pixels wide; Twinsites warns you when the image is smaller than 1000." },
      { q: "What happens when I correct a trait?", a: "The diagnosis, the summary and the prompt update at once, in your browser. Only if you tick the box, the correction is sent anonymously: which trait, what Twinsites read, what you chose and six rounded measurements of the screenshot. Never the image, the URL, your IP or cookies. Corrections like these are used to tune the rules." },
      { q: "Will the redesign prompt fix my page?", a: "It tells your AI tool what to change, not exactly how the page should end up. Different tools, and different runs of the same tool, will interpret it differently, so check the new version here before you keep it. Some results will drop a lot, some a little, and a change can also add new twins." },
      { q: "Is the Acme Notes example real?", a: "The page is made up, built on purpose with the usual AI-builder look. The numbers are real: Twinsites measured 14 twins in the top 5% before and none after. But the drop depends on how that page was rebuilt from the prompt. Your page and your tool will give a different result. Both versions are published so you can check them yourself." },
      { q: "How does the before and after comparison work?", a: "Your last screenshot check (its scores and a small preview) is kept in this browser only. When you check a new screenshot, Twinsites asks whether it is a new version of the same page, because it cannot tell on its own. Answer yes only if it is. You can forget the last check from the result page at any time." },
      { q: "Is my screenshot uploaded?", a: "No. Screenshots are compared on your device and never leave the browser. If you paste a URL instead, a Cloudflare worker visits that public page once to take the screenshot and does not keep it. There are no cookies; the optional counter only records aggregate events." },
      { q: "Why only the first screen, and why desktop?", a: "The catalog stores the first screen of each homepage at desktop size (1440×900), so Twinsites compares the top of your image with that. A phone screenshot still works, but the match is rougher." },
      { q: "My site is in the catalog and I want it out.", a: "Use “Is your site here and you want it removed?” at the bottom of any page. It opens a short request, and the site is taken out of the next build." },
    ],
    diagnosisCaveat: "Rules of thumb read from a small version of your screenshot.",
    reliability: "How reliable is this?",
    promptCaveat: "It says what to change, not how the page should end up. Results vary with the tool.",
    progressCaveat: "Twinsites can't tell on its own, so only compare versions of the same page.",
    privacyShort: "Screenshots never leave your browser.",
    zonesTitle: (n: number) => `${n} zones`,
    demoVerdict: (verdict: KinVerdict, zone: string) => demoSentence("en", verdict, zone),
    demoHint: "Point at any page to see its twins.",
    demoHintTouch: "Tap any page to see its twins.",
    demoPause: "Pause",
    demoResume: "Play",
    langName: "Español",
    title: "Your AI-built homepage has twins.",
    lede: (n: number) => `Twinsites compares your homepage with ${grouped(n, "en")} sites built with AI tools, shows you its twins and why, and writes the prompt that makes it stand apart.`,
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
    summary: (input: SummaryInput) => summarySentence("es", input),
    inspoTitle: "Webs que no se parecen a nadie",
    inspoDek: "En cada tipo de producto, las páginas con menos gemelas del catálogo. Distinta no significa mejor por sí sola: úsalas como empujón, no como plantilla.",
    inspoCategory: "Tipo de producto",
    inspoTwins: (n: number) => (n === 0 ? "Ninguna gemela en el 20 % superior" : n === 1 ? "1 gemela en el 20 % superior" : `${n} gemelas en el 20 % superior`),
    markCentre: "Bloque y eje centrados",
    markEmpty: "Franjas vacías",
    markGradient: "Degradado en los márgenes",
    markAccent: (color: string) => `Acento ${color}`,
    marksHide: "Ocultar las marcas",
    marksShow: "Mostrar qué la hace genérica",
    correctHint: "¿Algo mal leído? Tócalo para corregirlo; el diagnóstico y el prompt se actualizan.",
    correctAsk: (label: string) => `¿No es «${label}»? En realidad es:`,
    correctCancel: "Cancelar",
    correctedLine: (from: string, to: string) => `Has corregido «${from}» por «${to}».`,
    correctUndo: "Deshacer",
    correctionConsent: "Enviar estas correcciones de forma anónima para mejorar Twinsites: solo el rasgo, los dos valores y seis medidas redondeadas. Ni imagen ni URL.",
    correctionSend: "Enviar correcciones",
    correctionSent: "Gracias. Correcciones como la tuya ajustan las reglas para todos.",
    correctionError: "No se envió. Inténtalo de nuevo en un momento.",
    correctionLocal: "Tus correcciones solo se aplican aquí.",
    rivalsTitle: "Junto a tus competidores",
    rivalsDek: "Añade capturas de las portadas de hasta tres competidores. Cada una se mide contra la tuya con la misma escala que las gemelas, aquí en tu navegador.",
    rivalAdd: "Añadir un competidor",
    rivalHint: (n: number): string => (n === 1 ? "Una captura más de su primera pantalla." : `Hasta ${n} capturas de su primera pantalla.`),
    rivalName: "Nombre del competidor",
    rivalDefault: "Competidor",
    rivalMeasuring: "Midiendo…",
    rivalFailed: "No se pudo leer esa imagen.",
    rivalRemove: "Quitar",
    rivalSmall: "Imagen pequeña: lectura aproximada.",
    rivalVerdict: (band: RivalBand): string =>
      band === "mixup" ? "Fácil de confundir con la tuya" : band === "close" ? "Cerca de la tuya" : band === "some" ? "Algo de parecido" : "Claramente distinta",
    rivalSummary: (name: string, band: RivalBand): string =>
      band === "mixup"
        ? `Un visitante podría confundirte con ${name}. Empieza por el primer cambio de arriba.`
        : band === "close"
          ? `${name} es la más cercana; los cambios de arriba ampliarán la distancia.`
          : `Ninguna se parece mucho a ti. ${name} es la más cercana.`,
    rivalUrlSoon: "Más adelante: comparar pegando sus URLs.",
    smallNote: "Esta imagen es pequeña. El parecido se mide mejor con una captura de escritorio a tamaño completo (1280 px de ancho o más); las capturas pequeñas o borrosas pueden coincidir con las páginas equivocadas.",
    copyTitle: "Lo que dicen las palabras",
    copyDek: "El texto grande de tu primera pantalla, leído en este navegador y comparado con las frases hechas de las landings creadas con IA.",
    copyRead: "Leer también las palabras",
    copyWeight: "Descarga una vez un lector de unos 7 MB. La captura no sale de tu dispositivo.",
    copyReading: "Leyendo el texto grande…",
    copyFailed: "No se pudieron leer las palabras aquí. El resto del resultado sigue siendo válido.",
    copyNothing: "No se pudo leer texto grande en esta captura.",
    copyCount: (n: number, total: number) => `en al menos ${n} de ${grouped(total, "es")} portadas del catálogo`,
    copyClean: "No hay frases hechas en el texto grande. Las palabras no son lo que te hace parecida a las demás.",
    copyCaveat: "Leído automáticamente de la imagen: puede saltarse o confundir palabras. Las cifras salen de las miniaturas del catálogo, así que son un mínimo, no un dato exacto.",
    copyMove: (phrases: string) => `Reescribe el titular y el subtítulo sin frases hechas como ${phrases}: di qué hace el producto y para quién, con palabras sencillas.`,
    diagnosisTitle: "Por qué te pareces a ellas",
    diagnosisLine: (d: Diagnosis) => recipeSentence("es", d),
    traitLabel: (key: TraitKey, traits: Traits) => traitWord("es", key, traits),
    movesTitle: "Qué cambiar, de más a menos efecto",
    moveEvidence: (n: number, total: number) => `${n} de ${total} gemelas`,
    promptTitle: "Tu prompt de rediseño",
    promptDek: "Pégalo en Lovable, v0, Bolt o Cursor junto con tu página actual. Después comprueba aquí la nueva versión: Twinsites te enseña el antes y el después.",
    copyPrompt: "Copiar prompt",
    copiedPrompt: "Copiado",
    prompt: (input: PromptInput) => buildPrompt("es", input),
    progressTitle: "Desde tu última comprobación",
    progressAsk: "¿Es una nueva versión de la página que comprobaste antes?",
    progressYes: "Sí, compáralas",
    progressNo: "No, es otra página",
    progressLine: (p: Progress) => `${p.before} → ${p.after} gemelas en el ${p.top} % superior`,
    progressNearest: (p: Progress) => `Gemela más cercana: percentil ${p.nearestBefore.toFixed(1).replace(".", ",")} → ${p.nearestAfter.toFixed(1).replace(".", ",")}.`,
    progressWorse: "Más gemelas que antes. Revisa los cambios de arriba y prueba otra versión.",
    progressBetter: "Menos gemelas que antes. Esta es la que merece compartirse.",
    progressSame: "Las mismas gemelas. Los cambios de arriba llegan más lejos.",
    forgetCheck: "Olvidar mi última comprobación",
    forgottenCheck: "Olvidada. Tu última comprobación solo vivía en este navegador.",
    progressPost: (p: Progress, total: number) =>
      `Mi web ha pasado de ${p.before} a ${p.after} gemelas en el ${p.top} % superior de ${grouped(total, "es")} webs hechas con IA.`,
    progressUnit: (top: number) => `gemelas en el ${top} % superior`,
    progressAmong: (total: number) => `entre ${grouped(total, "es")} portadas hechas con IA`,
    shareProgressTitle: "Comparte tu progreso",
    shareProgressDek: "La tarjeta se dibuja en esta pestaña. La publicación enlaza a Twinsites para que otros comprueben la suya.",
    cardBefore: "Antes",
    cardAfter: "Después",
    includeBoth: "Mostrar las dos capturas en la tarjeta",
    exampleTitle: "Lo que merece compartirse",
    exampleDek: "Una página inventada, medida de verdad: comprobada, corregida con el prompt que Twinsites escribió para ella y vuelta a comprobar.",
    exampleSteps: ["Comprueba tu página: sus gemelas y por qué.", "Pega el prompt de rediseño en la herramienta con la que la hiciste.", "Comprueba la nueva versión y comparte la bajada."],
    exampleNote: "Acme Notes es una página inventada para este ejemplo. Los números son los que midió Twinsites; tu página y tu herramienta darán otro resultado. Mira las dos páginas:",
    exampleBefore: "antes",
    exampleAfter: "después",
    exampleAlt: "Tarjeta de ejemplo: una landing inventada pasó de muchas gemelas a pocas tras seguir su prompt de rediseño.",
    navFaq: "Preguntas",
    faqTitle: "Preguntas frecuentes",
    faqPageTitle: "Preguntas",
    faq: [
      { q: "¿Qué es una gemela?", a: "Una portada cuya primera pantalla se parece más a la tuya, entre las 2.003 del catálogo. El número junto a cada gemela es un percentil: 90 significa que esa pareja está más cerca que el 90 % de todas las parejas de webs del catálogo. Mide parecido visual, no copia." },
      { q: "¿Cómo compara Twinsites las páginas?", a: "Un modelo de visión pequeño (MobileCLIP) se ejecuta en tu navegador y convierte la primera pantalla de tu página en una serie de números. Se comparan con los mismos números de cada página del catálogo, que sale de la lista abierta awesome-vibe-coded-apps. Nada de tu página se envía a un servidor." },
      { q: "¿Tener gemelas es malo?", a: "No por sí mismo. Significa que tu primera pantalla sigue el mismo aspecto que muchas otras webs hechas con IA. Importa si quieres que la gente recuerde tu producto o lo distinga del resto. Algunas convenciones compartidas, como un titular claro y un botón evidente, existen porque funcionan." },
      { q: "¿Qué fiabilidad tiene «Por qué te pareces a ellas»?", a: "Los rasgos (claro u oscuro, color de acento, espaciado, degradado, retícula de cajas, centrado) se leen de una versión muy pequeña de tu captura con reglas sencillas. Revisados a mano sobre muestras al azar, aciertan la mayoría de las veces, más o menos 3 de cada 4 en el degradado y algo más en el centrado, pero no siempre: una foto oscura detrás del titular puede leerse como degradado, por ejemplo. Tómalos como reglas orientativas, no como una revisión de diseño." },
      { q: "¿Cómo lee Twinsites las palabras de mi página?", a: "Tras el resultado, un lector de texto (Tesseract) se ejecuta en tu navegador y lee el texto grande de tu captura. Busca frases hechas de las landings creadas con IA, como «Todo en uno» o «Ver demo», y añade un paso al prompt cuando las encuentra. Puede saltarse o confundir palabras, sobre todo en fotos o tipografías decorativas. Las cifras junto a cada frase salen de leer las miniaturas del catálogo, así que son un mínimo. En el móvil solo se ejecuta si lo pides, porque descarga unos 7 MB." },
      { q: "¿Cómo funciona la comparación con competidores?", a: "Añade capturas de las portadas de hasta tres competidores. Cada una se mide contra la tuya con el mismo modelo y la misma escala de percentiles que las gemelas, todo en tu navegador. Por encima de 95, un visitante podría confundiros. Comparar pegando sus URLs llegará más adelante." },
      { q: "¿Por qué una captura pequeña da otro resultado?", a: "El modelo compara detalles finos. Una imagen pequeña, borrosa o muy comprimida puede coincidir con las páginas equivocadas, incluso no reconocer su propio original. Usa una captura de escritorio a tamaño completo, de al menos 1280 píxeles de ancho; Twinsites te avisa cuando la imagen mide menos de 1000." },
      { q: "¿Qué pasa cuando corrijo un rasgo?", a: "El diagnóstico, el resumen y el prompt se actualizan al instante, en tu navegador. Solo si marcas la casilla, la corrección se envía de forma anónima: qué rasgo, qué leyó Twinsites, qué elegiste y seis medidas redondeadas de la captura. Nunca la imagen, la URL, tu IP ni cookies. Esas correcciones sirven para ajustar las reglas." },
      { q: "¿El prompt de rediseño arreglará mi página?", a: "Le dice a tu herramienta de IA qué cambiar, no cómo debe quedar exactamente. Cada herramienta, e incluso cada intento con la misma, lo interpretará de forma distinta, así que comprueba aquí la nueva versión antes de quedártela. Unas veces bajarán mucho las gemelas, otras poco, y un cambio también puede traer gemelas nuevas." },
      { q: "¿El ejemplo de Acme Notes es real?", a: "La página es inventada, hecha a propósito con el aspecto típico de los constructores con IA. Los números son reales: Twinsites midió 14 gemelas en el 5 % superior antes y ninguna después. Pero esa bajada depende de cómo se rehízo la página a partir del prompt. Tu página y tu herramienta darán otro resultado. Las dos versiones están publicadas para que lo compruebes tú." },
      { q: "¿Cómo funciona la comparación de antes y después?", a: "Tu última comprobación (sus resultados y una vista previa pequeña) se guarda solo en este navegador. Cuando compruebas una captura nueva, Twinsites te pregunta si es una nueva versión de la misma página, porque no puede saberlo por sí solo. Responde que sí solo si lo es. Puedes olvidar la última comprobación desde la página de resultado cuando quieras." },
      { q: "¿Se sube mi captura?", a: "No. Las capturas se comparan en tu dispositivo y nunca salen del navegador. Si en su lugar pegas una URL, un worker de Cloudflare visita esa página pública una vez para hacer la captura y no la guarda. No hay cookies; el contador opcional solo registra eventos agregados." },
      { q: "¿Por qué solo la primera pantalla, y por qué escritorio?", a: "El catálogo guarda la primera pantalla de cada portada en tamaño escritorio (1440×900), así que Twinsites compara con eso la parte de arriba de tu imagen. Una captura de móvil también funciona, pero el parecido es más aproximado." },
      { q: "Mi web está en el catálogo y quiero retirarla.", a: "Usa «¿Tu web aparece y quieres retirarla?» al pie de cualquier página. Abre una solicitud breve y la web se retira en la siguiente versión." },
    ],
    diagnosisCaveat: "Reglas orientativas leídas de una versión pequeña de tu captura.",
    reliability: "¿Qué fiabilidad tiene esto?",
    promptCaveat: "Dice qué cambiar, no cómo debe quedar la página. El resultado varía según la herramienta.",
    progressCaveat: "Twinsites no puede saberlo por sí solo, así que compara solo versiones de la misma página.",
    privacyShort: "Las capturas nunca salen de tu navegador.",
    zonesTitle: (n: number) => `${n} zonas`,
    demoVerdict: (verdict: KinVerdict, zone: string) => demoSentence("es", verdict, zone),
    demoHint: "Señala cualquier portada para ver sus gemelas.",
    demoHintTouch: "Toca cualquier portada para ver sus gemelas.",
    demoPause: "Pausa",
    demoResume: "Reanudar",
    langName: "English",
    title: "Tu web hecha con IA tiene gemelas.",
    lede: (n: number) => `Twinsites compara tu portada con ${grouped(n, "es")} webs hechas con herramientas de IA, te enseña sus gemelas y por qué, y escribe el prompt para que se distinga.`,
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

export interface PromptInput {
  diagnosis: Diagnosis;
  traits: Traits;
  verdict: KinVerdict;
  zone: string;
  moves: string[];
}

/** Short label for the value a page has on one trait, as used in chips. */
function traitWord(lang: Lang, key: TraitKey, traits: Traits): string {
  const es = lang === "es";
  switch (key) {
    case "mode":
      return traits.mode === "dark" ? (es ? "Oscuro" : "Dark") : es ? "Claro" : "Light";
    case "color":
      return traits.dominantName === "neutral"
        ? es ? "Sin color de acento" : "No accent colour"
        : es ? `Acento ${COLOR_ES[traits.dominantName]}` : `${cap(COLOR_EN[traits.dominantName])} accent`;
    case "density":
      return traits.density === "airy" ? (es ? "Mucho aire" : "Lots of air") : traits.density === "packed" ? (es ? "Denso" : "Dense") : es ? "Espaciado uniforme" : "Even spacing";
    case "gradient":
      return traits.gradient ? (es ? "Degradado suave" : "Soft gradient") : es ? "Color plano" : "Flat colour";
    case "bento":
      return traits.bento ? (es ? "Retícula de cajas" : "Box grid") : es ? "Sin retícula de cajas" : "No box grid";
    case "centered":
      return traits.centered ? (es ? "Todo centrado" : "Centred") : es ? "Descentrado" : "Off-centre";
  }
}

/** The same values, as phrases inside a sentence. */
function traitPhrase(lang: Lang, key: TraitKey, traits: Traits): string {
  const es = lang === "es";
  switch (key) {
    case "mode":
      return traits.mode === "dark" ? (es ? "fondo oscuro" : "a dark background") : es ? "fondo claro" : "a light background";
    case "color":
      return traits.dominantName === "neutral"
        ? es ? "colores neutros" : "mostly neutral colours"
        : es ? `acento ${COLOR_ES[traits.dominantName]}` : `a ${COLOR_EN[traits.dominantName]} accent`;
    case "density":
      return traits.density === "airy" ? (es ? "mucho espacio vacío" : "a lot of empty space") : traits.density === "packed" ? (es ? "una composición muy densa" : "a densely packed layout") : es ? "un espaciado uniforme" : "even, tidy spacing";
    case "gradient":
      return traits.gradient ? (es ? "un degradado suave de fondo" : "a soft gradient wash") : es ? "color plano" : "flat colour";
    case "bento":
      return traits.bento ? (es ? "una retícula de cajas redondeadas" : "a bento grid of rounded boxes") : es ? "sin retícula de cajas" : "no box grid";
    case "centered":
      return traits.centered ? (es ? "titular y botón centrados" : "a centred headline and button") : es ? "una composición descentrada" : "an off-centre layout";
  }
}

function listOf(parts: string[], es: boolean): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} ${es ? "y" : "and"} ${parts[parts.length - 1]}`;
}

function recipeSentence(lang: Lang, d: Diagnosis): string {
  const es = lang === "es";
  const pct = Math.round(d.recipeCatalog * 100);
  const total = grouped(d.catalogTotal, lang);
  return es
    ? `${d.recipeTwins} de tus ${d.twinTotal} gemelas comparten tu receta completa. En todo el catálogo, la sigue el ${pct} % de las ${total} webs.`
    : `${d.recipeTwins} of your ${d.twinTotal} twins share your whole recipe. Across the catalog, ${pct}% of the ${total} sites follow it.`;
}

function buildPrompt(lang: Lang, input: PromptInput): string {
  const es = lang === "es";
  const d = input.diagnosis;
  const recipe = listOf(
    d.recipe.map((part) => traitPhrase(lang, part.key, input.traits)),
    es,
  );
  const pct = Math.round(d.recipeCatalog * 100);
  const total = grouped(d.catalogTotal, lang);
  const steps = input.moves.map((move, index) => `${index + 1}. ${move}`).join("\n");
  if (es) {
    return [
      "Rediseña la primera pantalla de mi landing para que deje de parecer una plantilla genérica hecha con IA.",
      "",
      "Mantén el nombre del producto, los textos y la marca, salvo donde un paso de abajo diga lo contrario.",
      "",
      `Ahora mismo la primera pantalla tiene ${recipe}. Comparada con ${total} portadas hechas con IA, cae en la zona «${input.zone}»: ${d.recipeTwins} de sus ${d.twinTotal} gemelas más cercanas siguen esta misma receta, y también el ${pct} % de todo el catálogo.`,
      "",
      "Cámbiala así:",
      steps,
      "",
      "Evita también los recursos por defecto de los constructores con IA: titular centrado sobre un degradado suave, un botón principal en forma de píldora junto a un botón fantasma de «Ver demo», tres tarjetas de funciones idénticas con iconos, una fila de logos de relleno y tarjetas translúcidas con sombras suaves.",
      "",
      "Haz una elección audaz y concreta que encaje con lo que el producto es de verdad, y deja el resto en calma. Que siga siendo responsive y accesible: buen contraste, foco visible al navegar con teclado y texto real, no texto dentro de imágenes.",
    ].join("\n");
  }
  return [
    "Redesign the first screen of my landing page so it stops looking like a generic AI-built template.",
    "",
    "Keep the product name, the copy and the brand, except where a step below says otherwise.",
    "",
    `Right now the first screen has ${recipe}. Compared with ${total} AI-built homepages, it lands in the "${input.zone}" zone: ${d.recipeTwins} of its ${d.twinTotal} closest twins follow this same recipe, and so do ${pct}% of the whole catalog.`,
    "",
    "Change it like this:",
    steps,
    "",
    "Also avoid the usual AI-builder defaults: a centred headline over a soft gradient, a pill-shaped primary button next to a ghost \"Watch demo\" button, three identical feature cards with icons, a row of placeholder logos, and glassy cards with soft shadows.",
    "",
    "Make one bold, specific choice that fits what the product actually is, and keep everything else quiet. Keep it responsive and accessible: good contrast, visible keyboard focus, and real text rather than text in images.",
  ].join("\n");
}

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export interface SummaryInput {
  diagnosis: Diagnosis;
  traits: Traits;
  verdict: KinVerdict;
}

/** The single change worth making first, as a short imperative. */
function moveShort(lang: Lang, item: Suggestion): string {
  const es = lang === "es";
  switch (item.id) {
    case "shift-hue":
      return es ? `cambiar el acento ${COLOR_ES[item.from]} por ${COLOR_ES[item.to]}` : `move the accent from ${COLOR_EN[item.from]} to ${COLOR_EN[item.to]}`;
    case "add-accent":
      return es ? `añadir un único acento ${COLOR_ES[item.to]} y fuerte` : `add one strong ${COLOR_EN[item.to]} accent`;
    case "flip-mode":
      return item.mode === "light" ? (es ? "pasar a fondo claro" : "switch to a light background") : es ? "pasar a fondo oscuro" : "switch to a dark background";
    case "open-space":
      return es ? "dar más aire a la primera pantalla" : "give the first screen more room";
    case "add-density":
      return es ? "enseñar más producto en la primera pantalla" : "show more of the product on the first screen";
    case "drop-gradient":
      return es ? "quitar el degradado suave" : "drop the soft gradient";
    case "leave-bento":
      return es ? "cambiar la retícula de cajas por una sola imagen fuerte" : "replace the box grid with one strong visual";
    case "break-center":
      return es ? "sacar el titular del centro" : "move the headline off-centre";
    case "add-grain":
      return es ? "cambiar el color plano por textura o una foto" : "trade flat colour for texture or a photograph";
  }
}

function summarySentence(lang: Lang, input: SummaryInput): string {
  const es = lang === "es";
  const d = input.diagnosis;
  if (input.verdict.mode === "none") {
    return es
      ? "Tu página no se parece a ninguna del catálogo. Lo que la hace distinta merece quedarse."
      : "Your page doesn't look like anything in the catalog. Whatever makes it different is worth keeping.";
  }
  const recipe = listOf(d.recipe.map((part) => traitPhrase(lang, part.key, input.traits)), es);
  const first = d.moves[0];
  const why = es
    ? `Te pareces a tus gemelas sobre todo por ${recipe}.`
    : `You look like your twins mostly because of ${recipe}.`;
  if (!first) return why;
  return es ? `${why} El cambio con más efecto: ${moveShort(lang, first.item)}.` : `${why} The change with the most effect: ${moveShort(lang, first.item)}.`;
}

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
