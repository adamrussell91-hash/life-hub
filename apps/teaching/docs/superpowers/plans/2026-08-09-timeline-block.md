# Timeline Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-lesson `timeline` content block — ordered events with free-text `when`/label/description and optional image + link; stacked editor; vertical→horizontal student CSS; allowed at lesson root and in sections only.

**Architecture:** Placement-restricted leaf (like tabs placement, not nested containers): `TimelineBlockSchema` is **not** in `leafBlockSchemas` / `ColumnChildBlockSchema`, so columns cannot contain it. It is added to `SectionChildBlockSchema` and root `BlockSchema`. Editor mirrors accordion item lists with add/remove/reorder. Student render is one `ol` with CSS orientation switch at `48rem`. Publish validates label + when (+ image/link URL rules).

**Tech Stack:** TypeScript, Zod, Vite, Vitest (happy-dom), Clinical Glass CSS

**Spec:** `docs/superpowers/specs/2026-08-09-timeline-block-design.md`

**Base:** Implement on clean commit with Layout Phase A (columns/section/spacer). If `tabs` already exists on the branch, also exclude `timeline` from `TabChildBlockSchema` / `TAB_CHILD_TYPES`.

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/block.ts` | `timeline` type; TimelineEvent + TimelineBlock schemas; section/root unions; **not** in column leaves |
| `src/schemas/lesson.ts` | Publish: label + when; image/link URL rules |
| `src/blocks/create-block.ts` | Create defaults (3 events), groups, column forbid, clone event ids |
| `src/blocks/editors.ts` | `createTimelineEditor` + dispatch |
| `src/blocks/render.ts` | `renderTimelineBlock` + dispatch |
| `src/blocks/registry.ts` | Register timeline |
| `src/styles/app.css` | Vertical + horizontal student timeline; editor chrome |
| `tests/unit/timeline-block.test.ts` | Schema, create, clone, editor, render |
| `tests/unit/schemas-lesson.test.ts` | Publish rules |
| `tests/unit/render-blocks.test.ts` | Registry includes `timeline` |
| `docs/BUILD.md` | History + projection update |

---

### Task 1: Schema + createBlock

**Files:**
- Modify: `src/schemas/block.ts`
- Modify: `src/blocks/create-block.ts`
- Create: `tests/unit/timeline-block.test.ts`

- [ ] **Step 1: Write failing tests** in `tests/unit/timeline-block.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, cloneBlockWithNewIds, COLUMN_CHILD_TYPES } from '@/blocks/create-block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseBlock = {
  id: 'block_001',
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

function emptyEvent(id: string) {
  return { id, when: '', label: '', description: '' };
}

describe('TimelineBlockSchema', () => {
  it('parses timeline with events', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'timeline',
      content: {
        events: [
          {
            id: 'e1',
            when: '1788',
            label: 'First Fleet',
            description: 'Arrival',
            image_url: 'https://example.com/a.png',
            image_alt: 'Fleet',
            link_url: 'https://example.com',
            link_label: 'Read more'
          }
        ]
      }
    });
    expect(block.block_type).toBe('timeline');
    expect(block.content.events).toHaveLength(1);
  });

  it('rejects zero events', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'timeline',
        content: { events: [] }
      })
    ).toThrow();
  });

  it('rejects more than 12 events', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'timeline',
        content: {
          events: Array.from({ length: 13 }, (_, i) => emptyEvent(`e${i}`))
        }
      })
    ).toThrow();
  });

  it('rejects timeline inside a columns cell', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        id: 'cols',
        block_type: 'columns',
        content: {
          preset: '50-50',
          columns: [
            {
              width: 6,
              blocks: [
                {
                  ...baseBlock,
                  id: 'tl',
                  block_type: 'timeline',
                  content: { events: [emptyEvent('e1')] }
                }
              ]
            },
            { width: 6, blocks: [] }
          ]
        }
      })
    ).toThrow();
  });

  it('allows timeline inside a section', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'sec',
      block_type: 'section',
      content: {
        title: 'Era',
        blocks: [
          {
            ...baseBlock,
            id: 'tl',
            block_type: 'timeline',
            content: { events: [emptyEvent('e1')] }
          }
        ]
      }
    });
    expect(block.content.blocks[0]?.block_type).toBe('timeline');
  });
});

