import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { track } from "../lib/analytics";
import type { Traits } from "../types";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: { sitekey: string; theme: "light"; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void },
  ) => string;
  reset: (id?: string) => void;
}

export interface Fix {
  trait: "mode" | "centered" | "gradient" | "bento" | "density" | "color";
  detected: string;
  corrected: string;
}

/** Bumped when the trait rules change, so old and new corrections stay apart. */
const RULES_VERSION = "layout-2026-10-20";

function endpoint(): string | null {
  const shot = import.meta.env.VITE_SHOT_ENDPOINT;
  if (!shot) return null;
  try {
    const url = new URL(shot);
    url.pathname = "/feedback";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Opt-in only. Sends which trait was corrected, the two values and six rounded
 * measurements of the screenshot; never the image, the URL or anything else.
 */
export function CorrectionReport({ fixes, traits }: { fixes: Fix[]; traits: Traits }) {
  const { t } = useI18n();
  const url = endpoint();
  const siteKey = import.meta.env.VITE_TURNSTILE_SITEKEY;
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [agree, setAgree] = useState(false);
  const [token, setToken] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    if (!url || !siteKey || !agree || !box.current || widget.current) return;
    const api = () => (window as Window & { turnstile?: TurnstileApi }).turnstile;
    const mount = () => {
      const turnstile = api();
      if (!turnstile || !box.current || widget.current) return;
      widget.current = turnstile.render(box.current, {
        sitekey: siteKey,
        theme: "light",
        callback: setToken,
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
    };
    if (api()) mount();
    else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = mount;
      document.head.appendChild(script);
    }
  }, [url, siteKey, agree]);

  if (!url) return <p className="score-note">{t.correctionLocal}</p>;

  const send = async () => {
    setState("sending");
    track("correction");
    const measures = {
      luminance: traits.luminance,
      saturation: traits.saturation,
      whitespace: traits.whitespace,
      edge: traits.edge,
      blockStd: traits.blockStd,
      centerShare: traits.centerShare,
    };
    try {
      for (const fix of fixes) {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...fix, measures, version: RULES_VERSION, token }),
        });
        if (!response.ok) throw new Error(String(response.status));
      }
      setState("sent");
    } catch {
      setState("error");
      setToken("");
      if (widget.current) (window as Window & { turnstile?: TurnstileApi }).turnstile?.reset(widget.current);
    }
  };

  if (state === "sent") return <p className="score-note">{t.correctionSent}</p>;
  return (
    <div className="report-box">
      <label className="list-consent">
        <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
        <span>{t.correctionConsent}</span>
      </label>
      {agree && siteKey && <div ref={box} className="turnstile" />}
      {agree && (
        <button type="button" className="ticket ghost" disabled={state === "sending" || (Boolean(siteKey) && !token)} onClick={() => void send()}>
          {t.correctionSend}
        </button>
      )}
      {state === "error" && <p className="score-note">{t.correctionError}</p>}
    </div>
  );
}
