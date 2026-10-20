import { useEffect, useState } from "react";
import { RouteLink } from "../router";
import { useI18n } from "../i18n";
import { track } from "../lib/analytics";

interface Report {
  generated: string;
  total: number;
  recipes: { mode: "light" | "dark"; density: "airy" | "packed" | "balanced"; centered: boolean; gradient: boolean; count: number; share: number }[];
  topFourShare: number;
  traits: { light: number; dark: number; airy: number; packed: number; centered: number; gradient: number; bento: number };
  colors: { name: string; share: number }[];
  twins: { top1Any: number; top5Any: number; top5Crowd: number };
  zones: { count: number; topFourShare: number; largest: { slug: string; labelEn: string; labelEs: string; size: number }[] };
  categories: { key: string; pages: number; crowded: number }[];
  phrases: { read: number; top: { id: string; label: string; count: number }[] };
}

const SWATCH: Record<string, string> = {
  neutral: "#9a9a9a",
  blue: "#3b6fe0",
  orange: "#f08a24",
  green: "#2e9e57",
  cyan: "#1fb5c9",
  indigo: "#4b4fc4",
  red: "#d93a3a",
  teal: "#179c8f",
  purple: "#8e44c9",
  pink: "#e45c9c",
  magenta: "#c03fb0",
  yellow: "#f2c916",
  amber: "#e8a317",
  lime: "#8cc63f",
};

