# A4 Print Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teacher-only A4 portrait preview + browser Print from a shared print renderer over the same lesson blocks (incl. `response_space` lines).

**Architecture:** `renderPrintLesson(lesson)` builds a print DOM once. The lesson editor hosts a scaled preview of that DOM; Print clones it into a print window/iframe and calls `print()`. Extend `RenderMode` with `'print'` for block-level fallbacks. No print-metadata UI.

**Tech Stack:** TypeScript, Vitest (happy-dom), existing block renderers, CSS `@page`

**Spec:** `docs/superpowers/specs/2026-08-10-a4-print-pipeline-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/print/a4.ts` | A4 size/margin constants + page-count helper |
| `src/print/render-print-lesson.ts` | Build print document from lesson |
| `src/print/open-print.ts` | Open print window/iframe and trigger `print()` |
| `src/teacher/a4-preview.ts` | Mount preview panel UI (paper + page count + Print) |
| `src/blocks/render.ts` | Add `'print'` mode; question lines; media/interactive fallbacks |
| `src/teacher/lesson-editor.ts` | Split layout; wire preview refresh on edits |
| `src/styles/app.css` | Editor split, print paper, `@media print` / `@page` |
| `tests/unit/a4-print.test.ts` | Renderer + fallbacks + response lines |
| `docs/BUILD.md` | Move A4 to History; update Next up |

---

### Task 1: A4 constants + print document shell

**Files:**
- Create: `src/print/a4.ts`
- Create: `src/print/render-print-lesson.ts`
- Create: `tests/unit/a4-print.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { estimatePageCount, A4 } from '@/print/a4';
import { renderPrintLesson } from '@/print/render-print-lesson';
import { createBlock } from '@/blocks/create-block';
import type { Lesson } from '@/schemas/lesson';

function minimalLesson(overrides: Partial<Lesson> = {}): Lesson {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'lesson_print_1',
    type: 'lesson',
    title: 'Forces worksheet',
    status: 'draft',
    unit_id: 'unit_1',
    blocks: [],
    created_at: now,
    updated_at: now,
    schema_version: 1,
    ...overrides
  };
}

describe('A4 constants', () => {
  it('exposes portrait dimensions and margins', () => {
    expect(A4.widthMm).toBe(210);
    expect(A4.heightMm).toBe(297);
    expect(A4.marginMm).toBe(15);
  });

  it('estimates page count from content height', () => {
    const printable = A4.heightMm - A4.marginMm * 2;
    expect(estimatePageCount(printable)).toBe(1);
    expect(estimatePageCount(printable + 1)).toBe(2);
    expect(estimatePageCount(0)).toBe(1);
  });
});

describe('renderPrintLesson', () => {
  it('builds a print document with title and student-visible blocks', () => {
    const visible = createBlock('heading');
    if (visible.block_type === 'heading') visible.content.text = 'Learning intention';
    const hidden = createBlock('callout');
    hidden.visibility = 'teacher_only';

    const root = renderPrintLesson(
      minimalLesson({ blocks: [visible, hidden] })
    );

    expect(root.classList.contains('print-document')).toBe(true);
    expect(root.querySelector('.print-document__title')?.textContent).toBe(
      'Forces worksheet'
    );
    expect(root.querySelectorAll('[data-block-id]').length).toBe(1);
    expect(root.querySelector(`[data-block-id="${hidden.id}"]`)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/a4-print.test.ts`  
Expected: FAIL (modules missing)

- [ ] **Step 3: Implement constants + shell renderer**

`src/print/a4.ts`:

```ts
export const A4 = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 15
} as const;

export function printableHeightMm(): number {
  return A4.heightMm - A4.marginMm * 2;
}

/** At least 1 page; uses content height in the same mm units as A4. */
export function estimatePageCount(contentHeightMm: number): number {
  const page = printableHeightMm();
  if (contentHeightMm <= 0) return 1;
  return Math.max(1, Math.ceil(contentHeightMm / page));
}
```

`src/print/render-print-lesson.ts`:

