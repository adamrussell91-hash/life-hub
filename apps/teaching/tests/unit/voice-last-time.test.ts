import { beforeEach, describe, expect, it, vi } from 'vitest';
import { goalTick, lastFocus, lastTimeCard, trendFor, voiceStartLoader, type VivaHistory } from '@/blocks/voice-last-time';
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

beforeEach(() => localStorage.clear());

describe('trend words', () => {
  it('says how each code has gone, oldest to newest', () => {
    expect(trendFor(['need', 'need', 'need', 'need'])).toBe('every time');
    expect(trendFor(['need', 'need', null, null])).toBe('gone the last 2');
    expect(trendFor(['need', 'need', 'need', null])).toBe('not last time');
    expect(trendFor([null, 'strength', 'strength', 'strength'])).toBe('a strength');
    expect(trendFor([null, null, null, 'need'])).toBe('new last time');
    expect(trendFor(['need', null, 'need', 'need'])).toBe('3 of 4');
    expect(trendFor([null, 'strength', 'need', 'strength'])).toBe('a strength last time');
  });
});

describe('last focus', () => {
  it('uses the teacher’s chosen next step first, else the commonest code', () => {
    expect(lastFocus(history())?.code?.id).toBe('ar');
    const chosen = history({ last: { ...history().last!, next_step: 'Name the effect.' } });
    expect(lastFocus(chosen)).toEqual({ code: null, line: 'Name the effect.' });
    expect(lastFocus(null)).toBeNull();
  });
});

describe('the Last time card', () => {
  it('starts folded: one quiet line with the focus, the rest hidden', () => {
    const card = lastTimeCard(history(), 'c1', 'b1')!;
    const toggle = card.querySelector<HTMLButtonElement>('.voice-last__toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(card.querySelector<HTMLElement>('.voice-last__panel')!.hidden).toBe(true);
    expect(card.querySelector('.voice-last__peek')!.textContent).toContain('say what it does');
    expect(toggle.textContent).toContain('Show');
  });

  it('opens to the focus, comment, pattern and link, and remembers that on the device', () => {
    const card = lastTimeCard(history(), 'c1', 'b1')!;
    card.querySelector<HTMLButtonElement>('.voice-last__toggle')!.click();
    const panel = card.querySelector<HTMLElement>('.voice-last__panel')!;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('From your viva on 30 Oct · The opening image');
    expect(panel.textContent).toContain('“Push to the effect.”');
    const rows = [...panel.querySelectorAll('.voice-last__row')].map((r) => r.textContent);
    expect(rows[0]).toContain('every time');
    expect(rows[1]).toContain('gone the last 2');
    expect(rows[2]).toContain('a strength');
    expect(panel.querySelectorAll('.voice-last__dot--need')).toHaveLength(6);
    expect(panel.querySelector('.voice-last__link')!.textContent).toBe('See all 4 returned vivas');
    expect(lastTimeCard(history(), 'c1', 'b2')!.querySelector('.voice-last__toggle')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows no pattern after a single viva, and no card before any', () => {
    const one = history({ count: 1, pattern: [{ code_id: 'ar', marks: ['need'] }] });
    const card = lastTimeCard(one, 'c1', 'b1')!;
    expect(card.querySelector('.voice-last__pattern')).toBeNull();
    expect(card.querySelector('.voice-last__link')!.textContent).toBe('See it in Returned work');
    expect(lastTimeCard(history({ last: null }), 'c1', 'b1')).toBeNull();
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
