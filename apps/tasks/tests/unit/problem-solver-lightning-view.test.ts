// apps/tasks/tests/unit/problem-solver-lightning-view.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PsLightningState, PsSession } from '../../../../packages/problem-solver/types';

/** Every chart the page makes, so a test can check it was dropped. */
const charts = vi.hoisted(() => [] as Array<{ destroy: ReturnType<typeof vi.fn>; onAnswer: boolean }>);
vi.mock('../../../../packages/problem-solver/render/lightning', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../packages/problem-solver/render/lightning')>();
  return {
    ...real,
    createLightningView: (doc: Document, opts: Parameters<typeof real.createLightningView>[1] = {}) => {
      const view = real.createLightningView(doc, opts);
      const destroy = vi.fn(() => view.destroy());
      charts.push({ destroy, onAnswer: Boolean(opts.onAnswer) });
      return { ...view, destroy };
    }
  };
});
vi.mock('../../design-kit/js/morphing-dialog.js', () => ({ morphFromRect: vi.fn() }));

const at = '2026-10-20T10:00:00Z';
const state = (extra: Partial<PsLightningState> = {}): PsLightningState => ({ path: [{ node: 'start', round: 1, at }], rounds: 1, finishedAt: null, escalatedTo: null, ...extra });

function run(extra: Partial<PsSession> = {}): PsSession {
  return {
    id: 'l1', title: 'Stuck door', revision: 2, kind: 'lightning', status: 'active', phase: 'lightning',
    frame: {}, model: null, links: [], steps: {}, learnings: [], pendingLearning: null,
    turns: [
      { id: 't1', role: 'user', text: 'The door sticks.', createdAt: at },
      { id: 't2', role: 'coach', text: 'Could you live with it as it is?', createdAt: at }
    ],
    summary: '', suggestion: null, pendingKeep: null, runner: { status: 'idle', mode: 'turn', error: null },
    proposedTasks: [], reviewProposal: null, reviewTaskId: null, reviewState: null, caseFile: null, caseFileDeclined: null,
    lightning: state(), escalatedFrom: null, frameSeeds: null, taskSnapshot: null, detour: null, createdAt: at, updatedAt: at,
    ...extra
  };
}

function full(extra: Partial<PsSession> = {}): PsSession {
  return {
    ...run(), id: 'f1', kind: 'full', phase: 'frame', lightning: null, escalatedFrom: 'l1',
    turns: [{ id: 'c1', role: 'coach', text: 'Here is what came over. Is the goal right?', createdAt: at }],
    ...extra
  };
}

async function load() {
  const view = await import('@/views/problem-solver/view');
  const { problemSolverApi } = await import('@/views/problem-solver/api');
  return { ...view, api: problemSolverApi };
}

/** Open a page; a busy session keeps polling, so its render is not awaited. */
async function open(session: PsSession) {
  const { renderProblemSolverView, unmountProblemSolverView, api } = await load();
  const get = vi.spyOn(api, 'get').mockResolvedValue(session);
  const actWith = vi.spyOn(api, 'actWith');
  location.hash = `#/problem-solver?id=${session.id}`;
  const host = document.createElement('div');
  document.body.append(host);
  const rendered = renderProblemSolverView(host);
  if (session.runner.status === 'running') await vi.waitFor(() => expect(host.querySelector('.ps-ltn-page, .ps-session')).not.toBeNull());
  else await rendered;
  return { host, get, actWith, api, renderProblemSolverView, unmountProblemSolverView };
}

const conflict = () => Object.assign(new Error('That question has moved on.'), { code: 'conflict' });
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;

afterEach(async () => {
  const { unmountProblemSolverView } = await load();
  unmountProblemSolverView();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  charts.length = 0;
  location.hash = '';
});

