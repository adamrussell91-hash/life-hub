// apps/tasks/src/views/get-things-done/view.ts
// Gear Shifter in the Tasks hub (#/gear-shifter): the landing page (hero, the New box, Quick
// start, your work, how a session builds, the five sections in route order, the shared skills
// ribbon) and the session page (track, route above the canvas, the medal, the shelf, coach,
// skill tray, review panel, task and record cards). Its structure is Decision Maker's
// (decision-book/view.ts): the coach panel, task cards, bridges, review panel and syncs are
// Problem Solver's own components, given Gear Shifter's API, look, origin and record.
import '../../../../../packages/problem-solver/problem-solver.css';
import '../../../../../packages/decision-book/decision-book.css';
import '../../../../../packages/get-things-done/get-things-done.css';
import '../problem-solver/problem-solver-view.css';
import './get-things-done-view.css';
import { el } from '@/views/hub-kit';
import { hashQuery } from '@/shell/shell';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { tasksApi } from '@/services/client-api';
import { onTasksChanged, onTasksDeleted } from '@/services/task-cache';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { skillGlyph } from '../../../../../packages/problem-solver/glyphs';
import { planStepForBook, stepName, toolsForPlanStep } from '../../../../../packages/problem-solver/steps.mjs';
import { reviewStart, waitingForReview } from '../../../../../packages/problem-solver/review.mjs';
import type { PsAction, PsRecordOffer, PsSession, PsSummary } from '../../../../../packages/problem-solver/types';
import { CATALOGUE, SECTIONS } from '../../../../../packages/get-things-done/catalogue.mjs';
import { ROUTE, parseRoute } from '../../../../../packages/get-things-done/route.mjs';
import { actionOffer, composeActionRecord } from '../../../../../packages/get-things-done/record.mjs';
import { bookEmblem, entryEmblem, sectionEmblem } from '../../../../../packages/get-things-done/glyphs';
import { decisionBookApi, gearShifterApi, isBusy, pollUntilSettled, problemSolverApi } from '../problem-solver/api';
import { mountCoachPanel } from '../problem-solver/coach-panel';
import { createTaskBridge, type TaskOrigin } from '../problem-solver/task-bridge';
import { mountReviewPanel, reviewBanner, type ReviewEntry } from '../problem-solver/review-panel';
import { createReviewSync } from '../problem-solver/review-sync';
import { compactToday, mountTaskCards, type PlaceOption } from '../problem-solver/task-cards';
import { createCaseFileBridge, type CaseFilePlace, type PaperOffer } from '../problem-solver/case-file-bridge';
import { createSessionSync } from '../problem-solver/session-sync';
import { skillsRibbon } from '../problem-solver/skills-ribbon';
import { caseFilePlaces, createSkillTray, section } from '../problem-solver/view';
import { GT_LOOK, createRoute, createShapeBoard, createTrack, dart, gear, gearMedal, medalOf, plainName, returns, svg, target, toolNamed } from './decor';
import { mountGearCanvas, type GtRunScores } from './canvas';
import { recordBlocks, recordGraphic } from './record-blocks';

let poll: AbortController | null = null;
/** The open session's canvas and Tasks listeners, dropped when the page changes. */
let canvasNow: { destroy(): void } | null = null;
let unsubscribeNow: Array<() => void> = [];

const ORIGIN: TaskOrigin = { name: 'Gear Shifter', source: 'gear_shifter', tag: 'gear-shifter', noun: 'session', review: 'the experiment for "%s" went, then open it in Gear Shifter to see what changed, what it cost and what to keep' };

/** The techniques Explore offers, in catalogue order (the shelf). */
const shelfTools = (): string[] => toolsForPlanStep('gear_shifter', 'explore') as string[];

/* ── Landing ────────────────────────────────────────────────────────── */

const PHASES: Record<string, { label: string; colour: string }> = {
  frame: { label: 'Framing', colour: 'var(--gt-red)' },
  explore: { label: 'Exploring', colour: 'var(--gt-blue)' },
  commit: { label: 'Committing', colour: 'var(--gt-amber)' },
  review: { label: 'Reviewing', colour: 'var(--gt-amber)' },
  finished: { label: 'Finished', colour: 'var(--gt-ink)' }
};

