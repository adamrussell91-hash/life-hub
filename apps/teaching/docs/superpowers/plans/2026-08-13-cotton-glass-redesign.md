# Cotton Glass Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Clinical Glass with cotton-glass canvas + Life Hub navy rail across the whole teacher app, and rebuild home, class calendar, scope timeline, and student lesson view so they feel like real views.

**Architecture:** Closed tokens in `src/design/tokens.css` plus shared helpers (`pastelFromId`, `renderPageHeader`). Signature views are rebuilt in place on existing models (no schema/API/router changes). Teacher `/lessons/:id` stays the editor (compact bar). The mocked lesson *view* is the student published lesson page.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom), existing CSS tokens (no new CSS framework, no icon package)

**Spec:** `docs/superpowers/specs/2026-08-13-cotton-glass-redesign-design.md`

**TDD:** New helpers get failing tests first. CSS/token files are config (no unit test). DOM renderers: write/update the failing assertion first, then implement.

**Commits:** One commit per task after tests pass. Do not push.

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/design/tokens.css` | Retune closed scale: cotton/paper/navy, Inter, radius, glass, elevation |
| `index.html` | Load Inter instead of Source Sans 3 / Source Serif 4 |
| `src/design/pastel.ts` | **New.** Stable `pastelFromId` → tint name + CSS vars |
| `src/teacher/page-header.ts` | **New.** In-canvas page header (eyebrow, title, supporting, actions) |
| `src/teacher/shell.ts` | Hide empty context bar; keep `data-save-slot` for editors |
| `src/teacher/primary-nav.ts` | Inline SVG glyphs + label |
| `src/app/main.ts` | Stop `renderContextBar` on browsing routes; sections own headers |
| `src/teacher/home.ts` | Cotton home: page header, navy today card, pastel week chips |
| `src/teacher/class-calendar.ts` | Today button; chips in cells; agenda column |
| `src/teacher/unit-sequence.ts` / `entity-banner.ts` | Class names only as needed; CSS does the recut |
| `src/teacher/sections/scope-overview.ts` / `scope-timeline.ts` | Term bands / tints / today marker chrome |
| `src/student/lesson-view.ts` | Hero + lead + navy meta card + glass blocks |
| `src/teacher/lesson-editor.ts` | Compact context bar stays; glass editor chrome via CSS |
| `src/styles/app.css` | Shell, buttons, glass, signature views, indexes, student, sign-in |
| `src/student/class-view.ts` / unit view | Class names as needed; CSS cascade |
| `docs/BUILD.md` | History entry |
| Tests | `tests/unit/pastel.test.ts`, `page-header.test.ts`, plus updates to existing render tests |

---

### Task 1: Pastel helper

**Files:**
- Create: `src/design/pastel.ts`
- Test: `tests/unit/pastel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { PASTEL_TINTS, pastelFromId } from '@/design/pastel';