describe('Lightning run page', () => {
  it('routes a Lightning run to its page: back link, title, strip, chart and the coach without step controls', async () => {
    const { host } = await open(run());
    const page = host.querySelector('.ps-ltn-page')!;
    expect(page).not.toBeNull();
    expect(host.querySelector('.ps-track')).toBeNull();
    const back = page.querySelector<HTMLAnchorElement>('.ps-back')!;
    expect(back.textContent).toBe('← Problems');
    expect(back.getAttribute('href')).toBe('#/problem-solver');
    expect(page.querySelector('.ps-session__title')!.textContent).toBe('Stuck door');
    const questions = [...page.querySelectorAll('ol.ps-ltn-strip > li[data-question]')];
    expect(questions.map((q) => q.getAttribute('data-question'))).toEqual(['fix', 'do', 'learn', 'next']);
    expect(questions.map((q) => q.getAttribute('data-lit'))).toEqual(['true', 'false', 'false', 'false']);
    expect(questions[0].getAttribute('aria-current')).toBe('step');
    expect(page.querySelector('.ps-ltn-page__chart .ps-ltn')).not.toBeNull();
    expect(charts).toHaveLength(1);
    expect(charts[0].onAnswer).toBe(true);
    // The chart row sits above the coach, outside it.
    const chartRow = page.querySelector('.ps-ltn-page__chart')!;
    expect(chartRow.compareDocumentPosition(page.querySelector('.ps-coach')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(page.querySelector('[data-action="move_on"]')).toBeNull();
    expect(page.querySelector('.ps-composer__now')!.textContent).toBe('');
    expect(page.querySelector('.ps-ltn-page__done')!.hasAttribute('hidden')).toBe(true);
    expect(page.querySelector('.ps-ltn-page__sent')!.hasAttribute('hidden')).toBe(true);
  });

  it('lights the questions the current round reached and marks the one holding the current box', async () => {
    const path = [
      { node: 'start', round: 1, at, answer: 'no' }, { node: 'goal', round: 1, at, note: 'Shut it quietly' }, { node: 'subtract', round: 1, at, answer: 'yes' },
      { node: 'via_negativa', round: 1, at }, { node: 'solved_1', round: 1, at, answer: 'yes' }, { node: 'relax', round: 1, at }, { node: 'learn', round: 1, at }
    ] as PsLightningState['path'];
    const { host } = await open(run({ lightning: state({ path }) }));
    const questions = [...host.querySelectorAll('li[data-question]')];
    expect(questions.map((q) => q.getAttribute('data-lit'))).toEqual(['true', 'true', 'true', 'false']);
    expect(questions.map((q) => q.getAttribute('aria-current'))).toEqual([null, null, 'step', null]);
  });

  it('a second round lights only what that round has reached', async () => {
    const path = [
      { node: 'start', round: 1, at, answer: 'yes' }, { node: 'relax', round: 1, at }, { node: 'learn', round: 1, at }, { node: 'next', round: 1, at },
      { node: 'start', round: 2, at }
    ] as PsLightningState['path'];
    const { host } = await open(run({ lightning: state({ path, rounds: 2 }) }));
    expect([...host.querySelectorAll('li[data-question]')].map((q) => q.getAttribute('data-lit'))).toEqual(['true', 'false', 'false', 'false']);
  });

  it('answers the chart through the sync, then settles the coach turn', async () => {
    const { host, get, actWith } = await open(run());
    const moved = run({ revision: 3, lightning: state({ path: [{ node: 'start', round: 1, at, answer: 'no' }, { node: 'goal', round: 1, at }] }) });
    actWith.mockResolvedValue({ ...moved, runner: { status: 'queued', mode: 'turn', error: null } });
    get.mockResolvedValue(moved);
    host.querySelector<HTMLButtonElement>('.ps-ltn__answer[data-answer="no"]')!.click();
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(actWith).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1', revision: 2 }), 'lightning_answer', { node: 'start', answer: 'no' });
    await vi.waitFor(() => expect(host.querySelector('li[data-question="do"]')!.getAttribute('aria-current')).toBe('step'));
  });

  it('a conflict refetches and shows the latest; the chart buttons can be pressed again', async () => {
    const { host, get, actWith } = await open(run());
    const latest = run({ revision: 5, lightning: state({ path: [{ node: 'start', round: 1, at, answer: 'no' }, { node: 'goal', round: 1, at }] }) });
    actWith.mockRejectedValue(conflict());
    get.mockResolvedValue(latest);
    const no = host.querySelector<HTMLButtonElement>('.ps-ltn__answer[data-answer="no"]')!;
    no.click();
    await vi.waitFor(() => expect(host.querySelector('li[data-question="do"]')!.getAttribute('aria-current')).toBe('step'));
    expect(actWith).toHaveBeenCalledTimes(2);
    expect(no.hasAttribute('aria-disabled')).toBe(false);
    expect(host.querySelector('.ps-coach__status--failed')).toBeNull();
  });

  it('a failed answer shows the error and frees the buttons', async () => {
    const { host, actWith } = await open(run());
    actWith.mockRejectedValue(new Error('Network down'));
    const yes = host.querySelector<HTMLButtonElement>('.ps-ltn__answer[data-answer="yes"]')!;
    yes.click();
    await vi.waitFor(() => expect(host.querySelector('.ps-coach__status--failed')!.textContent).toBe('Network down'));
    expect(yes.hasAttribute('aria-disabled')).toBe(false);
  });

  it('the escalate card starts the full process with escalate (never accept_suggestion) and opens it', async () => {
    const { host, actWith } = await open(run({ suggestion: { kind: 'escalate', reason: 'Several people are involved.' } }));
    const card = host.querySelector('.ps-suggestion')!;
    expect(card.querySelector('.ps-suggestion__title')!.textContent).toBe('This needs the full process');
    expect(card.querySelector('.ps-suggestion__reason')!.textContent).toBe('Several people are involved.');
    expect(card.querySelector('[data-action="accept_suggestion"]')).toBeNull();
    actWith.mockResolvedValue(run({ revision: 3, status: 'finished', suggestion: null, lightning: state({ finishedAt: at, escalatedTo: 'full1' }) }));
    button(card as HTMLElement, 'Start the full process').click();
    await vi.waitFor(() => expect(location.hash).toBe('#/problem-solver?id=full1'));
    expect(actWith).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }), 'escalate', {});
    expect(actWith.mock.calls.some((call) => call[1] === 'accept_suggestion')).toBe(false);
  });

  it('Not now on the escalate card dismisses the suggestion through the sync', async () => {
    const { host, actWith } = await open(run({ suggestion: { kind: 'escalate', reason: 'r' } }));
    actWith.mockResolvedValue(run({ revision: 3 }));
    button(host.querySelector('.ps-suggestion')!, 'Not now').click();
    await vi.waitFor(() => expect(actWith).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }), 'dismiss_suggestion', {}));
    await vi.waitFor(() => expect(host.querySelector('.ps-suggestion')).toBeNull());
  });

  it('a finished run says so and It came back starts a new round, then settles', async () => {
    const path = [{ node: 'start', round: 1, at, answer: 'yes' }, { node: 'relax', round: 1, at }, { node: 'learn', round: 1, at }, { node: 'next', round: 1, at }] as PsLightningState['path'];
    const { host, get, actWith } = await open(run({ status: 'finished', lightning: state({ path, finishedAt: at }) }));
    const done = host.querySelector<HTMLElement>('.ps-ltn-page__done')!;
    expect(done.hidden).toBe(false);
    expect(done.textContent).toContain('That run is done');
    expect((host.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(true);
    const round2 = run({ revision: 3, lightning: state({ path: [...path, { node: 'start', round: 2, at }], rounds: 2 }) });
    actWith.mockResolvedValue({ ...round2, runner: { status: 'queued', mode: 'turn', error: null } });
    get.mockResolvedValue(round2);
    button(done, 'It came back').click();
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(actWith).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }), 'lightning_again', {});
    await vi.waitFor(() => expect(done.hidden).toBe(true));
    expect(host.querySelector('li[data-question="fix"]')!.getAttribute('aria-current')).toBe('step');
  });

  it('an escalated run shows a status banner linking to the full session, and no It came back', async () => {
    const { host } = await open(run({ status: 'finished', lightning: state({ finishedAt: at, escalatedTo: 'full1' }) }));
    const banner = host.querySelector<HTMLElement>('.ps-ltn-page__sent[role="status"]')!;
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('This went to the full process.');
    expect(banner.querySelector('a')!.getAttribute('href')).toBe('#/problem-solver?id=full1');
    expect(host.querySelector<HTMLElement>('.ps-ltn-page__done')!.hidden).toBe(true);
  });

  it('while the coach is thinking the chart answers wait, and a click posts nothing', async () => {
    const busy = run({ runner: { status: 'running', mode: 'turn', error: null } });
    const { host, get, actWith } = await open(busy);
    const ask = host.querySelector<HTMLElement>('.ps-ltn__ask')!;
    expect(ask.getAttribute('aria-disabled')).toBe('true');
    const yes = host.querySelector<HTMLButtonElement>('.ps-ltn__answer[data-answer="yes"]')!;
    expect(yes.getAttribute('aria-disabled')).toBe('true');
    yes.click();
    expect(actWith).not.toHaveBeenCalled();
    get.mockResolvedValue(run({ revision: 3 }));
    await vi.waitFor(() => expect(ask.hasAttribute('aria-disabled')).toBe(false));
    expect(yes.hasAttribute('aria-disabled')).toBe(false);
  });

  it('the escalate card waits while its post is out, saying so', async () => {
    const { host, actWith } = await open(run({ suggestion: { kind: 'escalate', reason: 'r' } }));
    let finish!: (s: PsSession) => void;
    actWith.mockReturnValue(new Promise<PsSession>((resolve) => (finish = resolve)));
    const card = host.querySelector<HTMLElement>('.ps-suggestion')!;
    button(card, 'Start the full process').click();
    await vi.waitFor(() => expect(card.querySelector('.ps-suggestion__pending')!.textContent).toBe('Taking it to the full process…'));
    expect([...card.querySelectorAll<HTMLButtonElement>('.ps-suggestion__actions button')].every((b) => b.disabled)).toBe(true);
    finish(run({ revision: 3, status: 'finished', suggestion: null, lightning: state({ finishedAt: at, escalatedTo: 'full1' }) }));
    await vi.waitFor(() => expect(location.hash).toBe('#/problem-solver?id=full1'));
  });

  it('the escalate card buttons wait while the coach is thinking', async () => {
    const { host } = await open(run({ suggestion: { kind: 'escalate', reason: 'r' }, runner: { status: 'running', mode: 'turn', error: null } }));
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.ps-suggestion__actions button')];
    expect(buttons).toHaveLength(2);
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(host.querySelector('.ps-suggestion__pending')).toBeNull();
  });

  it('a run already escalated elsewhere opens its full session instead of showing the refusal', async () => {
    const { host, get, actWith } = await open(run({ suggestion: { kind: 'escalate', reason: 'r' } }));
    get.mockResolvedValue(run({ revision: 4, status: 'finished', suggestion: null, lightning: state({ finishedAt: at, escalatedTo: 'other1' }) }));
    actWith.mockRejectedValueOnce(conflict()).mockRejectedValueOnce(Object.assign(new Error('This run already went to the full process.'), { code: 'action_not_allowed' }));
    button(host.querySelector('.ps-suggestion')!, 'Start the full process').click();
    await vi.waitFor(() => expect(location.hash).toBe('#/problem-solver?id=other1'));
    expect(host.querySelector('.ps-coach__status--failed')).toBeNull();
  });

  it('a failed escalate frees the card and shows the error', async () => {
    const { host, actWith } = await open(run({ suggestion: { kind: 'escalate', reason: 'r' } }));
    actWith.mockRejectedValue(new Error('Network down'));
    button(host.querySelector('.ps-suggestion')!, 'Start the full process').click();
    await vi.waitFor(() => expect(host.querySelector('.ps-coach__status--failed')!.textContent).toBe('Network down'));
    expect(host.querySelector('.ps-suggestion__pending')).toBeNull();
    expect(button(host.querySelector('.ps-suggestion')!, 'Start the full process').disabled).toBe(false);
    expect(location.hash).toBe('#/problem-solver?id=l1');
  });

  it('after It came back, the composer takes focus once the coach has asked', async () => {
    const path = [{ node: 'start', round: 1, at, answer: 'yes' }, { node: 'relax', round: 1, at }, { node: 'learn', round: 1, at }, { node: 'next', round: 1, at }] as PsLightningState['path'];
    const { host, get, actWith } = await open(run({ status: 'finished', lightning: state({ path, finishedAt: at }) }));
    const round2 = run({ revision: 3, lightning: state({ path: [...path, { node: 'start', round: 2, at }], rounds: 2 }) });
    actWith.mockResolvedValue({ ...round2, runner: { status: 'queued', mode: 'turn', error: null } });
    get.mockResolvedValue(round2);
    button(host, 'It came back').click();
    await vi.waitFor(() => expect(document.activeElement).toBe(host.querySelector('.ps-ltn-page textarea')));
  });

  it('leaving the page aborts the poll and drops the chart', async () => {
    const abort = vi.spyOn(AbortController.prototype, 'abort');
    const busy = run({ runner: { status: 'running', mode: 'turn', error: null } });
    const { api, renderProblemSolverView } = await load();
    const get = vi.spyOn(api, 'get').mockResolvedValue(busy);
    location.hash = '#/problem-solver?id=l1';
    const host = document.createElement('div');
    document.body.append(host);
    void renderProblemSolverView(host);
    await vi.waitFor(() => expect(get.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(charts).toHaveLength(1);
    // The escalated full session opens on the same canvas, as the router does on a hash change.
    get.mockImplementation(async (id: string) => (id === 'f1' ? full() : busy));
    location.hash = '#/problem-solver?id=f1';
    await renderProblemSolverView(host);
    expect(abort).toHaveBeenCalled();
    expect(charts[0].destroy).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.ps-ltn-page')).toBeNull();
    expect(host.querySelector('details.ps-ltn-from')).not.toBeNull();
  });
});

