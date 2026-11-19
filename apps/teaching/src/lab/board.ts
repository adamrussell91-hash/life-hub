import type { Lesson } from '@/schemas/lesson';
import { ApiClientError } from '@/api/client';
import { confirmBringBack, pastRounds } from '@/blocks/past-rounds';
import { button, el, errorText } from '@/quiz/dom';
import { bars, meter } from './charts';
import { explainQuestion, setEvidence, setHeadline } from './model';
import { stepStrip } from './player';
import { factsBlock, predictQuestion } from './steps-set';
import { publicLab, type LabSettings, type LabStep, type PublicLab } from './schema';
import type { LabBoard, LabTeacherApi } from './api';
import './lab.css';

export type LabBoardHandle = { root: HTMLElement; refresh(): Promise<void>; dispose(): void };
export type LabBoardOptions = {
  api: LabTeacherApi;
  getLesson: () => Lesson;
  /** Test seam. */
  pollMs?: number;
};

/** What one step puts on the board: the stage, the status line, and any buttons beside Next. */
export type LabBoardStage = { inner: HTMLElement[]; status: string; extra?: HTMLElement[] };
export type LabBoardContext = {
  lab: PublicLab;
  settings: LabSettings;
  board: LabBoard;
  api: LabTeacherApi;
  /** Board-only switches (a shown panel, an open row). Cleared when the step changes. */
  open: Record<string, unknown>;
  run(call: Promise<LabBoard>): Promise<void>;
  repaint(): void;
};
export type LabBoardView = (ctx: LabBoardContext) => LabBoardStage | null;

const BOARD_VIEWS = new Map<string, LabBoardView>();
/** Each task adds its board steps here, as `registerLabStep` does for the player. */
export function registerLabBoardStep(level: PublicLab['level'], step: LabStep, view: LabBoardView): void {
  BOARD_VIEWS.set(`${level}:${step}`, view);
}

const muted = (text: string): HTMLElement => el('p', 'lab-muted', text);
const people = (n: number): string => `${n} ${n === 1 ? 'student' : 'students'}`;

/** The supplied versions, each under its option's name. */
function versions(ctx: LabBoardContext): HTMLElement[] {
  return (ctx.board.texts ?? []).map((text, i) => {
    const piece = el('div', 'lab-piece');
    piece.append(el('small', '', ctx.lab.options?.[i] ?? ''), text);
    return piece;
  });
}

const question: LabBoardView = ({ lab, board }) => {
  const inner: HTMLElement[] = [el('h2', '', lab.question), factsBlock(lab)];
  if (lab.why) {
    const why = el('p');
    why.append(el('span', 'lab-muted', 'Why we are testing it: '), lab.why);
    inner.push(why);
  }
  return { inner, status: `${people(board.counts.here)} here` };
};

const predict: LabBoardView = (ctx) => {
  const { lab, board } = ctx;
  const revealed = board.round!.revealed && board.predictions;
  const inner = revealed
    ? [el('h2', '', 'What we predict'), bars({ labels: lab.options ?? [], values: board.predictions!, top: board.predictions!.indexOf(Math.max(...board.predictions!)) })]
    : [el('h2', '', predictQuestion(lab)), muted('Predictions stay hidden until you reveal them.'), meter(board.counts.done, board.counts.here)];
  const round = board.round!;
  const toggle = button(round.revealed ? 'Hide predictions' : 'Reveal predictions', 'secondary', () => void ctx.run(ctx.api.reveal(round.session, !round.revealed)));
  toggle.dataset.act = 'reveal';
  return { inner, status: `${board.counts.done} of ${board.counts.here} locked in`, extra: [toggle] };
};

const test: LabBoardView = ({ lab, board }) => ({
  inner: [
    el('h2', '', lab.judge === 'pick' ? 'Readers are choosing' : 'Readers are rating'),
    el('p', '', lab.judge_question),
    muted(lab.judge === 'pick' ? 'Each reader gets every version in a shuffled order, with the names hidden.' : 'The class is split so each version has the same number of readers. Nobody knows which one they have.'),
    meter(board.counts.done, board.counts.here)
  ],
  status: `${board.counts.done} of ${board.counts.here} ${lab.judge === 'pick' ? 'choices' : 'ratings'} in`
});

