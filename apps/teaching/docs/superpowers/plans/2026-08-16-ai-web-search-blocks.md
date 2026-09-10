# AI Web Search and Full-Block Lesson Building Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Teaching Hub AI personality search the public web before generating content and propose any schema-valid lesson block, including a grounded 10-point mind map with real images or videos.

**Architecture:** Teaching Hub owns one Brave-backed `SearchPack` service, education-first ranking, prompt injection, and fail-closed media allowlisting. Ann, Hammond, and Clare consume it in `/api/ai/chat`; Clementine receives the identical pack through the Knowledge Hub `/lesson_proposal` contract. Existing proposal cards and teacher Accept remain the only mutation boundary.

**Tech Stack:** TypeScript, Zod, Vitest, Netlify Functions, Anthropic Messages API, Brave Search API, Cloudflare Workers/Wrangler, existing Teaching Hub `BlockSchema` and AI proposal tools.

**Repositories:**
- Teaching Hub: `/Users/adamrussell/Teaching Hub`
- Knowledge Hub research Worker: `/Users/adamrussell/Projects/knowledge-hub`

**Design:** `docs/superpowers/specs/2026-08-16-ai-web-search-blocks-design.md`

---

## File map

### Teaching Hub

- Create `src/ai/search-pack.ts` — stable `SearchPack` types, empty pack factory, HTTPS normalization, education-first scoring, and Brave response normalization.
- Create `netlify/functions/_shared/brave-search.mts` — the only Brave HTTP client; performs mandatory web/image/video searches and fails soft.
- Create `src/ai/block-recipes.ts` — generation instructions plus exact default JSON examples for every lesson block type.
- Create `src/blocks/walk-blocks.ts` — typed traversal of section/columns/tabs block trees.
- Create `src/ai/search-pack-validation.ts` — collect proposal media references and reject references absent from the request pack.
- Modify `src/ai/context.ts` — put block recipes and the normalized search pack in every fast-path system prompt.
- Modify `netlify/functions/ai-chat.mts` — search before Anthropic and validate every proposal against that pack.
- Modify `src/ai/jobs.ts` — add `searchPack` and recipes to Clementine payload; parse all supported kernel proposal kinds.
- Modify `netlify/functions/_shared/ai-job-complete.mts` — search before calling Knowledge Hub and validate its proposal.
- Modify `scripts/mock-api.ts` — deterministic search fixture and 10-point cheese mind-map proposal.
- Modify `.env.example` — document `BRAVE_SEARCH_API_KEY`.
- Modify `docs/specs/06_AI_AGENT.md` — replace placeholder-only media guidance with exact search-pack allowlisting.
- Tests: `tests/unit/search-pack.test.ts`, `tests/unit/brave-search.test.ts`, `tests/unit/search-pack-validation.test.ts`, plus focused changes to existing AI/job/mock tests.

### Knowledge Hub

- Create `src/research/lessonProposal.ts` — build Clementine’s lesson-building prompt, call Anthropic, and parse JSON without trusting it as validated.
- Modify `src/research/http.ts` — authenticate and route `POST /lesson_proposal`.
- Modify `worker/src/index.ts` — bind the new generator with `ANTHROPIC_API_KEY`.
- Tests: create `src/research/lessonProposal.test.ts`; extend `src/research/http.test.ts`.

---

### Task 1: SearchPack contract and education-first normalization

**Files:**
- Create: `src/ai/search-pack.ts`
- Create: `tests/unit/search-pack.test.ts`

- [ ] **Step 1: Write failing normalization and ranking tests**

Create tests with fixed provider fixtures:

```ts
import { describe, expect, it } from 'vitest';
import {
  emptySearchPack,
  educationScore,
  normalizeBraveSearchResults
} from '@/ai/search-pack';

describe('SearchPack', () => {
  it('boosts education and reference sources above thin commercial pages', () => {
    expect(educationScore('https://www.britannica.com/topic/cheese')).toBeGreaterThan(
      educationScore('https://best-cheese-deals.example/listicle')
    );
    expect(educationScore('https://www.si.edu/object/food-history')).toBeGreaterThan(0);
    expect(educationScore('https://www.cam.ac.uk/research')).toBeGreaterThan(0);
  });

  it('keeps only HTTPS web, image, YouTube, and Vimeo results', () => {
    const pack = normalizeBraveSearchResults({
      query: 'cheese types',
      searchedAt: '2026-08-16T00:00:00.000Z',
      web: {
        web: {
          results: [
            { title: 'Museum', url: 'https://museum.example/cheese', description: 'History' },
            { title: 'Unsafe', url: 'http://unsafe.example', description: 'Drop me' }
          ]
        }
      },
      images: {
        results: [
          {
            title: 'Cheese wheel',
            url: 'https://museum.example/cheese',
            properties: { url: 'https://images.example/cheese.jpg', width: 1200, height: 800 }
          }
        ]
      },
      videos: {
        results: [
          { title: 'How cheese is made', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
          { title: 'Other host', url: 'https://video.example/watch/1' }
        ]
      }
    });

    expect(pack.available).toBe(true);
    expect(pack.sources).toHaveLength(1);
    expect(pack.images[0]?.image_url).toBe('https://images.example/cheese.jpg');
    expect(pack.videos).toEqual([
      {
        provider: 'youtube',
        external_id: 'dQw4w9WgXcQ',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'How cheese is made'
      }
    ]);
  });

  it('creates an unavailable empty pack without throwing', () => {
    expect(emptySearchPack('cheese types', '2026-08-16T00:00:00.000Z')).toEqual({
      query: 'cheese types',
      searched_at: '2026-08-16T00:00:00.000Z',
      available: false,
      sources: [],
      images: [],
      videos: []
    });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd "/Users/adamrussell/Teaching Hub"
npx vitest run tests/unit/search-pack.test.ts
```