```ts
import { renderBlock } from '@/blocks/render';
import type { Lesson } from '@/schemas/lesson';

export function renderPrintLesson(lesson: Lesson): HTMLElement {
  const root = document.createElement('article');
  root.className = 'print-document';
  root.dataset.orientation = 'portrait';

  const title = document.createElement('h1');
  title.className = 'print-document__title';
  title.textContent = lesson.title.trim() || 'Untitled lesson';
  root.append(title);

  const body = document.createElement('div');
  body.className = 'print-document__body';

  for (const block of lesson.blocks) {
    if (block.visibility === 'teacher_only') continue;
    body.append(renderBlock(block, 'print', { lessonId: lesson.id }));
  }

  root.append(body);
  return root;
}
```

Note: `'print'` on `RenderMode` lands in Task 2 — for this step, temporarily cast or add the union member immediately if TypeScript fails.

- [ ] **Step 4: Run tests — expect pass for Task 1 cases**

Run: `npm run test:unit -- tests/unit/a4-print.test.ts`

- [ ] **Step 5: Commit** (if user asked for commits)

```bash
git add src/print/a4.ts src/print/render-print-lesson.ts tests/unit/a4-print.test.ts
git commit -m "feat(print): add A4 constants and print document shell"
```

---

### Task 2: `RenderMode = 'print'` + response_space lines + media fallbacks

**Files:**
- Modify: `src/blocks/render.ts`
- Modify: `tests/unit/a4-print.test.ts`

- [ ] **Step 1: Extend failing tests**

```ts
import { renderBlock } from '@/blocks/render';
import { ResponseSpaceSchema } from '@/schemas/block';

describe('print mode blocks', () => {
  it('draws response_space lines for short_answer questions', () => {
    const block = createBlock('question_set');
    if (block.block_type !== 'question_set') throw new Error('expected question_set');
    block.content.questions = [
      {
        id: 'q1',
        prompt: 'Explain gravity',
        kind: 'short_answer',
        response_space: 'short'
      },
      {
        id: 'q2',
        prompt: 'Pick one',
        kind: 'multiple_choice',
        options: ['A', 'B']
      }
    ];

    const el = renderBlock(block, 'print');
    const lines = el.querySelectorAll('.block-question-set__response-lines .block-question-set__line');
    expect(lines.length).toBeGreaterThan(0);
    // MC has no response lines host inside its li — only short_answer
    const items = el.querySelectorAll('.block-question-set__question');
    expect(items[0]?.querySelector('.block-question-set__response-lines')).toBeTruthy();
    expect(items[1]?.querySelector('.block-question-set__response-lines')).toBeNull();
  });

  it('defaults missing response_space to medium line count', () => {
    const block = createBlock('question_set');
    if (block.block_type !== 'question_set') throw new Error('expected question_set');
    block.content.questions = [
      { id: 'q1', prompt: 'Legacy', kind: 'short_answer' }
    ];
    const medium = renderBlock(
      {
        ...block,
        content: {
          questions: [
            { id: 'q1', prompt: 'Legacy', kind: 'short_answer', response_space: 'medium' }
          ]
        }
      },
      'print'
    );
    const legacy = renderBlock(block, 'print');
    expect(
      legacy.querySelectorAll('.block-question-set__line').length
    ).toBe(medium.querySelectorAll('.block-question-set__line').length);
  });

  it('renders video as static title + url without iframe', () => {
    const block = createBlock('video');
    if (block.block_type !== 'video') throw new Error('expected video');
    block.content.title = 'Demo';
    const el = renderBlock(block, 'print');
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.querySelector('.block-print-fallback')).toBeTruthy();
  });
});
```

Line counts (lock these in `render.ts`):

| `response_space` | lines |
|------------------|-------|
| `none` | 0 |
| `short` | 2 |
| `medium` | 4 |
| `long` | 6 |
| `extended` | 10 |

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement**

1. Change `export type RenderMode = 'teacher' | 'student' | 'print';`

2. In `renderQuestionSetBlock`, after appending prompt (and MC options), when `mode === 'print'` and `kind === 'short_answer'`:

```ts
const space = question.response_space ?? 'medium';
const lineCount =
  space === 'none' ? 0
  : space === 'short' ? 2
  : space === 'medium' ? 4
  : space === 'long' ? 6
  : 10; // extended

if (lineCount > 0) {
  const lines = document.createElement('div');
  lines.className = 'block-question-set__response-lines';
  lines.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < lineCount; i += 1) {
    const line = document.createElement('div');
    line.className = 'block-question-set__line';
    lines.append(line);
  }
  li.append(lines);
}
```

