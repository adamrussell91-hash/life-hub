# Partial Accept Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers can uncheck parts of a validated AI proposal (collection items and multi-block plans) and apply only the kept subset through the existing Accept path.

**Architecture:** Pure `listPartialAcceptUnits` / `filterProposal` in `src/ai/partial-accept.ts`. The AI panel shows a checklist when there are two or more units, then calls `onAcceptProposal` with the filtered proposal. `applyProposalToLesson` and Netlify AI routes stay unchanged.

**Tech Stack:** TypeScript, Zod (`BlockSchema`), Vitest, existing `ai-panel` DOM.

**Spec:** `docs/superpowers/specs/2026-08-15-partial-accept-design.md`

---

## File map

- Create: `src/ai/partial-accept.ts` — list units, filter proposal, schema-min checks
- Create: `tests/unit/partial-accept.test.ts`
- Modify: `src/teacher/ai-panel.ts` — checklist + Accept selected
- Modify: `src/styles/app.css` — checklist spacing
- Modify: `tests/unit/ai-panel.test.ts` — checkbox + filtered accept

Do not modify `src/ai/apply-proposal.ts`, `src/ai/proposals.ts`, or Netlify AI functions.

---

### Task 1: List units

**Files:**
- Create: `tests/unit/partial-accept.test.ts`
- Create: `src/ai/partial-accept.ts`

- [ ] **Step 1: Write the failing test**

Use the same `timestamps` / `baseBlock` pattern as `tests/unit/new-blocks.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import type { Block } from '@/schemas/block';
import type { AiProposal } from '@/ai/proposals';
import { filterProposal, listPartialAcceptUnits } from '@/ai/partial-accept';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const base = {
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

function heading(id: string, text: string): Block {
  return { ...base, id, block_type: 'heading', variant: 'section', content: { text } };
}

function questionSet(): Block {
  return {
    ...base,
    id: 'qs1',
    block_type: 'question_set',
    content: {
      title: 'Check-in',
      questions: [
        { id: 'q1', prompt: 'One', kind: 'short_answer' },
        { id: 'q2', prompt: 'Two', kind: 'short_answer' },
        { id: 'q3', prompt: 'Three', kind: 'short_answer' },
        { id: 'q4', prompt: 'Four', kind: 'short_answer' },
        { id: 'q5', prompt: 'Five', kind: 'short_answer' }
      ]
    }
  };
}

describe('listPartialAcceptUnits', () => {
  it('lists questions on replace_block question_set', () => {
    const units = listPartialAcceptUnits({
      kind: 'replace_block',
      block_id: 'qs1',
      block: questionSet()
    });
    expect(units.map((u) => u.key)).toEqual([
      'questions:q1',
      'questions:q2',
      'questions:q3',
      'questions:q4',
      'questions:q5'
    ]);
  });

  it('lists title and root blocks on replace_lesson', () => {
    const units = listPartialAcceptUnits({
      kind: 'replace_lesson',
      title: 'Built lesson',
      blocks: [heading('h1', 'A'), heading('h2', 'B')]
    });
    expect(units.map((u) => u.key)).toEqual(['title', 'block:0', 'block:1']);
  });

  it('returns no units for reorder_blocks and review_only', () => {
    expect(
      listPartialAcceptUnits({
        kind: 'reorder_blocks',
        parent: { kind: 'root' },
        ordered_ids: ['a', 'b']
      })
    ).toEqual([]);
    expect(listPartialAcceptUnits({ kind: 'review_only', summary: 'Looks fine' })).toEqual([]);
  });

  it('returns no units for a single rich_text replace_block', () => {
    const block: Block = {
      ...base,
      id: 'rt1',
      block_type: 'rich_text',
      content: { html: '<p>Hi</p>' }
    };
    expect(listPartialAcceptUnits({ kind: 'replace_block', block_id: 'rt1', block })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/partial-accept.test.ts`

Expected: FAIL — cannot find module `@/ai/partial-accept`

- [ ] **Step 3: Write minimal implementation**

`src/ai/partial-accept.ts`: export `PartialAcceptUnit { key, label, group? }`, `listPartialAcceptUnits(proposal)`.

Key rules from the spec:

- `replace_block` collection → item keys only (`questions:id`, `cards:id`, `events:id`, `gallery:id`, `accordion:index`, `self_check:id`)
- `insert_blocks` / `replace_lesson` → `block:i` plus nested item keys with prefix `block:i.`
- `replace_lesson` also `title` / `cover` when present
- `replace_section` → `child:i` plus nested items `child:i.…`
- `delete_blocks` → `delete:id`
- `reorder_blocks` / `review_only` / non-collection `replace_block` → `[]`