Expected: FAIL because `@/ai/search-pack` does not exist.

- [ ] **Step 3: Implement the pure contract**

Create `src/ai/search-pack.ts` with:

```ts
import { parseVideoInput, type VideoProvider } from '@/blocks/video-url';

export type SearchSource = {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  education_score: number;
};

export type SearchImage = {
  image_url: string;
  source_page_url: string;
  title: string;
  width?: number;
  height?: number;
};

export type SearchVideo = {
  provider: VideoProvider;
  external_id: string;
  url: string;
  title: string;
};

export type SearchPack = {
  query: string;
  searched_at: string;
  available: boolean;
  sources: SearchSource[];
  images: SearchImage[];
  videos: SearchVideo[];
};

export function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const EDUCATION_HOSTS = [
  'britannica.com',
  'si.edu',
  'smithsonianmag.com',
  'nationalgeographic.com',
  'khanacademy.org',
  'unesco.org',
  'australian.museum',
  'nma.gov.au'
] as const;

export function educationScore(value: string): number {
  const url = httpsUrl(value);
  if (!url) return -1000;
  const host = new URL(url).hostname.toLowerCase();
  let score = 0;
  if (/(^|\.)edu(\.|$)/.test(host) || /(^|\.)ac\.[a-z]{2}$/.test(host)) score += 100;
  if (/(^|\.)gov(\.|$)/.test(host) || /(^|\.)gov\.[a-z]{2}$/.test(host)) score += 90;
  if (EDUCATION_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`))) score += 80;
  if (/museum|university|encyclop/.test(host)) score += 50;
  if (/pinterest|facebook|instagram|tiktok/.test(host)) score -= 80;
  return score;
}

export function emptySearchPack(query: string, searchedAt = new Date().toISOString()): SearchPack {
  return {
    query,
    searched_at: searchedAt,
    available: false,
    sources: [],
    images: [],
    videos: []
  };
}
```

Add small record-reading helpers and `normalizeBraveSearchResults` that:

1. Reads `web.web.results`, `images.results`, and `videos.results` from unknown JSON.
2. Drops non-HTTPS URLs.
3. Converts video URLs using existing `parseVideoInput`.
4. Sorts sources descending by `education_score`, preserving provider order for ties.
5. Caps normalized arrays at 8 web, 6 images, and 6 videos.
6. Sets `available: true` when at least one Brave endpoint returned parseable JSON, even if a particular result array is empty.

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npx vitest run tests/unit/search-pack.test.ts
npx tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/search-pack.ts tests/unit/search-pack.test.ts
git commit -m "Add normalized education-first AI search packs"
```

---

### Task 2: Brave web, image, and video client

**Files:**
- Create: `netlify/functions/_shared/brave-search.mts`
- Create: `tests/unit/brave-search.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing client tests**

Test all three endpoint requests, strict safe search, key privacy, partial failure, missing key, and timeout behavior. The principal test should use:

```ts
const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const value = String(url);
  expect((init?.headers as Record<string, string>)['X-Subscription-Token']).toBe('brave-key');
  if (value.includes('/web/search')) {
    return Response.json({
      web: {
        results: [
          {
            title: 'Encyclopaedia Britannica',
            url: 'https://www.britannica.com/topic/cheese',
            description: 'Cheese facts'
          }
        ]
      }
    });
  }
  if (value.includes('/images/search')) {
    return Response.json({ results: [] });
  }
  return Response.json({ results: [] });
});

const pack = await searchPublicWeb({
  query: '10 point mind map on cheese types',
  apiKey: 'brave-key',
  fetchImpl,
  now: () => '2026-08-16T00:00:00.000Z'
});

