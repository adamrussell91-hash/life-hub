# Teaching Hub — AI Agent Integration Design (v1)

**Date:** 2026-08-11  
**Status:** Approved for implementation  
**Product name:** Teaching Hub  
**Slice:** Teacher AI panel — infra + selection + block/section AI + proposals (Phase 13A–C)  
**Parent roadmap:** `docs/BUILD.md` Next up; Phase 13 in `docs/specs/09_IMPLEMENTATION_PLAN.md`  
**Depends on:** Lesson editor, block schemas, teacher auth, Anthropic env (`ANTHROPIC_API_KEY`)  
**Not this slice:** Composition fill; unit/subject scope; Inspector tab; Notion/Central Node writes; Blob chat history; partial accept; Compare/Keep Both; Drive-as-AI-context

## Goal

Teachers work with selected lesson blocks/sections through a Life Hub–style agent chat panel. AI output is schema-validated and applied only after Accept. Deterministic editing remains intact if Anthropic is unavailable.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Approach | Life Hub chat mirror: SSE, agent picker, streaming, proposal confirm cards |
| Agents | Ann (default), Clementine, Hammond, Clare |
| Default agent | Last-used in `localStorage`; Ann on new/expired session |
| Colours | Ann `#5B141A`, Clementine `#3B57A8`, Hammond `#2D2D2D`, Clare `#F7DD4C` |
| Visuals | Circular avatars in picker/bubbles + hero under picker (Life Hub pattern) |
| Scope | Block + Section only; always show `Working with: …` |
| Actions | Full contextual menus from AI capability registry |
| Mutation | Proposals only — Accept / Reject / Regenerate; never silent write/publish |
| Right column | Mode tabs **A4 \| AI** (one at a time) |
| Chat history | In-memory + `localStorage` per lesson (not Blob) |
| Provider | Anthropic server-side only; authenticated `/api/ai/chat` (not public html-app-ai) |

## Architecture

```
Teacher lesson editor
  selected block/section
        │
        ▼
 AI panel (agent + action / freeform)
        │
        ▼
 POST /api/ai/chat (SSE, teacher auth)
        │
  context builder → Anthropic (stream + tools)
        │
        ▼
 SSE: text deltas + validated proposal events
        │
        ▼
 Proposal card → Accept → patch draft → autosave
```

## Agents

| Slug | Name | Colour | Role |
|------|------|--------|------|
| `ann` | Ann O'Tation | `#5B141A` | Teaching coach / lesson sharpness (default) |
| `clementine` | Professor Clementine Haig | `#3B57A8` | Academic writing / register |
| `hammond` | General Hammond | `#2D2D2D` | Overarching judgment when invoked |
| `clare` | Clare DèMind | `#F7DD4C` | Chaos→clarity framing; no Notion task writes |

Condensed operating manuals live under `config/*-protocol.md` (Notion voice/rules adapted for Teaching Hub; no live Notion MCP).

Assets: `public/assets/agents/<slug>.(png|jpg)` and `public/assets/agents/full/<slug>.png`.

## Selection & UI

- Click block row / nested editor chrome sets `selectedBlockId` with clear highlight.
- Selecting a `section` → scope Section; other blocks → Block. Optional “use enclosing section” when nested.
- Right column tabs: A4 | AI; last mode in `sessionStorage`.
- AI panel: picker, hero, scope chip, capability actions, transcript, composer, proposal cards.
- Empty state without selection.

## Tools

Server validates with Zod before emitting to the client:

1. `propose_replace_block` — replace selected block content (preserve id)
2. `propose_replace_section` — replace section tree
3. `propose_insert_blocks` — insert siblings above/below
4. `review_only` — feedback with no mutation

New block ids assigned on Accept via app helpers (`createBlock` / `cloneBlockWithNewIds`). Model must not invent storage keys.

## Capability registry

Per `block_type` (+ section) declares AI action ids and labels. Actions send a structured `action` hint with the chat request; freeform always available.

## Errors

- Missing key / upstream failure → error bubble + retry; lesson editing continues
- Invalid tool payload → reject + optional one repair pass
- Auth failure → teacher 401 pattern

## Out of scope

Composition AI, whole-lesson/unit/subject AI, Inspector, partial accept, Notion/CN writes, Blob-persisted history, version “AI accepted” events beyond normal draft save.
