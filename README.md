# Life Hub

Private personal dashboard and conversational logging application.

## Current slice

The read-only Home PWA is gated by a single-user passphrase and syncs allowlisted Markdown records from a private GitHub repository through same-origin Netlify Functions. The browser receives only bounded manifest and file responses; it never receives the GitHub token, passphrase verifier, session secret, or unrestricted repository access.

Local development uses a fixture-backed mock of the same `/api/*` contract. Chat with routed agents, confirmable record writes, and offline-aware sync are implemented; domain detail views arrive in a later phase.

Both local development and Netlify serve the generated `dist/` artifact. The build copies only the browser shell, styles, application modules, icons, manifest, service worker, and generated `js-yaml` runtime. Repository Markdown, configuration, tests, scripts, dotfiles, and Netlify Function source are outside the public directory.

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

## Configure a Netlify preview

Generate a scrypt passphrase verifier and an independent random session secret in an interactive terminal:

```bash
npm run generate:auth
```

The command prompts twice without echoing the passphrase, then prints `LIFE_HUB_PASSPHRASE_HASH` and `SESSION_SECRET` assignments. Copy those values directly into the Netlify environment; do not commit them or save them in `.env.example`.

Create a fine-grained GitHub personal access token scoped to the one private Life Hub repository with **Contents: Read-only** permission. Set these six environment variables in Netlify:

```text
LIFE_HUB_PASSPHRASE_HASH=<generated verifier>
SESSION_SECRET=<generated random secret>
GITHUB_REPOSITORY=<owner/private-repository>
GITHUB_BRANCH=<branch name>
GITHUB_TOKEN=<fine-grained read-only token>
GITHUB_TOKEN_EXPIRES=<YYYY-MM-DD>
```

Use `.env.example` only as a symbolic checklist. This branch and its pull request deliberately contain no production credentials, and production providers remain disconnected until deployment review.

`GITHUB_TOKEN_EXPIRES` is required and must be a real calendar date. Health treats the token as expired from the start of that date in `Australia/Sydney` (`expiry <= today`), and reports an upcoming expiry during the preceding fourteen Sydney calendar days.

The committed `netlify.toml` runs the allowlisted build, publishes only `dist/`, and deploys functions separately from `netlify/functions`.

After deploying a preview, inspect its deploy log and confirm Netlify registered the `/api/auth` code-based rate limit: five requests per 60 seconds, aggregated by IP and domain. Do not promote a deploy if that rule is absent.

## Chat

Local development and the browser acceptance suite use a small scripted mock at `/api/chat` and `/api/chat/confirm` (see `scripts/mock-api.mjs`) — no Anthropic key is required to run `npm run dev` or `npm test`.

To manually verify against the real Anthropic API, add `ANTHROPIC_API_KEY=<your key>` to a local `.env.local` (already gitignored, never commit it) and run the dev server with that variable loaded into the environment. Set the same variable in Netlify for a deployed preview or production.

Routing is re-evaluated independently for each message rather than pinned for a whole conversation: name an agent (for example "Chadwick") to route directly to them, or leave a message unaddressed to reach the general router, which infers the right domain or asks a brief clarifying question. Only Brisket (nutrition), Chadwick (fitness), Hyaluronica (skincare), Penelope (diary), and Dr Sara Tonin (body: weight, composition, measurements) can propose a `log_entry`; Dr Vera Lenz and General Hammond are conversational only in this phase. Every proposed record is shown for confirmation, with inline-editable scalar fields, before anything is written — nothing is saved automatically.

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