expect(fetchImpl).toHaveBeenCalledTimes(3);
expect(pack.available).toBe(true);
expect(pack.sources[0]?.domain).toBe('www.britannica.com');
expect(JSON.stringify(pack)).not.toContain('brave-key');
```

Also assert `apiKey: undefined` makes zero fetch calls and returns `emptySearchPack`, while three HTTP 500 responses return an unavailable pack rather than throwing.

- [ ] **Step 2: Run test and verify failure**

```bash
npx vitest run tests/unit/brave-search.test.ts
```

Expected: FAIL because `brave-search.mts` does not exist.

- [ ] **Step 3: Implement `searchPublicWeb`**

Use one fixed origin:

```ts
const BRAVE_ORIGIN = 'https://api.search.brave.com/res/v1';
const SEARCH_TIMEOUT_MS = 4500;
```

Build three URLs:

```ts
[
  ['web', '/web/search', 8],
  ['images', '/images/search', 6],
  ['videos', '/videos/search', 6]
]
```

Every request uses:

```ts
{
  q: query,
  count: String(count),
  search_lang: 'en',
  safesearch: 'strict'
}
```

Headers:

```ts
{
  Accept: 'application/json',
  'Accept-Encoding': 'gzip',
  'X-Subscription-Token': apiKey
}
```

Use `Promise.allSettled`, a shared abort timeout, and `normalizeBraveSearchResults`. No provider body, key, or raw error is returned to the browser. Export:

```ts
export async function searchPublicWeb(input: {
  query: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => string;
  timeoutMs?: number;
}): Promise<SearchPack>
```

- [ ] **Step 4: Document the secret**

Append to `.env.example`:

```dotenv
# Public-web grounding for every lesson AI turn (Netlify Functions only; keep secret)
# BRAVE_SEARCH_API_KEY=
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/unit/search-pack.test.ts tests/unit/brave-search.test.ts
npx tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/brave-search.mts tests/unit/brave-search.test.ts .env.example
git commit -m "Search Brave before lesson AI generation"
```

---

### Task 3: Full block catalogue and grounded prompt

**Files:**
- Create: `src/ai/block-recipes.ts`
- Modify: `src/ai/context.ts`
- Modify: `tests/unit/ai-agent.test.ts`

- [ ] **Step 1: Write failing prompt tests**

Extend `AI context builder`:

```ts
it('includes mandatory search grounding and recipes for mind maps and activities', () => {
  const prompt = buildAiSystemPrompt({
    agentName: "Ann O'Tation",
    protocol: 'Be precise.',
    lesson: lessonFixture({ title: 'Cheese' }),
    scope: 'lesson',
    selectedBlockId: null,
    searchPack: {
      query: '10 point mind map on cheese types',
      searched_at: '2026-08-16T00:00:00.000Z',
      available: true,
      sources: [{
        title: 'Cheese',
        url: 'https://www.britannica.com/topic/cheese',
        snippet: 'Cheese is made from milk.',
        domain: 'www.britannica.com',
        education_score: 80
      }],
      images: [],
      videos: []
    }
  });

  expect(prompt).toContain('## Search pack');
  expect(prompt).toContain('https://www.britannica.com/topic/cheese');
  expect(prompt).toContain('Always ground generated content in this search pack');
  expect(prompt).toContain('mind_map');
  expect(prompt).toContain('nodes: 1–24');
  expect(prompt).toContain('question_set');
  expect(prompt).toContain('image/video/embed URLs must come from the search pack');
  expect(prompt).toContain('"block_type":"mind_map"');
  expect(prompt).toContain('"block_type":"question_set"');
});
```

Add a second test for `available: false` asserting the prompt says to omit media URLs and clearly report unavailable search.
Add a table-driven assertion over `NEW_BLOCK_TYPES.filter(type => type !== 'collection')` that every lesson block type appears in the schema examples.

- [ ] **Step 2: Run the test and verify failure**

```bash
npx vitest run tests/unit/ai-agent.test.ts
```

Expected: FAIL because `AiContextInput` has no `searchPack`.

- [ ] **Step 3: Implement `BLOCK_BUILD_RECIPES`**

Create one exported recipe string and one generated catalogue. The generated catalogue uses `createBlock`, so the model sees the actual required shape instead of guessing fields:

```ts
import { createBlock, NEW_BLOCK_TYPES } from '@/blocks/create-block';

export const BLOCK_BUILD_RECIPES = `
## Block building recipes
- Prose: rich_text (sanitised HTML), heading, callout, quote, definition, code.
- Media: image, gallery, video, embed, audio, attachment. Give images meaningful alt_text. image/video/embed URLs must come from the search pack.
- Activities: question_set, flashcards, cloze, self_check, accordion, table.
- Visuals: chart, equation, diagram, timeline.
- mind_map: content { title?, nodes, edges }; nodes: 1–24; for "10 point" create 10 meaningful topic nodes and connect them with valid node ids.
- concept_map: content { title?, nodes, edges }; use labelled concepts and valid directed relationships.
- Layout: section, columns, tabs, spacer. Put child blocks in the schema's content.blocks / columns[].blocks / tabs[].blocks fields.
- Advanced: html and html_app only when explicitly requested; collection is homepage-only and must not be inserted into lessons.
All proposed blocks require id, type:"block", block_type, variant, visibility, content, layout, print, settings, created_at, updated_at, schema_version:1.
`.trim();

