# People experience — mockup renders

Six desktop mockups for Professional Hub's People section, designed from
scratch against `../SOURCE-BRIEF.md` and this repo's real design tokens
(`packages/design-kit/tokens.css`, `RAIL.md`) — not against any prior
in-product mockup.

| File | Screen |
|---|---|
| `01-people-home.png` | People Home — signals, People Today, Dynamic Cohorts, Recent Activity |
| `02-person-profile.png` | Person Profile — Overview tab (fitted page) |
| `03-person-brief.png` | Person Brief — pre-meeting reading surface |
| `04-network-ecology.png` | Network Ecology — world view (habitats) |
| `05-organisation.png` | Organisation page |
| `06-your-network.png` | Your Network — EGO Ecology view, centred on "You" |

Each `NN-*.html` is the real source: plain HTML/CSS built with this repo's
actual token values, rendered to PNG with headless Chromium (no external
image-generation service — see `SOURCE-BRIEF.md` for why). To re-render:

```bash
./generate-fonts.sh   # fetches Inter from Google Fonts, writes fonts.css (not committed, ~1.7MB)
./render.sh            # screenshots all six HTML files to PNG
```

`base.css` holds the shared tokens, rail component, and card/chip styles
used by all six files.
