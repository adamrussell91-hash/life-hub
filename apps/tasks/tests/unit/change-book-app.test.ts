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

const AT = (n: number) => `2026-10-${String(n).padStart(2, '0')}T09:00:00.000Z`;
const node = (id: string, slot: string, text: string, tag?: string) => ({ id, slot, text, title: text, ...(tag ? { tag } : {}), state: 'accepted', skills: [], turnId: null });
const typeIn = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('Multitasking: the split star', () => {
  const tool = TOOLS.ch_multitasking as never;
  const snap = (time: number[], value: number[], at: string) => ({ at, time: { a: time[0], b: time[1], c: time[2], d: time[3] }, value: { a: value[0], b: value[1], c: value[2], d: value[3] } });

  it('draws the TIME and VALUE halves, labelled inputs per mode, and sends one snapshot on Save', () => {
    const view = createChangeChartForTool(tool) as unknown as { el: HTMLElement; update(run: unknown): void; onScore(cb: (s: Record<string, unknown>) => void): void };
    const sent: Record<string, unknown>[] = [];
    view.onScore((s) => sent.push(s));
    view.update({ id: 'r', tool: 'ch_multitasking', status: 'active', nodes: [node('n1', 'subject', 'Last Tuesday')], edges: [] });
    const star = view.el.querySelector('.ch-tv__star')!;
    expect([...star.querySelectorAll('.ch-tv__half')].map((t) => t.textContent)).toEqual(['TIME', 'VALUE']);
    expect(star.querySelector('.ch-tv__divider')).not.toBeNull();
    expect(star.getAttribute('role')).toBe('img');
    expect(star.querySelector('title')!.textContent).toMatch(/not scored yet/);
    const rows = [...view.el.querySelectorAll<HTMLElement>('.ch-tv__row')];
    expect(rows.map((r) => r.dataset.mode)).toEqual(['a', 'b', 'c', 'd']);
    for (const input of view.el.querySelectorAll('.ch-tv__input')) expect(input.getAttribute('aria-label')).toMatch(/^(Time for|Value of) [A-D], /);
    const save = view.el.querySelector<HTMLButtonElement>('.ch-tv__save')!;
    save.click();
    expect(sent).toHaveLength(0);
    expect(view.el.querySelector('.ch-tv__status')!.textContent).toMatch(/0 to 100/);
    const values = [['40', '3'], ['50', '2'], ['10', '9'], ['30', '5']];
    rows.forEach((row, i) => {
      const [time, value] = row.querySelectorAll<HTMLInputElement>('.ch-tv__input');
      typeIn(time, values[i][0]);
      typeIn(value, values[i][1]);
    });
    expect(view.el.querySelector('.ch-tv__readout')!.textContent).toBe('Adds up to 130% — switching overlaps the other three, so this can pass 100');
    save.click();
    expect(sent).toEqual([{ time: { a: 40, b: 50, c: 10, d: 30 }, value: { a: 3, b: 2, c: 9, d: 5 } }]);
  });

  it('shows gap chips, the latest polygons, the previous save faintly and a text alternative', () => {
    const view = createChangeChartForTool(tool)!;
    const scores = { snapshots: [snap([30, 45, 20, 35], [8, 3, 9, 6], AT(1)), snap([30, 40, 10, 20], [8, 2, 9, 6], AT(8))] };
    view.update({ id: 'r', tool: 'ch_multitasking', status: 'active', nodes: [node('n1', 'subject', 'Last Tuesday'), node('n2', 'note:1', 'Inbox all morning', 'b')], edges: [], scores } as never);
    const chip = (mode: string) => view.el.querySelector(`.ch-tv__row[data-mode="${mode}"] .ch-tv__chip`)?.textContent ?? null;
    expect(chip('b')).toBe('Takes a lot, worth little');
    expect(chip('c')).toBe('Worth a lot, gets little');
    expect(chip('a')).toBeNull();
    expect(view.el.querySelector('.ch-tv__readout')!.textContent).toBe('Adds up to 100% of the day');
    expect(view.el.querySelector('.ch-tv__poly--time:not(.ch-tv__poly--ghost)')!.getAttribute('points')).not.toBe('');
    expect(view.el.querySelector('.ch-tv__poly--value.ch-tv__poly--ghost')!.getAttribute('points')).not.toBe('');
    expect(view.el.querySelector('.ch-tv__star title')!.textContent).toMatch(/B, In the cloud: email, messages, chat: time 40% of the day, value 2 of 10.*previous save is drawn faintly/);
    expect(view.el.querySelector('.ch-tv__row[data-mode="b"] .ch-tv__notes [data-node="n2"]')).not.toBeNull();
    expect((view.el.querySelector('.ch-tv__row[data-mode="b"] .ch-tv__input') as HTMLInputElement).value).toBe('40');
  });
});

