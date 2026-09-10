# Hub marks — deleted from product chrome

Adam locked this: the hub tile / favicon mark is **gone from product UI**. Do not put it back.

Read this before adding a favicon, a sign-in image, a title glyph, a rail logo, or any “hub mark” chrome.

## Files (archive only)

| Hub | Tile | Glyph |
|-----|------|-------|
| Life | `icons/life-hub.svg` | `icons/life-hub-glyph.svg` |
| Knowledge | `icons/knowledge.svg` | `icons/knowledge-glyph.svg` |
| Teaching | `icons/teaching.svg` | `icons/teaching-glyph.svg` |
| Tasks | `icons/tasks.svg` | `icons/tasks-glyph.svg` |
| Careers | `icons/careers.svg` | `icons/careers-glyph.svg` |
| Central Control | `icons/central-control.svg` | `icons/central-control-glyph.svg` |

These SVGs may stay in the kit as **archive / source art**. They are **not** product chrome.

## Where it goes

| Place | Rule |
|-------|------|
| Browser tab / home screen | **Never.** No `<link rel="icon">` pointing at a hub tile. No apple-touch-icon hub tile. |
| PWA / web manifest | **Never.** No hub-tile `icons` entries. |
| Sign-in card | **Never.** No `.sign-in__mark`. Gate is brand eyebrow + `Sign in` + passphrase + submit. |
| Signed-in canvas title row | **Never.** Title row is the `h1` only. No `.hub-mark`. |
| Left rail brand | **Never.** Text `<a class="hub-rail__brand">` only. |

**Locked:** deleted from absolutely everywhere in product chrome. A later “kit compliance” pass must not re-add favicon, sign-in mark, title-row tile, rail logo, or PWA hub icons — Adam removed them and they must stay gone.

## Sign-in

Brand eyebrow + title `Sign in` + passphrase + submit. Enter on the field must submit (form `submit`, not a click-only button).

**No tile.** **No supporting line.** No purpose copy, privacy notes, taglines, or “private dashboard” sentences on the gate.

## Do not

- Wire `<link rel="icon">` to any hub tile
- Add `.sign-in__mark` (or any hub tile image) on the gate
- Put `.hub-mark` beside any page title
- Put the tile or glyph on the rail
- Re-add PWA / manifest hub-tile icons
- Invent a seventh mark or recolour arcs
- “Fix” a missing favicon by restoring the tile
