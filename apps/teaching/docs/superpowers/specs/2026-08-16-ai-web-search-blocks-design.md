# Teaching Hub — AI web search and full-block lesson building

**Date:** 2026-08-16  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Give every AI personality mandatory public-web search and the ability to propose any lesson block type (mind maps, activities, images, YouTube, etc.) grounded in real sources  
**Depends on:** Existing AI proposal tools (`AI_TOOLS` / `BlockSchema`), `/api/ai/chat`, Clementine AI jobs + research kernel, image/video block schemas, teacher Accept flow  
**Updates:** `docs/specs/06_AI_AGENT.md` §46–47 (“AI Generated Media References” / “No Fake Resources”) — agents may use media URLs **only** when those URLs appear in the server search pack

## Goal

A teacher can ask any agent (Ann, Hammond, Clare, or Clementine) something like “build a 10 point mind map on cheese types” and get a schema-valid proposal that:

1. Was grounded in a **mandatory** public-web search before the model ran.
2. Preferentially cites **education-first** sources (universities, museums, curriculum bodies, encyclopedias, reputable education publishers).
3. Can include supporting images and YouTube/Vimeo from that same search.
4. Uses any Teaching Hub block type the task needs (mind map, concept map, question set, rich text, video, image, etc.).
5. Still requires teacher **Accept** before the lesson changes.

Manual building never depends on search or AI being up.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Approach | Shared server-side search pack, then existing proposal tools (not model-optional search, not Anthropic-native-only) |
| When to search | **Always**, before every agent turn that generates content |
| Source ranking | Education-first globally (not Australia-only) |
| Image URLs | Any public HTTPS image URL returned by search is allowed |
| Video | Prefer YouTube; accept Vimeo when the pack returns a parseable URL |
| Personalities | All four get the same search pack and the same block-building capability |
| Clementine | Same pack injected into the job path; may propose insert/replace of individual blocks, not only whole-lesson replace |
| Mutation | Proposals only. Accept / Reject / Regenerate. Never silent write. Never publish. |
| Invented URLs | Forbidden. Media/embed URLs must appear in the search pack for that request |
| Search outage | Chat continues; pack empty; agents must not propose media URLs; may note sources unavailable |
| Provider | Brave Search API (web + images + videos) via `BRAVE_SEARCH_API_KEY` on Netlify Functions |
| Local/dev | Mock API returns a fixture search pack |

## Out of scope

- Scraping full page bodies into context (snippets + metadata only in v1)
- Uploading searched media into the Media Library / Drive
- Silent auto-Accept
- Student-facing AI or public search endpoints
- Changing student render of existing blocks
- Replacing Knowledge Hub archive pull for Clementine (archive remains additive research; public search is separate and mandatory)

## Request flow

```text
Teacher message (any agent)
        │
        ▼
┌───────────────────────────┐
│ Shared search module      │
│ Brave: web + image + video│
│ Education-first rank      │
│ Normalize + URL validate  │
└─────────────┬─────────────┘
              │ search pack
              ▼
┌───────────────────────────┐
│ Agent path                │
│ Ann/Hammond/Clare: chat   │
│ Clementine: AI job        │
│ Prompt includes pack +    │
│ block-type recipes        │
└─────────────┬─────────────┘
              │ tool proposal
              ▼
┌───────────────────────────┐
│ Validate BlockSchema      │
│ Reject URLs not in pack   │
│ Stream / job → Accept card│
└───────────────────────────┘
```

1. Teacher sends a message in the lesson builder chat.
2. Server always builds a **search pack** from the message + lesson title/scope.
3. Pack is injected into the system prompt (fast path) or Clementine job payload.
4. Agent proposes changes with existing tools (`propose_insert_blocks`, `propose_replace_block`, `propose_replace_lesson`, etc.).
5. Server validates schema and media URL membership in the pack.
6. Teacher Accepts; draft saves with checkpoint reason `ai_accepted`.

## Search pack

### Shape (conceptual)

```ts
type SearchPack = {
  query: string;
  searched_at: string; // ISO
  available: boolean;  // false when key missing or provider failed
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
    domain: string;
    education_score: number;
  }>;
  images: Array<{
    image_url: string;
    source_page_url: string;
    title: string;
    width?: number;
    height?: number;
  }>;
  videos: Array<{
    provider: 'youtube' | 'vimeo';
    external_id: string;
    url: string;
    title: string;
  }>;
};
```

### Ranking

Boost domains/patterns typical of education and reference (universities, museums, curriculum authorities, encyclopedias, established education publishers). Demote thin SEO and social scrapers. Exact allow/deny lists live in code and can be tuned without changing this spec’s intent.

