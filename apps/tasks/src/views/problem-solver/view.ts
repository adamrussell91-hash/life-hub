// apps/tasks/src/views/problem-solver/view.ts
import '../../../../../packages/problem-solver/problem-solver.css';
import './problem-solver-view.css';
import { el } from '@/views/hub-kit';
import { hashQuery } from '@/shell/shell';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { EMBLEM_SVG, skillGlyph, toolEmblem } from '../../../../../packages/problem-solver/glyphs';
import { SKILLS } from '../../../../../packages/problem-solver/skills.mjs';
import { TOOLS, toolsForBookStep } from '../../../../../packages/problem-solver/tools/index.mjs';
import { BOOK_STEPS, nextPhase, pastStep, planStepForBook, stepName } from '../../../../../packages/problem-solver/steps.mjs';
import type { PsAction, PsSession, PsSummary, PsToolId } from '../../../../../packages/problem-solver/types';
import { isBusy, pollUntilSettled, problemSolverApi } from './api';
import { mountCanvas, type RunScores } from './canvas';
import { mountCoachPanel } from './coach-panel';
import { createTaskBridge, taskSnapshot, type TaskDetail } from './task-bridge';
import { mountReviewPanel, reviewBanner, type ReviewEntry } from './review-panel';
import { mountTaskCards } from './task-cards';
import { createSessionSync } from './session-sync';
import { tasksApi } from '@/services/client-api';
import { onTasksChanged, onTasksDeleted } from '@/services/task-cache';
import { art, createShapeBoard, createTrack, FRAME_PIECES, problemMedal } from './decor';

let poll: AbortController | null = null;
/** The open session's canvas, dropped (observers, frame loops) when the page changes. */
let diagramNow: { destroy(): void } | null = null;
/** The open session's Tasks listeners (live statuses), removed when the page changes. */
let unsubscribeNow: Array<() => void> = [];

const phaseLabel = (row: PsSummary): string => (row.phase === 'frame' ? 'Framing' : row.phase === 'finished' ? 'Finished' : row.model ? stepName(row.model, row.phase) : row.phase);
const phaseColour = (phase: string): string => (phase === 'frame' ? 'var(--ps-blue)' : phase === 'finished' ? 'var(--ps-red)' : 'var(--ps-yellow)');
const COLOURS = ['var(--ps-red)', 'var(--ps-yellow)', 'var(--ps-blue)'];

function section(title: string, aside: string, ...body: Node[]): HTMLElement {
  const wrap = el('section', 'ps-section');
  const head = el('div', 'ps-section__head');
  head.append(el('h2', 'section-title ps-section__title', title), el('p', 'ps-section__aside', aside));
  wrap.append(head, ...body);
  return wrap;
}

function startForm(onType: () => void): HTMLFormElement {
  const start = el('form', 'ps-start') as HTMLFormElement;
  const input = el('textarea', 'ps-start__input') as HTMLTextAreaElement;
  input.rows = 3;
  input.placeholder = 'What problem are you trying to solve? Say it the way you would to a friend.';
  input.setAttribute('aria-label', 'Describe the problem');
  const go = el('button', 'btn btn--primary', 'Start') as HTMLButtonElement;
  go.type = 'submit';
  const status = el('p', 'ps-start__status');
  const row = el('div', 'ps-start__row');
  row.append(status, go);
  start.append(el('h2', 'ps-start__title', 'New problem'), input, row);
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
      const session = await problemSolverApi.create({ text });
      location.hash = `#/problem-solver?id=${session.id}`;
    } catch (err) {
      status.textContent = errorMessage(err);
      go.disabled = false;
    }
  });
  return start;
}

