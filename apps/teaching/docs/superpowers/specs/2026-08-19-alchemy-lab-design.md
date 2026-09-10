# Teaching Hub — Alchemy Lab

**Date:** 2026-08-19  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Alchemy Lab in the lesson editor; Knowledge Hub archive API stays, Alchemist rail goes  
**Depends on:** Lesson builder chrome (`2026-08-15-lesson-builder-canvas-ai-design.md`), teacher session, Knowledge Hub `POST /api/lesson-alchemist`  
**Companion:** Knowledge Hub `docs/superpowers/specs/2026-08-19-alchemist-off-the-rail-design.md`  
**Not this slice:** Ambient-as-you-type; inserting cards as lesson blocks; a Clementine chat shortcut; Coach → Research on Knowledge Hub

## Goal

A teacher designing a lesson in Teaching Hub clicks **Alchemy Lab**, sends the text they are working with, and gets up to five non-obvious connections from their Knowledge Hub archive. The archive stays on Knowledge Hub. The workplace is only Teaching Hub.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Approach | Teaching Hub session proxy to existing Knowledge Hub `/api/lesson-alchemist` |
| Surface | Context-bar button + results panel in the lesson builder’s right column |
| Not | Clementine chat action, new rail item, Knowledge Hub Alchemist workplace |
| Input | Selected block text, editable; paste allowed |
| Output | Up to five cards. No silent writes into the lesson |
| Open note | New tab to Knowledge Hub `#page/<id>` |
| Secret | `ALCHEMIST_SHARED_SECRET` only on Netlify (Teaching Hub + Knowledge Hub). Never in the SPA |
| Local | Mock `/api/alchemy-lab` returns fixture cards. Teaching Hub `npm run dev` does not need Knowledge Hub |

## Architecture

```
Lesson editor (selected block → textarea)
        │
        ▼
 POST /api/alchemy-lab   teaching-api  (cookie session)
        │
        ▼
 POST /api/lesson-alchemist   knowledge-api  (x-alchemist-secret)
        │
        ▼
 retrieve archive → Clementine JSON connections
        │
        ▼
 Lab panel cards → Open in Knowledge Hub (#page/<id>)
```

The browser talks only to `teaching-api.adam-russell.com`. CORS on the Knowledge Hub function is unused for this path (server-to-server). Do not call Knowledge Hub from the SPA.

## Teaching Hub UI

### Control

Add an **Alchemy Lab** button to the lesson context bar actions (same row as Student preview / Save / Publish). Use `.btn.btn--ghost`. Label is the words “Alchemy Lab” — not an unlabelled flask.

The button is only on the lesson editor, not unit/homepage builders.

### Panel

The lesson builder already has a right column for agent chat (`lesson-builder__chat`), default shelved, with a chat FAB.

Alchemy Lab uses that same column. It does not add a fourth column, A4/AI tabs, or a new chrome pattern.

| Action | Column shows |
|--------|----------------|
| Click Alchemy Lab | Unshelve column, show Lab panel, hide AI panel |
| Click chat FAB or unhide chat | Show AI panel, hide Lab panel |
| Hide on Lab or chat | Shelve the column (existing chat-shelved behaviour) |

Lab and chat are never both visible. Opening one replaces the other in the column. Chat FAB styling (agent accent) is unchanged.

Inside the Lab panel, Cotton Glass only: page-header pattern (uppercase eyebrow **Alchemy Lab**, `h1` **Cross-domain connections**), `.glass-panel` form, `.btn.btn--primary` for Find connections, `.btn.btn--ghost` for hide. Do not copy Knowledge Hub `.alchemist*` class names into Teaching Hub. Use `.alchemy-lab` / `.alchemy-lab-card` in Teaching Hub CSS with existing tokens.

Hide control on the Lab panel matches the AI panel hide (ghost button). No extra FAB for Lab. Clicking **Alchemy Lab** while the Lab panel is already visible focuses the textarea. If the column is shelved or showing chat, the button unshelves and shows Lab.

### Query

On open, copy text from the current selected block into the textarea (overwrite whatever was there). Changing the canvas selection while the panel is open does **not** overwrite the textarea.

Empty selection → empty textarea, placeholder: `Paste a lesson outline, learning intention, or topic…`

Ghost control under the textarea: **Use selected block**. Disabled when nothing is selected. Copies selection text into the textarea when clicked.

**Find connections** is disabled when the trimmed textarea is empty, or while a request is in flight (label **Finding links…**).

### Selected-block text

Pure helper `blockQueryText(block: Block | null): string`.

