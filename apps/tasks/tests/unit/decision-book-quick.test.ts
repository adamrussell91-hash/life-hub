// Decision Maker's quick route on the client: the Yes/No chart with its Stop Rule band, the quick
// page (answers on the chart, the check card, It came back, Go deeper and where it went), the
// "From a quick decision" panel, the landing card and the list row.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkDateText, createQuickView } from '../../../../packages/decision-book/render/quick';
import { mountFromQuick, mountQuickPage, type QuickPageHandlers } from '../../src/views/decision-book/quick-view';
import { renderDecisionMakerView, unmountDecisionMakerView } from '../../src/views/decision-book/view';
import { decisionBookApi, problemSolverApi } from '../../src/views/problem-solver/api';
import { scriptedCoach } from '../../../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { applyQuickTurn, createQuickSession, escalateQuick, quickAgain, quickCheck } from '../../../../netlify/functions/_shared/problem-solver/quick-session.mjs';
import { say, summaryRow } from '../../../../netlify/functions/_shared/problem-solver/session.mjs';
import type { PsSession, PsSummary } from '../../../../packages/problem-solver/types';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
const idle = (s: PsSession): PsSession => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });

async function step(session: PsSession, text?: string): Promise<PsSession> {
  const next = text ? say(session, text, deps) : session;
  return idle(applyQuickTurn(next, await scriptedCoach(next), deps) as PsSession);
}

/** A quick run walked by the scripted coach through `replies`. */
async function walk(...replies: string[]): Promise<PsSession> {
  let s = await step(createQuickSession({ text: 'Should I take the weekend course?' }, deps) as PsSession);
  for (const reply of replies) s = await step(s, reply);
  return s;
}
const PROCEED = ['use those', 'yes', 'yes', 'yes', 'I miss two sessions', 'Ask to move to the spring run', '2027-01-21'];
const texts = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].map((e) => e.textContent);
const handlers = (): QuickPageHandlers & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    onAnswer: (node, answer) => calls.push(`answer ${node} ${answer}`),
    onSay: (text) => calls.push(`say ${text}`),
    onAction: (action) => calls.push(`action ${action}`),
    onAgain: async () => { calls.push('again'); },
    onCheck: async (create) => { calls.push(`check ${create}`); }
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  unmountDecisionMakerView();
  document.body.replaceChildren();
});