function problemCard(row: PsSummary, index: number): HTMLLIElement {
  const item = el('li', 'ps-prob') as HTMLLIElement;
  item.style.setProperty('--i', String(index));
  const link = el('a', 'ps-prob__link') as HTMLAnchorElement;
  link.href = `#/problem-solver?id=${row.id}`;
  const medal = el('span', 'ps-prob__medal');
  const frame = row.frame ?? (row.phase === 'frame' ? 0 : 3);
  medal.append(problemMedal(frame, row.tool));
  const body = el('span', 'ps-prob__body');
  const meta = el('span', 'ps-prob__meta');
  const phase = el('span', 'ps-prob__phase', phaseLabel(row));
  phase.style.setProperty('--c', phaseColour(row.phase));
  meta.append(phase, el('span', '', row.tool ? TOOLS[row.tool].name : row.phase === 'frame' ? `Question ${Math.min(frame + 1, 3)} of 3` : ''), el('span', '', formatDisplayDate(row.updatedAt.slice(0, 10))));
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

function buildSteps(): HTMLElement {
  const steps: Array<[string, string, string, SVGSVGElement | HTMLElement]> = [
    ['Frame', 'Three questions', 'What is the goal, what is true and what can be done. Each answer drops a piece into place.',
      art(`<path class="ps-build__a1" fill="var(--ps-blue)" d="${FRAME_PIECES.top}"/><path class="ps-build__a2" fill="var(--ps-yellow)" d="${FRAME_PIECES.mid}"/><path class="ps-build__a3" fill="var(--ps-red)" d="${FRAME_PIECES.bot}"/>`, 'ps-build__assemble')],
    ['Define', 'The coach picks a tool', '5 Whys for one clear symptom, a problem tree when causes tangle. The chart draws as you answer.', cyclingEmblem()],
    ['Skills', 'Thinking you used', "Answers earn the book's thinking skill marks, so you can see which ones you lean on.",
      art('<g class="ps-spin"><circle cx="50" cy="50" r="48" fill="var(--ps-ghost)"/><path fill="var(--ps-red)" d="M50 2A48 48 0 0 0 50 98Z"/><path fill="var(--ps-blue)" d="M50 50V2A48 48 0 0 1 98 50Z"/></g><circle cx="50" cy="50" r="14" fill="var(--ps-card)"/>')],
    ['Defined', 'A record you can act on', 'Finish with SMART objectives and a black and white record of every step.',
      art('<path fill="var(--ps-yellow)" d="M83.94 16.06A48 48 0 0 0 16.06 83.94Z"/><path fill="var(--ps-blue)" d="M83.94 16.06A48 48 0 0 1 16.06 83.94Z"/><path class="ps-spin ps-spin--fast" fill="var(--ps-red)" d="M50 30L70 66H30Z"/>')]
  ];
  const list = el('ol', 'ps-build');
  steps.forEach(([label, title, detail, drawing], i) => {
    const step = el('li', 'ps-build__step');
    const figure = el('span', 'ps-build__art');
    figure.append(drawing);
    step.append(figure, el('span', 'ps-build__n', `${i + 1} · ${label}`), el('h3', 'ps-build__title', title), el('p', 'ps-build__detail', detail));
    list.append(step);
  });
  return list;
}

function cyclingEmblem(): HTMLElement {
  const holder = el('span', 'ps-build__cycle');
  const order: PsToolId[] = ['five_whys', 'problem_tree', 'concept_map', 'gap_basic', 'smart'];
  let i = 0;
  const show = () => {
    const drawing = art(EMBLEM_SVG[order[i % order.length]], 'ps-pop');
    holder.replaceChildren(drawing);
    i += 1;
  };
  show();
  if (!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    const timer = setInterval(() => (holder.isConnected ? !document.hidden && show() : clearInterval(timer)), 2400);
  }
  return holder;
}

/** Every registered tool, one group per book step (TRIZ's contradiction step is left out). */
export function toolShelf(): HTMLElement {
  const groups = el('div', 'ps-shelves');
  for (const step of BOOK_STEPS) {
    if (step.id === 'contradiction') continue;
    const ids = toolsForBookStep(step.id) as PsToolId[];
    if (!ids.length) continue;
    const group = el('section', 'ps-shelves__step');
    group.dataset.step = step.id;
    const shelf = el('ul', 'ps-shelf');
    for (const id of ids) {
      const item = el('li', 'ps-shelf__tool');
      item.append(toolEmblem(id), el('span', 'ps-shelf__name', TOOLS[id].name), el('span', 'ps-shelf__when', TOOLS[id].when));
      shelf.append(item);
    }
    group.append(el('h3', 'ps-shelves__title', step.name), shelf);
    groups.append(group);
  }
  return groups;
}

function skillsRibbon(sessions: PsSummary[]): HTMLElement {
  const totals: Record<string, number> = {};
  for (const row of sessions) for (const [id, n] of Object.entries(row.skills ?? {})) totals[id] = (totals[id] ?? 0) + n;
  const max = Math.max(1, ...Object.values(totals));
  const grid = el('ul', 'ps-skills');
  SKILLS.forEach((skill, i) => {
    const n = totals[skill.id] ?? 0;
    const item = el('li', `ps-skills__item${n ? '' : ' is-unused'}`);
    item.title = skill.description;
    const text = el('span', 'ps-skills__text');
    const bar = el('span', 'ps-skills__bar');
    const fill = el('i');
    fill.style.setProperty('--w', `${(n / max) * 100}%`);
    fill.style.setProperty('--c', COLOURS[i % 3]);
    bar.append(fill);
    text.append(el('span', 'ps-skills__name', skill.name), el('span', 'ps-skills__count', n ? `${n}×` : 'Not yet'), bar);
    item.append(skillGlyph(skill.id), text);
    grid.append(item);
  });
  return grid;
}

async function renderList(canvas: HTMLElement): Promise<void> {
  const page = el('div', 'ps-page ps-landing ps-scope');
  const board = createShapeBoard();
  const hero = el('div', 'ps-hero');
  const copy = el('div', 'ps-hero__copy');
  copy.append(
    el('p', 'ps-hero__lede', 'Name the thing that is stuck. A coach asks one question at a time and builds the toolkit’s charts with you, piece by piece.'),
    startForm(() => board.nudge())
  );
  hero.append(copy, board.el);
  page.append(hero);

  const sessions = (await problemSolverApi.list()).filter((item) => item.status !== 'archived');
  const problems = el('ul', 'ps-probs');
  problems.append(...sessions.map(problemCard));
  const fresh = el('li', 'ps-prob ps-prob--new');
  const freshButton = el('button', 'ps-prob__new', '+ New problem') as HTMLButtonElement;
  freshButton.type = 'button';
  freshButton.addEventListener('click', () => {
    page.querySelector<HTMLTextAreaElement>('.ps-start__input')?.focus();
    page.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  });
  fresh.append(freshButton);
  problems.append(fresh);

  page.append(
    section('Problems', sessions.length ? 'Each badge fills in as you go. Blue, yellow and red are the three framing questions; the centre is the tool in use.' : 'Nothing yet. Start with the problem that is bugging you most.', problems),
    section('How a session builds', 'The order follows the toolkit’s problem solving process.', buildSteps()),
    section('The toolkit', 'The coach picks from these for each step. Here is what each one is for.', toolShelf()),
    section('Thinking skills you have used', 'Totals across your problems. Faint marks have not come up yet.', skillsRibbon(sessions))
  );
  canvas.replaceChildren(page);
}

/** The twelve skill marks; ones seen in this session fill in, newly earned ones pop. */
function createSkillTray(): { el: HTMLElement; update(session: PsSession): void } {
  const tray = el('div', 'ps-tray');
  const head = el('div', 'ps-tray__head');
  const count = el('span', 'ps-tray__count');
  head.append(el('h3', 'ps-tray__title', 'Thinking skills this session'), count);
  const slots = el('ul', 'ps-tray__slots');
  const byId = new Map<string, HTMLElement>();
  for (const skill of SKILLS) {
    const slot = el('li', 'ps-tray__slot');
    slot.title = skill.name;
    slot.append(skillGlyph(skill.id));
    slots.append(slot);
    byId.set(skill.id, slot);
  }
  tray.append(head, slots);
  let first = true;
  return {
    el: tray,
    update(session) {
      const seen = new Set(session.turns.flatMap((turn) => turn.skillsSeen ?? []));
      let delay = 0;
      for (const [id, slot] of byId) {
        const on = seen.has(id);
        if (on && !slot.classList.contains('is-on') && !first) {
          slot.style.setProperty('--d', `${delay}ms`);
          delay += 220;
          slot.classList.add('is-earned');
          setTimeout(() => slot.classList.remove('is-earned'), 1200 + delay);
        }
        slot.classList.toggle('is-on', on);
      }
      count.textContent = `${seen.size} of ${SKILLS.length}`;
      first = false;
    }
  };
}

/** A review exists to wait for: created, or proposed and not set aside (mirrors the server). */
const reviewLive = (session: PsSession): boolean =>
  Boolean(session.reviewTaskId) || session.reviewProposal?.status === 'proposed' || session.reviewProposal?.status === 'confirmed';

/**
 * How a review link (`step=improve`) enters the session, or null when it cannot start a review:
 * `move` from the step just before Improve, `start` in Improve before the review is under way,
 * `reopen` once the session has moved past Improve (a new pass that returns afterwards).
 */
export function reviewEntry(session: PsSession, wanted: string | null): ReviewEntry | null {
  if (wanted !== 'improve' || !session.model || !reviewLive(session) || session.detour) return null;
  const status = session.reviewState?.status;
  if (status === 'reviewing' || status === 'done') return null;
  const step = planStepForBook(session.model.id, 'improve');
  if (!step) return null;
  if (session.phase === step) return { kind: 'start', step };
  if (session.phase !== 'finished' && nextPhase(session) === step) return { kind: 'move', step };
  if (pastStep(session, step)) return { kind: 'reopen', step };
  return null;
}

/** Today as the local `YYYY-MM-DD`. */
function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Comparable key for a snapshot's counts and overdue titles (its time is left out). */
const snapshotKey = (snap: { byStatus: Record<string, number>; overdue: string[] } | null | undefined): string =>
  snap ? JSON.stringify([Object.entries(snap.byStatus).sort(([a], [b]) => a.localeCompare(b)), snap.overdue]) : '';

async function renderSession(canvas: HTMLElement, id: string): Promise<void> {
  let session = await problemSolverApi.get(id);
  const page = el('div', 'ps-page ps-session ps-scope');
  const back = el('a', 'ps-back', '← Problems') as HTMLAnchorElement;
  back.href = '#/problem-solver';
  const title = el('h2', 'ps-session__title', session.title);
  const track = createTrack();
  const board = el('div', 'ps-session__board');
  const bench = el('div', 'ps-bench');
  const canvasHost = el('div', 'ps-canvas');
  const tray = createSkillTray();
  const review = mountReviewPanel({ start: () => void startReview() });
  bench.append(review.el, canvasHost, tray.el);
  const cards = mountTaskCards({
    create: (proposal, edits) => bridge.create(session, proposal, edits),
    dismiss: (proposal) => confirmed('dismiss_task', { proposalId: proposal.id }),
    createReview: (edits) => bridge.createReview(session, edits),
    dismissReview: () => confirmed('dismiss_review', {})
  }, { fallbackFocus: () => coach.el.querySelector('textarea') });
  const coach = mountCoachPanel({ onSay: (text) => void act('say', text), onAction: (action) => void act(action) }, { cards: cards.el });
  const coachHost = el('div', 'ps-coach-host');
  coachHost.append(coach.el);
  board.append(bench, coachHost);
  const entry = reviewEntry(session, hashQuery().get('step'));
  let banner: HTMLElement | null = entry ? reviewBanner(entry, () => void startReview(), stepName(session.model!.id, entry.step)) : null;
  page.append(back, title, track.el, ...(banner ? [banner] : []), board);
  canvas.replaceChildren(page);
  const diagram = mountCanvas(canvasHost, { onScore: (scores) => void rescore(scores) });
  diagramNow = diagram;

  const flash = (err: unknown) => {
    coachHost.querySelector('.ps-coach__status--failed.is-transient')?.remove();
    const note = el('p', 'ps-coach__status ps-coach__status--failed is-transient', errorMessage(err));
    coach.el.querySelector('.ps-coach__extras')?.prepend(note);
  };

  /** Sorted confirmed task ids last fetched, so statuses refresh only when the set changes. */
  let confirmedKey = '';
  let shownPhase = '';
  const confirmedIds = () => (session.proposedTasks ?? []).filter((p) => p.status === 'confirmed' && p.taskId).map((p) => p.taskId!).sort().join(',');

  /** Draw a snapshot. Only reached through `sync.paint`, which drops older revisions. */
  const render = (next: PsSession) => {
    session = next;
    if (title.textContent !== session.title) title.textContent = session.title;
    track.update(session);
    diagram.update(session);
    tray.update(session);
    coach.update(session);
    cards.update(session);
    review.update(session);
    const key = confirmedIds();
    // Entering Improve also refreshes, so the coach gets the tasks' snapshot there.
    const enteredImprove = session.phase !== shownPhase && session.model && session.phase === planStepForBook(session.model.id, 'improve');
    shownPhase = session.phase;
    if (key !== confirmedKey || (enteredImprove && key)) {
      confirmedKey = key;
      void refreshStatuses();
    }
  };

  const sync = createSessionSync({
    initial: session,
    render,
    actWith: (s, action, payload) => problemSolverApi.actWith(s, action, payload),
    get: (sessionId) => problemSolverApi.get(sessionId),
    poll: (sessionId, onUpdate) => {
      poll?.abort();
      poll = new AbortController();
      return pollUntilSettled(sessionId, onUpdate, { signal: poll.signal });
    },
    alive: () => page.isConnected
  });
  const paint = (next: PsSession) => void sync.paint(next);
  const settle = () => sync.settle();
  /** Task writes: after the coach settles, one at a time, a stale revision retried once. */
  const confirmed = (action: PsAction, payload: Record<string, unknown>) => sync.confirmed(action, payload);

  /**
   * The linked task's domain if the problem links one, else life (Decision 1); one fetch per
   * session. A failed fetch is not cached and is passed on, so the card shows it and a retry
   * asks again rather than filing the task under the wrong domain.
   */
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
    setReview: (taskId, due) => confirmed('set_review_task', { taskId, due })
  });

  /** The last snapshot key posted (or seen on the session), so a status refresh never posts twice. */
  let postedKey = snapshotKey(session.taskSnapshot);

  /** In an Improve plan step, not waiting, with a confirmed task: tell the coach how the tasks stand. */
  function postSnapshot(details: Record<string, TaskDetail>): void {
    const s = session;
    const improve = s.model ? planStepForBook(s.model.id, 'improve') : null;
    if (!improve || s.phase !== improve || s.reviewState?.status === 'waiting') return;
    const proposals = s.proposedTasks ?? [];
    if (!proposals.some((p) => p.status === 'confirmed' && p.taskId)) return;
    const snapshot = taskSnapshot(proposals, details, localToday());
    const key = snapshotKey(snapshot);
    if (key === postedKey || key === snapshotKey(s.taskSnapshot)) return;
    postedKey = key;
    confirmed('task_status', { snapshot }).catch(() => {
      if (postedKey === key) postedKey = '';
    });
  }

  /** Fetch the confirmed tasks once: live statuses for the chart, and the snapshot for Improve. */
  let statusRound = 0;
  async function refreshStatuses(): Promise<void> {
    if (!page.isConnected) return;
    const round = ++statusRound;
    const details = await bridge.details(session.proposedTasks ?? []);
    if (round !== statusRound || !page.isConnected) return;
    diagram.setTaskStatuses(Object.fromEntries(Object.entries(details).map(([id, d]) => [id, typeof d === 'string' ? d : d.status])));
    postSnapshot(details);
  }

  /** Review now, or the review link's banner: post the snapshot and start the review. */
  let starting = false;
  async function startReview(): Promise<void> {
    if (starting) return;
    starting = true;
    banner?.remove();
    banner = null;
    try {
      const proposals = session.proposedTasks ?? [];
      const snapshot = taskSnapshot(proposals, await bridge.details(proposals), localToday());
      postedKey = snapshotKey(snapshot);
      paint(await problemSolverApi.actWith(session, 'start_review', { snapshot }));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await problemSolverApi.get(session.id));
      } else {
        flash(err);
      }
      review.update(session);
      return;
    } finally {
      starting = false;
    }
    await settle();
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible' && confirmedKey) void refreshStatuses();
  };
  document.addEventListener('visibilitychange', onVisible);
  unsubscribeNow.push(
    onTasksChanged(() => void (confirmedKey && refreshStatuses())),
    onTasksDeleted(() => void (confirmedKey && refreshStatuses())),
    () => document.removeEventListener('visibilitychange', onVisible)
  );

  async function act(action: PsAction, text?: string): Promise<void> {
    try {
      paint(await problemSolverApi.act(session, action, text));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await problemSolverApi.get(session.id));
        return;
      }
      flash(err);
      return;
    }
    if (isBusy(session)) await settle();
  }

  /** Any scored tool's payload passes through as it is, with the run it belongs to. */
  async function rescore({ runId, ...scores }: RunScores): Promise<void> {
    try {
      paint(await problemSolverApi.score(session, { runId, ...scores }));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await problemSolverApi.get(session.id));
        return;
      }
      flash(err);
    }
  }

  render(session);
  if (isBusy(session)) await settle();
}

/** Leaving Problem Solver (or opening another problem): stop polling, drop the chart and the Tasks listeners. */
export function unmountProblemSolverView(): void {
  poll?.abort();
  poll = null;
  diagramNow?.destroy();
  diagramNow = null;
  for (const off of unsubscribeNow) off();
  unsubscribeNow = [];
}

export async function renderProblemSolverView(canvas: HTMLElement): Promise<void> {
  unmountProblemSolverView();
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const id = hashQuery().get('id');
  try {
    if (id) await renderSession(canvas, id);
    else await renderList(canvas);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderProblemSolverView(canvas), 'Could not load Problem Solver');
  }
}