describe('createBlock timeline', () => {
  it('creates 3 empty events', () => {
    const block = createBlock('timeline', 'tl1');
    expect(block.block_type).toBe('timeline');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    expect(block.content.events).toHaveLength(3);
    expect(block.content.events.map((e) => e.id)).toEqual(['tl1_e1', 'tl1_e2', 'tl1_e3']);
    expect(block.content.events[0]).toMatchObject({
      when: '',
      label: '',
      description: ''
    });
  });

  it('COLUMN_CHILD_TYPES excludes timeline', () => {
    expect(COLUMN_CHILD_TYPES.includes('timeline')).toBe(false);
  });

  it('clone regenerates event ids', () => {
    const block = createBlock('timeline', 'tl1');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    block.content.events[0]!.label = 'A';
    let n = 0;
    const cloned = cloneBlockWithNewIds(block, () => `id_${++n}`);
    expect(cloned.id).toBe('id_1');
    if (cloned.block_type !== 'timeline') throw new Error('expected timeline');
    expect(cloned.content.events.map((e) => e.id)).toEqual(['id_2', 'id_3', 'id_4']);
    expect(cloned.content.events[0]!.label).toBe('A');
  });
});
```

If `TAB_CHILD_TYPES` exists on the branch, also assert it excludes `'timeline'`, and add a schema test rejecting timeline inside a tabs panel (mirror the columns rejection).

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/timeline-block.test.ts
```

- [ ] **Step 3: Implement schema** in `src/schemas/block.ts`

1. Add `'timeline'` to `BlockTypeSchema` enum (after `'spacer'` / near peers).
2. After `QuestionSetBlockSchema` (before `leafBlockSchemas`), add:

```ts
export const TimelineEventSchema = z.object({
  id: z.string().min(1),
  when: z.string(),
  label: z.string(),
  description: z.string(),
  image_url: z.string().optional(),
  image_alt: z.string().optional(),
  link_url: z.string().optional(),
  link_label: z.string().optional()
});

export const TimelineBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('timeline'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    events: z.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});
```

3. **Do not** add `TimelineBlockSchema` to `leafBlockSchemas` (keeps it out of columns).
4. Update `SectionChildBlockSchema` to include `TimelineBlockSchema` in the union (with leaves, spacer, columns, and tabs if present).
5. Update root `BlockSchema` union to include `TimelineBlockSchema`.
6. If `TabChildBlockSchema` exists: do **not** add timeline there.

- [ ] **Step 4: Implement create-block** in `src/blocks/create-block.ts`

- Add `'timeline'` to `NEW_BLOCK_TYPES` and `NEW_BLOCK_LABEL` (`'Timeline'`)
- Add `'timeline'` to **Teaching** group: `['accordion', 'table', 'question_set', 'timeline']`
- `COLUMN_CHILD_TYPES`: also exclude `'timeline'`
- If `TAB_CHILD_TYPES` exists: also exclude `'timeline'`
- `createBlock('timeline')`:

```ts
case 'timeline':
  return {
    ...shared,
    block_type: 'timeline',
    variant: 'medium',
    content: {
      events: [
        { id: `${id}_e1`, when: '', label: '', description: '' },
        { id: `${id}_e2`, when: '', label: '', description: '' },
        { id: `${id}_e3`, when: '', label: '', description: '' }
      ]
    }
  };
```

- In `cloneBlockWithNewIds`, after other branches:

```ts
} else if (cloned.block_type === 'timeline') {
  cloned.content = {
    events: cloned.content.events.map((event) => ({
      ...event,
      id: nextId()
    }))
  };
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run tests/unit/timeline-block.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/schemas/block.ts src/blocks/create-block.ts tests/unit/timeline-block.test.ts
git commit -m "feat: add timeline block schema and createBlock"
```

---

### Task 2: Publish validation

**Files:**
- Modify: `src/schemas/lesson.ts`
- Modify: `tests/unit/schemas-lesson.test.ts`

- [ ] **Step 1: Write failing publish tests** in `tests/unit/schemas-lesson.test.ts` (new describe or extend media/layout describes)