3. Add helper and use in video/audio/embed/html_app when `mode === 'print'`:

```ts
function renderPrintFallback(opts: {
  label: string;
  title?: string;
  url?: string;
}): HTMLElement {
  const el = document.createElement('div');
  el.className = 'block-print-fallback';
  const heading = document.createElement('p');
  heading.className = 'block-print-fallback__label';
  heading.textContent = opts.title?.trim() || opts.label;
  el.append(heading);
  if (opts.url) {
    const link = document.createElement('p');
    link.className = 'block-print-fallback__url';
    link.textContent = opts.url;
    el.append(link);
  }
  return el;
}
```

For video: prefer a watch URL if you already have a helper; otherwise omit URL and keep title/label. No iframe in print.

For embed: use `block.content.url` when present.  
For audio/attachment: title + URL fields already on content.  
For `html_app`: label “Interactive app” + optional title; no iframe.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** (if requested)

```bash
git add src/blocks/render.ts tests/unit/a4-print.test.ts
git commit -m "feat(print): print mode response lines and media fallbacks"
```

---

### Task 3: Accordion / tabs / columns print behaviour

**Files:**
- Modify: `src/blocks/render.ts`
- Modify: `tests/unit/a4-print.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it('expands accordion items in print mode', () => {
  const block = createBlock('accordion');
  if (block.block_type !== 'accordion') throw new Error('expected accordion');
  const el = renderBlock(block, 'print');
  for (const details of el.querySelectorAll('details')) {
    expect(details.open).toBe(true);
  }
});

it('renders tabs as sequential sections in print mode', () => {
  const block = createBlock('tabs');
  if (block.block_type !== 'tabs') throw new Error('expected tabs');
  // ensure ≥2 panels via create defaults or mutate
  const el = renderBlock(block, 'print');
  expect(el.querySelector('.block-tabs__tablist')).toBeNull();
  expect(el.querySelectorAll('.block-tabs__print-panel').length).toBeGreaterThanOrEqual(2);
});

it('stacks columns vertically in print mode', () => {
  const block = createBlock('columns');
  if (block.block_type !== 'columns') throw new Error('expected columns');
  const el = renderBlock(block, 'print');
  expect(el.querySelector('.block-columns')?.classList.contains('block-columns--print-stack')).toBe(
    true
  );
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

- Accordion: after building each `details`, if `mode === 'print'` set `details.open = true`.
- Tabs: if `mode === 'print'`, skip tablist/button UI; for each panel render:

```ts
const section = document.createElement('section');
section.className = 'block-tabs__print-panel';
const h = document.createElement('h3');
h.textContent = panel.label;
section.append(h);
for (const child of panel.blocks) {
  section.append(renderBlock(child, mode, ctx));
}
```

- Columns: if `mode === 'print'`, add `block-columns--print-stack` on the columns root (CSS: `flex-direction: column`).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** (if requested)

---

### Task 4: Print / preview CSS

**Files:**
- Modify: `src/styles/app.css`

- [ ] **Step 1: Add styles** (no unit test; visual/manual)

```css
/* Lesson editor + A4 preview split */
.lesson-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 1rem;
  align-items: start;
}

.lesson-editor__main {
  min-width: 0;
}