const COPY = {
  en: {
    pageTitle: "What 2,003 AI-built homepages have in common",
    kicker: (date: string) => `Report · catalog captured ${date}`,
    title: (n: string) => `What ${n} AI-built homepages have in common`,
    lede: (n: string, four: string) =>
      `We took the first screen of every site in the awesome-vibe-coded-apps list, ${n} homepages, and measured how they look. Four layouts cover ${four} of them.`,
    statFour: "of the pages use one of four layouts, out of 24 possible combinations",
    statTop1: "have a look-alike in the top 1% of all pairs in the catalog",
    statCentred: "centre the headline and the button",
    statColors: "are mostly grey, blue or orange",
    recipesTitle: "Four layouts, most of the pages",
    recipesDek:
      "Each page gets four labels read from its pixels: light or dark ground, how much empty space, whether the headline and button sit centred, and whether a gradient washes the background. Most pages land in the same few boxes.",
    recipe: (r: Report["recipes"][number]) =>
      [
        r.mode === "light" ? "Light" : "Dark",
        r.density === "airy" ? "lots of empty space" : r.density === "packed" ? "packed" : "balanced",
        r.centered ? "centred headline" : "headline to one side",
        ...(r.gradient ? ["gradient wash"] : []),
      ].join(", "),
    pages: (n: string) => `${n} pages`,
    twinsTitle: "Look-alikes are the rule",
    twinsDek:
      "Every pair of pages gets a similarity score from a vision model. A page in the top 1% of pairs is closer to yours than 99 in 100 random pairs in the catalog.",
    twinTop1: "have at least one look-alike in the top 1%",
    twinTop5: "have at least one in the top 5%",
    twinCrowd: "have eight or more in the top 5%",
    colorsTitle: "Three colours, two thirds of the pages",
    colorsDek: "The colour that covers most of the first screen, background included.",
    categoriesTitle: "Where it's most crowded",
    categoriesDek: "Share of each category's pages with eight or more look-alikes in the top 5%.",
    phrasesTitle: "The words repeat too",
    phrasesDek: (n: string) =>
      `We read the large text on ${n} thumbnails. Thumbnails are small, so only headlines and big buttons are legible: these counts are a floor, not the real figure.`,
    phrasesCount: (n: number) => `${n} ${n === 1 ? "page" : "pages"}`,
    zonesTitle: (n: number) => `${n} zones`,
    zonesDek: (four: string) => `Grouping pages by look gives zones with names like places. The four largest hold ${four} of the catalog.`,
    zonesAll: "See every zone",
    methodTitle: "How this was measured, and what it can't say",
    method: [
      "Source: the public awesome-vibe-coded-apps list (CC0). Sites built with AI tools, not a random sample of the web.",
      "One screenshot per site: the first 1440×900 screen, captured by headless Chrome. Anything below the fold is not measured.",
      "Similarity comes from MobileCLIP-S0, an image model. Percentiles compare against every pair in the catalog: they measure likeness, not copying.",
      "Layout labels (ground, space, centring, gradient) are rules read off a small version of each screenshot. They are right most of the time, not always.",
      "Text was read with Tesseract on small thumbnails. It misses small type and garbles some words.",
    ],
    ctaTitle: "Is yours one of them?",
    ctaDek: "Drop a screenshot of your page. Twinsites names its look-alikes, says why, and gives you a prompt to change it. Your image stays in your browser.",
    ctaButton: "Check your page",
    shareText: (four: string, n: string) => `Four layouts cover ${four} of ${n} AI-built homepages. Is yours one of them?`,
    share: "Post",
    copyLink: "Copy link",
    copied: "Link copied",
    loading: "Loading the report…",
    failed: "The report could not load. Try again in a moment.",
  },
  es: {
    pageTitle: "Lo que tienen en común 2.003 webs hechas con IA",
    kicker: (date: string) => `Informe · catálogo capturado en ${date}`,
    title: (n: string) => `Lo que tienen en común ${n} webs hechas con IA`,
    lede: (n: string, four: string) =>
      `Tomamos la primera pantalla de cada web de la lista awesome-vibe-coded-apps, ${n} portadas, y medimos cómo se ven. Cuatro maquetaciones cubren el ${four}.`,
    statFour: "usa una de cuatro maquetaciones, de 24 combinaciones posibles",
    statTop1: "tiene una gemela en el 1 % de pares más parecidos del catálogo",
    statCentred: "centra el titular y el botón",
    statColors: "es sobre todo gris, azul o naranja",
    recipesTitle: "Cuatro maquetaciones, la mayoría de las webs",
    recipesDek:
      "Cada web recibe cuatro etiquetas leídas de sus píxeles: fondo claro u oscuro, cuánto espacio vacío, si el titular y el botón van centrados y si un degradado tiñe el fondo. La mayoría cae en las mismas pocas casillas.",
    recipe: (r: Report["recipes"][number]) =>
      [
        r.mode === "light" ? "Clara" : "Oscura",
        r.density === "airy" ? "mucho espacio vacío" : r.density === "packed" ? "densa" : "equilibrada",
        r.centered ? "titular centrado" : "titular a un lado",
        ...(r.gradient ? ["con degradado"] : []),
      ].join(", "),
    pages: (n: string) => `${n} webs`,
    twinsTitle: "Parecerse es lo normal",
    twinsDek:
      "Cada par de webs recibe una puntuación de parecido de un modelo de visión. Una web en el 1 % de pares más parecidos está más cerca de la tuya que 99 de cada 100 pares al azar del catálogo.",
    twinTop1: "tiene al menos una gemela en el 1 % más parecido",
    twinTop5: "tiene al menos una en el 5 % más parecido",
    twinCrowd: "tiene ocho o más en el 5 % más parecido",
    colorsTitle: "Tres colores, dos tercios de las webs",
    colorsDek: "El color que más ocupa la primera pantalla, fondo incluido.",
    categoriesTitle: "Dónde hay más aglomeración",
    categoriesDek: "Porcentaje de webs de cada categoría con ocho o más gemelas en el 5 % más parecido.",
    phrasesTitle: "Las palabras también se repiten",
    phrasesDek: (n: string) =>
      `Leímos el texto grande de ${n} miniaturas. Son pequeñas, así que solo se leen titulares y botones grandes: estas cifras son un mínimo, no el número real.`,
    phrasesCount: (n: number) => `${n} ${n === 1 ? "web" : "webs"}`,
    zonesTitle: (n: number) => `${n} zonas`,
    zonesDek: (four: string) => `Agrupar las webs por aspecto da zonas con nombre de lugar. Las cuatro mayores reúnen el ${four} del catálogo.`,
    zonesAll: "Ver todas las zonas",
    methodTitle: "Cómo se ha medido y qué no puede decir",
    method: [
      "Fuente: la lista pública awesome-vibe-coded-apps (CC0). Webs hechas con herramientas de IA, no una muestra al azar de internet.",
      "Una captura por web: la primera pantalla de 1440×900, tomada con Chrome sin interfaz. Lo que queda por debajo no se mide.",
      "El parecido sale de MobileCLIP-S0, un modelo de imagen. Los percentiles comparan con todos los pares del catálogo: miden parecido, no copia.",
      "Las etiquetas de maquetación (fondo, espacio, centrado, degradado) son reglas leídas sobre una versión pequeña de cada captura. Aciertan casi siempre, no siempre.",
      "El texto se leyó con Tesseract sobre miniaturas pequeñas. Se le escapa la letra pequeña y lee mal algunas palabras.",
    ],
    ctaTitle: "¿La tuya es una de ellas?",
    ctaDek: "Sube una captura de tu web. Twinsites te dice a cuáles se parece, por qué y te da un prompt para cambiarla. La imagen no sale de tu navegador.",
    ctaButton: "Comprueba tu web",
    shareText: (four: string, n: string) => `Cuatro maquetaciones cubren el ${four} de ${n} webs hechas con IA. ¿La tuya es una de ellas?`,
    share: "Publicar",
    copyLink: "Copiar enlace",
    copied: "Enlace copiado",
    loading: "Cargando el informe…",
    failed: "No se pudo cargar el informe. Prueba de nuevo en un momento.",
  },
} as const;