describe('From Lightning panel', () => {
  const openPanel = (panel: HTMLDetailsElement) => {
    panel.open = true;
    panel.dispatchEvent(new Event('toggle'));
  };

  it('a full session from a run shows the panel under the canvas; opened, it fetches the run once and shows it read-only', async () => {
    const path = [{ node: 'start', round: 1, at, answer: 'no' }, { node: 'goal', round: 1, at, note: 'Shut it quietly' }, { node: 'subtract', round: 1, at }] as PsLightningState['path'];
    const { host, get } = await open(full());
    get.mockImplementation(async (id: string) => (id === 'l1' ? run({ status: 'finished', lightning: state({ path, finishedAt: at, escalatedTo: 'f1' }) }) : full()));
    const panel = host.querySelector<HTMLDetailsElement>('details.ps-ltn-from')!;
    expect(panel.previousElementSibling?.classList.contains('ps-canvas')).toBe(true);
    expect(panel.querySelector('summary')!.textContent).toBe('From Lightning: the quick route tried first');
    expect(panel.open).toBe(false);
    expect(get.mock.calls.filter((call) => call[0] === 'l1')).toHaveLength(0);
    openPanel(panel);
    await vi.waitFor(() => expect(panel.querySelector('.ps-ltn')).not.toBeNull());
    expect(charts.at(-1)!.onAnswer).toBe(false);
    expect(panel.querySelector<HTMLElement>('.ps-ltn__ask')!.hidden).toBe(true);
    expect(panel.querySelector('[data-lnode="goal"]')!.getAttribute('data-state')).toBe('done');
    expect(panel.querySelector('a.ps-ltn-from__link')!.getAttribute('href')).toBe('#/problem-solver?id=l1');
    panel.open = false;
    panel.dispatchEvent(new Event('toggle'));
    openPanel(panel);
    await Promise.resolve();
    expect(get.mock.calls.filter((call) => call[0] === 'l1')).toHaveLength(1);
  });

  it('a failed fetch says so and offers a retry', async () => {
    const { host, get } = await open(full());
    get.mockImplementation(async (id: string) => {
      if (id === 'l1') throw new Error('offline');
      return full();
    });
    const panel = host.querySelector<HTMLDetailsElement>('details.ps-ltn-from')!;
    openPanel(panel);
    await vi.waitFor(() => expect(panel.textContent).toContain('Could not load the Lightning run.'));
    get.mockImplementation(async (id: string) => (id === 'l1' ? run({ status: 'finished', lightning: state({ finishedAt: at, escalatedTo: 'f1' }) }) : full()));
    button(panel, 'Try again').click();
    await vi.waitFor(() => expect(panel.querySelector('.ps-ltn')).not.toBeNull());
    expect(panel.textContent).not.toContain('Could not load');
  });

  it('leaving the full session drops the panel chart', async () => {
    const { host, get, unmountProblemSolverView } = await open(full());
    get.mockImplementation(async (id: string) => (id === 'l1' ? run() : full()));
    openPanel(host.querySelector<HTMLDetailsElement>('details.ps-ltn-from')!);
    await vi.waitFor(() => expect(charts).toHaveLength(1));
    unmountProblemSolverView();
    expect(charts[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('a full session not from Lightning has no panel', async () => {
    const { host } = await open(full({ escalatedFrom: null }));
    expect(host.querySelector('details.ps-ltn-from')).toBeNull();
  });
});