describe('pastelFromId', () => {
  it('returns a tint from the closed set', () => {
    const tint = pastelFromId('unit_aotfw');
    expect(PASTEL_TINTS).toContain(tint);
  });

  it('is stable for the same id', () => {
    expect(pastelFromId('unit_aotfw')).toBe(pastelFromId('unit_aotfw'));
  });

  it('spreads different ids across the set', () => {
    const ids = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'];
    const unique = new Set(ids.map(pastelFromId));
    expect(unique.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/pastel.test.ts`

Expected: FAIL — cannot find module `@/design/pastel`

- [ ] **Step 3: Write minimal implementation**

```ts
export const PASTEL_TINTS = ['blue', 'sage', 'peach', 'gold', 'lilac'] as const;
export type PastelTint = (typeof PASTEL_TINTS)[number];

export function pastelFromId(id: string): PastelTint {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % PASTEL_TINTS.length;
  return PASTEL_TINTS[index]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/pastel.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/design/pastel.ts tests/unit/pastel.test.ts
git commit -m "feat: add stable pastel tint helper for calendar chips"
```

---

### Task 2: Page header helper

**Files:**
- Create: `src/teacher/page-header.ts`
- Test: `tests/unit/page-header.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { renderPageHeader } from '@/teacher/page-header';

describe('renderPageHeader', () => {
  it('renders eyebrow, title, supporting line, and action hosts', () => {
    const host = document.createElement('div');
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Publish';
    renderPageHeader(host, {
      eyebrow: 'Year 10 English',
      title: 'Class home',
      supporting: 'Today’s lesson, the month, and the unit sequence.',
      actions: [save]
    });
    expect(host.querySelector('.page-header__eyebrow')?.textContent).toBe('Year 10 English');
    expect(host.querySelector('.page-header__title')?.textContent).toBe('Class home');
    expect(host.querySelector('.page-header__supporting')?.textContent).toContain('unit sequence');
    expect(host.querySelector('.page-header__actions')?.contains(save)).toBe(true);
  });

  it('omits supporting when not provided', () => {
    const host = document.createElement('div');
    renderPageHeader(host, { eyebrow: 'Library', title: 'Lessons' });
    expect(host.querySelector('.page-header__supporting')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/page-header.test.ts`

Expected: FAIL — cannot find module `@/teacher/page-header`

- [ ] **Step 3: Write minimal implementation**

```ts
export interface PageHeaderConfig {
  eyebrow: string;
  title: string;
  supporting?: string;
  actions?: HTMLElement[];
}

export function renderPageHeader(host: HTMLElement, config: PageHeaderConfig): HTMLElement {
  const header = document.createElement('header');
  header.className = 'page-header';

  const copy = document.createElement('div');
  copy.className = 'page-header__copy';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'page-header__eyebrow';
  eyebrow.textContent = config.eyebrow;

  const title = document.createElement('h1');
  title.className = 'page-header__title';
  title.textContent = config.title;

  copy.append(eyebrow, title);
  if (config.supporting) {
    const supporting = document.createElement('p');
    supporting.className = 'page-header__supporting';
    supporting.textContent = config.supporting;
    copy.append(supporting);
  }

  header.append(copy);
  if (config.actions && config.actions.length > 0) {
    const actions = document.createElement('div');
    actions.className = 'page-header__actions';
    actions.append(...config.actions);
    header.append(actions);
  }

  host.prepend(header);
  return header;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/page-header.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/teacher/page-header.ts tests/unit/page-header.test.ts
git commit -m "feat: add in-canvas page header helper"
```

---

### Task 3: Tokens, Inter, glass recipe

**Files:**
- Modify: `src/design/tokens.css`
- Modify: `index.html` (font `<link>`)
- Modify: `src/styles/app.css` (body wash, `.glass-panel`, buttons, type on shell)

This is config/visual. No new production logic.

- [ ] **Step 1: Swap fonts in `index.html`**

Replace the Google Fonts stylesheet href with:

`https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap`

Remove Source Sans 3 and Source Serif 4.

- [ ] **Step 2: Retune `src/design/tokens.css`**

Keep the closed-set comment. Change:

```css
--warm-white: #fbf8f2;
--cotton: #f5f1e9;
--paper: #fbf8f2;
--navy: #17375e;
--navy-2: #244f7c;
--ink: #13233a;
--muted: #6b7788;
--line: rgba(23, 55, 94, 0.10);
--glass: rgba(255, 255, 255, 0.70);
--pastel-blue: #dceafa;
--pastel-blue-ink: #294c71;
--pastel-sage: #dfe9e1;
--pastel-sage-ink: #3c5949;
--pastel-peach: #f2dfd0;
--pastel-peach-ink: #7a5038;
--pastel-gold: #f1e2b6;
--pastel-gold-ink: #6c581f;
--pastel-lilac: #e8e0f1;
--pastel-lilac-ink: #5d4e70;
--accent: var(--navy);
--font-ui: Inter, ui-sans-serif, sans-serif;
--font-display: var(--font-ui);
--text-xl: 2rem;      /* 32px — small page titles */
--text-2xl: 2.625rem; /* 42px — page titles */
--radius-sm: 0.875rem; /* 14px buttons */
--radius-md: 1.25rem;  /* 20px cards */
--radius-lg: 1.5rem;   /* 24px panels */
--radius-xl: 1.75rem;  /* 28px page containers */
--elev-3: 0 18px 48px rgba(39, 55, 74, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.96);
--shadow: var(--elev-3);
```

Keep `--depth`, `--marine`, `--wave`, `--high-sea`, on-dark tokens, space scale, `--rail-width: 15rem`.

Do **not** delete `--high-sea`; it stays rail-only.

- [ ] **Step 3: Retune body + glass + buttons in `app.css`**

`body` background:

```css
background-color: var(--cotton);
background-image:
  linear-gradient(rgba(22, 55, 94, 0.018) 1px, transparent 1px),
  linear-gradient(90deg, rgba(22, 55, 94, 0.018) 1px, transparent 1px),
  radial-gradient(760px 540px at 4% 0%, rgba(207, 223, 241, 0.62), transparent 70%),
  radial-gradient(720px 500px at 98% 8%, rgba(237, 216, 197, 0.50), transparent 72%),
  linear-gradient(145deg, var(--cotton), var(--paper) 48%, var(--cotton));
background-size: 34px 34px, 34px 34px, auto, auto, auto;
```

Mask the grid so it fades out (use `body::before` for the grid with `mask-image: linear-gradient(to bottom, rgba(0,0,0,.20), transparent 70%)` if stacking on `body` itself fights the radials).

`.glass-panel`:

```css
background: linear-gradient(145deg, rgba(255, 255, 255, 0.80), rgba(255, 255, 255, 0.52));
border: 1px solid rgba(255, 255, 255, 0.92);
border-radius: var(--radius-lg);
box-shadow: var(--elev-3);
backdrop-filter: blur(22px) saturate(115%);
```

`.btn--primary` (and any High Sea create fills on the canvas): background `var(--navy)`, color white. Ghost buttons: glass fill + `var(--line)` border + `var(--ink)` text.

`.page-header` CSS:

```css
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-6);
  margin-bottom: var(--space-6);
}
.page-header__eyebrow {
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: var(--space-2);
}
.page-header__title {
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--navy);
}
.page-header__supporting {
  margin-top: var(--space-2);
  font-size: var(--text-md);
  color: var(--muted);
}
.page-header__actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-shrink: 0;
}
```

- [ ] **Step 4: Run `npx vitest run tests/unit`**

Expected: PASS (token/CSS should not break unit tests). If a test asserts Source Sans or High Sea class names, update that assertion in this task.

- [ ] **Step 5: Commit**

```bash
git add index.html src/design/tokens.css src/styles/app.css
git commit -m "feat: retune tokens to cotton glass and load Inter"
```

---

### Task 4: Shell and rail

**Files:**
- Modify: `src/teacher/shell.ts`
- Modify: `src/teacher/primary-nav.ts`
- Modify: `src/app/main.ts`
- Modify: `src/styles/app.css` (rail, context bar, primary-nav)
- Test: `tests/unit/teacher-shell.test.ts`, `tests/unit/primary-nav.test.ts`

- [ ] **Step 1: Failing tests**

Add to `teacher-shell.test.ts`:

```ts
it('hides the context bar when it has no children', () => {
  const refs = renderTeacherShell(root);
  expect(refs.contextBar.hidden).toBe(true);
});
```

Update `primary-nav.test.ts` labels assertion: `textContent` on the link will include the glyph, so assert with:

```ts
const labels = [...container.querySelectorAll('.primary-nav__link')].map(
  (el) => el.querySelector('.primary-nav__label')?.textContent
);
```

Keep the same eight labels. Also assert each link contains `svg.primary-nav__glyph`.

- [ ] **Step 2: Run tests — expect FAIL** (hidden not set; `.primary-nav__label` missing)

- [ ] **Step 3: Implement**

`renderTeacherShell`: after creating `contextBar`, set `contextBar.hidden = true`.

`renderContextBar`: set `refs.contextBar.hidden = false` before filling (editors still need it). Style it as a compact glass bar in CSS (height ~52–68px, radius `var(--radius-lg)`, no large h1 — use `var(--text-md)` for `.teacher-layout__context-bar-title`).

`primary-nav.ts`: each link contains an inline SVG (24 viewBox, `stroke="currentColor"`, `fill="none"`, `stroke-width="1.8"`) plus `<span class="primary-nav__label">`. Icons: Home (grid), Classes (calendar), Scope (rows), Units (book), Lessons (document), Templates (layout), Resources (archive), Trash (bin). Keep `href`, `aria-current`, click → `navigate`.

CSS: `.primary-nav__link` becomes flex, gap, min-height 44px, radius ~0.85rem, active = `background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.09); color: #fff`.

`.teacher-layout__canvas` background: transparent (wash comes from body). `.teacher-layout__context-bar` when visible: margin/padding like a compact glass bar, no full-width hairline strip.

`main.ts`: remove `renderContextBar` from browsing routes (home, class indexes, class page, units, lessons index, resources, templates, trash, scope). Those pages will prepend `renderPageHeader` in later tasks. Leave `renderContextBar` for lesson editor, homepage editor, and any route that still uses `data-save-slot`.

Grep `renderContextBar(` and `data-save-slot` before deleting a call. If a browsing page currently relies on the context bar as the only h1, add `renderPageHeader` in that same edit with a sensible eyebrow/title so the page is not title-less.

- [ ] **Step 4: Run** `npx vitest run tests/unit/teacher-shell.test.ts tests/unit/primary-nav.test.ts tests/unit/teacher-rail.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/teacher/shell.ts src/teacher/primary-nav.ts src/app/main.ts src/styles/app.css tests/unit/teacher-shell.test.ts tests/unit/primary-nav.test.ts
git commit -m "feat: Life Hub rail glyphs and compact editor context bar"
```

---

### Task 5: Home dashboard

**Files:**
- Modify: `src/teacher/home.ts`
- Modify: `src/styles/app.css` (home)
- Test: `tests/unit/teacher-home.test.ts`

- [ ] **Step 1: Extend failing assertions in `teacher-home.test.ts`**

Keep clock / signals / week / classes. Add:

```ts
expect(canvas.querySelector('.page-header__title')?.textContent).toBe('Teaching Dashboard');
expect(canvas.querySelector('.home-today')).not.toBeNull();
expect(canvas.querySelector('.home-today')?.textContent).toContain('Memory');
const chip = canvas.querySelector<HTMLAnchorElement>(
  'a.event-chip[href="/lessons/lesson_aotfw_008"]'
);
expect(chip).not.toBeNull();
expect(chip?.dataset.tint).toMatch(/blue|sage|peach|gold|lilac/);
```

Week lesson links may move from `a.home-week__card` to `a.event-chip` inside the day column. Update the existing weekday test accordingly (keep day numbers `10..14` and navigate on chip click). Unpublished lesson “Intro” should put gold emphasis on the Unpublished signal (`home-signal--emphasis` can map to gold tint in CSS, not High Sea).

- [ ] **Step 2: Run test — expect FAIL** (`.home-today` / `.event-chip` missing)

- [ ] **Step 3: Implement**

`renderTeacherHome`:

- Prepend `renderPageHeader` with eyebrow `Workspace`, title `Teaching Dashboard`, supporting one line (`Today’s classes and what still needs publishing.`). Put the existing create control in `actions`.
- Clock stays in the header cluster (left of or under the title — wrap clock + title in `.home-dashboard__hero`).
- After signals, add `.home-today` navy card: heading “Today”, list of `todayEntries` as links to `/lessons/:id` (title + class code). If none: “No lessons scheduled today.”
- Week cards: each scheduled lesson is `<a class="event-chip" data-tint="${pastelFromId(unit_id)}">`.
- Class tiles: add `glass-panel` class; keep href `/classes/:id`.

CSS: `.home-today` navy gradient (`#17375e` → `#244f7c`), white text, radius `var(--radius-lg)`. `.event-chip` padding, radius ~11px, `data-tint` maps to pastel fill + ink. `.home-signal--emphasis` uses `--pastel-gold` / `--pastel-gold-ink`.

- [ ] **Step 4: Run** `npx vitest run tests/unit/teacher-home.test.ts tests/unit/home-model.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/teacher/home.ts src/styles/app.css tests/unit/teacher-home.test.ts
git commit -m "feat: rebuild home dashboard in cotton glass"
```

---

### Task 6: Class calendar chips + Today + agenda column

**Files:**
- Modify: `src/teacher/class-calendar.ts`
- Modify: `src/teacher/sections/classes.ts` (page header)
- Modify: `src/styles/app.css`
- Test: `tests/unit/class-calendar-render.test.ts`, `tests/unit/sections-classes.test.ts` if it asserts structure

- [ ] **Step 1: Update failing calendar render tests**

Current test expects a single-lesson day to *be* `a.class-calendar__day[href="/lessons/l1"]`. Change that: the **day cell** is a button (selects the day); the **chip** is the lesson link.

```ts
it('renders lesson chips inside the day cell and links them', () => {
  const model = modelForAugust();
  renderClassCalendar(host, model, { onSelectDate: vi.fn(), onShiftMonth: vi.fn() });
  const chip = host.querySelector<HTMLAnchorElement>('a.event-chip[href="/lessons/l1"]');
  expect(chip).not.toBeNull();
  expect(chip?.textContent).toContain('Narrative Structure');
  expect(chip?.dataset.tint).toBe(pastelFromId('u1'));
});

it('renders a Today control that selects today', () => {
  const onSelectDate = vi.fn();
  const model = modelForAugust({ selectedDate: '2026-08-01', today: '2026-08-12' });
  renderClassCalendar(host, model, { onSelectDate, onShiftMonth: vi.fn() });
  host.querySelector<HTMLButtonElement>('[data-calendar="today"]')!.click();
  expect(onSelectDate).toHaveBeenCalledWith('2026-08-12');
});
```

Keep weekday headers, today/selected/outside datasets, detail list links.

Overflow: if a day has more than 2 chips, show `+N more` (`.event-chip-more`). Add a test with 3 lessons on one day.

- [ ] **Step 2: Run** `npx vitest run tests/unit/class-calendar-render.test.ts` — expect FAIL

- [ ] **Step 3: Implement**

Nav row: prev, month label, next, plus `button.btn[data-calendar="today"]` text `Today` → `onSelectDate(model.today)` and the class page already sets `selectedDate` / `viewMonth` via those callbacks. If Today is in another month, `onSelectDate` is enough if `paintCalendar` in `classes.ts` also sets `viewMonth = yearMonthFromDate(today)` when selecting today. Do that in the `onSelectDate` handler in `classes.ts`.

`buildDayCell`: always a `button` (or `div[role=gridcell]` with button) that calls `onSelectDate`. Inside: `.class-calendar__day-num`, then chips (`a.event-chip`, `data-tint=pastelFromId(lesson.unitId)`, title text). Slice(0, 2) then `.event-chip-more` if longer. Stop wrapping the whole cell as an `<a>`.

Layout CSS: `.class-calendar` grid `minmax(0,1fr) 20rem` at min-width 1100px; single column below. Detail is the agenda. Day min-height ~7rem. Today number: navy fill, white. Selected: ring.

`classes.ts`: prepend `renderPageHeader` (eyebrow from year · subject, title class name, supporting one line). Put existing Edit / View as student into `actions`. Do not remove banner, teaching-today, sequence, side column.

- [ ] **Step 4: Run** `npx vitest run tests/unit/class-calendar-render.test.ts tests/unit/class-calendar-model.test.ts tests/unit/sections-classes.test.ts tests/unit/entity-banner.test.ts tests/unit/unit-sequence.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/teacher/class-calendar.ts src/teacher/sections/classes.ts src/styles/app.css tests/unit/class-calendar-render.test.ts
git commit -m "feat: class calendar chips, Today, and agenda column"
```

---

### Task 7: Scope timeline chrome

**Files:**
- Modify: `src/teacher/sections/scope-overview.ts`, `src/teacher/sections/scope-timeline.ts`
- Modify: `src/styles/app.css`
- Test: `tests/unit/scope-timeline.test.ts` (and overview tests if present)

- [ ] **Step 1: Add failing assertions**

Timeline unit blocks get `data-tint` from `pastelFromId(unit_id)`. Assessment/note items get class `scope-timeline__block--navy` (or keep kind-based class). A `.scope-timeline__today` marker exists when today falls inside the year range.

If overview is a Gantt of subjects, apply the same tint + term header classes (`.scope-term` × 4) when the overview already has a week scale.

Do not invent readiness percentages. If `unitDateProgress` is already used somewhere, a summary card may call it; otherwise omit the summary cards rather than fake them.

- [ ] **Step 2: Run the scope tests — expect FAIL** on new selectors

- [ ] **Step 3: Implement chrome**

- Course strip at top of per-subject timeline: title, unit count.
- Term bands if week count is 40 (four equal columns). If week count differs, skip fake terms — only render term headers when `weekCount % 4 === 0` or when existing term data exists.
- `data-tint` on unit bars; navy on assessment-shaped notes if `item.kind === 'note'` and title matches /assess/i, else pastel for notes too is fine — prefer: `kind === 'unit'` → pastel from unit id; `kind === 'note'` → navy pill.
- Today marker: absolute left % from current week vs weekCount.
- Page header on scope index + subject timeline via `renderPageHeader`.

- [ ] **Step 4: Run** `npx vitest run tests/unit/scope-timeline.test.ts tests/unit/scope-overview.test.ts tests/unit/timeline-weeks.test.ts tests/unit/timeline-drag.test.ts`

(If `scope-overview.test.ts` does not exist, skip it.)

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/teacher/sections/scope-overview.ts src/teacher/sections/scope-timeline.ts src/styles/app.css tests/unit/scope-timeline.test.ts
git commit -m "feat: restyle scope timeline with tints and today marker"
```

---

### Task 8: Lesson surfaces, indexes, student, sign-in

**Files:**
- Modify: `src/student/lesson-view.ts`, `src/student/class-view.ts`
- Modify: `src/teacher/lesson-editor.ts` (only if compact bar markup needs a class)
- Modify: index/list renderers under `src/teacher/sections/` (lessons, units, resources, templates, trash) — prepend `renderPageHeader`
- Modify: `src/styles/app.css`
- Test: `tests/unit/lesson-view.test.ts` plus existing section tests

Teacher `/lessons/:id` remains the editor. Student lesson view is the hero.

- [ ] **Step 1: Helper + failing student lesson tests**

Add `src/teacher/lesson-lead.ts` (or colocate in student module if that keeps imports simpler — prefer `src/blocks/plain-text.ts` only if one already exists; otherwise `src/student/lesson-lead.ts`):

```ts
export function firstLeadFromBlocks(
  blocks: Array<{ block_type: string; content: { html?: string; text?: string } }>
): string | null {
  for (const block of blocks) {
    if (block.block_type === 'rich_text' && block.content.html) {
      const text = block.content.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    if (block.block_type === 'heading' && block.content.text?.trim()) {
      return block.content.text.trim();
    }
  }
  return null;
}
```

TDD: `tests/unit/lesson-lead.test.ts` — strips tags; returns null for empty blocks.

In `lesson-view.test.ts`, mock a published lesson with a rich_text block. After mount, expect `.lesson-hero__title` === `Memory`, `.lesson-hero__lead` contains stripped text, `.lesson-hero__meta` contains class title when class-scoped.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement student hero**

`mountStudentLessonView` content: `.lesson-hero.glass-panel` with eyebrow (class title or “Lesson”), h1, optional lead, navy `.lesson-hero__meta` with unit id resolved to title if the published payload has it — published lesson has `unit_id`; published class `active_units` or schedule may have dates. If unit title is not in the published lesson payload, show scheduled date from the class schedule row; omit the navy card if neither unit title nor date is available.

Blocks: wrap the existing block list in `.lesson-blocks` (glass). Keep prev/next.

Indexes: prepend `renderPageHeader` on lessons/units/resources/templates/trash/classes index. CSS: list rows as glass, status pills sage/gold/navy — grep `high-sea` / `btn--primary` on canvas and recut.

Sign-in: already `.sign-in__card`; it inherits glass. Check `.sign-in__submit` is navy not High Sea.

Editor: add class `lesson-editor` on the canvas root if missing; CSS compact title input, glass block frames. Do not add a 42px hero in the editor.

Student class/unit: cotton wash on `.student-surface`, no rail, simpler banner radius.

- [ ] **Step 4: Run** `npx vitest run tests/unit/lesson-view.test.ts tests/unit/lesson-lead.test.ts tests/unit/lesson-editor.test.ts tests/unit/sections-lessons.test.ts tests/unit/class-view.test.ts`

Then full: `npm test`

Expected: PASS

- [ ] **Step 5: Update `docs/BUILD.md`**

History row: `2026-08-13 | Cotton glass redesign | Whole-app cotton glass + Life Hub rail; proper class calendar chips and scope timeline chrome — design + this plan`.

Move nothing from Next up except leave class-page follow-ups as they are.

- [ ] **Step 6: Commit**

```bash
git add src/student/lesson-view.ts src/student/lesson-lead.ts src/student/class-view.ts src/teacher/lesson-editor.ts src/teacher/sections src/styles/app.css tests/unit docs/BUILD.md
git commit -m "feat: cotton glass lesson view, indexes, and student surfaces"
```

---

## Self-review vs spec

| Spec requirement | Task |
|------------------|------|
| Cotton palette, Inter, glass, radius | 3 |
| Navy Life Hub labeled rail, glyphs | 4 |
| Wave/High Sea rail-only | 3, 4, 8 |
| Page header; no thin context bar on browsing | 2, 4, 5–8 |
| Compact editor bar | 4, 8 |
| Home today card + week chips | 5 |
| Class calendar chips, Today, agenda | 6 |
| Keep banner, sequence, publish, edit | 6 (do not remove) |
| Scope tints, today, no fake % | 7 |
| Student hero; no teacher lesson view route | 8 |
| Indexes + sign-in | 8 |
| Deterministic pastel | 1, 5, 6, 7 |
| `npm test` | 8 |
| No new calendar route / viewbar / gallery | none (out of scope) |

## Manual visual pass (after Task 8)

Desktop then narrow viewport: sign-in, home, class (chips + agenda + sequence), scope timeline, lesson editor, lessons index, search, published student class + lesson. Check contrast, focus rings, reduced-motion.