/** The meta line's middle part: the question being framed, or the technique in hand and any check-back. */
function metaNote(row: PsSummary): string {
  if (row.phase === 'frame') return `Question ${Math.min((row.frame ?? 0) + 1, 3)} of 3`;
  const technique = row.main ?? row.tool;
  const name = technique ? plainName(technique) : '';
  const due = row.reviewDue ? `check back ${formatDisplayDate(row.reviewDue)}` : '';
  return [name, due].filter(Boolean).join(' · ');
}

function workCard(row: PsSummary, index: number): HTMLLIElement {
  const item = el('li', 'ps-prob gt-prob') as HTMLLIElement;
  item.style.setProperty('--i', String(index));
  const link = el('a', 'ps-prob__link') as HTMLAnchorElement;
  link.href = `#/gear-shifter?id=${row.id}`;
  const medal = el('span', 'ps-prob__medal');
  medal.append(gearMedal(medalOf(row)));
  const body = el('span', 'ps-prob__body');
  const meta = el('span', 'ps-prob__meta');
  const phase = PHASES[row.phase] ?? { label: row.phase, colour: 'var(--gt-ink)' };
  const chip = el('span', 'ps-prob__phase', phase.label);
  chip.style.setProperty('--c', phase.colour);
  meta.append(chip, el('span', '', metaNote(row)), el('span', '', formatDisplayDate(row.updatedAt.slice(0, 10))));
  body.append(el('span', 'ps-prob__title', row.title), meta);
  const seen = Object.keys(row.skills ?? {});
  if (seen.length) {
    const glyphs = el('span', 'ps-prob__skills');
    glyphs.append(...seen.slice(0, 6).map((id) => skillGlyph(id)));
    body.append(glyphs);
  }
  link.append(medal, body);
  item.append(link);
  return item;
}

type StartForm = { el: HTMLFormElement; startFrom(technique: string): void };

function startForm(onType: () => void): StartForm {
  const start = el('form', 'ps-start gt-start') as HTMLFormElement;
  const head = el('div', 'gt-start__head');
  const disc = el('span', 'gt-start__disc');
  disc.append(svg('0 0 100 100', `<circle cx="50" cy="50" r="48" fill="var(--gt-red-tint)"/>${target(50, 50, 40)}`));
  head.append(el('h2', 'ps-start__title', 'What do you need to get moving?'), disc);
  const input = el('textarea', 'ps-start__input') as HTMLTextAreaElement;
  input.rows = 3;
  input.placeholder = 'A project you cannot start, a task that keeps slipping, work that depends on someone else. Say it the way you would to a friend.';
  input.setAttribute('aria-label', 'Describe what needs to move');
  const go = el('button', 'btn btn--primary', 'Start') as HTMLButtonElement;
  go.type = 'submit';
  const status = el('p', 'ps-start__status');
  status.setAttribute('role', 'status');
  const picked = el('p', 'gt-start__picked');
  picked.hidden = true;
  const row = el('div', 'ps-start__row');
  row.append(status, go);
  start.append(head, picked, input, row);
  let startModel: string | null = null;
  input.addEventListener('input', () => {
    start.classList.remove('is-typing');
    void start.offsetWidth;
    start.classList.add('is-typing');
    onType();
  });
  start.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    go.disabled = true;
    status.textContent = '';
    try {
      const session = await gearShifterApi.create({ text, kind: 'shift', ...(startModel ? { startModel } : {}) });
      location.hash = `#/gear-shifter?id=${session.id}`;
    } catch (err) {
      status.textContent = errorMessage(err);
      go.disabled = false;
    }
  });
  return {
    el: start,
    /** A technique picked on the shelf: the session will open on it once it is framed. */
    startFrom(technique: string) {
      startModel = technique;
      const clear = el('button', 'gt-start__clear', 'Clear') as HTMLButtonElement;
      clear.type = 'button';
      clear.addEventListener('click', () => {
        startModel = null;
        picked.hidden = true;
        input.focus();
      });
      picked.replaceChildren(entryEmblem(technique), el('span', '', `Starting from ${toolNamed(technique)?.name ?? technique}`), clear);
      picked.hidden = false;
      input.focus();
    }
  };
}

