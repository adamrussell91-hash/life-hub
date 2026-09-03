# Standard Cover Image Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard, class, unit, and lesson use the same class-style cover banner/dialog while ensuring cover changes never remount an editor or discard unsaved work.

**Architecture:** Keep `mountCoverPicker` as the single cover-editing control and `renderEntityBanner` as the single surface that opens it. Extend the banner handle so long-lived lesson editors can update the displayed title and cover without remounting. Split cover-cache invalidation from broad page-refresh callbacks so class and unit PATCH operations repaint only the banner.

**Tech Stack:** TypeScript, DOM APIs, Vitest with happy-dom, Netlify Functions, existing hub design tokens and button classes.

**Commit policy:** Do not create commits unless Adam explicitly requests them.

---

## File map

- `src/teacher/cover-picker.ts` — shared URL/library/remove controls and local preview state.
- `src/teacher/entity-banner.ts` — canonical read-first banner, cover dialog, and in-place update handle.
- `src/teacher/sections/classes.ts` — class cover persistence without the schedule/homepage remount callback.
- `src/teacher/sections/units.ts` — replace the inline picker with the canonical banner and isolate cover mutations.
- `src/teacher/lesson-canvas/mount-page.ts` — replace the compact picker with the canonical banner while retaining lesson dirty-state persistence.
- `src/app/main.ts` — invalidate curriculum cache after class/unit cover changes without tearing down the page.
- `src/styles/app.css` — remove obsolete compact/inline-cover rules and size shared banners in unit and lesson hosts using existing tokens.
- `tests/unit/cover-picker.test.ts` — direct shared-control behavior and failure coverage.
- `tests/unit/entity-banner.test.ts` — banner updates and dialog failure behavior.
- `tests/unit/sections-classes.test.ts` — class clear preserves unsaved homepage editor state.
- `tests/unit/sections-units.test.ts` — unit uses the shared banner and clear preserves unsaved plan state.
- `tests/unit/lesson-canvas-page.test.ts` — lesson uses the shared banner and emits cover-only draft changes.
- `tests/unit/teacher-home.test.ts` — dashboard continues to expose the shared interaction.
- `tests/unit/class-api.test.ts` — clearing a class cover preserves homepage content.
- `tests/unit/unit-api.test.ts` — clearing a unit cover preserves unit blocks.

### Task 1: Make remove-cover semantics explicit and safe

**Files:**
- Create: `tests/unit/cover-picker.test.ts`
- Modify: `src/teacher/cover-picker.ts:5-12, 29-35, 72-92, 106-153, 211-213`

- [ ] **Step 1: Write failing shared-picker tests**

Create `tests/unit/cover-picker.test.ts` with real DOM behavior:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountCoverPicker } from '@/teacher/cover-picker';

