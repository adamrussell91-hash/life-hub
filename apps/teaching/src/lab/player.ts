import type { PublishedLesson } from '@/schemas/published-lesson';
import { ApiClientError } from '@/api/client';
import { el, errorText } from '@/quiz/dom';
import type { LabLevel, LabStep, PublicLab } from './schema';
import type { LabClient, LabMe, LabRound, LabStatus } from './api';
import { factsStrip, type LabNotesContext } from './notes';
import { registerSetSteps } from './steps-set';
import { registerPairsSteps } from './steps-pairs';
import './lab.css';

export type LabPlayerOptions = {
  lesson: PublishedLesson;
  classId?: string;
  /** Null when opened without a class: the student is asked to open it from their class page. */
  client: LabClient | null;
  renderHero: (host: HTMLElement) => void;
  /** The lesson's work sync: the Explain answer is handed in through it, like any written question. */
  handIn?: () => Promise<boolean>;
  /** Test seam. */
  pollMs?: number;
};

/** What a step's screen is drawn from. */
export type LabStepContext = {
  lesson: PublishedLesson;
  lab: PublicLab;
  classId?: string;
  round: LabRound;
  me: LabMe;
  status: LabStatus;
  client: LabClient;
  /** Runs one action, shows its error under the card, and redraws from the new status. */
  act(run: () => Promise<LabStatus>): Promise<void>;
  /** What the student has chosen or typed on this step but not yet sent. Survives a redraw; cleared when the step changes. */
  draft: Record<string, unknown>;
  notes: LabNotesContext;
  /** Sends the written work and hands in what the class's markbook marks. */
  handIn(): Promise<boolean>;
  /** Draws the screen again without asking the server. */
  repaint(): void;
};
/** A step's screen: the nodes that go in the card. Null hands over to "This step is not built yet". */
export type LabStepView = (ctx: LabStepContext) => HTMLElement[] | null;

const VIEWS = new Map<string, LabStepView>();
/** Each task adds its steps here: `registerLabStep('pairs', 'Design', view)`. A later registration replaces an earlier one. */
export function registerLabStep(level: LabLevel, step: LabStep, view: LabStepView): void {
  VIEWS.set(`${level}:${step}`, view);
}
export const labStepView = (level: LabLevel, step: LabStep): LabStepView | undefined => VIEWS.get(`${level}:${step}`);
registerSetSteps(registerLabStep);
registerPairsSteps(registerLabStep);

export const WAITING = 'Waiting for your teacher.';
export const waiting = (): HTMLElement => el('p', 'lab__note', WAITING);

/** Where the lab is up to: "Predict · 2 of 5" over a row of dots. */
export function stepStrip(round: Pick<LabRound, 'step' | 'steps' | 'finished'>): HTMLElement {
  const strip = el('div', 'lab-strip');
  const line = el('p');
  if (round.finished) line.append(el('b', '', 'Lab finished'));
  else line.append(el('b', '', round.steps[round.step] ?? ''), ` · ${round.step + 1} of ${round.steps.length}`);
  const dots = el('div', 'lab-dots');
  dots.setAttribute('aria-hidden', 'true');
  round.steps.forEach((_, i) => dots.append(el('i', i < round.step ? 'is-seen' : i === round.step ? 'is-here' : '')));
  strip.append(line, dots);
  return strip;
}

/** What decides a redraw: the screen changes only when one of these does, so a poll never wipes what a student is typing. */
function viewKey(status: LabStatus | null): string {
  if (!status) return '';
  return JSON.stringify([
    status.identity, status.anonymous, status.not_for_you, status.round && [status.round.session, status.round.step, status.round.finished],
    status.me && [status.me.pred, status.me.done, status.me.read, status.me.own, status.me.notes], status.reading && [status.reading.index, status.reading.total], status.results,
    // A partner's save changes the pair's bench on this device too.
    status.pair, status.control, status.findings
  ]);
}

/**
 * The student's lab: one job per screen, paced by the teacher from the board.
 * The device asks for the round every few seconds and shows the step it is on.
 */
