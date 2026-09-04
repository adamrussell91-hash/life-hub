# apps/

Umbrella shape: `apps/life`, `apps/teaching`, `apps/knowledge`, `apps/tasks`.

**Life shell** lives in `apps/life/`. `scripts/prepare-web.mjs` copies it to the Pages root.

**Teaching, Knowledge, and Tasks** SPAs live in their `apps/` folders. `npm run build` compiles them with Vite bases `/teaching/`, `/knowledge/`, and `/tasks/`, then `prepare-web` copies each `dist/` under those paths and writes a root `404.html` so GitHub Pages deep links boot the right app.

The Life rail opens those same-origin paths. Functions stay in repo-root `netlify/functions/` — do not add `apps/*/netlify`.

**Design kit:** one copy at `packages/design-kit/`. `apps/teaching/design-kit`, `apps/knowledge/design-kit`, and `apps/tasks/design-kit` are symlinks to it. Do not vendor a second copy in an app.