const result: LabBoardView = (ctx) => {
  const { lab, board } = ctx;
  const r = board.results;
  if (!r) return null;
  const labels = lab.options ?? [];
  const inner: HTMLElement[] = [
    el('h2', '', setHeadline({ options: labels, judge: lab.judge, result: r })),
    bars({ labels, values: r.values, top: r.win ? r.top : -1, scaleMax: lab.judge === 'rate' ? 10 : 0 }),
    muted(r.win ? `Ahead by ${r.lead}. That counts as a win.` : `Ahead by ${r.lead}. A win needs ${lab.threshold} or more.`)
  ];
  if (ctx.open.versions) inner.push(...versions(ctx));
  const show = button(ctx.open.versions ? 'Hide the versions' : labels.length === 2 ? 'Show both versions' : 'Show the versions', 'secondary', () => {
    ctx.open.versions = !ctx.open.versions;
    ctx.repaint();
  });
  show.dataset.act = 'versions';
  const readers = `${r.readers} ${r.readers === 1 ? 'reader' : 'readers'}`;
  return {
    inner,
    status: lab.judge === 'pick' ? `${r.values.reduce((a, b) => a + b, 0)} choices from ${readers}` : `Average out of 10, from ${readers}`,
    extra: board.texts ? [show] : []
  };
};

const explain: LabBoardView = (ctx) => {
  const { lab, board } = ctx;
  const inner: HTMLElement[] = [el('h2', '', explainQuestion({ level: lab.level, judge: lab.judge, options: lab.options, prompt: lab.explain_prompt, result: board.results }))];
  if (board.results) inner.push(muted(setEvidence({ options: lab.options ?? [], judge: lab.judge, result: board.results })));
  inner.push(...versions(ctx));
  if (board.debrief) inner.push(muted(`Your notes: ${board.debrief}`));
  return { inner, status: `${board.explained ?? 0} of ${board.counts.here} handed in` };
};

for (const level of ['supplied', 'students'] as const) {
  registerLabBoardStep(level, 'Question', question);
  registerLabBoardStep(level, 'Predict', predict);
  registerLabBoardStep(level, 'Result', result);
  registerLabBoardStep(level, 'Explain', explain);
}
registerLabBoardStep('supplied', 'Test', test);

/**
 * The teacher's board for a published lab: the step strip, the stage for the
 * step the class is on, and the controls that move everyone on. It asks the
 * server for counts every few seconds while it is on screen.
 */
