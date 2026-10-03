# apps/knowledge

Knowledge Hub SPA, published at `https://life-hub.adam-russell.com/knowledge/`.

Notes, search, quiz, Clementine, capture, attachments, tidy, curator, and podcast call `https://api.adam-russell.com/api/knowledge` with the Life session. Data is `knowledge-hub-data` (never `life-hub-data`). Missing token → **503** `knowledge_repo_unbound`.

Chat write/research stay on Worker `knowledge-hub-research`. Attachments presign R2 via S3 (`R2_*`). No Cloudflare bind on Netlify.

Auth wrappers use the Life passphrase and `life_hub_session`, not Knowledge auth.

The Worker source is vendored in `worker/` for the one-repo copy. Deploy that Worker from its existing Cloudflare project — do not bind R2 on Netlify or rotate secrets.

Research and podcasts search a catalogue of the archive in R2 (`research/…`), not `knowledge-hub-data` directly. The Worker keeps it current itself: an hourly cron pokes the `CatalogueSync` Durable Object, which catalogues up to 40 new or changed notes per run (free-plan sized) into a small delta and folds that into a new base every 400 notes. Its health shows on the Podcast page. `npm run build-index` then `npm run sync-research-r2 -- --execute` is a full rebuild; it is never needed for freshness, and it resets the delta.

Build from the umbrella root: `UMBRELLA_SPA=1 npm run build -w knowledge-hub`.