.a4-preview {
  position: sticky;
  top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.a4-preview__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.a4-preview__viewport {
  overflow: auto;
  max-height: calc(100vh - 8rem);
  background: #c5c9ce;
  padding: 0.75rem;
  border-radius: 4px;
}

.a4-preview__scale {
  width: 210mm;
  transform-origin: top left;
  /* scale set inline from JS to fit panel width */
}

.print-document {
  box-sizing: border-box;
  width: 210mm;
  min-height: 297mm;
  padding: 15mm;
  background: #fff;
  color: #111;
  box-shadow: 0 1px 4px rgb(0 0 0 / 20%);
}

.print-document__title {
  font-size: 1.5rem;
  margin: 0 0 1rem;
}

.block-question-set__response-lines {
  margin-top: 0.5rem;
}

.block-question-set__line {
  border-bottom: 1px solid #333;
  height: 1.5rem;
}

.block-print-fallback {
  border: 1px solid #ccc;
  padding: 0.5rem 0.75rem;
}

.block-columns--print-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 15mm;
  }

  body * {
    visibility: hidden;
  }

  .print-document,
  .print-document * {
    visibility: visible;
  }

  .print-document {
    position: absolute;
    left: 0;
    top: 0;
    width: auto;
    min-height: auto;
    padding: 0;
    box-shadow: none;
  }
}
```

Prefer applying print CSS inside the **print window** document (Task 6) so the teacher shell is never fighting `visibility` hacks. If using a print window with inlined critical CSS, keep `@page` + paper styles there and skip the global `body * { visibility }` approach.

- [ ] **Step 2: Commit** (if requested)

---

### Task 5: A4 preview panel + lesson editor wiring

**Files:**
- Create: `src/teacher/a4-preview.ts`
- Modify: `src/teacher/lesson-editor.ts`
- Modify: `tests/unit/a4-print.test.ts` (optional mount smoke)

- [ ] **Step 1: Implement `mountA4Preview`**

```ts
import { estimatePageCount, A4, printableHeightMm } from '@/print/a4';
import { renderPrintLesson } from '@/print/render-print-lesson';
import { openPrintLesson } from '@/print/open-print';
import type { Lesson } from '@/schemas/lesson';

export interface A4PreviewHandle {
  update(lesson: Lesson): void;
  dispose(): void;
}

export function mountA4Preview(host: HTMLElement): A4PreviewHandle {
  host.className = 'a4-preview';

  const meta = document.createElement('div');
  meta.className = 'a4-preview__meta';

  const pages = document.createElement('p');
  pages.className = 'a4-preview__pages';
  pages.textContent = '1 page';

  const printBtn = document.createElement('button');
  printBtn.type = 'button';
  printBtn.className = 'btn btn--secondary';
  printBtn.textContent = 'Print';

  meta.append(pages, printBtn);

  const viewport = document.createElement('div');
  viewport.className = 'a4-preview__viewport';

  const scaleWrap = document.createElement('div');
  scaleWrap.className = 'a4-preview__scale';
  viewport.append(scaleWrap);

  host.replaceChildren(meta, viewport);

  let current: Lesson | null = null;

  function fitScale(): void {
    const mmToPx = scaleWrap.firstElementChild?.getBoundingClientRect().width
      ? null
      : null;
    // Prefer: width 210mm element; scale = viewport.clientWidth / paper.offsetWidth
    const paper = scaleWrap.querySelector('.print-document') as HTMLElement | null;
    if (!paper) return;
    const available = viewport.clientWidth - 8;
    const natural = paper.offsetWidth || 1;
    const s = Math.min(1, available / natural);
    scaleWrap.style.transform = `scale(${s})`;
    scaleWrap.style.height = `${paper.offsetHeight * s}px`;
  }

  function update(lesson: Lesson): void {
    current = lesson;
    const doc = renderPrintLesson(lesson);
    scaleWrap.replaceChildren(doc);
    // Estimate pages: map px height → mm via paper offsetHeight / 297mm
    const paper = doc;
    const pxPerMm = paper.offsetHeight > 0 ? paper.offsetHeight / Math.max(A4.heightMm, paper.scrollHeight / (A4.heightMm / A4.heightMm)) : 1;
    // Simpler approach:
    const contentPx = paper.scrollHeight;
    const pagePx = paper.offsetWidth * (A4.heightMm / A4.widthMm);
    const count = estimatePageCount((contentPx / pagePx) * printableHeightMm());
    pages.textContent = count === 1 ? '1 page' : `${count} pages`;
    fitScale();
  }

  printBtn.addEventListener('click', () => {
    if (current) openPrintLesson(current);
  });

  const onResize = () => fitScale();
  window.addEventListener('resize', onResize);

  return {
    update,
    dispose() {
      window.removeEventListener('resize', onResize);
      host.replaceChildren();
    }
  };
}
```

Simplify page-count math in implementation to:

```ts
const pagePx = (paper.offsetWidth * A4.heightMm) / A4.widthMm;
const count = Math.max(1, Math.ceil(paper.scrollHeight / pagePx));
pages.textContent = count === 1 ? '1 page' : `${count} pages`;
```

(Keep `estimatePageCount` for unit tests of mm math; preview may use px heuristic.)

- [ ] **Step 2: Wire `lesson-editor.ts`**

Wrap existing editor chrome in `.lesson-editor` > `.lesson-editor__main` + `.lesson-editor__preview` host.

After each mutation that calls `saveController?.notifyChange()` (title input, block edits, reorder, add/delete), also call `a4Preview.update(lesson)`.

On dispose, `a4Preview.dispose()`.

- [ ] **Step 3: Manual check** — open a lesson; preview shows; edit title; preview title updates.

- [ ] **Step 4: Commit** (if requested)

---

### Task 6: `openPrintLesson`

**Files:**
- Create: `src/print/open-print.ts`

- [ ] **Step 1: Implement**

```ts
import { renderPrintLesson } from '@/print/render-print-lesson';
import type { Lesson } from '@/schemas/lesson';

