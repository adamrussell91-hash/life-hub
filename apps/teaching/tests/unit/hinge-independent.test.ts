import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { independentFeedback, paceOf, tierOf, type HingeBlock } from '@/blocks/hinge-question/shared';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { apiPost } from '@/api/client';

vi.mock('@/api/client', async (real) => ({ ...(await real<typeof import('@/api/client')>()), apiPost: vi.fn() }));
const flush = () => new Promise((r) => setTimeout(r, 0));

const finished = (pace?: 'live' | 'independent'): HingeBlock => {
  const block = createBlock('hinge_question', 'hq1') as HingeBlock;
  const options = block.content.options.map((o, i) => ({ ...o, text: ['Gravity', 'Its own speed', 'Magnetism', 'Nothing'][i]! }));
  return { ...block, content: { ...block.content, prompt: 'Which force keeps the Moon in orbit?', options, correct_id: options[0]!.id, ...(pace ? { pace } : {}) } };
};

beforeEach(() => {
  vi.mocked(apiPost).mockReset();
  localStorage.clear();
});

describe('Hinge question: independent mode', () => {
  it('a block with no pace is live, and tiers are optional', () => {
    const parsed = BlockSchema.parse(createBlock('hinge_question', 'hq1'));
    if (parsed.block_type !== 'hinge_question') throw new Error('Expected hinge_question');
    expect(parsed.content.pace).toBeUndefined();
    expect(paceOf(parsed.content)).toBe('live');
    expect(parsed.content.options.every((o) => o.tier === undefined)).toBe(true);
    const block = finished('independent');
    const withTier = { ...block, content: { ...block.content, options: block.content.options.map((o, i) => (i === 1 ? { ...o, tier: 'close' as const } : o)) } };
    const again = BlockSchema.parse(withTier);
    if (again.block_type !== 'hinge_question') throw new Error('Expected hinge_question');
    expect(paceOf(again.content)).toBe('independent');
    expect(again.content.options[1]!.tier).toBe('close');
    expect(() => BlockSchema.parse({ ...block, content: { ...block.content, pace: 'fast' } })).toThrow();
  });

  it('tiers default from the right answer', () => {
    expect(tierOf({ id: 'a' }, 'a')).toBe('right');
    expect(tierOf({ id: 'b' }, 'a')).toBe('mixup');
    expect(tierOf({ id: 'b', tier: 'close' }, 'a')).toBe('close');
    expect(tierOf({ id: 'b', tier: 'right' }, 'a')).toBe('mixup');
  });

  it('publish strips tiers but keeps the pace', () => {
    const block = finished('independent');
    const tiered = { ...block, content: { ...block.content, options: block.content.options.map((o) => ({ ...o, tier: 'close' as const })) } };
    const [student] = filterBlocksForStudent([tiered]) as HingeBlock[];
    expect(student!.content.pace).toBe('independent');
    expect(JSON.stringify(student)).not.toContain('tier');
    expect(JSON.stringify(student)).not.toContain('correct_id');
  });

  it('feedback follows how sure the student was and how near their answer was', () => {
    expect(independentFeedback('right', true).title).toBe('Locked in.');
    expect(independentFeedback('right', null).title).toBe('Locked in.');
    expect(independentFeedback('right', false).title).toBe('You know more than you think.');
    const sneaky = independentFeedback('mixup', true, 'Every pull is magnetic.');
    expect(sneaky.title).toBe('This one’s sneaky — it’s a common mix-up.');
    expect(sneaky.body).toBe('Every pull is magnetic.');
    const flagged = independentFeedback('mixup', false, 'Every pull is magnetic.');
    expect(flagged.title).toBe('Good call flagging it.');
    expect(flagged.body).toBe('Every pull is magnetic.');
    const close = independentFeedback('close', true, 'Speed alone doesn’t curve a path.');
    expect(close).toMatchObject({ tone: 'close', title: 'Nearly — look again.', body: 'Speed alone doesn’t curve a path.' });
    expect(independentFeedback('mixup', null).body).not.toBe('');
    // Never a comparison with the class.
    for (const tier of ['right', 'close', 'mixup'] as const) {
      for (const sure of [true, false, null]) {
        const f = independentFeedback(tier, sure, 'note');
        expect(`${f.title} ${f.body}`).not.toMatch(/class|others|everyone|most students|%/i);
      }
    }
  });

  it('the editor toggles pace and shows a tier per answer only in independent mode', () => {
    const changed = vi.fn();
    const editor = createBlockEditor(finished(), changed);
    const main = editor.querySelector<HTMLFieldSetElement>('.hq-editor__options')!;
    expect(main.querySelectorAll('.hq-editor__tier')).toHaveLength(0);
    const independent = [...editor.querySelectorAll<HTMLButtonElement>('.hq-editor__pace button')].find((b) => b.dataset.value === 'independent')!;
    independent.click();
    expect(changed.mock.calls.at(-1)![0].content.pace).toBe('independent');
    expect(independent.getAttribute('aria-pressed')).toBe('true');
    const tiers = [...main.querySelectorAll<HTMLSelectElement>('.hq-editor__tier')];
    expect(tiers).toHaveLength(4);
    expect(tiers.map((t) => t.value)).toEqual(['right', 'mixup', 'mixup', 'mixup']);
    tiers[1]!.value = 'close';
    tiers[1]!.dispatchEvent(new Event('change'));
    let content = changed.mock.calls.at(-1)![0].content;
    expect(content.options[1].tier).toBe('close');
    // Choosing Right moves the right answer.
    const again = [...main.querySelectorAll<HTMLSelectElement>('.hq-editor__tier')];
    again[2]!.value = 'right';
    again[2]!.dispatchEvent(new Event('change'));
    content = changed.mock.calls.at(-1)![0].content;
    expect(content.correct_id).toBe(content.options[2].id);
    expect(BlockSchema.parse({ ...finished(), content }).block_type).toBe('hinge_question');
    // Timer and thresholds are for live rounds only.
    expect(editor.querySelector<HTMLElement>('.hq-editor__thresholds')!.hidden).toBe(true);
  });

  it('a student picks, says why, says how sure, and sees only their own feedback', async () => {
    const block = finished('independent');
    const [published] = filterBlocksForStudent([block]) as HingeBlock[];
    vi.mocked(apiPost).mockResolvedValueOnce({ phase: 'independent', first: null, retry: null, done: false });
    const shown = renderBlock(published!, 'student', { lessonId: 'L1' });
    document.body.append(shown);
    await flush();
    const check = [...shown.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Check my answer')!;
    expect(check.disabled).toBe(true);
    shown.querySelectorAll<HTMLButtonElement>('.hq-choice')[1]!.click();
    expect(check.disabled).toBe(true);
    const reason = shown.querySelector<HTMLTextAreaElement>('.hq-ind__reason')!;
    expect(reason.maxLength).toBe(280);
    reason.value = 'It moves too fast to fall';
    reason.dispatchEvent(new Event('input'));
    expect(check.disabled).toBe(false);
    [...shown.querySelectorAll<HTMLButtonElement>('.hq-chip')].find((b) => b.textContent === 'Sure')!.click();

    vi.mocked(apiPost).mockResolvedValueOnce({
      phase: 'independent',
      first: { pick: block.content.options[1]!.id, sure: true, tier: 'close', note: 'Speed alone doesn’t curve a path.' },
      retry: { prompt: 'Which force keeps a satellite circling the Earth?', options: [{ id: 'k0', text: 'Gravity' }, { id: 'k1', text: 'Its engines' }], answer: null },
      done: false
    });
    check.click();
    await flush();
    expect(vi.mocked(apiPost).mock.calls.at(-1)![1]).toMatchObject({ action: 'independent_answer', pick: block.content.options[1]!.id, reason: 'It moves too fast to fall', sure: true });
    expect(shown.textContent).toContain('Nearly — look again.');
    expect(shown.textContent).toContain('Speed alone doesn’t curve a path.');
    // No right answer marked before the retry is done.
    expect(shown.querySelector('[data-right="true"]')).toBeNull();
    expect(shown.textContent).toContain('Which force keeps a satellite circling the Earth?');
    expect([...shown.querySelectorAll('button')].some((b) => b.textContent === 'Move on without it')).toBe(true);

    vi.mocked(apiPost).mockResolvedValueOnce({
      phase: 'independent',
      first: { pick: block.content.options[1]!.id, sure: true, tier: 'close', note: 'Speed alone doesn’t curve a path.' },
      retry: { prompt: 'Which force keeps a satellite circling the Earth?', options: [{ id: 'k0', text: 'Gravity' }, { id: 'k1', text: 'Its engines' }], answer: { pick: 'k0', sure: false, tier: 'right', note: '' }, correct_id: 'k0' },
      done: true,
      correct_id: block.content.options[0]!.id
    });
    const retry = shown.querySelector<HTMLElement>('.hq-ind__retry')!;
    retry.querySelectorAll<HTMLButtonElement>('.hq-choice')[0]!.click();
    const why = retry.querySelector<HTMLTextAreaElement>('.hq-ind__reason')!;
    why.value = 'Gravity pulls it round';
    why.dispatchEvent(new Event('input'));
    [...retry.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Check this one')!.click();
    await flush();
    expect(vi.mocked(apiPost).mock.calls.at(-1)![1]).toMatchObject({ action: 'independent_retry', pick: 'k0', sure: null });
    expect(shown.textContent).toContain('You know more than you think.');
    expect(shown.querySelectorAll('[data-right="true"]')).toHaveLength(2);
    expect(shown.textContent).toContain('All done.');
    shown.remove();
  });

  it('a live block still runs as a live round for students', async () => {
    vi.mocked(apiPost).mockResolvedValue({ phase: 'idle' });
    const shown = renderBlock(finished(), 'student', { lessonId: 'L2' });
    document.body.append(shown);
    await flush();
    expect(vi.mocked(apiPost).mock.calls[0]![1]).toMatchObject({ action: 'status' });
    expect(shown.textContent).toContain('Waiting for your teacher');
    shown.remove();
  });

  it('the teacher panel shows tallies, sure and wrong, still stuck and reasons, with no round controls', async () => {
    const block = finished('independent');
    const options = block.content.options.map((o, i) => ({ id: o.id, text: o.text, tier: (['right', 'close', 'mixup', 'mixup'] as const)[i]! }));
    vi.mocked(apiPost).mockResolvedValue({
      phase: 'independent', stale: false, ready: true, prompt: block.content.prompt, options, correct_id: options[0]!.id,
      backup: { prompt: 'Back-up', options: [{ id: 'k0', text: 'Gravity', tier: 'right' }, { id: 'k1', text: 'Engines', tier: 'mixup' }], correct_id: 'k0' },
      answered: 2, tiers: { right: 1, close: 0, mixup: 1 }, sure_wrong: 1, retry: { tried: 1, right: 0 }, stuck: ['abc123'],
      responses: [
        { id: 'abc123', first: { pick: options[2]!.id, reason: 'Magnets pull things', sure: true, tier: 'mixup', flagged: false }, retry: { pick: 'k1', reason: 'Engines push it', sure: null, tier: 'mixup', flagged: false }, stuck: true, done: true, at: '2026-11-03T00:00:00Z' },
        { id: 'def456', first: { pick: options[0]!.id, reason: 'held text', sure: false, tier: 'right', flagged: true }, retry: null, stuck: false, done: true, at: '2026-11-03T00:01:00Z' }
      ]
    });
    const shown = renderBlock(block, 'teacher', { lessonId: 'L3' });
    document.body.append(shown);
    await flush();
    expect(vi.mocked(apiPost).mock.calls[0]![1]).toEqual({ action: 'independent' });
    expect(shown.textContent).not.toContain('Ask the class');
    expect(shown.textContent).toContain('Sure and wrong');
    expect(shown.textContent).toContain('Still stuck');
    expect(shown.textContent).toContain('Device abc123');
    expect(shown.textContent).toContain('Magnets pull things');
    expect(shown.textContent).toContain('Engines push it');
    expect(shown.textContent).not.toContain('held text');
    expect(shown.textContent).toContain('Held by the word check.');
    shown.remove();

    // The class can see the Display view: a count only.
    const display = renderBlock(block, 'teacher', { lessonId: 'L4', display: true });
    document.body.append(display);
    await flush();
    expect(display.textContent).toContain('2 students have answered');
    expect(display.textContent).not.toContain('Magnets pull things');
    display.remove();
  });
});
