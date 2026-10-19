# Screenshot worker

This Worker takes one 1440×900 screenshot of a public https page and returns the bytes. It does not store the image. It is **not** deployed by this repository, and it does not run on the Twinsites VPS. The VPS keeps serving only the static `dist/` files.

Nothing here creates a Cloudflare account. The steps below are what you do, by hand, when you want the URL box on the site.

## 1. Account, with 2FA

1. Create or open a Cloudflare account.
2. Turn on two-factor authentication: dashboard → **My Profile** → **Authentication**.
3. The site itself stays on the VPS. This account is only for the Worker.

## 2. Turnstile

1. Dashboard → **Turnstile** → **Add widget**.
2. Add the hostname `twinsites.com`.
3. Copy the **site key** (public) and the **secret key**.

The page at twinsites.com sends `Cross-Origin-Embedder-Policy: require-corp`. Turnstile's script is loaded from `challenges.cloudflare.com`. If the widget does not appear, the form shows the same gentle error as a failed shot and points people at the example or an upload. The comparison still works without the URL box.

## 3. KV namespace

From this directory:

```bash
npx wrangler kv namespace create SHOTS
```

Paste the printed id into `wrangler.toml` in place of `replace-with-kv-namespace-id`. The namespace stores only counters: one per IP per hour, and one global count per UTC day. It does not store URLs or images.

## 4. Browser Rendering

The default provider is Cloudflare Browser Rendering, now documented as **Browser Run**, via the `@cloudflare/puppeteer` binding in `wrangler.toml`.

It **is** on the Workers Free plan, with a small included quota. From the [Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/) page (updated April 2026):

| | Workers Free | Workers Paid |
| --- | --- | --- |
| Browser hours | 10 minutes per day | 10 hours per month, then $0.09 per extra hour |
| Concurrent browsers | 3 | 10 included, then $2 per extra concurrent browser |

Free-plan sessions also have tighter rate limits (a new browser about every 20 seconds, 60 second timeout). See [Limits](https://developers.cloudflare.com/browser-run/limits/). Puppeteer usage is described in [Puppeteer](https://developers.cloudflare.com/browser-run/puppeteer/).

`SHOT_DAILY_CAP` defaults to **40**, which is about 80% of what 10 minutes a day can cover if each shot takes ~15 seconds. At 80% of that cap the Worker refuses new shots on its own. Raise the cap only if you move to Workers Paid and accept the meter.

Set the binding name `BROWSER` as it already is in `wrangler.toml`. In the dashboard this is a Browser binding on the Worker.

### External screenshot API, off unless you switch it

`SHOT_PROVIDER=browser` is the default. To use ScreenshotOne instead:

1. Set the var `SHOT_PROVIDER` to `api` (`npx wrangler secret` is not required for a var; `npx wrangler versions secret` is wrong here — put it in the dashboard as a plain var, or `wrangler.toml` `[vars]`).
2. Store the key only as a secret:

```bash
npx wrangler secret put SHOT_API_KEY
```

The Worker then fetches **only** `https://api.screenshotone.com/take`, with redirects disabled. It never requests the visitor's URL itself in that mode. The key is not written to logs or to the response.

## 5. Secrets and the kill switch

```bash
npx wrangler secret put TURNSTILE_SECRET
```

Paste the Turnstile secret when prompted. Do not put it in `wrangler.toml`.

`SHOT_KILL` is a plain var. Set it to `1` (dashboard → Worker → Settings → Variables, or `[vars]` in `wrangler.toml`) to refuse every shot without deleting anything else. `0` leaves the feature on, still subject to the caps.

## 6. Deploy (you do this, not the repo)

```bash
npm install
npx wrangler deploy
```

Note the `*.workers.dev` URL, or attach a route of your own. No step here SSHes to the VPS or edits nginx.

## 7. Show the box on twinsites.com

The box is hidden unless the **site** build saw `VITE_SHOT_ENDPOINT`. In the GitHub repo:

1. Settings → Secrets and variables → Actions → **Variables**.
2. Add `VITE_SHOT_ENDPOINT` = the Worker URL, for example `https://twinsites-shot.<account>.workers.dev`.
3. Add `VITE_TURNSTILE_SITEKEY` = the Turnstile site key.

The deploy workflow passes those variables into `npm run build`. They are empty when unset, so a push to `main` keeps shipping the site with the URL box hidden. The VPS still only receives `dist/`.

Push to `main` (or re-run the deploy workflow) so the new static files include the box. The Worker must already be answering, with Turnstile, KV, and the browser binding in place.

## What the Worker refuses

- Anything that is not `https`, including `http://`.
- IP literals (`127.0.0.1`, `2130706433`, `0x7f000001`, `[::1]`), localhost, `.local`, and a few well-known rebinding suffixes.
- Any port other than 443.
- URLs longer than 2048 characters, and URLs with a username or password.
- Hostnames that resolve to a private, loopback, link-local, or metadata address (checked with DNS-over-HTTPS against `cloudflare-dns.com` only).
- In browser mode, subrequests to those same ranges are aborted.
- In API mode, any redirect from ScreenshotOne is discarded.
- Responses that are not PNG or JPEG, or that exceed 3 MB.
- A hard timeout of about 15 seconds.
- More than 5 shots per IP per hour, or a global day that has reached 80% of `SHOT_DAILY_CAP`.
- A missing or bad Turnstile token.
- `SHOT_KILL=1`.

Logs contain an event name and, at most, the hostname. They do not contain the full URL or the API key.
