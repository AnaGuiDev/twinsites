import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DropZone } from "./DropZone";
import { Inspiration } from "./Inspiration";
import { Rivals } from "./Rivals";
import { CopyCheck, type WordsState } from "./CopyCheck";
import { CorrectionReport, type Fix } from "./CorrectionReport";
import { SubscribeForm } from "./SubscribeForm";
import { MapView } from "./MapView";
import { RouteLink } from "../router";
import { useI18n } from "../i18n";
import { track } from "../lib/analytics";
import { traitLine, canvasToBlob, renderProgressCard, renderShareCard } from "../lib/card";
import { mapFor, type ResultData } from "../lib/explore";
import { hostOf } from "../lib/match";
import { formatPercentile } from "../lib/calibrate";
import { diagnose, type TraitKey } from "../lib/diagnose";
import { forgetCheck, progressOf } from "../lib/history";
import { marksFor, type Marks } from "../lib/regions";
import { findCliches } from "../lib/cliches";
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
  const twinTraits = useMemo(() => result.twins.map((twin) => twin.site.traits), [result]);
  const catalogTraits = useMemo(() => mapSites.map((site) => site.traits), [mapSites]);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [editing, setEditing] = useState<TraitKey | null>(null);
  useEffect(() => {
    setFixes([]);
    setEditing(null);
  }, [result.preview]);
  // The traits as corrected by the person, when they say the detector got one wrong.
  const traits = useMemo(() => {
    const next: Traits = { ...result.traits };
    for (const fix of fixes) Object.assign(next, patchFor(fix.trait, fix.corrected));
    return next;
  }, [result.traits, fixes]);
  const diagnosis = useMemo(() => diagnose(traits, twinTraits, catalogTraits), [traits, twinTraits, catalogTraits]);
  const [words, setWords] = useState<WordsState>({ status: "idle", lines: [], found: [] });
  const [copyCounts, setCopyCounts] = useState<Record<string, number> | null>(null);
  const [copyTotal, setCopyTotal] = useState(2003);
  const readWords = useCallback(async () => {
    setWords({ status: "reading", lines: [], found: [] });
    track("copy");
    void fetch(`${import.meta.env.BASE_URL}data/copy.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((file: { total: number; counts: Record<string, number> } | null) => {
        if (!file) return;
        setCopyCounts(file.counts);
        setCopyTotal(file.total);
      })
      .catch(() => undefined);
    try {
      const { readLargeText } = await import("../lib/ocr");
      const image = await (await fetch(result.preview)).blob();
      const read = await readLargeText(image);
      setWords({ status: "done", lines: read.lines, found: findCliches(read.text) });
    } catch (error) {
      console.error("ocr", error);
      setWords({ status: "failed", lines: [], found: [] });
    }
  }, [result.preview]);
  useEffect(() => {
    setWords({ status: "idle", lines: [], found: [] });
    if (result.source !== "upload") return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData || window.matchMedia("(max-width: 720px)").matches) return;
    void readWords();
  }, [result.preview, result.source, readWords]);
  const promptText = useMemo(
    () =>
      t.prompt({
        diagnosis,
        traits: traits,
        verdict: result.verdict,
        zone: zoneName,
        moves: [
          ...diagnosis.moves.map((move) => t.suggestion(move.item)),
          ...(words.found.length ? [t.copyMove(words.found.slice(0, 3).map((cliche) => `“${cliche.label}”`).join(", "))] : []),
        ],
      }),
    [diagnosis, traits, result.verdict, zoneName, t, words.found],
  );
  const topCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const twin of result.twins) {
      const key = twin.site.category || "other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([key]) => key !== "other").sort((a, b) => b[1] - a[1])[0]?.[0] ?? "productivity";
  }, [result.twins]);
  const [regions, setRegions] = useState<Marks | null>(null);
  const [showMarks, setShowMarks] = useState(true);
  useEffect(() => {
    let cancel = false;
    setRegions(null);
    void marksFor(result.preview, traits.dominantName)
      .then((next) => {
        if (!cancel) setRegions(next);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [result.preview, traits.dominantName]);
  const markKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const part of diagnosis.recipe) {
      if (part.key === "centered" && traits.centered) keys.add("centered");
      if (part.key === "density" && traits.density === "airy") keys.add("density");
      if (part.key === "gradient" && traits.gradient) keys.add("gradient");
      if (part.key === "color" && traits.dominantName !== "neutral") keys.add("color");
    }
    return keys;
  }, [diagnosis.recipe, traits]);
  const legend = useMemo(() => {
    const items: { key: string; style: string; label: string }[] = [];
    if (markKeys.has("centered") && regions?.centre) items.push({ key: "centered", style: "box", label: t.markCentre });
    if (markKeys.has("density") && regions?.empty.length) items.push({ key: "density", style: "hatch", label: t.markEmpty });
    if (markKeys.has("gradient")) items.push({ key: "gradient", style: "hatch", label: t.markGradient });
    if (markKeys.has("color") && regions?.accent.length) items.push({ key: "color", style: "fill", label: t.markAccent(t.colorName(traits.dominantName)) });
    return items;
  }, [markKeys, regions, t, traits.dominantName]);
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
      traits: traitLine(diagnosis.recipe.map((part) => t.traitLabel(part.key, traits))),
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
  }, [includeMine, lang, result, zoneName, secondary, diagnosis, traits, pageUrl, showMine, showProgress, t]);

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
          <p className="summary">{t.summary({ diagnosis, traits: traits, verdict: result.verdict })}</p>
          <p className="score-note">{t.scoreNote}</p>
          {result.cropped && <p className="score-note">{t.cropNote}</p>}
          {result.portrait && <p className="score-note">{t.portraitNote}</p>}
          {result.small && !result.portrait && <p className="score-note">{t.smallNote}</p>}
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
          <div className="marked">
            <img src={result.preview} alt={result.source === "upload" ? t.you : result.subjectTitle} />
            {showMarks && regions && (
              <svg className="marks-layer" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <pattern id="hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="1.4" height="3" fill="#ffe24a" />
                  </pattern>
                </defs>
                {markKeys.has("density") &&
                  regions.empty.map((band) => (
                    <rect key={band.y0} x="0" y={band.y0 * 100} width="160" height={(band.y1 - band.y0) * 100} fill="url(#hatch)" opacity="0.75" />
                  ))}
                {markKeys.has("gradient") && (
                  <>
                    <rect x="0" y="12" width="11.2" height="88" fill="url(#hatch)" opacity="0.85" />
                    <rect x="148.8" y="12" width="11.2" height="88" fill="url(#hatch)" opacity="0.85" />
                  </>
                )}
                {markKeys.has("color") &&
                  regions.accent.map((cell) => (
                    <rect key={`${cell.x},${cell.y}`} x={cell.x * 160} y={cell.y * 100} width={160 / 48} height={100 / 30} fill="#ffe24a" opacity="0.7" />
                  ))}
                {markKeys.has("centered") && regions.centre && (
                  <>
                    <line x1="80" x2="80" y1="0" y2="100" stroke="#fff" strokeWidth="1.6" />
                    <line x1="80" x2="80" y1="0" y2="100" stroke="#000" strokeWidth="0.6" strokeDasharray="2 1.5" />
                    <rect
                      x={regions.centre.x0 * 160}
                      y={regions.centre.y0 * 100}
                      width={(regions.centre.x1 - regions.centre.x0) * 160}
                      height={(regions.centre.y1 - regions.centre.y0) * 100}
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2.2"
                    />
                    <rect
                      x={regions.centre.x0 * 160}
                      y={regions.centre.y0 * 100}
                      width={(regions.centre.x1 - regions.centre.x0) * 160}
                      height={(regions.centre.y1 - regions.centre.y0) * 100}
                      fill="none"
                      stroke="#000"
                      strokeWidth="1"
                    />
                  </>
                )}
              </svg>
            )}
          </div>
          <figcaption>
            <strong>{result.source === "upload" ? t.you : result.subjectTitle}</strong>
          </figcaption>
          {legend.length > 0 && (
            <div className="legend">
              {showMarks && (
                <ul>
                  {legend.map((item) => (
                    <li key={item.key}>
                      <i className={`key key-${item.style}`} aria-hidden="true" />
                      {item.label}
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="text-link as-button" onClick={() => setShowMarks((value) => !value)}>
                {showMarks ? t.marksHide : t.marksShow}
              </button>
            </div>
          )}
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
              <button
                type="button"
                className={editing === part.key ? "recipe-chip is-open" : "recipe-chip"}
                aria-expanded={editing === part.key}
                title={t.correctHint}
                onClick={() => setEditing((current) => (current === part.key ? null : part.key))}
              >
                {part.key === "color" && <i className="swatch" style={{ background: traits.dominant }} />}
                <strong>{t.traitLabel(part.key, traits)}</strong>
                <span>{t.moveEvidence(part.twins, diagnosis.twinTotal)}</span>
              </button>
            </li>
          ))}
        </ul>
        {editing && (
          <div className="correct-box">
            <p>{t.correctAsk(t.traitLabel(editing, traits))}</p>
            <div className="share-actions">
              {alternativesFor(editing, traits).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="ticket ghost"
                  onClick={() => {
                    const detected = valueOf(editing, result.traits);
                    setFixes((current) => [
                      ...current.filter((fix) => fix.trait !== editing),
                      ...(value === detected ? [] : [{ trait: editing, detected, corrected: value }]),
                    ]);
                    setEditing(null);
                  }}
                >
                  {t.traitLabel(editing, { ...traits, ...patchFor(editing, value) })}
                </button>
              ))}
              <button type="button" className="text-link as-button" onClick={() => setEditing(null)}>
                {t.correctCancel}
              </button>
            </div>
          </div>
        )}
        {!editing && fixes.length === 0 && <p className="score-note">{t.correctHint}</p>}
        {fixes.length > 0 && (
          <div className="fixes">
            <ul>
              {fixes.map((fix) => (
                <li key={fix.trait}>
                  {t.correctedLine(
                    t.traitLabel(fix.trait, { ...result.traits, ...patchFor(fix.trait, fix.detected) }),
                    t.traitLabel(fix.trait, { ...result.traits, ...patchFor(fix.trait, fix.corrected) }),
                  )}{" "}
                  <button
                    type="button"
                    className="text-link as-button"
                    onClick={() => setFixes((current) => current.filter((item) => item.trait !== fix.trait))}
                  >
                    {t.correctUndo}
                  </button>
                </li>
              ))}
            </ul>
            <CorrectionReport fixes={fixes} traits={result.traits} />
          </div>
        )}
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

      {result.source === "upload" && <CopyCheck words={words} counts={copyCounts} total={copyTotal} onRead={() => void readWords()} />}

      <Inspiration initial={topCategory} />

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

      <Rivals result={result} />


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


const COLORS = ["red", "orange", "amber", "yellow", "lime", "green", "teal", "cyan", "blue", "indigo", "purple", "magenta", "pink", "neutral"] as const;

function valueOf(key: TraitKey, traits: Traits): string {
  switch (key) {
    case "mode":
      return traits.mode;
    case "density":
      return traits.density;
    case "color":
      return traits.dominantName;
    case "centered":
      return String(traits.centered);
    case "gradient":
      return String(traits.gradient);
    case "bento":
      return String(traits.bento);
  }
}

function patchFor(key: TraitKey, value: string): Partial<Traits> {
  switch (key) {
    case "mode":
      return { mode: value === "dark" ? "dark" : "light" };
    case "density":
      return { density: value === "packed" ? "packed" : value === "airy" ? "airy" : "balanced" };
    case "color":
      return { dominantName: (COLORS as readonly string[]).includes(value) ? (value as Traits["dominantName"]) : "neutral" };
    case "centered":
      return { centered: value === "true" };
    case "gradient":
      return { gradient: value === "true" };
    case "bento":
      return { bento: value === "true" };
  }
}

/** What else the trait could be, offered when someone says it was read wrong. */
function alternativesFor(key: TraitKey, traits: Traits): string[] {
  const current = valueOf(key, traits);
  switch (key) {
    case "mode":
      return [current === "dark" ? "light" : "dark"];
    case "density":
      return ["airy", "balanced", "packed"].filter((value) => value !== current);
    case "color":
      return current === "neutral" ? [] : ["neutral"];
    default:
      return [current === "true" ? "false" : "true"];
  }
}
