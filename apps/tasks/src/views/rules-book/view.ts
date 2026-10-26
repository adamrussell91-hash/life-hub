// apps/tasks/src/views/rules-book/view.ts
// The Rules Book in the Tasks hub (#/rules-book): the landing page (hero, the New box, your
// work, how a session builds, the four groups with their rules, the model check) and the
// session page (track, groups above the canvas, the shelf, coach, skill tray, review panel, task
// and record cards). Its structure is Gear Shifter's (get-things-done/view.ts): the coach panel,
// task cards, bridges, review panel and syncs are Problem Solver's own components, given the
// Rules Book's API, look, origin and record. There is no Quick start in v1.
import '../../../../../packages/problem-solver/problem-solver.css';
import '../../../../../packages/decision-book/decision-book.css';
import '../../../../../packages/rules-book/rules-book.css';
import '../problem-solver/problem-solver-view.css';
import './rules-book-view.css';
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
import { CATALOGUE, SECTIONS } from '../../../../../packages/rules-book/catalogue.mjs';
import { GROUPS, parseGroups } from '../../../../../packages/rules-book/route.mjs';
import { actionOffer, composeActionRecord } from '../../../../../packages/rules-book/record.mjs';
import { bookEmblem, entryEmblem, sectionEmblem } from '../../../../../packages/rules-book/glyphs';
import { isBusy, pollUntilSettled, rulesBookApi } from '../problem-solver/api';
import { mountCoachPanel } from '../problem-solver/coach-panel';
import { createTaskBridge, type TaskOrigin } from '../problem-solver/task-bridge';
import { mountReviewPanel, reviewBanner, type ReviewEntry } from '../problem-solver/review-panel';
import { createReviewSync } from '../problem-solver/review-sync';
import { compactToday, mountTaskCards, type PlaceOption } from '../problem-solver/task-cards';
import { createCaseFileBridge, type CaseFilePlace, type PaperOffer } from '../problem-solver/case-file-bridge';
import { createSessionSync } from '../problem-solver/session-sync';
import { caseFilePlaces, createSkillTray, section } from '../problem-solver/view';
import { BULB, CLOSED_BOX, MARKS, RB_LOOK, createGroups, createTrack, groupLine, plainName, svg, toolNamed } from './decor';
import { mountRulesCanvas, type RbRunScores } from './canvas';
import { recordBlocks } from './record-blocks';

let poll: AbortController | null = null;
/** The open session's canvas and Tasks listeners, dropped when the page changes. */
let canvasNow: { destroy(): void } | null = null;
let unsubscribeNow: Array<() => void> = [];

const ORIGIN: TaskOrigin = { name: 'Rules Book', source: 'rules_book', tag: 'rules-book', noun: 'session', review: 'the experiment for "%s" went, then open it in the Rules Book to see what happened and whether the rule still fits' };

/** The rules Explore offers, in catalogue order (the shelf). */
const shelfTools = (): string[] => toolsForPlanStep('rules_book', 'explore') as string[];

/* ── Landing ────────────────────────────────────────────────────────── */

const PHASES: Record<string, { label: string; colour: string }> = {
  frame: { label: 'Grounding', colour: 'var(--rb-orange-label)' },
  explore: { label: 'Applying', colour: 'var(--rb-indigo)' },
  commit: { label: 'Acting', colour: 'var(--rb-orange-label)' },
  review: { label: 'Reviewing', colour: 'var(--rb-orange-label)' },
  finished: { label: 'Finished', colour: 'var(--rb-ink)' }
};

/** The meta line's middle part: the question being grounded, or the rule in hand and any check time. */
function metaNote(row: PsSummary): string {
  if (row.phase === 'frame') return `Question ${Math.min((row.frame ?? 0) + 1, 3)} of 3`;
  const rule = row.main ?? row.tool;
  const name = rule ? plainName(rule) : '';
  const due = row.reviewDue ? `check ${formatDisplayDate(row.reviewDue)}` : '';
  return [name, due].filter(Boolean).join(' · ');
}

