// apps/tasks/src/views/decision-book/view.ts
// Decision Maker in the Tasks hub (#/decision-maker): the landing page (hero, New decision,
// Quick decision, decisions, the four sections, the shared skills ribbon) and the session page
// (track, compass above the canvas, coach, skill tray, review panel, task and record cards).
// Its structure is Problem Solver's: the coach panel, task cards, bridges, review panel and
// syncs are Problem Solver's own components, given Decision Maker's API, look and record.
// A quick decision has its own page (quick-view.ts), as a Lightning run does in Problem Solver.
import '../../../../../packages/problem-solver/problem-solver.css';
import '../../../../../packages/decision-book/decision-book.css';
import '../problem-solver/problem-solver-view.css';
import './decision-book-view.css';
import { el } from '@/views/hub-kit';
import { hashQuery } from '@/shell/shell';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { tasksApi } from '@/services/client-api';
import { onTasksChanged, onTasksDeleted } from '@/services/task-cache';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { skillGlyph } from '../../../../../packages/problem-solver/glyphs';
import { planStepForBook, stepName } from '../../../../../packages/problem-solver/steps.mjs';
import { reviewStart, waitingForReview } from '../../../../../packages/problem-solver/review.mjs';
import type { PsAction, PsRecordOffer, PsSession, PsSummary } from '../../../../../packages/problem-solver/types';
import { SECTIONS, modelsInSection } from '../../../../../packages/decision-book/catalogue.mjs';
import { composeRecord, recordOffer } from '../../../../../packages/decision-book/record.mjs';
import { currentEntry as quickEntry, decisionOf } from '../../../../../packages/decision-book/quick.mjs';
import { modelEmblem, sectionEmblem } from '../../../../../packages/decision-book/glyphs';
import { decisionBookApi, isBusy, pollUntilSettled, problemSolverApi } from '../problem-solver/api';
import { mountCoachPanel } from '../problem-solver/coach-panel';
import { createTaskBridge, taskBody, type TaskOrigin } from '../problem-solver/task-bridge';
import { mountReviewPanel, reviewBanner, type ReviewEntry } from '../problem-solver/review-panel';
import { createReviewSync } from '../problem-solver/review-sync';
import { compactToday, mountTaskCards, type PlaceOption } from '../problem-solver/task-cards';
import { createCaseFileBridge, type CaseFilePlace, type PaperOffer } from '../problem-solver/case-file-bridge';
import { createSessionSync } from '../problem-solver/session-sync';
import { skillsRibbon } from '../problem-solver/skills-ribbon';
import { caseFilePlaces, createSkillTray, section } from '../problem-solver/view';
import { BACK_DISC, DM_LOOK, FORWARD_DISC, createCompass, createShapeBoard, createTrack, decisionMedal, plainName, toolNamed } from './decor';
import { mountDecisionCanvas, type DmRunScores } from './canvas';
import { recordBlocks, recordGraphic } from './record-blocks';
import { mountFromQuick, mountQuickPage } from './quick-view';

let poll: AbortController | null = null;
/** The open session's canvas and Tasks listeners, dropped when the page changes. */
let canvasNow: { destroy(): void } | null = null;
let unsubscribeNow: Array<() => void> = [];

const ORIGIN: TaskOrigin = { name: 'Decision Maker', source: 'decision_maker', tag: 'decision-maker', noun: 'decision', review: 'the decision "%s" has worked out, then open it in Decision Maker to compare what you expected with what happened' };

const SVG_NS = 'http://www.w3.org/2000/svg';
function art(markup: string, className?: string): SVGSVGElement {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', '0 0 100 100');
  node.setAttribute('aria-hidden', 'true');
  if (className) node.setAttribute('class', className);
  node.innerHTML = markup;
  return node;
}

/* ── Landing ────────────────────────────────────────────────────────── */

const QUICK_LABELS = { proceed: 'Proceed', stop: 'Do not proceed' } as const;

/** A quick row's label: where it went, how it came out, or still going. */
const quickLabel = (row: PsSummary): string => (row.escalatedTo ? 'Went deeper' : row.outcome ? QUICK_LABELS[row.outcome] : 'Quick decision');

