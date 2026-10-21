// Decision Maker's client: its decor (track, compass, medal, coach look), the record's page
// blocks and provenance image, the session canvas, the view's review entry and record writer,
// and the paths Problem Solver's shared components gained for it (the record card and its
// graphic retry, the bridge's graphic, the Decision Maker chip, the shared skills ribbon, the
// coach look and the task origin).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrack, createCompass, decisionMedal, DM_LOOK, plainName, trackStations } from '../../src/views/decision-book/decor';
import { provenanceUrl, recordBlockId, recordBlocks, recordGraphic } from '../../src/views/decision-book/record-blocks';
import { mountDecisionCanvas, shownRun } from '../../src/views/decision-book/canvas';
import { latestRecordWriter, reviewEntry } from '../../src/views/decision-book/view';
import { createCaseFileBridge } from '../../src/views/problem-solver/case-file-bridge';
import { mountTaskCards } from '../../src/views/problem-solver/task-cards';
import { decisionMakerChips } from '../../src/views/problem-solver/link-chips';
import { skillsRibbon } from '../../src/views/problem-solver/skills-ribbon';
import { mountCoachPanel } from '../../src/views/problem-solver/coach-panel';
import { PS_ORIGIN, reviewBody, taskBody } from '../../src/views/problem-solver/task-bridge';
import { scriptedCoach } from '../../../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { acceptSuggestion, applyCoachTurn, createSession, linkCaseFile, moveOn, say, setReviewTask } from '../../../../netlify/functions/_shared/problem-solver/session.mjs';
import { recordOffer } from '../../../../packages/decision-book/record.mjs';
import type { PsRecordOffer, PsSession, PsSummary } from '../../../../packages/problem-solver/types';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
type Session = PsSession;

async function step(session: Session, text?: string): Promise<Session> {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps) as Session;
}

