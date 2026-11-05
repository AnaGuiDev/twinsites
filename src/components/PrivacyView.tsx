import { useEffect } from "react";

export function PrivacyView() {
  useEffect(() => {
    document.title = "Privacy — Twinsites";
  }, []);
  return (
    <article className="privacy-page">
      <h1>Privacy</h1>
      <h2>Human audits and redesign requests</h2>
      <p>Only when you submit a service order, we store your email, public page URLs, brief, accepted terms, price, payment references, delivery links and dates in a Cloudflare Durable Object for up to 400 days. Screenshots used by the free check remain in your browser; submitting an order does not upload them.</p>
      <p>Stripe processes payment details on its hosted checkout. Resend delivers order emails. Payment and email providers retain their own records under their policies. Order emails are transactional, not a marketing subscription. A human reviewer visits the public URLs you provide. Do not submit passwords, confidential information or pages behind a login.</p>
      <p>The private order link contains an access token. Anyone with that link can read the order status and delivery links. Keep it private. Reply to an order email to request access, correction, deletion or a guarantee refund. Payment records may have separate retention obligations.</p>
      <h2>Free check and newsletter</h2>
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
        Your last screenshot check (its scores and a small preview) is kept in this browser's local storage so the next
        version of your page can be compared with it. It never leaves the browser, and the result page has a link to forget
        it.
      </p>
      <p>
        Reading the words on your screenshot and comparing competitors' screenshots both happen in this browser. The text
        reader and its language data are downloaded from this site; nothing is sent back.
      </p>
      <p>
        If you correct a trait and tick the box to send it, Twinsites receives which trait, what it read, what you chose,
        six rounded measurements of the screenshot and the day. Not the image, the URL, your IP address or any cookie. To
        stop abuse, a counter keyed by a salted hash of your IP for the current hour exists for up to two hours and is
        never stored with the correction. Corrections are kept for up to 400 days to tune the rules.
      </p>
      <p>
        There are no cookies. If a visit counter is on, it records only aggregate events: a visit, an example, an upload, a
        result, a share, pointing at or opening a page on the wall, copying the redesign prompt, comparing with a previous check.
      </p>
      <p>
        Questions: <a href="mailto:twinsites.dev@gmail.com">twinsites.dev@gmail.com</a>
      </p>
    </article>
  );
}
