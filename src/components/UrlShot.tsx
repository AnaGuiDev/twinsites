import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      theme: "light";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
}

type ShotNotice = "generic" | "verify" | "busy";

function turnstileApi(): TurnstileApi | undefined {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

export function UrlShot({ onFile }: { onFile: (file: File) => void }) {
  const endpoint = import.meta.env.VITE_SHOT_ENDPOINT;
  const siteKey = import.meta.env.VITE_TURNSTILE_SITEKEY;
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ShotNotice | null>(null);
  // The check script did not load (often an ad blocker): say so only once someone tries.
  const [blocked, setBlocked] = useState(false);

  const clearToken = () => setToken("");

  useEffect(() => {
    if (!endpoint || !siteKey || !box.current) return;
    let dead = false;
    const mount = () => {
      const turnstile = turnstileApi();
      if (dead || !turnstile || !box.current || widget.current) return;
      widget.current = turnstile.render(box.current, {
        sitekey: siteKey,
        theme: "light",
        callback: (next) => {
          setToken(next);
          setNotice(null);
        },
        "expired-callback": () => clearToken(),
        "error-callback": () => clearToken(),
      });
    };
    if (turnstileApi()) {
      mount();
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.dataset.turnstile = "1";
      script.onload = mount;
      script.onerror = () => setBlocked(true);
      document.head.appendChild(script);
    }
    return () => {
      dead = true;
    };
  }, [endpoint, siteKey]);

  if (!endpoint) return null;

  const resetWidget = () => {
    clearToken();
    if (widget.current) turnstileApi()?.reset(widget.current);
  };

  const submit = async () => {
    setNotice(null);
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, token }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const type = blob.type || "";
      if (blob.size > 3 * 1024 * 1024 || !/^image\/(png|jpeg)/.test(type)) throw new Error("image");
      const name = type.includes("png") ? "page.png" : "page.jpg";
      onFile(new File([blob], name, { type }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "shot";
      console.error("shot", message);
      if (message === "403") setNotice("verify");
      else if (message === "429" || message === "503") setNotice("busy");
      else setNotice("generic");
    } finally {
      setBusy(false);
      resetWidget();
    }
  };

  const needsToken = Boolean(siteKey);
  const waiting = needsToken && !token;

  return (
    <form
      className="url-shot"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="page-url">{t.shotLabel}</label>
      <div className="url-row">
        <input
          id="page-url"
          type="url"
          inputMode="url"
          placeholder={t.shotHint}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
        />
        <button className="ticket" type="submit" disabled={busy || waiting || url.trim().length < 8}>
          {t.shotButton}
        </button>
      </div>
      {siteKey && <div ref={box} className="turnstile" />}
      {waiting && !notice && !blocked && <p className="shot-wait">{t.shotVerifying}</p>}
      {blocked && url.trim().length >= 8 && <p className="score-note">{t.errorCaptcha}</p>}
      {notice === "verify" && <p className="score-note">{t.errorVerify}</p>}
      {notice === "busy" && <p className="score-note">{t.errorBusy}</p>}
      {notice === "generic" && <p className="score-note">{t.errorShot}</p>}
    </form>
  );
}