export function ReportView() {
  const { lang, t } = useI18n();
  const c = COPY[lang];
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = `${c.pageTitle} — Twinsites`;
    return () => {
      document.title = previous;
    };
  }, [c]);

  useEffect(() => {
    let cancel = false;
    void fetch(`${import.meta.env.BASE_URL}data/report.json`)
      .then((response) => (response.ok ? (response.json() as Promise<Report>) : Promise.reject(new Error(String(response.status)))))
      .then((next) => {
        if (!cancel) setReport(next);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (failed) return <p className="error">{c.failed}</p>;
  if (!report) return <p className="score-note">{c.loading}</p>;

  const locale = lang === "es" ? "es-ES" : "en-GB";
  const pct = (value: number) => `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}${lang === "es" ? " %" : "%"}`;
  const num = (value: number) => new Intl.NumberFormat(locale).format(value);
  const total = num(report.total);
  const date = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(report.generated));
  const threeColors = report.colors.slice(0, 3).reduce((sum, color) => sum + color.share, 0);
  const pageUrl = "https://twinsites.com/report";
  const shareText = c.shareText(pct(report.topFourShare), total);
  const maxRecipe = report.recipes[0]?.share ?? 1;
  const maxColor = report.colors[0]?.share ?? 1;
  const maxCategory = report.categories[0]?.crowded ?? 1;
  const maxPhrase = report.phrases.top[0]?.count ?? 1;

  const post = () => {
    track("report-share");
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${shareText} ${pageUrl}`)}`, "_blank", "noopener,noreferrer");
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      track("report-share");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className="report-page">
      <header className="report-head">
        <p className="kicker">{c.kicker(date)}</p>
        <h1>
          {c
            .title(total)
            .split(/(AI-built)/)
            .map((part, index) => (part === "AI-built" ? <span key={index} className="nowrap">{part}</span> : part))}
        </h1>
        <p className="lede">{c.lede(total, pct(report.topFourShare))}</p>
        <div className="share-actions">
          <button type="button" className="ticket" onClick={post}>
            {c.share}
          </button>
          <button type="button" className="ticket ghost" onClick={() => void copyLink()}>
            {copied ? c.copied : c.copyLink}
          </button>
        </div>
      </header>

      <ul className="report-stats">
        <li className="is-key">
          <strong>{pct(report.topFourShare)}</strong>
          <span>{c.statFour}</span>
        </li>
        <li>
          <strong>{pct(report.twins.top1Any)}</strong>
          <span>{c.statTop1}</span>
        </li>
        <li>
          <strong>{pct(report.traits.centered)}</strong>
          <span>{c.statCentred}</span>
        </li>
        <li>
          <strong>{pct(Math.round(threeColors * 10) / 10)}</strong>
          <span>{c.statColors}</span>
        </li>
      </ul>

      <section className="report-section">
        <div className="section-head">
          <h2>{c.recipesTitle}</h2>
          <p>{c.recipesDek}</p>
        </div>
        <ol className="bars">
          {report.recipes.map((recipe, index) => (
            <li key={index} className={index < 4 ? "is-lit" : undefined}>
              <span className="bar-label">{c.recipe(recipe)}</span>
              <span className="bar-track" aria-hidden="true">
                <i style={{ width: `${(recipe.share / maxRecipe) * 100}%` }} />
              </span>
              <span className="bar-value">
                {pct(recipe.share)} <small>{c.pages(num(recipe.count))}</small>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="report-section">
        <div className="section-head">
          <h2>{c.twinsTitle}</h2>
          <p>{c.twinsDek}</p>
        </div>
        <ul className="report-stats is-small">
          <li className="is-key">
            <strong>{pct(report.twins.top1Any)}</strong>
            <span>{c.twinTop1}</span>
          </li>
          <li>
            <strong>{pct(report.twins.top5Any)}</strong>
            <span>{c.twinTop5}</span>
          </li>
          <li>
            <strong>{pct(report.twins.top5Crowd)}</strong>
            <span>{c.twinCrowd}</span>
          </li>
        </ul>
      </section>

      <section className="report-section">
        <div className="section-head">
          <h2>{c.colorsTitle}</h2>
          <p>{c.colorsDek}</p>
        </div>
        <ol className="bars">
          {report.colors.map((color, index) => (
            <li key={color.name} className={index < 3 ? "is-lit" : undefined}>
              <span className="bar-label">
                <i className="swatch" style={{ background: SWATCH[color.name] ?? "#9a9a9a" }} aria-hidden="true" />
                {capitalize(t.colorName(color.name as Parameters<typeof t.colorName>[0]))}
              </span>
              <span className="bar-track" aria-hidden="true">
                <i style={{ width: `${(color.share / maxColor) * 100}%` }} />
              </span>
              <span className="bar-value">{pct(color.share)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="report-section">
        <div className="section-head">
          <h2>{c.categoriesTitle}</h2>
          <p>{c.categoriesDek}</p>
        </div>
        <ol className="bars">
          {report.categories.map((category, index) => (
            <li key={category.key} className={index < 3 ? "is-lit" : undefined}>
              <span className="bar-label">{t.categories[category.key] ?? category.key}</span>
              <span className="bar-track" aria-hidden="true">
                <i style={{ width: `${(category.crowded / maxCategory) * 100}%` }} />
              </span>
              <span className="bar-value">{pct(category.crowded)}</span>
            </li>
          ))}
        </ol>
      </section>

      {report.phrases.top.length > 0 && (
        <section className="report-section">
          <div className="section-head">
            <h2>{c.phrasesTitle}</h2>
            <p>{c.phrasesDek(num(report.phrases.read))}</p>
          </div>
          <ol className="bars">
            {report.phrases.top.map((phrase) => (
              <li key={phrase.id}>
                <span className="bar-label">“{phrase.label}”</span>
                <span className="bar-track" aria-hidden="true">
                  <i style={{ width: `${(phrase.count / maxPhrase) * 100}%` }} />
                </span>
                <span className="bar-value">{c.phrasesCount(phrase.count)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="report-section">
        <div className="section-head">
          <h2>{c.zonesTitle(report.zones.count)}</h2>
          <p>{c.zonesDek(pct(report.zones.topFourShare))}</p>
        </div>
        <ul className="report-zones">
          {report.zones.largest.map((zone) => (
            <li key={zone.slug}>
              <RouteLink className="text-link" href={`/zone/${zone.slug}`}>
                {lang === "es" ? zone.labelEs : zone.labelEn}
              </RouteLink>
              <span>{c.pages(num(zone.size))}</span>
            </li>
          ))}
        </ul>
        <p>
          <RouteLink className="text-link" href="/zones">
            {c.zonesAll}
          </RouteLink>
        </p>
      </section>

      <section className="report-cta">
        <h2>{c.ctaTitle}</h2>
        <p>{c.ctaDek}</p>
        <RouteLink className="ticket" href="/">
          {c.ctaButton}
        </RouteLink>
      </section>

      <section className="report-section report-method">
        <h2>{c.methodTitle}</h2>
        <ul>
          {c.method.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
