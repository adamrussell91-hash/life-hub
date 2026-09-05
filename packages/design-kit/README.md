# Design kit (in-repo source of truth)

This tree is the **design source of truth** for every hub in this monorepo (Life, Teaching, Knowledge, Tasks).

Hub apps load sheets and modules from here:

- Teaching / Knowledge / Tasks: `apps/<hub>/design-kit` → symlink to `packages/design-kit`
- Life: `packages/design-kit/…` URLs in `apps/life/index.html`, remounted by `scripts/prepare-web.mjs`

Do not fork tokens, chrome, or locked snippets inside a hub.

## Layout

Flat freeze (no `css/` subfolder):

| Path | Role |
|------|------|
| `tokens.css` | Closed palette, type, space, radius, elevation |
| `overlays.css` | Only per-hub glass / tile density (`data-hub`) |
| `actions.css` / `chrome.css` | Buttons, utilities, confirm cards; chrome bundles rail + mobile + motion |
| `sign-in.css` + `snippets/sign-in.html` | Locked passphrase gate (**tile required**, no supporting copy) |
| `rail.css` / `mobile.css` | Locked left rail + phone bottom bar |
| `motion.css`, `morphing-popover.css`, `hub-compose.css`, `adaptive-slider.css`, `card-swipe.css`, `hub-interactions.css`, `js/*` | Shared motion / morph / toast / compose / slider / swipe deck / date / mobile mount. Closed-field chips: `createMorphingClosedFieldPopover` |
| `icons/` | Hub tiles + glyphs |
| `AGENTS.md`, `RAIL.md`, `MOBILE.md`, `ICONS.md`, `TASKS.md` | Locked rules |

## Publish

`scripts/prepare-web.mjs` remounts CSS, JS, and `icons/` to `dist/packages/design-kit/` for Life’s Pages publish path.

## Compliance

Cross-hub audit: [`docs/design-kit-compliance.md`](../../docs/design-kit-compliance.md).

Canonical upstream history of these files: `github.com/adamrussell91-hash/hub-design-kit`.
