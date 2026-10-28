// The Collaboration Book's client: its landing page against a stubbed session API, every model
// drawn by its own chart (empty, then worked to completion), the experiment and review charts,
// the session decor, canvas and record blocks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PsRecordOffer, PsSession, PsSummary } from '../../../../packages/problem-solver/types';
import { toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { workThrough } from '../../../../packages/decision-book/work-through.mjs';
import { COLLAB_TOOLS } from '../../../../packages/collaboration-book/tools/index.mjs';
import { createCollabChartForTool } from '../../../../packages/collaboration-book/render/charts';
import { actionOffer } from '../../../../packages/collaboration-book/record.mjs';
import { applyCoachTurn, createSession, say } from '../../../../netlify/functions/_shared/problem-solver/session.mjs';
import { scriptedCoach } from '../../../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';

const api = vi.hoisted(() => ({ cb: { list: vi.fn(), create: vi.fn() } }));

vi.mock('../../src/views/problem-solver/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/views/problem-solver/api')>();
  return { ...real, collaborationBookApi: { ...real.collaborationBookApi, list: api.cb.list, create: api.cb.create } };
});

import { renderCollaborationBookView, unmountCollaborationBookView, reviewEntry } from '../../src/views/collaboration-book/view';
import { CB_LOOK, createGroups, createTrack, plainName, trackStations } from '../../src/views/collaboration-book/decor';
import { mountCollabCanvas, shownRun } from '../../src/views/collaboration-book/canvas';
import { recordBlockId, recordBlocks } from '../../src/views/collaboration-book/record-blocks';

const deps = { now: () => '2026-10-28T10:00:00.000Z', newId: () => 'x1' };
const fresh = () => createSession({ text: 'Our team waits on me for every decision.', kind: 'collab' }, deps) as PsSession;

async function step(session: PsSession, text?: string): Promise<PsSession> {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps) as PsSession;
}

/** A session framed in three answers, so Explore is open with a model suggested. */
async function worked(): Promise<PsSession> {
  let s = await step(fresh());
  s = await step(s, 'It is a problem we keep running into.');
  s = await step(s, 'The team choosing its own methods.');
  return s;
}

const row = (over: Partial<PsSummary>): PsSummary => ({ id: 'a1', title: 'Decisions bottleneck', status: 'active', phase: 'explore', links: [], kind: 'collab', model: 'collaboration_book', tool: 'cb_agility', frame: 3, skills: { analysis: 2 }, main: 'cb_agility', createdAt: '2026-10-26T09:00:00.000Z', updatedAt: '2026-10-26T09:00:00.000Z', ...over } as PsSummary);

beforeEach(() => {
  location.hash = '#/collaboration-book';
  api.cb.list.mockResolvedValue([
    row({}),
    row({ id: 'a2', title: 'Quiet planning meetings', phase: 'frame', frame: 1, tool: null, main: null, skills: {} }),
    row({ id: 'a3', title: 'Old one', status: 'archived' })
  ]);
});

