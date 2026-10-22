// Gear Shifter's Quick start (Plan 6): the chart (the target and dart, the stations in flow
// order, the two ways to start on the chart, earlier rounds) and, from Task 5, its page.
// Invented tasks only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { again, applyStep, newStart } from '../../../../packages/get-things-done/quick.mjs';
import { checkPointText, createStartView } from '../../../../packages/get-things-done/render/quick';
import type { GtStartState } from '../../../../packages/problem-solver/types';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const AT = '2026-10-22T09:00:00.000Z';
const TASK = 'Clear the inbox backlog from the conference';
const STEPS = [
  { node: 'action', note: 'Archive everything older than a month' },
  { node: 'how', answer: 'interval' },
  { node: 'cue', note: 'Ten to ten thirty, notifications off' },
  { node: 'check', note: '2026-10-24' },
  { node: 'happened', note: 'Down to forty messages' },
  { node: 'next', note: 'Answer the five from clients' }
];
const walk = (n: number, state: GtStartState = newStart(TASK, AT) as GtStartState): GtStartState =>
  STEPS.slice(0, n).reduce((s, step) => applyStep(s, step, AT) as GtStartState, state);
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((node) => node.textContent);

describe('the Quick start chart', () => {
  it('draws the stations in flow order with their answers, and marks the one waiting', () => {
    const view = createStartView(document);
    view.update(walk(1));
    expect(texts(view.el, '.gt-qs__label')).toEqual(['What needs to move?', 'The first small, safe action', 'How it starts', 'The cue or the interval', 'Check back', 'What happened?', 'What next?']);
    expect(view.el.querySelector('[data-box="task"] .gt-qs__text')!.textContent).toBe(TASK);
    expect(view.el.querySelector('[data-box="action"]')!.getAttribute('data-done')).toBe('true');
    const now = view.el.querySelector('[data-now="true"]')!;
    expect(now.getAttribute('data-box')).toBe('how');
    expect(now.querySelector('.gt-qs__now')!.hasAttribute('hidden')).toBe(false);
    expect(view.el.querySelectorAll('.gt-qs__now:not([hidden])')).toHaveLength(1);
    expect(view.el.querySelector('.gt-qs__action')!.textContent).toBe('Archive everything older than a month');
    expect(view.el.getAttribute('aria-label')).toBe('The Quick start route');
    expect(view.el.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('flies the dart in only once a way is picked, and says which', () => {
    const view = createStartView(document);
    view.update(walk(1));
    expect(view.el.hasAttribute('data-way')).toBe(false);
    expect(view.el.querySelector('.gt-qs__way')!.textContent).toMatch(/Pick how it starts/);
    view.update(walk(3));
    expect(view.el.getAttribute('data-way')).toBe('interval');
    expect(view.el.querySelector('.gt-qs__way')!.textContent).toBe('Starts with a protected interval: Ten to ten thirty, notifications off');
    expect(view.el.querySelector('[data-box="cue"] .gt-qs__label')!.textContent).toBe('The protected interval');
    expect(view.el.querySelector('[data-box="how"] .gt-qs__text')!.textContent).toMatch(/^Protected interval\./);
  });

  it('offers the two ways on the how station only with onPick, labelled, locking once pressed', () => {
    const plain = createStartView(document);
    plain.update(walk(1));
    expect(plain.el.querySelector('.gt-qs__ask')!.hasAttribute('hidden')).toBe(true);
    const onPick = vi.fn();
    const view = createStartView(document, { onPick });
    view.update(walk(1));
    const picks = [...view.el.querySelectorAll<HTMLButtonElement>('.gt-qs__pick')];
    expect(picks.map((b) => b.getAttribute('aria-label'))).toEqual(['Start with a countdown cue', 'Start with a protected interval']);
    expect(picks[0].closest('[data-box]')!.getAttribute('data-box')).toBe('how');
    picks[0].click();
    picks[1].click();
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('how', 'countdown');
    expect(picks.every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
    view.update(walk(2));
    expect(view.el.querySelector('.gt-qs__ask')!.hasAttribute('hidden')).toBe(true);
  });

  it('reads a dated check-back in words, and words as they are', () => {
    expect(checkPointText('2026-10-24')).toBe('24 Oct 2026');
    expect(checkPointText('after lunch')).toBe('after lunch');
    expect(checkPointText(null)).toBe('');
    const view = createStartView(document);
    view.update(walk(4));
    expect(view.el.querySelector('[data-box="check"] .gt-qs__text')!.textContent).toBe('24 Oct 2026');
  });

  it('a finished run is done; round 2 says how round 1 went', () => {
    const view = createStartView(document);
    const done = walk(6);
    view.update(done);
    expect(view.el.getAttribute('data-done')).toBe('true');
    expect(view.el.querySelector('[data-now]')).toBeNull();
    expect(view.el.querySelector('.gt-qs__rounds')!.hasAttribute('hidden')).toBe(true);
    view.update(again(done, AT) as GtStartState);
    expect(view.el.querySelector('.gt-qs__rounds')!.textContent).toBe('Round 2. Round 1: Archive everything older than a month, with a protected interval.');
    expect(view.el.querySelector('.gt-qs__action')!.textContent).toBe('Not named yet');
    expect(view.el.querySelector('[data-now="true"]')!.getAttribute('data-box')).toBe('action');
  });
});
