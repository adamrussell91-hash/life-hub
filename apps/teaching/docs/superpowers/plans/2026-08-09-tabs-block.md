# Tabs Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add nested `tabs` layout block — labelled panels of nested blocks (including columns), stacked editor, tabbed student view, with nesting rules from the design spec.

**Architecture:** Extend Phase A recursive Zod tree: `TabChildBlockSchema` = leaves + spacer + columns; `TabsBlockSchema` panels 2–8; section children gain `tabs`; column children forbid `tabs`. Reuse `createNestedBlocksEditor`. Student renderer is a client-side tablist; publish requires non-empty labels.

**Tech Stack:** TypeScript, Zod, Vite, Vitest (happy-dom), Clinical Glass CSS

**Spec:** `docs/superpowers/specs/2026-08-09-tabs-block-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/block.ts` | `tabs` type; TabChild / SectionChild / BlockSchema updates |
| `src/schemas/lesson.ts` | Publish: tab labels + recurse into panels |
| `src/blocks/create-block.ts` | Create defaults, `TAB_CHILD_TYPES`, column forbid tabs, clone |
| `src/blocks/layout-editors.ts` | `createTabsEditor` |
| `src/blocks/editors.ts` | Dispatch `tabs` |
| `src/blocks/render.ts` | `renderTabsBlock` + dispatch |
| `src/blocks/registry.ts` | Register tabs |
| `src/blocks/visibility.ts` | Recurse tabs panels |
| `src/blocks/sanitize-blocks.ts` | Recurse tabs panels |
| `src/styles/app.css` | Student tabs + editor panel chrome |
| `tests/unit/tabs-block.test.ts` | Schema, create, render, editor |
| `tests/unit/schemas-lesson.test.ts` | Publish label rule |
| `tests/unit/visibility.test.ts` | Nested teacher_only in tabs |
| `tests/unit/render-blocks.test.ts` | Registry includes `tabs` |
| `docs/BUILD.md` | History + projection update |

---

### Task 1: Schema + createBlock

**Files:**
- Modify: `src/schemas/block.ts`
- Modify: `src/blocks/create-block.ts`
- Create: `tests/unit/tabs-block.test.ts`

- [ ] **Step 1: Write failing tests** in `tests/unit/tabs-block.test.ts` for: parse tabs; reject nested tabs/section in panel; reject tabs in columns; allow tabs in section; allow columns in tab; reject count &lt;2 / &gt;8; `createBlock('tabs')` yields 3 empty panels; clone regenerates panel + child ids.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/tabs-block.test.ts
```

- [ ] **Step 3: Implement schema**

Add `'tabs'` to `BlockTypeSchema`. After `ColumnsBlockSchema`, add:

```ts
export const TabChildBlockSchema = z.lazy(() =>
  z.discriminatedUnion('block_type', [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema
  ])
);

export const TabsBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('tabs'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    tabs: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string(),
          blocks: z.array(TabChildBlockSchema)
        })
      )
      .min(2)
      .max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
```

Update `SectionChildBlockSchema` to include `TabsBlockSchema`. Update `BlockSchema` union to include `TabsBlockSchema`.

- [ ] **Step 4: Implement create-block**

- Add `'tabs'` to `NEW_BLOCK_TYPES`, label `Tabs`, Layout group after `section` (or with layout peers)
- `COLUMN_CHILD_TYPES`: also exclude `'tabs'`
- `TAB_CHILD_TYPES`: exclude `'tabs'` and `'section'`
- `SECTION_CHILD_TYPES`: still exclude only `'section'` (tabs allowed)
- `createBlock('tabs')`: 3 panels with ids `${id}_t1`…`_t3`, empty labels, empty blocks
- `cloneBlockWithNewIds`: new panel ids + recurse children

- [ ] **Step 5: Run tests — expect PASS**

---

### Task 2: Publish + visibility + sanitize

**Files:**
- Modify: `src/schemas/lesson.ts`
- Modify: `src/blocks/visibility.ts`
- Modify: `src/blocks/sanitize-blocks.ts`
- Modify: `tests/unit/schemas-lesson.test.ts`
- Modify: `tests/unit/visibility.test.ts`

- [ ] **Step 1: Tests** — publish rejects empty tab label; empty panels OK; visibility filters teacher_only inside a tab panel; sanitize walks rich_text inside tabs.

- [ ] **Step 2: Implement** — in `publishBlockIssues`, for `tabs`: each label must trim non-empty; recurse each panel’s blocks. Mirror section/columns recursion in visibility + sanitize.

- [ ] **Step 3: Run related unit tests — PASS**

---

### Task 3: Editor

**Files:**
- Modify: `src/blocks/layout-editors.ts`
- Modify: `src/blocks/editors.ts`
- Modify: `tests/unit/tabs-block.test.ts`

- [ ] **Step 1: Tests** — label input updates; add panel up to 8 / remove down to 2; “Add in tab” can insert columns.

- [ ] **Step 2: Implement `createTabsEditor`**

Stacked panels: label input, nested editor with `TAB_CHILD_TYPES`, Up/Down/Remove panel, Add panel button. Rebuild on structural change. Wire `case 'tabs'` in `createBlockEditor`.

- [ ] **Step 3: Run tests — PASS**

---

### Task 4: Render + CSS + registry

**Files:**
- Modify: `src/blocks/render.ts`
- Modify: `src/blocks/registry.ts`
- Modify: `src/styles/app.css`
- Modify: `tests/unit/tabs-block.test.ts`
- Modify: `tests/unit/render-blocks.test.ts`

- [ ] **Step 1: Tests** — first tab selected; click second shows second panel; arrow keys; registry has `tabs`.

- [ ] **Step 2: Implement `renderTabsBlock`**

```ts
// tablist + tabs + tabpanels; aria-selected; hidden inactive panels
// ArrowLeft/ArrowRight cycle; Home/End optional
```

CSS: `.block-tabs`, `__tablist` (horizontal scroll), `__tab`, `__tab--active`, `__panel`, editor `.block-editor__tabs-panel`.

- [ ] **Step 3: Register + run tests — PASS**

---

### Task 5: BUILD.md + full suite

- [ ] Update `docs/BUILD.md`: History row for Tabs; tick Projection; Next up remove Tabs; Latest note.
- [ ] Run `npx vitest run` — all pass.

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Nested Block[] panels | 1 |
| Nesting matrix | 1 |
| Create 3 / min2 / max8 | 1, 3 |
| Labels required publish | 2 |
| Stacked editor | 3 |
| Student tablist + a11y | 4 |
| BUILD update | 5 |