export function buildBlockSchemaExamples(): string {
  const examples = NEW_BLOCK_TYPES
    .filter(type => type !== 'collection')
    .map(type => {
      const block = createBlock(type, `${type}_example`);
      return {
        ...block,
        created_at: '<ISO timestamp>',
        updated_at: '<ISO timestamp>'
      };
    });
  return JSON.stringify(examples);
}
```

- [ ] **Step 4: Inject pack and recipes into `buildAiSystemPrompt`**

Add `searchPack: SearchPack` to `AiContextInput`. Append:

```ts
parts.push(
  '',
  BLOCK_BUILD_RECIPES,
  '## Exact block JSON examples',
  buildBlockSchemaExamples(),
  '',
  '## Search pack',
  '- Always ground generated content in this search pack.',
  '- Never invent citations, image URLs, video URLs, embed URLs, or external ids.',
  '- Every image/video/embed URL must come from the search pack.',
  input.searchPack.available
    ? JSON.stringify(input.searchPack)
    : 'Web search unavailable. Build text/structure only; omit external media URLs and say search was unavailable.'
);
```

Update all existing direct callers in tests with `emptySearchPack(...)` until route integration supplies a real pack.

- [ ] **Step 5: Run tests and typecheck**

```bash
npx vitest run tests/unit/ai-agent.test.ts tests/unit/composition-fill.test.ts
npx tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ai/block-recipes.ts src/ai/context.ts tests/unit/ai-agent.test.ts tests/unit/composition-fill.test.ts
git commit -m "Teach every agent how to build every lesson block"
```

---

### Task 4: Fail-closed proposal media allowlist

**Files:**
- Create: `src/blocks/walk-blocks.ts`
- Create: `src/ai/search-pack-validation.ts`
- Create: `tests/unit/search-pack-validation.test.ts`

- [ ] **Step 1: Write failing nested validation tests**

Cover all proposal surfaces and nested layouts. At minimum:

```ts
it('accepts image and video references returned by search', () => {
  expect(validateProposalAgainstSearchPack(proposalWithAllowedMedia, pack)).toEqual({ ok: true });
});

it('rejects an invented YouTube id', () => {
  const result = validateProposalAgainstSearchPack(proposalWithVideo('AAAAAAAAAAA'), pack);
  expect(result).toMatchObject({
    ok: false,
    violations: [
      expect.objectContaining({
        field: 'external_id',
        value: 'AAAAAAAAAAA',
        reason: 'not_in_pack'
      })
    ]
  });
});

it('rejects media nested inside sections, columns, tabs, galleries, flashcards, and timelines', () => {
  const result = validateProposalAgainstSearchPack(nestedProposal, emptySearchPack('q'));
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.violations.map(v => v.path)).toEqual(expect.arrayContaining([
      expect.stringContaining('content.blocks'),
      expect.stringContaining('content.columns'),
      expect.stringContaining('content.tabs'),
      expect.stringContaining('content.items'),
      expect.stringContaining('content.cards'),
      expect.stringContaining('content.events')
    ]));
  }
});
```

Also cover `replace_lesson.cover.url`, `embed.url`, `embed.embed_url`, `audio.url`, `attachment.url`, `diagram.image_url`, `timeline.link_url`, and `href`/`src` inside `rich_text`, `html`, and `html_app`.

- [ ] **Step 2: Run and verify failure**

```bash
npx vitest run tests/unit/search-pack-validation.test.ts
```

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement typed block walking**

Export:

```ts
export function visitBlocks(
  blocks: Block[],
  visitor: (block: Block, path: string) => void,
  path = 'blocks'
): void
```

Visit each block, then recurse exactly through:

- `section.content.blocks`
- `columns.content.columns[index].blocks`
- `tabs.content.tabs[index].blocks`

- [ ] **Step 4: Implement reference collection and validation**

Define:

```ts
export type SearchPackViolation = {
  path: string;
  block_type?: Block['block_type'];
  field: string;
  value: string;
  reason: 'not_in_pack' | 'pack_unavailable';
};