describe('mountCoverPicker', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('labels removal explicitly and persists only null', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    mountCoverPicker(host, {
      cover: { url: 'https://cdn.example.com/old.jpg' },
      media: [],
      onSave
    });

    const remove = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Remove cover'
    );
    expect(remove?.type).toBe('button');
    expect(remove?.disabled).toBe(false);
    remove?.click();

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
    expect(host.querySelector('.cover-picker__image')?.hasAttribute('src')).toBe(false);
    expect(remove?.disabled).toBe(true);
  });

  it('disables Remove cover when no cover exists', () => {
    mountCoverPicker(host, { media: [], onSave: vi.fn() });
    const remove = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Remove cover'
    );
    expect(remove?.disabled).toBe(true);
  });

  it('keeps the previous preview and shows an error when removal fails', async () => {
    mountCoverPicker(host, {
      cover: { url: 'https://cdn.example.com/old.jpg' },
      media: [],
      onSave: vi.fn().mockRejectedValue(new Error('Cover save failed'))
    });

    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Remove cover')
      ?.click();

    await vi.waitFor(() => {
      expect(host.querySelector('.cover-picker__error')?.textContent).toBe('Cover save failed');
    });
    expect(host.querySelector<HTMLImageElement>('.cover-picker__image')?.src).toContain('old.jpg');
  });
});
```

- [ ] **Step 2: Run the picker test and verify RED**

Run:

```bash
npx vitest run tests/unit/cover-picker.test.ts
```

Expected: FAIL because the current action is labelled `Clear` and is enabled when no cover exists.

- [ ] **Step 3: Implement explicit remove state**

In `mountCoverPicker`:

```ts
const removeBtn = document.createElement('button');
removeBtn.type = 'button';
removeBtn.className = 'btn btn--ghost';
removeBtn.textContent = 'Remove cover';
```

Replace scattered button enable/disable assignments with:

```ts
const syncButtons = (): void => {
  applyBtn.disabled = busy;
  libraryBtn.disabled = busy;
  removeBtn.disabled = busy || current === null;
};
```

Call `syncButtons()` after `renderPreview()`, immediately after setting `busy = true`, and in `finally` after setting `busy = false`. Keep `current` unchanged until `options.onSave(next)` succeeds. Wire removal with:

```ts
removeBtn.addEventListener('click', () => {
  if (current === null) return;
  void persist(null);
});
```

- [ ] **Step 4: Run the picker test and verify GREEN**

Run:

```bash
npx vitest run tests/unit/cover-picker.test.ts
```

Expected: 3 tests PASS with no warnings.

### Task 2: Make the canonical banner safely updatable

**Files:**
- Modify: `tests/unit/entity-banner.test.ts`
- Modify: `src/teacher/entity-banner.ts:5-17, 36-61, 94-103, 164-193`

- [ ] **Step 1: Write failing banner update tests**

Add tests proving the banner can change without replacement:

```ts
it('updates title and cover in place without replacing the banner root', () => {
  const handle = renderEntityBanner(host, {
    entityId: 'lesson_1',
    title: 'Old title',
    media: []
  });
  const root = host.querySelector('.entity-banner');

  handle.update({
    title: 'New title',
    cover: { url: 'https://cdn.example.com/new.jpg' }
  });

  expect(host.querySelector('.entity-banner')).toBe(root);
  expect(host.querySelector('.entity-banner__title')?.textContent).toBe('New title');
  expect(host.querySelector<HTMLImageElement>('.entity-banner__image')?.src).toContain('new.jpg');
});

it('keeps the dialog open and old banner when persistence fails', async () => {
  renderEntityBanner(host, {
    entityId: 'class_1',
    title: 'Class',
    cover: { url: 'https://cdn.example.com/old.jpg' },
    media: [],
    editable: true,
    onSave: vi.fn().mockRejectedValue(new Error('Save failed'))
  });

  host.querySelector<HTMLButtonElement>('.entity-banner__edit')?.click();
  document
    .querySelector<HTMLButtonElement>('.entity-banner__dialog button.btn--ghost')
    ?.click();

  await vi.waitFor(() => {
    expect(document.querySelector('.entity-banner__dialog')).not.toBeNull();
    expect(document.querySelector('.cover-picker__error')?.textContent).toBe('Save failed');
  });
  expect(host.querySelector<HTMLImageElement>('.entity-banner__image')?.src).toContain('old.jpg');
});
```

Select the remove button by its `Remove cover` text if more than one ghost button is present.

- [ ] **Step 2: Run the banner tests and verify RED**

Run:

```bash
npx vitest run tests/unit/entity-banner.test.ts
```

Expected: FAIL because `EntityBannerHandle` has no `update()` method.

- [ ] **Step 3: Add an in-place update API**

Introduce:

```ts
export interface EntityBannerUpdate {
  cover?: Cover | null;
  title?: string;
  eyebrow?: string;
}

