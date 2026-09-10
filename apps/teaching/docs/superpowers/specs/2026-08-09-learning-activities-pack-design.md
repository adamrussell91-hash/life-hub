# Teaching Hub — Learning Activities Pack Design

**Date:** 2026-08-09  
**Status:** Approved for implementation  
**Slice:** `flashcards`, `cloze`, `self_check` (thin v1 of all three)  
**Depends on:** Leaf-block patterns (`question_set` / timeline editors); local student state  
**Parent roadmap:** `docs/BUILD.md` Next up #1; `docs/specs/03_BLOCK_SYSTEM.md` §§29–35  
**Not this slice:** Server progress, grading, matching/ordering, Drive uploads, nesting children

## Goal

Ship three low-stakes learning activity blocks with stacked teacher editors, interactive student views, and browser-local state only.

## Decisions

| Topic | Choice |
|-------|--------|
| Approach | Three leaf `block_type`s (not one `activity` variant, not folded into `question_set`) |
| Student state | `localStorage` keyed by lesson id + block id; never published |
| Flashcards motion | Smooth flip (`rotateY`) + short shuffle motion; `prefers-reduced-motion` → fade/instant |
| Cloze blanks | Input width from longest accepted answer (`ch`) so word length is visible |
| Cloze answers | Word-bank / option order always shuffled per session and on Reset; free-type still matches answer list |
| Interaction feedback | All buttons/controls: clear hover, active, focus (and disabled) styles |
| Placement | Lesson root, `section`, `columns` cells, `tabs` panels (leaf only) |
| Editors | Stacked field lists (timeline / question_set parity) |
| Publish | ≥1 card; ≥1 cloze blank; non-empty self_check prompt (+ answer/items per mode) |

## Out of scope

- Account-backed or server student progress
- Formal assessment / grades
- Nested blocks inside activities
- Rich text inside card faces / cloze source
- Image upload UI (URL + alt only on flashcards)
- Matching, ordering, drag-drop, polls
- A4-specific activity layouts beyond static print fallbacks

## Data model

### `flashcards`

```ts
content: {
  cards: Array<{
    id: string;
    front: string;
    back: string;
    image_url?: string;
    image_alt?: string;
  }>; // 1–20; create with 2
  shuffle?: boolean; // default false
}
```

Student: one focal card; Prev / Flip / Next / Reset; shuffle on mount when enabled; flip + shuffle animation as above.

### `cloze`

```ts
content: {
  title?: string;
  text: string; // blanks via [[answer]] or [[answer|hint]]
  case_sensitive?: boolean; // default false
}
```

**v1 marker rules:** `[[answer]]` or `[[answer|hint]]` only. One accepted answer string per blank (trim; case per flag). No multi-answer aliases in v1. Editor may expose passage + blank list rather than raw markers only.

Student: sized inputs; Check / Reveal / Reset; always show a word bank of the correct answers in shuffled order (reshuffle on session start and Reset); free-type still matches; score as “n / total” only (no grade language).

### `self_check`

```ts
content: {
  title?: string;
  mode: 'reveal' | 'checklist' | 'confidence';
  prompt: string;
  answer?: string;           // reveal + confidence
  items?: Array<{ id: string; label: string }>; // checklist; 1–12
}
```

Student: reveal toggles answer; checklist checkboxes local; confidence 1–5 then reveal. Copy must not imply formal assessment.

## Nesting

| Parent | Allowed? |
|--------|----------|
| lesson root / section / columns cell / tabs panel | yes |
| Inside flashcards / cloze / self_check | no (leaves) |

## Student UX summary

| Block | Controls | Persistence |
|-------|----------|-------------|
| Flashcards | Prev, Flip, Next, Reset (+ shuffle motion) | index, flipped, shuffle order |
| Cloze | inputs, Check, Reveal, Reset, shuffled word bank | input values optional |
| Self check | Show/Hide or checkboxes or confidence then reveal | checklist ticks / confidence / revealed |

Print (static): list card front/back; cloze underlines; self_check prompt + answer/items.

## Wiring checklist

schema → create-block → registry → render → editors → sanitize → visibility → lesson publish → CSS (motion + feedback) → unit tests → `docs/BUILD.md`

## Testing (acceptance)

- Schema rejects empty cards / zero blanks / empty prompt
- Flashcards flip/nav/reset; shuffle reorders; reduced-motion path does not use rotateY
- Cloze blank widths reflect answer length; bank order ≠ source order across resets
- Self check modes behave as above; state survives reload via `localStorage`
- Interactive controls show hover/active/focus styles
- Visibility + publish rules match other leaves
