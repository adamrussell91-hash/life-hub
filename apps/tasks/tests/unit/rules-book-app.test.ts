// The Rules Book's client: its landing page against a stubbed session API, every rule drawn by
// its own chart (empty, then worked to completion), the session decor, canvas and record blocks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PsRecordOffer, PsSession, PsSummary } from '../../../../packages/problem-solver/types';
import { toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { workThrough } from '../../../../packages/decision-book/work-through.mjs';
import { RULE_TOOLS } from '../../../../packages/rules-book/tools/index.mjs';
import { createRulesChartForTool } from '../../../../packages/rules-book/render/charts';
import { actionOffer } from '../../../../packages/rules-book/record.mjs';
import { applyCoachTurn, createSession, say } from '../../../../netlify/functions/_shared/problem-solver/session.mjs';
import { scriptedCoach } from '../../../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';

const api = vi.hoisted(() => ({ rb: { list: vi.fn(), create: vi.fn() } }));

vi.mock('../../src/views/problem-solver/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/views/problem-solver/api')>();
  return { ...real, rulesBookApi: { ...real.rulesBookApi, list: api.rb.list, create: api.rb.create } };
});

import { renderRulesBookView, unmountRulesBookView, reviewEntry } from '../../src/views/rules-book/view';
import { RB_LOOK, createGroups, createTrack, plainName, trackStations } from '../../src/views/rules-book/decor';
import { mountRulesCanvas, shownRun } from '../../src/views/rules-book/canvas';
import { recordBlockId, recordBlocks } from '../../src/views/rules-book/record-blocks';

const deps = { now: () => '2026-10-27T10:00:00.000Z', newId: () => 'x1' };
const fresh = () => createSession({ text: 'The Friday report keeps slipping.', kind: 'rules' }, deps) as PsSession;

async function step(session: PsSession, text?: string): Promise<PsSession> {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps) as PsSession;
}

/** A session grounded in three answers, so Explore is open with a rule suggested. */
async function worked(): Promise<PsSession> {
  let s = await step(fresh());
  s = await step(s, 'It sits in my work and deadlines, and the date keeps moving.');
  s = await step(s, 'Due Friday; I assume it is simple, but I have never timed it.');
  return s;
}

const row = (over: Partial<PsSummary>): PsSummary => ({ id: 'a1', title: 'Fix the Friday report', status: 'active', phase: 'explore', links: [], kind: 'rules', model: 'rules_book', tool: 'rb_parkinson', frame: 3, skills: { analysis: 2 }, main: 'rb_parkinson', createdAt: '2026-10-26T09:00:00.000Z', updatedAt: '2026-10-26T09:00:00.000Z', ...over } as PsSummary);

beforeEach(() => {
  location.hash = '#/rules-book';
  api.rb.list.mockResolvedValue([
    row({}),
    row({ id: 'a2', title: 'Plan the offsite answer', phase: 'frame', frame: 1, tool: null, main: null, skills: {} }),
    row({ id: 'a3', title: 'Old one', status: 'archived' })
  ]);
});

