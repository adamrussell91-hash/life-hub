// Gear Shifter's Quick start (Plan 6): the chart (the target and dart, the stations in flow
// order, the two ways to start on the chart, earlier rounds) and, from Task 5, its page.
// Invented tasks only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { again, applyStep, newStart } from '../../../../packages/get-things-done/quick.mjs';
import { checkPointText, createStartView } from '../../../../packages/get-things-done/render/quick';
import type { GtStartState, PsSession } from '../../../../packages/problem-solver/types';
import { mountFromStart, mountStartPage, type StartPageHandlers } from '../../src/views/get-things-done/quick-view';

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
    const view = createStartView(document, { onPick: () => {} });
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
    expect(plain.el.querySelector('.gt-qs__ask, .gt-qs__pick')).toBeNull();
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

const session = (start: GtStartState, over: Partial<PsSession> = {}): PsSession => ({
  id: 'q1', title: TASK, revision: 3, kind: 'start', status: start.finishedAt ? 'finished' : 'active', phase: 'start', frame: {}, model: null, links: [], steps: {}, learnings: [],
  pendingLearning: null, turns: [{ id: 't1', role: 'user', text: TASK, createdAt: AT }], summary: '', suggestion: null, pendingKeep: null,
  runner: { status: 'idle', mode: 'turn', error: null }, proposedTasks: [], reviewProposal: null, reviewTaskId: null, reviewState: null, caseFile: null,
  caseFileDeclined: null, lightning: null, start, escalatedFrom: null, frameSeeds: null, taskSnapshot: null, detour: null, createdAt: AT, updatedAt: AT, ...over
} as PsSession);

const handlers = (): StartPageHandlers & Record<string, ReturnType<typeof vi.fn>> => ({
  onPick: vi.fn(), onSay: vi.fn(), onAction: vi.fn(), onAgain: vi.fn().mockResolvedValue(undefined), onCheck: vi.fn().mockResolvedValue(undefined)
}) as never;

describe('the Quick start page', () => {
  it('shows the chart and coach; It came back waits until the run is done', () => {
    const page = mountStartPage(session(walk(1)), handlers());
    document.body.append(page.el);
    page.update(session(walk(1)));
    expect(page.el.querySelector('.gt-qs')).not.toBeNull();
    expect(page.el.querySelector('.ps-coach')).not.toBeNull();
    expect(page.el.querySelector<HTMLElement>('.gt-qs-page__again')!.hidden).toBe(true);
    expect(page.el.querySelector<HTMLElement>('.gt-qs-page__deeper')!.hidden).toBe(false);
    page.update(session(walk(6)));
    expect(page.el.querySelector<HTMLElement>('.gt-qs-page__again')!.hidden).toBe(false);
    expect(page.el.querySelector<HTMLElement>('.gt-qs-page__done-line')!.hidden).toBe(false);
    expect(page.el.querySelector('textarea')!.disabled).toBe(true);
  });

  it('a pick on the chart calls onPick; Go deeper asks to escalate', () => {
    const h = handlers();
    const page = mountStartPage(session(walk(1)), h);
    page.update(session(walk(1)));
    page.el.querySelector<HTMLButtonElement>('.gt-qs__pick[data-way="interval"]')!.click();
    expect(h.onPick).toHaveBeenCalledWith('how', 'interval');
    page.el.querySelector<HTMLButtonElement>('.gt-qs-page__deeper')!.click();
    expect(h.onAction).toHaveBeenCalledWith('escalate');
    page.setEscalating(true);
    expect(page.el.querySelector<HTMLButtonElement>('.gt-qs-page__deeper')!.disabled).toBe(true);
    expect(page.el.querySelector<HTMLElement>('.gt-qs-page__pending')!.hidden).toBe(false);
  });

  it('the check card offers a dated check-back and hides once linked or set aside', async () => {
    const h = handlers();
    const dated = walk(4);
    const page = mountStartPage(session(dated), h);
    page.update(session(dated));
    const card = page.el.querySelector<HTMLElement>('.gt-qs-check')!;
    expect(card.hidden).toBe(false);
    expect(card.textContent).toContain(`Check back on "${TASK}" on 24 Oct 2026.`);
    card.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    await vi.waitFor(() => expect(h.onCheck).toHaveBeenCalledWith(true));
    page.update(session({ ...dated, check: { due: '2026-10-24', taskId: 'task-1', dismissed: false } }));
    expect(card.hidden).toBe(true);
    page.update(session({ ...dated, check: { due: '2026-10-24', taskId: null, dismissed: true } }));
    expect(card.hidden).toBe(true);
    const words = applyStep(walk(3), { node: 'check', note: 'after lunch' }, AT) as GtStartState;
    page.update(session(words));
    expect(card.hidden).toBe(true);
  });

  it('once gone deeper, the actions go and a link opens the full session', () => {
    const page = mountStartPage(session(walk(2)), handlers());
    page.update(session({ ...walk(2), escalatedTo: 'full-1', finishedAt: AT }, { status: 'finished' }));
    expect(page.el.querySelector<HTMLElement>('.gt-qs-page__actions')!.hidden).toBe(true);
    const sent = page.el.querySelector<HTMLElement>('.gt-qs-page__sent')!;
    expect(sent.hidden).toBe(false);
    expect(sent.getAttribute('role')).toBe('status');
    expect(sent.querySelector('a')!.getAttribute('href')).toBe('#/gear-shifter?id=full-1');
  });
});

describe('the Began as a Quick start panel', () => {
  it('loads the run once it is opened, read-only, with a link back', async () => {
    const get = vi.fn().mockResolvedValue(session(walk(3)));
    const panel = mountFromStart('q1', get);
    document.body.append(panel.el);
    expect(get).not.toHaveBeenCalled();
    panel.el.open = true;
    panel.el.dispatchEvent(new Event('toggle'));
    await vi.waitFor(() => expect(panel.el.querySelector('.gt-qs')).not.toBeNull());
    expect(get).toHaveBeenCalledTimes(1);
    expect(panel.el.querySelector('.gt-qs__pick')).toBeNull();
    expect(panel.el.querySelector('.gt-qs__way')!.textContent).toBe('Starts with a protected interval: Ten to ten thirty, notifications off');
    const unpicked = createStartView(document);
    unpicked.update(walk(1));
    expect(unpicked.el.querySelector('.gt-qs__way')!.textContent).toBe('No start was picked.');
    expect(panel.el.querySelector('.ps-ltn-from__link')!.getAttribute('href')).toBe('#/gear-shifter?id=q1');
    expect(panel.el.querySelector('summary')!.textContent).toBe('Began as a Quick start: the first action tried');
  });

  it('offers a retry when the run cannot be loaded', async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(session(walk(2)));
    const panel = mountFromStart('q1', get);
    panel.el.open = true;
    panel.el.dispatchEvent(new Event('toggle'));
    await vi.waitFor(() => expect(panel.el.querySelector('[role="alert"]')).not.toBeNull());
    panel.el.querySelector<HTMLButtonElement>('.ps-ltn-from__retry')!.click();
    await vi.waitFor(() => expect(panel.el.querySelector('.gt-qs')).not.toBeNull());
  });
});