Labels: truncated prompt / front / when+label / alt / accordion title / self-check label. Block labels: heading text or `NEW_BLOCK_LABEL[block_type]`.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `npx vitest run tests/unit/partial-accept.test.ts`

Expected: PASS for `listPartialAcceptUnits` (filter tests not added yet)

- [ ] **Step 5: Commit** — skip unless Adam asks; working tree already has unrelated WIP.

---

### Task 2: Filter collections and multi-block proposals

**Files:**
- Modify: `tests/unit/partial-accept.test.ts`
- Modify: `src/ai/partial-accept.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('filterProposal', () => {
  it('keeps questions 1, 2 and 5', () => {
    const proposal: AiProposal = {
      kind: 'replace_block',
      block_id: 'qs1',
      block: questionSet()
    };
    const result = filterProposal(proposal, new Set(['questions:q1', 'questions:q2', 'questions:q5']));
    expect(result.ok).toBe(true);
    if (!result.ok || result.proposal.kind !== 'replace_block') throw new Error('expected replace_block');
    const qs = result.proposal.block;
    if (qs.block_type !== 'question_set') throw new Error('expected question_set');
    expect(qs.content.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q5']);
  });

  it('drops the middle insert block', () => {
    const proposal: AiProposal = {
      kind: 'insert_blocks',
      position: 'below',
      anchor_block_id: 'a',
      blocks: [heading('h1', 'A'), heading('h2', 'B'), heading('h3', 'C')]
    };
    const result = filterProposal(proposal, new Set(['block:0', 'block:2']));
    expect(result.ok).toBe(true);
    if (!result.ok || result.proposal.kind !== 'insert_blocks') throw new Error('expected insert');
    expect(result.proposal.blocks.map((b) => b.id)).toEqual(['h1', 'h3']);
  });

  it('omits title on replace_lesson when unchecked', () => {
    const proposal: AiProposal = {
      kind: 'replace_lesson',
      title: 'Built lesson',
      blocks: [heading('h1', 'A')]
    };
    const result = filterProposal(proposal, new Set(['block:0']));
    expect(result.ok).toBe(true);
    if (!result.ok || result.proposal.kind !== 'replace_lesson') throw new Error('expected replace_lesson');
    expect(result.proposal.title).toBeUndefined();
    expect(result.proposal.blocks).toHaveLength(1);
  });

  it('keeps only checked delete ids', () => {
    const result = filterProposal({ kind: 'delete_blocks', ids: ['a', 'b', 'c'] }, new Set(['delete:a', 'delete:c']));
    expect(result.ok).toBe(true);
    if (!result.ok || result.proposal.kind !== 'delete_blocks') throw new Error('expected delete');
    expect(result.proposal.ids).toEqual(['a', 'c']);
  });

  it('fails gallery below min 2', () => {
    const block: Block = {
      ...base,
      id: 'g1',
      block_type: 'gallery',
      variant: 'large',
      content: {
        layout: 'grid',
        items: [
          { id: 'i1', url: 'https://example.com/a.jpg', alt_text: 'A' },
          { id: 'i2', url: 'https://example.com/b.jpg', alt_text: 'B' },
          { id: 'i3', url: 'https://example.com/c.jpg', alt_text: 'C' }
        ]
      }
    };
    const result = filterProposal(
      { kind: 'replace_block', block_id: 'g1', block },
      new Set(['gallery:i1'])
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail');
    expect(result.message).toMatch(/2/);
  });

  it('fails flashcards with zero cards', () => {
    const block: Block = {
      ...base,
      id: 'f1',
      block_type: 'flashcards',
      content: {
        cards: [
          { id: 'c1', front: 'A', back: 'a' },
          { id: 'c2', front: 'B', back: 'b' }
        ]
      }
    };
    const result = filterProposal({ kind: 'replace_block', block_id: 'f1', block }, new Set());
    expect(result.ok).toBe(false);
  });

  it('fails when nothing remains to apply', () => {
    const result = filterProposal(
      {
        kind: 'insert_blocks',
        position: 'below',
        blocks: [heading('h1', 'A'), heading('h2', 'B')]
      },
      new Set()
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail');
    expect(result.message).toMatch(/at least one/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/partial-accept.test.ts`

Expected: FAIL — `filterProposal` is not a function / not exported

- [ ] **Step 3: Implement `filterProposal`**

Return type: `{ ok: true; proposal: AiProposal } | { ok: false; message: string }`.

After mutating, parse kept collection blocks with `BlockSchema.safeParse`. Use parse error message or a short min message (`Keep at least 2 gallery images`).