export interface EntityBannerHandle {
  update: (next: EntityBannerUpdate) => void;
  dispose: () => void;
}
```

Copy mutable display values at mount time:

```ts
let current: Cover | null = options.cover ?? null;
let titleText = options.title;
let eyebrowText = options.eyebrow;
```

Use `titleText` and `eyebrowText` throughout `paint()` and `openCoverDialog()`. Return:

```ts
update: (next) => {
  if ('cover' in next) current = next.cover ?? null;
  if (next.title !== undefined) titleText = next.title;
  if (next.eyebrow !== undefined) eyebrowText = next.eyebrow;
  paint();
},
```

Do not replace `root`; only `paint()` its children. Preserve the existing rule that `current` changes only after `onSave` resolves.

- [ ] **Step 4: Run banner and picker tests**

Run:

```bash
npx vitest run tests/unit/entity-banner.test.ts tests/unit/cover-picker.test.ts
```

Expected: all tests PASS.

### Task 3: Remove destructive class and unit cover refreshes

**Files:**
- Modify: `src/teacher/sections/classes.ts:39-42, 239-250`
- Modify: `src/teacher/sections/units.ts:5, 51-53, 321-339, 462-469`
- Modify: `src/app/main.ts:438-487, 606-645`
- Modify: `tests/unit/sections-classes.test.ts`
- Modify: `tests/unit/sections-units.test.ts`

- [ ] **Step 1: Write failing class preservation test**

Add `onCoverMutated` to the wished-for options in a class test. Enter homepage edit mode, add a heading, then remove the cover:

```ts
it('removes a cover without invoking the page-remount callback or losing homepage edits', async () => {
  const onScheduleMutated = vi.fn();
  const onCoverMutated = vi.fn();
  const withCover = {
    ...curriculum,
    classes: [{ ...classRow, cover: { url: 'https://cdn.example.com/class.jpg' } }]
  };

  renderClassPage(canvas, withCover, classRow.id, {
    onScheduleMutated,
    onCoverMutated
  });
  canvas.querySelector<HTMLButtonElement>('.class-page__edit-homepage')?.click();
  canvas.querySelector<HTMLButtonElement>('.lesson-palette__family[data-family="Basic"]')?.click();
  canvas.querySelector<HTMLButtonElement>('.lesson-palette__card[data-block-type="heading"]')?.click();
  const editor = canvas.querySelector('.homepage-editor');

  canvas.querySelector<HTMLButtonElement>('.entity-banner__edit')?.click();
  [...document.querySelectorAll<HTMLButtonElement>('.entity-banner__dialog button')]
    .find((button) => button.textContent === 'Remove cover')
    ?.click();

  await vi.waitFor(() => {
    expect(patchClass).toHaveBeenCalledWith(classRow.id, { cover: null });
    expect(onCoverMutated).toHaveBeenCalledOnce();
  });
  expect(onScheduleMutated).not.toHaveBeenCalled();
  expect(canvas.querySelector('.homepage-editor')).toBe(editor);
  expect(editor?.querySelector('[data-block-type="heading"]')).not.toBeNull();
});
```

- [ ] **Step 2: Write failing unit standardization/preservation test**

Mock `@/teacher/unit-api`, import `renderUnitPage`, and add:

```ts
it('uses the shared banner and removes its cover without remounting the unit plan', async () => {
  const onMutated = vi.fn();
  const onCoverMutated = vi.fn();
  vi.mocked(patchUnit).mockResolvedValue({ ...unit, cover: undefined });

  renderUnitPage(canvas, curriculum, unit.id, { onMutated, onCoverMutated });
  expect(canvas.querySelector('.entity-banner__edit')?.textContent).toBe('Change cover');
  expect(canvas.querySelector('.unit-page__cover > .cover-picker')).toBeNull();
  const plan = canvas.querySelector('.unit-plan-editor');

  canvas.querySelector<HTMLButtonElement>('.entity-banner__edit')?.click();
  [...document.querySelectorAll<HTMLButtonElement>('.entity-banner__dialog button')]
    .find((button) => button.textContent === 'Remove cover')
    ?.click();

  await vi.waitFor(() => {
    expect(patchUnit).toHaveBeenCalledWith(unit.id, { cover: null });
    expect(onCoverMutated).toHaveBeenCalledOnce();
  });
  expect(onMutated).not.toHaveBeenCalled();
  expect(canvas.querySelector('.unit-plan-editor')).toBe(plan);
});
```

- [ ] **Step 3: Run class and unit tests and verify RED**

Run:

```bash
npx vitest run tests/unit/sections-classes.test.ts tests/unit/sections-units.test.ts
```

Expected: FAIL because the options lack `onCoverMutated`, class cover save invokes the broad callback, and units still mount the inline picker.

- [ ] **Step 4: Split cover invalidation from broad mutation refresh**

Extend both page option types:

```ts
onCoverMutated?: () => void | Promise<void>;
```

For class cover save:

```ts
onSave: async (cover) => {
  const saved = await patchClass(cls.id, { cover });
  if (saved.cover) pageClass.cover = saved.cover;
  else delete pageClass.cover;
  await options.onCoverMutated?.();
}
```

Do not call `onScheduleMutated` from this path.

For units, replace `mountCoverPicker` with `renderEntityBanner`:

```ts
const coverHost = document.createElement('div');
coverHost.className = 'unit-page__cover';
const yearTitle = curriculum.years.find((entry) => entry.id === unit.year_id)?.title;
const subjectTitle = curriculum.subjects.find((entry) => entry.id === unit.subject_id)?.title;
const banner = renderEntityBanner(coverHost, {
  cover: unit.cover,
  media: curriculum.media,
  title: unit.title,
  eyebrow: [yearTitle, subjectTitle].filter(Boolean).join(' · '),
  entityId: unit.id,
  editable: true,
  onSave: async (cover) => {
    const saved = await patchUnit(unit.id, { cover });
    unit.cover = saved.cover;
    await options.onCoverMutated?.();
  }
});
```

Apply the returned unit cover without assigning `undefined` to an optional property:

```ts
if (saved.cover) unit.cover = saved.cover;
else delete unit.cover;
```

Dispose both mounted controls:

```ts
dispose: () => {
  banner.dispose();
  planEditor.dispose();
}
```

- [ ] **Step 5: Wire cache-only callbacks in the route layer**

In `renderTeacherClassRoute`, add:

```ts
onCoverMutated: () => {
  invalidateCurriculum();
},
```

Keep `onScheduleMutated: refreshAfterScheduleMutation` for actual schedule and saved-homepage changes.

In both `renderUnitPage` calls inside `renderTeacherUnitRoute`, pass:

```ts
onMutated: refreshUnit,
onCoverMutated: () => {
  invalidateCurriculum();
}
```

This makes the next curriculum request fresh without calling `teardownClassPage()` or `teardownUnitPage()` now.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run tests/unit/sections-classes.test.ts tests/unit/sections-units.test.ts
```

