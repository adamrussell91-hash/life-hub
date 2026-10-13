# Show All zoom → Atlas stack

## Problem

Show All mounts the kit adaptive slider (`createAdaptiveSlider`) into the neural dock. That control is a metric card: band colours, lilac dots, spring fill. CSS hides the digits but leaves the wrong chrome on a constellation map.

## Decision

Replace the slider with Atlas-style `+` / `−` / Fit buttons plus a small `×` readout (option A). Wheel and pinch stay the fine control.

## Behaviour

- `+` / `−`: zoom by ×1.4 / ÷1.4 around the viewport centre (same step as shelf Atlas), clamped to Show All’s existing `0.04`–`24` range.
- Fit: `moveCamera(fitShowAll())` — restore overview.
- Readout: `view.k / overviewK` as `N.N×`, updated whenever the camera changes (including wheel).
- Remove `createAdaptiveSlider` from this path.

## Chrome

- Vertical stack on the neural dock (same slot as today’s `.graph-zoom`).
- Neural dark surface (matches dock pills), not the paper adaptive-slider card.
- Buttons ≥44px tall under 720px.
- No band fill, dots, or “Map zoom” label.

## Out of scope

Hairline scrub (B), Overview/Near/Close pills (C), changing wheel math or zoom limits.

## Verify

- Unit: click `+` until near max scale; Fit restores overview; no `[aria-label="Map zoom"]` range input.
- Visual: Show All at ~1280 and 390 — stack matches dock language; no rainbow track.
