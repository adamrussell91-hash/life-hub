# apps/tasks

Tasks Hub SPA stays on GitHub Pages at `https://tasks-hub.adam-russell.com`.

`GET/POST/PATCH/DELETE` for `/api/tasks`, `/api/projects`, `/api/areas`, and `/api/goals` on `life-hub2` use the Life session and Blobs store `tasks-hub-content`. If `NETLIFY_BLOBS_TOKEN` is set, that store is the existing `artasks-hub` store. Unbound → **503** `tasks_blobs_unbound`.

`artasks-hub` and `TASKS_HUB_PASSPHRASE_HASH` stay put. Do not rotate secrets or retarget production in this slice.