/** A decision walked by the scripted coach to `until`: framed, explored, or decided. */
async function walk(until: 'framed' | 'explored' | 'decided'): Promise<Session> {
  let s = await step(createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision' }, deps) as Session);
  s = await step(s, 'It is about me and I want to understand what I really want.');
  s = await step(s, 'The offer closes Friday and the rent there is double.');
  if (until === 'framed') return s;
  s = await step(acceptSuggestion(s, deps) as Session);
  for (const t of ['Reply to the Sydney offer letter, do immediately', 'Talk the move over with my partner, decide when', 'Sort out the lease renewal paperwork, do later', 'reflection: The offer reply is the only thing that cannot wait.']) s = await step(s, t);
  if (until === 'explored') return s;
  s = await step(s, 'decide');
  s = await step(acceptSuggestion(s, deps) as Session);
  s = await step(s, 'I decide faster once the urgent part is named.');
  s = await step(acceptSuggestion(s, deps) as Session);
  for (const t of ['I will take the Sydney job and move in March.', 'The offer reply cannot wait and it matters most.', 'The rent there goes above half of my pay.', 'Then I look at the flats further out instead.', 'Email my acceptance to the Sydney office on Monday.', 'Review it on 2027-01-21']) s = await step(s, t);
  return s;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('decor', () => {
  it('the track moves Frame, Explore, Decide, Review, and waits on the review date', async () => {
    const framed = await walk('framed');
    expect(trackStations(createSession({ text: 'x', kind: 'decision' }, deps) as Session).stations.map((s) => s.state)).toEqual(['now', 'future', 'future', 'future']);
    expect(trackStations(framed).stations.map((s) => [s.state, s.note])).toEqual([['done', 'Done'], ['now', 'Pick a model'], ['future', ''], ['future', '']]);
    const decided = await walk('decided');
    expect(trackStations(decided).stations.map((s) => s.state)).toEqual(['done', 'done', 'now', 'future']);
    expect(trackStations(decided).stations[1].note).toBe('1 model');
    expect(trackStations(decided).stations[3].note).toMatch(/^Due 21 Jan/);
    const waiting = await step(moveOn(setReviewTask(decided, { taskId: 'tr', due: '2027-01-21' }, deps), deps) as Session);
    expect(trackStations(waiting).stations[3].state).toBe('waiting');
    const track = createTrack();
    track.update(waiting);
    expect(track.el.querySelector('[aria-current="step"]')).toBeNull();
    expect([...track.el.querySelectorAll('.ps-track__name')].map((e) => e.textContent)).toEqual(['Frame', 'Explore', 'Decide', 'Review']);
  });

  it('the compass lights the answered quadrant and says what it means', async () => {
    const compass = createCompass();
    compass.update(createSession({ text: 'x', kind: 'decision' }, deps) as Session);
    expect(compass.el.hidden).toBe(true);
    compass.update(await walk('framed'));
    expect(compass.el.hidden).toBe(false);
    expect([...compass.el.querySelectorAll('.dm-compass__q')].map((q) => (q as HTMLElement).dataset.lit)).toEqual(['true', 'false', 'false', 'false']);
    expect(compass.el.querySelector('.dm-compass__text')!.textContent).toMatch(/^Understand yourself\. The decision is about you/);
    expect(compass.el.getAttribute('aria-label')).toBe('Section compass: Understand yourself');
  });

  it('the medal fills disc by disc and centres the main model', () => {
    const fills = (svg: SVGSVGElement) => [...svg.querySelectorAll('circle')].slice(0, 2).map((c) => c.getAttribute('fill'));
    expect(fills(decisionMedal(0, null))).toEqual(['var(--dm-ghost)', 'var(--dm-ghost)']);
    expect(fills(decisionMedal(2, null))).toEqual(['var(--dm-red)', 'var(--dm-green)']);
    expect(decisionMedal(2, null).querySelectorAll('.dm-medal__piece').length).toBe(2);
    expect(decisionMedal(3, 'dm_eisenhower').querySelector('.dm-medal__model svg')).not.toBeNull();
  });

  it('the coach look frames the decision questions and names models plainly', () => {
    expect(DM_LOOK.frames.decision.keys).toEqual(['decision', 'compass', 'known']);
    expect(plainName('dm_project_portfolio')).toBe('Project portfolio matrix');
    const panel = mountCoachPanel({ onSay: () => {}, onAction: () => {} }, { look: DM_LOOK });
    panel.update({ ...(createSession({ text: 'x', kind: 'decision' }, deps) as Session), runner: { status: 'idle', mode: 'turn', error: null }, frame: { decision: 'd' } });
    expect(panel.el.querySelector('.ps-composer__now')!.textContent).toBe('Answering: Who is it about, and what do you want?');
  });
});

describe('record blocks', () => {
  const offerOf = async () => recordOffer(await walk('decided')) as PsRecordOffer;

  it('a write is a heading, every section, then the caption and a link back; ids are fixed', async () => {
    const offer = await offerOf();
    const blocks = recordBlocks(offer, { sessionId: 'abcdef12-3456', date: '20261021' });
    expect(blocks[0]).toMatchObject({ id: recordBlockId('abcdef12-3456', 1, 1), block_type: 'heading', variant: 'section', content: { text: 'Decision: Should I take the Sydney job offer?' } });
    expect(blocks).toHaveLength(1 + offer.file.sections.length + 1);
    const last = blocks.at(-1) as { content: { html: string } };
    expect(last.content.html).toBe('<p><em>Decided with The Decision Book · The Eisenhower matrix · 21 October 2026</em></p><p><a href="#/decision-maker?id=abcdef12-3456">Open this decision in Decision Maker</a></p>');
  });

  it('an update carries only the changed sections under a dated heading', async () => {
    const offer = { ...(await offerOf()), kind: 'update' as const, version: 2, changed: ['outcome'] };
    offer.file = { ...offer.file, sections: [...offer.file.sections, { key: 'outcome', heading: 'What happened', lines: ['It took four months.'] }] };
    const blocks = recordBlocks(offer, { sessionId: 'abcdef12-3456', date: '20270121' });
    expect(blocks).toHaveLength(3);
    expect((blocks[0] as { variant: string }).variant).toBe('subsection');
    expect((blocks[0] as { content: { text: string } }).content.text).toMatch(/^Update: /);
  });

  it('the provenance image is the main model’s file, absolute, with no caption of its own', async () => {
    const offer = await offerOf();
    expect(provenanceUrl('dm_eisenhower', 'https://hub.example', '/tasks/')).toBe('https://hub.example/tasks/decision-book/provenance/dm_eisenhower.svg');
    const image = recordGraphic(offer, { sessionId: 'abcdef12-3456', date: '20261021' }) as { id: string; block_type: string; content: Record<string, string> };
    expect(image.id).toBe(recordBlockId('abcdef12-3456', 1, 0));
    expect(image.block_type).toBe('image');
    expect(image.content.url).toMatch(/\/decision-book\/provenance\/dm_eisenhower\.svg$/);
    expect(image.content.alt_text).toBe("The Eisenhower matrix emblem, inside its section's emblem");
    expect(image.content.caption).toBeUndefined();
    expect(recordGraphic({ ...offer, provenance: { ...offer.provenance, model: null } }, { sessionId: 'a', date: 'b' })).toBeNull();
  });
});

describe('session canvas', () => {
  it('shows the empty state, then the run in hand, and a strip to look back at earlier models', async () => {
    const host = document.createElement('div');
    const canvas = mountDecisionCanvas(host);
    canvas.update(await walk('framed'));
    expect(host.querySelector('.dm-canvas__empty')).not.toBeNull();
    const decided = await walk('decided');
    canvas.update(decided);
    expect(shownRun(decided)?.tool).toBe('dm_record');
    expect(host.querySelector('.dm-canvas__name')!.textContent).toBe('The decision record');
    const reason = decided.steps.decide.runs[0].nodes.find((node) => node.slot === 'reason:1')!;
    expect(host.querySelector(`.dm-entry[data-node="${reason.id}"] .dm-entry__meta`)!.textContent).toMatch(/^Rests on The Eisenhower matrix: /);
    const runs = [...host.querySelectorAll<HTMLButtonElement>('.dm-canvas__run')];
    expect(runs.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Eisenhower matrix', 'false'], ['Decision record', 'true']]);
    runs[0].click();
    expect(host.querySelector('.dm-canvas__name')!.textContent).toBe('The Eisenhower matrix');
    host.querySelector<HTMLButtonElement>('.dm-canvas__back')!.click();
    expect(host.querySelector('.dm-canvas__name')!.textContent).toBe('The decision record');
    canvas.destroy();
  });
});

describe('view helpers', () => {
  it('a review link enters only with step=review, by the server’s own rule', async () => {
    const decided = await walk('decided');
    const waiting = await step(moveOn(setReviewTask(decided, { taskId: 'tr', due: '2027-01-21' }, deps), deps) as Session);
    expect(reviewEntry(waiting, 'review')).toEqual({ kind: 'start', step: 'review' });
    expect(reviewEntry(waiting, 'improve')).toBeNull();
  });

  it('the record writer refuses a card whose offer has moved on', async () => {
    const decided = await walk('decided');
    const offer = recordOffer(decided) as PsRecordOffer;
    const write = vi.fn().mockResolvedValue(undefined);
    await latestRecordWriter(() => decided, write)(offer, { place: 'new', title: offer.file.title });
    expect(write).toHaveBeenCalledWith(decided, offer, { place: 'new', title: offer.file.title });
    await expect(latestRecordWriter(() => decided, write)({ ...offer, key: 'stale' }, { place: 'new', title: 'x' })).rejects.toThrow('The decision record changed; check the card again.');
  });
});

describe('shared components, Decision Maker paths', () => {
  const bridgeDeps = (over: Record<string, unknown> = {}) => ({
    createProject: vi.fn().mockResolvedValue({ id: 'proj-1' }),
    getProject: vi.fn().mockResolvedValue({ id: 'proj-1', page_blocks: [{ id: 'old' }] }),
    updateProject: vi.fn().mockResolvedValue({}),
    getTask: vi.fn(),
    updateTask: vi.fn(),
    link: vi.fn().mockResolvedValue(undefined),
    today: () => '20261021',
    blocks: (offer: PsRecordOffer, opts: { sessionId: string; date: string }) => recordBlocks(offer, opts),
    graphic: (offer: PsRecordOffer, opts: { sessionId: string; date: string }) => recordGraphic(offer, opts, (model) => `https://hub.example/${model}.svg`),
    ...over
  });

  it('the bridge writes the graphic above the text and says it wrote', async () => {
    const decided = await walk('decided');
    const offer = recordOffer(decided) as PsRecordOffer;
    const d = bridgeDeps();
    await createCaseFileBridge(d as never).write(decided, offer, { place: 'new', title: offer.file.title });
    const blocks = d.updateProject.mock.calls[0][1].page_blocks;
    expect(blocks.map((b: { block_type?: string; id: string }) => b.block_type ?? b.id).slice(0, 3)).toEqual(['old', 'image', 'heading']);
    expect(d.link).toHaveBeenCalledWith(expect.objectContaining({ version: 1, graphic: true }));
  });

  it('a graphic that will not write leaves the text, says so, and a retry puts it above the heading', async () => {
    let s = await walk('decided');
    const offer = recordOffer(s) as PsRecordOffer;
    const d = bridgeDeps();
    d.updateProject.mockImplementation(async (_id: string, body: { page_blocks: Array<{ block_type?: string }> }) => {
      if (body.page_blocks.some((b) => b.block_type === 'image')) throw new Error('image refused');
      return {};
    });
    await createCaseFileBridge(d as never).write(s, offer, { place: 'new', title: offer.file.title });
    expect(d.link).toHaveBeenCalledWith(expect.objectContaining({ graphic: false }));
    s = linkCaseFile(s, d.link.mock.calls[0][0], deps) as Session;
    const retry = recordOffer(s) as PsRecordOffer;
    expect(retry.kind).toBe('graphic');
    const text = recordBlocks(offer, { sessionId: s.id, date: '20261021' });
    const retried = bridgeDeps({ getProject: vi.fn().mockResolvedValue({ id: 'proj-1', page_blocks: [{ id: 'old' }, ...text] }) });
    await createCaseFileBridge(retried as never).write(s, retry, { place: s.caseFile!.target, title: s.caseFile!.title });
    const ids = retried.updateProject.mock.calls[0][1].page_blocks.map((b: { id: string }) => b.id);
    expect(ids.slice(0, 3)).toEqual(['old', recordBlockId(s.id, 1, 0), recordBlockId(s.id, 1, 1)]);
    expect(retried.link).toHaveBeenCalledWith(expect.objectContaining({ version: 1, graphic: true }));
  });

  it('the record card names the decision record, takes any title, and offers to retry the graphic', async () => {
    let s = await walk('decided');
    const write = vi.fn().mockResolvedValue(undefined);
    const handlers = { create: vi.fn(), dismiss: vi.fn(), createReview: vi.fn(), dismissReview: vi.fn(), places: vi.fn().mockResolvedValue([]), writeCaseFile: write, dismissCaseFile: vi.fn() };
    const cards = mountTaskCards(handlers, { paper: { offer: (x) => recordOffer(x) as PsRecordOffer | null, noun: 'decision record', strictNames: false } });
    cards.update(s);
    const card = cards.el.querySelector('.ps-casefilecard')!;
    expect(card.querySelector('.ps-taskcard__meta')!.textContent).toBe('Write the decision record?');
    card.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'Sydney: the call';
    card.querySelector<HTMLButtonElement>('[data-act="write-casefile"]')!.click();
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    expect(write.mock.calls[0][1]).toMatchObject({ place: 'new', title: 'Sydney: the call' });
    const offer = recordOffer(s) as PsRecordOffer;
    s = linkCaseFile(s, { target: { kind: 'project', id: 'p1' }, version: 1, title: 'Sydney: the call', sections: offer.digests, graphic: false }, deps) as Session;
    cards.update(s);
    expect(cards.el.querySelector('.ps-casefilecard .ps-taskcard__meta')!.textContent).toBe("The decision record's graphic did not write. Try it again?");
    expect(cards.el.querySelector('[data-act="write-casefile"]')!.textContent).toBe('Retry the graphic');
  });

  it('a Decision Maker chip opens the decision, a review chip at Review', async () => {
    const linked = vi.fn().mockResolvedValue([{ id: 'd1', title: 'Sydney', phase: 'review', model: 'decision_book', role: 'review' }]);
    const host = decisionMakerChips({ kind: 'task', id: 't1' }, { linked });
    await vi.waitFor(() => expect(host.querySelector('a')).not.toBeNull());
    expect(host.querySelector('a')!.getAttribute('href')).toBe('#/decision-maker?id=d1&step=review');
    expect(host.querySelector('a')!.textContent).toBe('Review in Decision Maker: Sydney');
    expect(host.querySelector('a')!.classList.contains('ps-linkchip--dm')).toBe(true);
  });

  it('the skills ribbon sums both tools and splits each bar', () => {
    const row = (skills: Record<string, number>) => ({ skills }) as unknown as PsSummary;
    const ribbon = skillsRibbon({ name: 'Decision Maker', sessions: [row({ analysis: 3 })] }, { name: 'Problem Solver', sessions: [row({ analysis: 1, learning: 4 })] }, () => 'var(--dm-ink)');
    expect([...ribbon.querySelectorAll('.ps-ribbon__key')].map((k) => k.textContent)).toEqual(['Decision Maker', 'Problem Solver']);
    const analysis = [...ribbon.querySelectorAll('.ps-skills__item')].find((i) => i.textContent!.includes('Analysis'))!;
    expect(analysis.querySelector('.ps-skills__count')!.textContent).toBe('4×');
    expect((analysis.querySelector('.ps-skills__own') as HTMLElement).style.getPropertyValue('--w')).toBe('75%');
    expect((analysis.querySelector('.ps-skills__other') as HTMLElement).style.getPropertyValue('--w')).toBe('25%');
  });

  it('tasks carry their tool: Problem Solver by default, Decision Maker when it says so', async () => {
    const s = await walk('framed');
    expect(taskBody(s, { title: 'T', due: null }, 'life')).toMatchObject({ source: 'problem_solver', tags: ['problem-solver'] });
    const origin = { name: 'Decision Maker', source: 'decision_maker', tag: 'decision-maker', noun: 'decision', review: 'the decision "%s" has worked out' };
    expect(taskBody(s, { title: 'T', due: null }, 'life', undefined, origin)).toMatchObject({ source: 'decision_maker', tags: ['decision-maker'], description: 'From Decision Maker: Should I take the Sydney job offer?' });
    expect(reviewBody(s, { title: 'R', due: '2027-01-21' }, 'life', origin)).toMatchObject({ tags: ['decision-maker', 'review'], description: 'Review how the decision "Should I take the Sydney job offer?" has worked out.' });
    expect(PS_ORIGIN.source).toBe('problem_solver');
  });
});
