# Notion → Teaching Hub Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An "Import from Notion" picker in the Teaching Hub. It reads one page from Adam's Notion Teaching database, along with its Sub-item tree, previews what it will become, and writes native Teaching Hub units, programs, lessons, classes and syllabus documents. Files are stored again in Netlify Blobs. Re-imports replace the existing copy after saving a version.

**Architecture:** A pure TypeScript mapper (`apps/teaching/src/notion-import/`) turns a normalised `NotionTree` into an `ImportPlan`. It's tested with vitest, and esbuild bundles it into `netlify/functions/_shared/notion-import-core.mjs` the same way the block schema is already bundled. Plain `.mjs` server modules do the I/O: a Notion API reader, a media rehoster and an applier. A sync `POST /api/notion-import/jobs` validates the request, mints a job id, writes a `queued` job record in Blobs and kicks one of two background functions (`/api/notion-import/plan` or `/api/notion-import/apply`), passing only the job id. The background function runs the job and records progress in the same record. The preview modal polls `GET /api/notion-import/jobs/:id`. The stored plan is a slim preview (no entity records, no media urls); apply re-reads Notion.

**Tech stack:** TypeScript + zod (schemas), vitest + happy-dom (`apps/teaching`), Node 22 ESM + `node:test` (root `tests/`), Netlify Functions v2 with `config.background: true`, `@netlify/blobs`, Notion REST API version `2025-09-03`.

**Spec:** `docs/superpowers/specs/2026-10-18-notion-teaching-import-design.md`

**Public repo rule:** every fixture and test string in this plan is made up. Never paste real Notion lesson content, names or IDs into the repo. The Teaching data-source ID lives in the environment variable `NOTION_TEACHING_DATA_SOURCE_ID`, not in code.

---

## File structure

**Mapper (pure, browser- and server-safe), in `apps/teaching/src/notion-import/`**
- `types.ts`: `NotionTree`, `NotionNode`, `ImportPlan`, `ImportChoices`, `MapContext`, warning types.
- `rich-text.ts`: Notion rich text → plain text, or HTML the Teaching Hub allows.
- `block-factory.ts`: `makeBlock()` fills the shared block fields, and the ID helpers.
- `columns.ts`: rounds Notion width ratios to 12ths and picks a preset.
- `map-blocks.ts`: converts blocks, with the nesting-scope rules.
- `map-entities.ts`: category → entity, properties, tree → plan.
- `server-entry.ts`: what the server bundle exports (mapper + entity schemas).

**Schemas, in `apps/teaching/src/schemas/`**
- Create `source.ts`: `SourceSchema`.
- Create `document.ts`: `DocumentSchema` (Syllabus).
- Modify `unit.ts`, `lesson.ts`, `class.ts`, `index.ts`.

**Server, in `netlify/functions/`**
- `_shared/notion-import-core.mjs`: **generated**, never edited by hand.
- `_shared/notion-client.mjs`: HTTP client with retry and pagination.
- `_shared/notion-reader.mjs`: page + blocks + Sub-item tree → `NotionTree`.
- `_shared/notion-import-store.mjs`: Blobs keys, job records, source map.
- `_shared/notion-media.mjs`: downloads files and stores them in Blobs.
- `_shared/notion-apply.mjs`: validates, versions and writes entities.
- `_shared/notion-import-run.mjs`: the shared steps the endpoints call (environment, context loading, plan and apply).
- `notion-import.mjs`: `GET /api/notion-import/search`, `POST /api/notion-import/jobs` (queues a job), `GET /api/notion-import/jobs/:id`.
- `notion-import-plan.mjs`: background `POST /api/notion-import/plan` (body `{ job_id }`, kicked by the jobs endpoint).
- `notion-import-apply.mjs`: background `POST /api/notion-import/apply` (body `{ job_id }`, kicked by the jobs endpoint).
- Modify `curriculum.mjs`: also returns `documents`.

**UI, in `apps/teaching/src/teacher/notion-import/`**
- `api.ts`: client calls, plus `parseNotionPageId`.
- `preview-model.ts`: pure preview state (rows, exclusions, warnings, choices).
- `modal.ts`: the DOM.
- Modify `teacher/create/control.ts`: the menu item.
- Modify `teacher/sections/units.ts`: Program label and filter.
- Modify `teacher/nav.ts`: `documents` in `CurriculumResponse`.

**Build and tests**
- Modify `scripts/generate-alchemy-schema.mjs`.
- vitest: `apps/teaching/tests/unit/notion-import-*.test.ts`.
- `node:test`: `tests/unit/notion-*.test.js`, `tests/integration/notion-import-flow.test.js`.

**Run all commands from the worktree root** (`.worktrees/notion-teaching-import`) unless the step says `apps/teaching`.

---

### Task 1: Check what the Notion API returns for tabs and column widths (not committed)

The rest of the plan assumes a normalised node with `type: 'tabs'` whose children are `type: 'tab'` nodes with `data.label`, and column nodes with an optional `data.width_ratio`. This task finds out what the public API actually returns. That decides how `normalizeBlock` in Task 9 handles tabs.

**Files:**
- Create (scratchpad only, never committed): `$SCRATCH/notion-probe.mjs`

- [ ] **Step 1: Get a token and a test page**

Ask Adam to create an internal Notion integration called "Teaching Hub import" with read content capability. He shares the Teaching database with it (Teaching Dashboard → Teaching → ••• → Connections), then sends you the link to one lesson that uses **tabs** and **columns**. He sets the token in the shell himself; never type it yourself:

```bash
export NOTION_TEACHING_TOKEN=...   # Adam types this
```

- [ ] **Step 2: Write the probe**

```js
// $SCRATCH/notion-probe.mjs — usage: node notion-probe.mjs <page-id>
const id = process.argv[2];
const headers = {
  Authorization: `Bearer ${process.env.NOTION_TEACHING_TOKEN}`,
  'Notion-Version': '2025-09-03'
};
async function children(blockId, depth = 0) {
  let cursor;
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const res = await fetch(url, { headers });
    const body = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(body));
    for (const block of body.results) {
      const data = block[block.type] ?? {};
      console.log(`${'  '.repeat(depth)}${block.type}`, JSON.stringify(
        Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'rich_text'))
      ).slice(0, 160));
      if (block.has_children) await children(block.id, depth + 1);
    }
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
}
await children(id);
```

- [ ] **Step 3: Run it and read the shape**

Run: `node "$SCRATCH/notion-probe.mjs" <page-id>`

Write down three things:
- (a) the block type the tabs container comes back as, and how each tab's label and content appear;
- (b) whether `column` blocks carry `width_ratio`;
- (c) whether a background function with `config.background: true` and `config.path` deploys. Check the latter on the PR's deploy preview in Task 12. Netlify's docs say yes.

- [ ] **Step 4: Pick the tabs adapter**

| What the API returns | `normalizeTabs` in Task 9 |
|---|---|
| A container block (e.g. `type: 'tab'`) whose children are one block per tab, each holding the label in `rich_text` and the content as children | Use the adapter code given in Task 9 Step 3 as is, with `TAB_CONTAINER_TYPE` set to the type name you saw and `TAB_ITEM_TYPE` set to the child type. |
| `type: 'unsupported'`, but `has_children` is true and the children are the tab panes | Same adapter, with `TAB_CONTAINER_TYPE = 'unsupported'`, and only applied when every child is a `TAB_ITEM_TYPE`. Tab labels may come back empty; the adapter numbers them "Tab 1", "Tab 2". |
| `type: 'unsupported'` with no children | Set `TAB_CONTAINER_TYPE = null`. Tabs fall through to the unsupported-block rule (a warning plus whatever text exists). Tell Adam before continuing, because tab content would be lost. |

- [ ] **Step 5: Record the result in the spec**

Add a dated paragraph, `### Tabs check result (YYYY-MM-DD)`, at the end of the spec's **Delivery** section saying which row applied. Commit only the spec change:

```bash
git add docs/superpowers/specs/2026-10-18-notion-teaching-import-design.md
git commit -m "Spec: record Notion API tabs check result

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Schemas: source link, Program kind, Syllabus document

**Files:**
- Create: `apps/teaching/src/schemas/source.ts`
- Create: `apps/teaching/src/schemas/document.ts`
- Modify: `apps/teaching/src/schemas/unit.ts`, `lesson.ts`, `class.ts`, `index.ts`
- Test: `apps/teaching/tests/unit/notion-import-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/notion-import-schemas.test.ts
import { describe, expect, it } from 'vitest';
import { DocumentSchema, LessonSchema, SourceSchema, UnitSchema } from '@/schemas';

const now = '2026-10-18T00:00:00.000Z';
const common = { slug: 'x', status: 'active', created_at: now, updated_at: now, schema_version: 1 } as const;
const source = {
  system: 'notion',
  page_id: '0123456789abcdef0123456789abcdef',
  imported_at: now,
  last_edited_at: now
} as const;