### URL rules before the model sees results

- HTTPS only.
- Drop non-http(s) schemes and obviously unsafe hosts if present in provider output.
- Videos must parse via existing `parseVideoInput` (YouTube/Vimeo).
- Image URLs must be absolute HTTPS strings; no data: URLs.

### Prompt injection

Include a `## Search pack` section with the JSON pack plus rules:

- Prefer pack sources for factual claims; cite titles/URLs in review text when useful.
- Image/video/embed blocks may only use URLs/`external_id` values from this pack.
- If `available` is false or media arrays are empty, do not invent media; build text/structure blocks only and say sources were unavailable when relevant.

## Block building

### Catalogue recipes

Add a compact block-type recipe list to the system prompt (and Clementine payload) covering every `block_type` in `BlockSchema`, with emphasis on common “build me an activity” types:

- `mind_map` / `concept_map` — `nodes` (1–24) and `edges`; labels from pack facts.
- `question_set` / `self_check` / `flashcards` / `cloze` — activity patterns.
- `image` / `gallery` / `video` — pack-only media fields + required alt text for images.
- Layout (`section`, `columns`, `tabs`) — structure with nested children when needed.

### Success example

Prompt: “build a 10 point mind map on cheese types”

Expected proposal (illustrative):

- One `mind_map` with ~10 nodes grounded in pack sources (e.g. cheddar, brie, …).
- Optional supporting `image` or `video` only if present in the pack.
- Optional short `rich_text` or `callout` with source attribution.
- Teacher Accept applies via existing `applyProposalToLesson`.

### Clementine parity

Today Clementine’s job path primarily yields `replace_lesson`. This slice requires the job completion path to accept the same proposal kinds as chat (at least `insert_blocks`, `replace_block`, `replace_lesson`, `review_only`) so she can add a single mind map without rewriting the whole lesson.

Archive pull (`/quick_research`) remains; public search pack is **additional** and mandatory.

## Media URL policy (spec update)

Replace the prior “never invent URLs; use placeholders only” guidance with:

1. Agents must not invent Drive IDs, syllabus URLs, lesson/unit IDs, or curriculum outcome codes.
2. Agents **may** propose image/video/embed/hotlink URLs **only** when those exact URLs (or parsed video ids) appear in the search pack for this request.
3. If the pack has no suitable media, omit media or leave empty media blocks for the teacher — do not fabricate.

Server enforcement: when parsing tool proposals that contain media fields, reject or strip URLs not in the pack before emitting the Accept card.

## Config and ops

| Variable | Where | Purpose |
|----------|--------|---------|
| `BRAVE_SEARCH_API_KEY` | Netlify Functions (secret) | Brave web/image/video search |
| Existing `ANTHROPIC_API_KEY` | unchanged | Model |
| Existing `RESEARCH_KERNEL_*` | unchanged | Clementine archive |

Document in `.env.example`. Mock API: fixture pack with education-like sources + sample YouTube/image entries.

## Failures

| Condition | Behaviour |
|-----------|-----------|
| Missing Brave key | `available: false`, empty arrays; chat/job continues |
| Brave HTTP error / timeout | Same as missing key; log server-side |
| Invalid tool proposal schema | Existing Anthropic tool-loop rejection / retry |
| Media URL not in pack | Reject that proposal (or strip media fields and fail closed on media) |
| Search slow | Bound time (e.g. few seconds); on timeout treat as unavailable |

## Testing

Minimum automated coverage:

1. Education-first ranking puts boosted domains above junk fixtures.
2. Ann chat path includes search pack in the prompt / context builder.
3. Clementine job payload includes the same pack shape.
4. Fixture “cheese mind map” insert proposal validates and applies on Accept.
5. Proposal with a YouTube URL **not** in the pack is rejected.
6. Search unavailable does not return `selected_block_id` / hard chat failure; pack `available: false`.
7. Mock `/api/ai/chat` and job path work without a real Brave key.

## Architecture notes

- Implement search as one module under `netlify/functions/_shared/` (or `src/ai/` imported by functions) so chat and jobs share one code path.
- Do not download/proxy remote images in v1 (browser loads HTTPS URLs). Keep SSRF risk low by not fetching arbitrary URLs server-side except Brave’s API.
- Keep teacher Accept as the only mutation boundary (design kit agent UX).

## Open implementation details (not product forks)

- Exact education domain boost list.
- Exact Brave query count / safesearch settings.
- Whether stripped-invalid-media vs whole-proposal-reject is the default fail-closed behaviour (prefer whole-proposal reject for clarity).
