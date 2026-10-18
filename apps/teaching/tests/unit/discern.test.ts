import { describe, expect, it, vi } from 'vitest';

vi.mock('@/api/client', () => ({ apiPost: vi.fn(() => Promise.resolve({})), apiGet: vi.fn(() => Promise.resolve({ tails: [] })) }));
const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => { memory.set(k, v); },
  removeItem: (k: string) => { memory.delete(k); }
});
import { BlockSchema, type Block } from '@/schemas/block';
import { DiscernQualifierSchema } from '@/schemas/discern';
import {
  canHaveDiscern, characterMoments, classifyTail, createDiscernConfirmBlock, discernOptions, discernSteps,
  findDiscernConfirm, insertDiscernConfirm, removeDiscernConfirms, suggestDiscernInitial, withDiscern, withoutDiscern
} from '@/blocks/discern';
import { listPublishBlockIssues } from '@/schemas/publish-block-issues';
import { renderBlock } from '@/blocks/render';

const stamp = '2026-10-18T00:00:00.000Z';
const question = (id: string, prompt = 'How much do you agree with SWW that there is hope for reconciliation?'): Block => BlockSchema.parse({
  id, type: 'block', block_type: 'question_set', variant: 'medium', visibility: 'student_teacher',
  created_at: stamp, updated_at: stamp, schema_version: 1,
  content: { title: '', questions: [{ id: `${id}_q`, kind: 'short_answer', response_space: 'medium', prompt }] }
});
const discern = (extra = {}) => DiscernQualifierSchema.parse({ focus: 'hope for reconciliation', source: 'the poems', ...extra });

describe('Discern setup', () => {
  it('suggests the initial answer type from the question wording', () => {
    expect(suggestDiscernInitial('How much do you agree with SWW?', 'own')).toEqual({ type: 'scale', preset: 'agree' });
    expect(suggestDiscernInitial('To what extent was the Treaty responsible?', 'own')).toEqual({ type: 'scale', preset: 'extent' });
    expect(suggestDiscernInitial('Which technique best conveys isolation?', 'own').type).toBe('choose');
    expect(suggestDiscernInitial('Explain how grief is represented.', 'own').type).toBe('write');
    expect(suggestDiscernInitial('Anything', 'theirs')).toEqual({ type: 'scale', preset: 'verdict' });
  });

  it('fills prompts from focus and source, and teacher overrides win', () => {
    const steps = discernSteps(discern());
    expect(steps.map((s) => s.name)).toEqual(['Initial', 'Against', 'For', 'Step back', 'Confirm']);
    expect(steps[1]!.prompt).toContain('hope for reconciliation');
    expect(steps[1]!.prompt).toContain('one moment from the poems');
    const custom = discernSteps(discern({ prompts: ['', 'My own against prompt', '', '', ''] }));
    expect(custom[1]!.prompt).toBe('My own against prompt');
    expect(custom[2]!.prompt).toBe(steps[2]!.prompt);
  });

  it('flips the wording for someone else’s choice', () => {
    const steps = discernSteps(discern({ mode: 'theirs', who: 'Macbeth', focus: 'killing Duncan' }));
    expect(steps[0]!.jot).toBe('What was pulling Macbeth?');
    expect(steps[4]!.prompt).toContain('how you feel about Macbeth');
  });

  it('gives scale points with fallbacks, choices without blanks, and nothing for write', () => {
    expect(discernOptions(discern())).toEqual(['Disagree', 'Partly agree', 'Mostly agree', 'Fully agree']);
    expect(discernOptions(discern({ initial: { type: 'scale', preset: 'agree', options: ['No', '', '', ''] } }))[0]).toBe('No');
    expect(discernOptions(discern({ initial: { type: 'choose', options: ['Imagery', ' ', 'Voice'] } }))).toEqual(['Imagery', 'Voice']);
    expect(discernOptions(discern({ initial: { type: 'write' } }))).toEqual([]);
  });

  it('only offers the character’s own tail in their-choice mode with two moments or more', () => {
    const on = { enabled: true, moments: ['Act 1', 'Dagger', ''] };
    expect(characterMoments(discern({ mode: 'theirs', who: 'Macbeth', character_tail: on }))).toEqual(['Act 1', 'Dagger']);
    expect(characterMoments(discern({ mode: 'own', character_tail: on }))).toEqual([]);
    expect(characterMoments(discern({ mode: 'theirs', character_tail: { enabled: true, moments: ['Act 1'] } }))).toEqual([]);
  });
});

describe('Reading a tail', () => {
  it('names the six shapes', () => {
    expect(classifyTail([4, 2, 3, 4, 5])).toBe('tested');
    expect(classifyTail([4, 1, 2, 2, 2])).toBe('stuck');
    expect(classifyTail([2, 3, 3, 4, 5])).toBe('rose');
    expect(classifyTail([5, 4, 4, 3, 2])).toBe('fell');
    expect(classifyTail([3, 3, 4, 3, 3])).toBe('flat');
  });
});

