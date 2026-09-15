# Clinical Thread Timelines

Date: 15 September 2026  
Status: Approved  
Reference: Aceternity Timeline — sticky heading and scroll-following beam, adapted to Life Hub’s Clinical Glass system.

## Problem

Life Hub has several chronological surfaces with sound data and interactions, but no shared visual grammar. The supplied Aceternity reference has the right sense of progression and focus, but its large media-led cards are unsuitable for private health data, relationship history, teaching content, or a zoomable study plan.

## Decision

Adopt **Clinical Thread** as a shared visual pattern, beginning with Life Hub’s Medical Overview. It is a semantic chronological list with a quiet vertical spine—not a generic timeline component and not a replacement for spatial scheduling surfaces.

## Shared visual contract

- Use existing hub tokens only. The spine is `--wave`; structure and text use `--marine`, `--muted`, existing glass panels, and existing status tokens.
- Each event exposes a readable date, title, and supporting metadata before any colour or animation. Nodes are supplementary visual anchors, not the only time/status cue.
- Desktop groups stay visually anchored while their events scroll. On phones, the group label flows normally above its events; no horizontal overflow or clipped date labels.
- Motion is one reveal/progress treatment on entry or filter change. `prefers-reduced-motion: reduce` renders the final state immediately. No looping effects.
- Event cards remain compact. Images are optional content supplied by the host, never a required part of the component.
- Current/open periods use existing text and shape differences as well as colour.

## Surface rules

### Medical Overview — reference implementation

Keep search, type/practitioner filters, density switching, year collapse, episode bands, visit selection, and the detail sheet unchanged. Add the Clinical Thread spine to the existing chronological host:

- Year headings form the group anchors.
- Episode bands remain grouped subsections, not false dates.
- Visits retain their title, date, provider/location, record type, lab flags, and selection state.
- The thread scales down with existing density modes rather than hiding information.
- Medical status remains text-labelled and never depends on the accent colour alone.

### Professional Hub — Relationship timeline

Use the same spine for relationship entries on person and organisation detail pages. Preserve server order. Current and ended periods retain their existing explicit state treatment; the timeline is a history display, not an editor.

### Teaching Hub — Timeline content block

Apply the pattern to the existing timeline block in author and learner render modes. Keep the block data schema and editor unchanged. A lesson event may include title, date/sequence label, and short description; it should not acquire an image requirement or a separate styling system.

### Knowledge Hub — University study timeline

Borrow group labels, compact event cards, and restrained progression only. Preserve the existing zoomable, multi-scale university canvas and its controls. Clinical Thread must not flatten the study timeline into a linear list.

## Explicit exclusions

- Tasks Hub’s date-bar Timeline and Gantt retain their horizontal time geometry and task interactions.
- Teaching Scope & Sequence retains its term/week grid and drag/resize behaviour.
- The Wedding site is out of scope.
- No React, Tailwind, shadcn, Motion, or Aceternity dependency is added. Each existing app uses its current rendering stack.

## Architecture

Each host owns its data shaping and event actions. Shared CSS and small DOM helpers may live in the design kit only when they do not conceal surface-specific semantics. The Medical Overview is the first implementation slice; its tests define the minimum shared behaviour before the Professional, Teaching, and Knowledge adaptations begin.

## Accessibility and verification

- Use semantic lists, headings, and buttons/links already present in each host.
- Preserve keyboard access, focus, filters, selection, and expanded/collapsed states.
- Test reduced motion and 390 px layouts.
- Add focused unit tests for Medical chronology structure and selection preservation, then run each affected app’s existing suite and its production build before merge.

## Guide update

The Life Hub Design guide gains a **Chronological views / Clinical Thread** section. It defines the visual contract, responsive behaviour, accessibility requirements, and the boundary between chronological narratives and spatial schedule editors.
