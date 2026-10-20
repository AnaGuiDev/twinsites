import { useEffect, useMemo, useRef, useState } from "react";
import { DropZone } from "./DropZone";
import { SubscribeForm } from "./SubscribeForm";
import { MapView } from "./MapView";
import { RouteLink } from "../router";
import { useI18n } from "../i18n";
import { track } from "../lib/analytics";
import { traitLine, canvasToBlob, renderProgressCard, renderShareCard } from "../lib/card";
import { mapFor, type ResultData } from "../lib/explore";
import { hostOf } from "../lib/match";
import { formatPercentile } from "../lib/calibrate";
import { diagnose } from "../lib/diagnose";
import { forgetCheck, progressOf } from "../lib/history";
import type { Cluster, Site, Traits } from "../types";

export function ResultView({
  result,
  onFile,
  onIntent,
  progress,
  stageLabel,
}: {
  result: ResultData;
  onFile: (file: File) => void;
  onIntent?: () => void;
  progress: number | null;
  stageLabel: string | null;
}) {
  const { lang, t } = useI18n();
  const [includeMine, setIncludeMine] = useState(false);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const cardBlob = useRef<Blob | null>(null);
  const [mapSites, setMapSites] = useState<Site[]>(result.sites);
  const [mapClusters, setMapClusters] = useState<Cluster[]>(result.clusters);
  const zoneName = lang === "es" ? result.zone.labelEs : result.zone.labelEn;
  const nearest = result.twins[0]?.percentile ?? 0;
  const secondary = t.resultLine(result.verdict, nearest);
  const marks = useMemo(() => callouts(result.traits, result.twins.map((twin) => twin.site.traits), t), [result, t]);
  const twinTraits = useMemo(() => result.twins.map((twin) => twin.site.traits), [result]);
  const catalogTraits = useMemo(() => mapSites.map((site) => site.traits), [mapSites]);
  const diagnosis = useMemo(() => diagnose(result.traits, twinTraits, catalogTraits), [result.traits, twinTraits, catalogTraits]);
  const promptText = useMemo(
    () =>
      t.prompt({
        diagnosis,
        traits: result.traits,
        verdict: result.verdict,
        zone: zoneName,
        moves: diagnosis.moves.map((move) => t.suggestion(move.item)),
      }),
    [diagnosis, result.traits, result.verdict, zoneName, t],
  );
  const [copied, setCopied] = useState(false);
  const [compare, setCompare] = useState<boolean | null>(null);
  const [forgotten, setForgotten] = useState(false);
  const [includeBoth, setIncludeBoth] = useState(true);
  const previous = result.source === "upload" && !forgotten ? result.previous ?? null : null;
  const delta = useMemo(
    () => (previous && result.bands ? progressOf(previous, result.bands, nearest) : null),
    [previous, result.bands, nearest],
  );
  const showProgress = Boolean(delta && compare);
  const pageUrl = showProgress ? "https://twinsites.com" : `https://twinsites.com/zone/${result.zone.slug}`;
  const shareText = showProgress && delta
    ? `${t.progressPost(delta, result.catalogCount)} ${pageUrl}`
    : `${t.cardLine(result.verdict, zoneName, result.catalogCount)} ${pageUrl}`;
  const showMine = result.source === "upload" && includeMine;
  const thumb = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;

  useEffect(() => {
    track("result");
  }, [result.preview, result.zone.slug, result.source]);

  useEffect(() => {
    let cancel = false;
    if (result.sites.length > 100) {
      setMapSites(result.sites);
      setMapClusters(result.clusters);
      return;
    }
    void mapFor(result).then((next) => {
      if (cancel) return;
      setMapSites(next.sites);
      setMapClusters(next.clusters);
    });
    return () => {
      cancel = true;
    };
  }, [result]);

  useEffect(() => {
    if (!showProgress || !delta || !previous) return;
    let cancel = false;
    void renderProgressCard({
      before: delta.before,
      after: delta.after,
      unit: t.progressUnit(delta.top),
      among: t.progressAmong(result.catalogCount),
      pageUrl,
      images: includeBoth ? [previous.preview, result.preview] : ["", ""],
      labels: [t.cardBefore, t.cardAfter],
    })
      .then(async (canvas) => {
        const blob = await canvasToBlob(canvas);
        if (cancel) return;
        cardBlob.current = blob;
        const url = URL.createObjectURL(blob);
        setCardUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [showProgress, delta, previous, includeBoth, pageUrl, result.preview, result.catalogCount, t]);

  useEffect(() => {
    if (showProgress) return;
    let cancel = false;
    const both = showMine || result.source === "catalog";
    const images = both
      ? [result.preview, thumb(result.twins[0]?.site.thumb ?? "")]
      : [thumb(result.twins[0]?.site.thumb ?? "")];
    const clip = (text: string) => (text.length > 34 ? `${text.slice(0, 33).trimEnd()}…` : text);
    const labels = both
      ? [result.source === "upload" ? t.cardYou : clip(result.subjectTitle), t.cardTwin]
      : [t.cardTwin];
    void renderShareCard({
      lang,
      zone: zoneName,
      secondary,
      traits: traitLine(marks.map((mark) => mark.label)),
      pageUrl,
      images,
      labels,
    })
      .then(async (canvas) => {
        const blob = await canvasToBlob(canvas);
        if (cancel) return;
        cardBlob.current = blob;
        const url = URL.createObjectURL(blob);
        setCardUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [includeMine, lang, result, zoneName, secondary, marks, pageUrl, showMine, showProgress, t]);

  const copyPrompt = async () => {
    track("prompt");
    try {
      await navigator.clipboard.writeText(promptText);
    } catch {
      const area = document.createElement("textarea");
      area.value = promptText;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2400);
  };

  const onShare = async () => {
    track("share");
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
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="results">
      <section className="result-head">
        <div>
          <h1 className="zone-title">{zoneName}</h1>
          <p className="again-line">{secondary}</p>
          <p className="score-note">{t.scoreNote}</p>
          {result.cropped && <p className="score-note">{t.cropNote}</p>}
          {result.portrait && <p className="score-note">{t.portraitNote}</p>}
          <p className="score-note">
            <RouteLink className="text-link" href={`/zone/${result.zone.slug}`}>
              {t.zoneLink(zoneName)}
            </RouteLink>
          </p>
        </div>
        <DropZone onFile={onFile} onIntent={onIntent} compact progress={progress} progressLabel={t.progressLabel} stageLabel={stageLabel} />
      </section>

      {delta && previous && compare !== false && (
        <section className="progress" aria-live="polite">
          <div className="section-head">
            <h2>{t.progressTitle}</h2>
            <p>{new Date(previous.at).toLocaleString(lang === "es" ? "es-ES" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
          </div>
          {compare === null && (
            <div className="progress-ask">
              <p>{t.progressAsk}</p>
              <p className="score-note">{t.progressCaveat}</p>
              <div className="share-actions">
                <button
                  type="button"
                  className="ticket"
                  onClick={() => {
                    track("progress");
                    setCompare(true);
                  }}
                >
                  {t.progressYes}
                </button>
                <button type="button" className="ticket ghost" onClick={() => setCompare(false)}>
                  {t.progressNo}
                </button>
              </div>
            </div>
          )}
          {compare && (
            <div className="progress-body">
              <figure>
                {previous.preview && <img src={previous.preview} alt="" />}
                <figcaption>{t.cardBefore}</figcaption>
              </figure>
              <figure>
                <img src={result.preview} alt="" />
                <figcaption>{t.cardAfter}</figcaption>
              </figure>
              <div className="progress-figure">
                <p className="progress-numbers">
                  {delta.before} → {delta.after}
                </p>
                <p className="progress-unit">{t.progressUnit(delta.top)}</p>
                <p>{delta.after < delta.before ? t.progressBetter : delta.after > delta.before ? t.progressWorse : t.progressSame}</p>
                <p className="score-note">{t.progressNearest(delta)}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            className="text-link as-button forget"
            onClick={() => {
              forgetCheck();
              setForgotten(true);
              setCompare(false);
            }}
          >
            {t.forgetCheck}
          </button>
        </section>
      )}
      {forgotten && <p className="score-note">{t.forgottenCheck}</p>}

      <section className="reveal" aria-label={t.revealLabel}>
        <figure>
          <img src={result.preview} alt={result.source === "upload" ? t.you : result.subjectTitle} />
          <figcaption>
            <strong>{result.source === "upload" ? t.you : result.subjectTitle}</strong>
          </figcaption>
        </figure>
        {result.twins[0] && (
          <figure>
            <img className="developing" src={thumb(result.twins[0].site.thumb)} alt={result.twins[0].site.title} />
            <figcaption>
              {t.closest} <strong>{result.twins[0].site.title}</strong>
            </figcaption>
          </figure>
        )}
      </section>

      <section className="diagnosis">
        <div className="section-head">
          <h2>{t.diagnosisTitle}</h2>
          <p>
            {t.diagnosisLine(diagnosis)}{" "}
            <span className="caveat">
              {t.diagnosisCaveat}{" "}
              <RouteLink className="text-link" href="/faq">
                {t.reliability}
              </RouteLink>
            </span>
          </p>
        </div>
        <ul className="recipe">
          {diagnosis.recipe.map((part) => (
            <li key={part.key}>
              {part.key === "color" && <i className="swatch" style={{ background: result.traits.dominant }} />}
              <strong>{t.traitLabel(part.key, result.traits)}</strong>
              <span>{t.moveEvidence(part.twins, diagnosis.twinTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="fix">
          <div>
            <h3 className="fix-title">{t.movesTitle}</h3>
            <ol className="moves">
              {diagnosis.moves.map((move) => (
                <li key={move.item.id}>
                  <p>{t.suggestion(move.item)}</p>
                  <span>{t.moveEvidence(move.twins, diagnosis.twinTotal)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="prompt-box">
            <h3 className="fix-title">{t.promptTitle}</h3>
            <p className="dek">
              {t.promptDek} {t.promptCaveat}
            </p>
            <pre className="prompt-text" tabIndex={0}>
              {promptText}
            </pre>
            <button type="button" className="ticket" onClick={() => void copyPrompt()}>
              {copied ? t.copiedPrompt : t.copyPrompt}
            </button>
          </div>
        </div>
      </section>

      <section className="share">
        <div className="share-card">
          {cardUrl ? <img className="card-preview" src={cardUrl} alt={shareText} /> : <div className="card-preview is-loading" />}
        </div>
        <div className="share-side">
          <h2>{showProgress ? t.shareProgressTitle : t.shareTitle}</h2>
          <p className="dek">{showProgress ? t.shareProgressDek : t.shareDek}</p>
          {showProgress ? (
            <label className="include">
              <input type="checkbox" checked={includeBoth} onChange={(event) => setIncludeBoth(event.target.checked)} />
              {t.includeBoth}
            </label>
          ) : (
            result.source === "upload" && (
              <label className="include">
                <input type="checkbox" checked={includeMine} onChange={(event) => setIncludeMine(event.target.checked)} />
                {t.includeMine}
              </label>
            )
          )}
          <div className="share-actions">
            <button type="button" className="ticket" onClick={() => void onShare()}>
              {t.post}
            </button>
            {cardUrl && (
              <a className="ticket ghost" href={cardUrl} download="twinsites-card.png" onClick={() => track("share")}>
                {t.download}
              </a>
            )}
          </div>
          <p className="share-note">{t.shareNote}</p>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>{t.twinsTitle}</h2>
          <p>{t.twinsDek}</p>
        </div>
        <div className="twin-grid">
          {result.twins.map((twin) => (
            <article className="twin-card" key={twin.site.id}>
              <RouteLink className="twin-shot" href={`/site/${twin.site.slug}`}>
                <img src={thumb(twin.site.thumb)} alt={twin.site.title} loading="lazy" />
              </RouteLink>
              <div className="twin-meta">
                <h3>
                  <RouteLink href={`/site/${twin.site.slug}`}>{twin.site.title}</RouteLink>
                </h3>
                <span className="sim" title={t.simLabel}>
                  {formatPercentile(twin.percentile, lang)}
                </span>
                <p className="host">
                  <a href={twin.site.url} target="_blank" rel="noreferrer" aria-label={`${t.openSite}: ${hostOf(twin.site.url)}`}>
                    {hostOf(twin.site.url)}
                  </a>
                </p>
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
        {mapSites.length > 100 ? (
          <MapView sites={mapSites} clusters={mapClusters} user={result.spot} lang={lang} />
        ) : (
          <p className="score-note">{t.loadingCatalog}</p>
        )}
        <p className="map-caption">
          {t.mapHint} {t.zone}: {zoneName}.
        </p>
      </section>
      <SubscribeForm />
    </div>
  );
}

function callouts(
  traits: Traits,
  twins: Traits[],
  t: ReturnType<typeof useI18n>["t"],
): { label: string; note: string }[] {
  const n = (pred: (trait: Traits) => boolean) => twins.filter(pred).length;
  const rows = [
    { n: n((item) => item.mode === traits.mode), label: traits.mode === "dark" ? t.modeDark : t.modeLight },
    { n: n((item) => item.dominantName === traits.dominantName), label: t.colorName(traits.dominantName) },
    {
      n: n((item) => item.density === traits.density),
      label: traits.density === "airy" ? t.airy : traits.density === "packed" ? t.packed : t.balanced,
    },
    { n: n((item) => item.gradient === traits.gradient), label: traits.gradient ? t.gradientYes : t.gradientNo },
    { n: n((item) => item.bento === traits.bento), label: traits.bento ? t.bentoYes : t.bentoNo },
    { n: n((item) => item.centered === traits.centered), label: traits.centered ? t.centeredYes : t.centeredNo },
  ].sort((a, b) => b.n - a.n);
  const strong = rows.filter((row) => row.n >= 6);
  return (strong.length >= 2 ? strong : rows).slice(0, 4).map((row) => ({ label: row.label, note: t.shared(row.n) }));
}
