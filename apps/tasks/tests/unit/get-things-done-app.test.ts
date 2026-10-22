// Gear Shifter's client: the paths Problem Solver's shared components gained for it (the task
// source, the Gear Shifter chip, the three-way skills ribbon), then its decor, canvas, record
// blocks and view helpers as later tasks add them.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '../../src/domain/task-properties-defaults';
import { gearShifterChips } from '../../src/views/problem-solver/link-chips';
import { skillsRibbon } from '../../src/views/problem-solver/skills-ribbon';
import type { PsSession, PsSummary } from '../../../../packages/problem-solver/types';
import { createRoute, createTrack, gearMedal, GT_LOOK, medalOf, plainName, trackStations } from '../../src/views/get-things-done/decor';
import { committed, committing, explored, reply } from '../../../../tests/unit/gear-shifter-test-helpers.mjs';
import { mountGearCanvas, shownRun } from '../../src/views/get-things-done/canvas';
import { provenanceUrl, recordBlockId, recordBlocks, recordGraphic } from '../../src/views/get-things-done/record-blocks';
import { actionOffer } from '../../../../packages/get-things-done/record.mjs';
import { acceptSuggestion, linkCaseFile } from '../../../../netlify/functions/_shared/problem-solver/session.mjs';
import type { PsRecordOffer } from '../../../../packages/problem-solver/types';
import { latestRecordWriter, reviewEntry } from '../../src/views/get-things-done/view';
import { createSession, moveOn, setReviewTask } from '../../../../netlify/functions/_shared/problem-solver/session.mjs';

const deps = { now: () => '2026-10-22T10:00:00.000Z', newId: () => 'x1' };
const fresh = () => createSession({ text: 'The grant report will not get written.', kind: 'shift' }, deps) as PsSession;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const row = (skills: Record<string, number>) => ({ skills }) as unknown as PsSummary;

describe('shared components, Gear Shifter paths', () => {
  it('Tasks knows the gear_shifter source', () => {
    expect(DEFAULT_TASK_PROPERTY_CONFIG.sources.map((s) => s.id)).toContain('gear_shifter');
  });

  it('a Gear Shifter chip opens the session, a review chip at Review', async () => {
    const linked = vi.fn().mockResolvedValue([{ id: 'g1', title: 'Grant report', phase: 'review', model: 'gear_shifter', role: 'review' }]);
    const host = gearShifterChips({ kind: 'project', id: 'p1' }, { linked });
    await vi.waitFor(() => expect(host.querySelector('a')).not.toBeNull());
    expect(linked).toHaveBeenCalledWith('project:p1');
    expect(host.querySelector('a')!.getAttribute('href')).toBe('#/gear-shifter?id=g1&step=review');
    expect(host.querySelector('a')!.textContent).toBe('Review in Gear Shifter: Grant report');
    expect(host.querySelector('a')!.classList.contains('ps-linkchip--gt')).toBe(true);
  });

  it('the skills ribbon splits three ways, each other tool in its own colour', () => {
    const ribbon = skillsRibbon(
      { name: 'Gear Shifter', sessions: [row({ analysis: 2 })] },
      [{ name: 'Decision Maker', sessions: [row({ analysis: 1 })], colour: '#2a3340' }, { name: 'Problem Solver', sessions: [row({ analysis: 1, learning: 4 })] }],
      () => 'var(--gt-blue)'
    );
    expect([...ribbon.querySelectorAll('.ps-ribbon__key')].map((k) => k.textContent)).toEqual(['Gear Shifter', 'Decision Maker', 'Problem Solver']);
    const analysis = [...ribbon.querySelectorAll('.ps-skills__item')].find((i) => i.textContent!.includes('Analysis'))!;
    expect(analysis.querySelector('.ps-skills__count')!.textContent).toBe('4×');
    const shares = [...analysis.querySelectorAll<HTMLElement>('.ps-skills__bar i')].map((i) => i.style.getPropertyValue('--w'));
    expect(shares).toEqual(['50%', '25%', '25%']);
    expect(analysis.querySelectorAll<HTMLElement>('.ps-skills__other')[0].style.getPropertyValue('--c')).toBe('#2a3340');
    expect(analysis.getAttribute('title')).toContain('Gear Shifter: 2. Decision Maker: 1. Problem Solver: 1.');
  });

  it('with one other tool the ribbon draws as before', () => {
    const ribbon = skillsRibbon({ name: 'Decision Maker', sessions: [row({ analysis: 3 })] }, { name: 'Problem Solver', sessions: [row({ analysis: 1 })] }, () => 'var(--dm-ink)');
    const analysis = [...ribbon.querySelectorAll('.ps-skills__item')].find((i) => i.textContent!.includes('Analysis'))!;
    expect(analysis.querySelectorAll('.ps-skills__bar i')).toHaveLength(2);
    expect((analysis.querySelector('.ps-skills__other') as HTMLElement).style.getPropertyValue('--c')).toBe('');
  });
});