const phaseLabel = (row: PsSummary): string =>
  row.kind === 'quick' ? quickLabel(row)
    : row.phase === 'frame' ? 'Framing' : row.phase === 'finished' ? 'Finished' : row.model ? stepName(row.model, row.phase) : row.phase;
const phaseColour = (phase: string): string => (phase === 'frame' ? 'var(--dm-red)' : phase === 'finished' ? 'var(--dm-ink)' : 'var(--dm-green)');

/** The meta line's middle part: the question being framed, the model in hand, or the review date. */
function metaNote(row: PsSummary): string {
  if (row.kind === 'quick') return row.status === 'active' ? 'Quick decision' : '';
  if (row.phase === 'frame') return `Question ${Math.min((row.frame ?? 0) + 1, 3)} of 3`;
  if (row.reviewDue) return `Review due ${formatDisplayDate(row.reviewDue)}`;
  const model = row.main ?? row.tool;
  return model ? plainName(model) : '';
}

function decisionCard(row: PsSummary, index: number): HTMLLIElement {
  const item = el('li', 'ps-prob dm-prob') as HTMLLIElement;
  item.style.setProperty('--i', String(index));
  const link = el('a', 'ps-prob__link') as HTMLAnchorElement;
  link.href = `#/decision-maker?id=${row.id}`;
  const medal = el('span', 'ps-prob__medal');
  if (row.kind === 'quick') {
    // A quick decision's badge is its end: green forward on proceed, red back on do not proceed.
    medal.classList.add('ps-prob__medal--quick');
    medal.append(art(row.outcome === 'stop' ? BACK_DISC : row.outcome === 'proceed' ? FORWARD_DISC : QUICK_PAIR));
  } else {
    const frame = row.frame ?? (row.phase === 'frame' ? 0 : 3);
    medal.append(decisionMedal(frame, row.main ?? null));
  }
  const body = el('span', 'ps-prob__body');
  const meta = el('span', 'ps-prob__meta');
  const phase = el('span', 'ps-prob__phase', phaseLabel(row));
  phase.style.setProperty('--c', row.kind === 'quick' ? (row.outcome === 'stop' ? 'var(--dm-red)' : 'var(--dm-green)') : phaseColour(row.phase));
  meta.append(phase, el('span', '', metaNote(row)), el('span', '', formatDisplayDate(row.updatedAt.slice(0, 10))));
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

function startForm(onType: () => void): StartForm {
  const start = el('form', 'ps-start dm-start') as HTMLFormElement;
  const input = el('textarea', 'ps-start__input') as HTMLTextAreaElement;
  input.rows = 3;
  input.placeholder = 'What are you deciding, or trying to see clearly? Say it the way you would to a friend.';
  input.setAttribute('aria-label', 'Describe the decision');
  const go = el('button', 'btn btn--primary', 'Start') as HTMLButtonElement;
  go.type = 'submit';
  const status = el('p', 'ps-start__status');
  const picked = el('p', 'dm-start__picked');
  picked.hidden = true;
  const row = el('div', 'ps-start__row');
  row.append(status, go);
  start.append(el('h2', 'ps-start__title', 'New decision'), picked, input, row);
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
      const session = await decisionBookApi.create({ text, kind: 'decision', ...(startModel ? { startModel } : {}) });
      location.hash = `#/decision-maker?id=${session.id}`;
    } catch (err) {
      status.textContent = errorMessage(err);
      go.disabled = false;
    }
  });
  return {
    el: start,
    /** A model picked on the shelf: the decision will open on it once it is framed. */
    startFrom(model: string) {
      startModel = model;
      const clear = el('button', 'dm-start__clear', 'Clear') as HTMLButtonElement;
      clear.type = 'button';
      clear.addEventListener('click', () => {
        startModel = null;
        picked.hidden = true;
        input.focus();
      });
      picked.replaceChildren(modelEmblem(model), el('span', '', `Starting from ${toolNamed(model)?.name ?? model}`), clear);
      picked.hidden = false;
      input.focus();
    }
  };
}

/** The two cover discs side by side: the quick route's mark, and a quick run's badge while it is open. */
const QUICK_PAIR = '<g transform="translate(-2 26) scale(0.52)">' + BACK_DISC + '</g><g transform="translate(50 26) scale(0.52)">' + FORWARD_DISC + '</g>';