describe('the Yes/No chart', () => {
  it('waits for the tests, then inks the path, with Yes and No on the test being asked', async () => {
    const picked: string[] = [];
    const chart = createQuickView(document, { onAnswer: (node, answer) => picked.push(`${node} ${answer}`) });
    chart.update((await walk()).quick!);
    expect(texts(chart.el, '.dm-qk__label')).toEqual(['The decision', 'First test', 'Second test', 'Third test', 'Three yeses to proceed']);
    expect(chart.el.querySelector('[data-box="decision"] .dm-qk__text')!.textContent).toBe('Should I take the weekend course?');
    expect(chart.el.querySelector('.dm-qk__ask')).toBeNull();
    const s = await walk('use those', 'yes');
    chart.update(s.quick!);
    expect(texts(chart.el, '.dm-qk__label').slice(1, 4)).toEqual(['Do I want it?', 'Can I do it?', 'Is it worth it?']);
    expect(chart.el.querySelector('[data-box="test_one"]')!.getAttribute('data-answer')).toBe('yes');
    const now = chart.el.querySelector('[data-now="true"]')!;
    expect(now.getAttribute('data-box')).toBe('test_two');
    expect(now.querySelector('.dm-qk__ask')).not.toBeNull();
    now.querySelector<HTMLButtonElement>('[data-answer="no"]')!.click();
    now.querySelector<HTMLButtonElement>('[data-answer="yes"]')!.click();
    expect(picked).toEqual(['test_two no'], 'one answer per test until the chart moves on');
  });

  it('a no ends at Do not proceed, with the later test off the path and no band', async () => {
    const chart = createQuickView(document);
    chart.update((await walk('use those', 'yes', 'no, weekends are full', 'I agree to things before checking the calendar', 'Leave it for this year')).quick!);
    expect(chart.el.getAttribute('data-outcome')).toBe('stop');
    expect(chart.el.querySelector('[data-box="end"] .dm-qk__label')!.textContent).toBe('Do not proceed');
    expect(chart.el.querySelector('[data-box="test_three"]')!.getAttribute('data-off')).toBe('true');
    expect(chart.el.querySelector('[data-box="test_two"] .dm-qk__text')!.textContent).toBe('weekends are full');
    expect(chart.el.querySelector<HTMLElement>('.dm-qk__band')!.hidden).toBe(true);
    expect(texts(chart.el, '.dm-qk__term')).toEqual(['What did I learn?', 'What next?']);
    expect(chart.el.querySelector('.dm-qk__ask')).toBeNull();
  });

  it('three yeses proceed, with the Stop Rule as an if/then band and the check date', async () => {
    const chart = createQuickView(document);
    chart.update((await walk('use those', 'yes', 'yes', 'yes', 'I miss two sessions')).quick!);
    const band = chart.el.querySelector<HTMLElement>('.dm-qk__band')!;
    expect(band.hidden).toBe(false);
    expect(texts(band, '.dm-qk__band-text')).toEqual(['I miss two sessions', 'what you will do, agreed now']);
    expect(band.hasAttribute('data-set')).toBe(false);
    chart.update((await walk(...PROCEED)).quick!);
    expect(texts(band, '.dm-qk__band-text')).toEqual(['I miss two sessions', 'Ask to move to the spring run']);
    expect(chart.el.querySelector('.dm-qk__check')!.textContent).toBe('Check on 21 Jan 2027');
    expect(checkDateText('2027-01-21')).toBe('21 Jan 2027');
  });

  it('a second round says how the first came out', async () => {
    const done = await walk('use those', 'no', 'It was never wanted', 'Drop it');
    const chart = createQuickView(document);
    chart.update(idle(quickAgain(done, deps) as PsSession).quick!);
    expect(chart.el.querySelector('.dm-qk__rounds')!.textContent).toBe('Round 2. Round 1 did not go ahead.');
    expect(texts(chart.el, '.dm-qk__label')[1]).toBe('First test');
  });
});

