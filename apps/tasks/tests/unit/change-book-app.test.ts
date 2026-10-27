// The Change Book's client: its landing page against a stubbed session API, every model drawn by
// its own chart (empty, then worked to completion), the session decor, canvas and record blocks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PsRecordOffer, PsSession, PsSummary } from '../../../../packages/problem-solver/types';
import { toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { workThrough } from '../../../../packages/decision-book/work-through.mjs';
import { CHANGE_TOOLS } from '../../../../packages/change-book/tools/index.mjs';
import { createChangeChartForTool } from '../../../../packages/change-book/render/charts';
import { actionOffer } from '../../../../packages/change-book/record.mjs';
import { applyCoachTurn, createSession, say } from '../../../../netlify/functions/_shared/problem-solver/session.mjs';
import { scriptedCoach } from '../../../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';

const api = vi.hoisted(() => ({ ch: { list: vi.fn(), create: vi.fn() } }));

vi.mock('../../src/views/problem-solver/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/views/problem-solver/api')>();
  return { ...real, changeBookApi: { ...real.changeBookApi, list: api.ch.list, create: api.ch.create } };
});

import { renderChangeBookView, unmountChangeBookView, reviewEntry } from '../../src/views/change-book/view';
import { CH_LOOK, createGroups, createTrack, plainName, trackStations } from '../../src/views/change-book/decor';
import { mountChangeCanvas, shownRun } from '../../src/views/change-book/canvas';
import { recordBlockId, recordBlocks } from '../../src/views/change-book/record-blocks';

const deps = { now: () => '2026-10-27T10:00:00.000Z', newId: () => 'x1' };
const fresh = () => createSession({ text: 'My team is moving to a four-day week.', kind: 'change' }, deps) as PsSession;

async function step(session: PsSession, text?: string): Promise<PsSession> {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps) as PsSession;
}

/** A session framed in three answers, so Explore is open with a model suggested. */
async function worked(): Promise<PsSession> {
  let s = await step(fresh());
  s = await step(s, 'It is about my own habits and how I spend my attention.');
  s = await step(s, 'The Friday catch-up with the team, which keeps us close.');
  return s;
}

const row = (over: Partial<PsSummary>): PsSummary => ({ id: 'a1', title: 'The four-day week', status: 'active', phase: 'explore', links: [], kind: 'change', model: 'change_book', tool: 'ch_change', frame: 3, skills: { analysis: 2 }, main: 'ch_change', createdAt: '2026-10-26T09:00:00.000Z', updatedAt: '2026-10-26T09:00:00.000Z', ...over } as PsSummary);

beforeEach(() => {
  location.hash = '#/change-book';
  api.ch.list.mockResolvedValue([
    row({}),
    row({ id: 'a2', title: 'A new manager', phase: 'frame', frame: 1, tool: null, main: null, skills: {} }),
    row({ id: 'a3', title: 'Old one', status: 'archived' })
  ]);
});