afterEach(() => {
  unmountCollaborationBookView();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function landing(): Promise<HTMLElement> {
  const canvas = document.createElement('div');
  document.body.append(canvas);
  await renderCollaborationBookView(canvas);
  return canvas;
}

describe('landing', () => {
  it('shows the hero with the New box and no Quick start', async () => {
    const page = await landing();
    expect(page.querySelector('.cb-page.cb-scope')).not.toBeNull();
    expect(page.querySelector('.ps-start__title')!.textContent).toBe('What is happening in the team?');
    expect(page.querySelector('.gt-quick, .cb-quick')).toBeNull();
  });

  it('lists live sessions with their model badge and a meta line', async () => {
    const page = await landing();
    const cards = [...page.querySelectorAll('.cb-prob')];
    expect(cards.map((c) => c.querySelector('.ps-prob__title')!.textContent)).toEqual(['Decisions bottleneck', 'Quiet planning meetings']);
    expect(cards[0].querySelector('a')!.getAttribute('href')).toBe('#/collaboration-book?id=a1');
    expect([...cards[0].querySelectorAll('.ps-prob__meta > span')].map((s) => s.textContent)).toEqual(['Working', 'Agility', '26/10/26']);
    expect(cards[1].querySelector('.ps-prob__meta')!.textContent).toContain('Question 2 of 3');
  });

  it('shows the three parts in the book’s order with their emblems, every Explore model once, and the variants named', async () => {
    const page = await landing();
    const sections = [...page.querySelectorAll<HTMLElement>('.cb-sect')];
    expect(sections.map((s) => s.dataset.section)).toEqual(['solving_problems', 'achieving_goals', 'creating_trust']);
    for (const s of sections) expect(s.querySelector('.cb-sect__mark .cb-emblem--section svg')).not.toBeNull();
    expect([...page.querySelectorAll('.cb-sect__line')].map((t) => t.textContent!.match(/(\d+) models?\.$/)![1])).toEqual(['15', '11', '9']);
    expect(sections.map((s) => s.querySelector('.cb-sect__stn')!.textContent)).toEqual(['Part 1', 'Part 2', 'Part 3']);
    const ids = [...page.querySelectorAll<HTMLElement>('.cb-shelf__tool')].map((item) => item.dataset.tool);
    expect(ids.sort()).toEqual([...toolsForPlanStep('collaboration_book', 'explore')].sort());
    expect(page.querySelector('[data-tool="cb_postmortem"]')!.textContent).toContain('from Problem Solver');
    expect(page.querySelector('[data-tool="cb_corporate_culture"]')!.textContent).toContain('from Decision Maker');
    expect(page.querySelector('[data-tool="cb_psych_safety"]')!.textContent).toContain('lens');
    expect(page.querySelectorAll('.cb-check__item')).toHaveLength(2);
  });

  it('Start from this starts the session on that model', async () => {
    api.cb.create.mockResolvedValue({ id: 'new1' });
    const page = await landing();
    page.querySelector<HTMLButtonElement>('[data-tool="cb_premortem"] .cb-shelf__start')!.click();
    expect(page.querySelector('.cb-start__picked')!.textContent).toContain('Starting from The Premortem');
    page.querySelector<HTMLTextAreaElement>('.ps-start__input')!.value = 'We sign off the launch plan on Friday.';
    page.querySelector<HTMLFormElement>('.ps-start')!.requestSubmit();
    await vi.waitFor(() => expect(api.cb.create).toHaveBeenCalledWith({ text: 'We sign off the launch plan on Friday.', kind: 'collab', startModel: 'cb_premortem' }));
    await vi.waitFor(() => expect(location.hash).toBe('#/collaboration-book?id=new1'));
  });
});

type Tool = { id: string; family?: string; variantOf?: string };
type Run = { id: string; tool: string; status: string; nodes: { id: string; slot: string }[] };
const TOOLS = COLLAB_TOOLS as unknown as Record<string, Tool>;

describe.each(Object.keys(TOOLS))('%s', (id) => {
  it('draws its frame empty, then every node of a finished run', () => {
    const view = createCollabChartForTool(TOOLS[id] as never)!;
    expect(view, id).not.toBeNull();
    view.update({ id: 'r', tool: id, status: 'active', nodes: [], edges: [] } as never);
    expect(view.el.querySelector('.dm-chart__frame')!.children.length).toBeGreaterThan(0);
    const run = workThrough(id, (slot: string, i: number) => `Answer ${i + 1} for ${slot}`) as Run;
    view.update({ ...run, status: 'done' } as never);
    expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('Completed');
    for (const node of run.nodes) expect(view.el.querySelector(`[data-node="${node.id}"]`), `${id} ${node.slot}`).not.toBeNull();
  });
});

const node = (id: string, slot: string, text: string) => ({ id, slot, text, title: text, state: 'accepted', skills: [], turnId: null });

describe('Agree and Review charts', () => {
  it('the experiment draws every part with its basis and date in words', () => {
    const view = createCollabChartForTool({ id: 'cb_commit', family: 'commit' }) as unknown as { el: HTMLElement; update(run: unknown): void; setBasis(b: unknown): void };
    const slots = ['result', 'rests_on', 'next_action', 'owner', 'check_back', 'change_course'];
    view.update({ id: 'c1', tool: 'cb_commit', status: 'active', edges: [], nodes: slots.map((slot, i) => node(`n${i}`, slot, slot === 'check_back' ? '2026-11-11' : `Answer for ${slot}`)) });
    view.setBasis({ n1: [{ model: 'Agility', title: 'The release checklist' }] });
    expect([...view.el.querySelectorAll('.cb-commit__title')].map((t) => t.textContent)).toEqual(['The result for the team', 'Rests on', 'Next action', 'Who owns it', 'Come back on', 'What would change course']);
    for (let i = 0; i < slots.length; i += 1) expect(view.el.querySelector(`[data-node="n${i}"]`)).not.toBeNull();
    expect(view.el.textContent).toContain('Agility');
  });

  it('the review draws its three stations in order', () => {
    const view = createCollabChartForTool({ id: 'cb_review', family: 'review' })!;
    view.update({ id: 'v1', tool: 'cb_review', status: 'active', edges: [], nodes: [node('h', 'happened', 'Shipped on time'), node('c', 'conditions', 'Testing decisions moved'), node('k', 'keep', 'Keep it')] } as never);
    expect([...view.el.querySelectorAll('.cb-review__title')].map((t) => t.textContent)).toEqual(['What happened', 'Did the conditions change', 'Keep, adjust or stop']);
    for (const id of ['h', 'c', 'k']) expect(view.el.querySelector(`[data-node="${id}"]`)).not.toBeNull();
  });
});

describe('decor', () => {
  it('the track moves Locate, Work a model, Agree, Review', async () => {
    expect(trackStations(fresh()).stations.map((s) => [s.name, s.state, s.note])).toEqual([['Locate', 'now', 'Question 1 of 3'], ['Work a model', 'future', ''], ['Agree', 'future', ''], ['Review', 'future', '']]);
    const s = await worked();
    expect(trackStations(s).stations.map((x) => x.state)).toEqual(['done', 'now', 'future', 'future']);
    const track = createTrack();
    track.update(s);
    expect(track.el.querySelector('[aria-current="step"]')!.textContent).toContain('Work a model');
  });

  it('the groups stay hidden until placed, then ring the lit ones in the book’s order', () => {
    const groups = createGroups();
    groups.update(fresh());
    expect(groups.el.hidden).toBe(true);
    groups.update({ ...fresh(), frame: { situation: 'x', group: 'trust+problems' } } as PsSession);
    expect(groups.el.hidden).toBe(false);
    const items = [...groups.el.querySelectorAll<HTMLElement>('li')];
    expect(items.map((li) => li.dataset.lit)).toEqual(['true', 'false', 'true']);
    expect(groups.el.getAttribute('aria-label')).toBe('What the team needs: Solving a problem together and Building trust');
  });

  it('the coach look frames the Collaboration Book’s questions and names models plainly', () => {
    expect(CB_LOOK.frames.collab).toEqual({ keys: ['situation', 'group', 'outcome'], prompts: ['What happened in the team?', 'Problem, goal or trust?', 'What result would help?'] });
    expect(plainName('cb_two_pizza')).toBe('Two-Pizza Rule');
    expect(plainName('cb_four_in_one')).toBe('4-in-1 Perspective');
    expect(CB_LOOK.emblem('cb_nunchi').classList.contains('cb-emblem')).toBe(true);
    expect(CB_LOOK.emblem('cb_review').querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
  });
});

describe('session canvas', () => {
  it('shows the empty state, then the model in hand', async () => {
    const host = document.createElement('div');
    const canvas = mountCollabCanvas(host);
    canvas.update(fresh());
    expect(host.querySelector('.cb-canvas__empty')).not.toBeNull();
    const s = await worked();
    const open = { ...s, steps: { ...s.steps, explore: { ...s.steps.explore, runs: [{ id: 'r1', tool: 'cb_ladder', status: 'active', nodes: [], edges: [] }] } } } as unknown as PsSession;
    canvas.update(open);
    expect(host.querySelector('.cb-canvas__name')!.textContent).toBe('The Ladder of Inference');
    expect(shownRun(open)!.tool).toBe('cb_ladder');
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
      model: { id: 'collaboration_book', reason: '' },
      frame: { situation: 'The team waits on me for every decision', group: 'problems', outcome: 'The team choosing its own methods.' },
      steps: {
        explore: { status: 'done', objection: null, runs: [] },
        commit: {
          status: 'open',
          objection: null,
          runs: [{
            id: 'c1', tool: 'cb_commit', status: 'active', edges: [],
            nodes: ['result', 'rests_on', 'next_action', 'owner', 'check_back', 'change_course'].map((slot, i) => ({ id: `n${i}`, slot, text: slot === 'check_back' ? '2026-11-11' : `Answer for ${slot}`, state: 'accepted', skills: [], turnId: null }))
          }]
        }
      }
    } as unknown as PsSession;
    const offer = actionOffer(session) as PsRecordOffer;
    expect(offer.kind).toBe('write');
    const blocks = recordBlocks(offer, { sessionId: session.id, date: '2026-10-28' });
    expect(blocks[0]).toMatchObject({ block_type: 'heading', id: recordBlockId(session.id, 1, 1), content: { text: `Collaboration Book: ${session.title}` } });
    expect(blocks.length).toBe(offer.file.sections.length + 2);
    expect(offer.file.sections.map((s) => s.key)).toContain('wanted');
    const last = JSON.stringify(blocks.at(-1));
    expect(last).toContain('Worked with The Collaboration Book');
    expect(last).toContain(`#/collaboration-book?id=${session.id}`);
    expect(recordBlockId(session.id, 2, 3)).toBe(`cb-rec-${session.id.slice(0, 8)}-v2-3`);
  });
});