export function validateProposalAgainstSearchPack(
  proposal: AiProposal,
  pack: SearchPack
): { ok: true } | { ok: false; violations: SearchPackViolation[] }
```

Collect structured fields:

- `image.content.url`
- `gallery.content.items[].url`
- `video.content.provider` + `external_id` + optional `url`
- `embed.content.url` and `embed_url`
- `audio.content.url`
- `attachment.content.url`
- `flashcards.content.cards[].image_url`
- `diagram.content.image_url`
- `timeline.content.events[].image_url` and `link_url`
- `replace_lesson.cover.url`

Extract absolute HTTPS `href` and `src` values from `rich_text.content.html`, `html.content.html`, and `html_app.content.html` using a deterministic attribute regex. Ignore relative paths and empty strings.

Allowed exact URLs are:

```ts
new Set([
  ...pack.sources.map(item => item.url),
  ...pack.images.flatMap(item => [item.image_url, item.source_page_url]),
  ...pack.videos.map(item => item.url)
])
```

Allowed videos also match exact `provider + external_id`. If `pack.available === false`, any collected external reference is a `pack_unavailable` violation. Return every violation so tests and server logs identify the precise path.

- [ ] **Step 5: Run focused and regression tests**

```bash
npx vitest run tests/unit/search-pack-validation.test.ts tests/unit/ai-agent.test.ts
npx tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/blocks/walk-blocks.ts src/ai/search-pack-validation.ts tests/unit/search-pack-validation.test.ts
git commit -m "Reject AI media that was not returned by search"
```

---

### Task 5: Wire mandatory search into Ann, Hammond, and Clare

**Files:**
- Modify: `netlify/functions/ai-chat.mts`
- Create: `tests/unit/ai-chat-route.test.ts`
- Modify: `tests/unit/ai-chat-mock.test.ts`

- [ ] **Step 1: Write failing route tests**

Mock `fetch` by destination:

1. Brave web/image/video calls return fixtures.
2. Anthropic captures its request body and returns an SSE tool call containing a 10-node `mind_map`.

Assert:

```ts
expect(braveCalls).toHaveLength(3);
expect(anthropicBody.system).toContain('## Search pack');
expect(anthropicBody.system).toContain('britannica.com');
expect(response.status).toBe(200);
expect(await response.text()).toContain('"block_type":"mind_map"');
```

Add a second Anthropic fixture that proposes an invented image URL. Assert the SSE contains `tool_error`, does not contain a `proposal` event for that tool call, and lets the tool loop retry.

Add a search-outage test: three Brave failures still call Anthropic with `available:false`; a plain mind-map proposal succeeds; any media proposal is rejected.

- [ ] **Step 2: Run route tests and verify failure**

```bash
npx vitest run tests/unit/ai-chat-route.test.ts
```

Expected: FAIL because `/api/ai/chat` does not call Brave and `buildAiSystemPrompt` now requires a pack.

- [ ] **Step 3: Search before prompt construction**

In `ai-chat.mts`, after loading the lesson and before building the prompt:

```ts
const searchPack = await searchPublicWeb({
  query: `${body.message}\nLesson: ${lesson.title}`,
  apiKey: env.BRAVE_SEARCH_API_KEY
});
```

Pass `searchPack` to `buildAiSystemPrompt`.

- [ ] **Step 4: Validate every tool proposal**

After `parseToolProposal` succeeds:

```ts
const media = validateProposalAgainstSearchPack(proposal, searchPack);
if (!media.ok) {
  const error = `Proposal used media not returned by web search: ${media.violations
    .map(item => `${item.path}=${item.value}`)
    .join(', ')}`;
  send({ type: 'tool_error', name: toolEvent.name, error });
  return JSON.stringify({ ok: false, error });
}
```

Only emit `{ type: 'proposal' }` after this check.

- [ ] **Step 5: Keep local mock deterministic**

Add a `MOCK_SEARCH_PACK` fixture in `scripts/mock-api.ts`. When the message matches `/mind\s*map.*cheese|cheese.*mind\s*map/i`, return `insert_blocks` containing:

- one `mind_map`
- exactly 10 nodes
- valid edges joining the central “Cheese types” node to the remaining nodes
- schema timestamps/metadata

Update `tests/unit/ai-chat-mock.test.ts` to post “build a 10 point mind map on cheese types” and assert the SSE proposal has `kind: "insert_blocks"`, `block_type: "mind_map"`, and 10 nodes.

- [ ] **Step 6: Run focused tests**

```bash
npx vitest run tests/unit/ai-chat-route.test.ts tests/unit/ai-chat-mock.test.ts
npx tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/ai-chat.mts scripts/mock-api.ts tests/unit/ai-chat-route.test.ts tests/unit/ai-chat-mock.test.ts
git commit -m "Ground fast lesson agents in mandatory web search"
```

---

### Task 6: Extend the Clementine payload and Teaching Hub parser

**Files:**
- Modify: `src/ai/jobs.ts`
- Modify: `tests/unit/ai-jobs-payload.test.ts`
- Modify: `tests/unit/ai-jobs-kernel.test.ts`

- [ ] **Step 1: Write failing payload tests**

Update `buildKernelJobPayload` test to pass a pack and assert:

```ts
expect(payload.searchPack).toBe(searchPack);
expect(payload.blockRecipes).toContain('mind_map');
expect(payload.blockRecipes).toContain('question_set');
```

- [ ] **Step 2: Write failing multi-kind parser tests**

Add:

```ts
it('accepts an insert_blocks proposal from the kernel', () => {
  const outcome = classifyKernelResponse({
    secret: 's',
    status: 200,
    payload: {
      proposal: {
        kind: 'insert_blocks',
        position: 'below',
        blocks: [mindMapBlock]
      }
    },
    searchPack: emptySearchPack('cheese')
  });
  expect(outcome).toMatchObject({
    kind: 'ok',
    proposal: { kind: 'insert_blocks' }
  });
});
```

Use a no-media mind map so unavailable search does not violate media policy. Add `replace_block`, `review_only`, backward-compatible bare `replace_lesson`, and invented-media rejection cases.

- [ ] **Step 3: Run tests and verify failure**

```bash
npx vitest run tests/unit/ai-jobs-payload.test.ts tests/unit/ai-jobs-kernel.test.ts
```

Expected: FAIL because the payload has no pack and parser only accepts whole-lesson replacement.

- [ ] **Step 4: Extend the payload**

Update:

```ts
export type KernelJobPayload = {
  query: string;
  lesson: unknown;
  transcript: AiTranscriptTurn[];
  searchPack: SearchPack;
  blockRecipes: string;
  archive: { findings: ArchivePull['findings']; archiveFailed: boolean; note: string };
  findings: ArchivePull['findings'];
  archiveFailed: boolean;
};
```

Require `searchPack` in `buildKernelJobPayload` input and set `blockRecipes: BLOCK_BUILD_RECIPES`.

- [ ] **Step 5: Parse generic proposals**

Change `proposalFromKernelPayload(payload, searchPack)`:

1. Read `raw.proposal ?? raw`.
2. If `kind` is absent, preserve backward compatibility by parsing it as `propose_replace_lesson`.
3. Map:
   - `replace_block` → `propose_replace_block`
   - `replace_section` → `propose_replace_section`
   - `replace_lesson` → `propose_replace_lesson`
   - `insert_blocks` → `propose_insert_blocks`
   - `delete_blocks` → `propose_delete_blocks`
   - `reorder_blocks` → `propose_reorder_blocks`
   - `review_only` → `review_only`
4. Pass the object without `kind` to `parseToolProposal`.
5. Reject parse errors and `validateProposalAgainstSearchPack` failures.

Thread `searchPack` through `ClassifyKernelInput`.

- [ ] **Step 6: Run tests and typecheck**

```bash
npx vitest run tests/unit/ai-jobs-payload.test.ts tests/unit/ai-jobs-kernel.test.ts
npx tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ai/jobs.ts tests/unit/ai-jobs-payload.test.ts tests/unit/ai-jobs-kernel.test.ts
git commit -m "Broaden Clementine jobs to all lesson proposals"
```

---

### Task 7: Search and validate the Clementine job path

**Files:**
- Modify: `netlify/functions/_shared/ai-job-complete.mts`
- Create: `tests/unit/ai-job-complete.test.ts`

- [ ] **Step 1: Write failing job-completion tests**

Seed a working Clementine job and lesson. Mock:

- Brave’s three endpoints.
- `/quick_research`.
- `/lesson_proposal` returning `insert_blocks` with a 10-node mind map.

Assert the `/lesson_proposal` request contains:

```ts
{
  searchPack: expect.objectContaining({ available: true }),
  blockRecipes: expect.stringContaining('mind_map')
}
```

Assert persisted job status is `done` with `proposal.kind === 'insert_blocks'`.

Add a kernel response with an image URL outside the pack; expect persisted job status `error` with “invalid proposal,” not a fixture.

- [ ] **Step 2: Run and verify failure**

```bash
npx vitest run tests/unit/ai-job-complete.test.ts
```

Expected: FAIL because job completion does not search or send a pack.

- [ ] **Step 3: Search alongside archive retrieval**

After lesson/transcript load:

```ts
const [archive, searchPack] = await Promise.all([
  kernelSecret
    ? pullArchive({ query: job.message, documentContext: `${lesson.title}\n${job.message}`, url: env.RESEARCH_KERNEL_URL, secret: kernelSecret })
    : Promise.resolve(undefined),
  searchPublicWeb({
    query: `${job.message}\nLesson: ${lesson.title}`,
    apiKey: env.BRAVE_SEARCH_API_KEY
  })
]);
```

Pass `searchPack` into `buildKernelJobPayload` and into kernel response classification.

- [ ] **Step 4: Generalize transcript copy**

Replace the hard-coded assistant text:

```ts
'Proposed a replace_lesson draft.'
```

with:

```ts
job.proposal ? `Proposed a ${job.proposal.kind} change.` : 'Completed without a proposal.'
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/unit/ai-job-complete.test.ts tests/unit/ai-jobs-kernel.test.ts tests/unit/ai-jobs-payload.test.ts
npx tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/ai-job-complete.mts tests/unit/ai-job-complete.test.ts
git commit -m "Give Clementine the shared web search pack"
```

---

### Task 8: Implement Knowledge Hub `/lesson_proposal`

Work in `/Users/adamrussell/Projects/knowledge-hub`.

**Files:**
- Create: `src/research/lessonProposal.ts`
- Create: `src/research/lessonProposal.test.ts`
- Modify: `src/research/http.ts`
- Modify: `src/research/http.test.ts`
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Write failing prompt/parser tests**

Create a fixture request containing `query`, lesson JSON, transcript, archive, `searchPack`, and `blockRecipes`. Test:

```ts
const prompt = buildLessonProposalPrompt(request);
expect(prompt).toContain('10 point mind map on cheese types');
expect(prompt).toContain('britannica.com');
expect(prompt).toContain('mind_map');
expect(prompt).toContain('Return only JSON');
```

Test robust JSON extraction from plain JSON and fenced JSON:

```ts
expect(parseLessonProposalJson('```json\n{"proposal":{"kind":"review_only","summary":"Sound"}}\n```'))
  .toEqual({ proposal: { kind: 'review_only', summary: 'Sound' } });