/** Quick start's card. The route itself is built in Plan 6; until then the card says what it will do. */
function quickCard(): HTMLElement {
  const card = el('section', 'gt-quick');
  const mark = el('span', 'gt-quick__mark');
  mark.append(svg('0 0 100 100', target(58, 58, 40) + dart(6, 6, 52, 52, 8)));
  const text = el('div', 'gt-quick__text');
  text.append(
    el('h2', 'gt-quick__title', 'Quick start'),
    el('p', 'gt-quick__line', 'For one stalled task: a small first move, how it starts, and when to check back.'),
    el('p', 'gt-quick__soon', 'Not open yet. Use the box above for now.')
  );
  card.append(mark, text);
  return card;
}

function buildSteps(): HTMLElement {
  const steps: Array<[string, string, string, string]> = [
    ['Frame', 'Three questions', 'What needs to move, where it is stuck on the route, and what you already know.', target(50, 50, 44)],
    ['Explore', 'One technique', 'The coach names the obstacle and picks one technique to build with you, answer by answer.', `<g class="gt-build__turn">${gear(50, 50, 44)}</g>`],
    ['Commit', 'A small experiment', 'A next action you could start today, how it starts, and a date to check back.', `${target(50, 50, 44)}${dart(96, 4, 58, 42, 7)}`],
    ['Review', 'Come back round', 'What changed, what it cost and what to keep. A finished project gets Project Evaluation.', `${returns(50, 50, 38, 9)}<circle cx="50" cy="50" r="9" fill="var(--gt-amber)"/>`]
  ];
  const list = el('ol', 'ps-build gt-build');
  steps.forEach(([label, title, detail, art], i) => {
    const step = el('li', 'ps-build__step');
    const figure = el('span', 'ps-build__art');
    figure.append(svg('0 0 100 100', art));
    step.append(figure, el('span', 'ps-build__n', `${i + 1} · ${label}`), el('h3', 'ps-build__title', title), el('p', 'ps-build__detail', detail));
    list.append(step);
  });
  return list;
}

/** One line per section: what its techniques are for, in our words. */
const SECTION_LINES: Record<string, string> = {
  before_doing: 'Plan, budget and shape the day so the start is easy.',
  doing_things: 'Get going, hold your attention and finish what is half done.',
  working_with_others: 'Feedback, ideas and goodwill, when the work depends on other people.',
  doing_differently: 'Know your limits, drop the extras and lead a change.',
  reviewing: 'Look back at the result and at how the work felt, then reset.'
};

/**
 * The five sections in route order, each opening its shelf of technique emblems with a "use it
 * when" line. A technique can start a session: the New box then opens on it once it is framed.
 */
function sectionShelves(onStart: (technique: string) => void): HTMLElement {
  const offered = new Set(shelfTools());
  const wrap = el('div', 'gt-sections');
  ROUTE.forEach((station, k) => {
    const s = SECTIONS.find((item) => item.key === station.section)!;
    const entries = CATALOGUE.filter((e) => e.section === s.key && offered.has(e.id));
    const box = el('details', 'gt-sect') as HTMLDetailsElement;
    box.open = true;
    const summary = el('summary', 'gt-sect__head');
    const mark = el('span', 'gt-sect__mark');
    mark.append(sectionEmblem(s.key), el('span', 'gt-sect__stn', `Station ${k + 1}`));
    const text = el('span', 'gt-sect__text');
    text.append(el('span', 'gt-sect__title', s.title), el('span', 'gt-sect__line', `${station.label}. ${SECTION_LINES[s.key]} ${entries.length} techniques.`));
    summary.append(mark, text);
    const shelf = el('ul', 'ps-shelf gt-shelf');
    for (const e of entries) {
      const tool = toolNamed(e.id)!;
      const item = el('li', 'ps-shelf__tool gt-shelf__tool');
      item.dataset.tool = e.id;
      const name = el('span', 'ps-shelf__name', tool.name);
      if (e.tier === 'lens') name.append(' ', el('em', 'gt-shelf__tag', 'lens'));
      if (e.reuse) name.append(' ', el('em', 'gt-shelf__tag', 'from Problem Solver'));
      const use = el('button', 'gt-shelf__start', 'Start from this') as HTMLButtonElement;
      use.type = 'button';
      use.setAttribute('aria-label', `Start a session from ${tool.name}`);
      use.addEventListener('click', () => onStart(e.id));
      item.append(entryEmblem(e.id), name, el('span', 'ps-shelf__when', tool.when), use);
      shelf.append(item);
    }
    box.append(summary, shelf);
    wrap.append(box);
  });
  return wrap;
}