/** The quick route's card: one line, then a quick session (as Problem Solver's Lightning card). */
function quickCard(): HTMLElement {
  const card = el('section', 'ps-lightning-card dm-quick');
  const head = el('div', 'ps-lightning-card__head');
  const mark = el('span', 'dm-quick__mark');
  mark.append(art(QUICK_PAIR));
  head.append(mark, el('h2', 'ps-lightning-card__title', 'Quick decision'));
  const form = el('form', 'ps-lightning-card__form') as HTMLFormElement;
  const input = el('input', 'ps-lightning-card__input') as HTMLInputElement;
  input.type = 'text';
  input.placeholder = 'What is the call?';
  input.setAttribute('aria-label', 'Describe the quick decision');
  const go = el('button', 'ps-lightning-card__go', 'Go') as HTMLButtonElement;
  go.type = 'submit';
  const status = el('p', 'ps-lightning-card__status');
  status.setAttribute('role', 'status');
  const row = el('div', 'ps-lightning-card__row');
  row.append(input, go);
  form.append(row, status);
  card.append(head, el('p', 'ps-lightning-card__line', 'Three yes/no tests and a Stop Rule, for everyday calls.'), form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    go.disabled = true;
    status.textContent = '';
    try {
      const session = await decisionBookApi.create({ text, kind: 'quick' });
      location.hash = `#/decision-maker?id=${session.id}`;
    } catch (err) {
      status.textContent = errorMessage(err);
      go.disabled = false;
    }
  });
  return card;
}

function buildSteps(): HTMLElement {
  const steps: Array<[string, string, string, SVGSVGElement | HTMLElement]> = [
    ['Frame', 'Three questions', 'What you are deciding, who it is about and what you want, and what you already know.',
      art('<circle cx="27" cy="50" r="23" fill="var(--dm-red)"/><circle cx="73" cy="50" r="23" fill="var(--dm-green)"/><path d="M50 4V96" stroke="var(--dm-ink)" stroke-width="2" stroke-dasharray="4 4"/>', 'dm-build__pair')],
    ['Explore', 'The coach picks a model', 'From the book, to fit your question: an Eisenhower matrix for competing demands, a rubber band when you are pulled two ways.', cyclingEmblem()],
    ['Decide', 'Go forward', 'Name the decision, why, what would change your mind, the first step and when to look again.', art(`<g class="dm-go">${FORWARD_DISC}</g>`)],
    ['Review', 'Look back', 'A record on its task or project page, and a review that compares what you expected with what happened.', art(`<g class="dm-turn">${BACK_DISC}</g>`)]
  ];
  const list = el('ol', 'ps-build dm-build');
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
  const holder = el('span', 'ps-build__cycle dm-build__cycle');
  const order = ['dm_eisenhower', 'dm_rubber_band', 'dm_johari', 'dm_rumsfeld', 'dm_team'];
  let i = 0;
  const show = () => {
    const emblem = modelEmblem(order[i % order.length]);
    emblem.querySelector('svg')?.classList.add('ps-pop');
    holder.replaceChildren(emblem);
    i += 1;
  };
  show();
  if (!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    const timer = setInterval(() => (holder.isConnected ? !document.hidden && show() : clearInterval(timer)), 2400);
  }
  return holder;
}

/** One line per section: what its models are good for. */
const SECTION_LINES: Record<string, string> = {
  improve_yourself: 'Priorities, trade-offs and when to stop weighing.',
  understand_yourself: 'What drives you, drains you and pulls you two ways.',
  understand_others: 'Unknowns, risks and how other people decide.',
  improve_others: 'Teams, roles and leading the people involved.'
};

/**
 * The four sections, each opening its shelf of model emblems with a "use it when" line. A model
 * can start a decision: the New decision box then opens on it once the decision is framed.
 */