Use the existing `baseLesson` / `baseBlock` / `timestamps` fixtures from that file. Helper:

```ts
function timelineBlock(events: Array<Record<string, unknown>>) {
  return {
    ...baseBlock,
    block_type: 'timeline' as const,
    content: { events }
  };
}

const okEvent = {
  id: 'e1',
  when: '1788',
  label: 'First Fleet',
  description: ''
};
```

Tests:
- accepts timeline with label + when and empty description
- rejects empty label
- rejects empty when
- rejects image_url without http(s)
- rejects image_url with blank image_alt
- rejects link_url without http(s)
- accepts image with alt + link with url

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/schemas-lesson.test.ts
```

- [ ] **Step 3: Implement** in `publishBlockIssues` (`src/schemas/lesson.ts`)

```ts
if (block.block_type === 'timeline') {
  for (const event of block.content.events) {
    if (event.label.trim().length === 0 || event.when.trim().length === 0) {
      return 'Timeline events need a label and when value to publish';
    }
    if (event.image_url !== undefined && event.image_url.trim().length > 0) {
      if (!isHttpUrl(event.image_url)) {
        return 'Timeline event images need a valid http(s) URL to publish';
      }
      if ((event.image_alt ?? '').trim().length === 0) {
        return 'Timeline event images need alt text to publish';
      }
    }
    if (event.link_url !== undefined && event.link_url.trim().length > 0) {
      if (!isHttpUrl(event.link_url)) {
        return 'Timeline event links need a valid http(s) URL to publish';
      }
    }
  }
}
```

Treat blank optional URLs as absent (only validate when trimmed non-empty).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/schemas/lesson.ts tests/unit/schemas-lesson.test.ts
git commit -m "feat: publish-validate timeline event fields"
```

---

### Task 3: Editor

**Files:**
- Modify: `src/blocks/editors.ts`
- Modify: `tests/unit/timeline-block.test.ts`

- [ ] **Step 1: Write failing editor tests**

