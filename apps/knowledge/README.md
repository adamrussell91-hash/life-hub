# apps/knowledge

Knowledge Hub SPA stays on GitHub Pages at `https://knowledge-hub.adam-russell.com`.

`GET/POST /api/knowledge/pages`, `GET /api/knowledge/pages/:id`, `GET /api/knowledge/search?q=`, and `GET/POST /api/knowledge/quiz` on `life-hub2` use the Life session and `knowledge-hub-data` (never `life-hub-data`). Missing token → **503** `knowledge_repo_unbound`.

SPA path aliases (same handlers, Life session):

- `POST /api/knowledge/pages-save`
- `POST /api/knowledge/quiz-save`
- `GET /api/knowledge/quiz/:pageId` and `GET /api/knowledge/quiz/items/:pageId`
- `GET /api/knowledge/auth-session`, `POST /api/knowledge/auth-login`, `POST /api/knowledge/auth-logout` — Life passphrase and `life_hub_session`, not Knowledge auth

The Knowledge Pages app defaults to `https://api.adam-russell.com/api/knowledge` for notes, search, quiz, and sign-in. Clementine, attachments, tidy, capture, curator, and podcast stay on `knowledge-api` until those handlers fold. R2 bucket / Worker `knowledge-hub-archive` stay put. Do not copy Knowledge auth, bind R2, or rotate secrets.