describe('notion import schemas', () => {
  it('accepts a notion source link', () => {
    expect(SourceSchema.parse(source)).toEqual(source);
  });

  it('rejects a source without a page id', () => {
    expect(SourceSchema.safeParse({ ...source, page_id: '' }).success).toBe(false);
  });

  it('accepts a program unit with a source', () => {
    const unit = UnitSchema.parse({
      ...common, id: 'unit_1', title: 'Made-up Program', type: 'unit', kind: 'program',
      year_id: 'year_7', subject_id: 'subject_1', lesson_ids: [], source
    });
    expect(unit.kind).toBe('program');
  });

  it('treats a unit without kind as a plain unit', () => {
    const unit = UnitSchema.parse({
      ...common, id: 'unit_2', title: 'Plain', type: 'unit',
      year_id: 'year_7', subject_id: 'subject_1', lesson_ids: []
    });
    expect(unit.kind).toBeUndefined();
  });

  it('accepts a lesson with a source', () => {
    const lesson = LessonSchema.parse({
      ...common, id: 'lesson_1', title: 'L', type: 'lesson', unit_id: 'unit_1',
      sequence: 1, blocks: [], source
    });
    expect(lesson.source?.page_id).toBe(source.page_id);
  });

  it('accepts a syllabus document', () => {
    const doc = DocumentSchema.parse({
      ...common, id: 'document_1', title: 'Made-up Syllabus', type: 'document',
      kind: 'syllabus', subject_id: 'subject_1', blocks: [], source
    });
    expect(doc.kind).toBe('syllabus');
  });

  it('rejects an unknown document kind', () => {
    expect(DocumentSchema.safeParse({
      ...common, id: 'document_2', title: 'X', type: 'document',
      kind: 'scope_sequence', subject_id: 'subject_1', blocks: []
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-schemas.test.ts`
Expected: FAIL. `SourceSchema` and `DocumentSchema` aren't exported.

- [ ] **Step 3: Write the schemas**

```ts
// apps/teaching/src/schemas/source.ts
import { z } from 'zod';
import { IsoDateSchema } from './common';

/** Where an imported record came from. Re-imports match on page_id. */
export const SourceSchema = z.object({
  system: z.literal('notion'),
  page_id: z.string().min(1).max(64),
  imported_at: IsoDateSchema,
  last_edited_at: IsoDateSchema
});

export type Source = z.infer<typeof SourceSchema>;
```

```ts
// apps/teaching/src/schemas/document.ts
import { z } from 'zod';
import { BlockSchema } from './block';
import { CommonFields, TrashFields } from './common';
import { CoverSchema } from './cover';
import { SourceSchema } from './source';

export const DocumentKindSchema = z.enum(['syllabus']);

/** A free-form page attached to a subject, e.g. an imported syllabus. */
export const DocumentSchema = z.object({
  ...CommonFields,
  ...TrashFields,
  type: z.literal('document'),
  kind: DocumentKindSchema,
  subject_id: z.string().min(1),
  blocks: z.array(BlockSchema),
  cover: CoverSchema.optional(),
  source: SourceSchema.optional()
});

export type TeachingDocument = z.infer<typeof DocumentSchema>;
```

In `unit.ts`, add the import `import { SourceSchema } from './source';` and add these two fields after `outcome_ids`:

```ts
  /** 'program': same level as a unit, never one of a class's active units. */
  kind: z.enum(['program']).optional(),
  source: SourceSchema.optional()
```

In `lesson.ts`, add `import { SourceSchema } from './source';` and add this after `quiz`:

```ts
  source: SourceSchema.optional()
```

In `class.ts`, add `import { SourceSchema } from './source';` and add this after `students`:

```ts
  source: SourceSchema.optional()
```

In `index.ts`, add these alongside the other exports:

```ts
export { SourceSchema, type Source } from './source';
export { DocumentSchema, DocumentKindSchema, type TeachingDocument } from './document';
```

- [ ] **Step 4: Run it and check it passes**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-schemas.test.ts tests/unit/schemas-class.test.ts tests/unit/schemas-curriculum.test.ts`
Expected: PASS.

- [ ] **Step 5: Regenerate the server schema and commit**

Run: `node scripts/generate-alchemy-schema.mjs && git status --short`. `unit.ts`, `lesson.ts` and `class.ts` aren't in the bundle, so the generated files should be unchanged. If they did change, stage them.

```bash
git add apps/teaching/src/schemas apps/teaching/tests/unit/notion-import-schemas.test.ts netlify/functions/_shared
git commit -m "Teaching schemas: notion source link, program units, syllabus documents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Mapper types and rich text

**Files:**
- Create: `apps/teaching/src/notion-import/types.ts`
- Create: `apps/teaching/src/notion-import/rich-text.ts`
- Test: `apps/teaching/tests/unit/notion-import-rich-text.test.ts`

- [ ] **Step 1: Write the types (no test; they're used by every later test)**

```ts
// apps/teaching/src/notion-import/types.ts
export interface NotionAnnotations {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
}

export interface NotionRichText {
  type: 'text' | 'mention' | 'equation';
  plain_text: string;
  href?: string | null;
  annotations?: NotionAnnotations;
}

/**
 * One block after normalisation by the reader. `data` is the raw
 * `block[block.type]` payload. Tabs are normalised to
 * { type: 'tabs', children: [{ type: 'tab', data: { label }, children }] }.
 */
export interface NotionNode {
  id: string;
  type: string;
  data: Record<string, any>;
  children: NotionNode[];
}

export interface NotionFileRef {
  name: string;
  url: string;
  source: 'file' | 'external';
}

export interface NotionPage {
  id: string;
  url: string;
  last_edited_time: string;
  title: string;
  category: string | null;
  subjects: string[];
  years: string[];
  outcomes: string[];
  date_start: string | null;
  date_end: string | null;
  files: NotionFileRef[];
  cover: NotionFileRef | null;
  blocks: NotionNode[];
  /** Sub-item page ids, in Notion's relation order. */
  child_ids: string[];
}

export interface NotionTree {
  root_id: string;
  pages: Record<string, NotionPage>;
}

export type WarningRule =
  | 'flattened'
  | 'skipped'
  | 'unsupported'
  | 'file_too_big'
  | 'file_failed'
  | 'html_app'
  | 'mermaid'
  | 'alt_text'
  | 'outcome_unmatched'
  | 'limit'
  | 'needs_choice'
  | 'invalid';

export interface ImportWarning {
  page_id: string;
  notion_block_id: string | null;
  rule: WarningRule;
  message: string;
}

export type MediaPurpose = 'image' | 'video' | 'attachment' | 'audio' | 'pdf' | 'html' | 'cover';

/** A Notion-hosted file the applier must download. `ref` appears in records as `notion-media:<ref>`. */
export interface MediaRef {
  ref: string;
  page_id: string;
  notion_block_id: string | null;
  url: string;
  name: string;
  purpose: MediaPurpose;
}

export const MEDIA_PLACEHOLDER_PREFIX = 'notion-media:';

export type EntityKind = 'unit' | 'lesson' | 'class' | 'document';

export interface PlannedEntity {
  page_id: string;
  parent_page_id: string | null;
  kind: EntityKind;
  /** e.g. 'Unit', 'Program', 'Workshop', 'Class', 'Syllabus' — for the preview. */
  label: string;
  id: string;
  title: string;
  /** True when the source map already has this page. */
  existing: boolean;
  /** Unmet choices; the applier skips entities with any. */
  needs: Array<'unit' | 'year' | 'subject'>;
  /** Defaults the preview pickers start from. */
  suggested: { year_id?: string; subject_id?: string; subject_title?: string };
  record: Record<string, unknown>;
}

export interface SkippedPage {
  page_id: string;
  parent_page_id: string | null;
  title: string;
  reason: string;
}

export interface HtmlAppCandidate {
  page_id: string;
  notion_block_id: string;
  preview: string;
}

export interface NewSubject {
  id: string;
  title: string;
}

export interface ImportPlan {
  root_page_id: string;
  entities: PlannedEntity[];
  skipped: SkippedPage[];
  new_subjects: NewSubject[];
  media: MediaRef[];
  warnings: ImportWarning[];
  html_apps: HtmlAppCandidate[];
}

export interface EntityOverride {
  year_id?: string;
  subject_id?: string;
  /** Create a subject with this title and use it. */
  create_subject_title?: string;
  /** Existing Teaching Hub unit for a lesson imported without its Notion unit. */
  unit_id?: string;
}

export interface ImportChoices {
  excluded_page_ids: string[];
  overrides: Record<string, EntityOverride>;
  /** Notion block ids of HTML code blocks to keep as plain code. */
  html_as_code: string[];
}

export const EMPTY_CHOICES: ImportChoices = { excluded_page_ids: [], overrides: {}, html_as_code: [] };

export interface MapContext {
  now: string;
  years: Array<{ id: string; year_level: number }>;
  subjects: Array<{ id: string; title: string }>;
  outcomes: Array<{ id: string; code: string }>;
  /** notion page id (no dashes) → existing Teaching Hub entity id */
  source_map: Record<string, string>;
  choices: ImportChoices;
}
```

- [ ] **Step 2: Write the failing rich-text test**

```ts
// apps/teaching/tests/unit/notion-import-rich-text.test.ts
import { describe, expect, it } from 'vitest';
import { plainText, richTextHtml } from '@/notion-import/rich-text';
import type { NotionRichText } from '@/notion-import/types';

const t = (plain_text: string, annotations = {}, href: string | null = null, type: NotionRichText['type'] = 'text'): NotionRichText =>
  ({ type, plain_text, href, annotations });

describe('richTextHtml', () => {
  it('escapes text', () => {
    expect(richTextHtml([t('a < b & "c"')])).toBe('a &lt; b &amp; &quot;c&quot;');
  });
  it('keeps bold, italic and underline', () => {
    expect(richTextHtml([t('x', { bold: true, italic: true, underline: true })]))
      .toBe('<strong><em><u>x</u></em></strong>');
  });
  it('drops colour, strikethrough and inline code to plain text', () => {
    expect(richTextHtml([t('x', { color: 'red', strikethrough: true, code: true })])).toBe('x');
  });
  it('keeps safe links and drops unsafe ones', () => {
    expect(richTextHtml([t('go', {}, 'https://example.com/a?b=1&c=2')]))
      .toBe('<a href="https://example.com/a?b=1&amp;c=2">go</a>');
    expect(richTextHtml([t('bad', {}, 'javascript:alert(1)')])).toBe('bad');
  });
  it('turns mentions into plain text even when they carry an href', () => {
    expect(richTextHtml([t('Some Page', {}, 'https://www.notion.so/abc', 'mention')])).toBe('Some Page');
  });
  it('turns newlines into <br>', () => {
    expect(richTextHtml([t('a\nb')])).toBe('a<br>b');
  });
});

describe('plainText', () => {
  it('joins spans', () => {
    expect(plainText([t('a'), t('b')])).toBe('ab');
  });
  it('handles undefined', () => {
    expect(plainText(undefined)).toBe('');
  });
});
```

- [ ] **Step 3: Run it and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-rich-text.test.ts`
Expected: FAIL, because the module isn't found.

- [ ] **Step 4: Write the implementation**

```ts
// apps/teaching/src/notion-import/rich-text.ts
import type { NotionRichText } from './types';

// Teaching Hub rich text allows only: p, br, strong, em, u, ul, ol, li, a,
// blockquote (see blocks/sanitize.ts). Strikethrough, inline code and colour
// therefore become plain text.

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function plainText(rich: NotionRichText[] | undefined): string {
  return (rich ?? []).map((span) => span.plain_text ?? '').join('');
}

export function richTextHtml(rich: NotionRichText[] | undefined): string {
  return (rich ?? [])
    .map((span) => {
      let html = escapeHtml(span.plain_text ?? '').replace(/\n/g, '<br>');
      if (!html) return '';
      const a = span.annotations ?? {};
      if (a.underline) html = `<u>${html}</u>`;
      if (a.italic) html = `<em>${html}</em>`;
      if (a.bold) html = `<strong>${html}</strong>`;
      const href = span.type === 'text' ? safeHref(span.href) : null;
      if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`;
      return html;
    })
    .join('');
}
```

- [ ] **Step 5: Run it and check it passes**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-rich-text.test.ts`
Expected: PASS.

- [ ] **Step 6: Fix the spec and commit**

In the spec's **Inline text** paragraph, change "Bold, italic, underline, strikethrough, inline code and links are kept." to: "Bold, italic, underline and links are kept. Strikethrough and inline code become plain text, because Teaching Hub rich text doesn't allow those tags."

```bash
git add apps/teaching/src/notion-import apps/teaching/tests/unit/notion-import-rich-text.test.ts docs/superpowers/specs/2026-10-18-notion-teaching-import-design.md
git commit -m "Notion import: mapper types and rich text conversion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Block factory and column widths

**Files:**
- Create: `apps/teaching/src/notion-import/block-factory.ts`
- Create: `apps/teaching/src/notion-import/columns.ts`
- Test: `apps/teaching/tests/unit/notion-import-columns.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/notion-import-columns.test.ts
import { describe, expect, it } from 'vitest';
import { columnPreset, columnWidths } from '@/notion-import/columns';
import { BlockIds, makeBlock } from '@/notion-import/block-factory';
import { BlockSchema } from '@/schemas/block';

describe('columnWidths', () => {
  it('splits equal columns', () => {
    expect(columnWidths([undefined, undefined])).toEqual([6, 6]);
    expect(columnWidths([undefined, undefined, undefined])).toEqual([4, 4, 4]);
  });
  it('rounds ratios to twelfths that sum to 12', () => {
    expect(columnWidths([0.333, 0.667])).toEqual([4, 8]);
    const five = columnWidths([0.2, 0.2, 0.2, 0.2, 0.2]);
    expect(five.reduce((a, b) => a + b, 0)).toBe(12);
    expect(Math.min(...five)).toBeGreaterThanOrEqual(1);
  });
  it('keeps every column at least 1 wide', () => {
    const widths = columnWidths([0.9, 0.05, 0.05]);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(12);
    expect(Math.min(...widths)).toBe(1);
  });
});

describe('columnPreset', () => {
  it('names known layouts and falls back to custom', () => {
    expect(columnPreset([6, 6])).toBe('50-50');
    expect(columnPreset([4, 8])).toBe('33-67');
    expect(columnPreset([8, 4])).toBe('67-33');
    expect(columnPreset([4, 4, 4])).toBe('33-33-33');
    expect(columnPreset([3, 9])).toBe('custom');
  });
});

describe('makeBlock', () => {
  it('builds a schema-valid block', () => {
    const block = makeBlock('rich_text', 'blk_1', { html: '<p>x</p>' }, '2026-10-18T00:00:00.000Z');
    expect(BlockSchema.safeParse(block).success).toBe(true);
  });
});

describe('BlockIds', () => {
  it('derives stable ids from notion ids and never repeats', () => {
    const ids = new BlockIds();
    expect(ids.from('ab-cd')).toBe('blk_abcd');
    expect(ids.from('ab-cd')).toBe('blk_abcd_2');
  });
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-columns.test.ts`
Expected: FAIL, because the modules aren't found.

- [ ] **Step 3: Write the implementation**

```ts
// apps/teaching/src/notion-import/block-factory.ts
import type { Block } from '../schemas/block';

export type BlockType = Block['block_type'];
export type BlockOf<T extends BlockType> = Extract<Block, { block_type: T }>;

const DEFAULT_VARIANT: Partial<Record<BlockType, string>> = {
  image: 'large',
  video: 'large',
  embed: 'large',
  table: 'large',
  html_app: 'large'
};

export function makeBlock<T extends BlockType>(
  blockType: T,
  id: string,
  content: BlockOf<T>['content'],
  now: string,
  variant?: string
): BlockOf<T> {
  return {
    id,
    type: 'block',
    block_type: blockType,
    variant: variant ?? DEFAULT_VARIANT[blockType] ?? 'medium',
    visibility: 'student_teacher',
    content,
    layout: {},
    print: {},
    settings: {},
    created_at: now,
    updated_at: now,
    schema_version: 1
  } as unknown as BlockOf<T>;
}

/** Stable block ids from Notion ids, so a re-import produces the same ids. */
export class BlockIds {
  private used = new Map<string, number>();

  from(notionId: string): string {
    const base = `blk_${notionId.replace(/-/g, '')}`;
    const count = (this.used.get(base) ?? 0) + 1;
    this.used.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  }
}

export function compactId(notionId: string): string {
  return notionId.replace(/-/g, '').toLowerCase();
}
```

```ts
// apps/teaching/src/notion-import/columns.ts
const PRESETS: Record<string, '50-50' | '33-67' | '67-33' | '33-33-33'> = {
  '6,6': '50-50',
  '4,8': '33-67',
  '8,4': '67-33',
  '4,4,4': '33-33-33'
};

/** Notion width ratios → whole twelfths, each ≥ 1, summing to 12. Needs 1–12 columns. */
export function columnWidths(ratios: Array<number | undefined>): number[] {
  const n = ratios.length;
  const raw = ratios.map((r) => (typeof r === 'number' && r > 0 ? r : 1 / n));
  const total = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((r) => (r / total) * 12);
  const widths = scaled.map((s) => Math.max(1, Math.floor(s)));
  let diff = 12 - widths.reduce((a, b) => a + b, 0);
  const byFraction = scaled
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; diff > 0; k += 1, diff -= 1) widths[byFraction[k % n].i] += 1;
  while (diff < 0) {
    const widest = widths.indexOf(Math.max(...widths));
    widths[widest] -= 1;
    diff += 1;
  }
  return widths;
}

export function columnPreset(widths: number[]): '50-50' | '33-67' | '67-33' | '33-33-33' | 'custom' {
  return PRESETS[widths.join(',')] ?? 'custom';
}
```

- [ ] **Step 4: Run it and check it passes**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-columns.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/notion-import apps/teaching/tests/unit/notion-import-columns.test.ts
git commit -m "Notion import: block factory, stable ids and column widths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Block mapping, part 1 (text runs and leaf blocks)

**Files:**
- Create: `apps/teaching/src/notion-import/map-blocks.ts`
- Create: `apps/teaching/tests/unit/notion-import-fixtures.ts` (test helpers)
- Test: `apps/teaching/tests/unit/notion-import-map-leaves.test.ts`

- [ ] **Step 1: Write the fixture helpers**

```ts
// apps/teaching/tests/unit/notion-import-fixtures.ts
import type { NotionNode, NotionRichText } from '@/notion-import/types';
import { createBlockState, type BlockState } from '@/notion-import/map-blocks';

let seq = 0;
export const rt = (plain_text: string, annotations = {}): NotionRichText[] =>
  [{ type: 'text', plain_text, href: null, annotations }];

export function node(type: string, data: Record<string, any> = {}, children: NotionNode[] = []): NotionNode {
  seq += 1;
  return { id: `00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`, type, data, children };
}

export const p = (text: string) => node('paragraph', { rich_text: rt(text) });
export const bullet = (text: string, children: NotionNode[] = []) =>
  node('bulleted_list_item', { rich_text: rt(text) }, children);
export const numbered = (text: string) => node('numbered_list_item', { rich_text: rt(text) });
export const todo = (text: string, checked = false) => node('to_do', { rich_text: rt(text), checked });
export const toggle = (text: string, children: NotionNode[]) => node('toggle', { rich_text: rt(text) }, children);
export const notionFile = (url: string, name = 'file.bin') => ({ type: 'file', file: { url }, name });
export const external = (url: string) => ({ type: 'external', external: { url } });

export function state(overrides: Partial<BlockState> = {}): BlockState {
  return { ...createBlockState('page-1', '2026-10-18T00:00:00.000Z', []), ...overrides };
}
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/teaching/tests/unit/notion-import-map-leaves.test.ts
import { describe, expect, it } from 'vitest';
import { mapBlocks } from '@/notion-import/map-blocks';
import { BlockSchema } from '@/schemas/block';
import { bullet, external, node, notionFile, numbered, p, rt, state, todo } from './notion-import-fixtures';

const valid = (blocks: unknown[]) => blocks.every((b) => BlockSchema.safeParse(b).success);

describe('text runs', () => {
  it('merges consecutive paragraphs and lists into one rich_text block', () => {
    const st = state();
    const blocks = mapBlocks([p('One'), bullet('A', [bullet('A1')]), bullet('B'), numbered('N'), todo('T', true)], 'top', st);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].block_type).toBe('rich_text');
    expect((blocks[0] as any).content.html).toBe(
      '<p>One</p><ul><li>A<ul><li>A1</li></ul></li><li>B</li></ul><ol><li>N</li></ol><ul><li>☑ T</li></ul>'
    );
    expect(valid(blocks)).toBe(true);
  });

  it('skips empty paragraphs', () => {
    expect(mapBlocks([p('')], 'top', state())).toEqual([]);
  });
});

describe('leaf blocks', () => {
  it('maps headings to the three variants', () => {
    const blocks = mapBlocks([
      node('heading_1', { rich_text: rt('H1') }),
      node('heading_2', { rich_text: rt('H2') }),
      node('heading_3', { rich_text: rt('H3') })
    ], 'top', state());
    expect(blocks.map((b: any) => [b.variant, b.content.text])).toEqual([
      ['page', 'H1'], ['section', 'H2'], ['subsection', 'H3']
    ]);
  });

  it('maps quote, divider, equation, code and table', () => {
    const table = node('table', { has_column_header: true }, [
      node('table_row', { cells: [rt('Week'), rt('Topic')] }),
      node('table_row', { cells: [rt('1'), rt('Intro')] })
    ]);
    const blocks = mapBlocks([
      node('quote', { rich_text: rt('Q') }),
      node('divider'),
      node('equation', { expression: 'e=mc^2' }),
      node('code', { rich_text: rt('print(1)'), language: 'python' }),
      table
    ], 'top', state());
    expect(blocks.map((b) => b.block_type)).toEqual(['quote', 'divider', 'equation', 'code', 'table']);
    expect((blocks[4] as any).content).toEqual({ headers: ['Week', 'Topic'], rows: [['1', 'Intro']] });
    expect(valid(blocks)).toBe(true);
  });

  it('puts a Notion-hosted image behind a media placeholder', () => {
    const st = state();
    const img = node('image', { ...notionFile('https://files.example/img.png'), caption: rt('A diagram') });
    const [block] = mapBlocks([img], 'top', st) as any[];
    expect(block.block_type).toBe('image');
    expect(block.content.url).toBe(`notion-media:${img.id}`);
    expect(block.content.alt_text).toBe('A diagram');
    expect(st.media).toEqual([expect.objectContaining({ ref: img.id, purpose: 'image', url: 'https://files.example/img.png' })]);
  });

  it('keeps external images as they are and warns on missing alt text', () => {
    const st = state();
    const [block] = mapBlocks([node('image', { ...external('https://cdn.example/x.jpg'), caption: [] })], 'top', st) as any[];
    expect(block.content.url).toBe('https://cdn.example/x.jpg');
    expect(block.content.alt_text).toBe('');
    expect(st.media).toEqual([]);
    expect(st.warnings.map((w) => w.rule)).toEqual(['alt_text']);
  });

  it('maps YouTube to a video block and an uploaded video to a file video', () => {
    const st = state();
    const upload = node('video', notionFile('https://files.example/clip.mp4', 'clip.mp4'));
    const blocks = mapBlocks([
      node('video', external('https://www.youtube.com/watch?v=dQw4w9WgXcQ')),
      upload
    ], 'top', st) as any[];
    expect(blocks[0].content).toMatchObject({ provider: 'youtube', external_id: 'dQw4w9WgXcQ' });
    expect(blocks[1].content).toMatchObject({ provider: 'file', url: `notion-media:${upload.id}` });
    expect(valid(blocks)).toBe(true);
  });

  it('maps files, pdfs, audio, embeds and bookmarks', () => {
    const st = state();
    const blocks = mapBlocks([
      node('file', { ...notionFile('https://files.example/a.docx', 'worksheet.docx'), caption: [] }),
      node('pdf', notionFile('https://files.example/r.pdf', 'reading.pdf')),
      node('audio', notionFile('https://files.example/a.mp3', 'a.mp3')),
      node('embed', { url: 'https://docs.google.com/presentation/d/abc123/edit' }),
      node('embed', { url: 'https://codepen.io/someone/pen/xyz' }),
      node('bookmark', { url: 'https://example.com/article', caption: rt('Article') })
    ], 'top', st) as any[];
    expect(blocks.map((b) => b.block_type)).toEqual(['attachment', 'embed', 'audio', 'embed', 'embed', 'embed']);
    expect(blocks[0].content).toMatchObject({ title: 'worksheet.docx', filename: 'worksheet.docx' });
    expect(blocks[1].content.provider).toBe('pdf');
    expect(blocks[3].content.provider).toBe('google_slides');
    expect(blocks[4].content.provider).toBe('generic');
    expect(blocks[5].content).toMatchObject({ url: 'https://example.com/article', title: 'Article', provider: 'generic' });
    expect(valid(blocks)).toBe(true);
  });

  it('turns an uploaded .html file into an html_app with an html placeholder', () => {
    const st = state();
    const f = node('file', { ...notionFile('https://files.example/sim.html', 'sim.html'), caption: [] });
    const [block] = mapBlocks([f], 'top', st) as any[];
    expect(block.block_type).toBe('html_app');
    expect(block.content.html).toBe(`notion-media:${f.id}`);
    expect(st.media[0].purpose).toBe('html');
  });

  it('turns a full-page HTML code block into an html_app unless kept as code', () => {
    const html = '<!doctype html><html><body><script>1</script></body></html>';
    const code = node('code', { rich_text: rt(html), language: 'html' });
    const st = state();
    expect((mapBlocks([code], 'top', st)[0] as any).block_type).toBe('html_app');
    expect(st.html_apps).toHaveLength(1);
    const kept = state({ html_as_code: new Set([code.id]) });
    expect((mapBlocks([code], 'top', kept)[0] as any).block_type).toBe('code');
  });

  it('keeps an HTML snippet that is not a full page as code', () => {
    const code = node('code', { rich_text: rt('<p>hi</p>'), language: 'html' });
    expect((mapBlocks([code], 'top', state())[0] as any).block_type).toBe('code');
  });

  it('warns on mermaid code', () => {
    const st = state();
    mapBlocks([node('code', { rich_text: rt('flowchart TB'), language: 'mermaid' })], 'top', st);
    expect(st.warnings.map((w) => w.rule)).toEqual(['mermaid']);
  });

  it('turns synced blocks into plain text', () => {
    const synced = node('synced_block', { synced_from: null }, [p('Shared'), bullet('Point')]);
    const [block] = mapBlocks([synced], 'top', state()) as any[];
    expect(block.block_type).toBe('rich_text');
    expect(block.content.html).toBe('<p>Shared</p><p>Point</p>');
  });

  it('skips linked databases and unsupported blocks with warnings', () => {
    const st = state();
    const blocks = mapBlocks([node('child_database', { title: 'Lessons' }), node('unsupported')], 'top', st);
    expect(blocks).toEqual([]);
    expect(st.warnings.map((w) => w.rule)).toEqual(['skipped', 'unsupported']);
  });
});
```

- [ ] **Step 3: Run it and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-map-leaves.test.ts`
Expected: FAIL, because `map-blocks` isn't found.

- [ ] **Step 4: Write `map-blocks.ts` with leaves and text runs**

Layout blocks (callout, toggle, columns, tabs, child page) come in Task 6. For now they fall through to `unsupportedNode`.

```ts
// apps/teaching/src/notion-import/map-blocks.ts
import type { Block } from '../schemas/block';
import { parseVideoInput } from '../blocks/video-url';
import { parseEmbedInput } from '../blocks/embed-url';
import { BlockIds, makeBlock } from './block-factory';
import { escapeHtml, plainText, richTextHtml } from './rich-text';
import {
  MEDIA_PLACEHOLDER_PREFIX,
  type HtmlAppCandidate,
  type ImportWarning,
  type MediaPurpose,
  type MediaRef,
  type NotionNode,
  type WarningRule
} from './types';

/** Where blocks are being placed; decides which layout blocks are allowed. */
export type Scope = 'top' | 'section' | 'tabs' | 'column';

export interface BlockState {
  page_id: string;
  now: string;
  ids: BlockIds;
  warnings: ImportWarning[];
  media: MediaRef[];
  html_apps: HtmlAppCandidate[];
  html_as_code: Set<string>;
}

export function createBlockState(pageId: string, now: string, htmlAsCode: string[]): BlockState {
  return {
    page_id: pageId,
    now,
    ids: new BlockIds(),
    warnings: [],
    media: [],
    html_apps: [],
    html_as_code: new Set(htmlAsCode)
  };
}

export function warn(st: BlockState, node: NotionNode | null, rule: WarningRule, message: string): void {
  st.warnings.push({ page_id: st.page_id, notion_block_id: node?.id ?? null, rule, message });
}

const LIST_TYPES = new Set(['bulleted_list_item', 'numbered_list_item', 'to_do']);
export const TEXT_RUN_TYPES = new Set(['paragraph', ...LIST_TYPES]);

// ---------- text runs ----------

function listItemHtml(item: NotionNode, st: BlockState): string {
  const prefix = item.type === 'to_do' ? (item.data.checked ? '☑ ' : '☐ ') : '';
  let inner = prefix + richTextHtml(item.data.rich_text);
  const nestedLists = item.children.filter((c) => LIST_TYPES.has(c.type));
  const other = item.children.filter((c) => !LIST_TYPES.has(c.type));
  if (nestedLists.length) inner += listsHtml(nestedLists, st);
  if (other.length) {
    inner += other.map((c) => `<br>${escapeHtml(deepPlainText(c))}`).join('');
    warn(st, item, 'flattened', 'Content nested under a list item was flattened to text.');
  }
  return `<li>${inner}</li>`;
}

function listsHtml(items: NotionNode[], st: BlockState): string {
  let html = '';
  let i = 0;
  while (i < items.length) {
    const tag = items[i].type === 'numbered_list_item' ? 'ol' : 'ul';
    let run = '';
    while (i < items.length && (items[i].type === 'numbered_list_item' ? 'ol' : 'ul') === tag) {
      run += listItemHtml(items[i], st);
      i += 1;
    }
    html += `<${tag}>${run}</${tag}>`;
  }
  return html;
}

function textRunHtml(run: NotionNode[], st: BlockState): string {
  let html = '';
  let i = 0;
  while (i < run.length) {
    const n = run[i];
    if (n.type === 'paragraph') {
      const text = richTextHtml(n.data.rich_text);
      if (text) html += `<p>${text}</p>`;
      if (n.children.length) html += textRunHtml(n.children.filter((c) => TEXT_RUN_TYPES.has(c.type)), st);
      i += 1;
      continue;
    }
    const lists: NotionNode[] = [];
    while (i < run.length && LIST_TYPES.has(run[i].type)) lists.push(run[i++]);
    html += listsHtml(lists, st);
  }
  return html;
}

export function deepPlainText(n: NotionNode): string {
  const own = plainText(n.data?.rich_text ?? n.data?.caption);
  const kids = n.children.map(deepPlainText).filter(Boolean);
  return [own, ...kids].filter(Boolean).join('\n');
}

function plainParagraphsHtml(text: string): string {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

// ---------- media ----------

function fileUrl(data: Record<string, any>): { url: string; hosted: boolean } | null {
  if (data.type === 'file' && data.file?.url) return { url: data.file.url, hosted: true };
  if (data.type === 'file_upload' && data.file_upload?.url) return { url: data.file_upload.url, hosted: true };
  if (data.type === 'external' && data.external?.url) return { url: data.external.url, hosted: false };
  return null;
}

function fileName(data: Record<string, any>, url: string): string {
  if (typeof data.name === 'string' && data.name) return data.name;
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : 'file';
  } catch {
    return 'file';
  }
}

/** Returns the URL to put in the block: a placeholder for Notion-hosted files. */
export function mediaUrl(st: BlockState, ref: string, node: NotionNode | null, url: string, hosted: boolean, name: string, purpose: MediaPurpose): string {
  if (!hosted) return url;
  st.media.push({ ref, page_id: st.page_id, notion_block_id: node?.id ?? null, url, name, purpose });
  return `${MEDIA_PLACEHOLDER_PREFIX}${ref}`;
}

const FULL_HTML = /<(html|body|script)\b/i;

// ---------- leaves ----------

function mapLeaf(n: NotionNode, st: BlockState): Block[] | null {
  const id = () => st.ids.from(n.id);
  const now = st.now;
  const d = n.data ?? {};
  switch (n.type) {
    case 'heading_1':
    case 'heading_2':
    case 'heading_3': {
      const variant = n.type === 'heading_1' ? 'page' : n.type === 'heading_2' ? 'section' : 'subsection';
      return [makeBlock('heading', id(), { text: plainText(d.rich_text) }, now, variant)];
    }
    case 'quote': {
      const extra = n.children.map(deepPlainText).filter(Boolean);
      return [makeBlock('quote', id(), { quote: [plainText(d.rich_text), ...extra].join('\n') }, now)];
    }
    case 'divider':
      return [makeBlock('divider', id(), { tools: true, timer_stack: [] }, now)];
    case 'equation':
      return [makeBlock('equation', id(), { latex: String(d.expression ?? '') }, now)];
    case 'code': {
      const code = plainText(d.rich_text);
      const language = typeof d.language === 'string' ? d.language : undefined;
      if (language === 'html' && FULL_HTML.test(code) && !st.html_as_code.has(n.id)) {
        st.html_apps.push({ page_id: st.page_id, notion_block_id: n.id, preview: code.slice(0, 120) });
        warn(st, n, 'html_app', 'HTML code block will run as an interactive.');
        return [makeBlock('html_app', id(), { html: code }, now)];
      }
      if (language === 'mermaid') warn(st, n, 'mermaid', 'Mermaid diagram kept as code.');
      return [makeBlock('code', id(), { code, language }, now)];
    }
    case 'table': {
      const rows = n.children
        .filter((r) => r.type === 'table_row')
        .map((r) => (r.data.cells ?? []).map((cell: any) => plainText(cell)));
      const headers = d.has_column_header && rows.length ? rows[0] : [];
      return [makeBlock('table', id(), { headers, rows: d.has_column_header ? rows.slice(1) : rows }, now)];
    }
    case 'image': {
      const f = fileUrl(d);
      if (!f) return null;
      const caption = plainText(d.caption);
      if (!caption) warn(st, n, 'alt_text', 'Image has no caption, so its alt text is empty.');
      const url = mediaUrl(st, n.id, n, f.url, f.hosted, fileName(d, f.url), 'image');
      return [makeBlock('image', id(), { url, alt_text: caption, caption: caption || undefined }, now)];
    }
    case 'video': {
      const f = fileUrl(d);
      if (!f) return null;
      if (!f.hosted) {
        const parsed = parseVideoInput(f.url);
        if (parsed && parsed.provider !== 'file') {
          return [makeBlock('video', id(), { ...parsed, url: f.url, caption: plainText(d.caption) || undefined }, now)];
        }
        return [makeBlock('embed', id(), { url: f.url, provider: 'generic' }, now)];
      }
      const url = mediaUrl(st, n.id, n, f.url, true, fileName(d, f.url), 'video');
      return [makeBlock('video', id(), { provider: 'file', external_id: url, url }, now)];
    }
    case 'file': {
      const f = fileUrl(d);
      if (!f) return null;
      const name = fileName(d, f.url);
      if (/\.html?$/i.test(name)) {
        const html = mediaUrl(st, n.id, n, f.url, f.hosted, name, 'html');
        warn(st, n, 'html_app', `${name} will run as an interactive.`);
        return [makeBlock('html_app', id(), { title: name, html }, now)];
      }
      const url = mediaUrl(st, n.id, n, f.url, f.hosted, name, 'attachment');
      return [makeBlock('attachment', id(), { url, title: plainText(d.caption) || name, filename: name }, now)];
    }
    case 'pdf': {
      const f = fileUrl(d);
      if (!f) return null;
      const url = mediaUrl(st, n.id, n, f.url, f.hosted, fileName(d, f.url), 'pdf');
      return [makeBlock('embed', id(), { url, provider: 'pdf', title: plainText(d.caption) || undefined }, now)];
    }
    case 'audio': {
      const f = fileUrl(d);
      if (!f) return null;
      const url = mediaUrl(st, n.id, n, f.url, f.hosted, fileName(d, f.url), 'audio');
      return [makeBlock('audio', id(), { url, title: plainText(d.caption) || undefined }, now)];
    }
    case 'embed':
    case 'bookmark':
    case 'link_preview': {
      const url = String(d.url ?? '');
      if (!url) return null;
      const parsed = n.type === 'embed' ? parseEmbedInput(url) : null;
      return [makeBlock('embed', id(), {
        url,
        provider: parsed?.provider ?? 'generic',
        embed_url: parsed?.embed_url,
        title: plainText(d.caption) || undefined
      }, now)];
    }
    case 'synced_block': {
      const html = plainParagraphsHtml(n.children.map(deepPlainText).join('\n'));
      return html ? [makeBlock('rich_text', id(), { html }, now)] : [];
    }
    case 'child_database':
    case 'link_to_page':
    case 'table_of_contents':
    case 'breadcrumb':
      warn(st, n, 'skipped', `Notion ${n.type.replace(/_/g, ' ')} skipped.`);
      return [];
    default:
      return null;
  }
}

function unsupportedNode(n: NotionNode, st: BlockState): Block[] {
  warn(st, n, 'unsupported', `Notion ${n.type.replace(/_/g, ' ')} block is not supported; kept its text.`);
  const html = plainParagraphsHtml(deepPlainText(n));
  return html ? [makeBlock('rich_text', st.ids.from(n.id), { html }, st.now)] : [];
}

// ---------- entry ----------

export function mapBlocks(nodes: NotionNode[], scope: Scope, st: BlockState): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    if (TEXT_RUN_TYPES.has(n.type)) {
      const run: NotionNode[] = [];
      while (i < nodes.length && TEXT_RUN_TYPES.has(nodes[i].type)) run.push(nodes[i++]);
      const html = textRunHtml(run, st);
      if (html) out.push(makeBlock('rich_text', st.ids.from(run[0].id), { html }, st.now));
      continue;
    }
    const layout = mapLayout(nodes, i, scope, st);
    if (layout) {
      out.push(...layout.blocks);
      i = layout.next;
      continue;
    }
    out.push(...(mapLeaf(n, st) ?? unsupportedNode(n, st)));
    i += 1;
  }
  return out;
}

/** Layout blocks; filled in by Task 6. Returns null when `nodes[i]` is not a layout block. */
function mapLayout(_nodes: NotionNode[], _i: number, _scope: Scope, _st: BlockState): { blocks: Block[]; next: number } | null {
  return null;
}
```

- [ ] **Step 5: Run it and check it passes**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-map-leaves.test.ts`
Expected: PASS. The unsupported test expects only `['skipped', 'unsupported']`. A bare `node('unsupported')` has no text, so no block is produced.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/notion-import apps/teaching/tests/unit/notion-import-fixtures.ts apps/teaching/tests/unit/notion-import-map-leaves.test.ts
git commit -m "Notion import: map text runs and leaf blocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Block mapping, part 2 (callouts, toggles, columns, tabs, child pages)

**Files:**
- Modify: `apps/teaching/src/notion-import/map-blocks.ts` (replace the `mapLayout` stub)
- Test: `apps/teaching/tests/unit/notion-import-map-layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/notion-import-map-layout.test.ts
import { describe, expect, it } from 'vitest';
import { mapBlocks } from '@/notion-import/map-blocks';
import { BlockSchema } from '@/schemas/block';
import { node, notionFile, p, rt, state, toggle } from './notion-import-fixtures';

const valid = (blocks: unknown[]) => blocks.every((b) => {
  const r = BlockSchema.safeParse(b);
  if (!r.success) console.error(JSON.stringify(r.error.issues, null, 2));
  return r.success;
});
const tab = (label: string, children: any[]) => node('tab', { label }, children);
const tabs = (...items: any[]) => node('tabs', {}, items);
const column = (children: any[], width_ratio?: number) => node('column', width_ratio ? { width_ratio } : {}, children);
const columns = (...cols: any[]) => node('column_list', {}, cols);
const image = () => node('image', { ...notionFile('https://files.example/i.png'), caption: rt('cap') });

describe('callouts', () => {
  it('maps colour and emoji to a style and keeps text in the body', () => {
    const blocks = mapBlocks([
      node('callout', { rich_text: rt('Careful'), color: 'red_background', icon: { type: 'emoji', emoji: '💡' } }),
      node('callout', { rich_text: rt('Done'), color: 'default', icon: { type: 'emoji', emoji: '✅' } }),
      node('callout', { rich_text: rt('Plain'), color: 'gray_background' })
    ], 'top', state()) as any[];
    expect(blocks.map((b) => b.content.style)).toEqual(['warning', 'remember', 'information']);
    expect(blocks[0].content.body).toBe('Careful');
    expect(valid(blocks)).toBe(true);
  });

  it('keeps text children in the body and moves other children after it', () => {
    const st = state();
    const blocks = mapBlocks([
      node('callout', { rich_text: rt('Title line'), color: 'blue_background' }, [p('More text'), image()])
    ], 'top', st) as any[];
    expect(blocks.map((b) => b.block_type)).toEqual(['callout', 'image']);
    expect(blocks[0].content.body).toBe('Title line\nMore text');
    expect(st.warnings.some((w) => w.rule === 'flattened')).toBe(true);
  });
});

describe('toggles', () => {
  it('merges a run of text-only toggles into one accordion', () => {
    const blocks = mapBlocks([toggle('Q1', [p('A1')]), toggle('Q2', [p('A2')])], 'top', state()) as any[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content.items).toEqual([{ title: 'Q1', body: 'A1' }, { title: 'Q2', body: 'A2' }]);
  });

  it('turns a toggle with rich content into a collapsed section at top level', () => {
    const blocks = mapBlocks([toggle('Activity', [p('Do this'), image()])], 'top', state()) as any[];
    expect(blocks[0].block_type).toBe('section');
    expect(blocks[0].content).toMatchObject({ title: 'Activity', collapsed_in_editor: true });
    expect(blocks[0].content.blocks.map((b: any) => b.block_type)).toEqual(['rich_text', 'image']);
    expect(valid(blocks)).toBe(true);
  });

  it('turns a toggle heading into a collapsed section', () => {
    const blocks = mapBlocks([node('heading_2', { rich_text: rt('Part A'), is_toggleable: true }, [p('x')])], 'top', state()) as any[];
    expect(blocks[0]).toMatchObject({ block_type: 'section', content: { title: 'Part A' } });
  });

  it('flattens a rich toggle inside a column to a bold line plus its blocks', () => {
    const st = state();
    const blocks = mapBlocks([columns(column([toggle('Inside', [image()])]), column([p('b')]))], 'top', st) as any[];
    const first = blocks[0].content.columns[0].blocks;
    expect(first[0]).toMatchObject({ block_type: 'rich_text', content: { html: '<p><strong>Inside</strong></p>' } });
    expect(first[1].block_type).toBe('image');
    expect(valid(blocks)).toBe(true);
  });
});

describe('columns', () => {
  it('maps widths and preset', () => {
    const blocks = mapBlocks([columns(column([p('a')], 0.333), column([p('b')], 0.667))], 'top', state()) as any[];
    expect(blocks[0].content.preset).toBe('33-67');
    expect(blocks[0].content.columns.map((c: any) => c.width)).toEqual([4, 8]);
  });

  it('stacks nested columns inside the outer column', () => {
    const st = state();
    const inner = columns(column([p('x')]), column([p('y')]));
    const blocks = mapBlocks([columns(column([inner]), column([p('b')]))], 'top', st) as any[];
    const first = blocks[0].content.columns[0].blocks;
    expect(first.map((b: any) => b.content.html)).toEqual(['<p>x</p>', '<p>y</p>']);
    expect(st.warnings.some((w) => w.rule === 'flattened')).toBe(true);
    expect(valid(blocks)).toBe(true);
  });

  it('turns a single column into plain blocks', () => {
    const blocks = mapBlocks([columns(column([p('solo')]))], 'top', state()) as any[];
    expect(blocks[0].block_type).toBe('rich_text');
  });
});

describe('tabs', () => {
  it('maps 2–8 tabs at top level to a tabs block', () => {
    const blocks = mapBlocks([tabs(tab('Do Now', [p('a')]), tab('Teach', [p('b')]))], 'top', state()) as any[];
    expect(blocks[0].block_type).toBe('tabs');
    expect(blocks[0].content.tabs.map((t: any) => t.label)).toEqual(['Do Now', 'Teach']);
    expect(valid(blocks)).toBe(true);
  });

  it('turns 1 tab or 9 tabs into sections at top level', () => {
    const one = mapBlocks([tabs(tab('Only', [p('a')]))], 'top', state()) as any[];
    expect(one.map((b) => b.block_type)).toEqual(['section']);
    const nine = mapBlocks([tabs(...Array.from({ length: 9 }, (_, k) => tab(`T${k}`, [p('x')])))], 'top', state()) as any[];
    expect(nine).toHaveLength(9);
    expect(nine.every((b) => b.block_type === 'section')).toBe(true);
  });

  it('turns tabs inside tabs into a heading per tab', () => {
    const st = state();
    const nested = tabs(tab('Inner A', [p('ia')]), tab('Inner B', [p('ib')]));
    const blocks = mapBlocks([tabs(tab('Outer', [nested]), tab('Other', [p('o')]))], 'top', st) as any[];
    const outer = blocks[0].content.tabs[0].blocks;
    expect(outer.map((b: any) => b.block_type)).toEqual(['heading', 'rich_text', 'heading', 'rich_text']);
    expect(valid(blocks)).toBe(true);
  });

  it('keeps a column inside a toggle inside tabs valid', () => {
    const deep = tabs(
      tab('A', [toggle('Rich', [columns(column([image()]), column([p('t')]))])]),
      tab('B', [p('b')])
    );
    const blocks = mapBlocks([deep], 'top', state()) as any[];
    expect(valid(blocks)).toBe(true);
  });
});

describe('child pages', () => {
  it('flattens a non-database child page to a heading plus its content', () => {
    const st = state();
    const blocks = mapBlocks([node('child_page', { title: 'Notes' }, [p('inside')])], 'top', st) as any[];
    expect(blocks.map((b) => b.block_type)).toEqual(['heading', 'rich_text']);
    expect(st.warnings.some((w) => w.rule === 'flattened')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-map-layout.test.ts`
Expected: FAIL. Layout nodes fall through to `unsupported`.

- [ ] **Step 3: Replace the `mapLayout` stub**

Add `import { columnPreset, columnWidths } from './columns';` to the imports in `map-blocks.ts`, then replace the stub `mapLayout` function with:

```ts
const CALLOUT_BY_COLOUR: Record<string, string> = {
  red: 'warning',
  orange: 'warning',
  yellow: 'important',
  blue: 'information',
  green: 'remember',
  purple: 'extension',
  pink: 'extension'
};
const CALLOUT_BY_EMOJI: Record<string, string> = {
  '⚠️': 'warning', '❗': 'warning', 'ℹ️': 'information', '📋': 'information',
  '📅': 'information', '✅': 'remember', '🚀': 'extension'
};

export function calloutStyle(data: Record<string, any>): string {
  const colour = String(data.color ?? '').replace(/_background$/, '');
  if (CALLOUT_BY_COLOUR[colour]) return CALLOUT_BY_COLOUR[colour];
  const emoji = data.icon?.type === 'emoji' ? data.icon.emoji : '';
  return CALLOUT_BY_EMOJI[emoji] ?? 'information';
}

function isTextOnly(n: NotionNode): boolean {
  return TEXT_RUN_TYPES.has(n.type) && n.children.every(isTextOnly);
}

function isTextOnlyToggle(n: NotionNode): boolean {
  return n.type === 'toggle' && n.children.every(isTextOnly);
}

function isToggleHeading(n: NotionNode): boolean {
  return /^heading_[123]$/.test(n.type) && n.data?.is_toggleable === true;
}

function boldLine(text: string, st: BlockState, notionId: string): Block {
  return makeBlock('rich_text', st.ids.from(notionId), { html: `<p><strong>${escapeHtml(text)}</strong></p>` }, st.now);
}

/** A titled group of blocks, shaped to fit the scope it lands in. */
function titledGroup(title: string, children: NotionNode[], scope: Scope, st: BlockState, notionId: string): Block[] {
  if (scope === 'top') {
    return [makeBlock('section', st.ids.from(notionId), {
      title,
      collapsed_in_editor: true,
      blocks: mapBlocks(children, 'section', st) as any
    }, st.now)];
  }
  const inner = mapBlocks(children, scope, st);
  if (scope === 'column') return [boldLine(title, st, notionId), ...inner];
  return [makeBlock('heading', st.ids.from(notionId), { text: title }, st.now, 'subsection'), ...inner];
}

function mapCallout(n: NotionNode, scope: Scope, st: BlockState): Block[] {
  const textKids = n.children.filter(isTextOnly);
  const otherKids = n.children.filter((c) => !isTextOnly(c));
  const body = [plainText(n.data.rich_text), ...textKids.map(deepPlainText)].filter(Boolean).join('\n');
  const callout = makeBlock('callout', st.ids.from(n.id), { style: calloutStyle(n.data) as any, body }, st.now);
  if (!otherKids.length) return [callout];
  warn(st, n, 'flattened', 'Images or other blocks inside a callout were placed after it.');
  return [callout, ...mapBlocks(otherKids, scope, st)];
}

function mapColumns(n: NotionNode, scope: Scope, st: BlockState): Block[] {
  const cols = n.children.filter((c) => c.type === 'column');
  if (scope === 'column' || cols.length > 12) {
    warn(st, n, 'flattened', 'Columns inside a column were stacked.');
    return cols.flatMap((c) => mapBlocks(c.children, 'column', st));
  }
  if (cols.length <= 1) return cols.flatMap((c) => mapBlocks(c.children, scope, st));
  const widths = columnWidths(cols.map((c) => c.data?.width_ratio));
  return [makeBlock('columns', st.ids.from(n.id), {
    preset: columnPreset(widths),
    columns: cols.map((c, k) => ({ width: widths[k], blocks: mapBlocks(c.children, 'column', st) as any }))
  }, st.now)];
}

function mapTabs(n: NotionNode, scope: Scope, st: BlockState): Block[] {
  const items = n.children.filter((c) => c.type === 'tab');
  const label = (t: NotionNode, k: number) => String(t.data?.label ?? '').trim() || `Tab ${k + 1}`;
  const fits = items.length >= 2 && items.length <= 8;
  if (fits && (scope === 'top' || scope === 'section')) {
    return [makeBlock('tabs', st.ids.from(n.id), {
      tabs: items.map((t, k) => ({ id: `${st.ids.from(t.id)}`, label: label(t, k), blocks: mapBlocks(t.children, 'tabs', st) as any }))
    }, st.now)];
  }
  if (scope !== 'top' || !fits) {
    warn(st, n, 'flattened', fits
      ? 'Tabs inside tabs or columns became headings.'
      : `${items.length} tab(s) cannot be a tabs block; each became its own group.`);
  }
  return items.flatMap((t, k) => titledGroup(label(t, k), t.children, scope, st, t.id));
}

function mapLayout(nodes: NotionNode[], i: number, scope: Scope, st: BlockState): { blocks: Block[]; next: number } | null {
  const n = nodes[i];
  if (isTextOnlyToggle(n)) {
    const run: NotionNode[] = [];
    let j = i;
    while (j < nodes.length && isTextOnlyToggle(nodes[j])) run.push(nodes[j++]);
    const items = run.map((t) => ({ title: plainText(t.data.rich_text), body: t.children.map(deepPlainText).join('\n') }));
    return { blocks: [makeBlock('accordion', st.ids.from(run[0].id), { items }, st.now)], next: j };
  }
  if (n.type === 'toggle' || isToggleHeading(n)) {
    if (scope !== 'top') warn(st, n, 'flattened', 'A toggle inside a layout was opened out.');
    return { blocks: titledGroup(plainText(n.data.rich_text), n.children, scope, st, n.id), next: i + 1 };
  }
  if (n.type === 'callout') return { blocks: mapCallout(n, scope, st), next: i + 1 };
  if (n.type === 'column_list') return { blocks: mapColumns(n, scope, st), next: i + 1 };
  if (n.type === 'tabs') return { blocks: mapTabs(n, scope, st), next: i + 1 };
  if (n.type === 'child_page') {
    warn(st, n, 'flattened', `Sub-page “${n.data.title ?? ''}” was placed inline.`);
    const heading = makeBlock('heading', st.ids.from(n.id), { text: String(n.data.title ?? 'Untitled') }, st.now, 'section');
    return { blocks: [heading, ...mapBlocks(n.children, scope, st)], next: i + 1 };
  }
  return null;
}
```

- [ ] **Step 4: Run all the mapper tests and check they pass**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-map-layout.test.ts tests/unit/notion-import-map-leaves.test.ts`
Expected: PASS. If a `valid()` check fails, the printed zod issue shows which nesting rule was broken. Fix the scope passed for that branch; don't loosen the schema.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/notion-import/map-blocks.ts apps/teaching/tests/unit/notion-import-map-layout.test.ts
git commit -m "Notion import: callouts, toggles, columns, tabs and nesting rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Entity mapping (tree → ImportPlan)

**Files:**
- Create: `apps/teaching/src/notion-import/map-entities.ts`
- Test: `apps/teaching/tests/unit/notion-import-map-entities.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/notion-import-map-entities.test.ts
import { describe, expect, it } from 'vitest';
import { buildImportPlan } from '@/notion-import/map-entities';
import { EMPTY_CHOICES, type MapContext, type NotionPage, type NotionTree } from '@/notion-import/types';
import { p } from './notion-import-fixtures';

const now = '2026-10-18T00:00:00.000Z';
function page(id: string, category: string | null, extra: Partial<NotionPage> = {}): NotionPage {
  return {
    id, url: `https://www.notion.so/${id}`, last_edited_time: now, title: `Page ${id}`, category,
    subjects: ['Philosophy and Ethics'], years: ['Year 8', 'Year 7'], outcomes: [],
    date_start: null, date_end: null, files: [], cover: null, blocks: [p('body')], child_ids: [], ...extra
  };
}
function tree(rootId: string, ...pages: NotionPage[]): NotionTree {
  return { root_id: rootId, pages: Object.fromEntries(pages.map((pg) => [pg.id, pg])) };
}
const ctx = (over: Partial<MapContext> = {}): MapContext => ({
  now,
  years: [{ id: 'year_7', year_level: 7 }, { id: 'year_8', year_level: 8 }],
  subjects: [{ id: 'subject_phil', title: 'Philosophy and Ethics' }],
  outcomes: [{ id: 'outcome_a', code: 'EN4-URA-01' }],
  source_map: {},
  choices: EMPTY_CHOICES,
  ...over
});

describe('buildImportPlan', () => {
  it('imports a program with its sessions as a program unit and lessons', () => {
    const plan = buildImportPlan(tree('p1',
      page('p1', 'Enrichment Program', { child_ids: ['s1', 's2'] }),
      page('s1', 'Session'),
      page('s2', 'Workshop')
    ), ctx());
    const [program, l1, l2] = plan.entities;
    expect(program).toMatchObject({ kind: 'unit', label: 'Program', needs: [] });
    expect(program.record).toMatchObject({ type: 'unit', kind: 'program', year_id: 'year_7', subject_id: 'subject_phil' });
    expect(program.record.lesson_ids).toEqual([l1.id, l2.id]);
    expect(l1.record).toMatchObject({ type: 'lesson', unit_id: program.id, sequence: 1, pedagogical_mode: 'lesson', review_status: 'needs_review' });
    expect(l2.record).toMatchObject({ sequence: 2, pedagogical_mode: 'workshop' });
    expect(l1.record.source).toMatchObject({ system: 'notion', page_id: 's1' });
  });

  it('uses deterministic ids, and the existing id from the source map', () => {
    const t = tree('u1', page('u1', 'Unit'));
    expect(buildImportPlan(t, ctx()).entities[0].id).toBe('unit_n_u1');
    const again = buildImportPlan(t, ctx({ source_map: { u1: 'unit_existing' } })).entities[0];
    expect(again).toMatchObject({ id: 'unit_existing', existing: true });
  });

  it('skips Curriculum Map and Scope and Sequence pages', () => {
    const plan = buildImportPlan(tree('u1',
      page('u1', 'Unit', { child_ids: ['m1', 'q1'] }),
      page('m1', 'Curriculum Map'),
      page('q1', 'Scope and Sequence')
    ), ctx());
    expect(plan.entities).toHaveLength(1);
    expect(plan.skipped.map((s) => s.page_id)).toEqual(['m1', 'q1']);
  });

  it('honours excluded pages and their descendants', () => {
    const plan = buildImportPlan(tree('u1',
      page('u1', 'Unit', { child_ids: ['l1', 'l2'] }), page('l1', 'Lesson'), page('l2', 'Lesson')
    ), ctx({ choices: { ...EMPTY_CHOICES, excluded_page_ids: ['l2'] } }));
    expect(plan.entities.map((e) => e.page_id)).toEqual(['u1', 'l1']);
    expect(plan.entities[0].record.lesson_ids).toEqual([plan.entities[1].id]);
  });

  it('asks for a unit when a lesson is imported on its own, and accepts one', () => {
    expect(buildImportPlan(tree('l1', page('l1', 'Lesson')), ctx()).entities[0].needs).toEqual(['unit']);
    const chosen = buildImportPlan(tree('l1', page('l1', 'Lesson')),
      ctx({ choices: { ...EMPTY_CHOICES, overrides: { l1: { unit_id: 'unit_hub' } } } })).entities[0];
    expect(chosen).toMatchObject({ needs: [] });
    expect(chosen.record.unit_id).toBe('unit_hub');
  });

  it('needs a subject when nothing matches, and can create one', () => {
    const t = tree('u1', page('u1', 'Unit', { subjects: ['Made-up Subject'] }));
    const plan = buildImportPlan(t, ctx());
    expect(plan.entities[0].needs).toEqual(['subject']);
    expect(plan.entities[0].suggested.subject_title).toBe('Made-up Subject');
    const created = buildImportPlan(t, ctx({ choices: { ...EMPTY_CHOICES, overrides: { u1: { create_subject_title: 'Made-up Subject' } } } }));
    expect(created.new_subjects).toEqual([{ id: 'subject_n_made-up-subject', title: 'Made-up Subject' }]);
    expect(created.entities[0].record.subject_id).toBe('subject_n_made-up-subject');
  });

  it('maps outcomes by code and warns on unknown codes', () => {
    const plan = buildImportPlan(tree('l1', page('l1', 'Unit', { outcomes: ['EN4-URA-01', 'XX-99'] })), ctx());
    expect(plan.entities[0].record.outcome_ids).toEqual(['outcome_a']);
    expect(plan.warnings.some((w) => w.rule === 'outcome_unmatched' && w.message.includes('XX-99'))).toBe(true);
  });

  it('maps a class with its units as active units', () => {
    const plan = buildImportPlan(tree('c1',
      page('c1', 'Class', { title: 'Year 12 Advanced', child_ids: ['u1'], date_start: '2027-01-30' }),
      page('u1', 'Unit')
    ), ctx());
    const [cls, unit] = plan.entities;
    expect(cls.record).toMatchObject({
      type: 'class', code: 'year-12-advanced', display_name: 'Year 12 Advanced', academic_year: 2027,
      active_unit_ids: [unit.id]
    });
    expect((cls.record.homepage as any).custom[0].block_type).toBe('rich_text');
  });

  it('maps a syllabus to a document', () => {
    const plan = buildImportPlan(tree('s1', page('s1', 'Syllabus')), ctx());
    expect(plan.entities[0]).toMatchObject({ kind: 'document', label: 'Syllabus' });
    expect(plan.entities[0].record).toMatchObject({ type: 'document', kind: 'syllabus', subject_id: 'subject_phil' });
  });

  it('adds Files as attachments and the cover as a placeholder', () => {
    const plan = buildImportPlan(tree('u1', page('u1', 'Unit', {
      files: [{ name: 'brief.pdf', url: 'https://files.example/brief.pdf', source: 'file' }],
      cover: { name: 'cover.png', url: 'https://files.example/cover.png', source: 'file' }
    })), ctx());
    const rec: any = plan.entities[0].record;
    expect(rec.cover).toEqual({ url: 'notion-media:cover:u1' });
    expect(rec.blocks.at(-1)).toMatchObject({ block_type: 'attachment', content: { title: 'brief.pdf' } });
    expect(plan.media.map((m) => m.purpose).sort()).toEqual(['attachment', 'cover']);
  });

  it('sets unit dates from Date/s', () => {
    const plan = buildImportPlan(tree('u1', page('u1', 'Unit', { date_start: '2027-02-01', date_end: '2027-03-15T00:00:00.000+11:00' })), ctx());
    expect(plan.entities[0].record).toMatchObject({ start_date: '2027-02-01', end_date: '2027-03-15' });
  });
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-map-entities.test.ts`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Write the implementation**

```ts
// apps/teaching/src/notion-import/map-entities.ts
import type { PedagogicalMode } from '../curriculum/pedagogical-mode';
import { makeBlock } from './block-factory';
import { createBlockState, mapBlocks, mediaUrl, type BlockState } from './map-blocks';
import type {
  EntityKind, ImportPlan, MapContext, NotionPage, NotionTree, PlannedEntity
} from './types';

type CategoryRule =
  | { kind: 'unit'; label: string; program?: true }
  | { kind: 'lesson'; label: string; mode: PedagogicalMode }
  | { kind: 'class'; label: string }
  | { kind: 'document'; label: string }
  | { skip: string };

const MODE_CATEGORIES: Record<string, PedagogicalMode> = {
  Lesson: 'lesson', Session: 'lesson', Lab: 'lab', Workshop: 'workshop', Lecture: 'lecture',
  Tutorial: 'tutorial', Seminar: 'seminar', Project: 'project', 'Case Study': 'case_study',
  Game: 'game', 'Station Rotation': 'station_rotation', 'Design Sprint': 'design_sprint',
  Assessment: 'assessment'
};

export function categoryRule(category: string | null): CategoryRule {
  if (category === 'Unit') return { kind: 'unit', label: 'Unit' };
  if (category === 'Program' || category === 'Enrichment Program') return { kind: 'unit', label: 'Program', program: true };
  if (category === 'Class') return { kind: 'class', label: 'Class' };
  if (category === 'Syllabus') return { kind: 'document', label: 'Syllabus' };
  if (category === 'Curriculum Map' || category === 'Scope and Sequence') return { skip: `${category} pages are not imported.` };
  if (category && MODE_CATEGORIES[category]) return { kind: 'lesson', label: category, mode: MODE_CATEGORIES[category] };
  return { kind: 'lesson', label: 'Lesson', mode: 'lesson' };
}

const ID_PREFIX: Record<EntityKind, string> = { unit: 'unit', lesson: 'lesson', class: 'class', document: 'document' };

function slug(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'item';
}

function day(value: string | null): string | undefined {
  return value ? value.slice(0, 10) : undefined;
}

export function buildImportPlan(tree: NotionTree, ctx: MapContext): ImportPlan {
  const plan: ImportPlan = {
    root_page_id: tree.root_id, entities: [], skipped: [], new_subjects: [], media: [], warnings: [], html_apps: []
  };
  const excluded = new Set(ctx.choices.excluded_page_ids);
  const byPage = new Map<string, PlannedEntity>();

  const resolveYear = (pg: NotionPage): string | undefined => {
    const levels = pg.years.map((y) => Number(y.match(/\d+/)?.[0])).filter(Number.isFinite).sort((a, b) => a - b);
    for (const level of levels) {
      const hit = ctx.years.find((y) => y.year_level === level);
      if (hit) return hit.id;
    }
    return undefined;
  };
  const resolveSubject = (pg: NotionPage): { id?: string; title?: string } => {
    const wanted = pg.subjects[0];
    if (!wanted) return {};
    const hit = ctx.subjects.find((s) => s.title.trim().toLowerCase() === wanted.trim().toLowerCase());
    return hit ? { id: hit.id, title: hit.title } : { title: wanted };
  };
  const subjectFromCreate = (title: string): string => {
    const id = `subject_n_${slug(title)}`;
    if (!plan.new_subjects.some((s) => s.id === id)) plan.new_subjects.push({ id, title });
    return id;
  };

  const visit = (pageId: string, parent: PlannedEntity | null, sequence: number): void => {
    const pg = tree.pages[pageId];
    if (!pg || excluded.has(pageId)) return;
    const rule = categoryRule(pg.category);
    if ('skip' in rule) {
      plan.skipped.push({ page_id: pageId, parent_page_id: parent?.page_id ?? null, title: pg.title, reason: rule.skip });
      return;
    }

    const st: BlockState = createBlockState(pageId, ctx.now, ctx.choices.html_as_code);
    const blocks = mapBlocks(pg.blocks, 'top', st);
    pg.files.forEach((f, k) => {
      const ref = `file:${pageId}:${k}`;
      const url = mediaUrl(st, ref, null, f.url, f.source === 'file', f.name, 'attachment');
      blocks.push(makeBlock('attachment', st.ids.from(`${pageId}-file-${k}`), { url, title: f.name, filename: f.name }, ctx.now));
    });
    const cover = pg.cover
      ? { url: mediaUrl(st, `cover:${pageId}`, null, pg.cover.url, pg.cover.source === 'file', pg.cover.name, 'cover') }
      : undefined;

    const override = ctx.choices.overrides[pageId] ?? {};
    const existingId = ctx.source_map[pageId];
    const id = existingId ?? `${ID_PREFIX[rule.kind]}_n_${pageId.replace(/-/g, '')}`;
    const title = pg.title.trim() || 'Untitled';
    const needs: PlannedEntity['needs'] = [];

    const inheritedYear = parent?.record.year_id as string | undefined;
    const inheritedSubject = parent?.record.subject_id as string | undefined;
    const year_id = override.year_id ?? resolveYear(pg) ?? inheritedYear;
    const subject = resolveSubject(pg);
    const subject_id = override.subject_id
      ?? (override.create_subject_title ? subjectFromCreate(override.create_subject_title) : undefined)
      ?? subject.id
      ?? inheritedSubject;

    const outcome_ids: string[] = [];
    for (const code of pg.outcomes) {
      const hit = ctx.outcomes.find((o) => o.code.toLowerCase() === code.toLowerCase());
      if (hit) outcome_ids.push(hit.id);
      else plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: 'outcome_unmatched', message: `Outcome ${code} is not in the outcome catalogue.` });
    }
    if (outcome_ids.length > 24) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: 'limit', message: 'Only the first 24 outcomes were kept.' });
      outcome_ids.length = 24;
    }

    const common = {
      id, title, slug: slug(title), status: 'active', created_at: ctx.now, updated_at: ctx.now, schema_version: 1,
      ...(cover ? { cover } : {}),
      source: { system: 'notion', page_id: pageId, imported_at: ctx.now, last_edited_at: pg.last_edited_time }
    };

    let record: Record<string, unknown>;
    if (rule.kind === 'lesson') {
      const unit_id = parent?.kind === 'unit' ? parent.id : override.unit_id;
      if (!unit_id) needs.push('unit');
      record = {
        ...common, type: 'lesson', unit_id: unit_id ?? '', sequence, blocks,
        pedagogical_mode: rule.mode, review_status: 'needs_review',
        ...(outcome_ids.length ? { outcome_ids } : {})
      };
    } else {
      if (!subject_id) needs.push('subject');
      if (rule.kind !== 'document' && !year_id) needs.push('year');
      if (rule.kind === 'unit') {
        record = {
          ...common, type: 'unit', year_id: year_id ?? '', subject_id: subject_id ?? '', lesson_ids: [],
          blocks, ...(rule.program ? { kind: 'program' } : {}),
          ...(day(pg.date_start) ? { start_date: day(pg.date_start) } : {}),
          ...(day(pg.date_end) ? { end_date: day(pg.date_end) } : {}),
          ...(outcome_ids.length ? { outcome_ids } : {})
        };
      } else if (rule.kind === 'class') {
        record = {
          ...common, type: 'class', code: slug(title), display_name: title,
          academic_year: pg.date_start ? Number(pg.date_start.slice(0, 4)) : Number(ctx.now.slice(0, 4)),
          year_id: year_id ?? '', subject_id: subject_id ?? '', active_unit_ids: [],
          homepage: { announcements: [], resources: [], custom: blocks }
        };
      } else {
        record = { ...common, type: 'document', kind: 'syllabus', subject_id: subject_id ?? '', blocks };
      }
    }

    const entity: PlannedEntity = {
      page_id: pageId, parent_page_id: parent?.page_id ?? null, kind: rule.kind, label: rule.label,
      id, title, existing: Boolean(existingId), needs,
      suggested: { year_id: resolveYear(pg), subject_id: subject.id, subject_title: subject.title },
      record
    };
    plan.entities.push(entity);
    byPage.set(pageId, entity);
    plan.media.push(...st.media);
    plan.warnings.push(...st.warnings);
    plan.html_apps.push(...st.html_apps);
    for (const need of needs) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: 'needs_choice', message: `Choose a ${need} for “${title}”.` });
    }

    let childSeq = 0;
    for (const childId of pg.child_ids) {
      const before = plan.entities.length;
      visit(childId, entity, childSeq + 1);
      const child = plan.entities[before];
      if (!child || child.parent_page_id !== pageId) continue;
      childSeq += 1;
      if (entity.kind === 'unit' && child.kind === 'lesson') (record.lesson_ids as string[]).push(child.id);
      if (entity.kind === 'class' && child.kind === 'unit' && !child.record.kind) (record.active_unit_ids as string[]).push(child.id);
    }
  };

  visit(tree.root_id, null, 1);
  return plan;
}
```

- [ ] **Step 4: Run it and check it passes**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-map-entities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/notion-import/map-entities.ts apps/teaching/tests/unit/notion-import-map-entities.test.ts
git commit -m "Notion import: map categories and properties to Teaching Hub entities

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Server bundle of the mapper

**Files:**
- Create: `apps/teaching/src/notion-import/server-entry.ts`
- Modify: `scripts/generate-alchemy-schema.mjs`
- Generated: `netlify/functions/_shared/notion-import-core.mjs`
- Test: `tests/unit/notion-import-core.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/notion-import-core.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildImportPlan, ClassSchema, DocumentSchema, EMPTY_CHOICES, LessonSchema, SubjectSchema, UnitSchema
} from '../../netlify/functions/_shared/notion-import-core.mjs';

