// apps/tasks/src/views/communication-book/view.ts
// The Communication Book in the Tasks hub (#/communication-book): the landing page (hero, the New
// box, your work, how a session builds, the two checks, the five sections with their models) and
// the session page (track, groups above the canvas, the shelf, coach, skill tray, review panel,
// task and record cards). Its structure is the Collaboration Book's (collaboration-book/view.ts):
// the coach panel,
// task cards, bridges, review panel and syncs are Problem Solver's own components, given the
// Communication Book's API, look, origin and record. There is no Quick start in v1.
import '../../../../../packages/problem-solver/problem-solver.css';
import '../../../../../packages/decision-book/decision-book.css';
import '../../../../../packages/communication-book/communication-book.css';
import '../problem-solver/problem-solver-view.css';
import './communication-book-view.css';
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
import { CATALOGUE, SECTIONS } from '../../../../../packages/communication-book/catalogue.mjs';
import { GROUPS, parseGroups } from '../../../../../packages/communication-book/route.mjs';
import { actionOffer, composeActionRecord } from '../../../../../packages/communication-book/record.mjs';
import { bookEmblem, entryEmblem, sectionEmblem } from '../../../../../packages/communication-book/glyphs';
import { isBusy, pollUntilSettled, communicationBookApi } from '../problem-solver/api';
import { mountCoachPanel } from '../problem-solver/coach-panel';
import { createTaskBridge, type TaskOrigin } from '../problem-solver/task-bridge';
import { mountReviewPanel, reviewBanner, type ReviewEntry } from '../problem-solver/review-panel';
import { createReviewSync } from '../problem-solver/review-sync';
import { compactToday, mountTaskCards, type PlaceOption } from '../problem-solver/task-cards';
import { createCaseFileBridge, type CaseFilePlace, type PaperOffer } from '../problem-solver/case-file-bridge';
import { createSessionSync } from '../problem-solver/session-sync';
import { caseFilePlaces, createSkillTray, section } from '../problem-solver/view';
import { BRANCH, LENS, MARKS, CMB_LOOK, createGroups, createTrack, plainName, svg, toolNamed } from './decor';
import { mountCommCanvas, type CmbRunScores } from './canvas';
import { recordBlocks } from './record-blocks';

let poll: AbortController | null = null;
/** The open session's canvas and Tasks listeners, dropped when the page changes. */
let canvasNow: { destroy(): void } | null = null;
let unsubscribeNow: Array<() => void> = [];

const ORIGIN: TaskOrigin = { name: 'Communication Book', source: 'communication_book', tag: 'communication-book', noun: 'session', review: 'the next conversation for "%s" went, then open it in the Communication Book to see what was said and how it landed' };

/** The models Explore offers, in catalogue order (the shelf). */
const shelfTools = (): string[] => toolsForPlanStep('communication_book', 'explore') as string[];

/* ── Landing ────────────────────────────────────────────────────────── */

const PHASES: Record<string, { label: string; colour: string }> = {
  frame: { label: 'Naming', colour: 'var(--cmb-ink)' },
  explore: { label: 'Working', colour: 'var(--cmb-grey-label)' },
  commit: { label: 'Committing', colour: 'var(--cmb-gold-label)' },
  review: { label: 'Reviewing', colour: 'var(--cmb-gold-label)' },
  finished: { label: 'Finished', colour: 'var(--cmb-ink)' }
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
  const item = el('li', 'ps-prob cmb-prob') as HTMLLIElement;
  item.style.setProperty('--i', String(index));
  const link = el('a', 'ps-prob__link') as HTMLAnchorElement;
  link.href = `#/communication-book?id=${row.id}`;
  const medal = el('span', 'ps-prob__medal cmb-prob__medal');
  const model = row.main ?? null;
  medal.append(model ? entryEmblem(model) : bookEmblem());
  const body = el('span', 'ps-prob__body');
  const meta = el('span', 'ps-prob__meta');
  const phase = PHASES[row.phase] ?? { label: row.phase, colour: 'var(--cmb-ink)' };
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
  const start = el('form', 'ps-start cmb-start') as HTMLFormElement;
  const head = el('div', 'cmb-start__head');
  head.append(el('h2', 'ps-start__title', 'What was said, or needs saying?'));
  const input = el('textarea', 'ps-start__input') as HTMLTextAreaElement;
  input.rows = 3;
  input.placeholder = 'One exchange: a talk you need to prepare, someone you want to listen to or make up with, or a message you are trying to read. Give the words as they were said, if you can.';
  input.setAttribute('aria-label', 'Describe the exchange');
  const go = el('button', 'btn btn--primary', 'Start') as HTMLButtonElement;
  go.type = 'submit';
  const status = el('p', 'ps-start__status');
  status.setAttribute('role', 'status');
  const picked = el('p', 'cmb-start__picked');
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
      const session = await communicationBookApi.create({ text, kind: 'talk', ...(startModel ? { startModel } : {}) });
      location.hash = `#/communication-book?id=${session.id}`;
    } catch (err) {
      status.textContent = errorMessage(err);
      go.disabled = false;
    }
  });
  return {
    el: start,
    /** A model picked on the shelf: the session will open on it once the exchange is placed. */
    startFrom(model: string) {
      startModel = model;
      const clear = el('button', 'cmb-start__clear', 'Clear') as HTMLButtonElement;
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
    ['Name', 'The exchange', 'Who is involved, what was said or needs saying, and whether you are preparing, relating or reading.', MARKS.name],
    ['Choose', 'One fitting model', 'The coach offers a single model from the book as a lens, and says where it may only partly fit.', BRANCH],
    ['Work it', 'Its chart', 'The model’s own chart builds as you work one real exchange through, keeping what was said apart from guesses.', LENS],
    ['Commit and review', 'The next conversation', 'Who takes it, the first words, a date to come back to it, and how you will tell it landed.', MARKS.commit]
  ];
  const list = el('ol', 'ps-build cmb-build');
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
  const box = el('div', 'cmb-check');
  const item = (title: string, line: string, art: string) => {
    const card = el('div', 'cmb-check__item');
    const mark = el('span', 'cmb-check__mark');
    mark.append(svg('0 0 100 100', art));
    const text = el('div', 'cmb-check__text');
    text.append(el('h3', 'cmb-check__title', title), el('p', 'cmb-check__line', line));
    card.append(mark, text);
    return card;
  };
  box.append(
    item('Said and heard', 'What were the actual words, and what did each person take them to mean? Keep the two side by side.', MARKS.heard),
    item('How it lands', 'Before you say it: how will the other person hear this, and what would show you it landed well for them too?', MARKS.review)
  );
  return box;
}

