import { useCallback, useEffect, useRef, useState } from "react";
import { DropZone } from "./components/DropZone";
import { Mosaic } from "./components/Mosaic";
import { PrivacyView } from "./components/PrivacyView";
import { ResultView } from "./components/ResultView";
import { SearchBox } from "./components/SearchBox";
import { UrlShot } from "./components/UrlShot";
import { ZonesView } from "./components/ZonesView";
import { REMOVAL_URL, useI18n } from "./i18n";
import { RouteLink, useRoute } from "./router";
import { track } from "./lib/analytics";
import { analyzeImageSource } from "./lib/analyze";
import { judgeKin, percentileOf } from "./lib/calibrate";
import { cropHero } from "./lib/crop";
import { loadExample, siteResult, type ResultData } from "./lib/explore";
import { countBands, nearest, placeUser } from "./lib/match";
import { zoneSlug } from "./lib/zones";

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
        const verdict = judgeKin(countBands(vector, dataset));
        const spot = placeUser(vector, dataset);
        const cluster = dataset.catalog.clusters.find((item) => item.id === spot.cluster);
        parts.current.match = 1;
        parts.current.engine = 1;
        parts.current.data = 1;
        publish();
        setUpload({
          source: "upload",
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
          Twinsites
        </a>
        <nav>
          <RouteLink className="nav-link" href="/zones">
            {t.navZones}
          </RouteLink>
          <button type="button" className="lang" onClick={() => setLang(lang === "en" ? "es" : "en")} aria-label={t.langName}>
            {lang === "en" ? "ES" : "EN"}
          </button>
        </nav>
      </header>

      <main>
        {route.name === "privacy" && <PrivacyView />}
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
                <div className="slot-inner">
                  <h1>{t.title}</h1>
                  <p className="lede">{t.lede(catalogCount ?? 2003)}</p>
                  <DropZone
                    onFile={onFile}
                    onIntent={warm}
                    progress={shown}
                    progressLabel={t.progressLabel}
                    stageLabel={stage ? stageCopy[stage] : null}
                  />
                </div>
              }
            />
            <p className="mosaic-caption">{t.mosaicCaption}</p>
            <div className="hero-more">
              <div className="hero-alt">
                <h2>{t.noShotTitle}</h2>
                <UrlShot onFile={onFile} />
                <div className="hero-actions">
                  <button type="button" className="ticket ghost" onClick={onExample}>
                    {t.tryExample}
                  </button>
                  <RouteLink className="text-link" href="/zones">
                    {t.browseZones}
                  </RouteLink>
                </div>
              </div>
              <div className="hero-alt">
                <h2>{t.findTitle}</h2>
                <SearchBox
                  onPick={(slug) => {
                    track("explore");
                    go(`/site/${slug}`);
                  }}
                />
              </div>
            </div>
            <p className="privacy">
              {t.privacy} <RouteLink className="text-link" href="/privacy">{t.privacyMore}</RouteLink>
            </p>
          </section>
        )}
        {error && (
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
