# Security

> **Note:** Full security architecture is defined in the product specs. This stub captures the first-slice security requirements from [`docs/superpowers/specs/2026-08-07-teaching-hub-first-slice-design.md`](../superpowers/specs/2026-08-07-teaching-hub-first-slice-design.md) until a dedicated security spec is authored.

## First-slice security requirements

### Secrets and deployment

- Secrets only on Netlify: `TEACHING_HUB_PASSPHRASE_HASH`, `SESSION_SECRET`, later `ANTHROPIC_API_KEY`.
- Pages artifact contains no tokens or passphrase verifier.
- `SITE_ORIGIN` allow-lists the GitHub Pages origin for teacher API requests.

### Authentication and session

- Single-user passphrase sign-in (Life Hub pattern).
- After passphrase verification, the server sets an **httpOnly session cookie**; teacher API routes require a valid session.
- Expired or missing session: re-prompt auth; student routes remain public.

### CORS

- Teacher API requests: validate `Origin` against `SITE_ORIGIN` (CORS).

### Netlify Blobs and draft vs published isolation

- One Blob store with prefixed keys; draft and published content use separate key namespaces:
  - Draft: `lessons/lesson_aotfw_008` (example)
  - Published snapshot: `published/lessons/lesson_aotfw_008`
- Teacher endpoints read/write draft keys (auth required).
- Student endpoints return **published snapshots only** — never draft keys.
- Students never read draft keys.

### Content safety

- Rich text sanitised; no arbitrary script execution in student render.

## Related failure modes (first slice)

- Missing published lesson: clear student 404 or empty state (no draft leakage).