If a parent `block:i` is unchecked, drop the whole block (ignore nested item keys). If parent is checked, filter nested items by selected keys.

`replace_section`: always keep the section; filter `content.blocks` by `child:i`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/partial-accept.test.ts`

Expected: PASS

---

### Task 3: Proposal card checklist

**Files:**
- Modify: `tests/unit/ai-panel.test.ts`
- Modify: `src/teacher/ai-panel.ts`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Write the failing tests** (append to `ai-panel.test.ts`)

Helper: stream a two-block `insert_blocks` proposal.

```ts
it('shows Accept selected and checkboxes for a multi-block insert', async () => {
  const insert: AiProposal = {
    kind: 'insert_blocks',
    position: 'below',
    anchor_block_id: 'a',
    blocks: [
      { ... /* heading A */ },
      { ... /* heading B */ }
    ]
  };
  streamAiChatMock.mockImplementation(async (_payload, onEvent) => {
    onEvent({ type: 'proposal', proposal: insert });
  });
  const mounted = mountPanel();
  handle = mounted.handle;
  submitMessage(mounted.host, 'Add two headings');
  await vi.waitFor(() => {
    expect(mounted.host.querySelectorAll('.ai-panel__proposal-check').length).toBe(2);
  });
  expect([...mounted.host.querySelectorAll('button')].some((b) => b.textContent === 'Accept selected')).toBe(true);
  expect(acceptButton(mounted.host)).toBeUndefined();
});

it('Accept selected applies only checked insert blocks', async () => {
  // same insert proposal; uncheck the second checkbox; click Accept selected
  // expect onAcceptProposal called with blocks length 1, first heading only
});

it('keeps Accept (not Accept selected) for replace_lesson with only a title', async () => {
  // existing replaceLesson fixture { title, blocks: [] } has one unit
  // existing accept test already covers this; add assertion:
  expect(mounted.host.querySelector('.ai-panel__proposal-check')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ai-panel.test.ts`

Expected: FAIL — no `.ai-panel__proposal-check`

- [ ] **Step 3: Wire the panel**

On `ChatMessage` add `selectedKeys?: string[]`.

When rendering a pending mutating proposal:

```
const units = listPartialAcceptUnits(msg.proposal);
if (units.length >= 2) {
  if (!msg.selectedKeys) msg.selectedKeys = units.map(u => u.key);
  render fieldset of checkboxes; change → update selectedKeys, toggle Accept selected disabled if none checked
  primary button: Accept selected → filterProposal then existing acceptProposal(msg, filtered)
}
```

Refactor `acceptProposal(msg)` to `acceptProposal(msg, proposal = msg.proposal)` so stale-snapshot confirm still wraps the filtered apply.

On filter `{ ok: false }`, keep status pending, show `message` in `.ai-panel__proposal-error`.

CSS:

```css
.ai-panel__proposal-list {
  margin: 0 0 var(--space-2);
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.25rem;
}
.ai-panel__proposal-check {
  display: flex;
  gap: var(--space-1);
  align-items: flex-start;
  font-family: var(--font-ui);
  font-size: var(--text-xs);
}
.ai-panel__proposal-check--nested {
  padding-left: var(--space-3);
}
.ai-panel__proposal-error {
  margin: 0 0 var(--space-1);
  color: var(--danger, #8b1e2d);
  font-size: var(--text-xs);
}
```

Use `group` on units to indent nested item checkboxes.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/ai-panel.test.ts tests/unit/partial-accept.test.ts`

Expected: PASS

- [ ] **Step 5: Also keep the existing Accept click test green** (title-only `replace_lesson`).

---

### Task 4: Verification

- [ ] **Step 1:** `npx vitest run tests/unit/partial-accept.test.ts tests/unit/ai-panel.test.ts`
- [ ] **Step 2:** Grep that `propose_partial` / new tool names do not exist
- [ ] **Step 3:** Confirm `apply-proposal.ts` and `proposals.ts` are unmodified for this slice

---

## Spec coverage

| Spec | Task |
|------|------|
| Question keep 1,2,5 | 2 |
| Insert dump middle | 2, 3 |
| replace_lesson uncheck title | 2 |
| delete subset | 2 |
| Gallery min 2 / flashcards min 1 | 2 |
| reorder / single rich_text no checklist | 1, 3 |
| Accept selected UI | 3 |
| All-checked equals full proposal | 2 (identity when all keys selected) — add one assertion in Task 2 if missing |
| Stale confirm uses filtered proposal | 3 (reuse `acceptProposal` wrapper) |