describe('(Un)Happiness: the table of forces', () => {
  const tool = TOOLS.ch_unhappiness as never;
  const BOOK = ['thoughts', 'luck', 'politics', 'faith', 'fitness_industry', 'social_limits', 'actions', 'friends_family', 'economy', 'science'];
  type View = { el: HTMLElement; update(run: unknown): void; onScore(cb: (s: Record<string, unknown>) => void): void };
  const tap = (group: Element, n: number) => {
    const input = group.querySelectorAll<HTMLInputElement>('.ch-at__dot-input')[n - 1];
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  it('draws the circles, the table in the book’s order and five 1–5 dots a cell, then sends one snapshot', () => {
    const view = createChangeChartForTool(tool) as unknown as View;
    const sent: Record<string, unknown>[] = [];
    view.onScore((s) => sent.push(s));
    view.update({ id: 'r', tool: 'ch_unhappiness', status: 'active', nodes: [], edges: [] });
    expect([...view.el.querySelectorAll('.ch-at__ask')].map((a) => a.textContent)).toEqual(['How happy are you now?', 'In three years, how happy do you expect to be?']);
    expect([...view.el.querySelectorAll('.ch-at__arrow-caption')].map((a) => a.textContent)).toEqual(['What has got you to this point?', 'What will get you to that point?']);
    const rows = [...view.el.querySelectorAll<HTMLElement>('.ch-at__row')];
    expect(rows.map((r) => r.dataset.force)).toEqual(BOOK);
    expect(rows[0].querySelectorAll('.ch-at__dots--now .ch-at__dot-input')).toHaveLength(5);
    expect(rows[0].querySelector('.ch-at__dots--now')!.getAttribute('aria-label')).toBe('Your thoughts: Influence on how happy you are now');
    // Feeling word: lonely changes every label.
    const lonely = [...view.el.querySelectorAll<HTMLInputElement>('.ch-at__choice-input')].find((i) => i.value === 'lonely')!;
    lonely.checked = true;
    lonely.dispatchEvent(new Event('change'));
    expect(view.el.querySelector('.ch-at__ask')!.textContent).toBe('How lonely are you now?');
    view.el.querySelector<HTMLButtonElement>('.ch-at__save')!.click();
    expect(sent).toHaveLength(0);
    expect(view.el.querySelector('.ch-at__status')!.textContent).toMatch(/1 to 5/);
    const [nowPick, laterPick] = view.el.querySelectorAll('.ch-at__rate .ch-at__dots');
    tap(nowPick, 2);
    tap(laterPick, 4);
    rows.forEach((row, i) => {
      tap(row.querySelector('.ch-at__dots--now')!, 1 + (i % 5));
      tap(row.querySelector('.ch-at__dots--later')!, 3);
    });
    view.el.querySelector<HTMLButtonElement>('.ch-at__save')!.click();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ feeling: 'lonely', now: 2, later: 4 });
    expect(Object.keys(sent[0].influenceNow as object)).toEqual(BOOK);
    expect((sent[0].influenceNow as Record<string, number>).politics).toBe(3);
  });

  it('shows the ratings, the up and down marks, the summary, own forces and the arrow answers', () => {
    const view = createChangeChartForTool(tool) as unknown as View;
    const ids = [...BOOK, 'own_1'];
    const influenceNow = Object.fromEntries(ids.map((id) => [id, id === 'thoughts' || id === 'actions' ? 5 : 2]));
    const influenceLater = { ...influenceNow, thoughts: 3, luck: 4 };
    const scores = { snapshots: [{ at: AT(1), feeling: 'calm', now: 2, later: 4, influenceNow, influenceLater }] };
    const nodes = [node('f1', 'force:1', 'My commute'), node('g1', 'got_here', 'A steady job'), node('g2', 'get_there', 'Moving nearer family'), node('t1', 'note:1', 'It is my own doing', 'own_1')];
    view.update({ id: 'r', tool: 'ch_unhappiness', status: 'active', nodes, edges: [], scores });
    expect([...view.el.querySelectorAll('.ch-at__number')].map((n) => n.textContent)).toEqual(['2', '4']);
    expect(view.el.querySelector('.ch-at__ask')!.textContent).toBe('How calm are you now?');
    expect((view.el.querySelector('.ch-at__own-word') as HTMLInputElement).value).toBe('calm');
    const row = (id: string) => view.el.querySelector<HTMLElement>(`.ch-at__row[data-force="${id}"]`)!;
    expect(row('thoughts').dataset.drift).toBe('down');
    expect(row('thoughts').querySelector('.ch-at__drift')!.textContent).toBe('↓');
    expect(row('luck').querySelector('.ch-at__drift')!.getAttribute('aria-label')).toBe('more influence in three years');
    expect(row('politics').dataset.drift).toBe('same');
    expect(row('own_1').querySelector('[data-node="f1"]')).not.toBeNull();
    expect(row('own_1').querySelector('[data-node="t1"]')).not.toBeNull();
    expect(view.el.querySelector('.ch-at__arrow--got [data-node="g1"]')).not.toBeNull();
    expect(view.el.querySelector('.ch-at__arrow--get [data-node="g2"]')).not.toBeNull();
    // now: 10 of 28 points -> 4 of 10; later: 8 of 28 -> 3 of 10 (rounded)
    expect(view.el.querySelector('.ch-at__summary')!.textContent).toMatch(/^Your own thoughts and actions take 4 of every 10 points of influence now, and 3 of 10 in three years/);
    expect(row('luck').querySelector<HTMLInputElement>('.ch-at__dots--later .ch-at__dot-input:checked')!.value).toBe('4');
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
