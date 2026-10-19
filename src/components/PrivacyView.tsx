import { useEffect } from "react";

export function PrivacyView() {
  useEffect(() => {
    document.title = "Privacy — Twinsites";
  }, []);
  return (
    <article className="privacy-page">
      <p className="kicker">Twinsites</p>
      <h1>Privacy</h1>
      <p>
        If you ask for the monthly report, Twinsites keeps the email address you type. That is the only thing this form collects.
      </p>
      <p>The address is used to send the monthly Twins report and a redesign prompt. Nothing else.</p>
      <p>
        The list lives in Cloudflare Workers KV. The key is a hash of the address. The record holds the address, the time you signed up, and the version of the consent sentence you checked.
      </p>
      <p>The list is not sold and not shared.</p>
      <p>Every message has an unsubscribe link. Opening it deletes that record.</p>
      <p>
        A screenshot you upload never leaves your browser. A URL you paste is visited by the Cloudflare worker to take one screenshot, which is not stored.
      </p>
      <p>
        Questions: <a href="mailto:twinsites.dev@gmail.com">twinsites.dev@gmail.com</a>
      </p>
    </article>
  );
}
