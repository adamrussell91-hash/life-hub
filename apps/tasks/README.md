# apps/tasks

Tasks Hub SPA stays on GitHub Pages at `https://tasks-hub.adam-russell.com`.

`GET/POST/PATCH/DELETE` for `/api/tasks`, `/api/projects`, `/api/areas`, `/api/goals`, `/api/programs`, and `/api/maps` on `life-hub2` use the Life session and Blobs store `tasks-hub-content`. If `NETLIFY_BLOBS_TOKEN` is set, that store is the existing `artasks-hub` store. Unbound → **503** `tasks_blobs_unbound`. Program create needs `name`; map create needs `title`.

`GET/POST /api/clare` is the Clare estimate loop on the same store: propose, dump, brief, accept, accept_batch, record_actual.

The Tasks Pages app is retargeted to `https://api.adam-russell.com`. `artasks-hub` and `TASKS_HUB_PASSPHRASE_HASH` stay put. Do not rotate secrets.