test('server bundle exposes the mapper and entity schemas', () => {
  for (const schema of [ClassSchema, DocumentSchema, LessonSchema, SubjectSchema, UnitSchema]) {
    assert.equal(typeof schema.safeParse, 'function');
  }
  const now = '2026-10-18T00:00:00.000Z';
  const plan = buildImportPlan({
    root_id: 'u1',
    pages: { u1: {
      id: 'u1', url: '', last_edited_time: now, title: 'Made-up unit', category: 'Unit',
      subjects: [], years: [], outcomes: [], date_start: null, date_end: null, files: [], cover: null,
      blocks: [], child_ids: []
    } }
  }, { now, years: [], subjects: [], outcomes: [], source_map: {}, choices: EMPTY_CHOICES });
  assert.equal(plan.entities[0].kind, 'unit');
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `node --test tests/unit/notion-import-core.test.js`
Expected: FAIL with `Cannot find module .../notion-import-core.mjs`.

- [ ] **Step 3: Write the entry and the build step**

```ts
// apps/teaching/src/notion-import/server-entry.ts
export { buildImportPlan, categoryRule } from './map-entities';
export { EMPTY_CHOICES, MEDIA_PLACEHOLDER_PREFIX } from './types';
export { LessonSchema } from '../schemas/lesson';
export { UnitSchema } from '../schemas/unit';
export { ClassSchema } from '../schemas/class';
export { SubjectSchema } from '../schemas/subject';
export { DocumentSchema } from '../schemas/document';
```

Add this to the end of `scripts/generate-alchemy-schema.mjs`:

```js
await build({
  entryPoints: ['apps/teaching/src/notion-import/server-entry.ts'],
  outfile: 'netlify/functions/_shared/notion-import-core.mjs',
  bundle: true, platform: 'node', format: 'esm', external: ['zod'],
  alias: { '@': './apps/teaching/src' },
  banner: {js:'// Generated from apps/teaching/src/notion-import/server-entry.ts; regenerate with scripts/generate-alchemy-schema.mjs.'}
});
```

- [ ] **Step 4: Generate the bundle and run the test**

Run: `node scripts/generate-alchemy-schema.mjs && node --test tests/unit/notion-import-core.test.js`
Expected: PASS. If esbuild reports a browser-only import (for example `DOMParser` pulled in through `class.ts` → `schedule/timetable`), check that the module only *references* it inside functions. Bundling is fine as long as nothing at the top level touches the DOM. The test passing proves it.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/notion-import/server-entry.ts scripts/generate-alchemy-schema.mjs netlify/functions/_shared/notion-import-core.mjs tests/unit/notion-import-core.test.js
git commit -m "Notion import: bundle the mapper and entity schemas for functions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Notion client and reader

**Files:**
- Create: `netlify/functions/_shared/notion-client.mjs`
- Create: `netlify/functions/_shared/notion-reader.mjs`
- Test: `tests/unit/notion-reader.test.js`

- [ ] **Step 1: Write the failing test (fake Notion over `fetchImpl`)**

```js
// tests/unit/notion-reader.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotionClient, NotionApiError } from '../../netlify/functions/_shared/notion-client.mjs';
import { readNotionTree, normalizePage } from '../../netlify/functions/_shared/notion-reader.mjs';

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const text = (plain_text) => [{ type: 'text', plain_text, href: null, annotations: {} }];

function fakeNotion(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method ?? 'GET'} ${u.pathname}${u.searchParams.get('start_cursor') ? `?c=${u.searchParams.get('start_cursor')}` : ''}`;
    calls.push(key);
    const route = routes[key];
    if (!route) return json(404, { object: 'error', code: 'object_not_found', message: key });
    return typeof route === 'function' ? route(calls) : json(200, route);
  };
  return { fetchImpl, calls };
}