Expected: all tests PASS.

### Task 4: Standardize lesson and dashboard cover interactions

**Files:**
- Modify: `src/teacher/lesson-canvas/mount-page.ts:17, 625-628, 686-719, 736-752`
- Modify: `src/teacher/cover-picker.ts:5-12, 33-35, 96-101`
- Modify: `src/styles/app.css:2184-2279, 3272-3283, 7373-7379`
- Modify: `tests/unit/lesson-canvas-page.test.ts:78-140`
- Modify: `tests/unit/teacher-home.test.ts:131-145`

- [ ] **Step 1: Write failing lesson shared-banner test**

Replace the weak “mounts a cover host” assertion with:

```ts
it('uses the shared cover banner and emits a cover-only lesson change', async () => {
  const lesson = makeLesson({
    cover: { url: 'https://cdn.example.com/lesson.jpg' }
  });
  const { onChange } = mount(lesson);
  const titleInput = host.querySelector<HTMLInputElement>('.lesson-page__title')!;
  titleInput.value = 'Unsaved title';
  titleInput.dispatchEvent(new Event('input', { bubbles: true }));
  onChange.mockClear();

  expect(host.querySelector('.entity-banner__edit')?.textContent).toBe('Change cover');
  expect(host.querySelector('.cover-picker')).toBeNull();
  host.querySelector<HTMLButtonElement>('.entity-banner__edit')?.click();
  [...document.querySelectorAll<HTMLButtonElement>('.entity-banner__dialog button')]
    .find((button) => button.textContent === 'Remove cover')
    ?.click();

  await vi.waitFor(() => expect(onChange).toHaveBeenCalledOnce());
  const next = onChange.mock.calls[0]![0] as Lesson;
  expect(next.cover).toBeUndefined();
  expect(next.title).toBe('Unsaved title');
  expect(host.querySelector<HTMLInputElement>('.lesson-page__title')?.value).toBe('Unsaved title');
});
```

