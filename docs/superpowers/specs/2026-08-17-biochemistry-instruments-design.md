# Biochemistry instrument views

**Date:** 2026-08-17  
**Status:** Approved  
**Scope:** Bloods → Biochemistry/Electrolytes only

## Goal

Replace the flat Biochemistry/Electrolytes marker treatment with physiological groups and purpose-fit instruments, while preserving the existing trend chart as an inline, on-demand detail.

## Groups

1. **Electrolytes & Minerals** — sodium, potassium, chloride, bicarbonate, anion gap, calcium, adjusted calcium, magnesium, phosphate. Render horizontal reference-band meters.
2. **Kidney & Waste Clearance** — creatinine, urea, eGFR, uric acid. Render vertical fill tubes.
3. **Protein Profile** — alpha 1/2 globulin, beta 1/2 globulin, gamma globulin, IgG1–4, caeruloplasmin. Render concentration-proportional electrophoresis bands, with caeruloplasmin as a meter.
4. **Other Markers** — AFP, CK, copper, total testosterone, and any unassigned marker. Render horizontal reference-band meters.

Every marker must appear in exactly one group. Unknown future keys fall into Other Markers.

## Visual language

Use Life Hub tokens only. The scratchpad's standalone palette, type, radii, and shadows are not imported.

- Reference band: `--pastel-sage`
- Track and dividers: `--line`
- Historical marks: `--muted`
- Latest in range: `--success`
- Latest high: `--danger`
- Latest low: `--high-sea-ink`
- Surfaces, spacing, type, and radii: existing design-kit tokens

All instruments reuse `bandDomain`, so values and reference limits are scaled consistently with existing Bloods charts.

## Interaction

Each marker with at least two numeric draws is a keyboard-operable button. Activating it expands the existing line trend directly below its physiological group. Only one marker trend may be open at a time within the category. Activating the open marker collapses it.

Markers with fewer than two draws remain non-interactive. Exact current values, units, reference ranges, and status are visible in text, so meaning never relies on colour or hover.

The expanded trend reuses the existing line renderer, date ticks, scrub state, compare-pin behaviour, and accessible SVG label.

## Responsive behaviour

Meters remain horizontal. Kidney tubes wrap on narrow screens. Protein bands remain full-width and may shorten labels to α1, α2, β1, β2, and γ. Marker controls retain a minimum 44px touch target and visible focus treatment from the shared action styles.

## Architecture

- `js/app/bloods-biochem-groups.js`: pure grouping configuration and catch-all assignment.
- `js/app/bloods-instruments.js`: instrument geometry, DOM/SVG rendering, and inline trend expansion.
- `js/app/render-bloods.js`: one category-specific branch for Biochemistry/Electrolytes.
- `css/app.css`: domain styles using existing tokens.

Other Bloods categories retain their current chart selection and rendering path.

## Testing

- Group assignment, order, and unknown-key fallback.
- Meter, tube, and protein-band geometry and accessible labels.
- Inline trend expands, switches, and collapses.
- Markers without enough history are non-interactive.
- New SVG viewBoxes match CSS aspect ratios.
- Existing Bloods and full test suites remain green.

## Out of scope

- Redesigning other blood categories.
- Import or marker-map changes.
- A second tooltip system.
- Design-kit token changes.
