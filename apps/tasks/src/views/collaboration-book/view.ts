// apps/tasks/src/views/collaboration-book/view.ts
// The Collaboration Book in the Tasks hub (#/collaboration-book): the landing page (hero, the New
// box, your work, how a session builds, the two checks, the three parts with their models) and the
// session page (track, groups above the canvas, the shelf, coach, skill tray, review panel, task
// and record cards). Its structure is the Change Book's (change-book/view.ts): the coach panel,
// task cards, bridges, review panel and syncs are Problem Solver's own components, given the
// Collaboration Book's API, look, origin and record. There is no Quick start in v1.
import '../../../../../packages/problem-solver/problem-solver.css';
import '../../../../../packages/decision-book/decision-book.css';
import '../../../../../packages/collaboration-book/collaboration-book.css';
import '../problem-solver/problem-solver-view.css';
import './collaboration-book-view.css';
import { el } from '@/views/hub-kit';
import { hashQuery } from '@/shell/shell';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { tasksApi } from '@/services/client-api';
import { onTasksChanged, onTasksDeleted } from '@/services/task-cache';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { skillGlyph } from '../../../../../packages/problem-solver/glyphs';
import { planStepForBook, stepName, toolsForPlanStep } from '../../../../../packages/problem-solver/steps.mjs';
import { reviewStart } from '../../../../../packages/problem-solver/review.mjs';
import type { PsAction, PsRecordOffer, PsSession, PsSummary } from '../../../../../packages/problem-solver/types';
import { CATALOGUE, SECTIONS } from '../../../../../packages/collaboration-book/catalogue.mjs';
import { GROUPS, parseGroups } from '../../../../../packages/collaboration-book/route.mjs';
import { actionOffer, composeActionRecord } from '../../../../../packages/collaboration-book/record.mjs';
import { bookEmblem, entryEmblem, sectionEmblem } from '../../../../../packages/collaboration-book/glyphs';
import { isBusy, pollUntilSettled, collaborationBookApi } from '../problem-solver/api';
import { mountCoachPanel } from '../problem-solver/coach-panel';
import { createTaskBridge, type TaskOrigin } from '../problem-solver/task-bridge';
import { mountReviewPanel, reviewBanner, type ReviewEntry } from '../problem-solver/review-panel';
import { createReviewSync } from '../problem-solver/review-sync';
import { compactToday, mountTaskCards, type PlaceOption } from '../problem-solver/task-cards';
import { createCaseFileBridge, type CaseFilePlace, type PaperOffer } from '../problem-solver/case-file-bridge';
import { createSessionSync } from '../problem-solver/session-sync';
import { caseFilePlaces, createSkillTray, section } from '../problem-solver/view';
import { BRANCH, LENS, MARKS, CB_LOOK, createGroups, createTrack, groupLine, plainName, svg, toolNamed } from './decor';
import { mountCollabCanvas, type CbRunScores } from './canvas';
import { recordBlocks } from './record-blocks';

let poll: AbortController | null = null;
/** The open session's canvas and Tasks listeners, dropped when the page changes. */
let canvasNow: { destroy(): void } | null = null;
let unsubscribeNow: Array<() => void> = [];

const ORIGIN: TaskOrigin = { name: 'Collaboration Book', source: 'collaboration_book', tag: 'collaboration-book', noun: 'session', review: 'the experiment for "%s" went, then open it in the Collaboration Book to see what happened and whether the conditions changed' };

/** The models Explore offers, in catalogue order (the shelf). */
const shelfTools = (): string[] => toolsForPlanStep('collaboration_book', 'explore') as string[];

/* ── Landing ────────────────────────────────────────────────────────── */

const PHASES: Record<string, { label: string; colour: string }> = {
  frame: { label: 'Locating', colour: 'var(--cb-purple)' },
  explore: { label: 'Working', colour: 'var(--cb-cyan)' },
  commit: { label: 'Agreeing', colour: 'var(--cb-gold-label)' },
  review: { label: 'Reviewing', colour: 'var(--cb-gold-label)' },
  finished: { label: 'Finished', colour: 'var(--cb-ink)' }
};