- [ ] **Step 2: Strengthen the dashboard standard assertion**

In the existing dashboard rendering test, open the cover dialog and assert the shared controls:

```ts
canvas.querySelector<HTMLButtonElement>('.entity-banner__edit')?.click();
const dialog = document.querySelector('.entity-banner__dialog');
expect(dialog?.querySelector('.cover-picker__url')).not.toBeNull();
expect(
  [...(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? [])].some(
    (button) => button.textContent === 'Remove cover'
  )
).toBe(true);
```

Ensure test cleanup removes dialog nodes through the returned dashboard disposer.

- [ ] **Step 3: Run lesson and dashboard tests and verify RED**

Run:

```bash
npx vitest run tests/unit/lesson-canvas-page.test.ts tests/unit/teacher-home.test.ts
```

Expected: lesson test FAIL because lessons still use compact `mountCoverPicker`; dashboard may fail until Task 1’s label change is present.

- [ ] **Step 4: Replace the lesson compact picker with `renderEntityBanner`**

Change the lesson page to hold `EntityBannerHandle`:

```ts
let coverHandle: EntityBannerHandle | null = null;
```

Mount once:

```ts
coverHandle = renderEntityBanner(coverHost, {
  cover: lesson.cover,
  media,
  title: lesson.title,
  entityId: lesson.id,
  editable: true,
  onSave: (cover) => {
    emitLesson({
      ...lesson,
      ...(cover ? { cover } : { cover: undefined })
    });
  }
});
```

Update rather than remount when the parent supplies a new lesson:

```ts
coverHandle.update({
  cover: lesson.cover ?? null,
  title: lesson.title
});
```

When the title input changes, call `coverHandle.update({ title: title.value })` before emitting the lesson so the banner title stays synchronized without replacing the editor.

- [ ] **Step 5: Remove obsolete compact-picker behavior and align host CSS**

Delete `compact?: boolean` and the `cover-picker--compact` click-toggle branch because there are no remaining consumers. Remove `.cover-picker--compact` CSS.

Keep shared `.entity-banner` styling unchanged. Remove `.unit-page__header` from the padded panel selector, remove the obsolete negative-margin `.unit-page__cover` rule, and add:

```css
.unit-page__cover,
.lesson-page__cover {
  min-width: 0;
}
```

Remove the old negative-margin `.unit-page__cover` rule if the unit banner is no longer nested in the padded `glass-panel` header. Do not add colours, radii, font sizes, or button styles.

- [ ] **Step 6: Run focused UI tests**

Run:

```bash
npx vitest run tests/unit/lesson-canvas-page.test.ts tests/unit/teacher-home.test.ts tests/unit/entity-banner.test.ts tests/unit/cover-picker.test.ts
```

Expected: all tests PASS.

### Task 5: Prove API preservation and run full verification

