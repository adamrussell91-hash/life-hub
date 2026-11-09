import type { Block } from '@/schemas/block';
import { button, el, errorText, readJSON, writeJSON } from '@/blocks/peer-feedback-ui';
import { clock, durationLabel, livePoint, paceSlots, pointProgress, type PacedPoint } from '@/blocks/voice-pacing';
import { keepTake, takeStore, type VoiceTake } from '@/blocks/voice-takes';
import { audioUrl, cleanInitials, fetchMine, rememberInitials, startTimed, submitTake, voiceDevice, type MineState } from '@/blocks/voice-client';
import { DEFAULT_VIVA_SECONDS, STUDENT_TIME_CHOICES } from '@/blocks/voice-block-editor';
import { renderVoiceFeedback } from '@/blocks/voice-feedback-view';
import { SIDE_LABELS } from '@/blocks/voice-oracy';
import { speakingWhere } from '@/blocks/voice-where';
import { goalTick, vivaDoThis, vivaStep, voiceStartLoader, type VivaHistory } from '@/blocks/voice-last-time';
import type { SkillRow } from '@/progress/types';
import { mountRecitePractice, reciteTextFold, type ReciteProgress } from '@/blocks/voice-recite';
import { drawFollowUps, followUpPoint, followUpsOf, isFollowUpPoint, phaseAt, pressureOf, PRESSURE_SPEAKING_DEFAULT, type Pressure } from '@/blocks/voice-timed';

/**
 * The student side of a Voice block: prep dot points (viva), a 3-2-1
 * countdown, a recording that walks through the points on a timer, practice
 * takes kept on the device, and sending the one best take.
 *
 * Time pressure swaps practice for one locked run (see voice-timed.ts), and
 * follow-ups add questions after the main answer on either path.
 */

/** The question card in the block's header, kept hidden until a timed run begins. */
export type QuestionSlot = { reveal: () => void };

type VoiceBlock = Extract<Block, { block_type: 'audio' }>;
type Side = NonNullable<VoiceBlock['content']['side']>;
type Plan = { points: string[]; seconds?: number; side?: Side; recite?: ReciteProgress; goal?: boolean };

type Mic = { stream: MediaStream; mime: string };

const COUNTDOWN = [3, 2, 1];

function followUpFact(count: number): string {
  return count === 1 ? 'then a follow-up question' : `then ${count} follow-up questions`;
}
const WARN_BEFORE_S = 10;
const BITRATE = 32_000;
/** The server keeps takes of up to five minutes, so a Recite with no limit stops there. */
const RECITE_MAX_SECONDS = 300;

function pickMime(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime));
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Seconds this student will speak for. */
export function speakingSeconds(block: VoiceBlock, plan: Plan): number | null {
  const c = block.content;
  if (pressureOf(block)) return c.time_limit_s ?? PRESSURE_SPEAKING_DEFAULT;
  if (c.student_chooses_time) return STUDENT_TIME_CHOICES.includes(plan.seconds ?? 0) ? plan.seconds! : STUDENT_TIME_CHOICES[1]!;
  if (c.time_limit_s) return c.time_limit_s;
  if (c.oracy === 'recite') return RECITE_MAX_SECONDS;
  return c.mode === 'viva' ? DEFAULT_VIVA_SECONDS : null;
}