```ts
import { createBlockEditor } from '@/blocks/editors';
import { createBlock } from '@/blocks/create-block';

describe('timeline editor', () => {
  it('updates when and label on input', () => {
    const block = createBlock('timeline', 'tl1');
    let latest = block;
    const editor = createBlockEditor(block, (next) => {
      latest = next;
    });
    const when = editor.querySelector(
      '[aria-label="Timeline event 1 when"]'
    ) as HTMLInputElement;
    const label = editor.querySelector(
      '[aria-label="Timeline event 1 label"]'
    ) as HTMLInputElement;
    when.value = '1788';
    when.dispatchEvent(new Event('input', { bubbles: true }));
    label.value = 'Fleet';
    label.dispatchEvent(new Event('input', { bubbles: true }));
    expect(latest.block_type).toBe('timeline');
    if (latest.block_type !== 'timeline') throw new Error('expected timeline');
    expect(latest.content.events[0]!.when).toBe('1788');
    expect(latest.content.events[0]!.label).toBe('Fleet');
  });

  it('adds up to 12 and removes down to 1', () => {
    const block = createBlock('timeline', 'tl1');
    let latest = block;
    const mount = document.createElement('div');
    const rebuild = () => {
      mount.replaceChildren(
        createBlockEditor(latest, (next) => {
          latest = next;
          rebuild();
        })
      );
    };
    rebuild();
    const add = () =>
      (mount.querySelector('.block-editor__timeline-add') as HTMLButtonElement).click();
    for (let i = 0; i < 9; i += 1) add(); // 3 → 12
    expect(latest.block_type === 'timeline' && latest.content.events).toHaveLength(12);
    expect(
      (mount.querySelector('.block-editor__timeline-add') as HTMLButtonElement).disabled
    ).toBe(true);
    // remove until 1
    while (
      latest.block_type === 'timeline' &&
      latest.content.events.length > 1
    ) {
      (mount.querySelector('.block-editor__timeline-remove') as HTMLButtonElement).click();
    }
    expect(latest.block_type === 'timeline' && latest.content.events).toHaveLength(1);
    expect(
      (mount.querySelector('.block-editor__timeline-remove') as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('reorders events with up/down', () => {
    const block = createBlock('timeline', 'tl1');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    block.content.events[0]!.label = 'A';
    block.content.events[1]!.label = 'B';
    block.content.events[2]!.label = 'C';
    let latest = block;
    const mount = document.createElement('div');
    const rebuild = () => {
      mount.replaceChildren(
        createBlockEditor(latest, (next) => {
          latest = next;
          rebuild();
        })
      );
    };
    rebuild();
    const downs = mount.querySelectorAll('.block-editor__timeline-down');
    (downs[0] as HTMLButtonElement).click();
    expect(latest.block_type === 'timeline' && latest.content.events.map((e) => e.label)).toEqual([
      'B',
      'A',
      'C'
    ]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `createTimelineEditor`** in `src/blocks/editors.ts`

Pattern after `createAccordionEditor`: local `events` array, `emitChange`, `renderEvents()` rebuild.

Per event row fields (all with aria-labels `Timeline event ${index + 1} …`):
- when (input)
- label (input)
- description (textarea)
- image_url, image_alt (inputs)
- link_url, link_label (inputs)

Chrome per row:
- Up / Down buttons (classes `block-editor__timeline-up` / `__timeline-down`; disable at ends)
- Remove (`block-editor__timeline-remove`; disabled when length ≤ 1)

Footer: Add event (`block-editor__timeline-add`; disabled at 12). New event: `{ id: crypto.randomUUID() or `${getLatest().id}_e${Date.now()}`, when:'', label:'', description:'' }`.

Wire `case 'timeline':` in `createBlockEditor` switch.

On structural change (add/remove/reorder): emit then `renderEvents()` (or parent rebuild in tests). Prefer in-editor `renderEvents()` like accordion so single-mount tests work for add/remove; for reorder/add limits the rebuild pattern in tests is fine either way — match accordion (in-place re-render).

Emit content shape:

```ts
content: {
  events: events.map((e) => ({
    id: e.id,
    when: e.when,
    label: e.label,
    description: e.description,
    image_url: e.image_url?.trim() ? e.image_url : undefined,
    image_alt: e.image_alt?.trim() ? e.image_alt : undefined,
    link_url: e.link_url?.trim() ? e.link_url : undefined,
    link_label: e.link_label?.trim() ? e.link_label : undefined
  }))
}
```

- [ ] **Step 4: Run timeline-block tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/blocks/editors.ts tests/unit/timeline-block.test.ts
git commit -m "feat: add timeline block editor"
```

---

### Task 4: Render + CSS + registry

**Files:**
- Modify: `src/blocks/render.ts`
- Modify: `src/blocks/registry.ts`
- Modify: `src/styles/app.css`
- Modify: `tests/unit/timeline-block.test.ts`
- Modify: `tests/unit/render-blocks.test.ts`

- [ ] **Step 1: Write failing render/registry tests**

```ts
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';
import { createBlock } from '@/blocks/create-block';

describe('timeline render', () => {
  it('renders ordered list with when, label, description', () => {
    const block = createBlock('timeline', 'tl1');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    block.content.events = [
      {
        id: 'e1',
        when: '1788',
        label: 'First Fleet',
        description: 'Arrival at Sydney Cove',
        image_url: 'https://example.com/a.png',
        image_alt: 'Fleet',
        link_url: 'https://example.com/more',
        link_label: 'Read more'
      }
    ];
    const el = renderBlock(block, 'student');
    expect(el.dataset.blockType).toBe('timeline');
    expect(el.querySelector('.block-timeline')).toBeTruthy();
    expect(el.querySelectorAll('.block-timeline__event')).toHaveLength(1);
    expect(el.querySelector('.block-timeline__when')?.textContent).toBe('1788');
    expect(el.querySelector('.block-timeline__label')?.textContent).toBe('First Fleet');
    expect(el.querySelector('.block-timeline__description')?.textContent).toBe(
      'Arrival at Sydney Cove'
    );
    const img = el.querySelector('.block-timeline__image') as HTMLImageElement;
    expect(img.src).toContain('https://example.com/a.png');
    expect(img.alt).toBe('Fleet');
    const link = el.querySelector('.block-timeline__link') as HTMLAnchorElement;
    expect(link.href).toBe('https://example.com/more');
    expect(link.textContent).toBe('Read more');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('uses Open link when link_label empty', () => {
    const block = createBlock('timeline', 'tl1');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    block.content.events = [
      {
        id: 'e1',
        when: '1',
        label: 'A',
        description: '',
        link_url: 'https://example.com'
      }
    ];
    const el = renderBlock(block, 'student');
    expect(el.querySelector('.block-timeline__link')?.textContent).toBe('Open link');
  });

  it('registry includes timeline', () => {
    expect(blockRegistry.timeline).toBeDefined();
    expect(renderBlock(createBlock('timeline', 't'), 'student').dataset.blockType).toBe(
      'timeline'
    );
  });
});
```