**Files:**
- Modify: `tests/unit/class-api.test.ts`
- Create: `tests/unit/unit-api.test.ts`
- Verify only: `netlify/functions/class.mts`
- Verify only: `netlify/functions/unit.mts`

- [ ] **Step 1: Add class API preservation test**

Seed a class with both homepage content and a cover, clear only the cover, then refetch:

```ts
it('clears only the cover and preserves homepage content', async () => {
  const seed = freshSeed();
  const cls = seed.classes.find((entry) => entry.id === CLASS_ID)!;
  cls.cover = { url: 'https://cdn.example.com/class.jpg' };
  cls.homepage = {
    announcements: [validHeadingBlock],
    resources: [],
    custom: []
  };
  const api = freshApi(seed);
  const cookie = await signIn(api);

  const res = await api.request('PATCH', PATH, {
    cookie,
    body: { cover: null }
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.data.cover).toBeUndefined();
  expect(body.data.homepage.announcements).toHaveLength(1);
});
```

- [ ] **Step 2: Add unit API preservation test**

Create `tests/unit/unit-api.test.ts` with the fixture/API setup from `class-api.test.ts`, `UNIT_ID = 'unit_aotfw'`, and this valid block:

```ts
const validHeadingBlock = {
  id: 'block_unit_cover_preservation',
  type: 'block' as const,
  block_type: 'heading' as const,
  variant: 'section' as const,
  visibility: 'student_teacher' as const,
  content: { text: 'Keep this plan' },
  layout: {},
  print: {},
  settings: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schema_version: 1 as const
};
```

Add the preservation test:

```ts
it('clears only the cover and preserves unit blocks', async () => {
  const seed = freshSeed();
  const unit = seed.units.find((entry) => entry.id === UNIT_ID)!;
  unit.cover = { url: 'https://cdn.example.com/unit.jpg' };
  unit.blocks = [validHeadingBlock];
  const api = freshApi(seed);
  const cookie = await signIn(api);

  const res = await api.request('PATCH', `/api/units/${UNIT_ID}`, {
    cookie,
    body: { cover: null }
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.data.cover).toBeUndefined();
  expect(body.data.blocks).toEqual([validHeadingBlock]);
});
```

- [ ] **Step 3: Run API tests**

Run:

```bash
npx vitest run tests/unit/class-api.test.ts tests/unit/unit-api.test.ts
```

Expected: both suites PASS, confirming the existing server merge behavior.

- [ ] **Step 4: Run all cover-related regression suites**

Run:

```bash
npx vitest run \
  tests/unit/cover-picker.test.ts \
  tests/unit/entity-banner.test.ts \
  tests/unit/sections-classes.test.ts \
  tests/unit/sections-units.test.ts \
  tests/unit/lesson-canvas-page.test.ts \
  tests/unit/teacher-home.test.ts \
  tests/unit/class-api.test.ts \
  tests/unit/unit-api.test.ts \
  tests/unit/schemas-cover.test.ts \
  tests/unit/class-view.test.ts \
  tests/unit/unit-view.test.ts \
  tests/unit/lesson-view.test.ts
```

Expected: all suites PASS with no unhandled errors.

- [ ] **Step 5: Run full unit tests and production build**

Run:

```bash
npm run test:unit
npm run build
```

Expected: all unit tests PASS; TypeScript and Vite build complete successfully.

- [ ] **Step 6: Manually verify the destructive path**

In the local app:

1. Open a unit with a cover.
2. Add or edit a unit-plan block without clicking “Save plan”.
3. Open “Change cover” and choose “Remove cover”.
4. Confirm the image disappears, the dialog closes, the same unit-plan DOM and unsaved text remain, and no full-page loading state appears.
5. Repeat on a class while unsaved homepage edits are present.
6. Confirm dashboard and lesson covers expose the same dialog, labels, URL field, alt field, library action, and remove action.

Expected: cover-only repaint on all four surfaces; no editor teardown or lost unsaved state.
