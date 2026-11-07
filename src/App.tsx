import { CaptureReview } from "./components/CaptureReview";
import { MethodPage } from "./components/MethodPage";
import { AuditReport } from "./components/AuditReport";
import { useCallback, useEffect, useRef, useState } from "react";
import { GuidePage, OrderPage, ServiceLadder, ServicesPage, TropeCatalog } from "./components/Services";
import { DropZone } from "./components/DropZone";
import { Faq } from "./components/Faq";
import { LaunchSpecimen } from "./components/LaunchSpecimen";
import { LegalPage } from "./components/LegalPages";
import { StudioConsole } from "./components/StudioConsole";
import { ZoneIndex } from "./components/ZoneIndex";
import { PrivacyView } from "./components/PrivacyView";
import { ResultView } from "./components/ResultView";
import { SearchBox } from "./components/SearchBox";
import { UrlShot } from "./components/UrlShot";
import { ZonesView } from "./components/ZonesView";
import { ReportView } from "./components/ReportView";
import { REMOVAL_URL, useI18n } from "./i18n";
import { RouteLink, useRoute } from "./router";
import { track } from "./lib/analytics";
import { analyzeImageSource } from "./lib/analyze";
import { judgeKin, percentileOf } from "./lib/calibrate";
import { cropHero } from "./lib/crop";
import { loadExample, siteResult, type ResultData } from "./lib/explore";
import { countBands, nearest, placeUser } from "./lib/match";
import { zoneSlug } from "./lib/zones";
import { loadCheck, saveCheck, smallPreview } from "./lib/history";

type NetInfo = { saveData?: boolean; effectiveType?: string };
type Stage = "read" | "model" | "data" | "match";

function deferHeavyLoad(): boolean {
  const connection = (navigator as Navigator & { connection?: NetInfo }).connection;
  if (connection?.saveData) return true;
  const type = connection?.effectiveType;
  if (type === "slow-2g" || type === "2g" || type === "3g") return true;
  return window.matchMedia("(max-width: 720px)").matches;
}

