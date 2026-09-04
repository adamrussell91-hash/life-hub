# Mobile chrome — locked

Desktop keeps the left rail (`RAIL.md`). **Phones do not.** Under `720px` every hub uses the same bottom bar + More sheet.

## Locked pattern

| Piece | Rule |
|--------|------|
| Breakpoint | `720px` — same as rail hide in `rail.css` |
| Desktop rail | Hidden (`.hub-rail { display: none }`). Do **not** force it back on as a top strip. |
| Bottom bar | `.hub-mobile-nav` — **four** slots: three primary destinations + **More** |
| More sheet | `.hub-more-sheet` — secondary pages in this hub, then a **Hubs** list of the other three hubs |
| Canvas | Bottom padding clears the fixed bar (`mobile.css`) |

## Anatomy

```
┌─ canvas ─────────────────────────────┐
│  page header + content               │
│                                      │
└──────────────────────────────────────┘
┌─ .hub-mobile-nav ────────────────────┐
│  [Home] [Chat] [Third] [More]        │
└──────────────────────────────────────┘
         │
         └─ .hub-more-sheet
              In this hub → …
              Hubs → Life / Teaching / Knowledge / Tasks (others)
```

## Per-hub only

Which three primary destinations, and which secondary links sit under “In this hub”. Structure, classes, and Hubs list are shared.

| Hub | Typical primary trio |
|-----|----------------------|
| Life | Home, Chat, Calendar |
| Teaching | Dashboard, Classes, Lessons |
| Knowledge | Archive, Graph, Chat |
| Tasks | Dashboard, Chat, Today |

## Adopt

1. Load `mobile.css` (or `chrome.css`, which imports it).
2. Call `mountMobileChrome(host, { currentHub, primary, more })` from `js/mount-mobile-chrome.js` after the shell mounts.
3. Delete hub CSS that shows `.hub-rail` under `720px` or invents a parallel top-strip / custom bottom nav.

Snippet: `snippets/mobile-chrome.html` (markup reference). Mount helper builds the live DOM.
