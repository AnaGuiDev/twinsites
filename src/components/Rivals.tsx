import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { track } from "../lib/analytics";
import { formatPercentile, percentileOf } from "../lib/calibrate";
import { cropHero } from "../lib/crop";
import type { ResultData } from "../lib/explore";

interface Rival {
  id: number;
  name: string;
  preview: string;
  percentile: number | null;
  failed: boolean;
  small: boolean;
}

const MAX_RIVALS = 3;

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** Your page's vector: kept from the upload, or read from the catalog. */
async function subjectVector(result: ResultData): Promise<{ vector: Float32Array; knots: number[] }> {
  const { loadDataset } = await import("../lib/dataset");
  const dataset = await loadDataset();
  if (result.vector) return { vector: result.vector, knots: dataset.calibration.knots };
  const index = dataset.catalog.sites.findIndex((site) => site.slug === result.subjectSlug);
  if (index < 0) throw new Error("subject");
  return {
    vector: dataset.embeddings.slice(index * dataset.dim, (index + 1) * dataset.dim),
    knots: dataset.calibration.knots,
  };
}

/**
 * Up to three competitors' screenshots, each measured against your page on the
 * same percentile scale as the twins. All in the browser.
 */
export function Rivals({ result }: { result: ResultData }) {
  const { lang, t } = useI18n();
  const [rivals, setRivals] = useState<Rival[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const next = useRef(1);

  useEffect(() => {
    setRivals((current) => {
      current.forEach((rival) => URL.revokeObjectURL(rival.preview));
      return [];
    });
  }, [result.preview]);

  const add = async (files: File[]) => {
    const room = MAX_RIVALS - rivals.length;
    const picked = files.filter((file) => file.type.startsWith("image/")).slice(0, Math.max(0, room));
    if (!picked.length) return;
    track("rivals");
    const fresh = picked.map((file) => ({
      id: next.current++,
      name: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 40) || t.rivalDefault,
      preview: URL.createObjectURL(file),
      percentile: null,
      failed: false,
      small: false,
    }));
    setRivals((current) => [...current, ...fresh]);
    try {
      const [{ vector, knots }, model] = await Promise.all([subjectVector(result), import("../lib/model")]);
      for (const [index, file] of picked.entries()) {
        const id = fresh[index].id;
        try {
          const frame = await cropHero(file);
          const small = frame.bitmap.width < 1000;
          frame.bitmap.close();
          const rival = await model.embedBlob(frame.blob);
          const percentile = percentileOf(dot(vector, rival), knots);
          setRivals((current) => current.map((item) => (item.id === id ? { ...item, percentile, small } : item)));
        } catch {
          setRivals((current) => current.map((item) => (item.id === id ? { ...item, failed: true } : item)));
        }
      }
    } catch {
      setRivals((current) => current.map((item) => (item.percentile === null ? { ...item, failed: true } : item)));
    }
  };

  const closest = rivals.filter((rival) => rival.percentile !== null).sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0))[0];

  return (
    <section className="rivals" aria-labelledby="rivals-title">
      <div className="section-head">
        <h2 id="rivals-title">{t.rivalsTitle}</h2>
        <p>{t.rivalsDek}</p>
      </div>
      <div className="rival-grid">
        {rivals.map((rival) => (
          <article key={rival.id} className="rival">
            <img src={rival.preview} alt="" />
            <div className="rival-meta">
              <input
                className="rival-name"
                value={rival.name}
                aria-label={t.rivalName}
                onChange={(event) => setRivals((current) => current.map((item) => (item.id === rival.id ? { ...item, name: event.target.value } : item)))}
              />
              {rival.failed ? (
                <p className="score-note">{t.rivalFailed}</p>
              ) : rival.percentile === null ? (
                <p className="score-note">{t.rivalMeasuring}</p>
              ) : (
                <>
                  <p className="rival-score">
                    <strong>{formatPercentile(rival.percentile, lang)}</strong> {t.simLabel}
                  </p>
                  <p className={`rival-verdict v-${rivalBand(rival.percentile)}`}>{t.rivalVerdict(rivalBand(rival.percentile))}</p>
                  {rival.small && <p className="score-note">{t.rivalSmall}</p>}
                </>
              )}
              <button
                type="button"
                className="text-link as-button"
                onClick={() => {
                  URL.revokeObjectURL(rival.preview);
                  setRivals((current) => current.filter((item) => item.id !== rival.id));
                }}
              >
                {t.rivalRemove}
              </button>
            </div>
          </article>
        ))}
        {rivals.length < MAX_RIVALS && (
          <div
            className="sleeve rival-add"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void add([...event.dataTransfer.files]);
            }}
          >
            <p className="sleeve-kicker">{t.rivalAdd}</p>
            <p className="sleeve-hint">{t.rivalHint(MAX_RIVALS - rivals.length)}</p>
            <button type="button" className="ticket" onClick={() => input.current?.click()}>
              {t.browse}
            </button>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(event) => {
                void add([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
          </div>
        )}
      </div>
      {closest && closest.percentile !== null && (
        <p className="summary rival-summary">{t.rivalSummary(closest.name, rivalBand(closest.percentile))}</p>
      )}
      <p className="score-note">{t.rivalUrlSoon}</p>
    </section>
  );
}

export type RivalBand = "mixup" | "close" | "some" | "apart";

export function rivalBand(percentile: number): RivalBand {
  if (percentile >= 95) return "mixup";
  if (percentile >= 80) return "close";
  if (percentile >= 50) return "some";
  return "apart";
}
