# Search / Nav Acceleration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teacher Command-K / rail search panel with hybrid title+content search, recent items, and common actions.

**Architecture:** Client indexes titles/metadata from curriculum (plus compositions list). Content matches come from `GET /api/search?q=` which scans lesson/unit/composition block text on demand. One Clinical Glass panel for empty-state (recent + actions) and typed results. Recent stored in `localStorage`.

**Tech Stack:** TypeScript, Vitest (happy-dom), existing Netlify functions + mock-api, vanilla DOM UI

**Spec:** `docs/superpowers/specs/2026-08-11-search-nav-acceleration-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/blocks/search-text.ts` | Plain-text extract from block trees (+ HTML strip) |
| `src/teacher/search/types.ts` | Shared result / recent / action types |
| `src/teacher/search/recent.ts` | `localStorage` recent store |
| `src/teacher/search/client-search.ts` | Title/metadata hits from curriculum + compositions |
| `src/teacher/search/rank.ts` | Merge client + server hits; deterministic rank |
| `src/teacher/search/actions.ts` | Action registry + visibility |
| `src/teacher/search/api.ts` | `apiGet('/api/search?q=')` wrapper |
| `src/teacher/search/panel.ts` | Modal UI, keyboard, debounce, open/close |
| `netlify/functions/search.mts` | Auth + on-demand content scan |
| `scripts/mock-api.ts` | Mock `/api/search` |
| `src/teacher/rail.ts` / `primary-nav` or shell | Rail search control |
| `src/app/main.ts` | ⌘K binding, panel host, record recent on navigate |
| `src/styles/app.css` | `.search-palette` Clinical Glass styles |
| `tests/unit/search-text.test.ts` | Extractor |
| `tests/unit/search-recent.test.ts` | Recent store |
| `tests/unit/search-client-rank.test.ts` | Client search + merge/rank |
| `tests/unit/search-actions.test.ts` | Action visibility |
| `tests/unit/search-panel.test.ts` | Open/close, keyboard, empty state |
| `tests/unit/search-api.test.ts` | Handler / mock search behaviour |
| `docs/BUILD.md` | History + Next up |

---

### Task 1: Block plain-text extractor

**Files:**
- Create: `src/blocks/search-text.ts`
- Create: `tests/unit/search-text.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { blocksToSearchText, htmlToPlainText, snippetAround } from '@/blocks/search-text';

describe('htmlToPlainText', () => {
  it('strips tags and decodes basic entities', () => {
    expect(htmlToPlainText('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    expect(htmlToPlainText('A &amp; B')).toContain('A');
    expect(htmlToPlainText('A &amp; B')).toContain('B');
  });
});

describe('blocksToSearchText', () => {
  it('concatenates text from nested blocks', () => {
    const heading = createBlock('heading', { content: { text: 'Forces', variant: 'section' } });
    const rich = createBlock('rich_text', {
      content: { html: '<p>Newton&apos;s laws of motion</p>' }
    });
    const text = blocksToSearchText([heading, rich]);
    expect(text.toLowerCase()).toContain('forces');
    expect(text.toLowerCase()).toContain('newton');
    expect(text.toLowerCase()).toContain('laws');
  });

  it('walks columns and tabs children', () => {
    const inner = createBlock('heading', { content: { text: 'Hidden gem', variant: 'subsection' } });
    const columns = createBlock('columns', {
      content: {
        preset: '50-50',
        columns: [{ width: 6, blocks: [inner] }, { width: 6, blocks: [] }]
      }
    });
    expect(blocksToSearchText([columns]).toLowerCase()).toContain('hidden gem');
  });
});

describe('snippetAround', () => {
  it('returns a short excerpt around the first match', () => {
    const hay = 'aaa ' + 'word '.repeat(40) + 'TARGET phrase here ' + 'zzz '.repeat(40);
    const snip = snippetAround(hay, 'target');
    expect(snip.toLowerCase()).toContain('target');
    expect(snip.length).toBeLessThan(160);
  });
});
```

Adjust `createBlock` call shapes to match the real factory signatures in `src/blocks/create-block.ts` (read that file first; use whatever overrides it already accepts).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/search-text.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement extractor**