function pageBody(id, title, category, subItems = []) {
  return {
    object: 'page', id, url: `https://www.notion.so/${id}`, last_edited_time: '2026-10-01T00:00:00.000Z',
    cover: { type: 'file', file: { url: `https://files.example/${id}.png` } },
    properties: {
      Name: { id: 'title', type: 'title', title: text(title) },
      Category: { id: 'c', type: 'select', select: category ? { name: category } : null },
      Subject: { id: 's', type: 'multi_select', multi_select: [{ name: 'Made-up Subject' }] },
      'Year Level': { id: 'y', type: 'multi_select', multi_select: [{ name: 'Year 9' }] },
      Outcomes: { id: 'o', type: 'multi_select', multi_select: [{ name: 'EN5-URA-01' }] },
      'Date/s': { id: 'd', type: 'date', date: { start: '2027-02-01', end: null } },
      Files: { id: 'f', type: 'files', files: [{ name: 'brief.pdf', type: 'file', file: { url: 'https://files.example/brief.pdf' } }] },
      'Sub-item': { id: 'sub', type: 'relation', relation: subItems.map((sid) => ({ id: sid })), has_more: false }
    }
  };
}

test('client retries 429 using Retry-After, then succeeds', async () => {
  let n = 0;
  const waits = [];
  const client = createNotionClient({
    token: 't',
    sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async () => (++n === 1 ? json(429, { code: 'rate_limited' }, { 'retry-after': '2' }) : json(200, { ok: true }))
  });
  assert.deepEqual(await client.request('GET', '/v1/users/me'), { ok: true });
  assert.deepEqual(waits, [2000]);
});