function workCard(row: PsSummary, index: number): HTMLLIElement {
  const item = el('li', 'ps-prob rb-prob') as HTMLLIElement;
  item.style.setProperty('--i', String(index));
  const link = el('a', 'ps-prob__link') as HTMLAnchorElement;
  link.href = `#/rules-book?id=${row.id}`;
  const medal = el('span', 'ps-prob__medal rb-prob__medal');
  const rule = row.main ?? null;
  medal.append(rule ? entryEmblem(rule) : bookEmblem());
  const body = el('span', 'ps-prob__body');
  const meta = el('span', 'ps-prob__meta');
  const phase = PHASES[row.phase] ?? { label: row.phase, colour: 'var(--rb-ink)' };
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

type StartForm = { el: HTMLFormElement; startFrom(rule: string): void };

function startForm(): StartForm {
  const start = el('form', 'ps-start rb-start') as HTMLFormElement;
  const head = el('div', 'rb-start__head');
  head.append(el('h2', 'ps-start__title', 'What is the situation?'));
  const input = el('textarea', 'ps-start__input') as HTMLTextAreaElement;
  input.rows = 3;
  input.placeholder = 'One moment from work or life that is bothering you, and what you would like instead. Say what happened, the way you would to a friend.';
  input.setAttribute('aria-label', 'Describe the situation');
  const go = el('button', 'btn btn--primary', 'Start') as HTMLButtonElement;
  go.type = 'submit';
  const status = el('p', 'ps-start__status');
  status.setAttribute('role', 'status');
  const picked = el('p', 'rb-start__picked');
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
      const session = await rulesBookApi.create({ text, kind: 'rules', ...(startModel ? { startModel } : {}) });
      location.hash = `#/rules-book?id=${session.id}`;
    } catch (err) {
      status.textContent = errorMessage(err);
      go.disabled = false;
    }
  });
  return {
    el: start,
    /** A rule picked on the shelf: the session will open on it once it is grounded. */
    startFrom(rule: string) {
      startModel = rule;
      const clear = el('button', 'rb-start__clear', 'Clear') as HTMLButtonElement;
      clear.type = 'button';
      clear.addEventListener('click', () => {
        startModel = null;
        picked.hidden = true;
        input.focus();
      });
      picked.replaceChildren(entryEmblem(rule), el('span', '', `Starting from ${toolNamed(rule)?.name ?? rule}`), clear);
      picked.hidden = false;
      input.focus();
    }
  };
}

function buildSteps(): HTMLElement {
  const steps: Array<[string, string, string, string]> = [
    ['Ground', 'One real moment', 'What happened, what you want instead, and which part of what you tell yourself you saw and which part you worked out.', MARKS.ground],
    ['Select', 'One fitting rule', 'The coach offers a single rule of thumb, with a way it could mislead you here.', CLOSED_BOX],
    ['Apply', 'Its chart', 'The rule’s own chart builds as you answer, with the fewest observations that help.', BULB],
    ['Act and review', 'A small experiment', 'One next action, a time to look again, and what you would see if your reading were wrong.', MARKS.act]
  ];
  const list = el('ol', 'ps-build rb-build');
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
  const box = el('div', 'rb-check');
  const item = (title: string, line: string, art: string) => {
    const card = el('div', 'rb-check__item');
    const mark = el('span', 'rb-check__mark');
    mark.append(svg('0 0 100 100', art));
    const text = el('div', 'rb-check__text');
    text.append(el('h3', 'rb-check__title', title), el('p', 'rb-check__line', line));
    card.append(mark, text);
    return card;
  };
  box.append(
    item('Truth check', 'What did you see or hear yourself, and what did you work out from it? A distressing story can feel like a fact.', MARKS.ground),
    item('Usefulness check', 'Is the rule still useful for this purpose, and what would make you drop it here? Every rule is a simplification.', MARKS.review)
  );
  return box;
}

