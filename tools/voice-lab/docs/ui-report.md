# Voice Lab UI report

## Implemented

- A responsive, local-only casting interface in `static/index.html`, `static/style.css`, and `static/app.js`.
- Editable voice direction with presets, fixed audition scripts, candidate count, optional seed, and the five planned generation settings.
- Clear idle, model-loading, generating, cancellation-requested, completed, cancelled, API failure, and initial-load recovery states.
- Durable numbered candidate cards with native audio playback, WAV downloads, warnings, timings, and metadata disclosures.
- Polling updates existing candidate nodes by immutable candidate ID. The audio element and its `src` remain untouched unless the URL changes, preserving playback during progress refreshes.
- Active jobs poll every second and inactive states every four seconds so other tabs and restarted jobs are discovered. Connection loss disables generation until a successful refresh.
- Configuration defaults are applied only on first load. Retry refreshes state without duplicating options or replacing the user's edits.
- Candidate audio has an accessible name and starting one candidate pauses any other candidate. Elapsed time reads the latest job start on every tick.
- POST requests include `x-voice-lab: 1`; API failures display the server's `{error}` message.
- Dynamic server text is assigned with DOM `textContent`/form values rather than HTML injection.
- A polite live region announces meaningful state changes. Labels, keyboard focus, reduced-motion behavior, mobile layout, and browser-side input bounds are included.

## Verification

- Contract check: `node /tmp/voice-lab-ui-contract.test.js` — passed.
- JavaScript syntax: `node --check tools/voice-lab/static/app.js` — passed.
- Whitespace/error audit: `git diff --check -- tools/voice-lab/static/index.html tools/voice-lab/static/app.js tools/voice-lab/static/style.css` — passed.
- API shape cross-check against `docs/plan.md` and the current `lab.py` — aligned, including ISO `started_at`, cancellation state, settings, timing fields, and WAV URLs.

## Remaining integration check

The localhost HTTP server was being built independently while this UI was implemented. A browser surface was unavailable during the final check, and the server was not reachable on port 8765 from the verification shell. A real browser pass against the completed server, including range audio playback and a generated WAV, remains part of the combined Voice Lab verification.