- `rich_text`, `heading`, `quote`, `callout`, `definition`, `code`, `cloze` → `content.text`
- `section`, `accordion`, `tabs`, `columns`, `collection` → recurse children, join with blank lines
- `question_set` / `flashcards` → question stems / front+back strings
- image, gallery, video, embed, audio, attachment, chart, mind_map, concept_map, timeline, diagram, equation, html, html_app, spacer, divider → title, caption, or alt if present; otherwise skip
- Trim, collapse 3+ newlines to 2, cap at 8000 characters

No selection → `""`.

### Cards

Map the Knowledge Hub payload 1:1 (cap at five on the client):

- Depth and Complexity `icon`
- `summary` as the card title
- `whyNonObvious`
- `sourceExcerpt`
- Link **Open “{sourcePageTitle}”** → `{KNOWLEDGE_HUB_ORIGIN}/#page/{sourcePageId}` (`target=_blank`, `rel=noopener noreferrer`)

`KNOWLEDGE_HUB_ORIGIN` is the public Pages origin `https://knowledge-hub.adam-russell.com` (Vite `VITE_KNOWLEDGE_HUB_ORIGIN`, default that URL). Not a secret.

Mode line under the button, same meanings as today:

| `mode` | Line |
|--------|------|
| `synthesis` | Claude synthesis |
| `retrieval` | Retrieval only (no Anthropic key) |
| `local` | Local lexical retrieval (mock only) |
| `empty` | No candidates |

Empty results: `Connections will appear here.` before the first run; after a successful empty run: `No archive connections for this text.`

### Errors

Do not mutate the lesson. Keep the last cards if a new run fails.

| Case | Copy |
|------|------|
| 401 / unauthorized | `Your session expired. Sign in again to keep using Alchemy Lab.` |
| Network / 502 / KH failure | Server `message` if present, else `Alchemy Lab couldn't reach the archive.` Plus `You can try again.` |
| 400 empty text | Client prevents; if it happens, `Lesson text is required.` |

## Teaching Hub API

`POST /api/alchemy-lab`

- Same origin guard + teacher session as `/api/ai/chat`
- Body: `{ lessonText: string }`
- 400 if `lessonText` missing/blank
- 503 if `KNOWLEDGE_ALCHEMIST_URL` or `ALCHEMIST_SHARED_SECRET` unset — `Alchemy Lab is not configured.`
- Forward POST to `KNOWLEDGE_ALCHEMIST_URL` with `Content-Type: application/json` and `x-alchemist-secret`
- Timeout 55s (Netlify function `timeout: 60`)
- Pass through `{ connections, mode }` on 200 (validate: array of objects with `sourcePageId` + `summary` strings; drop invalid items; slice to 5)
- Map KH 401 → 502 `Alchemy Lab couldn't reach the archive.` (do not leak “Unauthorized” from the shared secret)
- Map KH 4xx/5xx / network → 502 with the same teacher-facing message

Response envelope matches Teaching Hub `{ ok, data }` / `{ ok: false, error }`.

Client: `apiPost('/api/alchemy-lab', { lessonText })` with credentials, same as other teacher APIs.

### Env (Teaching Hub Netlify only)

```
KNOWLEDGE_ALCHEMIST_URL=https://knowledge-api.adam-russell.com/api/lesson-alchemist
ALCHEMIST_SHARED_SECRET=<same value as Knowledge Hub>
```

Document both in `.env.example`. Use a distinct `ALCHEMIST_SHARED_SECRET` env var (same *value* as Knowledge Hub’s Alchemist secret). Do not read `RESEARCH_KERNEL_SHARED_SECRET` for this hop.

### Mock

`scripts/mock-api.ts` `POST /api/alchemy-lab` (session required) returns three fixture connections, `mode: "local"`. Empty `lessonText` → 400.

## Knowledge Hub (this slice)

Implemented in the companion spec. Summary:

- Delete the Alchemist rail and `renderAlchemist` / client `runAlchemist` usage
- Keep `netlify/functions/lesson-alchemist.ts` and tests
- Add `#page/<id>` so Lab links land on the note after sign-in

`.alchemist*` CSS used by wiki, podcast, quiz, and coach stays.

## Testing

- Unit: `blockQueryText` (text block, section children, cap, null)
- Unit: Lab panel — prefills on open, does not overwrite on selection change, Find disabled when empty, caps five cards, builds `#page/` hrefs
- Unit: proxy — secret header, 503 when unset, 502 on KH 401, strips invalid items
- Mock: authenticated POST returns fixtures; unauthenticated 401
- Knowledge Hub: rail has no Alchemist; `#page/` opens the page; existing `lesson-alchemist` tests still pass

No Playwright requirement for this slice. Manual check on a real lesson after deploy: context-bar button, one run, one “Open in Knowledge Hub” tab.

## Out of scope

- Ambient Lab while typing
- Insert / Accept as blocks
- Clementine panel action
- Moving Alchemist onto the research Worker
- Knowledge Hub Coach → Research rail
- Unit or homepage Alchemy Lab