describe('decor', () => {
  it('the track moves Frame, Explore, Commit, Review, and shows the check-back', () => {
    expect(trackStations(fresh()).stations.map((s) => [s.name, s.state, s.note])).toEqual([['Frame', 'now', 'Question 1 of 3'], ['Explore', 'future', ''], ['Commit', 'future', ''], ['Review', 'future', '']]);
    expect(trackStations(explored() as PsSession).stations.map((s) => [s.state, s.note])).toEqual([['done', 'Done'], ['now', 'Appreciation'], ['future', ''], ['future', '']]);
    expect(trackStations(committing() as PsSession).stations.map((s) => [s.state, s.note])).toEqual([['done', 'Done'], ['done', 'Appreciation'], ['now', 'The experiment'], ['future', '']]);
    const done = committed() as PsSession;
    expect(trackStations(done).stations[3].note).toBe('Check back 5 Nov');
    const waiting = moveOn(setReviewTask(done, { taskId: 't9', due: '2026-11-05' }, deps), deps) as PsSession;
    expect(trackStations(waiting).stations[3]).toMatchObject({ state: 'waiting', note: 'Check back 5 Nov' });
    const track = createTrack();
    track.update(explored() as PsSession);
    expect(track.el.querySelector('[aria-current="step"]')!.textContent).toContain('Explore');
  });

  it('the route stays hidden until placed, then rings the lit stations in route order', () => {
    const route = createRoute();
    route.update(fresh());
    expect(route.el.hidden).toBe(true);
    route.update({ ...fresh(), frame: { need: 'x', route: 'others+before' } } as PsSession);
    expect(route.el.hidden).toBe(false);
    const stations = [...route.el.querySelectorAll('li')];
    expect(stations.map((li) => li.querySelector('.gt-route__label')!.textContent)).toEqual(['Before you start', 'Doing it', 'With other people', 'Changing course', 'After it is done']);
    expect(stations.map((li) => li.dataset.lit)).toEqual(['true', 'false', 'true', 'false', 'false']);
    expect(route.el.getAttribute('aria-label')).toBe('Route: Before you start and With other people');
    expect(route.el.querySelector('.gt-route__text')!.textContent).toMatch(/^Before you start\. .+ With other people\. /);
  });

  it('the medal adds the ring, the return arrows and badge, the technique and the dart in turn', () => {
    const pieces = (svg: SVGSVGElement) => [...svg.querySelectorAll('[data-piece]')].map((n) => n.getAttribute('data-piece'));
    expect(pieces(gearMedal({ frame: false, route: false, section: null, technique: null, commit: false, done: false }))).toEqual([]);
    expect(pieces(gearMedal(medalOf({ frame: 1, phase: 'frame', main: null } as PsSummary)))).toEqual(['ring']);
    expect(pieces(gearMedal(medalOf({ frame: 3, phase: 'explore', main: 'gt_pomodoro' } as PsSummary)))).toEqual(['loop', 'ring', 'technique', 'badge']);
    expect(pieces(gearMedal(medalOf({ frame: 3, phase: 'commit', main: 'gt_pomodoro' } as PsSummary)))).toEqual(['loop', 'ring', 'technique', 'badge', 'dart']);
    expect(pieces(gearMedal(medalOf({ frame: 3, phase: 'finished', main: 'gt_pomodoro' } as PsSummary)))).toContain('done');
    expect(medalOf(explored() as PsSession)).toMatchObject({ frame: true, route: true, section: 'working_with_others', technique: 'gt_appreciation', commit: false });
  });

  it('the coach look frames Gear Shifter’s questions and names techniques plainly', () => {
    expect(GT_LOOK.frames.shift).toEqual({ keys: ['need', 'route', 'known'], prompts: ['What needs to move?', 'Where is it stuck?', 'What do you already know?'] });
    expect(GT_LOOK.noun).toBe('Session');
    expect(plainName('gt_pomodoro')).toBe('Pomodoro Technique');
    expect(plainName('gt_commit')).toBe('Experiment');
    expect(GT_LOOK.emblem('gt_pomodoro').classList.contains('gt-emblem')).toBe(true);
    // Commit's and Review's own tools have marks of their own, not the book's emblem.
    expect(GT_LOOK.emblem('gt_review').querySelector('circle[fill="var(--gt-amber)"]')).not.toBeNull();
    expect(GT_LOOK.emblem('gt_commit').querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
  });
});

/** A framed shift that accepted Getting a Project Done. */
function onProject(): PsSession {
  let s = createSession({ text: 'The community garden project has stalled.', kind: 'shift' }, deps);
  s = reply(s, { frame: { need: 'Get the garden project moving' } });
  s = reply(s, { frame: { route: 'before' } }, 'We never really planned it.');
  s = reply(s, { frame: { known: 'Six volunteers; spring planting.' }, suggestion: { kind: 'next_technique', tool: 'gt_getting_a_project_done', reason: 'The whole project needs a look.' } }, 'Six volunteers.');
  return acceptSuggestion(s, deps) as PsSession;
}

describe('session canvas', () => {
  it('shows the empty state, then the technique in hand, and a strip once there are two runs', () => {
    const host = document.createElement('div');
    const canvas = mountGearCanvas(host);
    canvas.update(fresh());
    expect(host.querySelector('.gt-canvas__empty')).not.toBeNull();
    const s = explored() as PsSession;
    canvas.update(s);
    expect(host.querySelector('.gt-canvas__name')!.textContent).toBe('Appreciation');
    expect(shownRun(s)!.tool).toBe('gt_appreciation');
    expect(host.querySelector('.gt-canvas__strip')).toBeNull();
    const c = committed() as PsSession;
    canvas.update(c);
    expect(host.querySelector('.gt-canvas__name')!.textContent).toBe('The experiment');
    expect([...host.querySelectorAll('.gt-canvas__run')].map((b) => b.querySelector('.gt-canvas__run-name')!.textContent)).toEqual(['Appreciation', 'Experiment']);
    expect(host.querySelector('.gt-commit__rests .dm-entry__meta')!.textContent).toMatch(/^Rests on Appreciation: /);
    host.querySelector<HTMLButtonElement>('.gt-canvas__run')!.click();
    expect(host.querySelector('.gt-canvas__name')!.textContent).toBe('Appreciation');
    expect(host.querySelector('.gt-canvas__back')).not.toBeNull();
    canvas.destroy();
  });

  it('Getting a Project Done’s stations link the techniques for each stage', () => {
    const host = document.createElement('div');
    const picked: string[] = [];
    const canvas = mountGearCanvas(host, { onTechnique: (id) => picked.push(id) });
    canvas.update(onProject());
    const stages = [...host.querySelectorAll<HTMLElement>('.dm-path__stage')];
    expect(stages).toHaveLength(7);
    const first = [...stages[0].querySelectorAll<HTMLButtonElement>('.gt-stage-links button')];
    expect(first.map((b) => b.querySelector('.gt-stage-links__name')!.textContent)).toEqual(['Bursty Communication', 'Brainstorming', 'Structured Evaluation']);
    expect(first[0].getAttribute('aria-label')).toBe('Try Bursty Communication');
    first[1].click();
    expect(picked).toEqual(['gt_brainstorming']);
    canvas.update(onProject());
    expect(stages[0].querySelectorAll('.gt-stage-links').length).toBe(1);
    canvas.destroy();
  });
});

describe('record blocks', () => {
  const date = '2026-10-22';
  it('a write is a heading, every section, then the caption and a link back; ids are fixed', () => {
    const s = committed() as PsSession;
    const offer = actionOffer(s) as PsRecordOffer;
    const blocks = recordBlocks(offer, { sessionId: s.id, date });
    expect(blocks[0]).toMatchObject({ block_type: 'heading', id: recordBlockId(s.id, 1, 1), content: { text: 'Action record: The team report keeps stalling.' } });
    expect(blocks.length).toBe(offer.file.sections.length + 2);
    const last = JSON.stringify(blocks.at(-1));
    expect(last).toContain('Worked with The Get Things Done Book · Appreciation · ');
    expect(last).toContain(`#/gear-shifter?id=${s.id}`);
    expect(last).toContain('Open this session in Gear Shifter');
    expect(recordBlockId(s.id, 2, 3)).toBe(`gt-rec-${s.id.slice(0, 8)}-v2-3`);
  });

  it('an update carries only the changed sections under a dated heading', () => {
    let s = committed() as PsSession;
    const offer = actionOffer(s) as PsRecordOffer;
    s = linkCaseFile(s, { target: { kind: 'project', id: 'p1' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: true }, deps) as PsSession;
    s = { ...s, frame: { ...s.frame, known: 'Due Thursday now; Priya has the data.' } };
    const update = actionOffer(s) as PsRecordOffer;
    expect(update.kind).toBe('update');
    const blocks = recordBlocks(update, { sessionId: s.id, date });
    expect((blocks[0] as { content: { text: string } }).content.text).toMatch(/^Update: /);
    expect(blocks.length).toBe(update.changed.length + 2);
  });

  it('the image is the technique’s file, absolute, and absent without a technique', () => {
    const s = committed() as PsSession;
    const offer = actionOffer(s) as PsRecordOffer;
    expect(provenanceUrl('gt_appreciation', 'https://hub.example', '/tasks/')).toBe('https://hub.example/tasks/get-things-done/provenance/gt_appreciation.svg');
    const image = recordGraphic(offer, { sessionId: s.id, date }, (id) => `https://x/${id}.svg`);
    expect(image).toMatchObject({ block_type: 'image', id: recordBlockId(s.id, 1, 0), content: { url: 'https://x/gt_appreciation.svg', alt_text: 'Appreciation emblem, inside its section’s emblem' } });
    const bare = { ...offer, provenance: { ...offer.provenance, technique: null } } as unknown as PsRecordOffer;
    expect(recordGraphic(bare, { sessionId: s.id, date })).toBeNull();
  });
});

describe('view helpers', () => {
  it('a review link enters only with step=review, by the server’s own rule', () => {
    const done = committed() as PsSession;
    expect(reviewEntry(done, null)).toBeNull();
    expect(reviewEntry(done, 'review')).toEqual({ kind: 'move', step: 'review' });
    expect(reviewEntry(fresh(), 'review')).toBeNull();
  });

  it('the record writer refuses a card whose offer has moved on', async () => {
    const s = committed() as PsSession;
    const offer = actionOffer(s) as PsRecordOffer;
    const write = vi.fn().mockResolvedValue(undefined);
    await latestRecordWriter(() => s, write)(offer, { place: 'new', title: 'x' });
    expect(write).toHaveBeenCalledTimes(1);
    const moved = { ...s, frame: { ...s.frame, known: 'Something else entirely.' } } as PsSession;
    await expect(latestRecordWriter(() => moved, write)(offer, { place: 'new', title: 'x' })).rejects.toThrow('The action record changed; check the card again.');
    expect(write).toHaveBeenCalledTimes(1);
  });
});
