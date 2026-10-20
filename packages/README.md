# packages/

Umbrella shared trees. Life Hub still boots from the repo root (Pages `dist/` + `netlify/functions`).

| Path | Role |
|------|------|
| `design-kit/` | Frozen kit. Pages publish path is `packages/design-kit/`. |
| `graph-blocks/` | Mind map + concept map block editors (Outline / Canvas) and read-only view, shared by Tasks and Teaching. |
| `whiteboard/` | Whiteboard block document client shared by Tasks and Teaching. |
| `block-styles/` | `blocks.css`: Teaching's block styles, generated from `apps/teaching/src/styles/app.css` by `scripts/generate-block-css.mjs` for Tasks and Professional. Do not edit by hand. |
