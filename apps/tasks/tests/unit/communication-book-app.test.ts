// The Communication Book's client: its landing page against a stubbed session API, every model
// drawn by its own chart (empty, then worked to completion), the next conversation and review charts,
// the session decor, canvas and record blocks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PsRecordOffer, PsSession, PsSummary } from '../../../../packages/problem-solver/types';
import { toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { workThrough } from '../../../../packages/decision-book/work-through.mjs';
import { COMM_TOOLS } from '../../../../packages/communication-book/tools/index.mjs';
import { createCommChartForTool } from '../../../../packages/communication-book/render/charts';
import { actionOffer } from '../../../../packages/communication-book/record.mjs';
import { applyCoachTurn, createSession, say } from '../../../../netlify/functions/_shared/problem-solver/session.mjs';
import { scriptedCoach } from '../../../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';

const api = vi.hoisted(() => ({ cmb: { list: vi.fn(), create: vi.fn() } }));

vi.mock('../../src/views/problem-solver/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/views/problem-solver/api')>();
  return { ...real, communicationBookApi: { ...real.communicationBookApi, list: api.cmb.list, create: api.cmb.create } };
});

import { renderCommunicationBookView, unmountCommunicationBookView, reviewEntry } from '../../src/views/communication-book/view';
import { CMB_LOOK, createGroups, createTrack, plainName, trackStations } from '../../src/views/communication-book/decor';
import { mountCommCanvas, shownRun } from '../../src/views/communication-book/canvas';
import { recordBlockId, recordBlocks } from '../../src/views/communication-book/record-blocks';

const deps = { now: () => '2026-10-28T10:00:00.000Z', newId: () => 'x1' };
const fresh = () => createSession({ text: 'I need to tell my manager the launch date will slip.', kind: 'talk' }, deps) as PsSession;

async function step(session: PsSession, text?: string): Promise<PsSession> {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps) as PsSession;
}

/** A session framed in three answers, so Explore is open with a model suggested. */
async function worked(): Promise<PsSession> {
  let s = await step(fresh());
  s = await step(s, 'Mostly preparing what to say.');
  s = await step(s, 'She hears the reason and we agree a new date.');
  return s;
}

const row = (over: Partial<PsSummary>): PsSummary => ({ id: 'a1', title: 'Telling my manager', status: 'active', phase: 'explore', links: [], kind: 'talk', model: 'communication_book', tool: 'cm_storytelling', frame: 3, skills: { analysis: 2 }, main: 'cm_storytelling', createdAt: '2026-10-26T09:00:00.000Z', updatedAt: '2026-10-26T09:00:00.000Z', ...over } as PsSummary);

beforeEach(() => {
  location.hash = '#/communication-book';
  api.cmb.list.mockResolvedValue([
    row({}),
    row({ id: 'a2', title: 'Saying sorry to Sam', phase: 'frame', frame: 1, tool: null, main: null, skills: {} }),
    row({ id: 'a3', title: 'Old one', status: 'archived' })
  ]);
});

