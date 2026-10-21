import type { Block } from '@/schemas/block';
import { button, el, errorText, readJSON, writeJSON } from '@/blocks/peer-feedback-ui';
import { clock, durationLabel, livePoint, paceSlots, type PacedPoint } from '@/blocks/voice-pacing';
import { keepTake, takeStore, type VoiceTake } from '@/blocks/voice-takes';
import { audioUrl, cleanInitials, fetchMine, rememberInitials, submitTake, voiceDevice, type MineState } from '@/blocks/voice-client';
import { DEFAULT_VIVA_SECONDS, STUDENT_TIME_CHOICES } from '@/blocks/voice-block-editor';
import { renderVoiceFeedback } from '@/blocks/voice-feedback-view';

/**
 * The student side of a Voice block: prep dot points (viva), a 3-2-1
 * countdown, a recording that walks through the points on a timer, practice
 * takes kept on the device, and sending the one best take.
 */

type VoiceBlock = Extract<Block, { block_type: 'audio' }>;
type Plan = { points: string[]; seconds?: number };

const COUNTDOWN = [3, 2, 1];
const WARN_BEFORE_S = 10;
const BITRATE = 32_000;

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
  if (c.student_chooses_time) return STUDENT_TIME_CHOICES.includes(plan.seconds ?? 0) ? plan.seconds! : STUDENT_TIME_CHOICES[1]!;
  if (c.time_limit_s) return c.time_limit_s;
  return c.mode === 'viva' ? DEFAULT_VIVA_SECONDS : null;
}