/** One line per section: what its models are for, in our words. */
const SECTION_LINES: Record<string, string> = {
  job_career: 'Persuading, presenting, meetings, feedback and negotiating at work.',
  self_knowledge: 'How you talk to yourself, and what sits under what you say.',
  love_friendship: 'Listening, apologising and getting closer to the people near you.',
  words_meanings: 'How messages, media and frames shape what people take from them.',
  conclusion: 'How an exchange will be remembered once it is over.'
};

/** The book's five sections, each with its emblem, a line in our words and its models. */
function sectionShelves(onStart: (model: string) => void): HTMLElement {
  const offered = new Set(shelfTools());
  const wrap = el('div', 'cmb-sections');
  SECTIONS.forEach((s, k) => {
    const entries = CATALOGUE.filter((e) => e.section === s.key && offered.has(e.id));
    const box = el('details', 'cmb-sect') as HTMLDetailsElement;
    box.open = true;
    box.dataset.section = s.key;
    const summary = el('summary', 'cmb-sect__head');
    const mark = el('span', 'cmb-sect__mark');
    mark.append(sectionEmblem(s.key), el('span', 'cmb-sect__stn', `Section ${k + 1}`));
    const text = el('span', 'cmb-sect__text');
    const line = SECTION_LINES[s.key] ?? '';
    text.append(el('span', 'cmb-sect__title', s.title), el('span', 'cmb-sect__line', `${line} ${entries.length} ${entries.length === 1 ? 'model' : 'models'}.`));
    summary.append(mark, text);
    const shelf = el('ul', 'ps-shelf cmb-shelf');
    for (const e of entries) {
      const tool = toolNamed(e.id)!;
      const item = el('li', 'ps-shelf__tool cmb-shelf__tool');
      item.dataset.tool = e.id;
      const name = el('span', 'ps-shelf__name', tool.name);
      if (e.tier === 'lens') name.append(' ', el('em', 'cmb-shelf__tag', 'lens'));
      if (e.reuse) name.append(' ', el('em', 'cmb-shelf__tag', String(e.reuse).startsWith('dm_') ? 'from Decision Maker' : 'from Problem Solver'));
      const use = el('button', 'cmb-shelf__start', 'Start from this') as HTMLButtonElement;
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
  const page = el('div', 'ps-page ps-landing ps-scope cmb-scope cmb-page');
  const hero = el('div', 'ps-hero cmb-hero');
  const copy = el('div', 'ps-hero__copy');
  const start = startForm();
  const lede = el('div', 'cmb-hero__lede');
  lede.append(bookEmblem(), el('p', 'ps-hero__lede', 'For one exchange that matters: a talk to prepare, a relationship to listen to or mend, or a message to make sense of. Tell the coach what was said: it offers one model from The Communication Book as a lens, keeps the words apart from what they were taken to mean, and helps you settle the next conversation with its first words and a date to come back to it.'));
  copy.append(lede, start.el);
  const art = el('div', 'cmb-hero__art');
  art.setAttribute('aria-hidden', 'true');
  art.append(bookEmblem());
  hero.append(copy, art);
  page.append(hero);

  const sessions = (await communicationBookApi.list()).filter((item) => item.status !== 'archived');
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
    section('Your work', sessions.length ? 'Each badge is the model in use, or the book until one is chosen.' : 'Nothing yet. Start with the exchange that is on your mind.', list),
    section('How a session builds', 'One model per session, tried in one next conversation. The coach chooses from the book; you can always pick from the shelf instead.', buildSteps()),
    section('Two checks, every time', 'Each model is a lens for one moment. These two questions run through every session.', modelCheck()),
    section('The five sections', 'The book’s five sections. Start from any model to open a session already on it.', sectionShelves((model) => {
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
  const box = el('details', 'cmb-session-shelf') as HTMLDetailsElement;
  const summary = el('summary', 'cmb-session-shelf__head', 'Pick a model from the shelf');
  const offered = new Set(shelfTools());
  const body = el('div', 'cmb-session-shelf__body');
  const shelves: Array<{ id: string; label: string; ids: string[] }> = GROUPS.map((group) => ({ id: group.id, label: group.label, ids: CATALOGUE.filter((e) => (group.sections as readonly string[]).includes(e.section)).map((e) => e.id) }));
  for (const shelf of shelves) {
    const wrap = el('div', 'cmb-session-shelf__group');
    wrap.dataset.group = shelf.id;
    const list = el('ul', 'cmb-session-shelf__list');
    for (const id of shelf.ids.filter((item) => offered.has(item))) {
      const item = el('li', '');
      const button = el('button', 'cmb-session-shelf__pick') as HTMLButtonElement;
      button.type = 'button';
      button.dataset.tool = id;
      button.title = toolNamed(id)!.when;
      button.append(entryEmblem(id), el('span', '', toolNamed(id)!.name));
      button.addEventListener('click', () => onPick(id));
      item.append(button);
      list.append(item);
    }
    wrap.append(el('h3', 'cmb-session-shelf__title', shelf.label), list);
    body.append(wrap);
  }
  box.append(summary, el('p', 'cmb-session-shelf__line', 'The coach suggests one model; you can ask for another. The models for this kind of exchange come first.'), body);
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
  const box = el('details', 'cmb-checks') as HTMLDetailsElement;
  box.append(el('summary', 'cmb-checks__head', 'Two checks for every model'), modelCheck());
  return box;
}

function syncFor(initial: PsSession, render: (session: PsSession) => void, alive: () => boolean) {
  return createSessionSync({
    initial,
    render,
    actWith: (s, action, payload) => communicationBookApi.actWith(s, action, payload),
    get: (sessionId) => communicationBookApi.get(sessionId),
    poll: (sessionId, onUpdate) => {
      poll?.abort();
      poll = new AbortController();
      return pollUntilSettled(sessionId, onUpdate, { get: communicationBookApi.get, signal: poll.signal });
    },
    alive
  });
}

async function renderSession(canvas: HTMLElement, id: string): Promise<void> {
  let session = await communicationBookApi.get(id);
  const page = el('div', 'ps-page ps-session ps-scope cmb-scope cmb-page');
  const back = el('a', 'ps-back', '← Your work') as HTMLAnchorElement;
  back.href = '#/communication-book';
  const title = el('h2', 'ps-session__title', session.title);
  const track = createTrack();
  const board = el('div', 'ps-session__board');
  const bench = el('div', 'ps-bench cmb-bench');
  const groups = createGroups();
  const canvasHost = el('div', 'ps-canvas cmb-canvas');
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
  const coach = mountCoachPanel({ onSay: (text) => void act('say', text), onAction: (action) => void act(action) }, { cards: cards.el, look: CMB_LOOK });
  const coachHost = el('div', 'ps-coach-host cmb-coach-host');
  coachHost.append(createChecks(), coach.el);
  board.append(bench, coachHost);
  const entry = reviewEntry(session, hashQuery().get('step'));
  const banner = entry ? reviewBanner(entry, () => void reviews.startReview(), stepName(session.model!.id, entry.step), 'session') : null;
  page.append(back, title, track.el, ...(banner ? [banner] : []), board);
  canvas.replaceChildren(page);
  const diagram = mountCommCanvas(canvasHost, { onScore: (scores) => void rescore(scores) });
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
      paint(await communicationBookApi.act(session, action, text));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await communicationBookApi.get(session.id));
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

  /** A chart the person placed or scored: its payload, with the run it belongs to. */
  async function rescore({ runId, ...scores }: CmbRunScores): Promise<void> {
    try {
      paint(await communicationBookApi.score(session, { runId, ...scores }));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await communicationBookApi.get(session.id));
        return;
      }
      flash(err);
    }
  }

  render(session);
  if (isBusy(session)) await settle();
}

/** Leaving the Communication Book (or opening another session): stop polling, drop the canvas and the Tasks listeners. */
export function unmountCommunicationBookView(): void {
  poll?.abort();
  poll = null;
  canvasNow?.destroy();
  canvasNow = null;
  for (const off of unsubscribeNow) off();
  unsubscribeNow = [];
}

export async function renderCommunicationBookView(canvas: HTMLElement): Promise<void> {
  unmountCommunicationBookView();
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const id = hashQuery().get('id');
  try {
    if (id) await renderSession(canvas, id);
    else await renderList(canvas);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderCommunicationBookView(canvas), 'Could not load the Communication Book');
  }
}
