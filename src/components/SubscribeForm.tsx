import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { track } from "../lib/analytics";

const CONSENT_VERSION = "2026-10-19";

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
}

function turnstileApi(): TurnstileApi | undefined {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

function subscribeUrl(): string | null {
  const shot = import.meta.env.VITE_SHOT_ENDPOINT;
  if (!shot) return null;
  try {
    const url = new URL(shot);
    url.pathname = "/subscribe";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function SubscribeForm() {
  const endpoint = subscribeUrl();
  const siteKey = import.meta.env.VITE_TURNSTILE_SITEKEY;
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<"error" | "verify" | "busy" | null>(null);

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
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
    };
    if (turnstileApi()) mount();
    else {
      const existing = document.querySelector("script[data-turnstile]");
      if (existing) {
        existing.addEventListener("load", mount);
        return () => {
          dead = true;
        };
      }
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.dataset.turnstile = "1";
      script.onload = mount;
      document.head.appendChild(script);
    }
    return () => {
      dead = true;
    };
  }, [endpoint, siteKey]);

  if (!endpoint) return null;

  const resetWidget = () => {
    setToken("");
    if (widget.current) turnstileApi()?.reset(widget.current);
  };

  const submit = async () => {
    setNotice(null);
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, consent: true, consentVersion: CONSENT_VERSION, token }),
      });
      if (!response.ok) throw new Error(String(response.status));
      track("subscribe");
      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "subscribe";
      console.error("subscribe", message);
      if (message === "403") setNotice("verify");
      else if (message === "429" || message === "503") setNotice("busy");
      else setNotice("error");
    } finally {
      setBusy(false);
      resetWidget();
    }
  };

  if (done) {
    return (
      <section className="list-note">
        <h2>{t.listTitle}</h2>
        <p className="list-success">{t.listSuccess}</p>
      </section>
    );
  }

  const waiting = Boolean(siteKey) && !token;

  return (
    <section className="list-note">
      <h2>{t.listTitle}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="list-label" htmlFor="list-email">
          {t.listEmail}
        </label>
        <input
          id="list-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label className="list-consent">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
          <span>
            {t.listConsent}{" "}
            <a href="/privacy">{t.listPrivacy}</a>
          </span>
        </label>
        {siteKey && <div ref={box} className="turnstile" />}
        {waiting && !notice && <p className="shot-wait">{t.shotVerifying}</p>}
        <button className="ticket" type="submit" disabled={busy || waiting || !consent || email.trim().length < 6}>
          {t.listSend}
        </button>
        {notice === "verify" && <p className="score-note">{t.errorVerify}</p>}
        {notice === "busy" && <p className="score-note">{t.errorBusy}</p>}
        {notice === "error" && <p className="score-note">{t.listError}</p>}
      </form>
    </section>
  );
}