async function renderList(canvas: HTMLElement): Promise<void> {
  const page = el('div', 'ps-page ps-landing ps-scope gt-scope gt-page');
  const board = createShapeBoard();
  const hero = el('div', 'ps-hero');
  const copy = el('div', 'ps-hero__copy');
  const start = startForm(() => board.nudge());
  const lede = el('div', 'gt-hero__lede');
  lede.append(bookEmblem(), el('p', 'ps-hero__lede', 'For when something will not move. Say what is stuck: a coach finds where, picks one technique from The Get Things Done Book and helps you try it as a small, dated experiment.'));
  copy.append(lede, start.el, quickCard());
  hero.append(copy, board.el);
  page.append(hero);

  const [sessions, decisions, problems] = await Promise.all([
    gearShifterApi.list().then((rows) => rows.filter((item) => item.status !== 'archived')),
    // The shared tally only: a tool that cannot be reached leaves its share out.
    decisionBookApi.list().catch(() => [] as PsSummary[]),
    problemSolverApi.list().catch(() => [] as PsSummary[])
  ]);
  const list = el('ul', 'ps-probs');
  list.append(...sessions.map(workCard));
  const fresh = el('li', 'ps-prob ps-prob--new');
  const freshButton = el('button', 'ps-prob__new', '+ New session') as HTMLButtonElement;
  freshButton.type = 'button';
  const toStart = () => {
    page.querySelector<HTMLTextAreaElement>('.ps-start__input')?.focus();
    page.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };
  freshButton.addEventListener('click', toStart);
  fresh.append(freshButton);
  list.append(fresh);

  page.append(
    section('Your work', sessions.length ? 'Each medal is the cover, built as the session moves: the red ring fills with the frame, the blue arrows arrive with the route and its section, the dart lands at Commit. The technique in use sits in the middle.' : 'Nothing yet. Start with the thing you keep putting off.', list),
    section('How a session builds', 'One technique per session, tried as an experiment. The coach chooses from the book; you can always pick from the shelf instead.', buildSteps()),
    section('The five sections', 'The book’s five parts, in the order a piece of work lives through them. Start from any technique to open a session already on it.', sectionShelves((technique) => {
      start.startFrom(technique);
      toStart();
    })),
    section('Thinking skills you have used', 'One tally across all three tools. Faint marks have not come up yet.', skillsRibbon(
      { name: 'Gear Shifter', sessions },
      [{ name: 'Decision Maker', sessions: decisions, colour: 'var(--gt-ink)' }, { name: 'Problem Solver', sessions: problems }],
      () => 'var(--gt-blue)'
    ))
  );
  canvas.replaceChildren(page);
}

/* ── Session ────────────────────────────────────────────────────────── */

/** How a review link (`step=review`) enters the session, or null when it cannot start a review now. */
export function reviewEntry(session: PsSession, wanted: string | null): ReviewEntry | null {
  if (wanted !== 'review') return null;
  const kind = reviewStart(session);
  const step = session.model ? planStepForBook(session.model.id, 'improve') : null;
  return kind && step ? { kind, step } : null;
}

type RecordChoice = { place: CaseFilePlace; title: string; moved?: boolean };

/** The record card's write, run from the latest session at click time (the offer must still be the card's). */
export function latestRecordWriter(latest: () => PsSession, write: (session: PsSession, offer: PsRecordOffer, choice: RecordChoice) => Promise<void>) {
  return async (offer: PaperOffer, choice: RecordChoice) => {
    const session = latest();
    const now = actionOffer(session) as PsRecordOffer | null;
    if (!now || now.key !== offer.key) throw new Error('The action record changed; check the card again.');
    await write(session, now, choice);
  };
}