export function App() {
  const { lang, setLang, t } = useI18n();
  const { route, go } = useRoute();
  const [catalogCount, setCatalogCount] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<ResultData | null>(null);
  const [catalog, setCatalog] = useState<ResultData | null>(null);
  const [catalogNote, setCatalogNote] = useState<string | null>(null);
  const uploadRun = useRef(0);
  const parts = useRef({ read: 0, engine: 0, data: 0, match: 0 });

  const publish = useCallback(() => {
    const current = parts.current;
    const value = current.read * 0.04 + current.engine * 0.78 + current.data * 0.16 + current.match * 0.02;
    setProgress(Math.max(0, Math.min(1, value)));
  }, []);

  useEffect(() => {
    if (route.name === "home") document.title = "Twinsites — Slop Score & visual twins";
    if (route.name === "site") document.title = `${catalog?.subjectTitle || "Visual twins"} — Twinsites`;
  }, [route.name, catalog?.subjectTitle]);

  useEffect(() => {
    track("visit");
  }, []);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    fetch(`${base}data/stats.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (json && typeof json.count === "number") setCatalogCount(json.count);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!stage) return;
    document.querySelector(".sleeve")?.scrollIntoView({ block: "center" });
  }, [stage]);

  const warm = useCallback(() => {}, []);

  useEffect(() => {
    if (!["home", "site"].includes(route.name) || deferHeavyLoad()) return;
    const idle = window.requestIdleCallback?.(warm, { timeout: 1200 });
    const timer = idle === undefined ? window.setTimeout(warm, 500) : undefined;
    return () => {
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [warm, route.name]);

  useEffect(() => {
    window.addEventListener("dragenter", warm);
    return () => window.removeEventListener("dragenter", warm);
  }, [warm]);

  const siteSlug = route.name === "site" ? route.slug : "";
  useEffect(() => {
    if (!siteSlug) return;
    let cancel = false;
    setCatalog(null);
    setCatalogNote(null);
    void siteResult(siteSlug)
      .then((result) => {
        if (!cancel) setCatalog(result);
      })
      .catch((err: unknown) => {
        if (cancel) return;
        const message = err instanceof Error ? err.message : "";
        setCatalogNote(message === "missing-site" ? t.missingSite : t.errorCatalog);
      });
    return () => {
      cancel = true;
    };
  }, [siteSlug, t]);

  const onExample = () => {
    track("example");
    void loadExample()
      .then((example) => go(`/site/${example.slug}`))
      .catch(() => setError(t.errorCatalog));
  };

  const analyzeFile = useCallback(
    async (file: File) => {
      const run = ++uploadRun.current;
      const current = () => run === uploadRun.current;
      setError(null);
      go("/");
      setStage(null);
      setProgress(null);
      setRetryFile(file);
      if (!file.type.startsWith("image/")) {
        setError(t.errorImage);
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setError(t.errorLarge);
        return;
      }
      track("upload");
      const order: Stage[] = ["read", "model", "data", "match"];
      const advance = (next: Stage) => {
        if (!current()) return;
        setStage((current) => {
          if (!current) return next;
          return order.indexOf(next) > order.indexOf(current) ? next : current;
        });
      };
      parts.current = { read: 0, engine: 0, data: 0, match: 0 };
      setProgress(0);
      advance("read");
      let unsubEngine: () => void = () => undefined;
      let unsubData: () => void = () => undefined;
      let preview: string | null = null;
      try {
        const frame = await cropHero(file);
        if (!current()) { frame.bitmap.close(); return; }
        preview = URL.createObjectURL(frame.blob);
        const frameWidth = frame.bitmap.width;
        const traits = await analyzeImageSource(frame.bitmap, frame.bitmap.width, frame.bitmap.height);
        frame.bitmap.close();
        if (!current()) { URL.revokeObjectURL(preview); return; }
        parts.current.read = 1;
        publish();
        advance("model");
        const [modelMod, dataMod] = await Promise.all([import("./lib/model"), import("./lib/dataset")]);
        unsubEngine = modelMod.subscribeEngine((fraction) => {
          if (!current()) return;
          parts.current.engine = fraction;
          publish();
        });
        unsubData = dataMod.subscribeData((fraction) => {
          if (!current()) return;
          parts.current.data = fraction;
          if (fraction > 0) advance("data");
          publish();
        });
        const [vector, dataset] = await Promise.all([modelMod.embedBlob(frame.blob), dataMod.loadDataset()]);
        if (!current()) { URL.revokeObjectURL(preview); return; }
        advance("match");
        const twins = nearest(vector, dataset, 12);
        const bandCounts = countBands(vector, dataset);
        const verdict = judgeKin(bandCounts);
        const bands = Object.fromEntries(bandCounts) as Record<number, number>;
        const spot = placeUser(vector, dataset);
        const cluster = dataset.catalog.clusters.find((item) => item.id === spot.cluster);
        parts.current.match = 1;
        parts.current.engine = 1;
        parts.current.data = 1;
        publish();
        const nearestPercentile = twins[0] ? percentileOf(twins[0].similarity, dataset.calibration.knots) : 0;
        const previous = loadCheck();
        const small = await smallPreview(frame.blob).catch(() => "");
        if (!current()) { URL.revokeObjectURL(preview); return; }
        saveCheck({
          at: Date.now(),
          verdict,
          bands,
          nearest: nearestPercentile,
          zoneEn: cluster?.labelEn ?? "",
          zoneEs: cluster?.labelEs ?? "",
          preview: small,
        });
        const completedPreview = preview;
        setUpload((previousUpload) => {
          if (previousUpload?.preview.startsWith("blob:")) URL.revokeObjectURL(previousUpload.preview);
          return {
          source: "upload",
          vector,
          bands,
          previous,
          preview: completedPreview,
          subjectTitle: "",
          traits,
          twins: twins.map((twin) => ({
            site: twin.site,
            percentile: percentileOf(twin.similarity, dataset.calibration.knots),
          })),
          verdict,
          zone: {
            id: cluster?.id ?? spot.cluster,
            slug: zoneSlug(cluster?.labelEn ?? "zone"),
            labelEn: cluster?.labelEn ?? "",
            labelEs: cluster?.labelEs ?? "",
          },
          spot,
          sites: dataset.catalog.sites,
          clusters: dataset.catalog.clusters,
          portrait: frame.portrait,
          cropped: frame.cropped,
          small: frameWidth < 1000,
          catalogCount: dataset.catalog.count,
        }; });
        setRetryFile(null);
        setCatalogCount(dataset.catalog.count);
        setStage(null);
        setProgress(null);
      } catch (err) {
        if (preview) URL.revokeObjectURL(preview);
        if (!current()) return;
        const message = err instanceof Error ? err.message : "";
        if (message.includes("catalog")) setError(t.errorCatalog);
        else if (err instanceof DOMException || /image|decode|bitmap/i.test(message)) setError(t.errorImage);
        else {
          console.error(err);
          setError(t.errorModel);
        }
        setStage(null);
        setProgress(null);
      } finally {
        unsubEngine();
        unsubData();
      }
    },
    [go, publish, t],
  );

  const onFile = useCallback((file: File) => {
    uploadRun.current++; setStage(null); setProgress(null); setError(null);
    setPendingFile(file); go('/');
  }, [go]);

  const stageCopy: Record<Stage, string> = {
    read: t.stageRead,
    model: t.stageModel,
    data: t.stageData,
    match: t.stageMatch,
  };
  const shown = progress == null ? null : Math.round(progress * 100);
  const homeResult = route.name === "home" ? upload : null;

  return (
    <div className="page">
      <header className="top">
        <a
          className="wordmark"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            go("/");
          }}
        >
          <svg className="logo" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="10" />
            <rect x="9" y="12" width="21" height="17" className="lit" />
            <rect x="34" y="12" width="21" height="17" className="lit" />
            <rect x="9" y="35" width="21" height="17" className="plain" />
            <rect x="34" y="35" width="21" height="17" className="plain" />
          </svg>
          Twinsites
        </a>
        <nav>
          <RouteLink className="nav-link" href="/services">{lang === "es" ? "Auditoría y rediseño" : "Audit & redesign"}</RouteLink>
          <RouteLink className="nav-link" href="/report">
            {t.navReport}
          </RouteLink>
          <RouteLink className="nav-link" href="/zones">
            {t.navZones}
          </RouteLink>
          <RouteLink className="nav-link" href="/faq">
            {t.navFaq}
          </RouteLink>
          <button type="button" className="lang" onClick={() => setLang(lang === "en" ? "es" : "en")} aria-label={t.langName}>
            {lang === "en" ? "ES" : "EN"}
          </button>
        </nav>
      </header>

      <main>
        {pendingFile && <CaptureReview key={`${pendingFile.name}-${pendingFile.lastModified}-${pendingFile.size}`} file={pendingFile} onCancel={()=>setPendingFile(null)} onAccept={()=>{const file=pendingFile;setPendingFile(null);void analyzeFile(file);}} />}
        {error && retryFile && !pendingFile && <button className="ticket" onClick={()=>onFile(retryFile)}>{lang === 'es' ? 'Reintentar con mi captura' : 'Retry my screenshot'}</button>}

        {stage && <div className="analysis-controls" role="status"><span>{stageCopy[stage]} · {shown}%</span><button type="button" className="text-link" onClick={()=>{uploadRun.current++;setStage(null);setProgress(null);}}>{lang === "es" ? "Descartar esta comparación" : "Discard this comparison"}</button></div>}
        {(route.name === "legal" || route.name === "terms" || route.name === "withdrawal") && <LegalPage page={route.name} />}
        {route.name === "method" && <MethodPage />}
        {route.name === "studio" && <StudioConsole />}
        {route.name === "services" && <ServicesPage />}
        {route.name === "guide" && <GuidePage />}
        {route.name === "sample-audit" && <AuditReport />}
        {route.name === "order" && <OrderPage />}
        {route.name === "privacy" && <PrivacyView />}
        {route.name === "faq" && <Faq page />}
        {route.name === "report" && <ReportView />}
        {route.name === "zones" && <ZonesView />}
        {route.name === "zone" && <ZonesView slug={route.slug} />}
        {route.name === "site" && catalog && (
          <ResultView result={catalog} onFile={onFile} onIntent={warm} progress={shown} stageLabel={stage ? stageCopy[stage] : null} />
        )}
        {route.name === "site" && !catalog && <p className="score-note">{catalogNote ?? t.loadingCatalog}</p>}
        {route.name === "home" && !homeResult && (
          <section className="hero">
            <div className="launch-hero"><div className="launch-hero-copy">
                  <p className="kicker">TWINSITES / VISUAL IDENTITY LAB</p>
                  <h1>{lang === "es" ? <>Que se reconozca<br />tu web.<br /><em>No la plantilla.</em></> : <>Recognizably<br />your website.<br /><em>Not the template.</em></>}</h1>
                  <p className="lede">{lang === "es" ? `Encuentra tus gemelas entre ${(catalogCount ?? 2003).toLocaleString("es-ES")} portadas. Revisa las señales, llévate los prompts y decide qué cambiar. Si quieres ir más lejos, una persona lo revisa contigo.` : `Find your twins among ${(catalogCount ?? 2003).toLocaleString("en-GB")} homepages. Review the signals, take the prompts and decide what to change. For the next step, get a human review.`}</p>
                  <div className="actions">
                    <DropZone
                      inline
                      onFile={onFile}
                      onIntent={warm}
                      progress={shown}
                      progressLabel={t.progressLabel}
                      stageLabel={stage ? stageCopy[stage] : null}
                    />
                    <UrlShot onFile={onFile} />
                    <button type="button" className="example-teaser" onClick={onExample}>
                      <span className="teaser-pair" aria-hidden="true">
                        <img src="/example/acme-before-thumb.webp" alt="" width={120} height={75} />
                        <span className="teaser-num">↔</span>
                        <img src="/example/acme-after-thumb.webp" alt="" width={120} height={75} />
                      </span>
                      <span className="teaser-text">
                        {lang === "es" ? "Explora una comparación del catálogo." : "Explore a catalog comparison."} <span className="text-link">{lang === "es" ? "Abrir ejemplo" : "Open example"}</span>
                      </span>
                    </button>
                  </div>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  <p className="privacy">
                    {t.privacyShort} <RouteLink className="text-link" href="/privacy">{t.privacyMore}</RouteLink>
                  </p>

            </div><LaunchSpecimen onOpen={onExample} /></div>
            <section className="example" aria-labelledby="example-title">
              <div className="example-text"><p className="kicker">{lang === "es" ? "DEL CRITERIO AL CAMBIO" : "FROM REVIEW TO CHANGE"}</p><h2 id="example-title">{lang === "es" ? "Un cambio que puedes ver." : "A change you can see."}</h2><p className="dek">{lang === "es" ? "Dos versiones de una página ficticia: una composición repetida y otra dirección para el mismo producto. Un ejemplo visual, no un cliente ni una promesa de mejora de puntuación o ventas." : "Two versions of a fictional page: a familiar composition and another direction for the same product. A visual example, not a customer or a promised score or sales improvement."}</p><p><a className="text-link" href="/example/acme-before.html" target="_blank" rel="noreferrer">{lang === "es" ? "Abrir antes" : "Open before"}</a>{" · "}<a className="text-link" href="/example/acme-after.html" target="_blank" rel="noreferrer">{lang === "es" ? "Abrir después" : "Open after"}</a></p></div>
              <div className="worked-pair"><figure><img src="/example/acme-before-thumb.webp" alt={lang === "es" ? "Página ficticia antes del cambio" : "Fictional page before changes"} width={420} height={263} loading="lazy" /><figcaption>{lang === "es" ? "ANTES / ejemplo ficticio" : "BEFORE / fictional example"}</figcaption></figure><figure><img src="/example/acme-after-thumb.webp" alt={lang === "es" ? "Otra dirección visual para la misma página ficticia" : "Another visual direction for the same fictional page"} width={420} height={263} loading="lazy" /><figcaption>{lang === "es" ? "DESPUÉS / otra dirección" : "AFTER / another direction"}</figcaption></figure></div>
            </section>
            <TropeCatalog />
            <ServiceLadder />
            <div className="hero-more">
              <div>
                <h2>{t.findTitle}</h2>
                <SearchBox
                  onPick={(slug) => {
                    track("explore");
                    go(`/site/${slug}`);
                  }}
                />
              </div>
              <ZoneIndex />
            </div>
            <Faq />
          </section>
        )}
        {error && !(route.name === "home" && !homeResult) && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {homeResult && (
          <ResultView result={homeResult} onFile={onFile} onIntent={warm} progress={shown} stageLabel={stage ? stageCopy[stage] : null} />
        )}
      </main>

      <footer>
        <p className="footer-mark">Twinsites</p>
        <ul>
          <li>
            {t.footerBy} <a href="https://github.com/AnaGuiDev">Ana Gui</a>
          </li>
          <li>
            <a href="https://github.com/JefferyLee/awesome-vibe-coded-apps">{t.footerCatalog}</a>
          </li>
          <li><RouteLink href="/method">{lang === "es" ? "Método y evidencia" : "Method & evidence"}</RouteLink></li>
          <li><RouteLink href="/legal">{lang === "es" ? "Aviso legal" : "Legal notice"}</RouteLink></li>
          <li><RouteLink href="/terms">{lang === "es" ? "Condiciones" : "Terms"}</RouteLink></li>
          <li><RouteLink href="/withdrawal">{lang === "es" ? "Cancelaciones" : "Cancellations"}</RouteLink></li>
          <li>
            <RouteLink href="/privacy">{t.listPrivacy}</RouteLink>
          </li>
          <li>
            <a href={REMOVAL_URL} target="_blank" rel="noreferrer">
              {t.removal}
            </a>
          </li>
          <li>
            <a href="https://github.com/AnaGuiDev/twinsites">{t.footerSource}</a>
          </li>
        </ul>
      </footer>
    </div>
  );
}