function sectionShelves(onStart: (model: string) => void): HTMLElement {
  const wrap = el('div', 'dm-sections');
  for (const s of SECTIONS) {
    const box = el('details', 'dm-sect') as HTMLDetailsElement;
    const summary = el('summary', 'dm-sect__head');
    const text = el('span', 'dm-sect__text');
    const count = modelsInSection(s.id).length;
    text.append(el('span', 'dm-sect__title', s.title), el('span', 'dm-sect__line', `${SECTION_LINES[s.key]} ${count} models.`));
    summary.append(sectionEmblem(s.key), text);
    const shelf = el('ul', 'ps-shelf dm-shelf');
    for (const entry of modelsInSection(s.id)) {
      const tool = toolNamed(entry.id);
      if (!tool) continue;
      const item = el('li', 'ps-shelf__tool dm-shelf__model');
      const use = el('button', 'dm-shelf__start', 'Start from this') as HTMLButtonElement;
      use.type = 'button';
      use.setAttribute('aria-label', `Start a decision from ${tool.name}`);
      use.addEventListener('click', () => onStart(entry.id));
      item.append(modelEmblem(entry.id), el('span', 'ps-shelf__name', plainName(entry.id)), el('span', 'ps-shelf__when', tool.when), use);
      shelf.append(item);
    }
    box.append(summary, shelf);
    wrap.append(box);
  }
  return wrap;
}

async function renderList(canvas: HTMLElement): Promise<void> {
  const page = el('div', 'ps-page ps-landing ps-scope dm-scope dm-page');
  const board = createShapeBoard();
  const hero = el('div', 'ps-hero');
  const copy = el('div', 'ps-hero__copy');
  const start = startForm(() => board.nudge());
  copy.append(
    el('p', 'ps-hero__lede', 'Say what you are weighing. A coach frames it in three questions, picks the models from The Decision Book that fit, and works them with you one answer at a time.'),
    start.el,
    quickCard()
  );
  hero.append(copy, board.el);
  page.append(hero);

  const [sessions, problems] = await Promise.all([
    decisionBookApi.list().then((rows) => rows.filter((item) => item.status !== 'archived')),
    // The shared tally only: a Problem Solver that cannot be reached leaves its share out.
    problemSolverApi.list().catch(() => [] as PsSummary[])
  ]);
  const list = el('ul', 'ps-probs');
  list.append(...sessions.map(decisionCard));
  const fresh = el('li', 'ps-prob ps-prob--new');
  const freshButton = el('button', 'ps-prob__new', '+ New decision') as HTMLButtonElement;
  freshButton.type = 'button';
  const toStart = () => {
    page.querySelector<HTMLTextAreaElement>('.ps-start__input')?.focus();
    page.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };
  freshButton.addEventListener('click', toStart);
  fresh.append(freshButton);
  list.append(fresh);

  page.append(
    section('Decisions', sessions.length ? 'Each badge is the cover, built as you go: the red disc is the decision, the green disc who it is about, the arrows what you know, and the centre the model it leans on.' : 'Nothing yet. Start with the decision you keep putting off.', list),
    section('How a session builds', 'Frame, then the coach discerns the models that fit. The book is a catalogue, so the coach chooses.', buildSteps()),
    section('The four sections', 'The book’s four parts, as a compass: about you or others, to understand or to improve. Open one to see its models.', sectionShelves((model) => {
      start.startFrom(model);
      toStart();
    })),
    section('Thinking skills you have used', 'Across Decision Maker and Problem Solver. Faint marks have not come up yet.', skillsRibbon({ name: 'Decision Maker', sessions }, { name: 'Problem Solver', sessions: problems }, () => 'var(--dm-ink)'))
  );
  canvas.replaceChildren(page);
}

/* ── Session ────────────────────────────────────────────────────────── */

/** How a review link (`step=review`) enters the decision, or null when it cannot start a review now. */
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
    const now = recordOffer(session) as PsRecordOffer | null;
    if (!now || now.key !== offer.key) throw new Error('The decision record changed; check the card again.');
    await write(session, now, choice);
  };
}

function syncFor(initial: PsSession, render: (session: PsSession) => void, alive: () => boolean) {
  return createSessionSync({
    initial,
    render,
    actWith: (s, action, payload) => decisionBookApi.actWith(s, action, payload),
    get: (sessionId) => decisionBookApi.get(sessionId),
    poll: (sessionId, onUpdate) => {
      poll?.abort();
      poll = new AbortController();
      return pollUntilSettled(sessionId, onUpdate, { get: decisionBookApi.get, signal: poll.signal });
    },
    alive
  });
}