/** The medal beside the coach, with a word for each piece: frame, route, technique and dart. */
function createMedalCard() {
  const card = el('section', 'gt-medal-card');
  card.setAttribute('aria-label', 'This session’s medal');
  const art = el('span', 'gt-medal-card__art');
  const legend = el('ul', 'gt-medal-card__legend');
  const text = el('div', 'gt-medal-card__text');
  text.append(el('h2', 'gt-medal-card__title', 'This session’s medal'), legend);
  card.append(art, text);
  let key = '';
  return {
    el: card,
    update(session: PsSession) {
      const state = medalOf(session);
      const stations = (parseRoute(session.frame?.route ?? '') as string[]).map((id) => ROUTE.find((r) => r.id === id)!.label);
      const next = JSON.stringify([state, stations]);
      if (next === key) return;
      key = next;
      art.replaceChildren(gearMedal(state));
      const line = (on: boolean, name: string, value: string, tone: string) => {
        const item = el('li', 'gt-medal-card__item');
        item.dataset.on = String(on);
        item.style.setProperty('--c', tone);
        item.append(el('b', '', name), el('span', '', value));
        return item;
      };
      legend.replaceChildren(
        line(state.frame, 'Frame', state.frame ? 'answered' : 'to answer', 'var(--gt-red)'),
        line(state.route, 'Route', stations.length ? stations.join(' and ') : 'not placed yet', 'var(--gt-blue)'),
        line(Boolean(state.technique), 'Technique', state.technique ? plainName(state.technique) : 'not chosen yet', 'var(--gt-ink)'),
        line(state.commit, 'Dart', state.commit ? 'landed at Commit' : 'lands at Commit', 'var(--gt-ink)')
      );
    }
  };
}

/** The shelf on the session page: every technique by section, each asking the coach for it. Open in Explore only. */
function createShelf(onPick: (technique: string) => void) {
  const box = el('details', 'gt-session-shelf') as HTMLDetailsElement;
  const summary = el('summary', 'gt-session-shelf__head', 'Pick a technique from the shelf');
  const offered = new Set(shelfTools());
  const body = el('div', 'gt-session-shelf__body');
  for (const station of ROUTE) {
    const s = SECTIONS.find((item) => item.key === station.section)!;
    const group = el('div', 'gt-session-shelf__group');
    group.dataset.station = station.id;
    const list = el('ul', 'gt-session-shelf__list');
    for (const e of CATALOGUE.filter((item) => item.section === s.key && offered.has(item.id))) {
      const item = el('li', '');
      const button = el('button', 'gt-session-shelf__pick') as HTMLButtonElement;
      button.type = 'button';
      button.dataset.tool = e.id;
      button.title = toolNamed(e.id)!.when;
      button.append(entryEmblem(e.id), el('span', '', toolNamed(e.id)!.name));
      button.addEventListener('click', () => onPick(e.id));
      item.append(button);
      list.append(item);
    }
    group.append(el('h3', 'gt-session-shelf__title', `${station.label}: ${s.title}`), list);
    body.append(group);
  }
  box.append(summary, el('p', 'gt-session-shelf__line', 'The coach suggests one technique; you can ask for another. Your stations on the route come first.'), body);
  let key = '';
  return {
    el: box,
    update(session: PsSession) {
      box.hidden = session.phase !== 'explore';
      const lit = parseRoute(session.frame?.route ?? '') as string[];
      const next = lit.join('+');
      if (next === key) return;
      key = next;
      // The lit stations' sections first, then the rest in route order.
      const groups = [...body.children] as HTMLElement[];
      groups.sort((a, b) => Number(!lit.includes(a.dataset.station!)) - Number(!lit.includes(b.dataset.station!)) || ROUTE.findIndex((r) => r.id === a.dataset.station) - ROUTE.findIndex((r) => r.id === b.dataset.station));
      body.append(...groups);
      for (const group of groups) group.dataset.lit = String(lit.includes(group.dataset.station!));
    }
  };
}

function syncFor(initial: PsSession, render: (session: PsSession) => void, alive: () => boolean) {
  return createSessionSync({
    initial,
    render,
    actWith: (s, action, payload) => gearShifterApi.actWith(s, action, payload),
    get: (sessionId) => gearShifterApi.get(sessionId),
    poll: (sessionId, onUpdate) => {
      poll?.abort();
      poll = new AbortController();
      return pollUntilSettled(sessionId, onUpdate, { get: gearShifterApi.get, signal: poll.signal });
    },
    alive
  });
}