```ts
// src/blocks/search-text.ts
import type { Block } from '@/schemas';

export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, ' ');
  const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
  return stripped
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function push(parts: string[], value: unknown): void {
  if (typeof value === 'string' && value.trim()) parts.push(value);
}

function extractBlock(block: Block, parts: string[]): void {
  const c = block.content as Record<string, unknown>;
  switch (block.block_type) {
    case 'rich_text':
      push(parts, htmlToPlainText(String(c.html ?? '')));
      break;
    case 'heading':
    case 'callout':
    case 'quote':
    case 'definition':
    case 'code':
    case 'equation':
    case 'cloze':
      push(parts, c.text ?? c.quote ?? c.term ?? c.definition ?? c.code ?? c.latex);
      // also secondary fields where present
      push(parts, c.attribution);
      push(parts, c.term);
      push(parts, c.definition);
      break;
    case 'image':
    case 'video':
    case 'audio':
    case 'attachment':
    case 'embed':
      push(parts, c.alt_text ?? c.title ?? c.caption);
      break;
    case 'question_set':
    case 'flashcards':
    case 'self_check':
    case 'timeline':
    case 'accordion':
    case 'table':
    case 'chart':
    case 'diagram':
    case 'mind_map':
    case 'concept_map':
    case 'gallery':
    case 'html':
    case 'html_app':
    case 'collection':
      // Best-effort: JSON-stringify known string leaves via recursive walk of content
      walkStrings(c, parts);
      break;
    case 'columns': {
      const cols = (c.columns as Array<{ blocks?: Block[] }> | undefined) ?? [];
      for (const col of cols) extractBlocks(col.blocks ?? [], parts);
      break;
    }
    case 'tabs': {
      const panels = (c.panels as Array<{ label?: string; blocks?: Block[] }> | undefined) ?? [];
      for (const panel of panels) {
        push(parts, panel.label);
        extractBlocks(panel.blocks ?? [], parts);
      }
      break;
    }
    case 'section': {
      push(parts, c.title);
      extractBlocks((c.blocks as Block[] | undefined) ?? [], parts);
      break;
    }
    case 'spacer':
    case 'divider':
      break;
    default:
      walkStrings(c, parts);
  }
}

function walkStrings(value: unknown, parts: string[], depth = 0): void {
  if (depth > 8) return;
  if (typeof value === 'string') {
    push(parts, value.includes('<') ? htmlToPlainText(value) : value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, parts, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      walkStrings(v, parts, depth + 1);
    }
  }
}

function extractBlocks(blocks: Block[], parts: string[]): void {
  for (const block of blocks) extractBlock(block, parts);
}

export function blocksToSearchText(blocks: Block[]): string {
  const parts: string[] = [];
  extractBlocks(blocks, parts);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function snippetAround(haystack: string, query: string, radius = 48): string {
  const lower = haystack.toLowerCase();
  const q = query.trim().toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return haystack.slice(0, radius * 2).trim();
  const start = Math.max(0, idx - radius);
  const end = Math.min(haystack.length, idx + q.length + radius);
  const slice = haystack.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${slice}${end < haystack.length ? '…' : ''}`;
}
```

Tune the `switch` branches to the real `Block` content field names (open `src/schemas/block.ts` and align — prefer explicit fields over `walkStrings` where known). The tests above only require heading + rich_text + columns.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm run test:unit -- tests/unit/search-text.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/blocks/search-text.ts tests/unit/search-text.test.ts
git commit -m "$(cat <<'EOF'
feat(search): extract plain text from block trees for indexing

EOF
)"
```

---

### Task 2: Recent store