describe('the quick page', () => {
  it('answers on the chart, waits while the coach thinks, and offers Go deeper', async () => {
    const h = handlers();
    const s = await walk('use those');
    const page = mountQuickPage(s, h);
    document.body.append(page.el);
    page.update(s);
    page.el.querySelector<HTMLButtonElement>('.dm-qk__answer[data-answer="yes"]')!.click();
    expect(h.calls).toEqual(['answer test_one yes']);
    page.update({ ...s, runner: { status: 'queued', mode: 'turn', error: null } });
    expect(page.el.querySelector('.dm-qk__answer')!.getAttribute('aria-disabled')).toBe('true');
    expect(page.el.querySelector<HTMLButtonElement>('.dm-qk-page__deeper')!.disabled).toBe(true);
    page.update(s);
    expect(page.el.querySelector<HTMLButtonElement>('.dm-qk-page__deeper')!.disabled).toBe(false);
    page.el.querySelector<HTMLButtonElement>('.dm-qk-page__deeper')!.click();
    expect(h.calls.at(-1)).toBe('action escalate');
    expect(page.el.querySelector<HTMLElement>('.dm-qk-page__again')!.hidden).toBe(true);
  });

  it('the coach offers a full decision as Go deeper', async () => {
    const h = handlers();
    const s = await walk('use those', 'go deeper');
    const page = mountQuickPage(s, h);
    page.update(s);
    expect(page.el.querySelector('.ps-suggestion__title')!.textContent).toBe('This needs a full decision');
    page.el.querySelector<HTMLButtonElement>('.ps-suggestion [data-action="escalate"]')!.click();
    expect(h.calls).toEqual(['action escalate']);
  });

  it('a check date offers a task until it is made or set aside; a finished run offers It came back', async () => {
    const h = handlers();
    const s = await walk(...PROCEED, 'I decide faster with the tests written down', 'Book the first session');
    const page = mountQuickPage(s, h);
    page.update(s);
    const card = page.el.querySelector<HTMLElement>('.dm-qk-check')!;
    expect(card.hidden).toBe(false);
    expect(card.querySelector('.dm-qk-check__line')!.textContent).toBe('Check "Should I take the weekend course?" on 21 Jan 2027.');
    card.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    await Promise.resolve();
    expect(h.calls).toContain('check true');
    page.update(quickCheck(s, { taskId: 'task-9' }, deps) as PsSession);
    expect(card.hidden).toBe(true);
    expect(page.el.querySelector<HTMLElement>('.dm-qk-page__again')!.hidden).toBe(false);
    expect(page.el.querySelector('textarea')!.disabled).toBe(true);
  });

  it('once it went deeper the page links to the full decision and offers nothing else', async () => {
    const s = await walk('use those', 'yes');
    const { quick } = escalateQuick(s, 'full-1', deps);
    const page = mountQuickPage(quick as PsSession, handlers());
    page.update(quick as PsSession);
    expect(page.el.querySelector<HTMLElement>('.dm-qk-page__sent')!.hidden).toBe(false);
    expect(page.el.querySelector('.dm-qk-page__sent-link')!.getAttribute('href')).toBe('#/decision-maker?id=full-1');
    expect(page.el.querySelector<HTMLElement>('.dm-qk-page__actions')!.hidden).toBe(true);
  });
});

describe('from a quick decision', () => {
  it('opens closed, loads the run once, and offers a retry when it fails', async () => {
    const run = await walk('use those', 'yes');
    const get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(run);
    const panel = mountFromQuick(run.id, get);
    document.body.append(panel.el);
    expect(panel.el.open).toBe(false);
    panel.el.open = true;
    panel.el.dispatchEvent(new Event('toggle'));
    await vi.waitFor(() => expect(panel.el.querySelector('.ps-ltn-from__retry')).not.toBeNull());
    panel.el.querySelector<HTMLButtonElement>('.ps-ltn-from__retry')!.click();
    await vi.waitFor(() => expect(panel.el.querySelector('.dm-qk')).not.toBeNull());
    expect(panel.el.querySelector('.ps-ltn-from__link')!.getAttribute('href')).toBe(`#/decision-maker?id=${encodeURIComponent(run.id)}`);
    expect(panel.el.querySelector('.dm-qk__ask')).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('landing', () => {
  it('the Quick decision card starts a quick run, and a quick row wears its end as the badge', async () => {
    const stopped = summaryRow(await walk('use those', 'no', 'It was never wanted', 'Drop it')) as PsSummary;
    vi.spyOn(decisionBookApi, 'list').mockResolvedValue([stopped]);
    vi.spyOn(problemSolverApi, 'list').mockResolvedValue([]);
    const create = vi.spyOn(decisionBookApi, 'create').mockResolvedValue({ id: 'q-new' } as PsSession);
    location.hash = '#/decision-maker';
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderDecisionMakerView(canvas);
    const row = canvas.querySelector('.dm-prob')!;
    expect(row.querySelector('.ps-prob__phase')!.textContent).toBe('Do not proceed');
    expect(row.querySelector('.ps-prob__medal--quick svg')).not.toBeNull();
    const input = canvas.querySelector<HTMLInputElement>('.dm-quick input')!;
    input.value = 'Buy the bigger tent?';
    canvas.querySelector<HTMLFormElement>('.dm-quick form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(location.hash).toBe('#/decision-maker?id=q-new'));
    expect(create).toHaveBeenCalledWith({ text: 'Buy the bigger tent?', kind: 'quick' });
  });
});