async function renderSession(canvas: HTMLElement, id: string): Promise<void> {
  let session = await gearShifterApi.get(id);
  const page = el('div', 'ps-page ps-session ps-scope gt-scope gt-page');
  const back = el('a', 'ps-back', '← Your work') as HTMLAnchorElement;
  back.href = '#/gear-shifter';
  const title = el('h2', 'ps-session__title', session.title);
  const track = createTrack();
  const board = el('div', 'ps-session__board');
  const bench = el('div', 'ps-bench gt-bench');
  const route = createRoute();
  const canvasHost = el('div', 'ps-canvas gt-canvas');
  const tray = createSkillTray();
  const review = mountReviewPanel({ start: () => void reviews.startReview() });
  const shelf = createShelf((technique) => void pick(technique));
  bench.append(review.el, route.el, canvasHost, shelf.el, tray.el);
  const medal = createMedalCard();
  const cards = mountTaskCards({
    create: (proposal, edits) => bridge.create(session, proposal, edits),
    dismiss: (proposal) => confirmed('dismiss_task', { proposalId: proposal.id }),
    createReview: (edits) => bridge.createReview(session, edits),
    dismissReview: () => confirmed('dismiss_review', {}),
    places: (s) => placesFor(s),
    writeCaseFile: (offer, choice) => writeRecord(offer, choice),
    dismissCaseFile: (key) => confirmed('dismiss_case_file', { key })
  }, { fallbackFocus: () => coach.el.querySelector('textarea'), paper: { offer: (s) => actionOffer(s) as PsRecordOffer | null, noun: 'action record', strictNames: false } });
  const coach = mountCoachPanel({ onSay: (text) => void act('say', text), onAction: (action) => void act(action) }, { cards: cards.el, look: GT_LOOK });
  const coachHost = el('div', 'ps-coach-host gt-coach-host');
  coachHost.append(medal.el, coach.el);
  board.append(bench, coachHost);
  const entry = reviewEntry(session, hashQuery().get('step'));
  const banner = entry && !(entry.kind === 'start' && waitingForReview(session)) ? reviewBanner(entry, () => void reviews.startReview(), stepName(session.model!.id, entry.step), 'session') : null;
  page.append(back, title, track.el, ...(banner ? [banner] : []), board);
  canvas.replaceChildren(page);
  const diagram = mountGearCanvas(canvasHost, { onScore: (scores) => void rescore(scores), onTechnique: (technique) => void pick(technique) });
  canvasNow = diagram;

  const flash = (err: unknown) => {
    coachHost.querySelector('.ps-coach__status--failed.is-transient')?.remove();
    const note = el('p', 'ps-coach__status ps-coach__status--failed is-transient', errorMessage(err));
    coach.el.querySelector('.ps-coach__extras')?.prepend(note);
  };

  const render = (next: PsSession) => {
    session = next;
    if (title.textContent !== session.title) title.textContent = session.title;
    track.update(session);
    route.update(session);
    diagram.update(session);
    shelf.update(session);
    tray.update(session);
    medal.update(session);
    coach.update(session);
    cards.update(session);
    review.update(session);
    reviews.onRender(session);
  };

  const sync = syncFor(session, render, () => page.isConnected);
  const paint = (next: PsSession) => void sync.paint(next);
  const settle = () => sync.settle();
  const confirmed = (action: PsAction, payload: Record<string, unknown>) => sync.confirmed(action, payload);

  /** The linked task's domain if the session links one, else life; one fetch per session. */
  let domain: Promise<string> | null = null;
  function domainFor(s: PsSession): Promise<string> {
    const linked = s.links.find((link) => link.kind === 'task')?.id;
    if (!linked) return Promise.resolve('life');
    if (!domain) {
      const fetching = tasksApi.getTask(linked).then((task) => task.domain || 'life');
      fetching.catch(() => {
        if (domain === fetching) domain = null;
      });
      domain = fetching;
    }
    return domain;
  }

  const bridge = createTaskBridge({
    createTask: (body) => tasksApi.createTask(body),
    getTask: (taskId) => tasksApi.getTask(taskId),
    domainFor: (s) => domainFor(s),
    confirm: (proposalId, taskId) => confirmed('confirm_task', { proposalId, taskId }),
    dismiss: (proposalId, reason) => confirmed('dismiss_task', { proposalId, ...(reason ? { reason } : {}) }),
    setReview: (taskId, due) => confirmed('set_review_task', { taskId, due }),
    origin: ORIGIN
  });

  async function placesFor(s: PsSession): Promise<PlaceOption[]> {
    const labels: Record<string, string> = {};
    const linked = s.links.filter((link) => link.kind === 'project' || link.kind === 'task');
    await Promise.all(linked.map(async (link) => {
      try {
        const found = link.kind === 'project' ? await tasksApi.getProject(link.id) : await tasksApi.getTask(link.id);
        if (found.title) labels[`${link.kind}:${link.id}`] = found.title;
      } catch {
        /* the fallback label stands */
      }
    }));
    return caseFilePlaces(s, labels, composeActionRecord(s)?.title ?? 'the action record');
  }

  const records = createCaseFileBridge({
    createProject: (body) => tasksApi.createProject({ title: body.title, purpose: `Action record for "${sync.session().title}"` }),
    getProject: (projectId) => tasksApi.getProject(projectId),
    updateProject: (projectId, body) => tasksApi.updateProject(projectId, body),
    getTask: (taskId) => tasksApi.getTask(taskId),
    updateTask: (taskId, body) => tasksApi.updateTask(taskId, body),
    link: (payload) => confirmed('link_case_file', payload),
    today: compactToday,
    blocks: (offer, opts) => recordBlocks(offer as PsRecordOffer, opts),
    graphic: (offer, opts) => recordGraphic(offer as PsRecordOffer, opts)
  });
  const writeRecord = latestRecordWriter(() => sync.session(), (latest, offer, choice) => records.write(latest, offer, choice));

  const reviews = createReviewSync({
    getSession: () => session,
    confirmed,
    settle,
    details: (proposals) => bridge.details(proposals),
    setTaskStatuses: (map) => diagram.setTaskStatuses(map),
    review,
    banner: () => (banner?.isConnected ? banner : null),
    flash,
    alive: () => page.isConnected,
    focusCoach: () => coach.el.querySelector<HTMLTextAreaElement>('textarea')?.focus()
  });
  const onVisible = () => {
    if (document.visibilityState === 'visible') reviews.refreshIfTasks();
  };
  document.addEventListener('visibilitychange', onVisible);
  unsubscribeNow.push(
    onTasksChanged(() => reviews.refreshIfTasks()),
    onTasksDeleted(() => reviews.refreshIfTasks()),
    () => document.removeEventListener('visibilitychange', onVisible)
  );

  async function act(action: PsAction, text?: string): Promise<void> {
    try {
      paint(await gearShifterApi.act(session, action, text));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await gearShifterApi.get(session.id));
        return;
      }
      flash(err);
      return;
    }
    if (isBusy(session)) await settle();
  }

  /**
   * A technique asked for on the shelf or a Getting a Project Done station: a message to the
   * coach, who still weighs it against the frame. Only Explore picks a technique.
   */
  async function pick(technique: string): Promise<void> {
    if (session.phase !== 'explore') {
      flash(new Error('Techniques are picked in Explore.'));
      return;
    }
    if (isBusy(session)) return;
    await act('say', `Let’s try ${toolNamed(technique)?.name ?? technique}.`);
  }

  /** A plot or scales chart the person placed or scored: its payload, with the run it belongs to. */
  async function rescore({ runId, ...scores }: GtRunScores): Promise<void> {
    try {
      paint(await gearShifterApi.score(session, { runId, ...scores }));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await gearShifterApi.get(session.id));
        return;
      }
      flash(err);
    }
  }

  render(session);
  if (isBusy(session)) await settle();
}

/** Leaving Gear Shifter (or opening another session): stop polling, drop the canvas and the Tasks listeners. */
export function unmountGearShifterView(): void {
  poll?.abort();
  poll = null;
  canvasNow?.destroy();
  canvasNow = null;
  for (const off of unsubscribeNow) off();
  unsubscribeNow = [];
}

export async function renderGearShifterView(canvas: HTMLElement): Promise<void> {
  unmountGearShifterView();
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const id = hashQuery().get('id');
  try {
    if (id) await renderSession(canvas, id);
    else await renderList(canvas);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderGearShifterView(canvas), 'Could not load Gear Shifter');
  }
}
