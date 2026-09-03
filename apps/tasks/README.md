# apps/tasks

Tasks Hub SPA stays on GitHub Pages at `https://tasks-hub.adam-russell.com`.

`GET/POST/PATCH/DELETE` for `/api/tasks`, `/api/projects`, `/api/areas`, `/api/goals`, `/api/programs`, and `/api/maps` on `life-hub2` use the Life session and Blobs store `tasks-hub-content`. With `NETLIFY_BLOBS_TOKEN` only, that store is still the `artasks-hub` store. Set `TASKS_BLOBS_SITE_ID` to `local` or the `life-hub2` site id after copying. Unbound → **503** `tasks_blobs_unbound`. Program create needs `name`; map create needs `title`.

`GET/POST /api/clare` is the Clare loop on the same store: propose, dump (full parser + toolkits), brief (morning/tomorrow/weekly/high-stakes), accept, accept_batch, record_actual, apply_mutations. Offline parser only — no Anthropic judge on `life-hub2` yet.

`GET/POST /api/templates` lists frameworks and templates, then save/create task and project templates (excursion create is a thin project write). `GET/POST /api/stall` flags quiet projects and records revive / frankenstein / bury reviews.

The Tasks Pages app is retargeted to `https://api.adam-russell.com`. `artasks-hub` and `TASKS_HUB_PASSPHRASE_HASH` stay put. Do not rotate secrets.