afterEach(() => {
  unmountCommunicationBookView();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function landing(): Promise<HTMLElement> {
  const canvas = document.createElement('div');
  document.body.append(canvas);
  await renderCommunicationBookView(canvas);
  return canvas;
}

describe('landing', () => {
  it('shows the hero with the New box and no Quick start', async () => {
    const page = await landing();
    expect(page.querySelector('.cmb-page.cmb-scope')).not.toBeNull();
    expect(page.querySelector('.ps-start__title')!.textContent).toBe('What was said, or needs saying?');
    expect(page.querySelector('.gt-quick, .cmb-quick')).toBeNull();
  });

  it('lists live sessions with their model badge and a meta line', async () => {
    const page = await landing();
    const cards = [...page.querySelectorAll('.cmb-prob')];
    expect(cards.map((c) => c.querySelector('.ps-prob__title')!.textContent)).toEqual(['Telling my manager', 'Saying sorry to Sam']);
    expect(cards[0].querySelector('a')!.getAttribute('href')).toBe('#/communication-book?id=a1');
    expect([...cards[0].querySelectorAll('.ps-prob__meta > span')].map((s) => s.textContent)).toEqual(['Working', 'Storytelling', '26/10/26']);
    expect(cards[1].querySelector('.ps-prob__meta')!.textContent).toContain('Question 2 of 3');
  });

  it('shows the five sections in the book’s order with their emblems, every Explore model once, and the variant named', async () => {
    const page = await landing();
    const sections = [...page.querySelectorAll<HTMLElement>('.cmb-sect')];
    expect(sections.map((s) => s.dataset.section)).toEqual(['job_career', 'self_knowledge', 'love_friendship', 'words_meanings', 'conclusion']);
    for (const s of sections) expect(s.querySelector('.cmb-sect__mark .cmb-emblem--section svg')).not.toBeNull();
    expect([...page.querySelectorAll('.cmb-sect__line')].map((t) => t.textContent!.match(/(\d+) models?\.$/)![1])).toEqual(['10', '7', '9', '7', '1']);
    expect(sections.map((s) => s.querySelector('.cmb-sect__stn')!.textContent)).toEqual(['Section 1', 'Section 2', 'Section 3', 'Section 4', 'Section 5']);
    const ids = [...page.querySelectorAll<HTMLElement>('.cmb-shelf__tool')].map((item) => item.dataset.tool);
    expect(ids.sort()).toEqual([...toolsForPlanStep('communication_book', 'explore')].sort());
    expect(page.querySelector('[data-tool="cm_second_order"]')!.textContent).toContain('from Problem Solver');
    expect(page.querySelector('[data-tool="cm_persuasion"]')!.textContent).toContain('lens');
    expect(page.querySelector('[data-tool="cm_peak_end"]')!.closest('.cmb-sect')!.getAttribute('data-section')).toBe('conclusion');
    expect(page.querySelectorAll('.cmb-check__item')).toHaveLength(2);
  });

  it('Start from this starts the session on that model', async () => {
    api.cmb.create.mockResolvedValue({ id: 'new1' });
    const page = await landing();
    page.querySelector<HTMLButtonElement>('[data-tool="cm_apology"] .cmb-shelf__start')!.click();
    expect(page.querySelector('.cmb-start__picked')!.textContent).toContain('Starting from The Sorry Matrix');
    page.querySelector<HTMLTextAreaElement>('.ps-start__input')!.value = 'I forgot my friend’s birthday dinner.';
    page.querySelector<HTMLFormElement>('.ps-start')!.requestSubmit();
    await vi.waitFor(() => expect(api.cmb.create).toHaveBeenCalledWith({ text: 'I forgot my friend’s birthday dinner.', kind: 'talk', startModel: 'cm_apology' }));
    await vi.waitFor(() => expect(location.hash).toBe('#/communication-book?id=new1'));
  });
});

type Tool = { id: string; family?: string; variantOf?: string };
type Run = { id: string; tool: string; status: string; nodes: { id: string; slot: string }[] };
const TOOLS = COMM_TOOLS as unknown as Record<string, Tool>;

describe.each(Object.keys(TOOLS))('%s', (id) => {
  it('draws its frame empty, then every node of a finished run', () => {
    const view = createCommChartForTool(TOOLS[id] as never)!;
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

describe('Commit and Review charts', () => {
  it('the next conversation draws every part with its basis and date in words', () => {
    const view = createCommChartForTool({ id: 'cm_commit', family: 'commit' }) as unknown as { el: HTMLElement; update(run: unknown): void; setBasis(b: unknown): void };
    const slots = ['result', 'rests_on', 'next_action', 'owner', 'check_back', 'change_course'];
    view.update({ id: 'c1', tool: 'cm_commit', status: 'active', edges: [], nodes: slots.map((slot, i) => node(`n${i}`, slot, slot === 'check_back' ? '2026-11-11' : `Answer for ${slot}`)) });
    view.setBasis({ n1: [{ model: 'Storytelling', title: 'Open with the date' }] });
    expect([...view.el.querySelectorAll('.cmb-commit__title')].map((t) => t.textContent)).toEqual(['What would show it went better', 'Rests on', 'The next conversation', 'Who takes it', 'Come back on', 'What would change course']);
    for (let i = 0; i < slots.length; i += 1) expect(view.el.querySelector(`[data-node="n${i}"]`)).not.toBeNull();
    expect(view.el.textContent).toContain('Storytelling');
  });

  it('the review draws its three stations in order', () => {
    const view = createCommChartForTool({ id: 'cm_review', family: 'review' })!;
    view.update({ id: 'v1', tool: 'cm_review', status: 'active', edges: [], nodes: [node('h', 'happened', 'I gave the new date'), node('l', 'landed', 'She thanked me for the warning'), node('k', 'keep', 'Keep it')] } as never);
    expect([...view.el.querySelectorAll('.cmb-review__title')].map((t) => t.textContent)).toEqual(['What was said', 'How it landed', 'Keep, adjust or drop']);
    for (const id of ['h', 'l', 'k']) expect(view.el.querySelector(`[data-node="${id}"]`)).not.toBeNull();
  });
});

describe('decor', () => {
  it('the track moves Name, Work a model, Commit, Review', async () => {
    expect(trackStations(fresh()).stations.map((s) => [s.name, s.state, s.note])).toEqual([['Name', 'now', 'Question 1 of 3'], ['Work a model', 'future', ''], ['Commit', 'future', ''], ['Review', 'future', '']]);
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
    groups.update({ ...fresh(), frame: { situation: 'x', group: 'read+prepare' } } as PsSession);
    expect(groups.el.hidden).toBe(false);
    const items = [...groups.el.querySelectorAll<HTMLElement>('li')];
    expect(items.map((li) => li.dataset.lit)).toEqual(['true', 'false', 'true']);
    expect(groups.el.getAttribute('aria-label')).toBe('What the exchange needs: Preparing what to say and Making sense of a message');
  });

  it('the coach look frames the Communication Book’s questions and names models plainly', () => {
    expect(CMB_LOOK.frames.talk).toEqual({ keys: ['situation', 'group', 'outcome'], prompts: ['What was said, or needs saying?', 'Prepare, relate or read?', 'What would a better exchange be?'] });
    expect(plainName('cm_salami')).toBe('Salami Tactic');
    expect(plainName('cm_listening')).toBe('Active Listening');
    expect(CMB_LOOK.emblem('cm_listening').classList.contains('cmb-emblem')).toBe(true);
    expect(CMB_LOOK.emblem('cm_review').querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
  });
});

describe('session canvas', () => {
  it('shows the empty state, then the model in hand', async () => {
    const host = document.createElement('div');
    const canvas = mountCommCanvas(host);
    canvas.update(fresh());
    expect(host.querySelector('.cmb-canvas__empty')).not.toBeNull();
    const s = await worked();
    const open = { ...s, steps: { ...s.steps, explore: { ...s.steps.explore, runs: [{ id: 'r1', tool: 'cm_four_layers', status: 'active', nodes: [], edges: [] }] } } } as unknown as PsSession;
    canvas.update(open);
    expect(host.querySelector('.cmb-canvas__name')!.textContent).toBe('Schulz von Thun’s Communication Model');
    expect(shownRun(open)!.tool).toBe('cm_four_layers');
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
      model: { id: 'communication_book', reason: '' },
      frame: { situation: 'I need to tell my manager the launch date will slip', group: 'prepare', outcome: 'She hears the reason and we agree a new date.' },
      steps: {
        explore: { status: 'done', objection: null, runs: [] },
        commit: {
          status: 'open',
          objection: null,
          runs: [{
            id: 'c1', tool: 'cm_commit', status: 'active', edges: [],
            nodes: ['result', 'rests_on', 'next_action', 'owner', 'check_back', 'change_course'].map((slot, i) => ({ id: `n${i}`, slot, text: slot === 'check_back' ? '2026-11-11' : `Answer for ${slot}`, state: 'accepted', skills: [], turnId: null }))
          }]
        }
      }
    } as unknown as PsSession;
    const offer = actionOffer(session) as PsRecordOffer;
    expect(offer.kind).toBe('write');
    const blocks = recordBlocks(offer, { sessionId: session.id, date: '2026-10-28' });
    expect(blocks[0]).toMatchObject({ block_type: 'heading', id: recordBlockId(session.id, 1, 1), content: { text: `Communication Book: ${session.title}` } });
    expect(blocks.length).toBe(offer.file.sections.length + 2);
    expect(offer.file.sections.map((s) => s.key)).toContain('wanted');
    const last = JSON.stringify(blocks.at(-1));
    expect(last).toContain('Worked with The Communication Book');
    expect(last).toContain(`#/communication-book?id=${session.id}`);
    expect(recordBlockId(session.id, 2, 3)).toBe(`cmb-rec-${session.id.slice(0, 8)}-v2-3`);
  });
});
