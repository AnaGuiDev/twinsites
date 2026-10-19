import { useEffect, useMemo, useRef, useState } from "react";
import { DropZone } from "./DropZone";
import { MapView } from "./MapView";
import { RouteLink } from "../router";
import { useI18n } from "../i18n";
import { track } from "../lib/analytics";
import { traitLine, canvasToBlob, renderShareCard } from "../lib/card";
import { mapFor, type ResultData } from "../lib/explore";
import { hostOf } from "../lib/match";
import { formatPercentile } from "../lib/calibrate";
import { suggest } from "../lib/suggest";
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
  const suggestions = useMemo(
    () => suggest(result.traits, result.twins.map((twin) => twin.site.traits)),
    [result],
  );
  const shares = useMemo(() => countShares(result), [result]);
  const pageUrl = `https://twinsites.com/zone/${result.zone.slug}`;
  const shareText = `${t.cardLine(result.verdict, zoneName, result.catalogCount)} ${pageUrl}`;
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
    let cancel = false;
    const images =
      showMine || result.source === "catalog"
        ? [result.preview, thumb(result.twins[0]?.site.thumb ?? "")]
        : [thumb(result.twins[0]?.site.thumb ?? "")];
    void renderShareCard({
      lang,
      zone: zoneName,
      secondary,
      traits: traitLine(marks.map((mark) => mark.label)),
      pageUrl,
      images,
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
  }, [includeMine, lang, result, zoneName, secondary, marks, pageUrl, showMine]);

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
      <section className="reveal" aria-label={zoneName}>
        <figure>
          <img src={result.preview} alt={result.source === "upload" ? t.you : result.subjectTitle} />
          <figcaption>{result.source === "upload" ? t.you : result.subjectTitle}</figcaption>
        </figure>
        {result.twins[0] && (
          <figure>
            <img src={thumb(result.twins[0].site.thumb)} alt={result.twins[0].site.title} />
            <figcaption>{result.twins[0].site.title}</figcaption>
          </figure>
        )}
        <ul className="trait-row">
          {marks.map((mark) => (
            <li key={mark.label}>
              {mark.label}
              <span>{mark.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="again">
        <div>
          <p className="kicker">{t.zone}</p>
          <h1 className="zone-title">{zoneName}</h1>
          <p className="again-line">{secondary}</p>
          <p className="score-note">{t.scoreNote}</p>
          {result.cropped && <p className="score-note">{t.cropNote}</p>}
          {result.portrait && <p className="score-note">{t.portraitNote}</p>}
          <p className="score-note">
            <RouteLink href={`/zone/${result.zone.slug}`}>{zoneName}</RouteLink>
          </p>
        </div>
        <DropZone onFile={onFile} onIntent={onIntent} compact progress={progress} progressLabel={t.progressLabel} stageLabel={stageLabel} />
      </section>

      <section>
        <div className="section-head">
          <h2>{t.twinsTitle}</h2>
          <p>{t.twinsDek}</p>
        </div>
        <div className="twin-grid">
          {result.twins.map((twin, index) => (
            <article className="twin-card" key={twin.site.id} style={{ animationDelay: `${index * 70}ms` }}>
              <img src={thumb(twin.site.thumb)} alt={twin.site.title} />
              <div className="twin-meta">
                <div className="sim-row">
                  <span className="sim">{formatPercentile(twin.percentile, lang)}</span>
                  <span>{t.simLabel}</span>
                </div>
                <div className="meter" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, twin.percentile))}%` }} />
                </div>
                <h3>{twin.site.title}</h3>
                <p className="host">{hostOf(twin.site.url)}</p>
                <a href={twin.site.url} target="_blank" rel="noreferrer">
                  {t.openSite}
                </a>
                <RouteLink className="twin-more" href={`/site/${twin.site.slug}`}>
                  {t.itsTwins}
                </RouteLink>
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

      <section className="report">
        <div>
          <div className="section-head">
            <h2>{t.traitsTitle}</h2>
          </div>
          <p className="dek">{t.traitsDek}</p>
          <ul className="marks">
            <Mark label={t.dominant} value={t.colorName(result.traits.dominantName)} swatch={result.traits.dominant} note={t.shared(shares.color)} />
            <Mark label={t.mode} value={result.traits.mode === "dark" ? t.modeDark : t.modeLight} note={t.shared(shares.mode)} />
            <Mark
              label={t.density}
              value={result.traits.density === "airy" ? t.airy : result.traits.density === "packed" ? t.packed : t.balanced}
              note={t.shared(shares.density)}
            />
            <Mark label={t.gradient} value={result.traits.gradient ? t.gradientYes : t.gradientNo} note={t.shared(shares.gradient)} />
            <Mark label={t.bento} value={result.traits.bento ? t.bentoYes : t.bentoNo} note={t.shared(shares.bento)} />
            <Mark label={t.centered} value={result.traits.centered ? t.centeredYes : t.centeredNo} note={t.shared(shares.centered)} />
          </ul>
        </div>
        <div>
          <div className="section-head">
            <h2>{t.suggestTitle}</h2>
          </div>
          <p className="dek">{t.suggestDek}</p>
          <ol className="suggestions">
            {suggestions.map((item, index) => (
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
        {cardUrl && <img className="card-preview" src={cardUrl} alt={shareText} />}
        {result.source === "upload" && (
          <label className="include">
            <input type="checkbox" checked={includeMine} onChange={(event) => setIncludeMine(event.target.checked)} />
            {t.includeMine}
          </label>
        )}
        <div className="share-actions">
          {cardUrl && (
            <a className="ticket" href={cardUrl} download="twinsites-card.png" onClick={() => track("share")}>
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
  );
}

function countShares(result: ResultData) {
  const twins = result.twins.map((twin) => twin.site.traits);
  const count = (pred: (trait: Traits) => boolean) => twins.filter(pred).length;
  return {
    color: count((trait) => trait.dominantName === result.traits.dominantName),
    mode: count((trait) => trait.mode === result.traits.mode),
    density: count((trait) => trait.density === result.traits.density),
    gradient: count((trait) => trait.gradient === result.traits.gradient),
    bento: count((trait) => trait.bento === result.traits.bento),
    centered: count((trait) => trait.centered === result.traits.centered),
  };
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

function Mark({ label, value, note, swatch }: { label: string; value: string; note: string; swatch?: string }) {
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