export function mountLabBoard(o: LabBoardOptions): LabBoardHandle {
  const root = el('section', 'lab-board');
  root.setAttribute('aria-label', 'Lab board');
  const pollMs = o.pollMs ?? 4000;
  const error = el('p', 'lab-err');
  error.setAttribute('role', 'alert');
  let board: LabBoard | null = null;
  let painted = '\u0000';
  let open: Record<string, unknown> = {};
  let openFor = '';
  let disposed = false;
  let busy = false;
  let timer = 0;

  async function run(call: Promise<LabBoard>): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      board = await call;
      error.textContent = '';
    } catch (e) {
      error.textContent = errorText(e, 'That didn’t work. Try again.');
      // Another tab moved the lab on: show where it is now.
      if (e instanceof ApiClientError && (e.code === 'new_session' || e.code === 'no_round' || e.code === 'bad_step')) {
        try { board = await o.api.board(); } catch { /* the next poll tries again */ }
      }
    }
    busy = false;
    if (!disposed) paint(true);
  }

  const rounds = (): HTMLElement =>
    pastRounds(o.api.endpoint, (session) => (confirmBringBack(!!board?.round) ? run(o.api.resume(session)) : undefined));

  function idle(): void {
    const card = el('div', 'lab-card');
    const start = button('Start the lab', 'primary', () => void run(o.api.start()));
    start.dataset.act = 'start';
    const row = el('div', 'lab-board__start');
    row.append(start);
    card.append(el('h2', '', 'Run this lab'), muted('Students open the lesson and type their initials. You move the class from step to step here.'), row, rounds());
    root.replaceChildren(card, error);
  }

  function finished(lab: PublicLab, b: LabBoard): void {
    // Task 6 builds the After class page here: predictions held, the explanations to mark, the markbook column.
    const card = el('div', 'lab-card');
    card.append(el('h2', '', 'What the lab found'));
    if (b.results && lab.level !== 'pairs') {
      card.append(
        el('p', '', `${setHeadline({ options: lab.options ?? [], judge: lab.judge, result: b.results })} ${setEvidence({ options: lab.options ?? [], judge: lab.judge, result: b.results })}`),
        muted(`${b.explained ?? 0} of ${b.counts.here} explanations handed in.`)
      );
    }
    if (b.debrief) card.append(muted(`Your notes: ${b.debrief}`));
    const again = button('Run it again', 'secondary', () => void run(o.api.start()));
    again.dataset.act = 'again';
    const row = el('div', 'lab-board__start');
    row.append(again);
    card.append(row, rounds());
    root.replaceChildren(stepStrip(b.round!), card, error);
  }

  function paint(force = false): void {
    if (disposed) return;
    const key = JSON.stringify(board);
    if (!force && key === painted) return;
    painted = key;
    const settings = o.getLesson().lab;
    if (!board || !settings) return void root.replaceChildren(muted(board ? 'Fill in the Lab card to run this lab.' : 'Loading the board…'), error);
    const round = board.round;
    if (!round) return idle();
    const lab = publicLab(settings);
    if (round.finished) return finished(lab, board);
    const at = `${round.session}:${round.step}`;
    if (at !== openFor) {
      openFor = at;
      open = {};
    }
    const step = round.steps[round.step]!;
    const stage = BOARD_VIEWS.get(`${board.level}:${step}`)?.({ lab, settings, board, api: o.api, open, run, repaint: () => paint(true) })
      ?? { inner: [el('h2', '', step), muted('This step is not built yet. Next moves the class on.')], status: `${people(board.counts.here)} here` };
    const nextName = round.steps[round.step + 1];
    const next = button(nextName ? `Next: ${nextName}` : 'Finish the lab', 'primary', () => void run(o.api.next(round.session, round.step + 1)));
    next.dataset.act = 'next';
    const card = el('section', 'lab-card lab-card--stage');
    const inner = el('div', 'lab-board__inner');
    inner.append(...stage.inner);
    const ctrl = el('div', 'lab-ctrl');
    const buttons = el('div');
    buttons.append(...(stage.extra ?? []), next);
    const status = el('span', '', stage.status);
    status.setAttribute('role', 'status');
    ctrl.append(status, buttons);
    card.append(inner, ctrl);
    const end = button('End the round', 'ghost', () => {
      if (confirm('End this round? Students go back to waiting. Their work is kept in Past rounds.')) void run(o.api.end(round.session));
    });
    end.dataset.act = 'end';
    const foot = el('div', 'lab-board__start');
    foot.append(end, rounds());
    root.replaceChildren(stepStrip(round), card, error, foot);
  }

  async function refresh(): Promise<void> {
    if (disposed || busy) return;
    try {
      board = await o.api.board();
      error.textContent = '';
    } catch (e) {
      if (!board) error.textContent = errorText(e, 'The board didn’t load.');
    }
    if (!disposed) paint();
  }

  const schedule = (): void => {
    window.clearTimeout(timer);
    if (disposed) return;
    timer = window.setTimeout(async () => {
      if (!document.hidden && root.isConnected) await refresh();
      schedule();
    }, pollMs);
  };
  const onVisible = (): void => {
    if (!document.hidden && !disposed) void refresh();
  };
  document.addEventListener('visibilitychange', onVisible);

  paint(true);
  schedule();
  return {
    root,
    refresh,
    dispose() {
      disposed = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}