afterEach(() => {
  unmountRulesBookView();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function landing(): Promise<HTMLElement> {
  const canvas = document.createElement('div');
  document.body.append(canvas);
  await renderRulesBookView(canvas);
  return canvas;
}

describe('landing', () => {
  it('shows the hero with the New box and no Quick start', async () => {
    const page = await landing();
    expect(page.querySelector('.rb-page.rb-scope')).not.toBeNull();
    expect(page.querySelector('.ps-start__title')!.textContent).toBe('What is the situation?');
    expect(page.querySelector('.gt-quick, .rb-quick')).toBeNull();
  });

  it('lists live sessions with their rule badge and a meta line', async () => {
    const page = await landing();
    const cards = [...page.querySelectorAll('.rb-prob')];
    expect(cards.map((c) => c.querySelector('.ps-prob__title')!.textContent)).toEqual(['Fix the Friday report', 'Plan the offsite answer']);
    expect(cards[0].querySelector('a')!.getAttribute('href')).toBe('#/rules-book?id=a1');
    expect([...cards[0].querySelectorAll('.ps-prob__meta > span')].map((s) => s.textContent)).toEqual(['Applying', "Parkinson’s Law", '26/10/26']);
    expect(cards[1].querySelector('.ps-prob__meta')!.textContent).toContain('Question 2 of 3');
  });

  it('shows the four parts in the book’s order, every Explore rule once, with the variants named', async () => {
    const page = await landing();
    expect([...page.querySelectorAll('.rb-sect__line')].map((t) => t.textContent!.match(/(\d+) rules\.$/)![1])).toEqual(['11', '7', '7', '5']);
    const ids = [...page.querySelectorAll<HTMLElement>('.rb-shelf__tool')].map((item) => item.dataset.tool);
    expect(ids.sort()).toEqual([...toolsForPlanStep('rules_book', 'explore')].sort());
    expect(page.querySelector('[data-tool="rb_pareto"]')!.textContent).toContain('from Problem Solver');
    expect(page.querySelector('[data-tool="rb_one_step"]')!.textContent).toContain('from Decision Maker');
    expect(page.querySelector('[data-tool="rb_ketchup"]')!.textContent).toContain('lens');
    expect(page.querySelectorAll('.rb-check__item')).toHaveLength(2);
  });

  it('Start from this starts the session on that rule', async () => {
    api.rb.create.mockResolvedValue({ id: 'new1' });
    const page = await landing();
    page.querySelector<HTMLButtonElement>('[data-tool="rb_plotz"] .rb-shelf__start')!.click();
    expect(page.querySelector('.rb-start__picked')!.textContent).toContain('Starting from Plotz’s Law');
    page.querySelector<HTMLTextAreaElement>('.ps-start__input')!.value = 'Should I say yes to the March offsite?';
    page.querySelector<HTMLFormElement>('.ps-start')!.requestSubmit();
    await vi.waitFor(() => expect(api.rb.create).toHaveBeenCalledWith({ text: 'Should I say yes to the March offsite?', kind: 'rules', startModel: 'rb_plotz' }));
    await vi.waitFor(() => expect(location.hash).toBe('#/rules-book?id=new1'));
  });
});

type Tool = { id: string; family?: string; variantOf?: string };
type Run = { id: string; tool: string; status: string; nodes: { id: string; slot: string }[] };
const TOOLS = RULE_TOOLS as unknown as Record<string, Tool>;

describe.each(Object.keys(TOOLS).filter((id) => id !== 'rb_pareto'))('%s', (id) => {
  it('draws its frame empty, then every node of a finished run', () => {
    const view = createRulesChartForTool(TOOLS[id] as never)!;
    expect(view, id).not.toBeNull();
    view.update({ id: 'r', tool: id, status: 'active', nodes: [], edges: [] } as never);
    expect(view.el.querySelector('.dm-chart__frame')!.children.length).toBeGreaterThan(0);
    const run = workThrough(id, (slot: string, i: number) => `Answer ${i + 1} for ${slot}`) as Run;
    view.update({ ...run, status: 'done' } as never);
    expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('Completed');
    for (const node of run.nodes) expect(view.el.querySelector(`[data-node="${node.id}"]`), `${id} ${node.slot}`).not.toBeNull();
  });
});

describe('Pareto', () => {
  it('draws Problem Solver’s chart with the reflection in a card below', () => {
    const view = createRulesChartForTool(TOOLS.rb_pareto as never)!;
    expect(view.el.querySelector('.ps-pareto')).not.toBeNull();
    const note = view.el.querySelector<HTMLElement>('.rb-pareto__reflection')!;
    view.update({ id: 'r', tool: 'rb_pareto', status: 'active', nodes: [{ id: 'n1', slot: 'target', text: 'Where my week goes', state: 'accepted' }], edges: [] } as never);
    expect(note.hidden).toBe(true);
    view.update({ id: 'r', tool: 'rb_pareto', status: 'active', nodes: [{ id: 'n9', slot: 'reflection', text: 'Two meetings cost most of the week', state: 'accepted' }], edges: [] } as never);
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('Two meetings cost most of the week');
  });
});

describe('decor', () => {
  it('the track moves Ground, Apply a rule, Act, Review', async () => {
    expect(trackStations(fresh()).stations.map((s) => [s.name, s.state, s.note])).toEqual([['Ground', 'now', 'Question 1 of 3'], ['Apply a rule', 'future', ''], ['Act', 'future', ''], ['Review', 'future', '']]);
    const s = await worked();
    expect(trackStations(s).stations.map((x) => x.state)).toEqual(['done', 'now', 'future', 'future']);
    const track = createTrack();
    track.update(s);
    expect(track.el.querySelector('[aria-current="step"]')!.textContent).toContain('Apply a rule');
  });

  it('the groups stay hidden until placed, then ring the lit ones in the book’s order', () => {
    const groups = createGroups();
    groups.update(fresh());
    expect(groups.el.hidden).toBe(true);
    groups.update({ ...fresh(), frame: { situation: 'x', group: 'people+workplace' } } as PsSession);
    expect(groups.el.hidden).toBe(false);
    const items = [...groups.el.querySelectorAll<HTMLElement>('li')];
    expect(items.map((li) => li.dataset.lit)).toEqual(['true', 'false', 'true', 'false']);
    expect(groups.el.getAttribute('aria-label')).toBe('Part of life: Work and deadlines and Yourself and others');
  });

  it('the coach look frames the Rules Book’s questions and names rules plainly', () => {
    expect(RB_LOOK.frames.rules).toEqual({ keys: ['situation', 'group', 'known'], prompts: ['What is the situation?', 'Which part of life is it in?', 'What do you already know?'] });
    expect(plainName('rb_ten_ten_ten')).toBe('10-10-10 Method');
    expect(plainName('rb_commit')).toBe('Experiment');
    expect(RB_LOOK.emblem('rb_ketchup').classList.contains('rb-emblem')).toBe(true);
    expect(RB_LOOK.emblem('rb_review').querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
  });
});

describe('session canvas', () => {
  it('shows the empty state, then the rule in hand', async () => {
    const host = document.createElement('div');
    const canvas = mountRulesCanvas(host);
    canvas.update(fresh());
    expect(host.querySelector('.rb-canvas__empty')).not.toBeNull();
    const s = await worked();
    const open = { ...s, steps: { ...s.steps, explore: { ...s.steps.explore, runs: [{ id: 'r1', tool: 'rb_parkinson', status: 'active', nodes: [], edges: [] }] } } } as unknown as PsSession;
    canvas.update(open);
    expect(host.querySelector('.rb-canvas__name')!.textContent).toBe('Parkinson’s Law');
    expect(shownRun(open)!.tool).toBe('rb_parkinson');
    canvas.destroy();
  });
});

describe('review entry and record blocks', () => {
  it('a review link needs a session that can start a review', () => {
    expect(reviewEntry(fresh(), null)).toBeNull();
    expect(reviewEntry(fresh(), 'review')).toBeNull();
  });

  it('a write is a heading, every section, then the caption and a link back; ids are fixed', () => {
    const base = fresh();
    const session = {
      ...base,
      phase: 'commit',
      model: { id: 'rules_book', reason: '' },
      frame: { situation: 'The Friday report keeps slipping', group: 'workplace', known: 'Due Friday.' },
      steps: {
        explore: { status: 'done', objection: null, runs: [] },
        commit: {
          status: 'open',
          objection: null,
          runs: [{
            id: 'c1', tool: 'rb_commit', status: 'active', edges: [],
            nodes: ['result', 'rests_on', 'next_action', 'start', 'check_back', 'change_course'].map((slot, i) => ({ id: `n${i}`, slot, text: slot === 'check_back' ? '2026-11-05' : `Answer for ${slot}`, state: 'accepted', skills: [], turnId: null }))
          }]
        }
      }
    } as unknown as PsSession;
    const offer = actionOffer(session) as PsRecordOffer;
    expect(offer.kind).toBe('write');
    const blocks = recordBlocks(offer, { sessionId: session.id, date: '2026-10-27' });
    expect(blocks[0]).toMatchObject({ block_type: 'heading', id: recordBlockId(session.id, 1, 1), content: { text: 'Rules Book: The Friday report keeps slipping.' } });
    expect(blocks.length).toBe(offer.file.sections.length + 2);
    const last = JSON.stringify(blocks.at(-1));
    expect(last).toContain('Worked with The Rules Book');
    expect(last).toContain(`#/rules-book?id=${session.id}`);
    expect(recordBlockId(session.id, 2, 3)).toBe(`rb-rec-${session.id.slice(0, 8)}-v2-3`);
  });
});