const PRINT_CSS = `
  @page { size: A4 portrait; margin: 15mm; }
  html, body { margin: 0; padding: 0; }
  .print-document {
    box-sizing: border-box;
    width: auto;
    min-height: auto;
    padding: 0;
    background: #fff;
    color: #111;
    box-shadow: none;
  }
  .block-question-set__line {
    border-bottom: 1px solid #333;
    height: 1.5rem;
  }
  .block-print-fallback {
    border: 1px solid #ccc;
    padding: 0.5rem 0.75rem;
  }
  .block-columns--print-stack {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  /* Hide interactive activity chrome; show print stubs if present */
  .block-flashcards__controls,
  .block-cloze__controls,
  .block-self-check__controls { display: none !important; }
`;

export function openPrintLesson(lesson: Lesson): void {
  const docEl = renderPrintLesson(lesson);
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    // Popup blocked — fall back to iframe in-document print if you already use one;
    // otherwise alert the teacher.
    window.alert('Allow pop-ups to print this lesson.');
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html><html><head><title>${escapeHtml(
    lesson.title || 'Print'
  )}</title><style>${PRINT_CSS}</style></head><body></body></html>`);
  w.document.close();
  w.document.body.append(docEl);
  w.focus();
  // Images may still load; slight delay helps
  w.setTimeout(() => {
    w.print();
  }, 50);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;');
}
```

Prefer DOM APIs (`createElement`) over `document.write` if that matches repo style — equivalent outcome.

- [ ] **Step 2: Smoke-test Print button** (manual)

- [ ] **Step 3: Commit** (if requested)

---

### Task 7: BUILD.md + full unit suite

**Files:**
- Modify: `docs/BUILD.md`

- [ ] **Step 1: Update BUILD.md**

- History row for 2026-08-10 **A4 print pipeline** (or next calendar day if shipping later).  
- Next up → remove A4; suggest Drive / media uploads (or next projection item).  
- Projection: check off A4 print pipeline.  
- Phase table: Phase 9 → v1 done (metadata/tools still later).

- [ ] **Step 2: Run full unit tests**

Run: `npm run test:unit`  
Expected: all pass (including prior suite).

- [ ] **Step 3: Commit** (if requested)

```bash
git add docs/BUILD.md docs/superpowers/specs/2026-08-10-a4-print-pipeline-design.md docs/superpowers/plans/2026-08-10-a4-print-pipeline.md
git commit -m "docs: A4 print pipeline spec, plan, and BUILD history"
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Shared `renderPrintLesson` | 1 |
| Teacher-only; portrait; fixed margins | 1, 4, 6 |
| Preview panel + page count + Print | 5, 6 |
| Refresh on edit | 5 |
| Skip `teacher_only` | 1 |
| `response_space` lines | 2 |
| Media minimal fallbacks | 2 |
| Accordion open / tabs sequential / columns stack | 3 |
| No metadata UI / no student print | — (omitted) |
| BUILD update | 7 |

## Placeholder / consistency review

- `RenderMode` includes `'print'` from Task 2; Task 1 may add the union early.  
- Line counts locked in Task 2 table.  
- Print window carries its own CSS (avoid shell `visibility` hacks).  
- Commits are optional until the user asks.