export function mountLabPlayer(host: HTMLElement, options: LabPlayerOptions): { dispose(): void; refresh(): Promise<void> } {
  const { lesson, client } = options;
  const lab = lesson.lab;
  const pollMs = options.pollMs ?? 5000;
  let status: LabStatus | null = null;
  let unreachable = false;
  let disposed = false;
  let timer = 0;
  let painted = '\u0000';
  let draft: Record<string, unknown> = {};
  let draftFor = '';
  let problem = '';

  const shell = el('div', 'lab');
  const hero = el('div', 'lab__hero');
  options.renderHero(hero);
  const root = el('div', 'lab__body');
  shell.append(hero, root);
  host.replaceChildren(shell);

  const card = (...nodes: Array<HTMLElement | null>): HTMLElement => {
    const box = el('section', 'lab-card');
    box.append(...nodes.filter((n): n is HTMLElement => n !== null));
    return box;
  };
  const errorLine = (): HTMLElement => {
    const err = el('p', 'lab-err', problem);
    err.setAttribute('role', 'alert');
    return err;
  };

  async function act(run: () => Promise<LabStatus>): Promise<void> {
    problem = '';
    try {
      status = await run();
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : '';
      // The class moved on, or the lab was started again: catch up rather than complain.
      if (code === 'wrong_step' || code === 'new_session' || code === 'no_round') return void (await refresh(true));
      problem = errorText(error);
    }
    if (!disposed) paint(true);
  }

  function claimForm(c: LabClient): HTMLElement {
    const form = el('form', 'lab-claim');
    const input = el('input', 'qz-input');
    input.maxLength = 5;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Your initials');
    const go = el('button', 'btn btn--secondary', 'That’s me');
    go.type = 'submit';
    const err = el('p', 'lab-err');
    err.setAttribute('role', 'alert');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const next = await c.claim(input.value.trim());
        if (disposed) return;
        if (next.identity.need === 'initials') err.textContent = 'Those initials aren’t on your class list. Check them and try again.';
        else {
          status = next;
          paint(true);
        }
      } catch (error) {
        err.textContent = errorText(error, 'That didn’t work. Try again.');
      }
    });
    form.append(el('p', '', 'Type your initials to join the lab.'), input, go, err);
    return form;
  }

  function paint(force = false): void {
    if (disposed) return;
    const key = `${unreachable}|${viewKey(status)}`;
    if (!force && key === painted) return;
    painted = key;
    const note = (text: string) => root.replaceChildren(el('p', 'lab__note', text));
    if (!lab) return note('This lab isn’t ready yet. Ask your teacher.');
    if (!client) return note('Open this lab from your class page.');
    if (!status) return note(unreachable ? 'Couldn’t reach your teacher’s board. Trying again…' : 'Loading…');
    if (status.identity.need === 'initials') return root.replaceChildren(claimForm(client));
    if (status.anonymous) return note('Your teacher hasn’t added a class list yet.');
    if (status.not_for_you) return note('This lab is for another class.');
    const { round, me } = status;
    if (!round || !me) {
      return root.replaceChildren(card(el('h2', '', lab.question), el('p', 'lab__note', 'Your teacher will start the lab soon. This page will open it for you.')));
    }
    if (round.finished) {
      return root.replaceChildren(stepStrip(round), card(el('h2', '', 'Lab finished'), el('p', 'lab__note', lab.notes_on ? 'Your prediction, your lab notes and your explanation are with your teacher.' : 'Your prediction and your explanation are with your teacher.')));
    }
    const step = round.steps[round.step]!;
    const at = `${round.session}:${round.step}`;
    if (at !== draftFor) {
      draftFor = at;
      draft = {};
      problem = '';
      window.scrollTo?.({ top: 0 });
    }
    const ctx: LabStepContext = {
      lesson, lab, classId: options.classId, round, me, status, client, act, draft,
      notes: { lab, me, draft, save: (s, text) => act(() => client.note(s, text)) },
      handIn: async () => (options.handIn ? options.handIn() : true),
      repaint: () => paint(true)
    };
    const nodes = labStepView(lab.level, step)?.(ctx) ?? [el('h2', '', step), el('p', 'lab__note', 'This step is not built yet.'), waiting()];
    const facts = factsStrip(lab, status);
    root.replaceChildren(stepStrip(round), ...(facts ? [facts] : []), card(...nodes, problem ? errorLine() : null));
  }

  async function refresh(force = false): Promise<void> {
    if (!client || disposed || !lab) return;
    try {
      status = await client.status();
      unreachable = false;
    } catch {
      // Once there is a status, one dropped check is not worth a screen.
      if (!status) unreachable = true;
    }
    if (!disposed) paint(force);
  }

  const schedule = (): void => {
    window.clearTimeout(timer);
    if (disposed) return;
    timer = window.setTimeout(async () => {
      if (!document.hidden) await refresh();
      schedule();
    }, pollMs);
  };
  const onVisible = (): void => {
    if (!document.hidden && !disposed) void refresh();
  };
  document.addEventListener('visibilitychange', onVisible);

  paint();
  void refresh().finally(schedule);
  return {
    refresh: () => refresh(),
    dispose() {
      disposed = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}