**Files:**
- Create: `src/teacher/search/types.ts`
- Create: `src/teacher/search/recent.ts`
- Create: `tests/unit/search-recent.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  RECENT_STORAGE_KEY,
  pushRecent,
  readRecent,
  type RecentItem
} from '@/teacher/search/recent';

describe('recent store', () => {
  beforeEach(() => {
    localStorage.removeItem(RECENT_STORAGE_KEY);
  });

  it('pushes newest first and dedupes by type+id', () => {
    pushRecent({ type: 'lesson', id: 'l1', title: 'A', opened_at: '2026-08-11T01:00:00.000Z' });
    pushRecent({ type: 'lesson', id: 'l2', title: 'B', opened_at: '2026-08-11T02:00:00.000Z' });
    pushRecent({ type: 'lesson', id: 'l1', title: 'A updated', opened_at: '2026-08-11T03:00:00.000Z' });
    const items = readRecent();
    expect(items.map((i) => i.id)).toEqual(['l1', 'l2']);
    expect(items[0]?.title).toBe('A updated');
  });

  it('caps at 10', () => {
    for (let i = 0; i < 12; i++) {
      pushRecent({
        type: 'class',
        id: `c${i}`,
        title: `C${i}`,
        opened_at: `2026-08-11T${String(i).padStart(2, '0')}:00:00.000Z`
      });
    }
    expect(readRecent()).toHaveLength(10);
  });

  it('returns [] on corrupt JSON', () => {
    localStorage.setItem(RECENT_STORAGE_KEY, '{nope');
    expect(readRecent()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test:unit -- tests/unit/search-recent.test.ts`

- [ ] **Step 3: Implement types + recent**

```ts
// src/teacher/search/types.ts
export type SearchObjectType =
  | 'lesson'
  | 'unit'
  | 'class'
  | 'subject'
  | 'year'
  | 'scope_sequence'
  | 'scope_note'
  | 'resource'
  | 'composition'
  | 'action';

export interface SearchHit {
  type: SearchObjectType;
  id: string;
  title: string;
  hierarchy?: string;
  snippet?: string;
  /** For ranking: where it matched */
  match: 'title' | 'code' | 'hierarchy' | 'body' | 'action';
  /** Navigation path or action id */
  href?: string;
  actionId?: string;
}

export interface RecentItem {
  type: 'lesson' | 'unit' | 'class';
  id: string;
  title: string;
  opened_at: string;
}

export interface ContentSearchHit {
  type: 'lesson' | 'unit' | 'composition';
  id: string;
  snippet: string;
}
```

```ts
// src/teacher/search/recent.ts
import type { RecentItem } from './types';

export const RECENT_STORAGE_KEY = 'teaching-hub.recent';
const MAX = 10;

export type { RecentItem };

function isRecentItem(value: unknown): value is RecentItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (v.type === 'lesson' || v.type === 'unit' || v.type === 'class') &&
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.opened_at === 'string'
  );
}

export function readRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentItem).slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecent(item: RecentItem): void {
  const next = [item, ...readRecent().filter((r) => !(r.type === item.type && r.id === item.id))].slice(
    0,
    MAX
  );
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/teacher/search/types.ts src/teacher/search/recent.ts tests/unit/search-recent.test.ts
git commit -m "$(cat <<'EOF'
feat(search): localStorage recent items for quick switcher

EOF
)"
```

---

### Task 3: Client title search + merge/rank