/** One line per group: what its rules are for, in our words. */
function groupShelves(onStart: (rule: string) => void): HTMLElement {
  const offered = new Set(shelfTools());
  const wrap = el('div', 'rb-sections');
  GROUPS.forEach((group, k) => {
    const s = SECTIONS.find((item) => item.key === group.section)!;
    const entries = CATALOGUE.filter((e) => e.section === s.key && offered.has(e.id));
    const box = el('details', 'rb-sect') as HTMLDetailsElement;
    box.open = true;
    const summary = el('summary', 'rb-sect__head');
    const mark = el('span', 'rb-sect__mark');
    mark.append(sectionEmblem(s.key), el('span', 'rb-sect__stn', `Part ${k + 1}`));
    const text = el('span', 'rb-sect__text');
    text.append(el('span', 'rb-sect__title', s.title), el('span', 'rb-sect__line', `${groupLine(group.id)} ${entries.length} rules.`));
    summary.append(mark, text);
    const shelf = el('ul', 'ps-shelf rb-shelf');
    for (const e of entries) {
      const tool = toolNamed(e.id)!;
      const item = el('li', 'ps-shelf__tool rb-shelf__tool');
      item.dataset.tool = e.id;
      const name = el('span', 'ps-shelf__name', tool.name);
      if (e.tier === 'lens') name.append(' ', el('em', 'rb-shelf__tag', 'lens'));
      if (e.reuse) name.append(' ', el('em', 'rb-shelf__tag', e.reuse === 'pareto' ? 'from Problem Solver' : 'from Decision Maker'));
      const use = el('button', 'rb-shelf__start', 'Start from this') as HTMLButtonElement;
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
  const page = el('div', 'ps-page ps-landing ps-scope rb-scope rb-page');
  const hero = el('div', 'ps-hero rb-hero');
  const copy = el('div', 'ps-hero__copy');
  const start = startForm();
  const lede = el('div', 'rb-hero__lede');
  lede.append(bookEmblem(), el('p', 'ps-hero__lede', 'For a moment at work or in life that you cannot read clearly. Tell the coach what happened: it offers one rule of thumb from The Rules Book, checks what you saw against what you worked out, and helps you try a small, dated experiment.'));
  copy.append(lede, start.el);
  const art = el('div', 'rb-hero__art');
  art.setAttribute('aria-hidden', 'true');
  art.append(bookEmblem());
  hero.append(copy, art);
  page.append(hero);

  const sessions = (await rulesBookApi.list()).filter((item) => item.status !== 'archived');
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
    section('Your work', sessions.length ? 'Each badge is the rule in use, or the book until one is chosen.' : 'Nothing yet. Start with the moment you keep going over.', list),
    section('How a session builds', 'One rule per session, tried as an experiment. The coach chooses from the book; you can always pick from the shelf instead.', buildSteps()),
    section('Two checks, every time', 'Rules of thumb are lenses, never laws. These two questions run through every session.', modelCheck()),
    section('The four parts', 'The book’s four parts. Start from any rule to open a session already on it.', groupShelves((rule) => {
      start.startFrom(rule);
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

/** The shelf on the session page: every rule by part, each asking the coach for it. Open in Explore only. */
function createShelf(onPick: (rule: string) => void) {
  const box = el('details', 'rb-session-shelf') as HTMLDetailsElement;
  const summary = el('summary', 'rb-session-shelf__head', 'Pick a rule from the shelf');
  const offered = new Set(shelfTools());
  const body = el('div', 'rb-session-shelf__body');
  for (const group of GROUPS) {
    const s = SECTIONS.find((item) => item.key === group.section)!;
    const wrap = el('div', 'rb-session-shelf__group');
    wrap.dataset.group = group.id;
    const list = el('ul', 'rb-session-shelf__list');
    for (const e of CATALOGUE.filter((item) => item.section === s.key && offered.has(item.id))) {
      const item = el('li', '');
      const button = el('button', 'rb-session-shelf__pick') as HTMLButtonElement;
      button.type = 'button';
      button.dataset.tool = e.id;
      button.title = toolNamed(e.id)!.when;
      button.append(entryEmblem(e.id), el('span', '', toolNamed(e.id)!.name));
      button.addEventListener('click', () => onPick(e.id));
      item.append(button);
      list.append(item);
    }
    wrap.append(el('h3', 'rb-session-shelf__title', group.label), list);
    body.append(wrap);
  }
  box.append(summary, el('p', 'rb-session-shelf__line', 'The coach suggests one rule; you can ask for another. Your part of life comes first.'), body);
  let key = '';
  return {
    el: box,
    update(session: PsSession) {
      box.hidden = session.phase !== 'explore';
      const lit = parseGroups(session.frame?.group ?? '') as string[];
      const next = lit.join('+');
      if (next === key) return;
      key = next;
      // The lit parts first, then the rest in the book's order.
      const groups = [...body.children] as HTMLElement[];
      groups.sort((a, b) => Number(!lit.includes(a.dataset.group!)) - Number(!lit.includes(b.dataset.group!)) || GROUPS.findIndex((g) => g.id === a.dataset.group) - GROUPS.findIndex((g) => g.id === b.dataset.group));
      body.append(...groups);
      for (const wrap of groups) wrap.dataset.lit = String(lit.includes(wrap.dataset.group!));
    }
  };
}

/** The two checks, a collapsed reminder beside the coach. */
function createChecks(): HTMLElement {
  const box = el('details', 'rb-checks') as HTMLDetailsElement;
  box.append(el('summary', 'rb-checks__head', 'Two checks for every rule'), modelCheck());
  return box;
}

function syncFor(initial: PsSession, render: (session: PsSession) => void, alive: () => boolean) {
  return createSessionSync({
    initial,
    render,
    actWith: (s, action, payload) => rulesBookApi.actWith(s, action, payload),
    get: (sessionId) => rulesBookApi.get(sessionId),
    poll: (sessionId, onUpdate) => {
      poll?.abort();
      poll = new AbortController();
      return pollUntilSettled(sessionId, onUpdate, { get: rulesBookApi.get, signal: poll.signal });
    },
    alive
  });
}

async function renderSession(canvas: HTMLElement, id: string): Promise<void> {
  let session = await rulesBookApi.get(id);
  const page = el('div', 'ps-page ps-session ps-scope rb-scope rb-page');
  const back = el('a', 'ps-back', '← Your work') as HTMLAnchorElement;
  back.href = '#/rules-book';
  const title = el('h2', 'ps-session__title', session.title);
  const track = createTrack();
  const board = el('div', 'ps-session__board');
  const bench = el('div', 'ps-bench rb-bench');
  const groups = createGroups();
  const canvasHost = el('div', 'ps-canvas rb-canvas');
  const tray = createSkillTray();
  const review = mountReviewPanel({ start: () => void reviews.startReview() });
  const shelf = createShelf((rule) => void pick(rule));
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
  const coach = mountCoachPanel({ onSay: (text) => void act('say', text), onAction: (action) => void act(action) }, { cards: cards.el, look: RB_LOOK });
  const coachHost = el('div', 'ps-coach-host rb-coach-host');
  coachHost.append(createChecks(), coach.el);
  board.append(bench, coachHost);
  const entry = reviewEntry(session, hashQuery().get('step'));
  const banner = entry ? reviewBanner(entry, () => void reviews.startReview(), stepName(session.model!.id, entry.step), 'session') : null;
  page.append(back, title, track.el, ...(banner ? [banner] : []), board);
  canvas.replaceChildren(page);
  const diagram = mountRulesCanvas(canvasHost, { onScore: (scores) => void rescore(scores) });
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
      paint(await rulesBookApi.act(session, action, text));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await rulesBookApi.get(session.id));
        return;
      }
      flash(err);
      return;
    }
    if (isBusy(session)) await settle();
  }

  /** A rule asked for on the shelf: a message to the coach, who still weighs it against the frame. Only Explore picks a rule. */
  async function pick(rule: string): Promise<void> {
    if (session.phase !== 'explore') {
      flash(new Error('Rules are picked in Apply a rule.'));
      return;
    }
    if (isBusy(session)) return;
    await act('say', `Let’s try ${toolNamed(rule)?.name ?? rule}.`);
  }

  /** A plot, scales or Pareto chart the person placed or scored: its payload, with the run it belongs to. */
  async function rescore({ runId, ...scores }: RbRunScores): Promise<void> {
    try {
      paint(await rulesBookApi.score(session, { runId, ...scores }));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await rulesBookApi.get(session.id));
        return;
      }
      flash(err);
    }
  }

  render(session);
  if (isBusy(session)) await settle();
}

/** Leaving the Rules Book (or opening another session): stop polling, drop the canvas and the Tasks listeners. */
export function unmountRulesBookView(): void {
  poll?.abort();
  poll = null;
  canvasNow?.destroy();
  canvasNow = null;
  for (const off of unsubscribeNow) off();
  unsubscribeNow = [];
}

export async function renderRulesBookView(canvas: HTMLElement): Promise<void> {
  unmountRulesBookView();
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const id = hashQuery().get('id');
  try {
    if (id) await renderSession(canvas, id);
    else await renderList(canvas);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderRulesBookView(canvas), 'Could not load the Rules Book');
  }
}