test('client raises NotionApiError with the Notion code', async () => {
  const client = createNotionClient({ token: 't', sleep: async () => {}, fetchImpl: async () => json(404, { code: 'object_not_found', message: 'nope' }) });
  await assert.rejects(client.request('GET', '/v1/pages/x'), (err) => err instanceof NotionApiError && err.code === 'object_not_found');
});

test('normalizePage reads the Teaching properties', () => {
  const page = normalizePage(pageBody('u1', 'Made-up Unit', 'Unit', ['l1']), []);
  assert.equal(page.title, 'Made-up Unit');
  assert.equal(page.category, 'Unit');
  assert.deepEqual(page.years, ['Year 9']);
  assert.deepEqual(page.child_ids, ['l1']);
  assert.equal(page.files[0].source, 'file');
  assert.equal(page.cover.url, 'https://files.example/u1.png');
  assert.equal(page.date_start, '2027-02-01');
});

test('readNotionTree follows Sub-items, paginates and recurses into children', async () => {
  const { fetchImpl } = fakeNotion({
    'GET /v1/pages/u1': pageBody('u1', 'Made-up Unit', 'Unit', ['l1']),
    'GET /v1/pages/l1': pageBody('l1', 'Made-up Lesson', 'Lesson'),
    'GET /v1/blocks/u1/children': {
      results: [{ id: 'b1', type: 'paragraph', has_children: false, paragraph: { rich_text: text('one') } }],
      has_more: true, next_cursor: 'cur2'
    },
    'GET /v1/blocks/u1/children?c=cur2': {
      results: [{ id: 'b2', type: 'toggle', has_children: true, toggle: { rich_text: text('T') } }],
      has_more: false
    },
    'GET /v1/blocks/b2/children': {
      results: [{ id: 'b3', type: 'child_database', has_children: true, child_database: { title: 'x' } }],
      has_more: false
    },
    'GET /v1/blocks/l1/children': { results: [], has_more: false }
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  const tree = await readNotionTree(client, 'u1');
  assert.deepEqual(Object.keys(tree.pages).sort(), ['l1', 'u1']);
  const blocks = tree.pages.u1.blocks;
  assert.deepEqual(blocks.map((b) => b.type), ['paragraph', 'toggle']);
  assert.equal(blocks[1].children[0].type, 'child_database');
  assert.deepEqual(blocks[1].children[0].children, []); // never descends into databases
});

test('readNotionTree stops at the page limit', async () => {
  const { fetchImpl } = fakeNotion({
    'GET /v1/pages/u1': pageBody('u1', 'U', 'Unit', ['l1', 'l2']),
    'GET /v1/pages/l1': pageBody('l1', 'L1', 'Lesson'),
    'GET /v1/blocks/u1/children': { results: [], has_more: false },
    'GET /v1/blocks/l1/children': { results: [], has_more: false }
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  await assert.rejects(readNotionTree(client, 'u1', { maxPages: 2 }), /more than 2 pages/);
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `node --test tests/unit/notion-reader.test.js`
Expected: FAIL, because the modules aren't found.

- [ ] **Step 3: Write the client**

```js
// netlify/functions/_shared/notion-client.mjs
export const NOTION_VERSION = '2025-09-03';
const BASE = 'https://api.notion.com';

export class NotionApiError extends Error {
  constructor(status, code, message) {
    super(message || code || `Notion request failed (${status})`);
    this.name = 'NotionApiError';
    this.status = status;
    this.code = code || 'notion_error';
  }
}

export function createNotionClient({
  token,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxRetries = 5
}) {
  async function request(method, path, body) {
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetchImpl(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          ...(body ? { 'content-type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
      if (res.ok) return res.json();
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < maxRetries) {
        const after = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 500 * 2 ** attempt);
        continue;
      }
      let payload = {};
      try { payload = await res.json(); } catch { /* not json */ }
      throw new NotionApiError(res.status, payload.code, payload.message);
    }
  }

  async function paginate(path, { method = 'GET', body } = {}) {
    const results = [];
    let cursor;
    do {
      let page;
      if (method === 'GET') {
        const qs = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
        page = await request('GET', `${path}?${qs}`);
      } else {
        page = await request(method, path, { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      }
      results.push(...(page.results ?? []));
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return results;
  }

  return {
    request,
    paginate,
    getPage: (id) => request('GET', `/v1/pages/${id}`),
    listChildren: (id) => paginate(`/v1/blocks/${id}/children`),
    propertyItems: (pageId, propertyId) => paginate(`/v1/pages/${pageId}/properties/${encodeURIComponent(propertyId)}`),
    queryDataSource: (dataSourceId, body) => request('POST', `/v1/data_sources/${dataSourceId}/query`, body)
  };
}
```

- [ ] **Step 4: Write the reader**

`TAB_CONTAINER_TYPE` and `TAB_ITEM_TYPE` come from Task 1 Step 4. Fill in the type names you saw. If the tabs check showed no usable children, set `TAB_CONTAINER_TYPE = null`.

```js
// netlify/functions/_shared/notion-reader.mjs

// From the Task 1 tabs check (see the spec's "Tabs check result").
const TAB_CONTAINER_TYPE = 'tab';
const TAB_ITEM_TYPE = 'paragraph';

const NO_DESCEND = new Set(['child_database', 'link_to_page']);

function plain(rich) {
  return (rich ?? []).map((r) => r.plain_text ?? '').join('');
}

function fileRef(f) {
  if (!f) return null;
  if (f.type === 'file' && f.file?.url) return { name: f.name || 'file', url: f.file.url, source: 'file' };
  if (f.type === 'file_upload' && f.file_upload?.url) return { name: f.name || 'file', url: f.file_upload.url, source: 'file' };
  if (f.type === 'external' && f.external?.url) return { name: f.name || 'file', url: f.external.url, source: 'external' };
  return null;
}

function prop(page, name) {
  return page.properties?.[name];
}

export function normalizePage(page, blocks, childIds) {
  const titleProp = Object.values(page.properties ?? {}).find((p) => p?.type === 'title');
  const multi = (name) => (prop(page, name)?.multi_select ?? []).map((o) => o.name);
  const date = prop(page, 'Date/s')?.date;
  return {
    id: page.id,
    url: page.url ?? '',
    last_edited_time: page.last_edited_time,
    title: plain(titleProp?.title),
    category: prop(page, 'Category')?.select?.name ?? null,
    subjects: multi('Subject'),
    years: multi('Year Level'),
    outcomes: multi('Outcomes'),
    date_start: date?.start ?? null,
    date_end: date?.end ?? null,
    files: (prop(page, 'Files')?.files ?? []).map(fileRef).filter(Boolean),
    cover: fileRef(page.cover ? { ...page.cover, name: 'cover' } : null),
    blocks,
    child_ids: childIds ?? (prop(page, 'Sub-item')?.relation ?? []).map((r) => r.id)
  };
}

function normalizeTabs(raw, children) {
  if (!TAB_CONTAINER_TYPE || raw.type !== TAB_CONTAINER_TYPE) return null;
  if (!children.length || !children.every((c) => c.type === TAB_ITEM_TYPE)) return null;
  return {
    id: raw.id,
    type: 'tabs',
    data: {},
    children: children.map((c, k) => ({
      id: c.id,
      type: 'tab',
      data: { label: plain(c.data.rich_text) || `Tab ${k + 1}` },
      children: c.children
    }))
  };
}

async function readBlocks(client, blockId) {
  const raws = await client.listChildren(blockId);
  const out = [];
  for (const raw of raws) {
    const children = raw.has_children && !NO_DESCEND.has(raw.type) ? await readBlocks(client, raw.id) : [];
    const node = { id: raw.id, type: raw.type, data: raw[raw.type] ?? {}, children };
    out.push(normalizeTabs(raw, children) ?? node);
  }
  return out;
}

async function subItemIds(client, page) {
  const rel = prop(page, 'Sub-item');
  if (!rel) return [];
  if (!rel.has_more) return (rel.relation ?? []).map((r) => r.id);
  const items = await client.propertyItems(page.id, rel.id);
  return items.map((item) => item.relation?.id).filter(Boolean);
}

export async function readNotionTree(client, rootId, { maxPages = 200 } = {}) {
  const pages = {};
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    if (pages[id]) continue;
    if (Object.keys(pages).length >= maxPages) {
      throw new Error(`This import has more than ${maxPages} pages. Import a smaller part.`);
    }
    const raw = await client.getPage(id);
    const childIds = await subItemIds(client, raw);
    const blocks = await readBlocks(client, raw.id);
    pages[id] = normalizePage(raw, blocks, childIds);
    queue.push(...childIds);
  }
  return { root_id: rootId, pages };
}
```

Note: the test's `l2` page has no route. The limit check throws before `l2` is fetched, which is what the test expects.

- [ ] **Step 5: Run it and check it passes**

Run: `node --test tests/unit/notion-reader.test.js`
Expected: PASS.

- [ ] **Step 6: Add a tabs test that matches what Task 1 found**

Add this test, using the same type names as `TAB_CONTAINER_TYPE` and `TAB_ITEM_TYPE`. Skip it if `TAB_CONTAINER_TYPE` is null.

```js
test('readNotionTree normalises tabs', async () => {
  const { fetchImpl } = fakeNotion({
    'GET /v1/pages/u1': pageBody('u1', 'U', 'Lesson'),
    'GET /v1/blocks/u1/children': { results: [{ id: 'tb', type: 'tab', has_children: true, tab: {} }], has_more: false },
    'GET /v1/blocks/tb/children': { results: [
      { id: 't1', type: 'paragraph', has_children: true, paragraph: { rich_text: text('Do Now') } },
      { id: 't2', type: 'paragraph', has_children: false, paragraph: { rich_text: text('Teach') } }
    ], has_more: false },
    'GET /v1/blocks/t1/children': { results: [{ id: 'x', type: 'paragraph', has_children: false, paragraph: { rich_text: text('inside') } }], has_more: false }
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  const [tabs] = (await readNotionTree(client, 'u1')).pages.u1.blocks;
  assert.equal(tabs.type, 'tabs');
  assert.deepEqual(tabs.children.map((t) => t.data.label), ['Do Now', 'Teach']);
  assert.equal(tabs.children[0].children[0].type, 'paragraph');
});
```

Run: `node --test tests/unit/notion-reader.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/notion-client.mjs netlify/functions/_shared/notion-reader.mjs tests/unit/notion-reader.test.js
git commit -m "Notion import: API client with retry and tree reader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Import store keys and media rehoster

**Files:**
- Create: `netlify/functions/_shared/notion-import-store.mjs`
- Create: `netlify/functions/_shared/notion-media.mjs`
- Test: `tests/unit/notion-media.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/notion-media.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { importMediaId, rehostMedia } from '../../netlify/functions/_shared/notion-media.mjs';
import { mediaFileKey, mediaKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

function memoryStore() {
  const map = new Map();
  return {
    map,
    async get(key, opts) { const v = map.get(key); return v === undefined ? null : opts?.type === 'json' ? JSON.parse(v.value) : v.value; },
    async set(key, value, opts) { map.set(key, { value, metadata: opts?.metadata }); },
    async setJSON(key, value) { map.set(key, { value: JSON.stringify(value) }); }
  };
}
const ok = (bytes, type) => new Response(bytes, { status: 200, headers: { 'content-type': type, 'content-length': String(bytes.length) } });
const ref = (purpose, name = 'a.png') => ({ ref: 'blk-1', page_id: 'p', notion_block_id: 'blk-1', url: 'https://files.example/a', name, purpose });
const opts = (fetchImpl, extra = {}) => ({ fetchImpl, origin: 'https://hub.example', now: '2026-10-18T00:00:00.000Z', ...extra });

test('stores a Notion file as a media record and returns its file url', async () => {
  const store = memoryStore();
  const result = await rehostMedia(store, ref('image'), opts(async () => ok(new Uint8Array([1, 2, 3]), 'image/png')));
  const id = importMediaId('blk-1');
  assert.equal(result.ok, true);
  assert.equal(result.url, `https://hub.example/api/media/${id}/file`);
  assert.ok(store.map.has(mediaFileKey(id)));
  const record = JSON.parse(store.map.get(mediaKey(id)).value);
  assert.equal(record.media_type, 'image');
  assert.equal(record.provider, 'direct');
});

test('reuses an already-stored file without downloading again', async () => {
  const store = memoryStore();
  await rehostMedia(store, ref('image'), opts(async () => ok(new Uint8Array([1]), 'image/png')));
  let fetched = false;
  const again = await rehostMedia(store, ref('image'), opts(async () => { fetched = true; return ok(new Uint8Array([1]), 'image/png'); }));
  assert.equal(again.ok, true);
  assert.equal(fetched, false);
});

test('rejects files over the cap', async () => {
  const store = memoryStore();
  const result = await rehostMedia(store, ref('video', 'big.mp4'), opts(async () => ok(new Uint8Array(10), 'video/mp4'), { maxBytes: 5 }));
  assert.deepEqual({ ok: result.ok, reason: result.reason }, { ok: false, reason: 'too_big' });
  assert.equal(store.map.size, 0);
});

test('rejects types outside the import allow-list', async () => {
  const result = await rehostMedia(memoryStore(), ref('attachment', 'x.exe'), opts(async () => ok(new Uint8Array([1]), 'application/x-msdownload')));
  assert.equal(result.reason, 'type');
});

test('accepts docx and video for imports', async () => {
  const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  assert.equal((await rehostMedia(memoryStore(), ref('attachment', 'w.docx'), opts(async () => ok(new Uint8Array([1]), docx)))).ok, true);
  assert.equal((await rehostMedia(memoryStore(), ref('video', 'c.mp4'), opts(async () => ok(new Uint8Array([1]), 'video/mp4')))).ok, true);
});

test('returns html text for html refs without storing media', async () => {
  const store = memoryStore();
  const result = await rehostMedia(store, ref('html', 'sim.html'), opts(async () => ok(new TextEncoder().encode('<html>hi</html>'), 'text/html')));
  assert.deepEqual({ ok: result.ok, text: result.text }, { ok: true, text: '<html>hi</html>' });
  assert.equal(store.map.size, 0);
});

test('reports download failures', async () => {
  const result = await rehostMedia(memoryStore(), ref('image'), opts(async () => new Response('', { status: 403 })));
  assert.equal(result.reason, 'failed');
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `node --test tests/unit/notion-media.test.js`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Write the store keys**

```js
// netlify/functions/_shared/notion-import-store.mjs
import { getJSON, setJSON } from './teaching-blobs.mjs';

export const JOB_ID = /^nij_[a-z0-9]{8,32}$/;

export const notionJobKey = (id) => `notion-import/jobs/${id}`;
export const notionReportKey = (id) => `notion-import/reports/${id}`;
export const NOTION_SOURCE_MAP_KEY = 'notion-import/source-map';
export const DOCUMENT_PREFIX = 'documents/';
export const documentKey = (id) => `${DOCUMENT_PREFIX}${id}`;

export async function readSourceMap(store) {
  const map = await getJSON(store, NOTION_SOURCE_MAP_KEY);
  return map && typeof map === 'object' ? map : {};
}

export async function writeJob(store, id, patch) {
  const current = (await getJSON(store, notionJobKey(id))) ?? { id };
  const next = { ...current, ...patch, id, updated_at: new Date().toISOString() };
  await setJSON(store, notionJobKey(id), next);
  return next;
}
```

- [ ] **Step 4: Write the rehoster**

```js
// netlify/functions/_shared/notion-media.mjs
import { createHash } from 'node:crypto';
import { getJSON, mediaFileKey, mediaKey, setJSON, slugify } from './teaching-blobs.mjs';
import { ALLOWED_MEDIA_MIME, mediaTypeFromMime } from '../media-upload.mjs';

/** Server-side imports only. The browser upload route keeps its 10 MB cap. */
export const IMPORT_MAX_BYTES = 200 * 1024 * 1024;
export const IMPORT_HTML_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_ALLOWED_MIME = new Set([
  ...ALLOWED_MEDIA_MIME,
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const BY_EXTENSION = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4',
  webm: 'video/webm', mov: 'video/quicktime', zip: 'application/zip', txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

export function importMediaId(ref) {
  return `media_n_${createHash('sha256').update(`notion-media:${ref}`).digest('hex').slice(0, 24)}`;
}

function mimeFor(res, name) {
  const header = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (header && header !== 'application/octet-stream' && header !== 'binary/octet-stream') return header;
  const ext = String(name).split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[ext] ?? header;
}

async function readCapped(res, maxBytes) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/**
 * @returns {Promise<{ok:true,url?:string,text?:string,media_id?:string}|{ok:false,reason:'too_big'|'type'|'failed',message:string}>}
 */
export async function rehostMedia(store, mediaRef, { fetchImpl = fetch, origin, now, maxBytes = IMPORT_MAX_BYTES }) {
  const id = importMediaId(mediaRef.ref);
  const fileUrl = new URL(`/api/media/${id}/file`, origin).href;
  if (mediaRef.purpose !== 'html' && (await getJSON(store, mediaKey(id)))) {
    return { ok: true, url: fileUrl, media_id: id };
  }
  let res;
  try {
    res = await fetchImpl(mediaRef.url);
  } catch (error) {
    return { ok: false, reason: 'failed', message: `Could not download ${mediaRef.name}: ${error.message}` };
  }
  if (!res.ok) return { ok: false, reason: 'failed', message: `Could not download ${mediaRef.name} (HTTP ${res.status}).` };

  if (mediaRef.purpose === 'html') {
    const bytes = await readCapped(res, IMPORT_HTML_MAX_BYTES);
    if (!bytes) return { ok: false, reason: 'too_big', message: `${mediaRef.name} is over 2 MB.` };
    return { ok: true, text: new TextDecoder().decode(bytes) };
  }

  const mime = mimeFor(res, mediaRef.name);
  if (!IMPORT_ALLOWED_MIME.has(mime)) {
    return { ok: false, reason: 'type', message: `${mediaRef.name} (${mime || 'unknown type'}) can't be stored.` };
  }
  const bytes = await readCapped(res, maxBytes);
  if (!bytes) {
    return { ok: false, reason: 'too_big', message: `${mediaRef.name} is over ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  }
  const title = mediaRef.name || 'Imported file';
  const mediaType = mime.startsWith('video/') ? 'video' : mediaTypeFromMime(mime);
  await store.set(mediaFileKey(id), bytes, { metadata: { contentType: mime } });
  await setJSON(store, mediaKey(id), {
    id, type: 'media', title, slug: slugify(title), status: 'active', provider: 'direct',
    media_type: mediaType, mime_type: mime, file_name: mediaRef.name || undefined,
    preview_url: fileUrl, download_url: fileUrl, sharing: 'public_link',
    created_at: now, updated_at: now, schema_version: 1
  });
  return { ok: true, url: fileUrl, media_id: id };
}
```

- [ ] **Step 5: Run it and check it passes**

Run: `node --test tests/unit/notion-media.test.js`
Expected: PASS. If importing `../media-upload.mjs` at module level causes trouble (it exports a default handler), move `ALLOWED_MEDIA_MIME` and `mediaTypeFromMime` into `_shared/media-rules.mjs`, re-export them from `media-upload.mjs`, and import from the shared file instead.

- [ ] **Step 6: Check the file route can serve large and video files**

Read `netlify/functions/media-file.mjs`. If it buffers the whole blob and returns it as one response body, files over the platform's buffered limit won't serve. If so, change it to return `store.get(key, { type: 'stream' })` as the `Response` body, with the stored `contentType`. Add a test in the existing media-file test file (or a new `tests/unit/media-file-stream.test.js`) that a `video/mp4` blob comes back with `content-type: video/mp4`.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/notion-import-store.mjs netlify/functions/_shared/notion-media.mjs tests/unit/notion-media.test.js netlify/functions/media-file.mjs tests/unit
git commit -m "Notion import: job and source-map keys, media rehosting with import cap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Applier

**Files:**
- Create: `netlify/functions/_shared/notion-apply.mjs`
- Test: `tests/unit/notion-apply.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/notion-apply.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPlan, replacePlaceholders } from '../../netlify/functions/_shared/notion-apply.mjs';
import { NOTION_SOURCE_MAP_KEY } from '../../netlify/functions/_shared/notion-import-store.mjs';
import { draftLessonKey, subjectKey, unitKey, versionIndexKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const now = '2026-10-18T00:00:00.000Z';
function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    map,
    read: (k) => (map.has(k) ? JSON.parse(map.get(k)) : null),
    async get(key, opts) { if (!map.has(key)) return null; return opts?.type === 'json' ? JSON.parse(map.get(key)) : map.get(key); },
    async set(key, value) { map.set(key, typeof value === 'string' ? value : JSON.stringify({ bytes: true })); },
    async setJSON(key, value) { map.set(key, JSON.stringify(value)); },
    async delete(key) { map.delete(key); }
  };
}
const common = (id, title) => ({ id, title, slug: 'x', status: 'active', created_at: now, updated_at: now, schema_version: 1 });
const source = (page_id) => ({ system: 'notion', page_id, imported_at: now, last_edited_at: now });
const img = { id: 'blk_1', type: 'block', block_type: 'image', variant: 'large', visibility: 'student_teacher',
  content: { url: 'notion-media:img1', alt_text: 'a' }, layout: {}, print: {}, settings: {}, created_at: now, updated_at: now, schema_version: 1 };

function plan(overrides = {}) {
  return {
    root_page_id: 'u1',
    new_subjects: [],
    media: [{ ref: 'img1', page_id: 'l1', notion_block_id: 'n1', url: 'https://files.example/i.png', name: 'i.png', purpose: 'image' }],
    warnings: [], skipped: [], html_apps: [],
    entities: [
      { page_id: 'u1', parent_page_id: null, kind: 'unit', label: 'Unit', id: 'unit_n_u1', title: 'U', existing: false, needs: [], suggested: {},
        record: { ...common('unit_n_u1', 'U'), type: 'unit', year_id: 'year_7', subject_id: 'subject_1', lesson_ids: ['lesson_n_l1'], blocks: [], source: source('u1') } },
      { page_id: 'l1', parent_page_id: 'u1', kind: 'lesson', label: 'Lesson', id: 'lesson_n_l1', title: 'L', existing: false, needs: [], suggested: {},
        record: { ...common('lesson_n_l1', 'L'), type: 'lesson', unit_id: 'unit_n_u1', sequence: 1, blocks: [img], review_status: 'needs_review', source: source('l1') } }
    ],
    ...overrides
  };
}
const rehost = async (_store, ref) => ({ ok: true, url: `https://hub.example/api/media/m_${ref.ref}/file` });
const subject = { ...common('subject_1', 'S'), type: 'subject', display_title: 'S', unit_ids: [], outcome_ids: [], class_ids: [] };

test('replacePlaceholders swaps media refs anywhere in a record', () => {
  const out = replacePlaceholders({ a: ['notion-media:x', { b: 'notion-media:y' }], c: 'keep' }, new Map([['x', 'X'], ['y', 'Y']]));
  assert.deepEqual(out, { a: ['X', { b: 'Y' }], c: 'keep' });
});

test('creates unit and lesson, rehosts media, links the subject and records the source map', async () => {
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, plan(), { now, rehost });
  assert.deepEqual(report.written.sort(), ['lesson_n_l1', 'unit_n_u1']);
  assert.equal(store.read(draftLessonKey('lesson_n_l1')).blocks[0].content.url, 'https://hub.example/api/media/m_img1/file');
  assert.deepEqual(store.read(subjectKey('subject_1')).unit_ids, ['unit_n_u1']);
  assert.deepEqual(store.read(NOTION_SOURCE_MAP_KEY), { u1: 'unit_n_u1', l1: 'lesson_n_l1' });
});

test('re-import snapshots the existing lesson, keeps created_at and hub-only fields', async () => {
  const existing = { ...common('lesson_n_l1', 'Old'), created_at: '2026-01-01T00:00:00.000Z', type: 'lesson', unit_id: 'unit_n_u1', sequence: 1, blocks: [], published_at: '2026-02-01T00:00:00.000Z', source: source('l1') };
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [draftLessonKey('lesson_n_l1')]: existing });
  await applyPlan(store, plan(), { now, rehost });
  const lesson = store.read(draftLessonKey('lesson_n_l1'));
  assert.equal(lesson.title, 'L');
  assert.equal(lesson.created_at, '2026-01-01T00:00:00.000Z');
  assert.equal(lesson.published_at, '2026-02-01T00:00:00.000Z');
  assert.equal(store.read(versionIndexKey('lesson', 'lesson_n_l1')).entries.length, 1);
});

test('re-import keeps lessons added to the unit in the Teaching Hub', async () => {
  const existingUnit = { ...common('unit_n_u1', 'U'), type: 'unit', year_id: 'year_7', subject_id: 'subject_1', lesson_ids: ['lesson_hub_only', 'lesson_n_l1'], blocks: [] };
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [unitKey('unit_n_u1')]: existingUnit });
  await applyPlan(store, plan(), { now, rehost });
  assert.deepEqual(store.read(unitKey('unit_n_u1')).lesson_ids, ['lesson_n_l1', 'lesson_hub_only']);
});

test('a failed download keeps the original url and adds a warning', async () => {
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, plan(), { now, rehost: async () => ({ ok: false, reason: 'too_big', message: 'big' }) });
  assert.equal(store.read(draftLessonKey('lesson_n_l1')).blocks[0].content.url, 'https://files.example/i.png');
  assert.ok(report.warnings.some((w) => w.rule === 'file_too_big'));
});

test('an invalid entity is skipped and removed from its unit; others still write', async () => {
  const bad = plan();
  bad.entities[1].record.sequence = 'not-a-number';
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, bad, { now, rehost });
  assert.deepEqual(report.written, ['unit_n_u1']);
  assert.deepEqual(store.read(unitKey('unit_n_u1')).lesson_ids, []);
  assert.ok(report.warnings.some((w) => w.rule === 'invalid'));
});

test('entities with unmet needs are skipped', async () => {
  const p = plan();
  p.entities[1].needs = ['unit'];
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, p, { now, rehost });
  assert.deepEqual(report.written, ['unit_n_u1']);
});

test('creates requested new subjects first', async () => {
  const p = plan({ new_subjects: [{ id: 'subject_n_new', title: 'New' }] });
  p.entities[0].record.subject_id = 'subject_n_new';
  const store = memoryStore();
  await applyPlan(store, p, { now, rehost });
  assert.deepEqual(store.read(subjectKey('subject_n_new')).unit_ids, ['unit_n_u1']);
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `node --test tests/unit/notion-apply.test.js`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Write the applier**

```js
// netlify/functions/_shared/notion-apply.mjs
import {
  ClassSchema, DocumentSchema, LessonSchema, MEDIA_PLACEHOLDER_PREFIX, UnitSchema
} from './notion-import-core.mjs';
import { classKey, draftLessonKey, getJSON, setJSON, slugify, subjectKey, unitKey } from './teaching-blobs.mjs';
import { blobJsonStore, tryWriteCheckpoint } from './teaching-versions.mjs';
import { documentKey, NOTION_SOURCE_MAP_KEY, readSourceMap } from './notion-import-store.mjs';

const SCHEMA = { unit: UnitSchema, lesson: LessonSchema, class: ClassSchema, document: DocumentSchema };
const KEY = { unit: unitKey, lesson: draftLessonKey, class: classKey, document: documentKey };

export function replacePlaceholders(value, urls) {
  if (typeof value === 'string' && value.startsWith(MEDIA_PLACEHOLDER_PREFIX)) {
    return urls.get(value.slice(MEDIA_PLACEHOLDER_PREFIX.length)) ?? value;
  }
  if (Array.isArray(value)) return value.map((v) => replacePlaceholders(v, urls));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replacePlaceholders(v, urls)]));
  }
  return value;
}

function merge(kind, existing, planned, ownIds) {
  if (!existing) return planned;
  const merged = { ...existing, ...planned, created_at: existing.created_at ?? planned.created_at };
  if (kind === 'unit') {
    const keep = (existing.lesson_ids ?? []).filter((id) => !ownIds.has(id));
    merged.lesson_ids = [...planned.lesson_ids, ...keep.filter((id) => !planned.lesson_ids.includes(id))];
  }
  if (kind === 'class') {
    const keep = (existing.active_unit_ids ?? []).filter((id) => !planned.active_unit_ids.includes(id));
    merged.active_unit_ids = [...planned.active_unit_ids, ...keep];
    merged.homepage = { ...(existing.homepage ?? {}), custom: planned.homepage.custom };
    if (!merged.homepage.announcements) merged.homepage.announcements = [];
    if (!merged.homepage.resources) merged.homepage.resources = [];
  }
  return merged;
}

async function addToList(store, key, field, id) {
  const record = await getJSON(store, key);
  if (!record) return;
  const list = Array.isArray(record[field]) ? record[field] : [];
  if (list.includes(id)) return;
  await setJSON(store, key, { ...record, [field]: [...list, id] });
}

/**
 * @param rehost (store, mediaRef) => Promise<{ok, url?, text?, reason?, message?}>
 * @returns report { written, skipped, warnings }
 */
export async function applyPlan(store, plan, { now, rehost, onProgress = async () => {} }) {
  const warnings = [...plan.warnings];
  const skipped = [];
  const written = [];

  for (const subject of plan.new_subjects) {
    if (await getJSON(store, subjectKey(subject.id))) continue;
    await setJSON(store, subjectKey(subject.id), {
      id: subject.id, type: 'subject', title: subject.title, display_title: subject.title, slug: slugify(subject.title),
      status: 'active', unit_ids: [], outcome_ids: [], class_ids: [], created_at: now, updated_at: now, schema_version: 1
    });
  }

  const urls = new Map();
  let done = 0;
  for (const ref of plan.media) {
    const result = await rehost(store, ref);
    if (result.ok) urls.set(ref.ref, result.text ?? result.url);
    else {
      urls.set(ref.ref, ref.purpose === 'html' ? `<!-- ${ref.name} could not be imported -->` : ref.url);
      warnings.push({
        page_id: ref.page_id, notion_block_id: ref.notion_block_id,
        rule: result.reason === 'too_big' ? 'file_too_big' : 'file_failed',
        message: `${result.message} The block links to the original file instead.`
      });
    }
    await onProgress({ phase: 'media', done: ++done, total: plan.media.length });
  }

  // Validate everything first so parents can drop children that fail.
  const ready = [];
  for (const entity of plan.entities) {
    if (entity.needs.length) {
      skipped.push({ page_id: entity.page_id, reason: `Needs a ${entity.needs.join(' and ')}.` });
      continue;
    }
    const record = replacePlaceholders(entity.record, urls);
    const parsed = SCHEMA[entity.kind].safeParse(record);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      skipped.push({ page_id: entity.page_id, reason: 'Did not pass validation.' });
      warnings.push({ page_id: entity.page_id, notion_block_id: null, rule: 'invalid', message: `“${entity.title}” was not imported: ${issue.path.join('.')} ${issue.message}` });
      continue;
    }
    ready.push({ entity, record });
  }
  const readyIds = new Set(ready.map((r) => r.entity.id));
  const ownIds = new Set(plan.entities.map((e) => e.id));
  for (const { entity, record } of ready) {
    if (entity.kind === 'unit') record.lesson_ids = record.lesson_ids.filter((id) => readyIds.has(id) || !ownIds.has(id));
    if (entity.kind === 'class') record.active_unit_ids = record.active_unit_ids.filter((id) => readyIds.has(id) || !ownIds.has(id));
  }

  const versions = blobJsonStore(store);
  const sourceMap = await readSourceMap(store);
  done = 0;
  for (const { entity, record } of ready) {
    const key = KEY[entity.kind](entity.id);
    const existing = await getJSON(store, key);
    if (existing && (entity.kind === 'lesson' || entity.kind === 'unit')) {
      await tryWriteCheckpoint(versions, { kind: entity.kind, parentId: entity.id, snapshot: existing, reason: 'notion_import', now });
    }
    if (existing && entity.kind === 'class') {
      await tryWriteCheckpoint(versions, { kind: 'class_homepage', parentId: entity.id, snapshot: { homepage: existing.homepage }, reason: 'notion_import', now });
    }
    await setJSON(store, key, merge(entity.kind, existing, record, ownIds));
    if (entity.kind === 'lesson' && !ownIds.has(record.unit_id)) {
      await addToList(store, unitKey(record.unit_id), 'lesson_ids', entity.id);
    }
    if (entity.kind === 'unit') await addToList(store, subjectKey(record.subject_id), 'unit_ids', entity.id);
    if (entity.kind === 'class') await addToList(store, subjectKey(record.subject_id), 'class_ids', entity.id);
    sourceMap[entity.page_id] = entity.id;
    written.push(entity.id);
    await onProgress({ phase: 'write', done: ++done, total: ready.length });
  }
  await setJSON(store, NOTION_SOURCE_MAP_KEY, sourceMap);
  return { written, skipped: [...plan.skipped, ...skipped], warnings };
}
```

- [ ] **Step 4: Run it and check it passes**

Run: `node --test tests/unit/notion-apply.test.js`
Expected: PASS. If `tryWriteCheckpoint` rejects the reason `'notion_import'` because of an allow-list in `teaching-versions.mjs`, add `'notion_import'` to that list.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/notion-apply.mjs tests/unit/notion-apply.test.js netlify/functions/_shared/teaching-versions.mjs
git commit -m "Notion import: validate, version and write imported entities

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Endpoints

> **Superseded in part (queued-job rework).** The code below was written first. The shipped version differs: server-minted job ids and a sync `POST /api/notion-import/jobs` that queues the job (see Task 13 `api.ts` for the contract), background functions that take `{ job_id }` and read the job record, slim stored previews, and per-request timeouts. Read `netlify/functions/notion-import*.mjs` and `_shared/notion-import-run.mjs` for the real code.

**Files:**
- Create: `netlify/functions/_shared/notion-import-run.mjs`
- Create: `netlify/functions/notion-import.mjs`
- Create: `netlify/functions/notion-import-plan.mjs`
- Create: `netlify/functions/notion-import-apply.mjs`
- Test: `tests/integration/notion-import-flow.test.js`

- [ ] **Step 1: Write the failing end-to-end test (fake Notion and fake file host)**

```js
// tests/integration/notion-import-flow.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { runApply, runPlan } from '../../netlify/functions/_shared/notion-import-run.mjs';
import { notionJobKey } from '../../netlify/functions/_shared/notion-import-store.mjs';
import { draftLessonKey, subjectKey, unitKey, yearKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const now = '2026-10-18T00:00:00.000Z';
const text = (plain_text) => [{ type: 'text', plain_text, href: null, annotations: {} }];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    map, read: (k) => (map.has(k) ? JSON.parse(map.get(k)) : null),
    async get(key, o) { if (!map.has(key)) return null; return o?.type === 'json' ? JSON.parse(map.get(key)) : map.get(key); },
    async set(key, v) { map.set(key, typeof v === 'string' ? v : JSON.stringify({ bytes: true })); },
    async setJSON(key, v) { map.set(key, JSON.stringify(v)); },
    async delete(key) { map.delete(key); },
    async list({ prefix } = {}) { return { blobs: [...map.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const common = (id, title) => ({ id, title, slug: 'x', status: 'active', created_at: now, updated_at: now, schema_version: 1 });
function page(id, title, category, sub = []) {
  return { object: 'page', id, url: '', last_edited_time: now, cover: null, properties: {
    Name: { id: 'title', type: 'title', title: text(title) },
    Category: { id: 'c', type: 'select', select: { name: category } },
    Subject: { id: 's', type: 'multi_select', multi_select: [{ name: 'Made-up Subject' }] },
    'Year Level': { id: 'y', type: 'multi_select', multi_select: [{ name: 'Year 9' }] },
    'Sub-item': { id: 'sub', type: 'relation', relation: sub.map((s) => ({ id: s })), has_more: false }
  } };
}
function fetchImpl(url) {
  const u = new URL(url);
  const routes = {
    '/v1/pages/u1': page('u1', 'Made-up Unit', 'Unit', ['l1']),
    '/v1/pages/l1': page('l1', 'Made-up Lesson', 'Workshop'),
    '/v1/blocks/u1/children': { results: [], has_more: false },
    '/v1/blocks/l1/children': { results: [
      { id: 'b1', type: 'paragraph', has_children: false, paragraph: { rich_text: text('Hello') } },
      { id: 'b2', type: 'image', has_children: false, image: { type: 'file', file: { url: 'https://files.example/pic.png' }, caption: text('Pic') } }
    ], has_more: false }
  };
  if (u.hostname === 'files.example') return Promise.resolve(new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } }));
  return Promise.resolve(routes[u.pathname] ? json(routes[u.pathname]) : json({ code: 'object_not_found' }, 404));
}
const seed = () => memoryStore({
  [yearKey('year_9')]: { ...common('year_9', 'Year 9'), type: 'year', year_level: 9 },
  [subjectKey('subject_1')]: { ...common('subject_1', 'Made-up Subject'), type: 'subject', display_title: 'Made-up Subject', unit_ids: [], outcome_ids: [], class_ids: [] }
});
const env = { NOTION_TEACHING_TOKEN: 't' };

test('plan then apply imports a unit with a rehosted image', async () => {
  const store = seed();
  await runPlan(store, { job_id: 'nij_test0001', page_id: 'u1' }, { env, fetchImpl, now, sleep: async () => {} });
  const planned = store.read(notionJobKey('nij_test0001'));
  assert.equal(planned.status, 'planned');
  assert.deepEqual(planned.plan.entities.map((e) => e.label), ['Unit', 'Workshop']);

  await runApply(store, { job_id: 'nij_test0002', page_id: 'u1', choices: { excluded_page_ids: [], overrides: {}, html_as_code: [] } },
    { env, fetchImpl, now, origin: 'https://hub.example', sleep: async () => {} });
  const done = store.read(notionJobKey('nij_test0002'));
  assert.equal(done.status, 'done');
  const lesson = store.read(draftLessonKey('lesson_n_l1'));
  assert.equal(lesson.pedagogical_mode, 'workshop');
  assert.match(lesson.blocks[1].content.url, /^https:\/\/hub\.example\/api\/media\/media_n_[0-9a-f]+\/file$/);
  assert.deepEqual(store.read(unitKey('unit_n_u1')).lesson_ids, ['lesson_n_l1']);
});

test('a missing token fails the job with a setup message', async () => {
  const store = seed();
  await runPlan(store, { job_id: 'nij_test0003', page_id: 'u1' }, { env: {}, fetchImpl, now });
  const job = store.read(notionJobKey('nij_test0003'));
  assert.equal(job.status, 'failed');
  assert.match(job.error, /NOTION_TEACHING_TOKEN/);
});

test('an unshared page fails the job with a sharing message', async () => {
  const store = seed();
  await runPlan(store, { job_id: 'nij_test0004', page_id: 'nope' }, { env, fetchImpl, now, sleep: async () => {} });
  assert.match(store.read(notionJobKey('nij_test0004')).error, /Connections/);
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `node --test tests/integration/notion-import-flow.test.js`
Expected: FAIL, because `notion-import-run.mjs` isn't found.

- [ ] **Step 3: Write the shared run module**

```js
// netlify/functions/_shared/notion-import-run.mjs
import { buildImportPlan } from './notion-import-core.mjs';
import { createNotionClient, NotionApiError } from './notion-client.mjs';
import { readNotionTree } from './notion-reader.mjs';
import { rehostMedia } from './notion-media.mjs';
import { applyPlan } from './notion-apply.mjs';
import { notionReportKey, readSourceMap, writeJob } from './notion-import-store.mjs';
import { listJSON, OUTCOME_PREFIX, setJSON, SUBJECT_PREFIX, YEAR_PREFIX } from './teaching-blobs.mjs';

export const EMPTY = { excluded_page_ids: [], overrides: {}, html_as_code: [] };

export function notionToken(env) {
  const token = typeof env?.NOTION_TEACHING_TOKEN === 'string' ? env.NOTION_TEACHING_TOKEN.trim() : '';
  if (!token) {
    throw new Error('Notion import is not set up: add NOTION_TEACHING_TOKEN to the site environment variables.');
  }
  return token;
}

export function friendlyError(error) {
  if (error instanceof NotionApiError && (error.code === 'object_not_found' || error.status === 404)) {
    return 'This page is not shared with the Teaching Hub integration. In Notion, open the Teaching database, choose ••• → Connections, and add “Teaching Hub import”.';
  }
  if (error instanceof NotionApiError && error.status === 401) {
    return 'Notion rejected the integration token. Check NOTION_TEACHING_TOKEN.';
  }
  return error?.message || 'The import failed.';
}

export function normalizePageId(raw) {
  const hex = String(raw ?? '').replace(/-/g, '').match(/[0-9a-f]{32}/i)?.[0];
  if (!hex) return String(raw ?? '');
  const h = hex.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function mapContext(store, choices, now) {
  const [years, subjects, outcomes, source_map] = await Promise.all([
    listJSON(store, YEAR_PREFIX), listJSON(store, SUBJECT_PREFIX), listJSON(store, OUTCOME_PREFIX), readSourceMap(store)
  ]);
  return {
    now,
    years: years.filter(Boolean).map((y) => ({ id: y.id, year_level: y.year_level })),
    subjects: subjects.filter(Boolean).map((s) => ({ id: s.id, title: s.display_title || s.title })),
    outcomes: outcomes.filter(Boolean).map((o) => ({ id: o.id, code: o.code })),
    source_map,
    choices: { ...EMPTY, ...choices }
  };
}

async function buildPlan(store, pageId, choices, deps) {
  const client = createNotionClient({ token: notionToken(deps.env), fetchImpl: deps.fetchImpl, sleep: deps.sleep });
  const tree = await readNotionTree(client, normalizePageId(pageId));
  return buildImportPlan(tree, await mapContext(store, choices, deps.now));
}

export async function runPlan(store, { job_id, page_id, choices }, deps) {
  const now = deps.now ?? new Date().toISOString();
  await writeJob(store, job_id, { kind: 'plan', status: 'running', phase: 'reading' });
  try {
    const plan = await buildPlan(store, page_id, choices, { ...deps, now });
    await writeJob(store, job_id, { status: 'planned', phase: 'done', plan });
  } catch (error) {
    await writeJob(store, job_id, { status: 'failed', error: friendlyError(error) });
  }
}

export async function runApply(store, { job_id, page_id, choices }, deps) {
  const now = deps.now ?? new Date().toISOString();
  await writeJob(store, job_id, { kind: 'apply', status: 'running', phase: 'reading' });
  try {
    // Re-read so Notion file URLs are fresh (they expire within minutes).
    const plan = await buildPlan(store, page_id, choices, { ...deps, now });
    const report = await applyPlan(store, plan, {
      now,
      rehost: (s, ref) => rehostMedia(s, ref, { fetchImpl: deps.fetchImpl, origin: deps.origin, now }),
      onProgress: (progress) => writeJob(store, job_id, { phase: progress.phase, progress })
    });
    await setJSON(store, notionReportKey(job_id), { job_id, page_id, created_at: now, ...report });
    await writeJob(store, job_id, { status: 'done', phase: 'done', report });
  } catch (error) {
    await writeJob(store, job_id, { status: 'failed', error: friendlyError(error) });
  }
}
```

`applyPlan` awaits every `onProgress` call. `writeJob` reads the record and then writes it, so a progress write still in flight could otherwise overwrite the final `done` status.

- [ ] **Step 4: Write the three function files**

```js
// netlify/functions/notion-import-plan.mjs
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { okResponse, withCors } from './_shared/http.mjs';
import { JOB_ID } from './_shared/notion-import-store.mjs';
import { runPlan } from './_shared/notion-import-run.mjs';

export const config = { path: '/api/notion-import/plan', method: ['POST', 'OPTIONS'], background: true };

export default createOperatorHandler(async (request, { env, store }) => {
  const body = await request.json().catch(() => ({}));
  if (!JOB_ID.test(String(body.job_id ?? '')) || !body.page_id) return withCors(okResponse(202, {}), request, env);
  await runPlan(store, body, { env, now: new Date().toISOString() });
  return withCors(okResponse(202, {}), request, env);
});
```

```js
// netlify/functions/notion-import-apply.mjs
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { okResponse, withCors } from './_shared/http.mjs';
import { JOB_ID } from './_shared/notion-import-store.mjs';
import { runApply } from './_shared/notion-import-run.mjs';

export const config = { path: '/api/notion-import/apply', method: ['POST', 'OPTIONS'], background: true };

export default createOperatorHandler(async (request, { env, store }) => {
  const body = await request.json().catch(() => ({}));
  if (!JOB_ID.test(String(body.job_id ?? '')) || !body.page_id) return withCors(okResponse(202, {}), request, env);
  await runApply(store, body, { env, now: new Date().toISOString(), origin: new URL(request.url).origin });
  return withCors(okResponse(202, {}), request, env);
});
```

```js
// netlify/functions/notion-import.mjs
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { getJSON } from './_shared/teaching-blobs.mjs';
import { JOB_ID, notionJobKey } from './_shared/notion-import-store.mjs';
import { createNotionClient } from './_shared/notion-client.mjs';
import { friendlyError, notionToken } from './_shared/notion-import-run.mjs';

export const config = { path: ['/api/notion-import/search', '/api/notion-import/jobs/:id'] };

export function createNotionImportHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    const url = new URL(request.url);

    const jobId = context.params?.id ?? url.pathname.match(/\/jobs\/([^/]+)$/)?.[1];
    if (jobId) {
      if (!JOB_ID.test(jobId)) return withCors(errorResponse(400, 'validation_error', 'Bad job id', false), request, env);
      const job = await getJSON(store, notionJobKey(jobId));
      return withCors(job ? okResponse(200, job) : errorResponse(404, 'not_found', 'Job not found', false), request, env);
    }

    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    const dataSource = typeof env.NOTION_TEACHING_DATA_SOURCE_ID === 'string' ? env.NOTION_TEACHING_DATA_SOURCE_ID.trim() : '';
    try {
      if (!dataSource) throw new Error('Add NOTION_TEACHING_DATA_SOURCE_ID to search the Teaching database.');
      const client = createNotionClient({ token: notionToken(env), fetchImpl: deps.fetchImpl });
      const result = await client.queryDataSource(dataSource, {
        page_size: 20,
        ...(q ? { filter: { property: 'Name', title: { contains: q } } } : {}),
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
      });
      const items = (result.results ?? []).map((page) => ({
        page_id: page.id,
        title: (Object.values(page.properties ?? {}).find((p) => p?.type === 'title')?.title ?? []).map((t) => t.plain_text).join('') || 'Untitled',
        category: page.properties?.Category?.select?.name ?? null,
        last_edited_time: page.last_edited_time
      }));
      return withCors(okResponse(200, { items }), request, env);
    } catch (error) {
      return withCors(errorResponse(502, 'notion_error', friendlyError(error), true), request, env);
    }
  }, deps);
}

export default createNotionImportHandler();
```

- [ ] **Step 5: Run the tests and check they pass**

Run: `node --test tests/integration/notion-import-flow.test.js tests/unit/notion-*.test.js`
Expected: PASS. If `listJSON` needs `store.list()` with a shape different from the fake's, copy the fake list shape from an existing integration test that uses `listJSON` (search `tests/integration` for `list(`).

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/notion-import-run.mjs netlify/functions/notion-import.mjs netlify/functions/notion-import-plan.mjs netlify/functions/notion-import-apply.mjs tests/integration/notion-import-flow.test.js
git commit -m "Notion import: search, job status, and background plan/apply endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Preview model (pure)

**Files:**
- Create: `apps/teaching/src/teacher/notion-import/api.ts`
- Create: `apps/teaching/src/teacher/notion-import/preview-model.ts`
- Test: `apps/teaching/tests/unit/notion-import-preview.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/notion-import-preview.test.ts
import { describe, expect, it } from 'vitest';
import { parseNotionPageId } from '@/teacher/notion-import/api';
import { buildRows, choicesFrom, groupWarnings, toggleExcluded } from '@/teacher/notion-import/preview-model';
import type { ImportPlanPreview } from '@/notion-import/types';

const entity = (page_id: string, parent_page_id: string | null, label: string, needs: any[] = []) => ({
  page_id, parent_page_id, kind: 'lesson' as const, label, id: `id_${page_id}`, title: `T ${page_id}`,
  existing: page_id === 'l2', needs, suggested: {}
});
const plan: ImportPlanPreview = {
  root_page_id: 'u1',
  entities: [entity('u1', null, 'Unit'), entity('l1', 'u1', 'Lesson'), entity('l2', 'u1', 'Workshop')],
  skipped: [{ page_id: 'm1', parent_page_id: 'u1', title: 'Map', reason: 'Curriculum Map pages are not imported.' }],
  new_subjects: [], media_count: 0, html_apps: [{ page_id: 'l1', notion_block_id: 'c1', preview: '<html>' }],
  warnings: [
    { page_id: 'l1', notion_block_id: 'b', rule: 'flattened', message: 'a' },
    { page_id: 'l1', notion_block_id: 'c', rule: 'file_too_big', message: 'b' },
    { page_id: 'l2', notion_block_id: 'd', rule: 'flattened', message: 'c' }
  ]
};

describe('parseNotionPageId', () => {
  it('reads ids from Notion links and raw ids', () => {
    expect(parseNotionPageId('https://www.notion.so/Some-Lesson-0123456789abcdef0123456789abcdef?pvs=4'))
      .toBe('01234567-89ab-cdef-0123-456789abcdef');
    expect(parseNotionPageId('01234567-89ab-cdef-0123-456789abcdef')).toBe('01234567-89ab-cdef-0123-456789abcdef');
    expect(parseNotionPageId('not a link')).toBeNull();
  });
});

describe('preview model', () => {
  it('builds an indented tree with skipped pages and warning counts', () => {
    const rows = buildRows(plan, new Set());
    expect(rows.map((r) => [r.page_id, r.depth, r.label, r.included, r.warning_count])).toEqual([
      ['u1', 0, 'Unit', true, 0], ['l1', 1, 'Lesson', true, 2], ['l2', 1, 'Workshop', true, 1], ['m1', 1, 'Skipped', false, 0]
    ]);
    expect(rows[2].badge).toBe('Updates existing copy');
  });

  it('excluding a parent excludes its descendants', () => {
    const excluded = toggleExcluded(plan, new Set(), 'u1');
    expect([...excluded].sort()).toEqual(['l1', 'l2', 'u1']);
    expect([...toggleExcluded(plan, excluded, 'u1')]).toEqual([]);
  });

  it('groups warnings by rule and drops those for excluded pages', () => {
    const groups = groupWarnings(plan, new Set(['l2']));
    expect(groups.map((g) => [g.rule, g.items.length])).toEqual([['flattened', 1], ['file_too_big', 1]]);
  });

  it('builds choices', () => {
    expect(choicesFrom(new Set(['l2']), { u1: { year_id: 'y' } }, new Set(['c1']))).toEqual({
      excluded_page_ids: ['l2'], overrides: { u1: { year_id: 'y' } }, html_as_code: ['c1']
    });
  });
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-preview.test.ts`
Expected: FAIL, because the modules aren't found.

- [ ] **Step 3: Write `api.ts`**

First add the preview type to `apps/teaching/src/notion-import/types.ts` (it is what `job.plan` holds; the full `ImportPlan` never leaves the server):

```ts
export type PlannedEntityPreview = Omit<PlannedEntity, 'record'>;
export interface ImportPlanPreview {
  root_page_id: string;
  entities: PlannedEntityPreview[];
  skipped: SkippedPage[];
  warnings: ImportWarning[];
  html_apps: HtmlAppCandidate[];
  new_subjects: NewSubject[];
  media_count: number;
}
```


```ts
// apps/teaching/src/teacher/notion-import/api.ts
import { apiGet, apiPost } from '@/api/client';
import type { ImportChoices, ImportPlanPreview, ImportWarning } from '@/notion-import/types';

export interface NotionSearchItem { page_id: string; title: string; category: string | null; last_edited_time: string }
export interface NotionImportReport {
  written: string[];
  skipped: Array<{ page_id: string; reason: string }>;
  warnings: ImportWarning[];
}
export interface NotionImportJob {
  id: string;
  kind: 'plan' | 'apply';
  /** 'queued' until the background function picks it up, then 'running'; plan jobs end 'planned', apply jobs 'done'. */
  status: 'queued' | 'running' | 'planned' | 'done' | 'failed';
  page_id: string;
  phase?: string;
  progress?: { phase: string; done: number; total: number };
  /** Slim preview: no entity records, no media urls. Apply re-reads Notion. */
  plan?: ImportPlanPreview;
  report?: NotionImportReport;
  error?: string;
}

/** The server accepts links, `?p=` peek links and bare ids, and answers 400 "Choose a Notion page to import." otherwise. This only gives instant feedback. */
export function parseNotionPageId(input: string): string | null {
  let text = input.trim();
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    const fromP = url.searchParams.get('p');
    text = fromP ?? url.pathname; // never the query: ?v= is a database view id
  } catch { /* a bare id */ }
  const found = text.match(/(?<![0-9a-f])[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}(?![0-9a-f])/gi);
  const hex = found?.[found.length - 1]?.replace(/-/g, '').toLowerCase();
  if (!hex) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const searchNotion = (q: string) =>
  apiGet<{ items: NotionSearchItem[] }>(`/api/notion-import/search?q=${encodeURIComponent(q)}`);

export const getNotionJob = (id: string) => apiGet<NotionImportJob>(`/api/notion-import/jobs/${id}`);

/**
 * POST /api/notion-import/jobs   { kind: 'plan' | 'apply', page_id: string, choices?: ImportChoices }
 *   202 { job_id }   the server mints the id (nij_...) and queues the job
 *   400 validation_error   "Choose a Notion page to import." (or bad kind / choices)
 *   503 not_configured     NOTION_TEACHING_TOKEN missing; retryable false
 *   502 start_failed       the background function could not be kicked; retryable true
 */
async function startJob(kind: 'plan' | 'apply', pageId: string, choices?: ImportChoices): Promise<string> {
  const { job_id } = await apiPost<{ job_id: string }>('/api/notion-import/jobs', { kind, page_id: pageId, choices });
  return job_id;
}

export const startPlan = (pageId: string, choices?: ImportChoices) => startJob('plan', pageId, choices);
export const startApply = (pageId: string, choices: ImportChoices) => startJob('apply', pageId, choices);

/** Polls until the job leaves 'queued' and 'running'. */
export async function waitForJob(
  id: string,
  onUpdate: (job: NotionImportJob) => void,
  { intervalMs = 1500, timeoutMs = 15 * 60 * 1000, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) } = {}
): Promise<NotionImportJob> {
  const started = Date.now();
  for (;;) {
    const job = await getNotionJob(id).catch(() => null);
    if (job) {
      onUpdate(job);
      if (job.status !== 'queued' && job.status !== 'running') return job;
    }
    if (Date.now() - started > timeoutMs) throw new Error('The import is taking too long. Check back shortly.');
    await sleep(intervalMs);
  }
}
```

Check `apiPost`'s signature in `src/api/client.ts` (around line 91). If it takes `(path, body, options)`, the calls above are right. If the body is wrapped differently, adjust these two calls to match.

- [ ] **Step 4: Write `preview-model.ts`**

```ts
// apps/teaching/src/teacher/notion-import/preview-model.ts
import type { EntityOverride, ImportChoices, ImportPlanPreview, ImportWarning, WarningRule } from '@/notion-import/types';

export interface PreviewRow {
  page_id: string;
  depth: number;
  title: string;
  label: string;
  included: boolean;
  skipped_reason?: string;
  badge?: string;
  needs: string[];
  warning_count: number;
}

const RULE_TITLES: Partial<Record<WarningRule, string>> = {
  flattened: 'Layouts that were flattened',
  skipped: 'Skipped blocks',
  unsupported: 'Unsupported blocks',
  file_too_big: 'Files too big to store',
  file_failed: 'Files that failed',
  html_app: 'HTML that will run as an interactive',
  mermaid: 'Mermaid diagrams kept as code',
  alt_text: 'Images without alt text',
  outcome_unmatched: 'Outcomes not in the catalogue',
  limit: 'Limits reached',
  needs_choice: 'Choices needed',
  invalid: 'Not imported'
};

function childrenOf(plan: ImportPlanPreview, pageId: string): string[] {
  return [
    ...plan.entities.filter((e) => e.parent_page_id === pageId).map((e) => e.page_id),
    ...plan.skipped.filter((s) => s.parent_page_id === pageId).map((s) => s.page_id)
  ];
}

export function buildRows(plan: ImportPlanPreview, excluded: Set<string>): PreviewRow[] {
  const rows: PreviewRow[] = [];
  const walk = (pageId: string, depth: number) => {
    const entity = plan.entities.find((e) => e.page_id === pageId);
    const skipped = plan.skipped.find((s) => s.page_id === pageId);
    if (entity) {
      rows.push({
        page_id: pageId, depth, title: entity.title, label: entity.label, included: !excluded.has(pageId),
        badge: entity.existing ? 'Updates existing copy' : undefined, needs: entity.needs,
        warning_count: plan.warnings.filter((w) => w.page_id === pageId && w.rule !== 'needs_choice').length
      });
    } else if (skipped) {
      rows.push({ page_id: pageId, depth, title: skipped.title, label: 'Skipped', included: false, skipped_reason: skipped.reason, needs: [], warning_count: 0 });
    }
    for (const child of childrenOf(plan, pageId)) walk(child, depth + 1);
  };
  walk(plan.root_page_id, 0);
  return rows;
}

export function toggleExcluded(plan: ImportPlanPreview, excluded: Set<string>, pageId: string): Set<string> {
  const next = new Set(excluded);
  const subtree: string[] = [];
  const collect = (id: string) => { subtree.push(id); childrenOf(plan, id).forEach(collect); };
  collect(pageId);
  const exclude = !excluded.has(pageId);
  for (const id of subtree) {
    if (exclude) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function groupWarnings(plan: ImportPlanPreview, excluded: Set<string>): Array<{ rule: WarningRule; title: string; items: ImportWarning[] }> {
  const groups = new Map<WarningRule, ImportWarning[]>();
  for (const w of plan.warnings) {
    if (excluded.has(w.page_id) || w.rule === 'needs_choice') continue;
    groups.set(w.rule, [...(groups.get(w.rule) ?? []), w]);
  }
  return [...groups].map(([rule, items]) => ({ rule, title: RULE_TITLES[rule] ?? rule, items }));
}

export function choicesFrom(excluded: Set<string>, overrides: Record<string, EntityOverride>, htmlAsCode: Set<string>): ImportChoices {
  return { excluded_page_ids: [...excluded], overrides, html_as_code: [...htmlAsCode] };
}
```

- [ ] **Step 5: Run it and check it passes**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-preview.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/teacher/notion-import apps/teaching/tests/unit/notion-import-preview.test.ts
git commit -m "Notion import: client API and preview model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Preview modal and the create-menu entry

**Files:**
- Create: `apps/teaching/src/teacher/notion-import/modal.ts`
- Modify: `apps/teaching/src/teacher/create/control.ts`
- Modify: `apps/teaching/scripts/mock-api.ts` (mock endpoints for local dev and tests)
- Test: `apps/teaching/tests/unit/notion-import-modal.test.ts`

- [ ] **Step 1: Look at the existing modal for structure and classes**

Read `apps/teaching/src/teacher/create/modal.ts`. Reuse its overlay and dialog classes (backdrop, `glass-panel`, header, close button, focus trap, Escape to close) so the new modal matches the rest of the Teaching Hub. Check `docs/CURSOR-UI-FAILURES.md` for entries about modals, focus and 390px overflow, and follow them.

- [ ] **Step 2: Write the failing DOM test**

```ts
// apps/teaching/tests/unit/notion-import-modal.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/teacher/notion-import/api', async (orig) => {
  const actual = await orig<typeof import('@/teacher/notion-import/api')>();
  return {
    ...actual,
    startPlan: vi.fn(async () => 'nij_plan0001'),
    startApply: vi.fn(async () => 'nij_appl0001'),
    waitForJob: vi.fn(async (id: string, onUpdate: (j: any) => void) => {
      const job = id === 'nij_plan0001'
        ? { id, kind: 'plan', status: 'planned', plan: {
            root_page_id: 'u1', new_subjects: [], media: [], html_apps: [], skipped: [],
            warnings: [{ page_id: 'l1', notion_block_id: 'b', rule: 'flattened', message: 'Columns stacked.' }],
            entities: [
              { page_id: 'u1', parent_page_id: null, kind: 'unit', label: 'Unit', id: 'unit_n_u1', title: 'Made-up Unit', existing: false, needs: [], suggested: { year_id: 'year_7', subject_id: 'subject_1' }, record: {} },
              { page_id: 'l1', parent_page_id: 'u1', kind: 'lesson', label: 'Lesson', id: 'lesson_n_l1', title: 'Made-up Lesson', existing: false, needs: [], suggested: {}, record: {} }
            ] } }
        : { id, kind: 'apply', status: 'done', report: { written: ['unit_n_u1', 'lesson_n_l1'], skipped: [], warnings: [] } };
      onUpdate(job);
      return job;
    }),
    searchNotion: vi.fn(async () => ({ items: [] }))
  };
});

import { openNotionImportModal } from '@/teacher/notion-import/modal';
import { startApply } from '@/teacher/notion-import/api';

const curriculum: any = {
  years: [{ id: 'year_7', title: 'Year 7', year_level: 7 }],
  subjects: [{ id: 'subject_1', title: 'Made-up Subject', display_title: 'Made-up Subject' }],
  units: [], lessons: [], classes: [], scheduled_lessons: [], scope_sequences: [], media: [], schedule_anchor_date: '2026-10-18'
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('notion import modal', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('previews a pasted link, then imports with the chosen options', async () => {
    const onDone = vi.fn();
    openNotionImportModal({ curriculum, onDone });
    const input = document.querySelector<HTMLInputElement>('[data-notion-link]')!;
    input.value = 'https://www.notion.so/Made-up-0123456789abcdef0123456789abcdef';
    document.querySelector<HTMLButtonElement>('[data-notion-preview]')!.click();
    await flush(); await flush();

    const rows = [...document.querySelectorAll('[data-notion-row]')].map((r) => r.textContent);
    expect(rows[0]).toContain('Made-up Unit');
    expect(rows[1]).toContain('Made-up Lesson');
    expect(document.querySelector('[data-notion-warnings]')!.textContent).toContain('Columns stacked.');

    document.querySelector<HTMLInputElement>('[data-notion-include="l1"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-notion-import]')!.click();
    await flush(); await flush();

    expect(startApply).toHaveBeenCalledWith('01234567-89ab-cdef-0123-456789abcdef', expect.objectContaining({ excluded_page_ids: ['l1'] }));
    expect(document.querySelector('[data-notion-done]')!.textContent).toContain('2');
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ written: ['unit_n_u1', 'lesson_n_l1'] }));
  });

  it('shows an error for text that is not a Notion link', async () => {
    openNotionImportModal({ curriculum, onDone: vi.fn() });
    document.querySelector<HTMLInputElement>('[data-notion-link]')!.value = 'hello';
    document.querySelector<HTMLButtonElement>('[data-notion-preview]')!.click();
    await flush();
    expect(document.querySelector('[data-notion-error]')!.textContent).toMatch(/Notion link/);
  });
});
```

- [ ] **Step 3: Run it and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-modal.test.ts`
Expected: FAIL, because `modal.ts` isn't found.

- [ ] **Step 4: Write the modal**

Use the overlay helpers found in Step 1 where they exist. The version below is self-contained so the test runs. Swap in the shared helpers once it passes, and keep the `data-*` hooks.

```ts
// apps/teaching/src/teacher/notion-import/modal.ts
import type { CurriculumResponse } from '@/teacher/nav';
import type { EntityOverride, ImportPlanPreview } from '@/notion-import/types';
import { parseNotionPageId, searchNotion, startApply, startPlan, waitForJob, type NotionImportReport } from './api';
import { buildRows, choicesFrom, groupWarnings, toggleExcluded } from './preview-model';

export interface NotionImportOptions {
  curriculum: CurriculumResponse;
  onDone: (report: NotionImportReport) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function openNotionImportModal(options: NotionImportOptions): { close: () => void } {
  const backdrop = el('div', 'modal-backdrop notion-import');
  const dialog = el('div', 'modal glass-panel notion-import__dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Import from Notion');
  backdrop.append(dialog);
  document.body.append(backdrop);

  const close = () => backdrop.remove();
  backdrop.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  let pageId = '';
  let plan: ImportPlanPreview | null = null;
  let excluded = new Set<string>();
  const overrides: Record<string, EntityOverride> = {};
  const htmlAsCode = new Set<string>();

  const header = el('header', 'notion-import__header');
  header.append(el('h2', '', 'Import from Notion'));
  const closeBtn = el('button', 'icon-btn', '×');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.addEventListener('click', close);
  header.append(closeBtn);

  const body = el('div', 'notion-import__body');
  const error = el('p', 'notion-import__error');
  error.dataset.notionError = '';
  error.setAttribute('role', 'alert');
  dialog.append(header, body);

  const showError = (message: string) => { error.textContent = message; };

  function renderPick(): void {
    body.replaceChildren();
    const label = el('label', 'field');
    label.append(el('span', 'field__label', 'Notion link or search'));
    const input = el('input', 'field__input');
    input.dataset.notionLink = '';
    input.placeholder = 'Paste a Notion page link, or type to search';
    label.append(input);
    const results = el('ul', 'notion-import__results');
    const previewBtn = el('button', 'btn btn--primary', 'Preview');
    previewBtn.type = 'button';
    previewBtn.dataset.notionPreview = '';
    previewBtn.addEventListener('click', () => void preview(input.value));
    let timer: number | undefined;
    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      if (parseNotionPageId(input.value) || input.value.trim().length < 2) { results.replaceChildren(); return; }
      timer = window.setTimeout(async () => {
        const { items } = await searchNotion(input.value.trim()).catch(() => ({ items: [] }));
        results.replaceChildren(...items.map((item) => {
          const li = el('li');
          const pick = el('button', 'notion-import__result', `${item.title}${item.category ? ` · ${item.category}` : ''}`);
          pick.type = 'button';
          pick.addEventListener('click', () => void preview(item.page_id));
          li.append(pick);
          return li;
        }));
      }, 300);
    });
    body.append(label, results, previewBtn, error);
    input.focus();
  }

  async function preview(raw: string): Promise<void> {
    const id = parseNotionPageId(raw);
    if (!id) { showError('That doesn’t look like a Notion link. Paste the page’s link from Notion (Share → Copy link).'); return; }
    pageId = id;
    showError('');
    body.replaceChildren(el('p', 'notion-import__status', 'Reading from Notion…'), error);
    try {
      const job = await waitForJob(await startPlan(id), () => {});
      if (job.status === 'failed' || !job.plan) { renderPick(); showError(job.error ?? 'Could not read that page.'); return; }
      plan = job.plan;
      excluded = new Set();
      renderPreview();
    } catch (e) {
      renderPick();
      showError(e instanceof Error ? e.message : 'Could not read that page.');
    }
  }

  function picker(kind: 'year' | 'subject', pageIdFor: string, current: string | undefined, suggestedTitle?: string): HTMLSelectElement {
    const select = el('select', 'field__input');
    select.dataset.notionPicker = `${kind}:${pageIdFor}`;
    const items = kind === 'year'
      ? options.curriculum.years.map((y) => ({ id: y.id, title: y.title }))
      : options.curriculum.subjects.map((s) => ({ id: s.id, title: s.display_title || s.title }));
    select.append(el('option', '', kind === 'year' ? 'Choose a year' : 'Choose a subject'));
    (select.options[0] as HTMLOptionElement).value = '';
    for (const item of items) {
      const opt = el('option', '', item.title);
      opt.value = item.id;
      opt.selected = item.id === current;
      select.append(opt);
    }
    if (kind === 'subject' && suggestedTitle && !current) {
      const opt = el('option', '', `Create “${suggestedTitle}”`);
      opt.value = `create:${suggestedTitle}`;
      select.append(opt);
    }
    select.addEventListener('change', () => {
      const o = (overrides[pageIdFor] ??= {});
      if (kind === 'year') o.year_id = select.value || undefined;
      else if (select.value.startsWith('create:')) { o.create_subject_title = select.value.slice(7); delete o.subject_id; }
      else { o.subject_id = select.value || undefined; delete o.create_subject_title; }
    });
    return select;
  }

  function renderPreview(): void {
    if (!plan) return;
    body.replaceChildren();
    const tree = el('ul', 'notion-import__tree');
    for (const row of buildRows(plan, excluded)) {
      const li = el('li', `notion-import__row${row.included ? '' : ' is-excluded'}`);
      li.dataset.notionRow = row.page_id;
      li.style.setProperty('--depth', String(row.depth));
      if (row.label !== 'Skipped') {
        const box = el('input');
        box.type = 'checkbox';
        box.checked = row.included;
        box.dataset.notionInclude = row.page_id;
        box.setAttribute('aria-label', `Include ${row.title}`);
        box.addEventListener('click', () => { excluded = toggleExcluded(plan!, excluded, row.page_id); renderPreview(); });
        li.append(box);
      }
      li.append(el('span', 'notion-import__title', row.title), el('span', 'chip', row.label));
      if (row.badge) li.append(el('span', 'chip chip--accent', row.badge));
      if (row.warning_count) li.append(el('span', 'chip chip--warn', `${row.warning_count} note${row.warning_count === 1 ? '' : 's'}`));
      if (row.skipped_reason) li.append(el('span', 'notion-import__muted', row.skipped_reason));
      const entity = plan.entities.find((e) => e.page_id === row.page_id);
      if (entity && row.included && entity.kind !== 'lesson' && row.depth === 0) {
        const o = overrides[row.page_id] ?? {};
        if (entity.kind !== 'document') li.append(picker('year', row.page_id, o.year_id ?? entity.suggested.year_id));
        li.append(picker('subject', row.page_id, o.subject_id ?? entity.suggested.subject_id, entity.suggested.subject_title));
      }
      if (entity && row.included && entity.needs.includes('unit')) {
        const select = el('select', 'field__input');
        select.dataset.notionPicker = `unit:${row.page_id}`;
        select.append(el('option', '', 'Choose a unit for this lesson'));
        (select.options[0] as HTMLOptionElement).value = '';
        for (const unit of options.curriculum.units) {
          const opt = el('option', '', unit.title);
          opt.value = unit.id;
          select.append(opt);
        }
        select.addEventListener('change', () => { (overrides[row.page_id] ??= {}).unit_id = select.value || undefined; });
        li.append(select);
      }
      tree.append(li);
    }

    const warnings = el('section', 'notion-import__warnings');
    warnings.dataset.notionWarnings = '';
    for (const group of groupWarnings(plan, excluded)) {
      const details = el('details');
      details.append(el('summary', '', `${group.title} (${group.items.length})`));
      const list = el('ul');
      for (const w of group.items) list.append(el('li', '', w.message));
      details.append(list);
      warnings.append(details);
    }
    for (const app of plan.html_apps.filter((a) => !excluded.has(a.page_id))) {
      const label = el('label', 'notion-import__toggle');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = !htmlAsCode.has(app.notion_block_id);
      box.addEventListener('change', () => { if (box.checked) htmlAsCode.delete(app.notion_block_id); else htmlAsCode.add(app.notion_block_id); });
      label.append(box, el('span', '', `Run as interactive: ${app.preview}`));
      warnings.append(label);
    }

    const importBtn = el('button', 'btn btn--primary', 'Import');
    importBtn.type = 'button';
    importBtn.dataset.notionImport = '';
    importBtn.disabled = buildRows(plan, excluded).every((r) => !r.included);
    importBtn.addEventListener('click', () => void runImport());
    body.append(tree, warnings, importBtn, error);
  }

  async function runImport(): Promise<void> {
    const status = el('p', 'notion-import__status', 'Importing…');
    body.replaceChildren(status, error);
    try {
      const job = await waitForJob(await startApply(pageId, choicesFrom(excluded, overrides, htmlAsCode)), (j) => {
        if (j.progress) status.textContent = j.progress.phase === 'media'
          ? `Copying files ${j.progress.done} of ${j.progress.total}…`
          : `Saving ${j.progress.done} of ${j.progress.total}…`;
      });
      if (job.status === 'failed' || !job.report) { showError(job.error ?? 'The import failed.'); return; }
      const done = el('div', 'notion-import__done');
      done.dataset.notionDone = '';
      done.append(el('p', '', `Imported ${job.report.written.length} item${job.report.written.length === 1 ? '' : 's'}.`));
      if (job.report.skipped.length) done.append(el('p', 'notion-import__muted', `${job.report.skipped.length} skipped.`));
      const closeDone = el('button', 'btn btn--primary', 'Done');
      closeDone.type = 'button';
      closeDone.addEventListener('click', close);
      done.append(closeDone);
      body.replaceChildren(done);
      options.onDone(job.report);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'The import failed.');
    }
  }

  renderPick();
  return { close };
}
```

Add matching styles to `apps/teaching/src/styles/app.css`, next to the existing create-modal styles. The tree rows indent with `padding-inline-start: calc(var(--depth) * 1.25rem)`. Below 480px the pickers wrap onto their own line (`flex-wrap: wrap`) and `.notion-import__dialog` keeps `max-width: 100%` with no horizontal scroll.

- [ ] **Step 5: Run it and check it passes**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-modal.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the menu entry**

In `apps/teaching/src/teacher/create/control.ts`, add `import { openNotionImportModal } from '@/teacher/notion-import/modal';` at the top. Then in `openMenu`, after the `for (const item of MENU_ITEMS)` loop and before `host.append(menu);`, add:

```ts
    const importItem = document.createElement('button');
    importItem.type = 'button';
    importItem.className = 'create-control__menu-item hub-create__item';
    importItem.dataset.createImport = 'notion';
    importItem.setAttribute('role', 'menuitem');
    importItem.textContent = 'Import from Notion';
    importItem.addEventListener('click', (event) => {
      event.stopPropagation();
      closeMenu();
      openNotionImportModal({
        curriculum: options.curriculum,
        onDone: (report) => {
          const first = report.written[0];
          if (first) void options.onCreated(first.startsWith('lesson_') ? 'lesson' : 'unit', first);
        }
      });
    });
    menu.append(importItem);
```

Run the existing create-control tests: `cd apps/teaching && npx vitest run tests/unit -t "create"`
Expected: PASS. If a test counts menu items, update its expected count by one and add an assertion for `[data-create-import="notion"]`.

- [ ] **Step 7: Mock the endpoints for local dev**

In `apps/teaching/scripts/mock-api.ts`, find how other `/api/...` routes are registered and add:
- `GET /api/notion-import/search` → `{ items: [] }`
- `POST /api/notion-import/jobs` (`{ kind, page_id, choices }`) → `202 { job_id }`, storing a job in memory that is `planned` (with a two-entity made-up plan, the same shape as the modal test) or `done`
- `GET /api/notion-import/jobs/:id` → that job

- [ ] **Step 8: Check it in the browser**

Start the Teaching Hub preview with `preview_start` (add a `teaching` entry to `.claude/launch.json` running `npm run dev` in `apps/teaching` on port 5173 if there isn't one). Open the create menu, choose **Import from Notion**, paste a made-up link, preview, untick a lesson and import. Check:
- There are no console errors.
- At 390px wide (`resize_window` mobile) there's no horizontal scroll, and the pickers wrap.
- Escape closes the modal.

Take a screenshot of the preview step.

- [ ] **Step 9: Commit**

```bash
git add apps/teaching/src/teacher/notion-import apps/teaching/src/teacher/create/control.ts apps/teaching/src/styles/app.css apps/teaching/scripts/mock-api.ts apps/teaching/tests/unit
git commit -m "Notion import: preview modal and create-menu entry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Show Programs and Syllabus documents

**Files:**
- Modify: `netlify/functions/curriculum.mjs` (return `documents`)
- Modify: `apps/teaching/src/teacher/nav.ts` (`documents` on `CurriculumResponse`)
- Modify: `apps/teaching/src/teacher/sections/units.ts` (Program chip, Units/Programs filter, programs left out of class pickers)
- Modify: the class "active units" picker. Find it with `grep -rn "active_unit_ids" apps/teaching/src/teacher`.
- Test: `apps/teaching/tests/unit/notion-import-programs.test.ts`, plus a check in an existing curriculum integration test

- [ ] **Step 1: Write the failing test for the unit index**

```ts
// apps/teaching/tests/unit/notion-import-programs.test.ts
import { describe, expect, it } from 'vitest';
import { renderUnitsIndex } from '@/teacher/sections/units';

// Build `curriculum` the same way the existing units-section test does
// (search tests/unit for "renderUnitsIndex(") and add one program unit:
//   { ...unit, id: 'unit_prog', title: 'Made-up Program', kind: 'program' }

describe('programs in the units index', () => {
  it('labels program units and filters them', async () => {
    const host = document.createElement('div');
    // call renderUnitsIndex(host, curriculum, …) with the same arguments the existing test uses
    const card = host.querySelector('[data-unit-id="unit_prog"]')!;
    expect(card.textContent).toContain('Program');
    host.querySelector<HTMLButtonElement>('[data-unit-filter="programs"]')!.click();
    expect([...host.querySelectorAll('[data-unit-id]')].map((n) => n.getAttribute('data-unit-id'))).toEqual(['unit_prog']);
  });
});
```

Before running it, replace the two comment lines with the actual fixture and call from the existing units test. Copy them, don't invent new ones. The test must end up fully concrete.

- [ ] **Step 2: Run it and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-programs.test.ts`
Expected: FAIL. There's no Program label and no filter yet.

- [ ] **Step 3: Write the implementation**

- In `renderUnitCard` (`units.ts` around line 271), when `unit.kind === 'program'`, add `<span class="chip">Program</span>` to the meta row. If cards don't already have `data-unit-id`, add it.
- In `renderUnitsIndex` (around line 86), add a three-button segmented filter (`All`, `Units`, `Programs`) using `data-unit-filter="all|units|programs"`. Filter the active-unit list before grouping. Store the choice in a `let` inside the function, so it isn't persisted.
- In the class active-units picker found with grep, filter out `unit.kind === 'program'`.
- In `nav.ts`, add `documents?: TeachingDocument[];` to `CurriculumResponse`. In `curriculum.mjs`, add `documents: await listJSON(store, DOCUMENT_PREFIX)` (import `DOCUMENT_PREFIX` from `./_shared/notion-import-store.mjs`). Then extend the existing curriculum integration test to assert that `documents` is an array.

- [ ] **Step 4: Show Syllabus documents on the subject view**

Find where a subject's units are listed (`grep -rn "subject_id ===" apps/teaching/src/teacher`). Under that list, add a "Syllabus" link for each `curriculum.documents` entry with a matching `subject_id`. The link opens a read-only page that renders `document.blocks` with the existing block renderer (`renderBlocks` in `src/blocks/render.ts`; check its export name). Add a hash route `#document/<id>` beside the existing entity routes in the router (`grep -rn "#unit/" apps/teaching/src/app`). Editing documents is out of scope for this PR; the page says "Imported from Notion" with the import date.

Add a vitest that renders the document page for a made-up document with one `rich_text` block and checks the text appears.

- [ ] **Step 5: Run the tests and check they pass**

Run: `cd apps/teaching && npx vitest run tests/unit/notion-import-programs.test.ts tests/unit` and `npm run test:integration` from the root.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src netlify/functions/curriculum.mjs apps/teaching/tests tests/integration
git commit -m "Teaching Hub: program label and filter, syllabus documents on subjects

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If this task grows past these steps (for example, documents need full editing), stop after Step 3. Ship Programs in this PR, and propose the Syllabus page as its own session.

---

### Task 16: Gate, PR and a live import check

- [ ] **Step 1: Run the full gate**

Run: `node scripts/generate-alchemy-schema.mjs && git status --short` (expect no changes), then `npm run pre-pr-check`.
Expected: exit 0. Fix anything it reports and commit the fixes.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin claude/notion-teaching-import
gh pr create --title "Teaching Hub: import units, programs and lessons from Notion" --body "$(cat <<'EOF'
Adds Create → Import from Notion: pick a page from the Notion Teaching database, preview what it becomes, and import it as native Teaching Hub units, programs, lessons, classes and syllabus documents. Files are stored again in Blobs. Re-imports replace the existing copy after saving a version.

Spec: docs/superpowers/specs/2026-10-18-notion-teaching-import-design.md
Plan: docs/superpowers/plans/2026-10-18-notion-teaching-import.md

Setup: add NOTION_TEACHING_TOKEN and NOTION_TEACHING_DATA_SOURCE_ID to the site's environment variables (Functions scope), and share the Teaching database with the integration.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Open it as ready, not draft. Enable auto-merge (merge commit) per `CLAUDE.md`, then bind the PR with the ccd_pr tools.

- [ ] **Step 3: Live check on the deploy preview (with Adam)**

Adam adds the two environment variables (Functions scope) and redeploys the preview. Then, on the deploy preview:
1. Confirm the background function routes respond. A `POST /api/notion-import/jobs` with `{ kind: 'plan', page_id }` returns 202 with a `job_id`, the job moves `queued` → `running` → `planned`, and it can be read at `/api/notion-import/jobs/<id>`.
2. Import one real unit Adam chooses. Compare the Notion page and the imported lessons side by side: tabs, columns, callouts, toggles, images, files and one HTML embed.
3. Re-import the same unit. Confirm there are no duplicates and that the version history has a "notion_import" entry.

Write any mismatch up as a failing mapper test with a **made-up** fixture of the same shape, fix it, and push.
