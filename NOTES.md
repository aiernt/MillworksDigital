# Millworks Digital — project notes

Live site: https://www.millworksdigital.com (also https://millworksdigital.com)
Repo: https://github.com/aiernt/MillworksDigital (public, branch `main`)
Hosting: Cloudflare Worker `millworksdigital` (Workers Static Assets + `worker/index.js`)

## How it deploys
Push to `main` → Cloudflare Workers Builds runs `npx wrangler deploy` → live in ~30 seconds.
A "Workers Builds: millworksdigital" check appears on the commit in GitHub.
If a push doesn't build: check github.com/settings/installations → Cloudflare Workers and Pages →
Repository access includes MillworksDigital (this was the cause the first time).

## Files
- `index.html` — the whole site (HTML, CSS, JS in one file).
- `images/` — `millstone.webp` (hero + About diagram), `millstone-mark.webp` (header/footer logo), work screenshots.
- `favicon-32.png`, `apple-touch-icon.png` — tab and home-screen icons.
- `worker/index.js` — `/api/contact`: hands out the math question (GET) and sends the form through Resend (POST).
- `wrangler.jsonc` — Worker config; only `/api/*` runs the worker.
- `.assetsignore` — keeps worker, config, backups, tools and *.md off the public site.
- `backups/` — earlier versions of the page (green site, quarter-dress stone, grey Webb's Mill stone).
- `tools/millstone/` — generator for the stone images (see below).

## Cloudflare settings (Worker → Settings → Variables and Secrets)
- `RESEND_API_KEY` (secret) — Millworks' own Resend account (not AudioVox's).
- `CONTACT_TO` — hello@millworksdigital.com
- `CONTACT_FROM` — Millworks Digital Website <website@millworksdigital.com> (domain verified in Resend)
- `FORM_SECRET` (optional) — signs math questions; falls back to RESEND_API_KEY.
Local testing: put the same values in `.dev.vars` (git-ignored) and run `npx wrangler dev`.

## Contact form
Fields: needs (chips), name*, email*, phone, business (optional), notes, math question*.
Spam protection: hidden honeypot field `website` (bots get a fake "sent"), a server-signed math
question (token = issue time + HMAC of the answer), and submissions under 3 s or over 2 h are refused.
Email arrives with Reply-To set to the visitor. If sending fails, the page shows the email and phone instead.
Contact details on the page: hello@millworksdigital.com, 803-820-1664.

## Design
- Palette: deep pine bands (`--pine #163a2e`), flour-white sections, gold accent `--gold #e3ac52`. Light + dark themes.
- Fonts (Google): Bricolage Grotesque (headings/UI), Newsreader (body).
- Layout is fluid; one switch to the phone layout at 760px (plus small tweaks at 560/480px).
- Hero: stone sits beside the headline; overlap scales with width:
  `translate: calc(-1 * clamp(0px, 24.8vw - 162px, 200px)) 0`.
- Stone spin: turns with scroll at 0.04°/px, capped at 60°/s, coasts to a stop; off for reduced-motion users.
- About section: numbered diagram of the stone (eye, furrows, lands, skirt) with hover/tap highlights.

## The millstone image
Modeled on the Webb's Mill millstone on display in Fort Mill: 8 harps of straight furrows, small eye,
weathered gold-to-rust stone (desaturated 25%), no cracks. Rendered procedurally:
1. Open `tools/millstone/render.html` in headless Edge with `--dump-dom`; it writes WebP data URLs
   for the big image (1440px) and the logo mark (256px) into the page.
2. Decode those into `images/millstone.webp` and `images/millstone-mark.webp`.
Furrow layout lives in `geometry.js`; colour/weathering knobs are the options passed to `render()`
(`desat`, `weather`, `cracks`, `speck`, …). The About diagram's pin positions depend on `geometry.js`
— if the layout changes, recompute them.

## Optional / later
- Worker Previews (Cloudflare banner) — preview URLs for non-main branches; not needed.
- If spam gets through: add Cloudflare Turnstile or a rate-limit rule.
- Nice-to-haves: social share image (Open Graph), a LICENSE.
