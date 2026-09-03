# Teaching Hub — Response Space Design

**Date:** 2026-08-09  
**Status:** Approved for implementation  
**Product name:** Teaching Hub  
**Slice:** Response space on `question_set` short-answer questions (schema + builder only)  
**Depends on:** Existing `question_set` block  
**Parent roadmap:** `docs/BUILD.md` Next up #1  
**Not this slice:** Student-visible answer lines; interactive typing/save; A4 print renderer; separate block type; MC response space UI

## Goal

Let teachers record expected answer length (`response_space`) on short-answer questions so a future A4/print pipeline can draw worksheet lines. No student-facing change in this slice.

## Decisions

| Topic | Choice |
|-------|--------|
| Shape | Field on each `question_set` question — not a new block |
| Values | `none` \| `short` \| `medium` \| `long` \| `extended` |
| Which kinds | Short answer only |
| Default (new short answer) | `medium` |
| Multiple choice | Omit `response_space` (do not persist) |
| Student screen | Unchanged — no lines, no textarea |
| Print | Deferred to A4 phase; field is stored for later |
| Typing / local save | Out of scope (students write in books) |

## Out of scope

- On-screen answer lines or “write in your book” chrome  
- Browser `@media print` line rendering  
- Full A4 print pipeline  
- Interactive student answers / persistence  
- `answer_mode` / teacher answer reveal  
- Extra question kinds beyond existing `short_answer` / `multiple_choice`  
- Response space on cloze / self_check / flashcards  

## Data model

```ts
ResponseSpaceSchema = z.enum(['none', 'short', 'medium', 'long', 'extended'])

QuestionItemSchema = {
  id: string
  prompt: string
  kind: 'short_answer' | 'multiple_choice'
  options?: string[]
  response_space?: ResponseSpace  // short_answer only
}
```

### Rules

| Situation | Behaviour |
|-----------|-----------|
| Create short-answer question | Include `response_space: 'medium'` |
| Edit short answer | Teacher can change via select |
| Switch short → MC | Strip `response_space` |
| Switch MC → short | Set `response_space: 'medium'` |
| Existing lesson missing field | Schema accepts omit; editor shows `medium` when kind is short answer |
| Publish | Pass through on short-answer questions; never required for publish |

No refine that forbids `response_space` on MC is required if the editor always strips it; optional strip in emit/sanitize is enough.

## Editor

In `createQuestionSetEditor`:

1. For each short-answer question, show a **Response space** `<select>` with the five values (labels: None, Short, Medium, Long, Extended).  
2. Hide the select when kind is multiple choice.  
3. Persist via the same `emitChange` path as prompt/kind/options.  
4. When adding a question, default `kind: 'short_answer'`, `response_space: 'medium'`.

## Create defaults

`createBlock('question_set')` default question includes `response_space: 'medium'`.

## Render / student view

**No change.** `renderQuestionSetBlock` continues to show prompt (+ MC options). Do not read or display `response_space` yet.

## Testing

- Schema accepts short-answer with each `response_space` value  
- Schema accepts short-answer without the field (legacy)  
- Create-block default includes `medium`  
- Unit coverage for editor emit is optional if DOM-heavy; prefer schema + create-block tests for this thin slice  

## BUILD.md updates (end of slice)

- History: Response space  
- Next up: first remaining media item (Map / Slides / Document viewer) or next product track  
- Tick Learning activities → Response space  
- Latest note: Response space shipped (schema + editor; print deferred)

## Success criteria

1. Teachers can set response space on short-answer questions and it survives save/publish.  
2. Student lesson view is visually unchanged.  
3. Field is ready for a later A4 slice to consume.  