/** The meta line's middle part: the question being answered, or the model in hand and any review date. */
function metaNote(row: PsSummary): string {
  if (row.phase === 'frame') return `Question ${Math.min((row.frame ?? 0) + 1, 3)} of 3`;
  const model = row.main ?? row.tool;
  const name = model ? plainName(model) : '';
  const due = row.reviewDue ? `review ${formatDisplayDate(row.reviewDue)}` : '';
  return [name, due].filter(Boolean).join(' · ');
}

function workCard(row: PsSummary, index: number): HTMLLIElement {
  const item = el('li', 'ps-prob cb-prob') as HTMLLIElement;
  item.style.setProperty('--i', String(index));
  const link = el('a', 'ps-prob__link') as HTMLAnchorElement;
  link.href = `#/collaboration-book?id=${row.id}`;
  const medal = el('span', 'ps-prob__medal cb-prob__medal');
  const model = row.main ?? null;
  medal.append(model ? entryEmblem(model) : bookEmblem());
  const body = el('span', 'ps-prob__body');
  const meta = el('span', 'ps-prob__meta');
  const phase = PHASES[row.phase] ?? { label: row.phase, colour: 'var(--cb-ink)' };
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

type StartForm = { el: HTMLFormElement; startFrom(model: string): void };

function startForm(): StartForm {
  const start = el('form', 'ps-start cb-start') as HTMLFormElement;
  const head = el('div', 'cb-start__head');
  head.append(el('h2', 'ps-start__title', 'What is happening in the team?'));
  const input = el('textarea', 'ps-start__input') as HTMLTextAreaElement;
  input.rows = 3;
  input.placeholder = 'One situation with the people you work with: a problem, a goal you share or trust that has worn thin. Say what you have seen, the way you would to a friend.';
  input.setAttribute('aria-label', 'Describe the team situation');
  const go = el('button', 'btn btn--primary', 'Start') as HTMLButtonElement;
  go.type = 'submit';
  const status = el('p', 'ps-start__status');
  status.setAttribute('role', 'status');
  const picked = el('p', 'cb-start__picked');
  picked.hidden = true;
  const row = el('div', 'ps-start__row');
  row.append(status, go);
  start.append(head, picked, input, row);
  let startModel: string | null = null;
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
      const session = await collaborationBookApi.create({ text, kind: 'collab', ...(startModel ? { startModel } : {}) });
      location.hash = `#/collaboration-book?id=${session.id}`;
    } catch (err) {
      status.textContent = errorMessage(err);
      go.disabled = false;
    }
  });
  return {
    el: start,
    /** A model picked on the shelf: the session will open on it once the situation is placed. */
    startFrom(model: string) {
      startModel = model;
      const clear = el('button', 'cb-start__clear', 'Clear') as HTMLButtonElement;
      clear.type = 'button';
      clear.addEventListener('click', () => {
        startModel = null;
        picked.hidden = true;
        input.focus();
      });
      picked.replaceChildren(entryEmblem(model), el('span', '', `Starting from ${toolNamed(model)?.name ?? model}`), clear);
      picked.hidden = false;
      input.focus();
    }
  };
}

function buildSteps(): HTMLElement {
  const steps: Array<[string, string, string, string]> = [
    ['Locate', 'The team situation', 'What happened, who was involved, and whether it is mostly a problem, a goal or trust.', MARKS.locate],
    ['Choose', 'One fitting model', 'The coach offers a single model from the book as a lens, with a way it could mislead you here.', BRANCH],
    ['Work it', 'Its chart', 'The model’s own chart builds as you work one real example through, your own part first.', LENS],
    ['Agree and review', 'A small experiment', 'An owner, a next action, a date to come back to it, and a sign it is not working.', MARKS.agree]
  ];
  const list = el('ol', 'ps-build cb-build');
  steps.forEach(([label, title, detail, art], i) => {
    const step = el('li', 'ps-build__step');
    const figure = el('span', 'ps-build__art');
    figure.append(svg('0 0 100 100', art));
    step.append(figure, el('span', 'ps-build__n', `${i + 1} · ${label}`), el('h3', 'ps-build__title', title), el('p', 'ps-build__detail', detail));
    list.append(step);
  });
  return list;
}

