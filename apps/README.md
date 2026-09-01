# apps/

Umbrella shape: `apps/life`, `apps/teaching`, `apps/knowledge`, `apps/tasks`.

**Life shell source lives in `apps/life/`.** `scripts/prepare-web.mjs` copies it into the same `dist/` URLs Pages already publishes.

Teaching / Knowledge / Tasks are mounts in the Life shell. Their SPAs stay on their own Pages sites until each API fold. Do not move Functions into `apps/*/netlify` or retarget `life-hub2` until a fold slice says so.
