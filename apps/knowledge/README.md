# apps/knowledge

Knowledge Hub SPA, published at `https://life-hub.adam-russell.com/knowledge/`.

Notes, search, quiz, Clementine, capture, attachments, tidy, curator, and podcast call `https://api.adam-russell.com/api/knowledge` with the Life session. Data is `knowledge-hub-data` (never `life-hub-data`). Missing token → **503** `knowledge_repo_unbound`.

Chat write/research stay on Worker `knowledge-hub-research`. Attachments presign R2 via S3 (`R2_*`). No Cloudflare bind on Netlify.

Auth wrappers use the Life passphrase and `life_hub_session`, not Knowledge auth.

The Worker source is vendored in `worker/` for the one-repo copy. Deploy that Worker from its existing Cloudflare project — do not bind R2 on Netlify or rotate secrets.

Build from the umbrella root: `UMBRELLA_SPA=1 npm run build -w knowledge-hub`.