describe('Attaching and the Confirm card', () => {
  it('goes on the same blocks as Kaplan, never on a Confirm card', () => {
    expect(canHaveDiscern(question('q1'))).toBe(true);
    expect(canHaveDiscern(createDiscernConfirmBlock('c1', 'q1'))).toBe(false);
  });

  it('keeps Kaplan qualifiers when Discern is added and removed', () => {
    const withKaplan = { ...question('q1'), qualifiers: [{ lens: 'ethics' as const, focus: '', mode: 'notes' as const }] };
    const both = withDiscern(withKaplan, discern());
    expect(BlockSchema.parse(both).discern?.focus).toBe('hope for reconciliation');
    const back = withoutDiscern(both);
    expect(back.discern).toBeUndefined();
    expect(back.qualifiers).toHaveLength(1);
  });

  it('places the Confirm card straight after its block, nested or not, and removes it', () => {
    const section = BlockSchema.parse({
      id: 's1', type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher',
      created_at: stamp, updated_at: stamp, schema_version: 1,
      content: { title: 'Part 1', blocks: [question('q2'), question('q3')] }
    });
    const page = [question('q1'), section];
    const flat = insertDiscernConfirm(page, 'q1', createDiscernConfirmBlock('c1', 'q1', stamp));
    expect(flat.map((b) => b.id)).toEqual(['q1', 'c1', 's1']);
    const nested = insertDiscernConfirm(page, 'q2', createDiscernConfirmBlock('c2', 'q2', stamp));
    const inner = (nested[1] as Extract<Block, { block_type: 'section' }>).content.blocks.map((b) => b.id);
    expect(inner).toEqual(['q2', 'c2', 'q3']);
    expect(BlockSchema.parse(nested[1]).id).toBe('s1');
    expect(findDiscernConfirm(nested, 'q2')?.id).toBe('c2');
    expect(findDiscernConfirm(removeDiscernConfirms(nested, 'q2'), 'q2')).toBeNull();
  });

  it('flags an orphan Confirm card and a Choose setup without options before publishing', () => {
    const orphan = listPublishBlockIssues([createDiscernConfirmBlock('c1', 'gone', stamp)]);
    expect(orphan[0]?.message).toMatch(/not linked/);
    const choose = withDiscern(question('q1'), discern({ initial: { type: 'choose', options: ['Only one'] } }));
    expect(listPublishBlockIssues([choose])[0]?.message).toMatch(/two initial answer options/);
    const fine = withDiscern(question('q1'), discern());
    expect(listPublishBlockIssues([fine, createDiscernConfirmBlock('c1', 'q1', stamp)])).toEqual([]);
  });
});

describe('Rendering', () => {
  it('shows the student chip, and walks the four steps to a tail', () => {
    const host = withDiscern(question('q1'), discern());
    const el = renderBlock(host, 'student', { lessonId: 'lesson_t', pageBlocks: [host] });
    document.body.append(el);
    const chip = el.querySelector<HTMLButtonElement>('.discern-chip')!;
    expect(chip.textContent).toContain('Discern · 4 steps');
    chip.click();
    el.querySelector<HTMLButtonElement>('.discern-position')!.click();
    for (let i = 0; i < 4; i++) {
      const input = el.querySelector<HTMLInputElement>('.discern-field input')!;
      input.value = `note ${i}`;
      input.dispatchEvent(new Event('input'));
      el.querySelectorAll<HTMLButtonElement>('.discern-scale__dot')[2]!.click();
      el.querySelector<HTMLButtonElement>('.discern-actions .btn--secondary')!.click();
    }
    expect(el.querySelector('.discern-tail')).not.toBeNull();
    expect(el.querySelectorAll('.discern-tail__dot:not(.is-ghost)')).toHaveLength(4);
    expect(el.textContent).toContain('Copy this into your book');
    el.remove();
  });

  it('opens the Confirm card from the saved steps and reads the shape', () => {
    const host = withDiscern(question('q9'), discern());
    const confirm = createDiscernConfirmBlock('c9', 'q9', stamp);
    localStorage.setItem('teaching-hub.activity.lesson_c.q9.discern', JSON.stringify({
      step: 3, position: 'Mostly agree', notes: ['Hopeful endings', 'Anger', 'Final image', 'Fragile', ''], dots: [4, 2, 3, 4, 0], drawn: true
    }));
    const el = renderBlock(confirm, 'student', { lessonId: 'lesson_c', pageBlocks: [host, confirm] });
    document.body.append(el);
    expect(el.textContent).toContain('You started at Mostly agree');
    const input = el.querySelector<HTMLInputElement>('.discern-field input')!;
    input.value = 'Earned';
    input.dispatchEvent(new Event('input'));
    el.querySelectorAll<HTMLButtonElement>('.discern-scale__dot')[4]!.click();
    el.querySelector<HTMLButtonElement>('.discern-actions .btn--secondary')!.click();
    expect(el.textContent).toContain('Reading your tail: Tested, came back');
    el.remove();
  });
});
