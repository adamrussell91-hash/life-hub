# apps/tasks

Tasks Hub SPA, published at `https://life-hub.adam-russell.com/tasks/`.

`GET/POST/PATCH/DELETE` for `/api/tasks`, `/api/projects`, `/api/areas`, `/api/goals`, `/api/programs`, and `/api/maps` on `life-hub2` use the Life session and Blobs store `tasks-hub-content`. Unbound → **503** `tasks_blobs_unbound`.

`GET/POST /api/clare` is the Clare loop on the same store. `GET/POST /api/templates` and `GET/POST /api/stall` are on that store too.

The SPA talks to `https://api.adam-russell.com`. Functions stay in repo-root `netlify/functions/`. Do not rotate secrets.

Build from the umbrella root: `UMBRELLA_SPA=1 npm run build -w tasks-hub`.
