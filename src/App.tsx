import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DropZone } from "./components/DropZone";
import { MapView } from "./components/MapView";
import { REMOVAL_URL, useI18n } from "./i18n";
import { analyzeImageSource } from "./lib/analyze";
import { formatPercentile, judgeKin, percentileOf, type KinVerdict } from "./lib/calibrate";
import { canvasToBlob, renderShareCard } from "./lib/card";
import { cropHero } from "./lib/crop";
import { countBands, hostOf, nearest, placeUser } from "./lib/match";
import { suggest, type Suggestion } from "./lib/suggest";
import type { Dataset, Traits, Twin } from "./types";

interface Ready {
  traits: Traits;
  twins: Twin[];
  verdict: KinVerdict;
  calibration: Dataset["calibration"];
  spot: { x: number; y: number; cluster: number };
  suggestions: Suggestion[];
  catalogCount: number;
  clusters: Dataset["catalog"]["clusters"];
  sites: Dataset["catalog"]["sites"];
  preview: string;
  portrait: boolean;
  cropped: boolean;
}

type NetInfo = { saveData?: boolean; effectiveType?: string };

function deferHeavyLoad(): boolean {
  const connection = (navigator as Navigator & { connection?: NetInfo }).connection;
  if (connection?.saveData) return true;
  const type = connection?.effectiveType;
  if (type === "slow-2g" || type === "2g" || type === "3g") return true;
  return window.matchMedia("(max-width: 720px)").matches;
}

type Stage = "read" | "model" | "data" | "match";