afterEach(() => {
  unmountChangeBookView();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function landing(): Promise<HTMLElement> {
  const canvas = document.createElement('div');
  document.body.append(canvas);
  await renderChangeBookView(canvas);
  return canvas;
}

describe('landing', () => {
  it('shows the hero with the New box and no Quick start', async () => {
    const page = await landing();
    expect(page.querySelector('.ch-page.ch-scope')).not.toBeNull();
    expect(page.querySelector('.ps-start__title')!.textContent).toBe('What is changing?');
    expect(page.querySelector('.gt-quick, .ch-quick')).toBeNull();
  });

  it('lists live sessions with their model badge and a meta line', async () => {
    const page = await landing();
    const cards = [...page.querySelectorAll('.ch-prob')];
    expect(cards.map((c) => c.querySelector('.ps-prob__title')!.textContent)).toEqual(['The four-day week', 'A new manager']);
    expect(cards[0].querySelector('a')!.getAttribute('href')).toBe('#/change-book?id=a1');
    expect([...cards[0].querySelectorAll('.ps-prob__meta > span')].map((s) => s.textContent)).toEqual(['Applying', 'Change Model', '26/10/26']);
    expect(cards[1].querySelector('.ps-prob__meta')!.textContent).toContain('Question 2 of 3');
  });

  it('shows the five sections in the book’s order with their emblems, every Explore model once, and the variant named', async () => {
    const page = await landing();
    const sections = [...page.querySelectorAll<HTMLElement>('.ch-sect')];
    expect(sections.map((s) => s.dataset.section)).toEqual(['explaining_our_world', 'explaining_my_world', 'changing_my_world', 'changing_our_world', 'appendix']);
    for (const s of sections) expect(s.querySelector('.ch-sect__mark .ch-emblem--section svg')).not.toBeNull();
    expect([...page.querySelectorAll('.ch-sect__line')].map((t) => t.textContent!.match(/(\d+) models?\.$/)![1])).toEqual(['4', '3', '6', '6', '1']);
    expect(sections.at(-1)!.querySelector('.ch-sect__stn')!.textContent).toBe('Any session');
    const ids = [...page.querySelectorAll<HTMLElement>('.ch-shelf__tool')].map((item) => item.dataset.tool);
    expect(ids.sort()).toEqual([...toolsForPlanStep('change_book', 'explore')].sort());
    expect(page.querySelector('[data-tool="ch_rhizome"]')!.textContent).toContain('from Problem Solver');
    expect(page.querySelector('[data-tool="ch_braess"]')!.textContent).toContain('lens');
    expect(page.querySelectorAll('.ch-check__item')).toHaveLength(2);
  });

  it('Start from this starts the session on that model', async () => {
    api.ch.create.mockResolvedValue({ id: 'new1' });
    const page = await landing();
    page.querySelector<HTMLButtonElement>('[data-tool="ch_anti_change"] .ch-shelf__start')!.click();
    expect(page.querySelector('.ch-start__picked')!.textContent).toContain('Starting from The Anti-Change Model');
    page.querySelector<HTMLTextAreaElement>('.ps-start__input')!.value = 'We are merging two teams in March.';
    page.querySelector<HTMLFormElement>('.ps-start')!.requestSubmit();
    await vi.waitFor(() => expect(api.ch.create).toHaveBeenCalledWith({ text: 'We are merging two teams in March.', kind: 'change', startModel: 'ch_anti_change' }));
    await vi.waitFor(() => expect(location.hash).toBe('#/change-book?id=new1'));
  });
});

type Tool = { id: string; family?: string; variantOf?: string };
type Run = { id: string; tool: string; status: string; nodes: { id: string; slot: string }[] };
const TOOLS = CHANGE_TOOLS as unknown as Record<string, Tool>;

describe.each(Object.keys(TOOLS).filter((id) => id !== 'ch_rhizome'))('%s', (id) => {
  it('draws its frame empty, then every node of a finished run', () => {
    const view = createChangeChartForTool(TOOLS[id] as never)!;
    expect(view, id).not.toBeNull();
    view.update({ id: 'r', tool: id, status: 'active', nodes: [], edges: [] } as never);
    expect(view.el.querySelector('.dm-chart__frame')!.children.length).toBeGreaterThan(0);
    const run = workThrough(id, (slot: string, i: number) => `Answer ${i + 1} for ${slot}`) as Run;
    view.update({ ...run, status: 'done' } as never);
    expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('Completed');
    for (const node of run.nodes) expect(view.el.querySelector(`[data-node="${node.id}"]`), `${id} ${node.slot}`).not.toBeNull();
  });
});

describe('Rhizome', () => {
  it('draws Problem Solver’s concept map with the reflection in a card below', () => {
    const view = createChangeChartForTool(TOOLS.ch_rhizome as never)!;
    expect(view.el.querySelector('.ps-cmap')).not.toBeNull();
    const note = view.el.querySelector<HTMLElement>('.ch-rhizome__reflection')!;
    view.update({ id: 'r', tool: 'ch_rhizome', status: 'active', nodes: [], edges: [] } as never);
    expect(note.hidden).toBe(true);
    view.update({ id: 'r', tool: 'ch_rhizome', status: 'active', nodes: [{ id: 'n9', slot: 'reflection', text: 'Work and family pull on the same hours', state: 'accepted' }], edges: [] } as never);
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('Work and family pull on the same hours');
  });
});

describe('decor', () => {
  it('the track moves Name it, Apply a model, Act, Review', async () => {
    expect(trackStations(fresh()).stations.map((s) => [s.name, s.state, s.note])).toEqual([['Name it', 'now', 'Question 1 of 3'], ['Apply a model', 'future', ''], ['Act', 'future', ''], ['Review', 'future', '']]);
    const s = await worked();
    expect(trackStations(s).stations.map((x) => x.state)).toEqual(['done', 'now', 'future', 'future']);
    const track = createTrack();
    track.update(s);
    expect(track.el.querySelector('[aria-current="step"]')!.textContent).toContain('Apply a model');
  });

  it('the groups stay hidden until placed, then ring the lit ones in the book’s order', () => {
    const groups = createGroups();
    groups.update(fresh());
    expect(groups.el.hidden).toBe(true);
    groups.update({ ...fresh(), frame: { change: 'x', group: 'ours+self' } } as PsSession);
    expect(groups.el.hidden).toBe(false);
    const items = [...groups.el.querySelectorAll<HTMLElement>('li')];
    expect(items.map((li) => li.dataset.lit)).toEqual(['false', 'true', 'false', 'true']);
    expect(groups.el.getAttribute('aria-label')).toBe('Where the change sits: Making sense of myself and others and Changing things together');
  });

  it('the coach look frames the Change Book’s questions and names models plainly', () => {
    expect(CH_LOOK.frames.change).toEqual({ keys: ['change', 'group', 'stay'], prompts: ['What is changing?', 'Where does it sit?', 'What should stay?'] });
    expect(plainName('ch_unhappiness')).toBe('(Un)Happiness Model');
    expect(plainName('ch_three_t')).toBe('3-T Model');
    expect(CH_LOOK.emblem('ch_braess').classList.contains('ch-emblem')).toBe(true);
    expect(CH_LOOK.emblem('ch_review').querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
  });
});

describe('session canvas', () => {
  it('shows the empty state, then the model in hand', async () => {
    const host = document.createElement('div');
    const canvas = mountChangeCanvas(host);
    canvas.update(fresh());
    expect(host.querySelector('.ch-canvas__empty')).not.toBeNull();
    const s = await worked();
    const open = { ...s, steps: { ...s.steps, explore: { ...s.steps.explore, runs: [{ id: 'r1', tool: 'ch_change', status: 'active', nodes: [], edges: [] }] } } } as unknown as PsSession;
    canvas.update(open);
    expect(host.querySelector('.ch-canvas__name')!.textContent).toBe('The Change Model');
    expect(shownRun(open)!.tool).toBe('ch_change');
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
      model: { id: 'change_book', reason: '' },
      frame: { change: 'The team moves to a four-day week', group: 'ours', stay: 'The Friday catch-up.' },
      steps: {
        explore: { status: 'done', objection: null, runs: [] },
        commit: {
          status: 'open',
          objection: null,
          runs: [{
            id: 'c1', tool: 'ch_commit', status: 'active', edges: [],
            nodes: ['result', 'rests_on', 'next_action', 'affected', 'check_back', 'change_course'].map((slot, i) => ({ id: `n${i}`, slot, text: slot === 'check_back' ? '2026-11-05' : `Answer for ${slot}`, state: 'accepted', skills: [], turnId: null }))
          }]
        }
      }
    } as unknown as PsSession;
    const offer = actionOffer(session) as PsRecordOffer;
    expect(offer.kind).toBe('write');
    const blocks = recordBlocks(offer, { sessionId: session.id, date: '2026-10-27' });
    expect(blocks[0]).toMatchObject({ block_type: 'heading', id: recordBlockId(session.id, 1, 1), content: { text: `Change Book: ${session.title}` } });
    expect(blocks.length).toBe(offer.file.sections.length + 2);
    const last = JSON.stringify(blocks.at(-1));
    expect(last).toContain('Worked with The Change Book');
    expect(last).toContain(`#/change-book?id=${session.id}`);
    expect(recordBlockId(session.id, 2, 3)).toBe(`ch-rec-${session.id.slice(0, 8)}-v2-3`);
  });
});