```

Test `runLessonProposal` sends `claude-sonnet-4-6`, includes the full prompt, and returns parsed JSON from a mocked Anthropic response.

- [ ] **Step 2: Run and verify failure**

```bash
cd "/Users/adamrussell/Projects/knowledge-hub"
npm test -- src/research/lessonProposal.test.ts
```

Expected: FAIL because `lessonProposal.ts` does not exist.

- [ ] **Step 3: Implement the generator**

Export:

```ts
export function buildLessonProposalPrompt(input: unknown): string
export function parseLessonProposalJson(raw: string): { proposal: unknown } | null
export async function runLessonProposal(input: {
  payload: unknown;
  apiKey: string;
  fetchImpl?: typeof fetch;
  model?: string;
}): Promise<{ proposal: unknown }>
```

The prompt must:

- use Clementine’s existing voice via `assembleClementinePrompt`, `voice`, and `university`;
- state that Teaching Hub is the authority that will validate the response;
- include the exact `blockRecipes`, `searchPack`, lesson, archive, and transcript supplied by Teaching Hub;
- permit `insert_blocks`, `replace_block`, `replace_lesson`, and `review_only`;
- require media URLs to be copied exactly from `searchPack`;
- require only JSON: `{ "proposal": { "kind": "...", ... } }`.

Call Anthropic with:

```ts
{
  model: input.model ?? 'claude-sonnet-4-6',
  max_tokens: 8192,
  messages: [{ role: 'user', content: buildLessonProposalPrompt(input.payload) }]
}
```

Throw on non-2xx or unparseable JSON so the Worker returns 502 and Teaching Hub marks the job error.

- [ ] **Step 4: Write a failing HTTP route test**

Extend `bindings()` with:

```ts
proposeLesson: async body => ({ proposal: { kind: 'review_only', summary: String(body) } })
```

POST authenticated JSON to `/lesson_proposal`. Assert status 200 and `proposal.kind === 'review_only'`. Add malformed JSON → 400.

- [ ] **Step 5: Implement the route**

Add to `ResearchBindings`:

```ts
proposeLesson: (payload: unknown) => Promise<unknown>;
```

Add a JSON body reader and route before the 404:

```ts
if (request.method === 'POST' && path.endsWith('/lesson_proposal')) {
  const payload = await readJson(request);
  if (!payload) return json(400, { error: 'valid JSON body is required' }, headers);
  try {
    return json(200, await bindings.proposeLesson(payload), headers);
  } catch (error) {
    return json(502, { error: 'Lesson proposal failed', detail: String(error) }, headers);
  }
}
```

- [ ] **Step 6: Bind the Worker**

In `worker/src/index.ts`, import `runLessonProposal` and add:

```ts
proposeLesson: payload =>
  runLessonProposal({
    payload,
    apiKey: env.ANTHROPIC_API_KEY
  })
