# Alchemy Lab as an agent: design

Date: 20 October 2026
Status: draft for Adam's review
Replaces: the one-shot block check in `docs/superpowers/specs/2026-10-13-alchemy-block-assistant-design.md` and the passive scans

## Why

Alchemy Lab is meant to make Adam's lessons better using his research and notes. It does not do that, because Ann never reads the notes:

- Search ranks notes on title, tags and the manifest excerpt, and that excerpt is the first 157 characters of the note (`excerptFromBody`, `knowledge-data.mjs`).
- Ann is handed those snippets and never opens a note (`unitAwareSources`: "no page reads").
- She sees at most four blocks, plus a 60-character outline of each other block.
- She gets one Haiku call with a 32 KB prompt cap and a 60 second deadline. She cannot search again once she knows what she is looking for.

Notion AI did this job well with a tool-use loop. It searched, filtered on structured fields, opened the best notes in full, reasoned over the whole page, and wrote small exact-match string patches. This design gives Ann the same loop, plus one check Notion lacked: the code verifies every cited quote against the note before Adam sees the suggestion.

## Decisions (Adam, 20 Oct)

1. **Whole lesson.** One button, "Improve with Ann", works on the whole lesson. The per-block ask stays for quick jobs.
2. **A bigger model.** The deep run uses Sonnet (`claude-sonnet-5-5`, set by `ALCHEMY_AGENT_MODEL`). It runs only when Adam presses the button. It never runs in the background.
3. **One source.** All research and notes now live in the Knowledge Hub, so Ann's tools search only that.
4. **A rules note** (chosen by Claude). Adam picks one Knowledge Hub note as "Ann's lesson rules". Ann reads it first on every run. It lives with his research and is edited in the Knowledge Hub editor, so no new editor is needed. Teaching stores only the note id. With no note chosen, Ann works without rules and the panel says so.
5. **Patches.** Every edit is an exact-match patch: `{blockId, path, oldStr, newStr}`.
6. **Grounding** (chosen by Claude). A sourced suggestion must quote a passage from a note Ann opened in full during this run, and the server checks that the quote appears in that note. A suggestion that fails the check is dropped before Adam sees it. Ann may add at most two suggestions drawn from her own teaching knowledge. They are labelled "Ann's own idea" and carry no source.
7. **Waiting is fine.** Adam presses the button and can leave. The panel shows what Ann is doing and fills with cards when she finishes.

## How a run works

```
Adam presses "Improve with Ann"
  → POST /api/alchemy-agent {lessonId}          quick door: validate, budget, create job, start runner
  → background runner /api/alchemy-agent/run    up to 10 min
       loop (at most 14 model turns):
         Ann calls tools → server runs them → results go back into the conversation
       Ann calls finish
  → job holds proposals + progress log
  ← page polls GET ?job= every 3 s and shows progress, then cards
Adam accepts or rejects each card → patch applied to the live lesson → re-read to confirm
```

### Ann's opening context

These go in the first message, so she needs no tool call to get them:

- The rules note, in full (capped at 8,000 characters).
- The lesson as readable text. Every editable string is labelled with its block id and field path, for example `[b_4f2 · content.html]`. Media, ids and URLs are shown but marked read-only.
- The unit: title, description, outcomes, and the lesson list showing where this lesson sits.
- The unit shelf, meaning notes Ann has found useful for this unit before, as starting points.

The system prompt and this opening context use prompt caching, so later turns don't pay for them again.

### Tools

| Tool | What it returns |
|---|---|
| `search_notes(query, tags?, origin_kind?, origin_label?, area?)` | Up to 10 notes: id, title, tags, origins, and a 300-character passage around the best match, not the note's opening. Filters are exact, like Notion's SQL step. |
| `list_filters()` | The tags and origins in the archive with their counts, so Ann can filter on real values. |
| `read_note(id, offset?)` | Full note body as plain text, 12,000 characters per call, with `offset` for longer notes. Records that the note was opened, which the grounding check needs. |
| `read_lesson(id)` | Another lesson in the unit, for sequencing, as readable text. |
| `propose_edit(blockId, path, oldStr, newStr, why, source?)` | Validates at once and returns `ok` or the reason it failed, so Ann can fix the patch in the same run. `source` is `{noteId, quote}`, or absent for Ann's own idea. |
| `finish(summary)` | Ends the run with a two or three sentence overview for the top of the panel. |

Note bodies and lesson text are data. The system prompt says so, and Ann's only route to a change is through `propose_edit`.