**Files:**
- Create: `src/teacher/search/client-search.ts`
- Create: `src/teacher/search/rank.ts`
- Create: `tests/unit/search-client-rank.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import type { CurriculumResponse } from '@/teacher/nav';
import { searchCurriculumTitles } from '@/teacher/search/client-search';
import { mergeAndRankHits } from '@/teacher/search/rank';
import type { ContentSearchHit, SearchHit } from '@/teacher/search/types';

function curriculumFixture(): CurriculumResponse {
  return {
    years: [
      {
        id: 'y12',
        type: 'year',
        title: 'Year 12',
        slug: 'year-12',
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ],
    subjects: [
      {
        id: 'eng',
        type: 'subject',
        title: 'English Advanced',
        display_title: 'English Advanced',
        slug: 'english-advanced',
        year_id: 'y12',
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ],
    units: [
      {
        id: 'u1',
        type: 'unit',
        title: 'Artist of the Floating World',
        slug: 'aotfw',
        year_id: 'y12',
        subject_id: 'eng',
        lesson_ids: ['l1'],
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ],
    lessons: [
      {
        id: 'l1',
        title: 'Memory and Identity',
        slug: 'memory',
        unit_id: 'u1',
        sequence: 1,
        status: 'active',
        published: true,
        updated_at: '2026-01-01T00:00:00.000Z'
      }
    ],
    classes: [
      {
        id: 'c1',
        type: 'class',
        title: 'English Advanced 12A',
        code: '12ENG-A',
        slug: '12eng-a',
        subject_id: 'eng',
        year_id: 'y12',
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ],
    scheduled_lessons: [],
    scope_sequences: [
      {
        id: 'ss1',
        type: 'scope_sequence',
        title: 'English Adv 2026',
        slug: 'eng-2026',
        subject_id: 'eng',
        academic_year: 2026,
        week_count: 40,
        terms: [],
        timeline_items: [
          {
            id: 'n1',
            kind: 'note',
            title: 'HSC trial week',
            start_week: 30,
            end_week: 31,
            order: 0
          }
        ],
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ],
    media: [
      {
        id: 'm1',
        type: 'media',
        title: 'Floating World slides',
        slug: 'fw-slides',
        provider: 'external',
        media_type: 'pdf',
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ],
    schedule_anchor_date: '2026-08-12'
  } as CurriculumResponse;
}

describe('searchCurriculumTitles', () => {
  it('matches lesson title and builds hierarchy', () => {
    const hits = searchCurriculumTitles(curriculumFixture(), 'memory', []);
    const lesson = hits.find((h) => h.type === 'lesson' && h.id === 'l1');
    expect(lesson).toBeTruthy();
    expect(lesson?.hierarchy).toMatch(/Year 12/i);
    expect(lesson?.hierarchy).toMatch(/English/i);
    expect(lesson?.match).toBe('title');
  });

  it('matches class code', () => {
    const hits = searchCurriculumTitles(curriculumFixture(), '12eng', []);
    expect(hits.some((h) => h.type === 'class' && h.match === 'code')).toBe(true);
  });

  it('matches scope note titles', () => {
    const hits = searchCurriculumTitles(curriculumFixture(), 'trial', []);
    expect(hits.some((h) => h.type === 'scope_note')).toBe(true);
  });
});

describe('mergeAndRankHits', () => {
  it('prefers title matches over body and attaches snippets', () => {
    const client: SearchHit[] = [
      {
        type: 'lesson',
        id: 'l1',
        title: 'Other',
        match: 'title',
        href: '/lessons/l1'
      }
    ];
    const content: ContentSearchHit[] = [
      { type: 'lesson', id: 'l2', snippet: '…newton laws…' },
      { type: 'lesson', id: 'l1', snippet: '…also in body…' }
    ];
    const enrichBody = (hit: ContentSearchHit): SearchHit => ({
      type: hit.type,
      id: hit.id,
      title: hit.id === 'l2' ? 'Body only' : 'Other',
      match: 'body',
      snippet: hit.snippet,
      href: `/lessons/${hit.id}`
    });
    const merged = mergeAndRankHits(client, content, enrichBody);
    expect(merged[0]?.id).toBe('l1');
    expect(merged[0]?.snippet).toBe('…also in body…');
    expect(merged.some((h) => h.id === 'l2')).toBe(true);
  });
});
```

Fix fixture fields to satisfy real `Year` / `Subject` / `Class` schemas if TypeScript complains (read schemas; drop `as` if possible).

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement client-search + rank**

`searchCurriculumTitles(curriculum, query, compositions: {id,title}[])`:

- Normalize query with `trim().toLowerCase()`; empty query → `[]`
- For each entity type, if title (or class `code`, media `file_name`) includes query, emit `SearchHit` with `href`:
  - lesson → `/lessons/:id`
  - unit → `/units/:id`
  - class → `/classes/:id`
  - subject → `/units` (or subject-filtered path if one exists; else `/units`)
  - year → `/`
  - scope_sequence → `/scope-sequences/:id` (confirm route in `src/app/router.ts`)
  - scope_note → same scope sequence route (optionally with hash later — path to sequence is enough)
  - resource → `/resources`
  - composition → include title hits; set `href` only if a real teacher route exists in `router.ts`. If none, omit `href` and the panel skips Enter for that row (still visible). Do not invent a fake destination.

Hierarchy helper: Year → Subject → Unit for lessons/units.

`mergeAndRankHits(client, content, enrichBody)`:

- Map by `${type}:${id}`
- Start with client hits
- For each content hit: if exists, set `snippet` and keep better match band; else add `enrichBody(hit)`
- Sort by match rank: title=0, code=1, hierarchy=2, action=3, body=4; then `title.localeCompare`
- Slice to 30

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/teacher/search/client-search.ts src/teacher/search/rank.ts tests/unit/search-client-rank.test.ts
git commit -m "$(cat <<'EOF'
feat(search): client title index and hybrid merge/rank

EOF
)"
```

---

### Task 4: `/api/search` + mock

**Files:**
- Create: `netlify/functions/search.mts`
- Modify: `scripts/mock-api.ts` (add GET `/api/search`)
- Create: `tests/unit/search-api.test.ts`

- [ ] **Step 1: Write failing API tests**

Prefer testing a pure helper exported from the function module or a shared `src/search/run-content-search.ts` used by both Netlify and mock — keeps Vitest off Netlify runtime.

Create: `src/search/run-content-search.ts`

```ts
import { describe, expect, it } from 'vitest';
import { runContentSearch } from '@/search/run-content-search';
import { createBlock } from '@/blocks/create-block';

describe('runContentSearch', () => {
  it('returns empty for short queries', () => {
    expect(
      runContentSearch('n', {
        lessons: [{ id: 'l1', blocks: [createBlock('heading', { content: { text: 'Newton', variant: 'section' } })] }],
        units: [],
        compositions: []
      })
    ).toEqual([]);
  });

  it('finds lesson block text with snippet', () => {
    const hits = runContentSearch('newton', {
      lessons: [
        {
          id: 'l1',
          blocks: [createBlock('rich_text', { content: { html: '<p>Isaac Newton changed physics</p>' } })]
        }
      ],
      units: [],
      compositions: []
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: 'lesson', id: 'l1' });
    expect(hits[0]?.snippet.toLowerCase()).toContain('newton');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `runContentSearch` + Netlify handler + mock**

```ts
// src/search/run-content-search.ts
import { blocksToSearchText, snippetAround } from '@/blocks/search-text';
import type { Block } from '@/schemas';
import type { ContentSearchHit } from '@/teacher/search/types';

export interface ContentSearchCorpus {
  lessons: Array<{ id: string; blocks: Block[] }>;
  units: Array<{ id: string; blocks: Block[] }>;
  compositions: Array<{ id: string; blocks: Block[] }>;
}

export function runContentSearch(query: string, corpus: ContentSearchCorpus): ContentSearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: ContentSearchHit[] = [];

  const scan = (type: ContentSearchHit['type'], id: string, blocks: Block[]) => {
    const text = blocksToSearchText(blocks);
    if (text.toLowerCase().includes(q)) {
      hits.push({ type, id, snippet: snippetAround(text, q) });
    }
  };

  for (const lesson of corpus.lessons) scan('lesson', lesson.id, lesson.blocks ?? []);
  for (const unit of corpus.units) scan('unit', unit.id, unit.blocks ?? []);
  for (const composition of corpus.compositions) scan('composition', composition.id, composition.blocks ?? []);
  return hits;
}
```

`netlify/functions/search.mts` pattern (mirror `curriculum.mts` auth/CORS):

1. OPTIONS / GET only  
2. `getTeacherSession` → 401 if not auth  
3. Parse `q` from URL  
4. List `lessons/`, `units/`, `templates/compositions/` via existing blob helpers  
5. Map to corpus (composition uses `root` as a section block → `blocks: [root]` or extract `root.content.blocks` — use `blocksToSearchText` on `[root]` if section includes title+children)  
6. `return okResponse(200, { hits: runContentSearch(q, corpus) })`

Mock: same logic over in-memory store arrays already used for lessons/units/compositions.

- [ ] **Step 4: Client wrapper**

```ts
// src/teacher/search/api.ts
import { apiGet } from '@/api/client';
import type { ContentSearchHit } from './types';

export function fetchContentSearch(q: string): Promise<{ hits: ContentSearchHit[] }> {
  const params = new URLSearchParams({ q });
  return apiGet(`/api/search?${params.toString()}`);
}
```

- [ ] **Step 5: Run unit tests PASS; commit**

```bash
git add src/search/run-content-search.ts netlify/functions/search.mts scripts/mock-api.ts src/teacher/search/api.ts tests/unit/search-api.test.ts
git commit -m "$(cat <<'EOF'
feat(search): content search API over lesson/unit/composition bodies

EOF
)"
```

---

### Task 5: Actions registry

**Files:**
- Create: `src/teacher/search/actions.ts`
- Create: `tests/unit/search-actions.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { listSearchActions, type SearchActionContext } from '@/teacher/search/actions';

const base: SearchActionContext = {
  path: '/',
  hasLessonEditor: false,
  todayClassId: undefined
};

describe('listSearchActions', () => {
  it('always includes create + home', () => {
    const ids = listSearchActions(base).map((a) => a.id);
    expect(ids).toContain('new-lesson');
    expect(ids).toContain('open-home');
  });

  it('includes student view only on teacher lesson/unit/class routes', () => {
    expect(
      listSearchActions({ ...base, path: '/lessons/l1' }).some((a) => a.id === 'open-student-view')
    ).toBe(true);
    expect(
      listSearchActions({ ...base, path: '/' }).some((a) => a.id === 'open-student-view')
    ).toBe(false);
  });

  it('includes A4 + publish only with lesson editor', () => {
    const withEditor = listSearchActions({ ...base, path: '/lessons/l1', hasLessonEditor: true });
    expect(withEditor.some((a) => a.id === 'open-a4')).toBe(true);
    expect(withEditor.some((a) => a.id === 'publish-lesson')).toBe(true);
  });

  it('includes today class only when resolvable', () => {
    expect(listSearchActions({ ...base, todayClassId: 'c1' }).some((a) => a.id === 'open-today-class')).toBe(
      true
    );
  });
});
```

- [ ] **Step 2–4: Implement + pass + commit**

```ts
export interface SearchAction {
  id: string;
  title: string;
  keywords: string[];
}

export interface SearchActionContext {
  path: string;
  hasLessonEditor: boolean;
  todayClassId?: string;
}

export function listSearchActions(ctx: SearchActionContext): SearchAction[] {
  const actions: SearchAction[] = [
    { id: 'new-lesson', title: 'New Lesson', keywords: ['new', 'create', 'lesson'] },
    { id: 'new-unit', title: 'New Unit', keywords: ['new', 'create', 'unit'] },
    { id: 'new-class', title: 'New Class', keywords: ['new', 'create', 'class'] },
    { id: 'new-scope', title: 'New Scope & Sequence', keywords: ['new', 'create', 'scope'] },
    { id: 'open-home', title: 'Open Home', keywords: ['home'] }
  ];
  if (ctx.todayClassId) {
    actions.push({ id: 'open-today-class', title: "Open Today's Class", keywords: ['today', 'class'] });
  }
  if (/^\/(lessons|units|classes)\//.test(ctx.path)) {
    actions.push({ id: 'open-student-view', title: 'Open Student View', keywords: ['student', 'preview'] });
  }
  if (ctx.hasLessonEditor) {
    actions.push({ id: 'open-a4', title: 'Open A4 Preview', keywords: ['print', 'a4'] });
    actions.push({ id: 'publish-lesson', title: 'Publish Lesson', keywords: ['publish'] });
  }
  return actions;
}

export function filterActions(actions: SearchAction[], query: string): SearchAction[] {
  const q = query.trim().toLowerCase();
  if (!q) return actions;
  return actions.filter(
    (a) => a.title.toLowerCase().includes(q) || a.keywords.some((k) => k.includes(q) || q.includes(k))
  );
}
```

Add `resolveTodayClassId(curriculum, today = schedule_anchor_date): string | undefined` in the same file or `client-search.ts` — pick the class that has a scheduled lesson on the anchor date (reuse schedule helpers if they exist under `src/schedule/`).

Commit message: `feat(search): action registry for empty-state command palette`

---

### Task 6: Search panel UI + CSS

**Files:**
- Create: `src/teacher/search/panel.ts`
- Modify: `src/styles/app.css`
- Create: `tests/unit/search-panel.test.ts`

- [ ] **Step 1: Write failing panel tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openSearchPanel, type SearchPanelOptions } from '@/teacher/search/panel';
import type { CurriculumResponse } from '@/teacher/nav';

function emptyCurriculum(): CurriculumResponse {
  return {
    years: [],
    subjects: [],
    units: [],
    lessons: [],
    classes: [],
    scheduled_lessons: [],
    scope_sequences: [],
    media: [],
    schedule_anchor_date: '2026-08-12'
  };
}

describe('openSearchPanel', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('renders dialog with input and closes on Escape', () => {
    const onNavigate = vi.fn();
    openSearchPanel({
      curriculum: emptyCurriculum(),
      compositions: [],
      path: '/',
      hasLessonEditor: false,
      onNavigate,
      onAction: vi.fn(),
      fetchContentSearch: async () => ({ hits: [] })
    });
    const input = document.querySelector<HTMLInputElement>('.search-palette__input');
    expect(input).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.search-palette')).toBeNull();
  });

  it('shows recent and actions when query empty', () => {
    localStorage.setItem(
      'teaching-hub.recent',
      JSON.stringify([
        { type: 'lesson', id: 'l1', title: 'Recent Lesson', opened_at: '2026-08-11T00:00:00.000Z' }
      ])
    );
    openSearchPanel({
      curriculum: emptyCurriculum(),
      compositions: [],
      path: '/',
      hasLessonEditor: false,
      onNavigate: vi.fn(),
      onAction: vi.fn(),
      fetchContentSearch: async () => ({ hits: [] })
    });
    const text = document.body.textContent ?? '';
    expect(text).toContain('Recent Lesson');
    expect(text).toMatch(/New Lesson/i);
  });
});
```

- [ ] **Step 2: Implement panel**

`openSearchPanel(options)`:

- If a panel is already open, focus its input and return  
- Append backdrop + `.search-palette.glass-panel` to `document.body`  
- Input autofocus; list region `role="listbox"`; options `role="option"` with `aria-selected`  
- Empty query → render Recent (from `readRecent`) + Actions (`listSearchActions`)  
- Debounced input (150ms):  
  - `clientHits = searchCurriculumTitles(...)`  
  - `actionHits = filterActions(...)` mapped to `SearchHit` with `match: 'action'`  
  - if `q.length >= 2`, set status “Searching content…”, `fetchContentSearch(q)`, merge via `mergeAndRankHits`  
  - on content error, keep client hits + status “Content search unavailable”  
- Keyboard: ArrowUp/Down move index; Enter activates selected (navigate or `onAction`); Esc closes  
- Click backdrop closes  
- Activation: if `href` → `onNavigate(href)` then close; if `actionId` → `onAction(actionId)` then close  

CSS (Clinical Glass, centred, compact rows — no card grid):

```css
.search-palette-backdrop { position: fixed; inset: 0; z-index: 80; background: rgb(0 0 0 / 35%); }
.search-palette {
  position: fixed; z-index: 81; left: 50%; top: 18vh; transform: translateX(-50%);
  width: min(560px, calc(100vw - 2rem)); max-height: min(70vh, 520px);
  display: flex; flex-direction: column; border-radius: 12px; overflow: hidden;
}
.search-palette__input { /* full width, large, no chrome noise */ }
.search-palette__list { overflow: auto; }
.search-palette__row { display: grid; grid-template-columns: 1fr auto; gap: 0.25rem 0.75rem; padding: 0.5rem 0.75rem; cursor: pointer; }
.search-palette__row[aria-selected="true"] { background: color-mix(in srgb, var(--wave) 14%, transparent); }
.search-palette__meta { font-size: 0.8rem; opacity: 0.75; }
.search-palette__snippet { grid-column: 1 / -1; font-size: 0.8rem; opacity: 0.7; }
```

Align tokens with existing `--glass` / `--wave` variables.

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(search): command palette panel UI with keyboard navigation

EOF
)"
```

---

### Task 7: Wire rail, ⌘K, recent, actions in `main.ts`

**Files:**
- Modify: `src/teacher/rail.ts` and/or `src/teacher/primary-nav.ts` / `src/teacher/shell.ts`
- Modify: `src/app/main.ts`
- Modify: `src/teacher/search/panel.ts` consumers only as needed

- [ ] **Step 1: Rail control**

Add a button/input near primary nav: label “Search” / placeholder “Search…” that calls a callback `onOpenSearch` passed into `renderTeacherRail` / shell.

```ts
// In renderTeacherRail options:
onOpenSearch?: () => void;
```

Render:

```ts
const searchBtn = document.createElement('button');
searchBtn.type = 'button';
searchBtn.className = 'rail-search';
searchBtn.textContent = 'Search';
searchBtn.addEventListener('click', () => options.onOpenSearch?.());
```

- [ ] **Step 2: Global shortcut + panel host in `main.ts`**

After teacher session is established:

```ts
function openTeacherSearch(): void {
  void getCurriculum().then(async (curriculum) => {
    let compositions: Array<{ id: string; title: string }> = [];
    try {
      const res = await apiGet<{ compositions: Array<{ id: string; title: string }> }>('/api/compositions');
      compositions = res.compositions;
    } catch {
      compositions = [];
    }
    openSearchPanel({
      curriculum,
      compositions,
      path: location.pathname,
      hasLessonEditor: Boolean(lessonEditorHandle), // use the real handle variable name in main.ts
      todayClassId: resolveTodayClassId(curriculum),
      fetchContentSearch,
      onNavigate: (path) => {
        navigate(path);
      },
      onAction: (actionId) => {
        // switch: openCreateModal kinds; navigate home; navigate class; window.open student path; trigger A4; publish
      }
    });
  });
}

window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    if (!session.authenticated) return;
    // skip on student routes
    if (location.pathname.startsWith('/s/')) return;
    event.preventDefault();
    openTeacherSearch();
  }
});
```

Map student view paths:

- `/lessons/:id` → `/s/lessons/:id`
- `/units/:id` → `/s/units/:id`
- `/classes/:id` → `/s/classes/:id`

For A4 / publish: call into the existing lesson editor handle methods (read `LessonEditorHandle` in `lesson-editor.ts` and use whatever is already exported; if preview/publish are only button-bound, add thin methods `openA4Preview()` / `publish()` on the handle as part of this task).

- [ ] **Step 3: Record recent**

In the router success path for teacher lesson/unit/class routes (where title is known), call:

```ts
pushRecent({ type: 'lesson', id, title, opened_at: new Date().toISOString() });
```

Same for unit/class. Do this once per successful render, not on every re-render — e.g. when route params change.

- [ ] **Step 4: Manual smoke (optional automated light test)**

- Sign in → ⌘K opens panel  
- Type lesson title → navigate  
- Type phrase only in block body → content hit with snippet  
- Escape closes  

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(search): wire rail control, Cmd-K, recent tracking, and actions

EOF
)"
```

---

### Task 8: BUILD.md + final verification

**Files:**
- Modify: `docs/BUILD.md`

- [ ] **Step 1: Update BUILD.md**

- Move **Search / nav acceleration** to History (2026-08-11) with links to design + this plan  
- Set **Next up** to **Lesson / unit templates & linked reuse** (compositions v1 done; next template depth per BUILD larger tracks)  

- Tick `[x] Search` under Projection  
- Latest note one line  

- [ ] **Step 2: Run full unit suite**

Run: `npm run test:unit`  
Expected: all pass (fix any breakage from rail option signature changes)

- [ ] **Step 3: Commit**

```bash
git add docs/BUILD.md
git commit -m "$(cat <<'EOF'
docs: record search/nav acceleration slice in BUILD.md

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Rail + ⌘K same panel | 6–7 |
| Hybrid client titles + `/api/search` | 3–4 |
| Body: lessons/units/compositions | 1, 4 |
| Titles: lessons/units/classes/subjects/years/scope/notes/media/compositions | 3 |
| Hierarchy + snippet rows | 3, 6 |
| Ranking bands | 3 |
| Recent localStorage | 2, 7 |
| Actions + visibility | 5, 7 |
| Favourites / tags / outcomes deferred | (none — intentional) |
| Errors: content unavailable | 6 |
| BUILD.md | 8 |

## Type consistency

- `ContentSearchHit` / `SearchHit` / `RecentItem` live in `src/teacher/search/types.ts`
- `runContentSearch` returns `ContentSearchHit[]`
- Panel uses `fetchContentSearch` injectable for tests
- Match bands: `'title' | 'code' | 'hierarchy' | 'body' | 'action'`