const isConflict = (err: unknown): boolean => (err as { code?: string }).code === 'conflict';

/**
 * A quick decision: the Yes/No chart (Yes and No on the test being asked), the coach, the check
 * card, It came back and Go deeper. Every action goes through the session sync; a conflict refetches.
 */
async function renderQuickSession(canvas: HTMLElement, initial: PsSession): Promise<void> {
  const view = mountQuickPage(initial, {
    onAnswer: (node, answer) => void answerTest(node, answer),
    onSay: (text) => void say(text),
    onAction: (action) => void coachAction(action),
    onAgain: () => again(),
    onCheck: (create) => check(create)
  });
  canvas.replaceChildren(view.el);
  canvasNow = view;
  const alive = () => view.el.isConnected;
  const sync = syncFor(initial, (next) => view.update(next), alive);

  async function recover(err: unknown): Promise<void> {
    if (!alive()) return;
    if (!isConflict(err)) return view.flash(err);
    try {
      sync.paint(await decisionBookApi.get(sync.session().id));
    } catch (fetchErr) {
      view.flash(fetchErr);
    }
  }

  async function post(action: PsAction, payload: Record<string, unknown>): Promise<boolean> {
    try {
      await sync.confirmed(action, payload);
      return true;
    } catch (err) {
      await recover(err);
      return false;
    }
  }
  const settleIfBusy = async () => {
    if (alive() && isBusy(sync.session())) await sync.settle();
  };

  /** A click on a test that has moved on, or while the coach is thinking, is dropped, not posted. */
  async function answerTest(node: string, answer: 'yes' | 'no'): Promise<void> {
    const now = sync.session();
    const current = now.quick ? quickEntry(now.quick) : null;
    if (!current || current.node !== node || isBusy(now)) {
      view.releaseAnswer();
      return;
    }
    if (await post('quick_answer', { node, answer })) await settleIfBusy();
    else view.releaseAnswer();
  }

  async function again(): Promise<void> {
    if (!(await post('quick_again', {}))) return;
    await settleIfBusy();
    if (alive()) view.focusComposer();
  }

  /** The check card: a task due on the check date, then linked; or set aside. A failure stays on the card. */
  let checkTask: string | null = null;
  async function check(create: boolean): Promise<void> {
    const now = sync.session();
    const due = now.quick?.check?.due;
    if (!create || !due) {
      await sync.confirmed('quick_check', { dismissed: true });
      return;
    }
    const title = `Check: ${decisionOf(now.quick!) || now.title}`;
    if (!checkTask) checkTask = (await tasksApi.createTask({ ...taskBody(now, { title, due }, 'life', undefined, ORIGIN), tags: [ORIGIN.tag, 'check'] })).id;
    await sync.confirmed('quick_check', { taskId: checkTask });
    checkTask = null;
  }

  const openFull = (to: string) => {
    if (alive()) location.hash = `#/decision-maker?id=${encodeURIComponent(to)}`;
  };

  /** Go deeper. A run that already went deeper (in another tab, say) opens its full decision. */
  async function escalate(): Promise<void> {
    view.setEscalating(true);
    try {
      await sync.confirmed('escalate', {});
    } catch (err) {
      const already = sync.session().quick?.escalatedTo;
      if (already) return openFull(already);
      view.setEscalating(false);
      await recover(err);
      return;
    }
    const to = sync.session().quick?.escalatedTo;
    if (to) openFull(to);
    else view.setEscalating(false);
  }

  async function coachAction(action: PsAction): Promise<void> {
    if (action === 'escalate') return escalate();
    if (await post(action, {})) await settleIfBusy();
  }

  async function say(text: string): Promise<void> {
    try {
      sync.paint(await sync.enqueue(() => decisionBookApi.act(sync.session(), 'say', text)));
    } catch (err) {
      await recover(err);
      return;
    }
    await settleIfBusy();
  }

  view.update(initial);
  await settleIfBusy();
}