Also add `timeline` to any registry completeness assertion in `tests/unit/render-blocks.test.ts` if one lists block types.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `renderTimelineBlock`** in `src/blocks/render.ts`

```ts
export function renderTimelineBlock(
  block: Extract<Block, { block_type: 'timeline' }>,
  mode: RenderMode
): HTMLElement {
  const list = document.createElement('ol');
  list.className = 'block-timeline';

  for (const event of block.content.events) {
    const item = document.createElement('li');
    item.className = 'block-timeline__event';

    const when = document.createElement('p');
    when.className = 'block-timeline__when';
    when.textContent = event.when;

    const label = document.createElement('h3');
    label.className = 'block-timeline__label';
    label.textContent = event.label;

    item.append(when, label);

    if (event.description.trim()) {
      const description = document.createElement('p');
      description.className = 'block-timeline__description';
      description.textContent = event.description;
      item.append(description);
    }

    if (event.image_url?.trim()) {
      const img = document.createElement('img');
      img.className = 'block-timeline__image';
      img.src = event.image_url.trim();
      img.alt = event.image_alt ?? '';
      item.append(img);
    }

    if (event.link_url?.trim()) {
      const link = document.createElement('a');
      link.className = 'block-timeline__link';
      link.href = event.link_url.trim();
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = event.link_label?.trim() || 'Open link';
      item.append(link);
    }

    list.append(item);
  }

  return wrapBlock(list, block, mode);
}
```

Dispatch in `renderBlock` switch. Register in `blockRegistry`.

- [ ] **Step 4: CSS** in `src/styles/app.css` (near other block styles)

Vertical default: left rail (Marine/Depth border), marker dots, stacked events, Wave accents sparingly for markers. Horizontal from `min-width: 48rem`: `ol` as flex row, overflow-x auto, events as columns with top rail. Keep Clinical Glass tokens; avoid purple/glow. Editor: `.block-editor__timeline-item` spacing similar to accordion items.

- [ ] **Step 5: Run tests — PASS**

```bash
npx vitest run tests/unit/timeline-block.test.ts tests/unit/render-blocks.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/blocks/render.ts src/blocks/registry.ts src/styles/app.css tests/unit/timeline-block.test.ts tests/unit/render-blocks.test.ts
git commit -m "feat: render timeline block with responsive CSS"
```

---

### Task 5: BUILD.md + verification

**Files:**
- Modify: `docs/BUILD.md` (create if missing from branch — copy from workspace if needed)

- [ ] **Step 1: Update BUILD.md**
  - Move Timeline from Next up / Projection checkbox → Shipped History (date 2026-08-09, link design/plan)
  - Next up becomes Gallery
  - Update “Block types live today” count (+1 `timeline`)
  - Latest note: Timeline shipped; next Gallery

- [ ] **Step 2: Full unit suite**

```bash
npm run test:unit
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/BUILD.md
git commit -m "docs: mark Timeline block shipped in BUILD.md"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Structured events (when, label, description, optional image/link) | 1, 3, 4 |
| Free-text when; manual order | 1, 3 |
| Min 1 / max 12; create with 3 | 1, 3 |
| Root + section only; not columns (or tabs if present) | 1 |
| Publish label + when; media/link rules | 2 |
| Stacked editor with reorder | 3 |
| Student ol; vertical→horizontal CSS | 4 |
| BUILD update | 5 |

## Out of scope (do not implement)

- sort_date / auto-sort
- Nested blocks per event
- JS layout / current marker / print
- Scope & Sequence coupling