export function mountVoiceStudent(block: VoiceBlock, lessonId: string): HTMLElement {
  const isViva = block.content.mode === 'viva';
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
  let stopCurrent: (() => void) | null = null;

  const showError = (text: string) => {
    alert.textContent = text;
    alert.hidden = false;
  };
  const clearError = () => {
    alert.hidden = true;
  };
  const savePlan = () => writeJSON(planKey, plan);

  const weights = () => plan.points.map((_, i) => scaffold[i]?.weight ?? 1);

  /* ── Practice: plan + takes ───────────────────────────────────────── */

  function planEditor(): HTMLElement {
    const box = el('section', 'voice-plan');
    box.append(el('h4', 'voice-plan__title', 'Your dot points'));
    box.append(el('p', 'pf-field__hint block-secondary', 'Short prompts, not a script. The timer moves you through them while you speak.'));
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
            paint();
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
          paint();
          body.querySelector<HTMLInputElement>('.voice-plan__point:last-child input')?.focus();
        })
      );
    }
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
    if (isViva && take.points.length) {
      head.append(el('span', 'voice-take__chip', `${take.reached}/${take.points.length} points`));
    }
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
    if (isViva) view.append(planEditor());
    const chooser = timeChooser();
    if (chooser) view.append(chooser);
    const seconds = speakingSeconds(block, plan);
    const start = button(takes.length ? 'Record another take' : 'Start recording', 'primary', () => void beginRecording());
    start.classList.add('voice-start');
    const startRow = el('div', 'voice-start-row');
    startRow.append(start, el('span', 'block-secondary', seconds ? `${durationLabel(seconds)} · 3-2-1 countdown first` : '3-2-1 countdown first'));
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

  function confirmSend(take: VoiceTake): void {
    clearError();
    const panel = el('div', 'voice-send');
    panel.append(el('h4', 'voice-send__title', 'Send this take?'), el('p', 'block-secondary', `Take of ${clock(take.duration_s)}. You can only send one take for this task.`));
    const wrap = el('div', 'pf-field');
    const label = el('label', 'pf-field__label', 'Your initials');
    label.htmlFor = `voice-initials-${block.id}`;
    const initials = el('input', 'pa-input voice-send__initials');
    initials.id = label.htmlFor;
    initials.maxLength = 4;
    initials.autocomplete = 'off';
    initials.value = voiceDevice().initials ?? '';
    initials.placeholder = 'e.g. JS';
    initials.addEventListener('input', () => {
      initials.value = cleanInitials(initials.value);
    });
    wrap.append(label, initials);
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
        const blob = await takeStore().audio(take.id);
        if (!blob) throw new Error('This take is no longer on this device.');
        rememberInitials(typed);
        mine = await submitTake({
          lessonId,
          blockId: block.id,
          blob,
          mime: take.mime,
          duration_s: take.duration_s,
          initials: typed,
          points: take.points,
          onProgress: (sent, total) => {
            if (total > 1) status.textContent = `Sending… ${sent} of ${total}`;
          }
        });
        paint();
      } catch (error) {
        status.textContent = '';
        showError(error instanceof Error && !(error as { code?: string }).code ? error.message : errorText(error));
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

  /* ── Recording ────────────────────────────────────────────────────── */

  async function beginRecording(): Promise<void> {
    clearError();
    const mime = pickMime();
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      showError('This browser can’t record audio. Try Chrome or Safari.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      showError('Allow the microphone for this site, then press Start again.');
      return;
    }
    const seconds = speakingSeconds(block, plan);
    const labels = isViva ? plan.points.map((p, i) => p.trim() || scaffold[i]?.label || `Point ${i + 1}`) : [];
    const slots = seconds && labels.length ? paceSlots(weights(), seconds) : [];

    const stage = el('div', 'voice-stage');
    stage.setAttribute('aria-live', 'polite');
    body.replaceChildren(stage);
    let cancelled = false;
    stopCurrent = () => {
      cancelled = true;
      stream.getTracks().forEach((t) => t.stop());
    };

    // 3-2-1, big, then Go.
    for (const n of COUNTDOWN) {
      if (cancelled) return;
      stage.replaceChildren(el('p', 'voice-countdown', String(n)));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (cancelled) return;
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
    const elapsed = () => (performance.now() - startedAt) / 1000;

    let manual = 0;
    let current = -1;
    const stamps: Array<{ label: string; t: number }> = [];
    const view = recordingView(labels, slots, seconds, () => {
      manual = Math.min(labels.length - 1, Math.max(manual, current) + 1);
      tick();
    }, () => finish());
    stage.replaceChildren(view.el);

    function tick(): void {
      const t = elapsed();
      if (slots.length) {
        const live = livePoint(slots, t, manual);
        while (current < live) {
          current += 1;
          stamps.push({ label: labels[current]!.slice(0, 120), t: current === 0 ? 0 : Math.round(t * 10) / 10 });
        }
      }
      view.paint(t, current);
      if (seconds && t >= seconds) finish();
    }

    const timer = window.setInterval(tick, 200);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'ArrowRight') return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, button')) return;
      e.preventDefault();
      if (labels.length) view.next();
    };
    document.addEventListener('keydown', onKey);
    tick();

    let finished = false;
    async function finish(): Promise<void> {
      if (finished) return;
      finished = true;
      window.clearInterval(timer);
      document.removeEventListener('keydown', onKey);
      const duration = Math.min(elapsed(), seconds ?? Infinity);
      const stopped = new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve(), { once: true }));
      if (recorder.state !== 'inactive') recorder.stop();
      await stopped;
      stream.getTracks().forEach((t) => t.stop());
      stopCurrent = null;
      const blob = new Blob(chunks, { type: (recorder.mimeType || mime!).split(';')[0] });
      if (blob.size === 0 || duration < 1) {
        showError('That take was empty. Check your microphone and try again.');
        paint();
        return;
      }
      const take: VoiceTake = {
        id: `take_${Date.now().toString(36)}`,
        scope,
        recorded_at: new Date().toISOString(),
        duration_s: Math.round(duration * 10) / 10,
        mime: recorder.mimeType || mime!,
        points: stamps,
        reached: stamps.length
      };
      try {
        takes = await keepTake(takeStore(), take, await blob.arrayBuffer());
      } catch {
        showError('Couldn’t keep this take on the device (private browsing?). Try a normal window.');
      }
      paint();
    }
  }

  function recordingView(
    labels: string[],
    slots: PacedPoint[],
    seconds: number | null,
    onNext: () => void,
    onStop: () => void
  ): { el: HTMLElement; paint: (t: number, current: number) => void; next: () => void } {
    const box = el('div', 'voice-rec');
    const head = el('div', 'voice-rec__head');
    const dot = el('span', 'voice-rec__dot');
    dot.setAttribute('aria-hidden', 'true');
    const time = el('span', 'voice-rec__time');
    const total = el('div', 'voice-rec__total');
    const totalFill = el('span', 'voice-rec__total-fill');
    total.append(totalFill);
    total.hidden = !seconds;
    head.append(dot, el('span', 'voice-rec__label', 'Recording'), time);
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
    actions.append(next, button('Stop', 'primary', onStop));
    box.append(actions);

    let lastCurrent = -2;
    return {
      el: box,
      next: onNext,
      paint(t, current) {
        const left = seconds ? Math.max(0, seconds - t) : t;
        time.textContent = seconds ? `${clock(left)} left` : clock(t);
        box.classList.toggle('voice-rec--warn', Boolean(seconds && left <= WARN_BEFORE_S));
        if (seconds) totalFill.style.width = `${Math.min(100, (t / seconds) * 100)}%`;
        if (!labels.length) return;
        const slot = slots[current];
        if (slot) nowFill.style.width = `${Math.min(100, Math.max(0, ((t - slot.start) / (slot.end - slot.start)) * 100))}%`;
        if (current === lastCurrent) return;
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
      body.replaceChildren(mine.status === 'returned' ? renderVoiceFeedback(mine) : sentView(mine));
      return;
    }
    body.replaceChildren(practiceView());
  }

  body.append(el('p', 'block-secondary', 'Loading…'));
  void Promise.all([
    fetchMine(lessonId, block.id).catch((error) => {
      showError(errorText(error));
      return { submitted: false } as MineState;
    }),
    takeStore()
      .list(scope)
      .catch(() => [] as VoiceTake[])
  ]).then(([state, saved]) => {
    mine = state;
    takes = saved;
    paint();
  });
  return root;
}
