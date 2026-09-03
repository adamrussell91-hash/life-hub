# apps/tasks

Tasks Hub SPA stays on GitHub Pages at `https://tasks-hub.adam-russell.com`.

`GET /api/tasks` on `life-hub2` uses the Life session and reads Blobs store `tasks-hub-content` (not Teaching’s store). Unbound → **503** `tasks_blobs_unbound`.

`artasks-hub` and `TASKS_HUB_PASSPHRASE_HASH` stay put. Do not rotate secrets or retarget production in this slice.
