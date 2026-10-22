import { apiGet, apiPost } from '@/api/client';
import { LETTERS, percent } from '@/blocks/hinge-question/shared';
import type { HingeStateDetail, TeacherState } from '@/blocks/hinge-question/teacher';
import { pollTextToolJob } from '@/blocks/text-tools-client';

/**
 * The focus view checkpoint. When a hinge question on the current step is
 * revealed under the teacher's move-on mark, the next arrow stops here
 * instead of moving on:
 *
 * - the score and the most common wrong answer;
 * - a talking point for the teacher to voice that misconception to the whole
 *   class, never naming anyone (answers on the board stay anonymous);
 * - a back-up question for the re-check: the teacher's own if the block has
 *   one, otherwise Ann starts drafting a parallel question the moment the
 *   reveal comes in under the mark, so it is ready by the time the re-teach
 *   is done. The teacher previews it before it goes on the board, and Ann's
 *   question is saved onto the block for next time;
 * - Move on, the teacher's deliberate call.
 */

type Live = Extract<TeacherState, { phase: 'live' }>;
type Entry = HingeStateDetail & { root: HTMLElement };
export type BackupDraft = { prompt: string; options: Array<{ text: string; misconception: string; right: boolean }> };
type Drafting = { status: 'working' } | { status: 'ready'; draft: BackupDraft } | { status: 'error'; error: string };

export interface CheckpointOptions {
  surface: HTMLElement;
  stage: HTMLElement;
  onMoveOn: () => void;
}

export interface CheckpointHandle {
  /** The step now on the board. */
  watch(step: HTMLElement | null): void;
  /** A hinge question on this step came in under the mark and the teacher hasn't moved on from it. */
  shouldStop(): boolean;
  open(): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const btn = el('button', className, label);
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

const letter = (s: Live, id: string) => LETTERS[s.options.findIndex((o) => o.id === id)] ?? '?';

export function rightPercent(s: Live): number {
  return percent(s.picks[s.correct_id] ?? 0, s.answered);
}

/** Revealed, answered and under the move-on mark. */
export function underTheMark(state: TeacherState): state is Live {
  return state.phase === 'live' && state.revealed && state.answered > 0 && rightPercent(state) < state.move_on;
}

/** The wrong answer most of the class went for, if anyone picked one. */
export function topWrongAnswer(s: Live): Live['options'][number] | null {
  const wrong = s.options
    .filter((o) => o.id !== s.correct_id && (s.picks[o.id] ?? 0) > 0)
    .sort((a, b) => (s.picks[b.id] ?? 0) - (s.picks[a.id] ?? 0));
  return wrong[0] ?? null;
}

function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text[0]!.toLowerCase() + text.slice(1) : text;
}

/** What the teacher can say to the whole class. Built from their own misconception note. */
export function talkingPoint(s: Live): string {
  const wrong = topWrongAnswer(s);
  const right = letter(s, s.correct_id);
  if (!wrong) return `Ask the class what makes ${right} the best answer, then take them through it again.`;
  const note = wrong.misconception.trim().replace(/[.!]+$/, '');
  const why = note ? ` It’s easy to think ${lowerFirst(note)}.` : '';
  return `“A few of you went for ${letter(s, wrong.id)}, and I can see why.${why} Let’s look at why ${right} fits better.”`;
}

