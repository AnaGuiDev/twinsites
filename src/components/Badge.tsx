import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { track } from "../lib/analytics";

/**
 * For a page with no look-alike in the top 5%: a small badge to put on it,
 * linking back. The code is a self-contained inline SVG, so the badge makes
 * no request to twinsites.com from the visitor's site (no tracking, and no
 * cross-origin header to configure).
 */
export function Badge({ total }: { total: number }) {
  const { lang, t } = useI18n();
  const [copied, setCopied] = useState(false);
  const month = new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-GB", { month: "short", year: "numeric" }).format(new Date());
  const code = useMemo(() => badgeCode(t.badgeLine, t.badgeSub(total, month), t.badgeAlt), [t, total, month]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      track("badge");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="badge-box" aria-labelledby="badge-title">
      <div>
        <h2 id="badge-title">{t.badgeTitle}</h2>
        <p className="dek">{t.badgeDek}</p>
        <div className="badge-preview" dangerouslySetInnerHTML={{ __html: code }} />
      </div>
      <div className="badge-side">
        <pre className="prompt-text badge-code" tabIndex={0}>
          {code}
        </pre>
        <button type="button" className="ticket" onClick={() => void copy()}>
          {copied ? t.badgeCopied : t.badgeCopy}
        </button>
        <p className="score-note">{t.badgeNote}</p>
      </div>
    </section>
  );
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

/** A 272×44 badge: the Twinsites mark, one bold line and one small line. */
function badgeCode(line: string, sub: string, alt: string): string {
  const font = "font-family='Helvetica Neue,Arial,sans-serif'";
  return [
    `<a href="https://twinsites.com/?ref=badge" target="_blank" rel="noopener" title="${esc(alt)}">`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="272" height="44" viewBox="0 0 272 44" role="img" aria-label="${esc(alt)}">`,
    `<rect width="272" height="44" rx="6" fill="#000"/>`,
    `<rect x="10" y="10" width="11" height="10" fill="#ffe24a"/><rect x="23" y="10" width="11" height="10" fill="#ffe24a"/>`,
    `<rect x="10" y="23" width="11" height="10" fill="#fff"/><rect x="23" y="23" width="11" height="10" fill="#fff"/>`,
    `<text x="44" y="20" ${font} font-size="13" font-weight="700" fill="#fff">${esc(line)}</text>`,
    `<text x="44" y="34" ${font} font-size="10" fill="#bdbdbd">${esc(sub)}</text>`,
    `</svg></a>`,
  ].join("");
}