```

`WorkerEnv` already extends `ResearchEnv`, which extends `KernelEnv`; `KernelEnv` defines the required `ANTHROPIC_API_KEY: string`. Use that typed binding directly without a cast.

- [ ] **Step 7: Run Knowledge Hub verification**

```bash
npm test -- src/research/lessonProposal.test.ts src/research/http.test.ts
npm run test:unit
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit in Knowledge Hub**

```bash
git add src/research/lessonProposal.ts src/research/lessonProposal.test.ts src/research/http.ts src/research/http.test.ts worker/src/index.ts
git commit -m "Add grounded Clementine lesson proposals"
```

---

### Task 9: Update policy docs and add browser acceptance

Work in Teaching Hub.

**Files:**
- Modify: `docs/specs/06_AI_AGENT.md`
- Create: `tests/browser/ai-build-blocks.spec.ts`

- [ ] **Step 1: Update §§46–47**

Replace placeholder-only guidance with:

```md
The AI must not invent Google Drive IDs, resource URLs, video URLs, embed URLs,
syllabus URLs, Lesson IDs, Unit IDs, or curriculum outcome codes.

Every content-generation turn receives a server-produced Search Pack. The AI may
use an external image, video, embed, or source URL only when that exact URL (or
the matching parsed YouTube/Vimeo provider + external id) appears in that turn's
Search Pack. The server validates this before showing an Accept card.

If search is unavailable or returns no suitable media, the AI must omit external
media or propose an empty media requirement. It must not fabricate a URL.
```