export function mountVoiceStudent(block: VoiceBlock, lessonId: string, classId?: string, question?: QuestionSlot): HTMLElement {
  const isViva = block.content.mode === 'viva';
  const oracy = block.content.oracy;
  const pressure = pressureOf(block);
  const followUps = followUpsOf(block);
  const scope = `${lessonId}:${block.id}`;
  const planKey = `voice:${scope}:plan`;
  const scaffold = block.content.scaffold ?? [];
  const root = el('div', 'voice-run');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const body = el('div', 'voice-body');
  root.append(body, alert);

  let plan: Plan = readJSON<Plan>(planKey) ?? { points: scaffold.length ? scaffold.map(() => '') : isViva ? ['', '', ''] : [] };
  if (isViva && plan.points.length === 0) plan.points = [''];
  let takes: VoiceTake[] = [];
  let mine: MineState | null = null;
  /** When `mine` arrived, so a begun run's server count keeps ticking. */
  let mineAt = 0;
  /** Timed takes this device couldn't keep (private browsing), sent from memory. */
  const memoryTakes = new Map<string, Blob>();
  let stopCurrent: (() => void) | null = null;
  // A speaking task shows where the student sits on Speaking before they record. Codes off for speaking, no box.
  const speakingTask = (block.content.code_groups ?? ['speaking']).includes('speaking');
  let speakingRows: SkillRow[] = [];
  // A viva: the student's last returned viva and the codes that keep coming back.
  let vivas: VivaHistory | null = null;
  // Only a step to work on goes in the tick: "keep doing this" is a reminder.
  const goalLine = () => {
    const step = vivaStep(vivas);
    return step?.why?.kind === 'do' ? step.line : null;
  };

  const showError = (text: string) => {
    alert.textContent = text;
    alert.hidden = false;
  };
  const clearError = () => {
    alert.hidden = true;
  };
  const savePlan = () => writeJSON(planKey, plan);

  const weights = () => plan.points.map((_, i) => scaffold[i]?.weight ?? 1);
  const side = (): Side | undefined => block.content.side ?? plan.side;

  function sideRow(): HTMLElement {
    const wrap = el('div', 'pf-field');
    if (block.content.side) {
      wrap.append(el('span', 'voice-take__chip voice-side', `You are ${SIDE_LABELS[block.content.side].toLowerCase()}`));
      return wrap;
    }
    wrap.append(el('span', 'pf-field__label', 'Your side'));
    const group = el('div', 'pa-mode');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Your side');
    for (const option of Object.keys(SIDE_LABELS) as Side[]) {
      const b = button(SIDE_LABELS[option], 'ghost', () => {
        plan.side = option;
        savePlan();
        clearError();
        paint();
      });
      b.className = 'pa-mode__option';
      b.setAttribute('aria-pressed', String(plan.side === option));
      group.append(b);
    }
    wrap.append(group);
    return wrap;
  }

  function stemChips(): HTMLElement | null {
    const stems = block.content.stems ?? [];
    if (!stems.length || (oracy !== 'speech' && oracy !== 'debate')) return null;
    const wrap = el('div', 'pf-field');
    wrap.append(el('span', 'pf-field__label', oracy === 'debate' ? 'Phrases to try' : 'Techniques to try'));
    const list = el('ul', 'voice-stems');
    for (const stem of stems) list.append(el('li', 'voice-take__chip', stem));
    wrap.append(list);
    return wrap;
  }

  /* ── Practice: plan + takes ───────────────────────────────────────── */

  function planEditor(): HTMLElement {
    const box = el('section', 'voice-plan');
    // Repaints itself, so adding a point never restarts a timed prep screen.
    const draw = (focusLast = false) => {
      box.replaceChildren(el('h4', 'voice-plan__title', 'Your dot points'));
      box.append(el('p', 'pf-field__hint block-secondary', oracy === 'presentation' ? 'One point per slide. Present from your own slides.' : 'Short prompts, not a script. The timer moves you through them while you speak.'));
      const list = el('ol', 'voice-plan__points');
      plan.points.forEach((text, i) => {
        const item = el('li', 'voice-plan__point');
        const input = el('input', 'pa-input');
        input.type = 'text';
        input.maxLength = 120;
        input.value = text;
        input.placeholder = scaffold[i]?.label || `Point ${i + 1}`;
        input.setAttribute('aria-label', scaffold[i]?.label || `Point ${i + 1}`);
        input.addEventListener('input', () => {
          plan.points[i] = input.value;
          savePlan();
        });
        item.append(input);
        if (!scaffold[i] && plan.points.length > 1) {
          item.append(
            button('Remove', 'ghost', () => {
              plan.points.splice(i, 1);
              savePlan();
              draw();
            })
          );
        }
        list.append(item);
      });
      box.append(list);
      if (plan.points.length < 8) {
        box.append(
          button('Add a point', 'secondary', () => {
            plan.points.push('');
            savePlan();
            draw(true);
          })
        );
      }
      if (focusLast) box.querySelector<HTMLInputElement>('.voice-plan__point:last-child input')?.focus();
    };
    draw();
    return box;
  }

  function timeChooser(): HTMLElement | null {
    if (!block.content.student_chooses_time) return null;
    const wrap = el('div', 'pf-field');
    wrap.append(el('span', 'pf-field__label', 'How long will you speak?'));
    const group = el('div', 'pa-mode');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'How long will you speak?');
    const current = speakingSeconds(block, plan);
    for (const s of STUDENT_TIME_CHOICES) {
      const b = button(durationLabel(s), 'ghost', () => {
        plan.seconds = s;
        savePlan();
        paint();
      });
      b.className = 'pa-mode__option';
      b.setAttribute('aria-pressed', String(current === s));
      group.append(b);
    }
    wrap.append(group);
    return wrap;
  }

  function takeRow(take: VoiceTake, index: number): HTMLElement {
    const row = el('li', 'voice-take');
    const head = el('div', 'voice-take__head');
    head.append(el('span', 'voice-take__name', `Take ${takes.length - index}`), el('span', 'voice-take__meta block-secondary', clock(take.duration_s)));
    const dots = take.points.filter((p) => !isFollowUpPoint(p)).length;
    if (isViva && dots) head.append(el('span', 'voice-take__chip', `${dots} point${dots === 1 ? '' : 's'}`));
    const asked = take.points.length - dots;
    if (asked) head.append(el('span', 'voice-take__chip', `${asked} follow-up${asked === 1 ? '' : 's'}`));
    const player = el('audio', 'voice-take__audio');
    player.controls = true;
    player.preload = 'none';
    void takeStore()
      .audio(take.id)
      .then((blob) => {
        if (blob) player.src = URL.createObjectURL(blob);
      });
    const actions = el('div', 'pf-actions');
    actions.append(
      button('Send this take', 'primary', () => confirmSend(take)),
      button('Delete', 'ghost', async () => {
        await takeStore().remove(take.id);
        takes = await takeStore().list(scope);
        paint();
      })
    );
    row.append(head, player, actions);
    return row;
  }

  function practiceView(): HTMLElement {
    const view = el('div', 'voice-practice');
    if (oracy === 'recite' && !plan.recite?.ready) {
      view.append(
        mountRecitePractice(block.content.recite_text, plan.recite, (progress) => {
          plan.recite = progress;
          savePlan();
          if (progress.ready) paint();
        })
      );
      return view;
    }
    const lastTime = isViva ? vivaDoThis(vivas, classId) : null;
    if (lastTime) view.append(lastTime);
    const where = speakingTask ? speakingWhere(speakingRows) : null;
    if (where) view.append(where);
    if (oracy === 'debate') view.append(sideRow());
    if (isViva) view.append(planEditor());
    const goal = isViva ? goalLine() : null;
    if (goal)
      view.append(
        goalTick(goal, Boolean(plan.goal), (ticked) => {
          plan.goal = ticked;
          savePlan();
        }, block.id)
      );
    const stems = stemChips();
    if (stems) view.append(stems);
    if (oracy === 'recite') {
      const again = el('div', 'voice-recite__again');
      again.append(
        reciteTextFold(block.content.recite_text),
        button('Practise again', 'secondary', () => {
          plan.recite = { round: 0, step: 0 };
          savePlan();
          paint();
        })
      );
      view.append(again);
    }
    const chooser = timeChooser();
    if (chooser) view.append(chooser);
    const seconds = speakingSeconds(block, plan);
    const start = button(takes.length ? 'Record another take' : 'Start recording', 'primary', () => void practiseTake());
    start.classList.add('voice-start');
    const startRow = el('div', 'voice-start-row');
    const startFacts = [seconds ? durationLabel(seconds) : null, '3-2-1 countdown first', followUps ? followUpFact(followUps.count) : null].filter(Boolean).join(' · ');
    startRow.append(start, el('span', 'block-secondary', startFacts));
    view.append(startRow);
    if (takes.length) {
      const list = el('ol', 'voice-takes');
      list.setAttribute('aria-label', 'Your takes');
      takes.forEach((t, i) => list.append(takeRow(t, i)));
      view.append(el('h4', 'voice-takes__title', 'Your takes'), el('p', 'pf-field__hint block-secondary', 'Only you can hear these. Send your best one: you can only send one take.'), list);
    }
    return view;
  }

  /* ── Sending ──────────────────────────────────────────────────────── */

  /** Sends a take kept on this device. Throws with a message the student can read. */
  async function sendTake(take: VoiceTake, initials: string, status: HTMLElement): Promise<void> {
    const blob = memoryTakes.get(take.id) ?? (await takeStore().audio(take.id));
    if (!blob) throw new Error('This take is no longer on this device.');
    rememberInitials(initials);
    mine = await submitTake({
      lessonId,
      blockId: block.id,
      blob,
      mime: take.mime,
      duration_s: take.duration_s,
      initials,
      points: take.points,
      ...(oracy === 'debate' ? { side: side() } : {}),
      ...(plan.goal && goalLine() ? { goal: goalLine()! } : {}),
      onProgress: (sent, total) => {
        if (total > 1) status.textContent = `Sending… ${sent} of ${total}`;
      }
    });
  }

  function sendError(error: unknown): string {
    return error instanceof Error && !(error as { code?: string }).code ? error.message : errorText(error);
  }

  function initialsField(): { wrap: HTMLElement; input: HTMLInputElement } {
    const wrap = el('div', 'pf-field');
    const label = el('label', 'pf-field__label', 'Your initials');
    label.htmlFor = `voice-initials-${block.id}`;
    const input = el('input', 'pa-input voice-send__initials');
    input.id = label.htmlFor;
    input.maxLength = 4;
    input.autocomplete = 'off';
    input.value = voiceDevice().initials ?? '';
    input.placeholder = 'e.g. JS';
    input.addEventListener('input', () => {
      input.value = cleanInitials(input.value);
    });
    wrap.append(label, input);
    return { wrap, input };
  }

  function confirmSend(take: VoiceTake): void {
    clearError();
    const panel = el('div', 'voice-send');
    panel.append(el('h4', 'voice-send__title', 'Send this take?'), el('p', 'block-secondary', `Take of ${clock(take.duration_s)}. You can only send one take for this task.`));
    const { wrap, input: initials } = initialsField();
    const status = el('p', 'voice-send__status block-secondary');
    status.setAttribute('role', 'status');
    const actions = el('div', 'pf-actions');
    const send = button('Send to my teacher', 'primary', async function () {
      const typed = cleanInitials(initials.value);
      if (typed.length < 2) {
        status.textContent = 'Type your initials: 2 to 4 letters.';
        initials.focus();
        return;
      }
      this.disabled = true;
      cancel.disabled = true;
      status.textContent = 'Sending…';
      try {
        await sendTake(take, typed, status);
        paint();
      } catch (error) {
        status.textContent = '';
        showError(sendError(error));
        this.disabled = false;
        cancel.disabled = false;
      }
    });
    const cancel = button('Not yet', 'ghost', () => paint());
    actions.append(send, cancel);
    panel.append(wrap, actions, status);
    body.replaceChildren(panel);
    initials.focus();
  }

  /* ── Time pressure: one locked run ────────────────────────────────── */

  function timedFacts(p: Pressure): string {
    const seconds = speakingSeconds(block, plan)!;
    return [
      `${durationLabel(p.prep_s)} to prepare`,
      `${p.countdown_s} s countdown`,
      `speak for ${durationLabel(seconds)}`,
      ...(p.grace_s ? [`${p.grace_s} s to finish`] : []),
      ...(followUps ? [followUpFact(followUps.count)] : [])
    ].join(' · ');
  }

  /** Before the run: what will happen, initials, and the one Start. The question stays hidden. */
  function timedIntro(p: Pressure): HTMLElement {
    const view = el('div', 'voice-timed');
    view.append(
      el('p', 'voice-timed__title', 'Timed task: one go'),
      el('p', 'block-secondary', timedFacts(p)),
      el('p', 'pf-field__hint block-secondary', 'The question appears when you press Start prepping, and the clock starts then. Your take sends itself when the time is up. Find a quiet spot first.')
    );
    const where = speakingTask ? speakingWhere(speakingRows) : null;
    if (where) view.append(where);
    if (oracy === 'debate' && !block.content.side) view.append(sideRow());
    const { wrap, input: initials } = initialsField();
    view.append(wrap);
    const status = el('p', 'voice-send__status block-secondary');
    status.setAttribute('role', 'status');
    const go = button('Start prepping', 'primary', async function () {
      clearError();
      const typed = cleanInitials(initials.value);
      if (typed.length < 2) {
        status.textContent = 'Type your initials: 2 to 4 letters.';
        initials.focus();
        return;
      }
      if (oracy === 'debate' && !side()) {
        showError('Pick your side first.');
        return;
      }
      this.disabled = true;
      // The microphone first, so a permission prompt never eats prep time.
      status.textContent = 'Checking your microphone…';
      const mic = await openMic();
      if (!mic) {
        status.textContent = '';
        this.disabled = false;
        return;
      }
      try {
        rememberInitials(typed);
        const state = await startTimed(lessonId, block.id, typed, classId);
        mine = state;
        if (state.submitted) {
          mic.stream.getTracks().forEach((t) => t.stop());
          paint();
          return;
        }
        const at = phaseAt(p, state.elapsed_s ?? 0);
        if (at.phase === 'over') {
          mic.stream.getTracks().forEach((t) => t.stop());
          paint();
          return;
        }
        prepScreen(p, mic, typed, at.left);
      } catch (error) {
        mic.stream.getTracks().forEach((t) => t.stop());
        status.textContent = '';
        showError(errorText(error));
        this.disabled = false;
      }
    });
    go.classList.add('voice-start');
    view.append(go, status);
    return view;
  }

  /** A run begun on an earlier visit whose prep time is still going: carry on with what's left. */
  function timedResume(p: Pressure, left: number, initials: string): HTMLElement {
    const view = el('div', 'voice-timed');
    const shownAt = performance.now();
    view.append(
      el('p', 'voice-timed__title', 'Your prep time is still running'),
      el('p', 'block-secondary', `About ${durationLabel(Math.max(1, Math.round(left)))} left. Carry on now.`)
    );
    const go = button('Carry on', 'primary', async function () {
      this.disabled = true;
      const mic = await openMic();
      if (!mic) {
        this.disabled = false;
        return;
      }
      prepScreen(p, mic, initials, left - (performance.now() - shownAt) / 1000);
    });
    go.classList.add('voice-start');
    view.append(go);
    return view;
  }

  /** Takes recorded during this timed run (not an earlier run's, or practice from before it was timed). */
  function runTakes(): VoiceTake[] {
    const since = mine && !mine.submitted && mine.started_at ? Date.parse(mine.started_at) : NaN;
    return Number.isFinite(since) ? takes.filter((t) => Date.parse(t.recorded_at) >= since) : [];
  }

  /** The run began and no take reached the teacher: send one kept here, or ask the teacher. */
  function timedLocked(): HTMLElement {
    question?.reveal();
    const view = el('div', 'voice-timed');
    const kept = runTakes();
    if (kept.length) {
      view.append(
        el('p', 'voice-timed__title', 'Your take didn’t send'),
        el('p', 'block-secondary', 'It is still on this device. Send it now.')
      );
      const list = el('ol', 'voice-takes');
      kept.slice(0, 1).forEach((t, i) => list.append(takeRow(t, i)));
      view.append(list);
      return view;
    }
    view.append(
      el('p', 'voice-timed__title', 'You’ve had your go'),
      el('p', 'block-secondary', 'This timed task has started and nothing was sent. If something went wrong, ask your teacher to let you start again.')
    );
    return view;
  }

  /** Prep: the question shows, the clock runs, dot points to jot. Then the run records and sends itself. */
  function prepScreen(p: Pressure, mic: Mic, initials: string, left: number): void {
    question?.reveal();
    const view = el('div', 'voice-timed voice-timed--prep');
    const clockEl = el('p', 'voice-timed__clock');
    clockEl.setAttribute('role', 'timer');
    const bar = el('div', 'voice-rec__total');
    const fill = el('span', 'voice-rec__total-fill');
    bar.append(fill);
    view.append(el('p', 'voice-timed__label', 'Prep time'), clockEl, bar);
    if (isViva) view.append(planEditor());
    else view.append(el('p', 'pf-field__hint block-secondary', 'Plan what you will say. Recording starts when the prep time ends.'));
    const goal = isViva ? goalLine() : null;
    if (goal)
      view.append(
        goalTick(goal, Boolean(plan.goal), (ticked) => {
          plan.goal = ticked;
          savePlan();
        }, block.id)
      );
    const stems = stemChips();
    if (stems) view.append(stems);
    let ended = false;
    const ready = button('I’m ready: start now', 'secondary', () => endPrep());
    view.append(ready);
    body.replaceChildren(view);
    stopCurrent = () => {
      ended = true;
      window.clearInterval(timer);
      mic.stream.getTracks().forEach((t) => t.stop());
    };
    const endsAt = performance.now() + left * 1000;
    const tick = () => {
      const remaining = Math.max(0, (endsAt - performance.now()) / 1000);
      clockEl.textContent = clock(Math.ceil(remaining));
      fill.style.width = `${Math.min(100, (1 - remaining / p.prep_s) * 100)}%`;
      view.classList.toggle('voice-timed--warn', remaining <= WARN_BEFORE_S);
      if (remaining <= 0) endPrep();
    };
    const timer = window.setInterval(tick, 200);
    tick();

    function endPrep(): void {
      if (ended) return;
      ended = true;
      window.clearInterval(timer);
      stopCurrent = null;
      void timedRecord(p, mic, initials);
    }
  }

  async function timedRecord(p: Pressure, mic: Mic, initials: string): Promise<void> {
    const take = await record(mic, { lead: p.countdown_s, leadLabel: 'You’re about to speak', grace: p.grace_s, timed: true });
    if (!take) {
      paint();
      return;
    }
    const panel = el('div', 'voice-send');
    const status = el('p', 'voice-send__status', 'Time’s up. Sending your take…');
    status.setAttribute('role', 'status');
    panel.append(status);
    body.replaceChildren(panel);
    try {
      await sendTake(take, initials, status);
    } catch (error) {
      showError(sendError(error));
    }
    paint();
  }

  /* ── Recording ────────────────────────────────────────────────────── */

  async function openMic(): Promise<Mic | null> {
    const mime = pickMime();
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      showError('Recording works in Chrome or Safari. Open this page there.');
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      return { stream, mime };
    } catch {
      showError('Allow the microphone for this site, then press Start again.');
      return null;
    }
  }

  async function practiseTake(): Promise<void> {
    clearError();
    if (oracy === 'debate' && !side()) {
      showError('Pick your side first.');
      return;
    }
    const mic = await openMic();
    if (!mic) return;
    await record(mic, { lead: COUNTDOWN.length, grace: 0, timed: false });
    paint();
  }

  /**
   * One take: a countdown, the answer walked through its points, the grace
   * period (timed runs whose time ran out), then any follow-ups. The take is
   * kept on the device and returned; null when it was cancelled or empty.
   */
  async function record(mic: Mic, run: { lead: number; leadLabel?: string; grace: number; timed: boolean }): Promise<VoiceTake | null> {
    const { stream, mime } = mic;
    const seconds = speakingSeconds(block, plan);
    const labels = isViva ? plan.points.map((pt, i) => pt.trim() || scaffold[i]?.label || `Point ${i + 1}`) : [];
    const slots = seconds && labels.length ? paceSlots(weights(), seconds) : [];
    const asked = followUps ? drawFollowUps(followUps.questions, followUps.count) : [];

    const stage = el('div', 'voice-stage');
    stage.setAttribute('aria-live', 'polite');
    body.replaceChildren(stage);
    let cancelled = false;
    const timers = new Set<() => void>();
    stopCurrent = () => {
      cancelled = true;
      timers.forEach((end) => end());
      stream.getTracks().forEach((t) => t.stop());
    };

    /** Runs `secs` seconds, ticking with the seconds left; `end()` finishes it early. */
    const runFor = (secs: number, onTick: (left: number) => void) => {
      let end!: () => void;
      const done = new Promise<void>((resolve) => {
        const endsAt = performance.now() + secs * 1000;
        const timer = window.setInterval(tick, 200);
        function tick(): void {
          const left = Math.max(0, (endsAt - performance.now()) / 1000);
          onTick(left);
          if (left <= 0) end();
        }
        end = () => {
          window.clearInterval(timer);
          timers.delete(end);
          resolve();
        };
        timers.add(end);
        tick();
      });
      return { done, end: () => end() };
    };

    // The countdown, big, then Go. A timed run shows how long to the start.
    const leadView = el('div', 'voice-lead');
    const leadNumber = el('p', 'voice-countdown');
    if (run.leadLabel) leadView.append(el('p', 'voice-lead__label', run.leadLabel));
    leadView.append(leadNumber);
    stage.replaceChildren(leadView);
    let shown = -1;
    await runFor(run.lead, (left) => {
      const n = Math.ceil(left);
      if (n === shown || n === 0) return;
      shown = n;
      // A fresh node replays the pop for each number.
      const fresh = el('p', 'voice-countdown', String(n));
      leadNumber.replaceWith(fresh);
      leadView.replaceChildren(...(run.leadLabel ? [el('p', 'voice-lead__label', run.leadLabel)] : []), fresh);
    }).done;
    if (cancelled) return null;
    stage.replaceChildren(el('p', 'voice-countdown voice-countdown--go', 'Go'));

    const chunks: Blob[] = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: BITRATE });
    } catch {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    }
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    });
    const startedAt = performance.now();
    recorder.start(1000);
    // Thinking time before a follow-up pauses the recording, so the take holds speech only.
    const canPause = typeof recorder.pause === 'function' && typeof recorder.resume === 'function';
    let pausedMs = 0;
    let pausedAt: number | null = null;
    const mediaTime = () => (performance.now() - startedAt - pausedMs - (pausedAt === null ? 0 : performance.now() - pausedAt)) / 1000;
    const pause = () => {
      if (!canPause || pausedAt !== null || recorder.state !== 'recording') return;
      recorder.pause();
      pausedAt = performance.now();
    };
    const resume = () => {
      if (pausedAt === null) return;
      pausedMs += performance.now() - pausedAt;
      pausedAt = null;
      recorder.resume();
    };

    let manual = 0;
    let current = -1;
    const stamps: Array<{ label: string; t: number }> = [];
    let endMain!: (ranOut: boolean) => void;
    const mainDone = new Promise<boolean>((resolve) => {
      endMain = resolve;
    });
    const view = recordingView(labels, slots, seconds, () => {
      manual = Math.min(labels.length - 1, Math.max(manual, current) + 1);
      tick();
    }, () => endMain(false), run.timed);
    stage.replaceChildren(view.el);

    function tick(): void {
      const t = mediaTime();
      if (slots.length) {
        const live = livePoint(slots, t, manual);
        while (current < live) {
          current += 1;
          stamps.push({ label: labels[current]!.slice(0, 120), t: current === 0 ? 0 : Math.round(t * 10) / 10 });
        }
      }
      view.paint(t, current);
      if (seconds && t >= seconds) endMain(true);
    }

    const timer = window.setInterval(tick, 200);
    timers.add(() => endMain(false));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'ArrowRight') return;
      // A held key repeats; one press is one point.
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, button')) return;
      e.preventDefault();
      if (labels.length) view.next();
    };
    document.addEventListener('keydown', onKey);
    tick();
    const ranOut = await mainDone;
    window.clearInterval(timer);
    document.removeEventListener('keydown', onKey);
    if (cancelled) return null;

    // Grace: the time is up, the recording keeps going, the student finishes their sentence.
    if (run.timed && ranOut && run.grace > 0) {
      const grace = runFor(run.grace, (left) => view.grace(left, run.grace));
      view.onStop(() => grace.end());
      await grace.done;
      if (cancelled) return null;
    }

    // Follow-ups: think with the recording paused, then answer on the clock.
    for (const [i, q] of asked.entries()) {
      pause();
      const card = followUpCard(q, i, asked.length);
      stage.replaceChildren(card.el);
      await runFor(followUps!.think_s, (left) => card.think(left)).done;
      if (cancelled) return null;
      resume();
      stamps.push(followUpPoint(q, Math.round(mediaTime() * 10) / 10));
      const answer = runFor(followUps!.answer_s, (left) => card.answer(left, followUps!.answer_s));
      card.onDone(() => answer.end());
      await answer.done;
      if (cancelled) return null;
    }

    const duration = mediaTime();
    const stopped = new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve(), { once: true }));
    resume();
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    stopCurrent = null;
    const blob = new Blob(chunks, { type: (recorder.mimeType || mime).split(';')[0] });
    if (blob.size === 0 || duration < 1) {
      showError('That take was empty. Check your microphone and try again.');
      return null;
    }
    const take: VoiceTake = {
      id: `take_${Date.now().toString(36)}`,
      scope,
      recorded_at: new Date().toISOString(),
      duration_s: Math.round(duration * 10) / 10,
      mime: recorder.mimeType || mime,
      points: stamps,
      reached: stamps.filter((pt) => !isFollowUpPoint(pt)).length
    };
    try {
      takes = await keepTake(takeStore(), take, await blob.arrayBuffer());
    } catch {
      showError('Couldn’t keep this take on the device (private browsing?). Try a normal window.');
      // A timed run still sends: the bytes go straight from memory.
      if (run.timed) memoryTakes.set(take.id, blob);
    }
    return take;
  }

  /** A follow-up question: a think countdown, then the answer clock. */
  function followUpCard(q: string, index: number, total: number) {
    const box = el('div', 'voice-follow');
    const label = el('p', 'voice-follow__label', total > 1 ? `Follow-up question ${index + 1} of ${total}` : 'Follow-up question');
    const text = el('p', 'voice-follow__question', q);
    const state = el('p', 'voice-follow__state');
    const big = el('p', 'voice-countdown voice-follow__count');
    const bar = el('div', 'voice-rec__total');
    const fill = el('span', 'voice-rec__total-fill');
    bar.append(fill);
    bar.hidden = true;
    const actions = el('div', 'pf-actions');
    // Done joins only once answering starts: nothing to finish while thinking.
    const done = button('Done', 'primary', () => onDone());
    box.append(label, text, state, big, bar, actions);
    let onDone = () => undefined as void;
    let shown = -1;
    return {
      el: box,
      onDone: (fn: () => void) => {
        onDone = fn;
      },
      think(left: number) {
        const n = Math.ceil(left);
        state.textContent = 'Think. Recording starts in…';
        if (n !== shown && n > 0) {
          shown = n;
          const fresh = el('p', 'voice-countdown voice-follow__count', String(n));
          box.replaceChild(fresh, box.querySelector('.voice-follow__count')!);
        }
      },
      answer(left: number, of: number) {
        box.classList.add('voice-follow--answering');
        box.querySelector('.voice-follow__count')?.remove();
        state.replaceChildren(el('span', 'voice-rec__dot'), el('span', '', ` Recording · ${clock(Math.ceil(left))} left`));
        box.classList.toggle('voice-rec--warn', left <= WARN_BEFORE_S);
        bar.hidden = false;
        fill.style.width = `${Math.min(100, (1 - left / of) * 100)}%`;
        if (!done.isConnected) actions.append(done);
      }
    };
  }

  function recordingView(
    labels: string[],
    slots: PacedPoint[],
    seconds: number | null,
    onNext: () => void,
    onStop: () => void,
    timed = false
  ): { el: HTMLElement; paint: (t: number, current: number) => void; next: () => void; grace: (left: number, of: number) => void; onStop: (fn: () => void) => void } {
    const box = el('div', 'voice-rec');
    const head = el('div', 'voice-rec__head');
    const dot = el('span', 'voice-rec__dot');
    dot.setAttribute('aria-hidden', 'true');
    const time = el('span', 'voice-rec__time');
    const total = el('div', 'voice-rec__total');
    const totalFill = el('span', 'voice-rec__total-fill');
    total.append(totalFill);
    total.hidden = !seconds;
    const recLabel = el('span', 'voice-rec__label', 'Recording');
    head.append(dot, recLabel, time);
    box.append(head, total);

    const nowCard = el('div', 'voice-rec__now');
    const nowLabel = el('p', 'voice-rec__now-label');
    const nowText = el('p', 'voice-rec__now-text');
    const nowBar = el('div', 'voice-rec__bar');
    const nowFill = el('span', 'voice-rec__bar-fill');
    nowBar.append(nowFill);
    nowCard.append(nowLabel, nowText, nowBar);
    const list = el('ol', 'voice-rec__points');
    const items = labels.map((label) => {
      const li = el('li', 'voice-rec__point', label);
      list.append(li);
      return li;
    });
    if (labels.length) box.append(nowCard, list);

    const actions = el('div', 'pf-actions voice-rec__actions');
    const next = button('Next point', 'secondary', onNext);
    next.title = 'Space bar';
    if (!labels.length) next.hidden = true;
    let stopAction = onStop;
    const stop = button(timed ? 'I’ve finished' : 'Stop', 'primary', () => stopAction());
    actions.append(next, stop);
    box.append(actions);

    let lastCurrent = -2;
    let begunAt = 0;
    return {
      el: box,
      next: onNext,
      onStop(fn) {
        stopAction = fn;
      },
      grace(left, of) {
        box.classList.add('voice-rec--grace');
        recLabel.textContent = 'Time’s up: finish your sentence';
        next.remove();
        time.textContent = `${Math.ceil(left)} s`;
        totalFill.style.width = `${Math.min(100, (left / of) * 100)}%`;
        stop.textContent = followUps ? 'Done' : 'Send now';
      },
      paint(t, current) {
        const left = seconds ? Math.max(0, seconds - t) : t;
        time.textContent = seconds ? `${clock(left)} left` : clock(t);
        box.classList.toggle('voice-rec--warn', Boolean(seconds && left <= WARN_BEFORE_S));
        if (seconds) totalFill.style.width = `${Math.min(100, (t / seconds) * 100)}%`;
        if (!labels.length) return;
        const changed = current !== lastCurrent;
        if (changed) begunAt = current <= 0 ? 0 : Math.min(t, slots[current]?.start ?? t);
        const slot = slots[current];
        if (slot) nowFill.style.width = `${pointProgress(slot, begunAt, t) * 100}%`;
        if (!changed) return;
        lastCurrent = current;
        nowLabel.textContent = `Point ${current + 1} of ${labels.length}`;
        nowText.textContent = labels[current] ?? '';
        items.forEach((li, i) => {
          li.dataset.state = i < current ? 'done' : i === current ? 'now' : 'next';
        });
        next.disabled = current >= labels.length - 1;
      }
    };
  }

  /* ── After sending ────────────────────────────────────────────────── */

  function sentView(state: Extract<MineState, { submitted: true }>): HTMLElement {
    const view = el('div', 'voice-sent');
    view.append(
      el('p', 'voice-sent__title', 'Sent to your teacher.'),
      el('p', 'block-secondary', `${state.initials} · ${clock(state.duration_s)} · sent ${formatWhen(state.submitted_at)}. Your feedback will appear here.`)
    );
    if (state.audio_url) {
      const player = el('audio', 'voice-take__audio');
      player.controls = true;
      player.preload = 'none';
      player.src = audioUrl(state.audio_url);
      view.append(player);
    }
    return view;
  }

  function paint(): void {
    stopCurrent?.();
    stopCurrent = null;
    if (mine?.submitted) {
      question?.reveal();
      body.replaceChildren(mine.status === 'returned' ? renderVoiceFeedback(mine) : sentView(mine));
      return;
    }
    if (pressure) {
      if (!mine?.started) {
        body.replaceChildren(timedIntro(pressure));
        return;
      }
      const at = phaseAt(pressure, (mine.elapsed_s ?? 0) + (performance.now() - mineAt) / 1000);
      body.replaceChildren(at.phase === 'prep' && !runTakes().length ? timedResume(pressure, at.left, mine.initials ?? voiceDevice().initials ?? '') : timedLocked());
      return;
    }
    body.replaceChildren(practiceView());
  }

  body.append(el('p', 'block-secondary', 'Loading…'));
  void Promise.all([
    fetchMine(lessonId, block.id, classId).catch((error) => {
      showError(errorText(error));
      return { submitted: false } as MineState;
    }),
    takeStore()
      .list(scope)
      .catch(() => [] as VoiceTake[]),
    voiceStartLoader(classId, lessonId, { speaking: speakingTask, vivas: isViva })
  ]).then(([state, saved, start]) => {
    mine = state;
    mineAt = performance.now();
    takes = saved;
    speakingRows = start.rows;
    vivas = start.vivas;
    paint();
  });
  return root;
}
