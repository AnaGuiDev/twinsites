# Twinsites Studio

The free product keeps the on-device visual twins, OCR, map, comparison and sharing. It adds an explainable `editorial-v1` Slop Score, category-by-category evidence, unknown checks, manual overrides, prioritized fixes, one implementation prompt per fix and a downloadable Markdown report. `/guide`, `/sample-audit` and `/services` explain the next steps in English and Spanish.

## What the score means

Weights: likeness 30, centered hero 5, violet/blue gradient 10, three emoji cards 10, bento without hierarchy 10, decorative glass 5, serif italic 5, stock phrases 15, unsupported social proof 10. Total 100. Visual likeness is linear between pair-percentiles 80 and 100. OCR adds five points per distinct cliché, capped at 15. A manual review can override a finding. Unknowns are shown separately with coverage and the possible final range; they are never reported as passes.

This is an editorial heuristic, **not** a validated AI-authorship detector or an expert quality rating. The existing screenshot gradient/bento/density rules failed reliability checks and are deliberately not used to assert those tropes. Those checks require a person. A screenshot cannot establish fabricated testimonials or logo permissions. The sample report is clearly fictional; there is no invented customer video.

## Offer and fulfillment

Audit: $30 USD + $10 per extra public page, 1–10 pages. Optional demand pricing uses the number of **paid audit orders awaiting delivery**: 0–1 gives $20, 2–4 gives $30, 5+ gives $40. Extras stay $10. The server owns pricing and rejects stale client quotes. Prices are fixed once checkout starts.

Audit delivery: 72 weekday hours from verified payment, with all public URLs supplied at checkout. Weekdays run all 24 hours Monday–Friday in UTC; there is no holiday calendar. Includes a video recorded by the reviewer, a prioritized report with individual prompts, and a human measurement 30 calendar days after delivery. Under five useful changes entitles the customer to request a refund while keeping the video. No Figma, implementation, logged-in page or app work is included in the audit.

Redesign: a quote request, then a manually agreed $1,000–$10,000 scope. A matching customer's non-refunded audit payment can be credited once. An audit credit is reserved when a quote is issued; cancel the unpaid quote to release it. A credited audit cannot be refunded separately until that quote is cancelled. Redesign delivery follows its agreed scope, not the audit's 72-hour deadline. Review taxes, business identity, consumer terms and operational capacity for your actual market before opening sales; the code does not calculate tax or invent a company identity.

## Configure (sales are closed by default)

1. Install Worker dependencies: `npm ci --prefix worker`.
2. Review the existing Cloudflare account/KV configuration. Deploy the Worker with its new SQLite Durable Object `AuditService` migration in `worker/wrangler.toml`. This is independent of the static-site deployment. Do not point a test deployment at production storage.
3. Set Worker secrets through Wrangler, never in source: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SERVICES_ADMIN_TOKEN` (at least 32 random characters), `RESEND_API_KEY`. Set `SERVICE_CONTACT` to the responsible studio email and `SERVICE_FROM` to an address on a verified Resend sending domain. Use Stripe **test mode** first.
4. Configure Stripe webhooks at `https://<worker>/services/webhook`, subscribing to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Events must use the signing secret for that endpoint. An order is paid only after a valid signed event with matching session, USD amount and `paid` status. Card-only Checkout avoids unresolved delayed-payment flows. Returning to `/order` does not imply payment.
5. Build the frontend with `VITE_SERVICES_ENDPOINT=https://<worker>` (or reuse `VITE_SHOT_ENDPOINT`). The nginx CSP must permit that exact origin in `connect-src`; the default Worker origin already does. No Stripe JS or embedded payment iframe is needed. Stripe-hosted checkout handles card data.
6. Verify checkout, signed events, mail, operator handoff, delivery, refund and recheck in test mode. Then set `SERVICES_ENABLED=1`. Set `SERVICES_DYNAMIC_PRICE=1` only if you want demand pricing. Missing credentials keep both booking forms closed.
7. Optional marketing: set frontend `VITE_FEEDBACK_X_HANDLE` to your own studio handle. The public feedback CTA prepares a post in X; the visitor reviews and submits it. No posts or replies are sent automatically, and there is no guarantee of free review or a response time.