- [ ] **Step 2: Write the browser acceptance test**

Sign in, open a lesson, open chat, send:

```text
build a 10 point mind map on cheese types
```

Wait for the proposal card. Click Accept. Assert:

```ts
const map = page.locator('[data-block-type="mind_map"]');
await expect(map).toBeVisible();
await expect(map.locator('[data-node-id]')).toHaveCount(10);
```

The mind-map renderer does not promise `data-node-id`, so assert the saved lesson returned by the mock API contains one `mind_map` block with exactly 10 `content.nodes`. Also assert the thread does not contain “cannot be retried,” “invalid proposal,” or “selected_block_id not found.”

- [ ] **Step 3: Run browser and unit verification**

```bash
PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" npx playwright test tests/browser/ai-build-blocks.spec.ts
npm test
npm run build
```

Expected:

- Browser test PASS.
- All unit/integration test files PASS.
- Typecheck/Vite build PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/specs/06_AI_AGENT.md tests/browser/ai-build-blocks.spec.ts
git commit -m "Document and verify grounded AI lesson building"
```

---

### Task 10: Configure, deploy, and production-smoke-test

No source code changes are expected in this task.

- [ ] **Step 1: Create/configure the Brave Search API secret**

Obtain a Brave Search API key and set it as a **secret** environment variable on the Netlify Functions site serving `teaching-api.adam-russell.com`:

```text
BRAVE_SEARCH_API_KEY=<secret value>
```

Confirm it is available to Functions/runtime and not exposed to frontend build variables. Never print or commit the value.

- [ ] **Step 2: Deploy Knowledge Hub research Worker**

Load the Wrangler skill before running deployment commands, then:

```bash
cd "/Users/adamrussell/Projects/knowledge-hub"
npm run research:deploy
```

Expected: successful deployment of `knowledge-hub-research`; `/lesson_proposal` no longer returns 404 when called with the shared secret.

- [ ] **Step 3: Push both repositories**

```bash
cd "/Users/adamrussell/Projects/knowledge-hub"
git push

cd "/Users/adamrussell/Teaching Hub"
git push
```

Do not force-push.

- [ ] **Step 4: Check deployed readiness without exposing secrets**

Use authenticated readiness/route checks. Confirm:

- Teaching AI chat still reports Anthropic configured.
- A real agent turn causes Brave search calls server-side.
- Clementine’s job reaches `/lesson_proposal` rather than the old 404 fixture.
- Logs contain no API keys or complete provider response bodies.

- [ ] **Step 5: Production smoke test**

In the live lesson builder:

1. Select Ann and send “build a 10 point mind map on cheese types.”
2. Confirm the proposal contains a real 10-node mind map and source-grounded labels.
3. Accept it and confirm the block renders and remains editable.
4. Ask for a relevant YouTube video and image.
5. Confirm returned media resolves and URLs came from the search pack.
6. Repeat the mind-map request with Clementine; confirm the job returns an `insert_blocks` proposal rather than replacing the entire lesson.
7. Reject one proposal and confirm no lesson mutation occurs.

- [ ] **Step 6: Record final evidence**

In the implementation handoff, include:

- Teaching Hub and Knowledge Hub commit hashes.
- Unit/build/browser command summaries.
- Cloudflare Worker deployment identifier.
- Netlify deployment URL/identifier.
- Exact live smoke prompts and observed proposal kinds.

---

## Final self-review checklist

- [ ] Every agent turn searches before model generation.
- [ ] Education-first ranking is deterministic and tested.
- [ ] Search failure is non-fatal but blocks external media.
- [ ] Fast agents and Clementine receive the same `SearchPack`.
- [ ] Every block type has prompt guidance; mind map constraints are explicit.
- [ ] All proposal kinds remain teacher-confirmed.
- [ ] Media allowlisting traverses nested layouts and nested media arrays.
- [ ] Knowledge Hub implements the previously missing `/lesson_proposal`.
- [ ] Local mock proves the exact “10 point mind map on cheese types” acceptance case.
- [ ] Secrets stay server-side and are not logged.
- [ ] Both repositories pass tests/typecheck/build before deployment.
