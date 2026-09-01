# Design kit (frozen copy)

Copy-then-freeze of Life Hub’s vendored kit. This is the only in-repo kit tree.

**Source of this freeze:** the former repo-root `design-kit/` (the copy GitHub Pages used to publish). Not a fresh pull of `hub-design-kit`, which uses a different `css/` layout.

**Remounted:** `scripts/prepare-web.mjs` copies this tree to `dist/packages/design-kit/`. App imports and `index.html` load that published path.

Canonical remote (upstream origin of the vendored files): `github.com/adamrussell91-hash/hub-design-kit`.
