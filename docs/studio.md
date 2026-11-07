# Twinsites launch: free diagnosis and a paid human service

This replaces the v1 proposal in #17. It is a concrete implementation for a commercial launch, not a promise that live payments have been activated. No production deploy, live charge, email or social post has been executed by this change.

## Product and offer

The homepage uses real catalog screenshots and the existing monochrome/yellow identity. The paid product is a human review, independent of the vision model: public URLs and a brief are enough to book. Default proposed price is **€89 inclusive of applicable tax for one page, €29 per additional page, up to three pages**. There is no subscription or demand pricing. Review this proposal as the seller before opening checkout; these amounts are not copied from the competitor.

Scope: recorded walkthrough, prioritized report, three main changes with implementation prompts, and a human follow-up 30 days after delivery. Implementation and Figma are not included. Redesign is separately scoped and quoted; a matching non-refunded audit can be credited once. Default capacity is two audit bookings per UTC calendar week. No invented clients, testimonials, videos, conversion uplift or fake scarcity are shown. The old 14→0 marketing claim is removed from the home; the fictional before/after is presented as a visual example rather than a calibrated performance promise.

Delivery is five weekdays from the agreed start, counted as 120 weekday hours in UTC, Monday–Friday without excluding holidays. Without an early-start request, the server waits 14 calendar days from confirmed payment before starting consumer work. The independent early-start checkbox explains proportional work and full-performance conditions. This choice, seller snapshot and version `twinsites-services-v2` are stored with the order. Cancellation can be requested from the private order page; receipt is acknowledged, and a human determines the applicable refund. A request is not falsely marked as a completed refund.

## Two separate results

Visual twins remain an indicative catalog comparison, with a visible calibration notice until `quality/model-release.json` is supported by actual evidence. The current technical candidate ships an FP16/two-crop model and a catalog rebuilt from 2,003 committed desktop thumbnails. Its 60 unique pair labels are AI annotations, not human validation. Independent review and physical mobile testing remain pending; see [the current release evidence](release-candidate.md). The earlier q8 implementation described in PR #18 has been superseded in this candidate.

`editorial-v2` does **not** turn similarity or a centered hero into slop points. It scores reviewed editorial signals: purple/blue decoration 15, emoji cards 15, bento without hierarchy 15, glass 10, serif italic 10, clichés 20 and unsupported social proof 15. Only OCR contributes automatically; the other checks require review because the existing image rules failed reliability checks. Unknowns never pass silently. Below 80% weighted coverage the headline and export say Partial and suppress the overall number. That threshold is a display policy, not scientific validation. The diagnosis is never sold as proof of AI authorship or quality.

## Public identity and legal activation

Brand, footer and presentation remain Twinsites / Ana Gui. No real personal identity is filled in from chat memory. Public seller fields are returned only when `SELLER_PUBLICATION_APPROVED=1` and complete data are configured. They are deliberately empty here. The legal notice, terms, withdrawal information/model notice and privacy pages use this approved configuration. While missing, they say booking is unavailable and do not impersonate a legal entity.

To activate the same build from launch day, the owner must configure and verify:

- `SERVICE_CONTACT`, `SERVICE_FROM` and a responsible human operator; set `SERVICE_OPERATOR_CONFIRMED=1` after confirming the actual service capacity.
- Seller-controlled `SELLER_LEGAL_NAME`, `SELLER_TAX_ID`, `SELLER_ADDRESS`, `SELLER_COUNTRY`. The owner must decide who contracts and invoices, approve publication, and review the public surfaces before setting `SELLER_PUBLICATION_APPROVED=1`.
- Review the terms/privacy against the actual business, consumer market, service providers and obligations. `SERVICE_LEGAL_REVIEWED=1` is an owner attestation, not a substitute for legal advice or a certification produced by code.
- Stripe live/test credentials and webhook secret; configure Stripe Tax registrations, tax category, account legal details, terms and privacy URLs, and billing/invoice requirements for the actual seller. Set `SERVICE_TAX_CONFIGURED=1` only after testing the actual tax cases. Stripe invoices do not by themselves prove Spanish fiscal/VeriFactu compliance.
- Configure Resend and a verified sender domain. Set `SERVICES_ENABLED=1` only after the deployed test flow works. There is no hidden beta flag or need to alter source to open sales.