### Search index

Search has to read the whole note, not the first 157 characters. A new Blob, `alchemy/v2/note-text`, holds plain text for every live note (up to 20,000 characters each). It is built from `pages/*.json` and kept fresh by comparing each manifest row's `updated_at`, so a refresh re-reads only changed notes. Deleted notes are dropped on every refresh. Ranking is BM25 over title (weighted ×4), tags (×3) and body. The 300-character passage is the window with the most query terms.

The first build reads every note once from the private data repository. It runs as its own background job, triggered from the panel when no index exists, and the panel shows "Ann is indexing your notes".

### Patch validation (`propose_edit` and again on accept)

A patch is accepted only if every one of these holds:

1. `blockId` exists in the lesson (nested blocks included, via `findAlchemyBlock`).
2. `path` names a string field, and the field is not protected (no ids, URLs, media, `block_type`, visibility).
3. `oldStr` appears exactly once in that field. A zero or multiple match comes back to Ann as an error telling her to add surrounding words.
4. The patched block still passes `BlockSchema` and `protectedContentUnchanged`.
5. For a sourced patch: `noteId` was opened with `read_note` in this run, and `quote` (10 to 400 characters) appears in that note after whitespace and quote-mark normalisation.
6. At most two unsourced patches, and at most 20 patches per run.

### Accepting a card

The client works on the lesson that is open in the editor. Then it:

- applies the patch only if `oldStr` still matches exactly once; otherwise the card is marked stale and stays unapplied;
- saves through the editor's existing apply path (`options.apply` in `block-assistant.ts`) and offers the same timed undo;
- re-reads the lesson and confirms `newStr` is present, the same verify step Notion described.

"Accept all" applies the cards one after another, never in parallel. Reject only dismisses the card. A source note Ann cited is added to the unit shelf when its card is accepted.

## Panel

The panel opens from the lesson editor toolbar.

- **While working:** a live step list ("Reading your rules", "Searching: retrieval practice", "Reading: *note title*", "Drafting 3 suggestions"), taken from the job's progress log.
- **When done:** Ann's summary, then the cards in lesson order. Each card shows the block name, the old text struck through above the new text, Ann's reason, and either the quoted passage with a link to the note or an "Ann's own idea" label.
- **Controls:** Accept, Reject, Accept all.
- **States:** no rules note chosen (with a link to choose one); index building; budget reached; stale card; run failed (Ann's message and a retry button).

A mockup comes first, for Adam to approve before the UI is built.

## Budget and limits

- Run caps: 14 model turns, 400,000 input tokens and 10 minutes, whichever comes first. On a cap, Ann's valid proposals so far are kept and the panel says she stopped early.
- Daily cap: 12 deep runs (`ALCHEMY_AGENT_DAILY_RUNS`). It reuses the lease and record pattern in `alchemy-budget.mjs`, as a new `agent` mode with its own limits.
- One run per lesson at a time. Pressing the button again while a run is working opens that run.

## What changes in the existing Alchemy Lab

- **Passive background scans:** switched off and their scheduler removed. They used Haiku on snippets and cost money for weak results.
- **Per-block "Ask Ann":** keeps its button. It runs the same agent with the lesson as context, a scope of the one block, and a 6-turn cap.
- **Unit notes shelf and panel:** kept, and they feed the opening context.
- **`/api/alchemy-lab` (the Clementine archive connections):** untouched.
- **Old block check (`runAlchemyCheck`, `/api/alchemy-blocks`):** removed once the per-block ask moves over, together with its tests.

## Out of scope (follow-ups)

- **PDF text.** Attachments sit in R2 with no extracted text, so Ann cannot read the PDF of an article, only the notes about it. Extracting text into the note-text index is the natural next build.
- Web search for outside literature.
- Unit-wide runs across every lesson.

## Privacy

`life-hub` is public. Fixtures and tests use invented notes and lessons. No real note text, student names or Adam's rules appear in code, tests, docs or screenshots. The rules note and the index stay in the private data repository and Blobs.

## Build order (one PR, phases as commits)

1. Note-text index, search and read tools, with unit tests.
2. Agent runner: the loop, tool dispatch, caching, caps, budget mode, progress log, and the job endpoints.
3. Patch validation and the grounding check, on both the server and the client accept path.
4. Mockup, then the panel UI.
5. Rules-note setting, the per-block ask moved onto the agent, passive scans and the old block check removed.
6. Run `npm run pre-pr-check`, open the PR and enable auto-merge.
