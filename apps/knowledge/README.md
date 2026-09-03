# apps/knowledge

Knowledge Hub SPA stays on GitHub Pages at `https://knowledge-hub.adam-russell.com`.

`GET/POST /api/knowledge/pages`, `GET /api/knowledge/pages/:id`, `GET /api/knowledge/search?q=`, and `GET/POST /api/knowledge/quiz` on `life-hub2` use the Life session and `knowledge-hub-data` (never `life-hub-data`). Missing token → **503** `knowledge_repo_unbound`. Quiz items are `GET /api/knowledge/quiz/:pageId`.

Do not retarget Knowledge Pages until that app is pointed at these namespaced paths. R2 bucket / Worker `knowledge-hub-archive` stay put. Do not copy Knowledge auth, bind R2, or rotate secrets.
