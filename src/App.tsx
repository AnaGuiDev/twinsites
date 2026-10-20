import { useCallback, useEffect, useRef, useState } from "react";
import { DropZone } from "./components/DropZone";
import { Faq } from "./components/Faq";
import { Mosaic } from "./components/Mosaic";
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
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<ResultData | null>(null);
  const [catalog, setCatalog] = useState<ResultData | null>(null);
  const [catalogNote, setCatalogNote] = useState<string | null>(null);
  const parts = useRef({ read: 0, engine: 0, data: 0, match: 0 });

  const publish = useCallback(() => {
    const current = parts.current;
    const value = current.read * 0.04 + current.engine * 0.78 + current.data * 0.16 + current.match * 0.02;
    setProgress(Math.max(0, Math.min(1, value)));
  }, []);

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

  const warm = useCallback(() => {
    void import("./lib/model").then((mod) => mod.preloadEngine());
    void import("./lib/dataset").then((mod) => mod.preloadData());
  }, []);

  useEffect(() => {
    if (deferHeavyLoad()) return;
    const idle = window.requestIdleCallback?.(warm, { timeout: 1200 });
    const timer = idle === undefined ? window.setTimeout(warm, 500) : undefined;
    return () => {
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [warm]);

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

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      go("/");
      setUpload((current) => {
        if (current?.preview.startsWith("blob:")) URL.revokeObjectURL(current.preview);
        return null;
      });
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
        preview = URL.createObjectURL(frame.blob);
        const frameWidth = frame.bitmap.width;
        const traits = await analyzeImageSource(frame.bitmap, frame.bitmap.width, frame.bitmap.height);
        frame.bitmap.close();
        parts.current.read = 1;
        publish();
        advance("model");
        const [modelMod, dataMod] = await Promise.all([import("./lib/model"), import("./lib/dataset")]);
        unsubEngine = modelMod.subscribeEngine((fraction) => {
          parts.current.engine = fraction;
          publish();
        });
        unsubData = dataMod.subscribeData((fraction) => {
          parts.current.data = fraction;
          if (fraction > 0) advance("data");
          publish();
        });
        const [vector, dataset] = await Promise.all([modelMod.embedBlob(frame.blob), dataMod.loadDataset()]);
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
        saveCheck({
          at: Date.now(),
          verdict,
          bands,
          nearest: nearestPercentile,
          zoneEn: cluster?.labelEn ?? "",
          zoneEs: cluster?.labelEs ?? "",
          preview: small,
        });
        setUpload({
          source: "upload",
          vector,
          bands,
          previous,
          preview,
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
        });
        setCatalogCount(dataset.catalog.count);
        setStage(null);
        setProgress(null);
      } catch (err) {
        if (preview) URL.revokeObjectURL(preview);
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
            <Mosaic
              slot={
                <>
                  <h1>{t.title}</h1>
                  <p className="lede">{t.lede(catalogCount ?? 2003)}</p>
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
                    <p className="example-row">
                      <button type="button" className="text-link as-button" onClick={onExample}>
                        {t.tryExample}
                      </button>
                    </p>
                  </div>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  <p className="privacy">
                    {t.privacyShort} <RouteLink className="text-link" href="/privacy">{t.privacyMore}</RouteLink>
                  </p>
                </>
              }
            />
            <section className="example" aria-labelledby="example-title">
              <div className="example-text">
                <h2 id="example-title">{t.exampleTitle}</h2>
                <p className="dek">{t.exampleDek}</p>
                <ol className="steps">
                  {t.exampleSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="score-note">
                  {t.exampleNote}{" "}
                  <a className="text-link" href="/example/acme-before.html" target="_blank" rel="noreferrer">
                    {t.exampleBefore}
                  </a>
                  {", "}
                  <a className="text-link" href="/example/acme-after.html" target="_blank" rel="noreferrer">
                    {t.exampleAfter}
                  </a>
                  .
                </p>
              </div>
              <img
                className="example-card"
                src={`/example/progress-${lang}.webp`}
                alt={t.exampleAlt}
                width={1200}
                height={630}
                loading="lazy"
              />
            </section>
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