export function mountCheckpoint(options: CheckpointOptions): CheckpointHandle {
  const { surface, stage, onMoveOn } = options;
  const hinges = new Map<string, Entry>();
  const drafts = new Map<string, Drafting>();
  const cleared = new Set<string>();
  let step: HTMLElement | null = null;
  let openFor: string | null = null;
  let view: 'actions' | 'preview' = 'actions';
  let talkShown = false;
  let error = '';
  let working = false;
  let painted = '';

  const panel = el('section', 'fv-checkpoint');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Checkpoint');
  panel.hidden = true;
  surface.append(panel);

  const focusOn = () => surface.classList.contains('is-focus');
  const live = (entry: Entry): entry is Entry & { state: Live } => entry.state.phase === 'live';

  /** The hinge on the current step that should stop the class, if any. */
  function target(): (Entry & { state: Live }) | null {
    if (!step) return null;
    for (const entry of hinges.values()) {
      if (!entry.root.isConnected || !step.contains(entry.root) || !live(entry)) continue;
      if (underTheMark(entry.state) && !cleared.has(entry.state.session)) return entry;
    }
    return null;
  }

  function cue(): void {
    surface.classList.toggle('fv-has-checkpoint', focusOn() && !!target());
  }

  function startDraft(entry: Entry & { state: Live }): void {
    const session = entry.state.session;
    drafts.set(session, { status: 'working' });
    paint();
    pollTextToolJob(
      () => apiPost(entry.endpoint, { action: 'draft_backup' }),
      (key) => apiGet(`/api/text-tools/${encodeURIComponent(key)}`),
      { intervalMs: 2000, timeoutMs: 120_000 }
    )
      .then((result) => drafts.set(session, { status: 'ready', draft: result as BackupDraft }))
      .catch((e: unknown) => drafts.set(session, { status: 'error', error: e instanceof Error ? e.message : 'Ann couldn’t draft one.' }))
      .finally(() => paint());
  }

  function onState(event: Event): void {
    const detail = (event as CustomEvent<HingeStateDetail>).detail;
    if (!detail || !(event.target instanceof HTMLElement)) return;
    const entry: Entry = { ...detail, root: event.target };
    hinges.set(detail.blockId, entry);
    const s = detail.state;
    // Under the mark with no back-up ready: Ann starts now, while the teacher re-teaches.
    if (focusOn() && live(entry) && underTheMark(s) && s.round !== 'backup' && !s.backup && !drafts.has(s.session)) {
      startDraft(entry as Entry & { state: Live });
    }
    if (openFor === detail.blockId) paint();
    cue();
  }
  stage.addEventListener('hinge-state', onState);

  function close(): void {
    painted = '';
    panel.hidden = true;
    openFor = null;
    surface.classList.remove('fv-checkpoint-open');
  }

  function moveOn(): void {
    const entry = openFor ? hinges.get(openFor) : null;
    if (entry && live(entry)) cleared.add(entry.state.session);
    close();
    cue();
    onMoveOn();
  }

  async function showBackup(entry: Entry & { state: Live }): Promise<void> {
    const s = entry.state;
    const drafting = drafts.get(s.session);
    working = true;
    error = '';
    paint();
    try {
      if (!s.backup && drafting?.status === 'ready') {
        // Ann's question becomes the block's back-up, so the next class already has it.
        await entry.send('save_backup', { backup: drafting.draft, source: 'ann' });
      }
      await entry.send('ask', { round: 'backup' });
      cleared.add(s.session);
      close();
      cue();
    } catch (e) {
      error = e instanceof Error ? e.message : 'That didn’t work. Try again.';
    } finally {
      working = false;
      if (!panel.hidden) paint();
    }
  }

  function preview(entry: Entry & { state: Live }): HTMLElement {
    const s = entry.state;
    const drafting = drafts.get(s.session);
    const box = el('div', 'fv-checkpoint__preview');
    let prompt = '';
    let rows: Array<{ text: string; right: boolean }> = [];
    let source = '';
    if (s.backup) {
      prompt = s.backup.prompt;
      rows = s.backup.options.map((o) => ({ text: o.text, right: o.id === s.backup!.correct_id }));
      source = s.backup.source === 'ann' ? 'Back-up question · drafted by Ann, saved on this block' : 'Your back-up question';
    } else if (drafting?.status === 'ready') {
      prompt = drafting.draft.prompt;
      rows = drafting.draft.options.map((o) => ({ text: o.text, right: o.right }));
      source = 'Back-up question · drafted by Ann just now';
    }
    const list = el('ol', 'fv-checkpoint__options');
    rows.forEach((row) => {
      const li = el('li', row.right ? 'is-right' : '', row.text);
      if (row.right) li.append(el('span', 'fv-checkpoint__right', 'Right'));
      list.append(li);
    });
    box.append(
      el('p', 'fv-checkpoint__label', source),
      el('p', 'fv-checkpoint__question', prompt),
      list,
      el('p', 'fv-checkpoint__hint', 'Check it reads well. Pause the projector first if you’d rather the class didn’t see this yet.')
    );
    return box;
  }

  function paint(): void {
    if (panel.hidden || !openFor) return;
    const entry = hinges.get(openFor);
    if (!entry || !live(entry)) return close();
    const s = entry.state;
    // Polls repeat the same state every few seconds; redrawing would swap buttons out from under a click.
    const sig = JSON.stringify([s.session, s.round, s.answered, s.picks, s.backup, drafts.get(s.session), view, talkShown, error, working]);
    if (sig === painted && panel.childElementCount) return;
    painted = sig;
    const pct = rightPercent(s);
    const right = s.picks[s.correct_id] ?? 0;
    const wrong = topWrongAnswer(s);

    const head = el('div', 'fv-checkpoint__head');
    const text = el('div', 'fv-checkpoint__text');
    text.append(
      el('p', 'fv-checkpoint__title', s.round === 'backup' ? 'Checkpoint: still not everyone’s there.' : 'Checkpoint: not everyone’s there yet.'),
      el(
        'p',
        'fv-checkpoint__sub',
        `${right} of ${s.answered} chose ${letter(s, s.correct_id)}, under your ${s.move_on}% mark.` +
          (wrong ? ` Most common wrong answer: ${letter(s, wrong.id)}, “${wrong.text}” (${s.picks[wrong.id]}).` : '')
      )
    );
    head.append(el('p', 'fv-checkpoint__score', `${pct}%`), text);

    const parts: HTMLElement[] = [head];
    if (view === 'preview') {
      parts.push(preview(entry));
    } else if (talkShown) {
      const talk = el('div', 'fv-checkpoint__talk');
      talk.append(el('p', 'fv-checkpoint__label', 'Talking point · no names'), el('p', '', talkingPoint(s)));
      parts.push(talk);
    }
    if (error) {
      const alert = el('p', 'fv-checkpoint__error', error);
      alert.setAttribute('role', 'alert');
      parts.push(alert);
    }

    const actions = el('div', 'fv-checkpoint__actions');
    if (view === 'preview') {
      const back = button('Back', 'btn btn--ghost', () => {
        view = 'actions';
        paint();
      });
      const show = button(working ? 'Putting it up…' : 'Show on the board', 'btn btn--primary', () => void showBackup(entry));
      show.disabled = working;
      actions.append(back, show);
    } else {
      actions.append(
        button(wrong ? `Explain why ${letter(s, wrong.id)} is tempting` : 'Talking point', 'btn btn--ghost', () => {
          talkShown = !talkShown;
          paint();
        })
      );
      if (s.round !== 'backup') actions.append(backupButton(entry));
      actions.append(button('Move on', 'btn btn--primary', moveOn));
    }
    parts.push(actions);
    panel.replaceChildren(...parts);
  }

  function backupButton(entry: Entry & { state: Live }): HTMLButtonElement {
    const s = entry.state;
    const toPreview = () => {
      view = 'preview';
      error = '';
      paint();
    };
    if (s.backup) return button('Preview the back-up question', 'btn btn--secondary', toPreview);
    const drafting = drafts.get(s.session);
    if (drafting?.status === 'ready') return button('Preview Ann’s back-up question', 'btn btn--secondary is-ready', toPreview);
    if (drafting?.status === 'working') {
      const wait = button('Ann is drafting a back-up…', 'btn btn--secondary is-working', () => undefined);
      wait.disabled = true;
      return wait;
    }
    const again = button(drafting?.status === 'error' ? 'Ann couldn’t draft one. Try again' : 'Ask Ann for a back-up', 'btn btn--secondary', () =>
      startDraft(entry)
    );
    if (drafting?.status === 'error') again.title = drafting.error;
    return again;
  }

  return {
    watch(next) {
      step = next;
      close();
      cue();
    },
    shouldStop: () => focusOn() && !!target(),
    open() {
      const entry = target();
      if (!entry) return;
      openFor = entry.blockId;
      view = 'actions';
      talkShown = false;
      error = '';
      panel.hidden = false;
      surface.classList.add('fv-checkpoint-open');
      paint();
      panel.querySelector<HTMLButtonElement>('.btn--primary')?.focus({ preventScroll: true });
    },
    close,
    isOpen: () => !panel.hidden,
    dispose() {
      stage.removeEventListener('hinge-state', onState);
      panel.remove();
    }
  };
}