async function renderSession(canvas: HTMLElement, id: string): Promise<void> {
  let session = await decisionBookApi.get(id);
  if (session.kind === 'quick') return renderQuickSession(canvas, session);
  const page = el('div', 'ps-page ps-session ps-scope dm-scope dm-page');
  const back = el('a', 'ps-back', '← Decisions') as HTMLAnchorElement;
  back.href = '#/decision-maker';
  const title = el('h2', 'ps-session__title', session.title);
  const track = createTrack();
  const board = el('div', 'ps-session__board');
  const bench = el('div', 'ps-bench');
  const compass = createCompass();
  const canvasHost = el('div', 'ps-canvas dm-canvas');
  const tray = createSkillTray();
  const review = mountReviewPanel({ start: () => void reviews.startReview() });
  // A decision that went deeper from a quick run shows that run's chart, closed until opened.
  const fromQuick = session.escalatedFrom ? mountFromQuick(session.escalatedFrom, (runId) => decisionBookApi.get(runId)) : null;
  if (fromQuick) unsubscribeNow.push(() => fromQuick.destroy());
  bench.append(review.el, compass.el, canvasHost, ...(fromQuick ? [fromQuick.el] : []), tray.el);
  const cards = mountTaskCards({
    create: (proposal, edits) => bridge.create(session, proposal, edits),
    dismiss: (proposal) => confirmed('dismiss_task', { proposalId: proposal.id }),
    createReview: (edits) => bridge.createReview(session, edits),
    dismissReview: () => confirmed('dismiss_review', {}),
    places: (s) => placesFor(s),
    writeCaseFile: (offer, choice) => writeRecord(offer, choice),
    dismissCaseFile: (key) => confirmed('dismiss_case_file', { key })
  }, { fallbackFocus: () => coach.el.querySelector('textarea'), paper: { offer: (s) => recordOffer(s) as PsRecordOffer | null, noun: 'decision record', strictNames: false } });
  const coach = mountCoachPanel({ onSay: (text) => void act('say', text), onAction: (action) => void act(action) }, { cards: cards.el, look: DM_LOOK });
  const coachHost = el('div', 'ps-coach-host');
  coachHost.append(coach.el);
  board.append(bench, coachHost);
  const entry = reviewEntry(session, hashQuery().get('step'));
  const banner = entry && !(entry.kind === 'start' && waitingForReview(session)) ? reviewBanner(entry, () => void reviews.startReview(), stepName(session.model!.id, entry.step), 'decision') : null;
  page.append(back, title, track.el, ...(banner ? [banner] : []), board);
  canvas.replaceChildren(page);
  const diagram = mountDecisionCanvas(canvasHost, { onScore: (scores) => void rescore(scores) });
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
    compass.update(session);
    diagram.update(session);
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

  /** The linked task's domain if the decision links one, else life; one fetch per session. */
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
    return caseFilePlaces(s, labels, composeRecord(s)?.title ?? 'the decision record');
  }

  const records = createCaseFileBridge({
    createProject: (body) => tasksApi.createProject({ title: body.title, purpose: `Decision record for "${sync.session().title}"` }),
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
      paint(await decisionBookApi.act(session, action, text));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await decisionBookApi.get(session.id));
        return;
      }
      flash(err);
      return;
    }
    if (isBusy(session)) await settle();
  }

  /** A plot or scales chart the person placed or scored: its payload, with the run it belongs to. */
  async function rescore({ runId, ...scores }: DmRunScores): Promise<void> {
    try {
      paint(await decisionBookApi.score(session, { runId, ...scores }));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await decisionBookApi.get(session.id));
        return;
      }
      flash(err);
    }
  }

  render(session);
  if (isBusy(session)) await settle();
}

/** Leaving Decision Maker (or opening another decision): stop polling, drop the canvas and the Tasks listeners. */
export function unmountDecisionMakerView(): void {
  poll?.abort();
  poll = null;
  canvasNow?.destroy();
  canvasNow = null;
  for (const off of unsubscribeNow) off();
  unsubscribeNow = [];
}

export async function renderDecisionMakerView(canvas: HTMLElement): Promise<void> {
  unmountDecisionMakerView();
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const id = hashQuery().get('id');
  try {
    if (id) await renderSession(canvas, id);
    else await renderList(canvas);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderDecisionMakerView(canvas), 'Could not load Decision Maker');
  }
}

