import { useCallback, useEffect, useMemo, useState } from "react";
import { DropZone } from "./components/DropZone";
import { MapView } from "./components/MapView";
import { REMOVAL_URL, useI18n } from "./i18n";
import { analyzeImageSource } from "./lib/analyze";
import { formatRank, rankOf, topShare } from "./lib/calibrate";
import { canvasToBlob, renderShareCard } from "./lib/card";
import { loadDataset } from "./lib/dataset";
import { countTwins, hostOf, nearest, placeUser } from "./lib/match";
import { embedBlob } from "./lib/model";
import { suggest, type Suggestion } from "./lib/suggest";
import type { Calibration, Dataset, Traits, Twin } from "./types";

interface Ready {
  traits: Traits;
  twins: Twin[];
  twinCount: number;
  calibration: Calibration;
  spot: { x: number; y: number; cluster: number };
  suggestions: Suggestion[];
  catalogCount: number;
  clusters: Dataset["catalog"]["clusters"];
  sites: Dataset["catalog"]["sites"];
  preview: string;
}

type Stage = "read" | "model" | "data" | "match";

export function App() {
  const { lang, setLang, t } = useI18n();
  const [catalogCount, setCatalogCount] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    fetch(`${base}data/catalog.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (json && typeof json.count === "number") setCatalogCount(json.count);
      })
      .catch(() => undefined);
  }, []);

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
      const preview = URL.createObjectURL(file);
      const order: Stage[] = ["read", "model", "data", "match"];
      const advance = (next: Stage) => {
        setStage((current) => {
          if (!current) return next;
          return order.indexOf(next) > order.indexOf(current) ? next : current;
        });
      };
      advance("read");
      try {
        const bitmap = await createImageBitmap(file);
        const traits = await analyzeImageSource(bitmap, bitmap.width, bitmap.height);
        bitmap.close();
        advance("model");
        const datasetPromise = loadDataset().then((value) => {
          advance("data");
          return value;
        });
        const vector = await embedBlob(file);
        advance("match");
        const dataset = await datasetPromise;
        const twins = nearest(vector, dataset, 12);
        const twinCount = countTwins(vector, dataset);
        const spot = placeUser(vector, dataset);
        const suggestions = suggest(
          traits,
          twins.map((twin) => twin.site.traits),
        );
        setReady({
          traits,
          twins,
          twinCount,
          calibration: dataset.calibration,
          spot,
          suggestions,
          catalogCount: dataset.catalog.count,
          clusters: dataset.catalog.clusters,
          sites: dataset.catalog.sites,
          preview,
        });
        setCatalogCount(dataset.catalog.count);
        setStage(null);
      } catch (err) {
        URL.revokeObjectURL(preview);
        const message = err instanceof Error ? err.message : "";
        if (message.includes("catalog")) setError(t.errorCatalog);
        else setError(t.errorModel);
        setStage(null);
      }
    },
    [t],
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
    const nearestRank = rankOf(ready.twins[0]?.similarity ?? 0, ready.calibration);
    renderShareCard({
      lang,
      count: ready.twinCount,
      nearestRank,
      top: topShare(ready.calibration),
      thumbs: ready.twins.slice(0, 4).map((twin) => `${import.meta.env.BASE_URL}data/${twin.site.thumb}`),
    })
      .then(async (canvas) => {
        const blob = await canvasToBlob(canvas);
        if (cancelled) return;
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

  const zone = ready?.clusters.find((cluster) => cluster.id === ready.spot.cluster);
  const postHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `${t.cardLine(ready?.twinCount ?? 0, ready ? topShare(ready.calibration) : 20)} https://twinsites.com`,
  )}`;

  return (
    <div className="page">
      <p className="rail">Twinsites · {t.registry}</p>
      <header className="top">
        <a className="wordmark" href="#top">
          Twinsites
        </a>
        <span className="registry">{t.registry}</span>
        <nav>
          <a className="removal" href={REMOVAL_URL} target="_blank" rel="noreferrer">
            {t.removal}
          </a>
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
            <DropZone onFile={onFile} />
          </section>
        )}

        {stage && (
          <section className="working" aria-live="polite">
            <p className="kicker">{t.stageModel}</p>
            <ol>
              {(
                [
                  ["read", t.stageRead],
                  ["model", t.stageModel],
                  ["data", t.stageData],
                  ["match", t.stageMatch],
                ] as const
              ).map(([id, label], index) => (
                <li key={id} className={["read", "model", "data", "match"].indexOf(stage) >= index ? "on" : ""}>
                  {label}
                </li>
              ))}
            </ol>
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
                  {ready.twinCount > 0
                    ? t.highBar(ready.twinCount, topShare(ready.calibration))
                    : t.noneHigh(rankOf(ready.twins[0]?.similarity ?? 0, ready.calibration), topShare(ready.calibration))}
                </p>
                <p className="score-note">{t.scoreNote}</p>
                <p className="privacy">{t.privacy}</p>
              </div>
              <DropZone onFile={onFile} compact />
            </section>

            <section>
              <div className="section-head">
                <h2>{t.twinsTitle}</h2>
                <p>{t.twinsDek}</p>
              </div>
              <div className="twin-grid">
                {ready.twins.map((twin, index) => (
                  <article className="twin-card" key={twin.site.id} style={{ animationDelay: `${index * 70}ms` }}>
                    <img src={`${import.meta.env.BASE_URL}data/${twin.site.thumb}`} alt="" />
                    <div className="twin-meta">
                      <div className="sim-row">
                        <span className="sim">{formatRank(rankOf(twin.similarity, ready.calibration), lang)}</span>
                        <span>{t.simLabel}</span>
                      </div>
                      <div className="meter" aria-hidden="true">
                        <span style={{ width: `${rankOf(twin.similarity, ready.calibration)}%` }} />
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
                {zone ? ` ${t.zone}: ${lang === "es" ? zone.labelEs : zone.labelEn}.` : ""}
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
                  alt={t.cardLine(ready.twinCount, topShare(ready.calibration))}
                />
              )}
              <div className="share-actions">
                {cardUrl && (
                  <a className="ticket" href={cardUrl} download="twinsites-card.png">
                    {t.download}
                  </a>
                )}
                <a className="ticket ghost" href={postHref} target="_blank" rel="noreferrer">
                  {t.post}
                </a>
              </div>
              <p className="share-note">{t.shareNote}</p>
            </section>
          </div>
        )}
      </main>

      <footer>
        <p>{t.footerPrivacy}</p>
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