/** The two checks that run through every session, in our words. */
function modelCheck(): HTMLElement {
  const box = el('div', 'cb-check');
  const item = (title: string, line: string, art: string) => {
    const card = el('div', 'cb-check__item');
    const mark = el('span', 'cb-check__mark');
    mark.append(svg('0 0 100 100', art));
    const text = el('div', 'cb-check__text');
    text.append(el('h3', 'cb-check__title', title), el('p', 'cb-check__line', line));
    card.append(mark, text);
    return card;
  };
  box.append(
    item('Your own part', 'Before diagnosing anyone else: what is your part in this, and what did you see rather than assume?', MARKS.own),
    item('Every voice', 'Whose view have you not heard yet, and how could they contribute before the loudest voice sets the answer?', MARKS.review)
  );
  return box;
}

/** The book's three parts, each with its emblem, a line in our words and its models. */
function sectionShelves(onStart: (model: string) => void): HTMLElement {
  const offered = new Set(shelfTools());
  const wrap = el('div', 'cb-sections');
  SECTIONS.forEach((s, k) => {
    const entries = CATALOGUE.filter((e) => e.section === s.key && offered.has(e.id));
    const box = el('details', 'cb-sect') as HTMLDetailsElement;
    box.open = true;
    box.dataset.section = s.key;
    const summary = el('summary', 'cb-sect__head');
    const mark = el('span', 'cb-sect__mark');
    mark.append(sectionEmblem(s.key), el('span', 'cb-sect__stn', `Part ${k + 1}`));
    const text = el('span', 'cb-sect__text');
    const line = groupLine(s.route);
    text.append(el('span', 'cb-sect__title', s.title), el('span', 'cb-sect__line', `${line} ${entries.length} ${entries.length === 1 ? 'model' : 'models'}.`));
    summary.append(mark, text);
    const shelf = el('ul', 'ps-shelf cb-shelf');
    for (const e of entries) {
      const tool = toolNamed(e.id)!;
      const item = el('li', 'ps-shelf__tool cb-shelf__tool');
      item.dataset.tool = e.id;
      const name = el('span', 'ps-shelf__name', tool.name);
      if (e.tier === 'lens') name.append(' ', el('em', 'cb-shelf__tag', 'lens'));
      if (e.reuse) name.append(' ', el('em', 'cb-shelf__tag', String(e.reuse).startsWith('dm_') ? 'from Decision Maker' : 'from Problem Solver'));
      const use = el('button', 'cb-shelf__start', 'Start from this') as HTMLButtonElement;
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
  const page = el('div', 'ps-page ps-landing ps-scope cb-scope cb-page');
  const hero = el('div', 'ps-hero cb-hero');
  const copy = el('div', 'ps-hero__copy');
  const start = startForm();
  const lede = el('div', 'cb-hero__lede');
  lede.append(bookEmblem(), el('p', 'ps-hero__lede', 'For the people you work with: a problem you are solving together, a goal you share, or trust that needs building. Tell the coach what happened: it offers one model from The Collaboration Book as a lens, asks about your own part first, and helps you agree one small experiment with an owner and a date to come back to it.'));
  copy.append(lede, start.el);
  const art = el('div', 'cb-hero__art');
  art.setAttribute('aria-hidden', 'true');
  art.append(bookEmblem());
  hero.append(copy, art);
  page.append(hero);

  const sessions = (await collaborationBookApi.list()).filter((item) => item.status !== 'archived');
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
    section('Your work', sessions.length ? 'Each badge is the model in use, or the book until one is chosen.' : 'Nothing yet. Start with the team situation that is on your mind.', list),
    section('How a session builds', 'One model per session, tried through one small experiment. The coach chooses from the book; you can always pick from the shelf instead.', buildSteps()),
    section('Two checks, every time', 'Each model is a lens for one moment. These two questions run through every session.', modelCheck()),
    section('The three parts', 'The book’s three parts. Start from any model to open a session already on it.', sectionShelves((model) => {
      start.startFrom(model);
      toStart();
    }))
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
    if (!now || now.key !== offer.key) throw new Error('The record changed; check the card again.');
    await write(session, now, choice);
  };
}

/**
 * The shelf on the session page: every model by group, each asking the coach for it. Open in
 * Explore only.
 */
function createShelf(onPick: (model: string) => void) {
  const box = el('details', 'cb-session-shelf') as HTMLDetailsElement;
  const summary = el('summary', 'cb-session-shelf__head', 'Pick a model from the shelf');
  const offered = new Set(shelfTools());
  const body = el('div', 'cb-session-shelf__body');
  const shelves: Array<{ id: string; label: string; ids: string[] }> = GROUPS.map((group) => ({ id: group.id, label: group.label, ids: CATALOGUE.filter((e) => e.section === group.section).map((e) => e.id) }));
  for (const shelf of shelves) {
    const wrap = el('div', 'cb-session-shelf__group');
    wrap.dataset.group = shelf.id;
    const list = el('ul', 'cb-session-shelf__list');
    for (const id of shelf.ids.filter((item) => offered.has(item))) {
      const item = el('li', '');
      const button = el('button', 'cb-session-shelf__pick') as HTMLButtonElement;
      button.type = 'button';
      button.dataset.tool = id;
      button.title = toolNamed(id)!.when;
      button.append(entryEmblem(id), el('span', '', toolNamed(id)!.name));
      button.addEventListener('click', () => onPick(id));
      item.append(button);
      list.append(item);
    }
    wrap.append(el('h3', 'cb-session-shelf__title', shelf.label), list);
    body.append(wrap);
  }
  box.append(summary, el('p', 'cb-session-shelf__line', 'The coach suggests one model; you can ask for another. The models for what the team needs come first.'), body);
  const order = (id: string) => GROUPS.findIndex((g) => g.id === id);
  let key = '';
  return {
    el: box,
    update(session: PsSession) {
      box.hidden = session.phase !== 'explore';
      const lit = parseGroups(session.frame?.group ?? '') as string[];
      const next = lit.join('+');
      if (next === key) return;
      key = next;
      // The lit groups first, then the rest in the book's order.
      const groups = [...body.children] as HTMLElement[];
      const rank = (g: HTMLElement) => (lit.includes(g.dataset.group!) ? 0 : 1);
      groups.sort((a, b) => rank(a) - rank(b) || order(a.dataset.group!) - order(b.dataset.group!));
      body.append(...groups);
      for (const wrap of groups) wrap.dataset.lit = String(lit.includes(wrap.dataset.group!));
    }
  };
}

/** The two checks, a collapsed reminder beside the coach. */
function createChecks(): HTMLElement {
  const box = el('details', 'cb-checks') as HTMLDetailsElement;
  box.append(el('summary', 'cb-checks__head', 'Two checks for every model'), modelCheck());
  return box;
}

function syncFor(initial: PsSession, render: (session: PsSession) => void, alive: () => boolean) {
  return createSessionSync({
    initial,
    render,
    actWith: (s, action, payload) => collaborationBookApi.actWith(s, action, payload),
    get: (sessionId) => collaborationBookApi.get(sessionId),
    poll: (sessionId, onUpdate) => {
      poll?.abort();
      poll = new AbortController();
      return pollUntilSettled(sessionId, onUpdate, { get: collaborationBookApi.get, signal: poll.signal });
    },
    alive
  });
}

async function renderSession(canvas: HTMLElement, id: string): Promise<void> {
  let session = await collaborationBookApi.get(id);
  const page = el('div', 'ps-page ps-session ps-scope cb-scope cb-page');
  const back = el('a', 'ps-back', '← Your work') as HTMLAnchorElement;
  back.href = '#/collaboration-book';
  const title = el('h2', 'ps-session__title', session.title);
  const track = createTrack();
  const board = el('div', 'ps-session__board');
  const bench = el('div', 'ps-bench cb-bench');
  const groups = createGroups();
  const canvasHost = el('div', 'ps-canvas cb-canvas');
  const tray = createSkillTray();
  const review = mountReviewPanel({ start: () => void reviews.startReview() });
  const shelf = createShelf((model) => void pick(model));
  bench.append(review.el, groups.el, canvasHost, shelf.el, tray.el);
  const cards = mountTaskCards({
    create: (proposal, edits) => bridge.create(session, proposal, edits),
    dismiss: (proposal) => confirmed('dismiss_task', { proposalId: proposal.id }),
    createReview: (edits) => bridge.createReview(session, edits),
    dismissReview: () => confirmed('dismiss_review', {}),
    places: (s) => placesFor(s),
    writeCaseFile: (offer, choice) => writeRecord(offer, choice),
    dismissCaseFile: (key) => confirmed('dismiss_case_file', { key })
  }, { fallbackFocus: () => coach.el.querySelector('textarea'), paper: { offer: (s) => actionOffer(s) as PsRecordOffer | null, noun: 'record', strictNames: false } });
  const coach = mountCoachPanel({ onSay: (text) => void act('say', text), onAction: (action) => void act(action) }, { cards: cards.el, look: CB_LOOK });
  const coachHost = el('div', 'ps-coach-host cb-coach-host');
  coachHost.append(createChecks(), coach.el);
  board.append(bench, coachHost);
  const entry = reviewEntry(session, hashQuery().get('step'));
  const banner = entry ? reviewBanner(entry, () => void reviews.startReview(), stepName(session.model!.id, entry.step), 'session') : null;
  page.append(back, title, track.el, ...(banner ? [banner] : []), board);
  canvas.replaceChildren(page);
  const diagram = mountCollabCanvas(canvasHost, { onScore: (scores) => void rescore(scores) });
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
    groups.update(session);
    diagram.update(session);
    shelf.update(session);
    tray.update(session);
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
    return caseFilePlaces(s, labels, composeActionRecord(s)?.title ?? 'the record');
  }

  const records = createCaseFileBridge({
    createProject: (body) => tasksApi.createProject({ title: body.title, purpose: `Record for "${sync.session().title}"` }),
    getProject: (projectId) => tasksApi.getProject(projectId),
    updateProject: (projectId, body) => tasksApi.updateProject(projectId, body),
    getTask: (taskId) => tasksApi.getTask(taskId),
    updateTask: (taskId, body) => tasksApi.updateTask(taskId, body),
    link: (payload) => confirmed('link_case_file', payload),
    today: compactToday,
    blocks: (offer, opts) => recordBlocks(offer as PsRecordOffer, opts)
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
      paint(await collaborationBookApi.act(session, action, text));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await collaborationBookApi.get(session.id));
        return;
      }
      flash(err);
      return;
    }
    if (isBusy(session)) await settle();
  }

  /** A model asked for on the shelf: a message to the coach, who still weighs it against the frame. Only Explore picks a model. */
  async function pick(model: string): Promise<void> {
    if (session.phase !== 'explore') {
      flash(new Error('Models are picked in Work a model.'));
      return;
    }
    if (isBusy(session)) return;
    await act('say', `Let’s try ${toolNamed(model)?.name ?? model}.`);
  }

  /** A plot, scales or concept-map chart the person placed or scored: its payload, with the run it belongs to. */
  async function rescore({ runId, ...scores }: CbRunScores): Promise<void> {
    try {
      paint(await collaborationBookApi.score(session, { runId, ...scores }));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await collaborationBookApi.get(session.id));
        return;
      }
      flash(err);
    }
  }

  render(session);
  if (isBusy(session)) await settle();
}

/** Leaving the Collaboration Book (or opening another session): stop polling, drop the canvas and the Tasks listeners. */
export function unmountCollaborationBookView(): void {
  poll?.abort();
  poll = null;
  canvasNow?.destroy();
  canvasNow = null;
  for (const off of unsubscribeNow) off();
  unsubscribeNow = [];
}

export async function renderCollaborationBookView(canvas: HTMLElement): Promise<void> {
  unmountCollaborationBookView();
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const id = hashQuery().get('id');
  try {
    if (id) await renderSession(canvas, id);
    else await renderList(canvas);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderCollaborationBookView(canvas), 'Could not load the Collaboration Book');
  }
}
