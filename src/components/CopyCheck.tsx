import { useI18n } from "../i18n";
import type { Cliche } from "../lib/cliches";

export interface WordsState {
  status: "idle" | "reading" | "done" | "failed";
  lines: string[];
  found: Cliche[];
}

/**
 * What the large text on the page says, and which stock phrases of AI-built
 * landings it uses, with how many catalog homepages use them too.
 */
export function CopyCheck({
  words,
  counts,
  total,
  onRead,
}: {
  words: WordsState;
  counts: Record<string, number> | null;
  total: number;
  onRead: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="copy-check" aria-labelledby="copy-title" aria-live="polite">
      <div className="section-head">
        <h2 id="copy-title">{t.copyTitle}</h2>
        <p>{t.copyDek}</p>
      </div>
      {words.status === "idle" && (
        <div className="copy-start">
          <button type="button" className="ticket" onClick={onRead}>
            {t.copyRead}
          </button>
          <p className="score-note">{t.copyWeight}</p>
        </div>
      )}
      {words.status === "reading" && <p className="score-note">{t.copyReading}</p>}
      {words.status === "failed" && <p className="score-note">{t.copyFailed}</p>}
      {words.status === "done" && (
        <>
          {words.lines.length ? (
            <blockquote className="read-text">
              {words.lines.slice(0, 6).map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </blockquote>
          ) : (
            <p className="score-note">{t.copyNothing}</p>
          )}
          {words.lines.length > 0 &&
            (words.found.length ? (
              <ul className="cliches">
                {words.found.map((cliche) => (
                  <li key={cliche.id}>
                    <strong>{cliche.label}</strong>
                    {counts && counts[cliche.id] > 0 && <span>{t.copyCount(counts[cliche.id], total)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="summary">{t.copyClean}</p>
            ))}
          <p className="score-note">{t.copyCaveat}</p>
        </>
      )}
    </section>
  );
}