export function App() {
  const { lang, setLang, t } = useI18n();
  const [catalogCount, setCatalogCount] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const cardBlob = useRef<Blob | null>(null);
  const parts = useRef({ read: 0, engine: 0, data: 0, match: 0 });

  const publish = useCallback(() => {
    const current = parts.current;
    const value = current.read * 0.04 + current.engine * 0.78 + current.data * 0.16 + current.match * 0.02;
    setProgress(Math.max(0, Math.min(1, value)));
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

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setReady((current) => {
        if (current) URL.revokeObjectURL(current.preview);
        return null;
      });
      setCardUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
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
        const datasetPromise = dataMod.loadDataset();
        const vectorPromise = modelMod.embedBlob(frame.blob);
        const [vector, dataset] = await Promise.all([vectorPromise, datasetPromise]);
        advance("match");
        const twins = nearest(vector, dataset, 12);
        const verdict = judgeKin(countBands(vector, dataset));
        const spot = placeUser(vector, dataset);
        const suggestions = suggest(
          traits,
          twins.map((twin) => twin.site.traits),
        );
        parts.current.match = 1;
        parts.current.engine = 1;
        parts.current.data = 1;
        publish();
        setReady({
          traits,
          twins,
          verdict,
          calibration: dataset.calibration,
          spot,
          suggestions,
          catalogCount: dataset.catalog.count,
          clusters: dataset.catalog.clusters,
          sites: dataset.catalog.sites,
          preview,
          portrait: frame.portrait,
          cropped: frame.cropped,
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
    [publish, t],
  );

  const shares = useMemo(() => {
    if (!ready) return null;
    const twins = ready.twins.map((twin) => twin.site.traits);
    const count = (pred: (trait: Traits) => boolean) => twins.filter(pred).length;
    return {
      color: count((trait) => trait.dominantName === ready.traits.dominantName),
      mode: count((trait) => trait.mode === ready.traits.mode),
      density: count((trait) => trait.density === ready.traits.density),
      gradient: count((trait) => trait.gradient === ready.traits.gradient),
      bento: count((trait) => trait.bento === ready.traits.bento),
      centered: count((trait) => trait.centered === ready.traits.centered),
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const nearestPercentile = percentileOf(ready.twins[0]?.similarity ?? 0, ready.calibration.knots);
    const zoneName = zoneLabel(ready, lang);
    renderShareCard({
      lang,
      verdict: ready.verdict,
      nearestPercentile,
      catalogCount: ready.catalogCount,
      zone: zoneName,
      thumbs: ready.twins.slice(0, 4).map((twin) => `${import.meta.env.BASE_URL}data/${twin.site.thumb}`),
    })
      .then(async (canvas) => {
        const blob = await canvasToBlob(canvas);
        if (cancelled) return;
        cardBlob.current = blob;
        const url = URL.createObjectURL(blob);
        setCardUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lang, ready]);

  const stageCopy: Record<Stage, string> = {
    read: t.stageRead,
    model: t.stageModel,
    data: t.stageData,
    match: t.stageMatch,
  };
  const zone = ready?.clusters.find((cluster) => cluster.id === ready.spot.cluster);
  const zoneName = zone ? (lang === "es" ? zone.labelEs : zone.labelEn) : "";
  const nearestPercentile = ready ? percentileOf(ready.twins[0]?.similarity ?? 0, ready.calibration.knots) : 0;
  const shareText = ready ? `${t.cardLine(ready.verdict, zoneName, ready.catalogCount)} https://twinsites.com` : "";
  const shown = progress == null ? null : Math.round(progress * 100);

  const onShare = async () => {
    if (!shareText) return;
    const blob = cardBlob.current;
    const file = blob ? new File([blob], "twinsites.png", { type: "image/png" }) : null;
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ text: shareText, files: [file] });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    const href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="page">
      <p className="rail">Twinsites · {t.registry}</p>
      <header className="top">
        <a className="wordmark" href="#top">
          Twinsites
        </a>
        <span className="registry">{t.registry}</span>
        <nav>
          <button
            type="button"
            className="lang"
            onClick={() => setLang(lang === "en" ? "es" : "en")}
            aria-label={t.langName}
          >
            {lang === "en" ? "ES" : "EN"}
          </button>
        </nav>
      </header>

      <main id="top">
        {!ready && (
          <section className="hero">
            <div>
              <p className="kicker">{t.kicker}</p>
              <h1>{t.title}</h1>
              <p className="lede">{t.lede}</p>
              <p className="privacy">{t.privacy}</p>
              <ul className="facts">
                <li>{t.factModel}</li>
                <li>{catalogCount ? t.factCatalog(catalogCount) : "…"}</li>
                <li>{t.factNoUpload}</li>
              </ul>
            </div>
            <DropZone
              onFile={onFile}
              onIntent={warm}
              progress={shown}
              progressLabel={t.progressLabel}
              stageLabel={stage ? stageCopy[stage] : null}
            />
          </section>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {ready && shares && (
          <div className="results">
            <section className="again">
              <img className="preview developing" src={ready.preview} alt={t.you} />
              <div>
                <p className="kicker">{t.you}</p>
                <p className="again-line">
                  {t.resultLine(ready.verdict, zoneName, nearestPercentile)}
                </p>
                <p className="score-note">{t.scoreNote}</p>
                {ready.cropped && <p className="score-note">{t.cropNote}</p>}
                {ready.portrait && <p className="score-note">{t.portraitNote}</p>}
              </div>
              <DropZone
                onFile={onFile}
                onIntent={warm}
                compact
                progress={shown}
                progressLabel={t.progressLabel}
                stageLabel={stage ? stageCopy[stage] : null}
              />
            </section>

            <section>
              <div className="section-head">
                <h2>{t.twinsTitle}</h2>
                <p>{t.twinsDek}</p>
              </div>
              <div className="twin-grid">
                {ready.twins.map((twin, index) => (
                  <article className="twin-card" key={twin.site.id} style={{ animationDelay: `${index * 70}ms` }}>
                    <img src={`${import.meta.env.BASE_URL}data/${twin.site.thumb}`} alt={twin.site.title} />
                    <div className="twin-meta">
                      <div className="sim-row">
                        <span className="sim">
                          {formatPercentile(percentileOf(twin.similarity, ready.calibration.knots), lang)}
                        </span>
                        <span>{t.simLabel}</span>
                      </div>
                      <div className="meter" aria-hidden="true">
                        <span
                          style={{ width: `${Math.max(0, Math.min(100, percentileOf(twin.similarity, ready.calibration.knots)))}%` }}
                        />
                      </div>
                      <h3>{twin.site.title}</h3>
                      <p className="host">{hostOf(twin.site.url)}</p>
                      <a href={twin.site.url} target="_blank" rel="noreferrer">
                        {t.openSite}
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section>
              <div className="section-head">
                <h2>{t.mapTitle}</h2>
                <p>{t.mapDek}</p>
              </div>
              <MapView sites={ready.sites} clusters={ready.clusters} user={ready.spot} lang={lang} />
              <p className="map-caption">
                {t.mapHint}
                {zone ? ` ${t.zone}: ${zoneName}.` : ""}
              </p>
            </section>

            <section className="report">
              <div>
                <div className="section-head">
                  <h2>{t.traitsTitle}</h2>
                </div>
                <p className="dek">{t.traitsDek}</p>
                <ul className="marks">
                  <Mark
                    label={t.dominant}
                    value={t.colorName(ready.traits.dominantName)}
                    swatch={ready.traits.dominant}
                    note={t.shared(shares.color)}
                  />
                  <Mark
                    label={t.mode}
                    value={ready.traits.mode === "dark" ? t.modeDark : t.modeLight}
                    note={t.shared(shares.mode)}
                  />
                  <Mark
                    label={t.density}
                    value={ready.traits.density === "airy" ? t.airy : ready.traits.density === "packed" ? t.packed : t.balanced}
                    note={t.shared(shares.density)}
                  />
                  <Mark
                    label={t.gradient}
                    value={ready.traits.gradient ? t.gradientYes : t.gradientNo}
                    note={t.shared(shares.gradient)}
                  />
                  <Mark
                    label={t.bento}
                    value={ready.traits.bento ? t.bentoYes : t.bentoNo}
                    note={t.shared(shares.bento)}
                  />
                  <Mark
                    label={t.centered}
                    value={ready.traits.centered ? t.centeredYes : t.centeredNo}
                    note={t.shared(shares.centered)}
                  />
                </ul>
              </div>
              <div>
                <div className="section-head">
                  <h2>{t.suggestTitle}</h2>
                </div>
                <p className="dek">{t.suggestDek}</p>
                <ol className="suggestions">
                  {ready.suggestions.map((item, index) => (
                    <li key={item.id}>
                      <span>0{index + 1}</span>
                      <p>{t.suggestion(item)}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            <section className="share">
              <div className="section-head">
                <h2>{t.shareTitle}</h2>
                <p>{t.shareDek}</p>
              </div>
              {cardUrl && (
                <img
                  className="card-preview"
                  src={cardUrl}
                  alt={shareText}
                />
              )}
              <div className="share-actions">
                {cardUrl && (
                  <a className="ticket" href={cardUrl} download="twinsites-card.png">
                    {t.download}
                  </a>
                )}
                <button type="button" className="ticket ghost" onClick={() => void onShare()}>
                  {t.post}
                </button>
              </div>
              <p className="share-note">{t.shareNote}</p>
            </section>
          </div>
        )}
      </main>

      <footer>
        <p>{t.footerPrivacy}</p>
        <p>
          <a className="removal" href={REMOVAL_URL} target="_blank" rel="noreferrer">
            {t.removal}
          </a>
        </p>
        <p>
          <a href="https://github.com/JefferyLee/awesome-vibe-coded-apps">{t.footerCatalog}</a>
        </p>
        <p>
          {t.footerLicense} <a href="https://github.com/AnaGuiDev">Ana Gui</a>
        </p>
      </footer>
    </div>
  );
}

function zoneLabel(ready: Ready, lang: "en" | "es"): string {
  const zone = ready.clusters.find((cluster) => cluster.id === ready.spot.cluster);
  if (!zone) return "";
  return lang === "es" ? zone.labelEs : zone.labelEn;
}

function Mark({
  label,
  value,
  note,
  swatch,
}: {
  label: string;
  value: string;
  note: string;
  swatch?: string;
}) {
  return (
    <li>
      <span className="mark-label">{label}</span>
      <span className="mark-value">
        {swatch && <i className="swatch" style={{ background: swatch }} />}
        {value}
      </span>
      <span className="mark-note">{note}</span>
    </li>
  );
}