`/services/offer` returns the current authoritative offer. `/services/orders` creates an order with a client-generated UUID for retries. Audit checkout goes to Stripe; redesign requests are free. Three new orders per IP/hour and 100/day are enforced by the serialized Durable Object. Raw IPs are not stored. They are hashed with an hourly salt derived from the admin secret; counters are pruned after two hours.

## Operate

Set `SERVICES_ENDPOINT` and `SERVICES_ADMIN_TOKEN` in your operator shell. `node scripts/studio.mjs` lists orders and the email outbox. A JSON file argument submits one action. **The refund action issues a real refund when live credentials are configured.** The CLI never asks for or prints the admin secret.

Deliver an audit after you have recorded and uploaded the actual video and report:

```json
{"id":"ORDER_UUID","action":"deliver","videoUrl":"https://your-video-host.example/review","reportUrl":"https://your-report-host.example/report-with-prompts","usefulChanges":5}
```

Upload the new measurement and complete the 30-day follow-up:

```json
{"id":"ORDER_UUID","action":"recheck","recheckUrl":"https://your-report-host.example/new-measurement"}
```

Issue an agreed redesign quote (gross USD integer; optional audit credit):

```json
{"id":"REDESIGN_ORDER_UUID","action":"quote","gross":2000,"auditId":"AUDIT_ORDER_UUID"}
```

Other actions: `cancel-quote` expires the unpaid Stripe session before releasing its audit credit; `retry-checkout` recovers a provider timeout without issuing another order; `complete-redesign` requires `reportUrl` with the project handoff; `refund` issues a full Stripe refund for a paid order and preserves delivered video/report links. Never mark a manual dashboard refund as fulfilled without reconciling the application record: this version expects refunds through the operator endpoint. Failed/pending refunds remain visible for manual reconciliation rather than being falsely marked refunded.

Orders, accepted terms and delivery references persist for 400 days. Private status links carry a random 256-bit bearer token in the fragment (not in the request URL or referrer). Anyone with the link can view status and deliverables, but cannot list customers or operate the service. Keep uploaded report/video links private and use an appropriate host. The operator endpoint lists customer data and requires the admin secret.

Emails use a persistent outbox, stable provider idempotency keys and up to ten hourly attempts. Inspect the outbox for exhausted messages; after reconciling provider delivery, the authenticated `retry-mail` action with the full `mail:...` record ID can requeue one message. the code does not claim delivery merely because it was queued. An hourly Durable Object alarm notifies the operator when a recheck is due; **a human still performs and delivers the new measurement**. No fake video or auto-generated human review is sold. Resend retains idempotency keys for a limited period; ambiguous provider outcomes need operator reconciliation.

## Validation

`npm run test:product`, `npm run test:worker`, `npm run typecheck:worker`, `npm run build`. Tests use fake Stripe/Resend responses and memory storage, never live charges or emails. The PR workflow runs these checks; the existing static deploy remains main-only. Browser checks should verify home → sample → services, score overrides, individual prompts, the closed-booking state and mobile layout. Full integration also requires a Cloudflare/Stripe test deployment.


Implementation validation: production frontend build, frontend and Worker TypeScript checks, 43 unit/integration tests across product and Worker, and Wrangler Worker bundle dry-run. Browser inspection verified the existing catalog result alongside Slop Score, a manual signal changing 28→38 with coverage 35→45%, the individual prompt, fictional sample report and closed booking state. Live Stripe/Resend/Cloudflare integration and mobile browser QA remain activation checks; no real payments, emails, posts or production deployments were performed.
