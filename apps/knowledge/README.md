# apps/knowledge

Knowledge Hub SPA stays on GitHub Pages at `https://knowledge-hub.adam-russell.com`.

`GET /api/knowledge/pages` and `GET /api/knowledge/pages/:id` on `life-hub2` use the Life session and read `knowledge-hub-data` (never `life-hub-data`). Missing token → **503** `knowledge_repo_unbound`.

R2 bucket / Worker `knowledge-hub-archive` stay put. Do not copy Knowledge auth, bind R2, or rotate secrets in this slice.
