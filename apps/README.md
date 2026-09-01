# apps/

Target umbrella shape (`plan.md`): `apps/life`, `apps/teaching`, `apps/knowledge`, `apps/tasks`.

**Life shell source lives in `apps/life/`.** `scripts/prepare-web.mjs` copies `index.html`, `js/`, `css/`, `assets/`, `manifest.webmanifest`, and `service-worker.js` into the same `dist/` URLs Pages already publishes (`/`, `/js/`, `/css/`, `/assets/`).

Stay at repo root:

- `netlify/` — Functions paths and `netlify.toml` `directory` / `included_files`
- `scripts/prepare-web.mjs` and `.github/workflows/pages.yml` (still upload `dist/`)
- `packages/design-kit/`, `config/`, `capabilities/`, `central-node.md`, `tests/`

Do not move Functions into `apps/life/netlify`, retarget `life-hub2`, or fold other hubs in this slice.
