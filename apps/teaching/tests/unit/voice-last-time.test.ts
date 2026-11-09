import { describe, expect, it, vi } from 'vitest';
import { goalTick, vivaDoThis, vivaStep, voiceStartLoader, type VivaHistory } from '@/blocks/voice-last-time';
import type { FeedbackCode } from '@/blocks/feedback-codes';

const code = (id: string, label: string): FeedbackCode => ({ id, code: id.toUpperCase(), label, group: 'viva', criterion: null, colour: 'peach', descriptor: `${label}: say what it does to the reader.` });

const history = (over: Partial<VivaHistory> = {}): VivaHistory => ({
  count: 4,
  last: { lesson_id: 'l4', title: 'The opening image', date: '30 Oct', comment: 'Push to the effect.', next_step: null, tags: [{ code_id: 'ar', positive: false }, { code_id: 'ev', positive: true }] },
  pattern: [
    { code_id: 'ar', marks: ['need', 'need', 'need', 'need'] },
    { code_id: 'fw', marks: ['need', 'need', null, null] },
    { code_id: 'ev', marks: [null, 'strength', 'strength', 'strength'] }
  ],
  codes: [code('ar', 'Analysis – relevance'), code('fw', 'Filler words'), code('ev', 'Evidence')],
  ...over
});

describe('the viva Do this', () => {
  it('the code flagged last time and in most recent vivas, with how often', () => {
    const step = vivaStep(history(), '/r')!;
    expect(step).toMatchObject({ code_id: 'ar', code: 'AR', line: 'Analysis – relevance: say what it does to the reader.', why: { kind: 'do', hits: 4, of: 4, unit: 'viva', href: '/r' } });
  });

  it('the teacher’s own next step comes first, with no chip', () => {
    const chosen = history({ last: { ...history().last!, next_step: 'Name the effect.' } });
    const box = vivaDoThis(chosen, 'c1')!;
    expect(box.querySelector('.ns-line__text')!.textContent).toBe('Name the effect.');
    expect(box.querySelector('.ns-line__why')!.textContent).toBe('Your teacher’s next step from your last viva · See last time');
    expect(box.querySelector('.pg-code')).toBeNull();
  });

  it('renders as the same bold box as a writing box, saying vivas', () => {
    const box = vivaDoThis(history(), 'c1')!;
    expect(box.classList.contains('ns-line')).toBe(true);
    expect(box.querySelector('.ns-line__label')!.textContent).toBe('Do this');
    expect(box.querySelector('.ns-line__why')!.textContent).toBe('AR flagged in your last 4 vivas · See last time');
    expect(box.querySelector('a')!.getAttribute('href')).toBe('/s/classes/c1/profile?tab=returned');
  });

  it('nothing flagged last time and a code gone from the last two: keep doing this', () => {
    const clean = history({ last: { ...history().last!, tags: [{ code_id: 'ev', positive: true }] }, pattern: [{ code_id: 'fw', marks: ['need', 'need', null, null] }] });
    const step = vivaStep(clean)!;
    expect(step).toMatchObject({ code_id: 'fw', why: { kind: 'keep', hits: 2 } });
    expect(vivaDoThis(clean, 'c1')!.classList.contains('ns-line--keep')).toBe(true);
  });

  it('no viva back, or nothing to say, gives no line', () => {
    expect(vivaStep(null)).toBeNull();
    expect(vivaStep(history({ last: null }))).toBeNull();
    const one = history({ last: { ...history().last!, tags: [] }, pattern: [{ code_id: 'ar', marks: [null] }] });
    expect(vivaStep(one)).toBeNull();
  });
});

describe('the goal tick', () => {
  it('reports ticks', () => {
    const onChange = vi.fn();
    const tick = document.body.appendChild(goalTick('say what it does', false, onChange, 'b1'));
    const box = tick.querySelector('input')!;
    box.click();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(tick.textContent).toContain('This time I’ll work on: say what it does');
  });
});

describe('the start loader', () => {
  it('asks once for speaking rows and vivas, and keeps vivas only when there is one back', async () => {
    const call = vi.fn(async () => ({ need: null, skills: [], vivas: history() }));
    const got = await voiceStartLoader('c1', 'l9', { speaking: true, vivas: true }, call);
    expect(call).toHaveBeenCalledWith('c1', { action: 'skills', strand: 'speaking', vivas: true, lesson_id: 'l9' });
    expect(got.vivas?.last?.lesson_id).toBe('l4');
    const empty = await voiceStartLoader('c1', 'l9', { speaking: false, vivas: true }, async () => ({ need: null, vivas: { count: 0, last: null, pattern: [] } }));
    expect(empty.vivas).toBeNull();
    expect((await voiceStartLoader('c1', 'l9', { speaking: false, vivas: false })).vivas).toBeNull();
  });
});
