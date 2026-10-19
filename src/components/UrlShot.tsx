import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

interface TurnstileApi {
  render: (el: HTMLElement, options: { sitekey: string; theme: "light" }) => string;
  getResponse: (id?: string) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
}

export function UrlShot({ onFile }: { onFile: (file: File) => void }) {
  const endpoint = import.meta.env.VITE_SHOT_ENDPOINT;
  const siteKey = import.meta.env.VITE_TURNSTILE_SITEKEY;
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!endpoint || !siteKey || !box.current) return;
    let dead = false;
    const mount = () => {
      const turnstile = (window as Window & { turnstile?: TurnstileApi }).turnstile;
      if (dead || !turnstile || !box.current || widget.current) return;
      widget.current = turnstile.render(box.current, { sitekey: siteKey, theme: "light" });
    };
    if ((window as Window & { turnstile?: TurnstileApi }).turnstile) {
      mount();
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.dataset.turnstile = "1";
      script.onload = mount;
      script.onerror = () => setFailed(true);
      document.head.appendChild(script);
    }
    return () => {
      dead = true;
    };
  }, [endpoint, siteKey]);

  if (!endpoint) return null;

  const submit = async () => {
    setFailed(false);
    setBusy(true);
    try {
      const token = widget.current
        ? (window as Window & { turnstile?: TurnstileApi }).turnstile?.getResponse(widget.current) ?? ""
        : "";
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
      console.error("shot", err instanceof Error ? err.message : "shot");
      setFailed(true);
    } finally {
      setBusy(false);
      if (widget.current) (window as Window & { turnstile?: TurnstileApi }).turnstile?.reset(widget.current);
    }
  };

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
        <button className="ticket" type="submit" disabled={busy || url.trim().length < 8}>
          {t.shotButton}
        </button>
      </div>
      {siteKey && <div ref={box} className="turnstile" />}
      {failed && <p className="score-note">{t.errorShot}</p>}
    </form>
  );
}
