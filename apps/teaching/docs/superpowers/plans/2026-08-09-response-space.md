# Response Space Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional `response_space` on `question_set` short-answer questions (schema + create defaults + builder control); no student render change.

**Architecture:** Extend `QuestionItemSchema` with optional enum; default `medium` on create/add short answer; strip when kind is MC; editor select only for short answer. Student/publish render untouched.

**Tech Stack:** TypeScript, Zod, Vitest (happy-dom)

**Spec:** `docs/superpowers/specs/2026-08-09-response-space-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/block.ts` | `ResponseSpaceSchema`; extend `QuestionItemSchema` |
| `src/blocks/create-block.ts` | Default short-answer includes `response_space: 'medium'` |
| `src/blocks/editors.ts` | Response space select in `createQuestionSetEditor` |
| `tests/unit/response-space.test.ts` | Schema + create + editor emit |
| `docs/BUILD.md` | History / Next up / projection |

---

### Task 1: Schema + createBlock

**Files:**
- Modify: `src/schemas/block.ts`
- Modify: `src/blocks/create-block.ts`
- Create: `tests/unit/response-space.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { BlockSchema, QuestionItemSchema, ResponseSpaceSchema } from '@/schemas/block';
import { createBlock } from '@/blocks/create-block';

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

describe('response_space schema', () => {
  it('accepts all enum values on short_answer', () => {
    for (const response_space of ResponseSpaceSchema.options) {
      expect(
        QuestionItemSchema.parse({
          id: 'q1',
          prompt: 'Explain',
          kind: 'short_answer',
          response_space
        }).response_space
      ).toBe(response_space);
    }
  });

  it('accepts short_answer without response_space (legacy)', () => {
    expect(
      QuestionItemSchema.parse({
        id: 'q1',
        prompt: 'Explain',
        kind: 'short_answer'
      }).response_space
    ).toBeUndefined();
  });

  it('parses question_set with response_space', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'question_set',
      content: {
        questions: [
          {
            id: 'q_a',
            prompt: 'What stands out?',
            kind: 'short_answer',
            response_space: 'long'
          }
        ]
      }
    });
    expect(block.block_type).toBe('question_set');
    if (block.block_type === 'question_set') {
      expect(block.content.questions[0]?.response_space).toBe('long');
    }
  });
});

describe('response_space create defaults', () => {
  it('createBlock question_set defaults short answer to medium', () => {
    const block = createBlock('question_set');
    expect(block.block_type).toBe('question_set');
    if (block.block_type === 'question_set') {
      expect(block.content.questions[0]?.kind).toBe('short_answer');
      expect(block.content.questions[0]?.response_space).toBe('medium');
    }
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/response-space.test.ts
```

- [ ] **Step 3: Implement schema + create defaults**

In `src/schemas/block.ts` near `QuestionKindSchema`:

```ts
export const ResponseSpaceSchema = z.enum([
  'none',
  'short',
  'medium',
  'long',
  'extended'
]);
export type ResponseSpace = z.infer<typeof ResponseSpaceSchema>;
```

Extend `QuestionItemSchema`:

```ts
export const QuestionItemSchema = z.object({
  id: z.string().min(1),
  prompt: z.string(),
  kind: QuestionKindSchema,
  options: z.array(z.string()).optional(),
  response_space: ResponseSpaceSchema.optional()
});
```

In `create-block.ts` default question:

```ts
questions: [{ id: `${id}_q1`, prompt: '', kind: 'short_answer', response_space: 'medium' }]
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run tests/unit/response-space.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/schemas/block.ts src/blocks/create-block.ts tests/unit/response-space.test.ts
git commit -m "$(cat <<'EOF'
feat: add response_space to question_set schema

Optional enum on short-answer questions; create defaults to medium.
EOF
)"
```

---

### Task 2: Builder editor

**Files:**
- Modify: `src/blocks/editors.ts` (`createQuestionSetEditor`)
- Modify: `tests/unit/response-space.test.ts`

- [ ] **Step 1: Write failing editor test**

```ts
import { createQuestionSetEditor } from '@/blocks/editors';
import type { Block } from '@/schemas/block';

describe('response_space editor', () => {
  it('emits response_space for short answer and strips on MC', () => {
    const block = createBlock('question_set') as Extract<Block, { block_type: 'question_set' }>;
    let latest = block;
    const root = createQuestionSetEditor(block, (next) => {
      latest = next;
    }, () => latest);

    const space = root.querySelector('.block-editor__question-response-space') as HTMLSelectElement;
    expect(space).toBeTruthy();
    expect(space.value).toBe('medium');
    space.value = 'extended';
    space.dispatchEvent(new Event('change'));
    expect(latest.content.questions[0]?.response_space).toBe('extended');

    const kind = root.querySelector('.block-editor__question-kind') as HTMLSelectElement;
    kind.value = 'multiple_choice';
    kind.dispatchEvent(new Event('change'));
    expect(latest.content.questions[0]?.response_space).toBeUndefined();
    expect(
      (root.querySelector('.block-editor__question-response-space') as HTMLSelectElement | null)?.hidden
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run tests/unit/response-space.test.ts
```

- [ ] **Step 3: Implement editor**

In `createQuestionSetEditor`:

1. Include `response_space` in local `questions` map (default UI `medium` when short answer and missing).
2. In `emitChange`, for each question:
   - short_answer → include `response_space` (from local state)
   - multiple_choice → omit `response_space`
3. Add `<select class="block-editor__question-response-space">` with options None/Short/Medium/Long/Extended; `hidden` when MC.
4. On kind change to short → set `response_space: 'medium'`; to MC → clear it and hide select.
5. New / fallback questions include `response_space: 'medium'`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run tests/unit/response-space.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/blocks/editors.ts tests/unit/response-space.test.ts
git commit -m "$(cat <<'EOF'
feat: add response space control to question set editor

Teachers set answer length intent on short-answer questions.
EOF
)"
```

---

### Task 3: BUILD.md + verification

**Files:**
- Modify: `docs/BUILD.md`

- [ ] **Step 1: Update BUILD.md**

- History row for Response space (link design + plan)
- Next up → Map / slides / document viewer (or note larger tracks)
- Tick Learning activities Response space
- Phase 5 line: Response space done
- Latest note

- [ ] **Step 2: Full unit suite**

```bash
npm run test:unit
```

Expected: pass

- [ ] **Step 3: Commit**

```bash
git add docs/BUILD.md docs/superpowers/plans/2026-08-09-response-space.md
git commit -m "$(cat <<'EOF'
docs: mark response space shipped in BUILD roadmap
EOF
)"
```

---

## Done when

- Short-answer questions can store `response_space`; editor exposes the control  
- MC never persists the field  
- Student render unchanged  
- Tests green; BUILD.md updated  