All of these default off in `worker/wrangler.toml`. Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SERVICES_ADMIN_TOKEN` (32+ random characters), `RESEND_API_KEY`. Optional price/capacity configuration: `SERVICE_PRICE_EUR`, `SERVICE_EXTRA_EUR`, `SERVICE_WEEKLY_CAPACITY`.

## Hosting and Stripe

Frontend: `VITE_SERVICES_ENDPOINT` (or existing `VITE_SHOT_ENDPOINT`) points at the Worker. Permit that exact origin in the production nginx CSP `connect-src`; the existing default Worker origin is already listed. New routes need the same SPA fallback as existing routes. Build-time legal stubs supply page metadata; runtime legal identity is loaded from the Worker. `/studio` and `/order` receive noindex metadata at runtime and contain no baked-in secrets.

The static main-only deploy does not deploy the Worker. Deploy its existing `AuditService` SQLite Durable Object migration separately in the correct Cloudflare account, using isolated test storage before production. Do not use production storage for a test deployment.

Stripe Checkout uses EUR, inclusive tax behavior, automatic tax, billing address and tax-ID collection, paid-invoice creation and required terms acceptance. Card details stay on Stripe. Register these webhooks:

- `checkout.session.completed` and `checkout.session.async_payment_succeeded`: verify raw-body signature, order/session/currency/amount and paid status, then atomically record payment and notification outbox.
- `checkout.session.expired`: release a pending slot only after the signed provider event. A local timeout never assumes a reservation is safe to release. Abandoned sessions use Stripe's default expiry. Monitor webhook delivery; missing expiry events can conservatively hold slots.
- `invoice.paid`: attach the matching hosted invoice to the private order page. Invoice events never independently mark an order paid.

The server owns the price and capacity. Concurrent reservations serialize in the Durable Object, including pending Checkout sessions. A refund before delivery releases the booking; delivered work still counts against capacity. Persistent request UUIDs and stable Stripe idempotency keys avoid duplicate sessions on retry; parameters, including any expiry setting, must remain stable across retries. Taxes causing a final amount that differs from the recorded all-in quote fail closed for reconciliation rather than silently fulfilling an unmatched price.

## Operator workflow

`/studio` is an authenticated work desk: load the agenda, inspect briefs/due dates/cancellation requests, register real video and report URLs and deliver the follow-up. The operator bearer credential stays in component memory, never in local storage, URLs or Vite variables. Sign out clears loaded customer data. Do not put customer reports at guessable public URLs without considering their access requirements.

For quotes, refunds and email recovery, use `node scripts/studio.mjs` with `SERVICES_ENDPOINT` and `SERVICES_ADMIN_TOKEN` in the operator shell. No argument prints or embeds the secret. A JSON file argument performs an action. **With live credentials, refund issues a real full refund.** Example bodies:

```json
{"id":"ORDER_UUID","action":"deliver","videoUrl":"https://your-host.example/private-video","reportUrl":"https://your-host.example/private-report","usefulChanges":3}
```

```json
{"id":"ORDER_UUID","action":"recheck","recheckUrl":"https://your-host.example/private-follow-up"}
```

```json
{"id":"REDESIGN_UUID","action":"quote","gross":2000,"auditId":"AUDIT_UUID"}
```

Other supported actions: `complete-redesign` with `reportUrl`, `cancel-quote` (expires the unpaid session before releasing credit), `retry-checkout`, `refund`, and `retry-mail` using its full `mail:...` outbox key. Confirm provider outcomes before manually retrying exhausted mail. Dashboard refunds outside this endpoint still require application reconciliation; that limitation is explicit, not evidence of a completed refund integration.

The outbox uses Resend idempotency keys and ten hourly attempts, then remains visible to the operator. The hourly Durable Object alarm notifies the operator when follow-up is due. A human does the review. Operational records are removed after 400 days; fiscal retention in billing systems follows the actual seller's obligations. The order bearer is held in the fragment and session storage for recovery, not query strings. Never share an order link publicly.

## Research and legal basis

The browser review on 7 November 2026 reached Anti Web Slop's home, legal page, sample report and first audit form step after text retrieval failed. No form was submitted or payment tested. Findings and verified page URLs are recorded in [the direct competitor review](anti-web-slop-review.md). The review found additional automated products in the legal page; these are not evidence that Twinsites should sell an insufficiently covered automated score. No competitor copy or visual assets were imported.

Primary references used to design the interfaces (not a legal opinion):

- [Spanish consumer withdrawal rules, especially articles 102, 103 and 108](https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555).
- [LSSI seller information](https://lssi.digital.gob.es/lssi/empresas).
- [AEAT invoice contents](https://sede.agenciatributaria.gob.es/Sede/iva/facturacion-registro/facturacion-iva/contenido-facturas.html).
- [Stripe account setup and public business information](https://docs.stripe.com/get-started/account/set-up).
- [Stripe receipts and invoices](https://docs.stripe.com/receipts).
- [Stripe Checkout Sessions create API](https://docs.stripe.com/api/checkout/sessions/create).

## Verification and what remains external

Run `npm run test:product`, `npm run test:worker`, `npm run typecheck:worker`, `npm run build` and Wrangler `deploy --dry-run` with the Worker config. Unit/integration tests use memory storage and provider mocks; no charge or email is sent. Browser QA covers desktop home, bilingual service offer, totals, partial diagnosis and legal routes. Native mobile QA and a deployed Stripe/Cloudflare/Resend test purchase remain external activation checks. Test tax-inclusive B2C, applicable B2B/exempt cases, duplicate events, expiry, actual delivery, cancellation and refund before switching to live credentials.

The product code is prepared for a paid human launch independently of the model. It has **not** been enabled for actual sales: seller identity/publication, legal/tax configuration, credentials and external end-to-end testing are still required. Model calibration remains a separate prerequisite to any claim that the automated visual comparison is validated.

Recorded local results for this launch change: 49 tests passed (5 product + 44 Worker), frontend and Worker TypeScript checks passed, production build passed and Wrangler bundle dry-run passed. Browser checks verified EN/ES home and services, 1→3 page selection (€89→€147), disabled checkout without seller setup, the withdrawal route and a catalog result with visual twins plus an unscored Partial diagnosis. Screenshot: [desktop home](launch-home.png). No native mobile or deployed-provider result is claimed.
