# Design kit (frozen copy)

Copy-then-freeze of Life Hub’s vendored `design-kit/` on 2026-09-01, as the umbrella seed for hub consolidation.

**Source of this freeze:** repo-root `design-kit/` (the copy GitHub Pages already publishes). Not a fresh pull of `hub-design-kit`, which uses a different `css/` layout and would break Life’s current `href="design-kit/*.css"` and `from '../../design-kit/js/…'` paths.

**Do not remount yet.** Pages (`scripts/prepare-web.mjs` → `dist/design-kit/`) and app imports still read repo-root `design-kit/`. Switching those paths is a later fold step.

**Long-term model:** this tree is the single in-repo kit. Do not treat `scripts/sync-to-hubs.sh` (in `hub-design-kit`) as the umbrella workflow.

Canonical remote (upstream origin of the vendored files): `github.com/adamrussell91-hash/hub-design-kit`.
