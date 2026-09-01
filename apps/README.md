# apps/

Target umbrella shape (`plan.md`): `apps/life`, `apps/teaching`, `apps/knowledge`, `apps/tasks`.

**Life stays at repo root for this slice.** Moving `index.html`, `js/`, `css/`, `netlify/functions`, and `scripts/prepare-web.mjs` into `apps/life/` would break:

- GitHub Pages: `.github/workflows/pages.yml` builds `dist/` from root `prepare-web.mjs`
- Pages publish paths: `packages/design-kit/*.css`, `js/app/*`, `index.html`
- Netlify Functions: `netlify.toml` `directory = "netlify/functions"` and `included_files` (`config/*`, `capabilities/**`, `central-node.md`)

Do not create `apps/life/` until a dedicated remount slice updates those paths in one change and verifies Pages + `life-hub2` locally. Other hubs are fold-later (step 5).
