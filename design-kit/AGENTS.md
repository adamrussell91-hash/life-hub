# Hub design kit — agent instructions

This folder is the design source of truth for Adam’s hub sites (Teaching, Life, Knowledge, and any new hub). Read it **before** writing or restyling UI.

## Grab these files

1. `css/tokens.css` — closed palette, type, space, radius, elevation
2. `css/overlays.css` — the only per-hub differences (glass / tile density)
3. `css/chrome.css` — rail, page header, buttons, confirm cards (new hubs)
4. `snippets/` — copy the HTML, then wire behaviour

Canonical repo: `/Users/adamrussell/Projects/hub-design-kit`  
GitHub: https://github.com/adamrussell91-hash/hub-design-kit  
Each hub also has a copy at `design-kit/` so this workspace can see it.

## Locked (do not reinvent)

- Colours, type scale, spacing, radius, shadows
- Page header: uppercase eyebrow → `h1` title → optional supporting → actions on the right
- Left rail: `--rail-width`, depth→marine gradient, `--on-dark*` text
- Buttons: `.btn` + `--primary` / `--secondary` / `--ghost` / `--decisive`
- Agent UX: propose → **confirm card** → apply. Never silent writes that look like a new UI kit
- Inter 400/500/600/700 only

## Allowed differences (`data-hub` on `<html>`)

| Hub | Overlay |
|-----|---------|
| `teaching` | More glass, more tiles |
| `life` | Tiles, flatter (less blur, tighter gap) |
| `knowledge` | Less glass, fewer tiles, icon rail (`--rail-width: 5.75rem`) |

Product UI (graphs, lesson blocks, bloods) stays in the hub. Chrome does not.

## Hard rules

- If a size/colour is missing, **pick the nearest token**. Do not add a new CSS variable unless you are editing this kit on purpose.
- Do not copy hex from an old screenshot. Use tokens.
- Do not start a new palette, font, or button style “just for this page”.
- High Sea (`--high-sea`) is accent / decisive, not body text on orange, not focus rings (focus is Wave).
- After changing this kit, run `scripts/sync-to-hubs.sh` so hub copies update.

## New hub checklist

1. Copy `design-kit/` into the new repo (or run the sync script after adding the path).
2. `<html lang="en" data-hub="…">`
3. Load Inter, then `tokens.css`, `overlays.css`, `chrome.css`, then the hub’s own CSS.
4. Start from `snippets/shell.html`.
5. Hub-only CSS may add domain styles; it may not redefine `:root` colours or type.
