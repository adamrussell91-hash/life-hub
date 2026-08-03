# Life Hub

Private, read-only personal dashboard. Records are logged elsewhere (chatting directly with Claude, which writes to the private data repository via its GitHub connector) — this app only displays what's already in the repo.

## Current slice

The site is hosted on **GitHub Pages** (via `.github/workflows/pages.yml`, on every push to `main`). **Netlify hosts nothing but the API Functions** — the GitHub token, passphrase verifier, and session secret live only there, never in the deployed site. The two are different origins by design; every `/api/*` call is a cross-origin request from the GitHub Pages site to the Netlify Functions site, with an explicit `SITE_ORIGIN` allow-list and `credentials: 'include'` carrying the session cookie across.

The read-only Home PWA is gated by a single-user passphrase and syncs allowlisted Markdown records from a private GitHub repository through those Functions. The browser receives only bounded manifest and file responses; it never receives the GitHub token, passphrase verifier, session secret, or unrestricted repository access.

Local development uses a fixture-backed mock of the same `/api/*` contract, served from the same local origin as the site (no cross-origin setup needed for `npm run dev`). Offline-aware sync is implemented; domain detail views arrive in a later phase.

The build (`npm run build`) copies only the browser shell, styles, application modules, icons, manifest, service worker, and generated `js-yaml` runtime into `dist/` — this is what both local dev and GitHub Pages serve. Repository Markdown, configuration, tests, scripts, dotfiles, and Netlify Function source are outside it.

## Run locally

Requires Node.js 22 or later.

```bash
npm ci
npm run dev
```

Open the local URL printed in the terminal.

The local-only passphrase is `life-hub-local`. It is isolated to the mock server and tests and is not a production credential. Local repository reads use checked-in fixtures and never contact GitHub.

To inspect the same static artifact Netlify publishes without starting the server:

```bash
npm run build
```

## Deploy

**The site: GitHub Pages.** In this repo's Settings → Pages, set Source to "GitHub Actions" — `.github/workflows/pages.yml` builds and publishes `dist/` on every push to `main`. No secrets involved; this repo is public and contains only application code, never production credentials or the private data repo's contents.

**The API: Netlify Functions only.** Netlify never serves the site itself — `netlify.toml`'s publish directory is a one-line placeholder (`netlify/public`), and only `netlify/functions` is deployed. Create a Netlify site pointed at this repo (Add new site → Import from Git); its own `.netlify.app` URL is never linked to from anywhere.

Generate a scrypt passphrase verifier and an independent random session secret in an interactive terminal:

```bash
npm run generate:auth
```

The command prompts twice without echoing the passphrase, then prints `LIFE_HUB_PASSPHRASE_HASH` and `SESSION_SECRET` assignments. Copy those values directly into the Netlify environment; do not commit them or save them in `.env.example`.

Create a fine-grained GitHub personal access token scoped to the one private Life Hub **data** repository (a separate repository from this one) with **Contents: Read-only** permission. Set these seven environment variables in Netlify:

```text
LIFE_HUB_PASSPHRASE_HASH=<generated verifier>
SESSION_SECRET=<generated random secret>
GITHUB_REPOSITORY=<owner/private-data-repository>
GITHUB_BRANCH=<branch name>
GITHUB_TOKEN=<fine-grained read-only token>
GITHUB_TOKEN_EXPIRES=<YYYY-MM-DD>
SITE_ORIGIN=<https://your-username.github.io>
```

`SITE_ORIGIN` is the exact origin GitHub Pages serves this site from (protocol + host, no path, no trailing slash). Every Function checks incoming requests' `Origin` header against it before doing anything else; requests from any other origin are rejected, and only this one origin is echoed back in `Access-Control-Allow-Origin`.

Use `.env.example` only as a symbolic checklist. This branch and its pull request deliberately contain no production credentials, and production providers remain disconnected until deployment review.

`GITHUB_TOKEN_EXPIRES` is required and must be a real calendar date. Health treats the token as expired from the start of that date in `Australia/Sydney` (`expiry <= today`), and reports an upcoming expiry during the preceding fourteen Sydney calendar days.

**Point the site at the Functions.** Once the Netlify site exists, edit `js/app/config.js`'s `API_BASE_URL` to that site's URL (e.g. `https://your-site-name.netlify.app`) and commit it — this isn't a secret, just where the API lives, and the site won't be able to reach it otherwise.

After deploying, inspect the Netlify deploy log and confirm it registered the `/api/auth` code-based rate limit: five requests per 60 seconds, aggregated by IP and domain. Do not promote a deploy if that rule is absent.

## Verify

Run the unit and integration suite plus fixture validation:

```bash
npm test
npm run validate:fixtures
```

For desktop, 390 px mobile, navigation, and offline browser acceptance:

```bash
npx playwright install chromium
npm run test:browser
```

The approved fixture Home values are 1,130 calories, 80 g protein, 27 g fat, a completed 30-minute workout, a workout streak of 1, and 3 of 5 logging categories complete.
