# Hub rail

Read `AGENTS.md` first. This file is the rail brief for every hub.

Load `rail.css` after tokens / overlays (and after `actions.css` or `chrome.css` if those are already linked). Do not copy rail colour, type, or width into the hub stylesheet.

## Locked

- Width is `--rail-width` from `tokens.css` (`15rem`). **Do not override it** in a hub stylesheet or on the rail element.
- Surface is the depth→marine gradient with `--on-dark*` text. No canvas colours on the rail.
- **Brand is a home control.** `.hub-rail__brand` is a `<button>` (or in-app link) that goes home. Copy is `"Teaching Hub"` / `"Life Hub"` / `"Knowledge Hub"` / `"Tasks Hub"`. CSS uppercases it (`--text-2xs`). No stacked `<br>`, no decorative mark, no large title-case hero, no tagline required.
- **Every first-class rail page** is one row: outline icon + title-case label. Same treatment for Home, Chat, and every domain page. No section kicker (“Domains”), no coloured dots, no filled glyphs, no icon-only column.
- Icon: 24×24 viewBox, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.75"`. Label is authored title case — do not `text-transform: uppercase` the page name.
- Existing hubs keep their rail host class and `data-section` / route hooks so tests keep passing.

## Markup

```html
<aside class="desktop-rail" aria-label="Life Hub navigation">
  <button class="hub-rail__brand" type="button" data-section="home">Life Hub</button>
  <nav class="rail-nav" aria-label="Primary">
    <button class="nav-item hub-rail__item is-active" type="button" data-section="home" aria-current="page">
      <span class="hub-rail__icon" aria-hidden="true"><!-- outline svg --></span>
      <span class="hub-rail__label">Home</span>
    </button>
    <!-- one button per first-class page -->
  </nav>
</aside>
```

Life Hub keeps `.desktop-rail`, `.rail-nav`, `.nav-item`, and the existing `data-section` values. New hubs may use `.hub-rail` / `.hub-rail__nav` instead.

## Not this

- Coloured dots (`.nav-dot` or otherwise)
- Icon column / Knowledge `--rail-width: 5.75rem` on Teaching, Life, or Tasks
- Brand as a static header, stacked title, or ring mark
- A `--rail-width` override “to make the icons fit”
