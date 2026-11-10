/**
 * Explainer recorder: 3-2-1, then the teacher talks while marking the text.
 * Every mark, note, pointer move and pause point is an event at the take's
 * clock. Pause/resume closes one audio clip and opens the next. After Stop the
 * clips upload through the voice path and come back with word timings.
 */
import { pollAiJob } from '@/ai/jobs-client';
import { pickMime, uploadVoiceRecording } from '@/blocks/voice-recorder';
import { parseWhisperTimings } from '@/blocks/voice-transcript';
import {
  EXPLAINER_MAX_SECONDS,
  type AnnotationColour,
  type ExplainerBlock,
  type ExplainerBoardElement,
  type ExplainerClip,
  type ExplainerEvent,
  type ExplainerMarkStyle,
  type ExplainerTranscript
} from '@/schemas/block';
import type { ExplainerTake } from './clips';
import { mergeTranscripts } from './clips';
import { stateAt } from './fold';
import { createPanes, formatClock } from './player';
import { anchorFromWords } from './words';

export type RecorderTool = ExplainerMarkStyle | 'note' | 'pointer' | 'erase' | 'send';

export const TOOL_LABEL: Record<RecorderTool, string> = {
  highlight: 'Highlight',
  underline: 'Underline',
  box: 'Box',
  bracket: 'Bracket',
  strike: 'Cross out',
  note: 'Note',
  pointer: 'Pointer',
  erase: 'Eraser',
  send: 'Send to board'
};

/** Highlighter colours from the annotation palette. */
export const HIGHLIGHT_COLOURS: AnnotationColour[] = ['sand', 'wave', 'shore', 'coral', 'high-sea'];

export type MountExplainerRecorderOptions = {
  blockId: string;
  lessonId?: string;
  /** Re-record from this point: the take starts here and replaces what follows. */
  startAt?: number;
  onDone: (take: ExplainerTake) => void;
  onCancel: () => void;
  /** Tests and the preview shorten these. */
  countdownMs?: number;
  transcribeWaitMs?: number;
};

export type ExplainerRecorderHandle = { el: HTMLElement; dispose: () => void };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function btn(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', `btn ${cls}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const round2 = (n: number) => Math.round(n * 100) / 100;
let seq = 0;
const eventId = (kind: string) => `ev_${kind}_${Date.now().toString(36)}${(++seq).toString(36)}`;

/** A take's events from a list of tool actions; pure so the tests can drive it. */
export class TakeEvents {
  events: ExplainerEvent[] = [];
  private pointer: Extract<ExplainerEvent, { kind: 'pointer' }> | null = null;
  private lastSampleAt = -Infinity;

  push(ev: ExplainerEvent): ExplainerEvent {
    this.events.push(ev);
    return ev;
  }

  /** About 15 samples a second, and only when the word changes. */
  pointerSample(t: number, word: number): void {
    this.sample('text', t, [word]);
  }

  /** The board pointer in scene coordinates, about 15 samples a second. */
  boardSample(t: number, x: number, y: number): void {
    this.sample('board', t, [x, y]);
  }

  private sample(pane: 'text' | 'board', t: number, at: number[]): void {
    if (this.pointer && this.pointer.pane !== pane) this.endPointer(t);
    if (!this.pointer) {
      this.pointer = { id: eventId('pointer'), t: round2(t), kind: 'pointer', pane, samples: [[0, ...at] as [number, number]] };
      this.events.push(this.pointer);
      this.lastSampleAt = t;
      return;
    }
    const last = this.pointer.samples[this.pointer.samples.length - 1]!;
    const same = at.every((v, i) => last[i + 1] === v);
    if (same || t - this.lastSampleAt < 1 / 15) return;
    this.pointer.samples.push([round2(t - this.pointer.t), ...at] as [number, number]);
    this.lastSampleAt = t;
  }

  endPointer(t?: number): void {
    if (this.pointer && t !== undefined) {
      const last = this.pointer.samples[this.pointer.samples.length - 1]!;
      const off = round2(t - this.pointer.t);
      // Hold the dot where it was until the pointer is put down.
      if (off > last[0]) this.pointer.samples.push([off, ...last.slice(1)] as [number, number]);
    }
    this.pointer = null;
  }
}

/**
 * Board changes become events. A pen stroke in progress is timed point by
 * point; on release, a new stroke becomes a `stroke` event at the time it
 * began, and every other change a `board` event now.
 */
export class BoardCapture {
  private known = new Map<string, number>();
  private strokes = new Map<string, { t0: number; offsets: number[] }>();

  constructor(elements: readonly ExplainerBoardElement[]) {
    this.reset(elements);
  }

  reset(elements: readonly ExplainerBoardElement[]): void {
    this.known = new Map(elements.map((e) => [e.id, e.version ?? 0]));
  }

  /** Called on every board change while recording. */
  onChange(newElement: { id: string; type: string; points?: unknown[] } | null | undefined, t: number): void {
    if (!newElement || newElement.type !== 'freedraw' || !Array.isArray(newElement.points)) return;
    let s = this.strokes.get(newElement.id);
    if (!s) {
      s = { t0: round2(t), offsets: [] };
      this.strokes.set(newElement.id, s);
    }
    while (s.offsets.length < newElement.points.length) s.offsets.push(round2(Math.max(0, t - s.t0)));
  }

  /** Mark an element as already recorded (Send to board). */
  note(el: ExplainerBoardElement): void {
    this.known.set(el.id, el.version ?? 0);
  }

  /** Diff the board against what is already recorded. */
  commit(elements: readonly ExplainerBoardElement[], t: number): ExplainerEvent[] {
    const changed: ExplainerBoardElement[] = [];
    const out: ExplainerEvent[] = [];
    for (const el of elements) {
      const seen = this.known.get(el.id);
      if (seen === (el.version ?? 0)) continue;
      const stroke = this.strokes.get(el.id);
      const points = (el as { points?: unknown[] }).points;
      if (stroke && seen === undefined && !el.isDeleted && el.type === 'freedraw' && Array.isArray(points)) {
        const offsets = points.map((_, i) => stroke.offsets[Math.min(i, stroke.offsets.length - 1)] ?? 0);
        out.push({ id: eventId('stroke'), t: stroke.t0, kind: 'stroke', element: plain(el), offsets });
      } else if (!(seen === undefined && el.isDeleted)) {
        changed.push(plain(el));
      }
      this.known.set(el.id, el.version ?? 0);
      this.strokes.delete(el.id);
    }
    if (changed.length) out.push({ id: eventId('board'), t: round2(t), kind: 'board', elements: changed });
    return out;
  }
}

/** Excalidraw elements are frozen objects; store a plain copy. */
function plain(el: ExplainerBoardElement): ExplainerBoardElement {
  return JSON.parse(JSON.stringify(el)) as ExplainerBoardElement;
}

async function transcribe(jobId: string, duration_s: number, waitMs: number): Promise<ExplainerTranscript | null> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    let job: { status: string; result?: { whisper?: unknown }; error?: string };
    try {
      job = (await pollAiJob(jobId)) as typeof job;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (job.status === 'done') {
      const parsed = parseWhisperTimings(job.result?.whisper, { duration_s });
      return { words: parsed.words, timing: parsed.timing };
    }
    if (job.status === 'error') return null;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

export function mountExplainerRecorder(block: Pick<ExplainerBlock, 'content'>, options: MountExplainerRecorderOptions): ExplainerRecorderHandle {
  const startAt = Math.max(0, options.startAt ?? 0);
  const maxTake = Math.max(0, EXPLAINER_MAX_SECONDS - startAt);
  const content = block.content;
  const before = (content.recording?.events ?? []).filter((ev) => ev.t <= startAt);
  const take = new TakeEvents();

  const root = el('div', 'block-explainer__recorder');
  const head = el('div', 'block-explainer__rec-head');
  const status = el('p', 'block-explainer__rec-status', startAt > 0 ? `Re-recording from ${formatClock(startAt)}. Everything after it is replaced.` : 'Press Start, wait for 3-2-1, then talk and mark the text.');
  status.setAttribute('aria-live', 'polite');
  const clock = el('span', 'block-explainer__clock', `${formatClock(startAt)} / ${formatClock(EXPLAINER_MAX_SECONDS)}`);
  head.append(status, clock);

  // Tools.
  const tools = el('div', 'block-explainer__tools');
  tools.setAttribute('role', 'toolbar');
  tools.setAttribute('aria-label', 'Recording tools');
  let tool: RecorderTool = 'highlight';
  let colour: AnnotationColour = 'sand';
  const TEXT_TOOLS: RecorderTool[] = ['highlight', 'underline', 'box', 'bracket', 'strike', 'note', 'erase'];
  const offered = (Object.keys(TOOL_LABEL) as RecorderTool[]).filter((key) =>
    content.layout === 'board' ? !TEXT_TOOLS.includes(key) && key !== 'send' : key !== 'send' || content.layout === 'both'
  );
  const toolBtns = offered.map((key) => {
    const b = btn(TOOL_LABEL[key], 'btn--ghost block-explainer__tool', () => pickTool(key));
    b.dataset.tool = key;
    tools.append(b);
    return b;
  });
  const swatches = el('div', 'block-explainer__swatches');
  swatches.setAttribute('role', 'group');
  swatches.setAttribute('aria-label', 'Highlighter colour');
  const swatchBtns = HIGHLIGHT_COLOURS.map((c) => {
    const b = btn('', 'block-explainer__swatch', () => {
      colour = c;
      pickTool(layout === 'board' ? 'pointer' : 'highlight');
    });
    b.dataset.colour = c;
    b.classList.add(`block-annotation__ink--${c}`);
    b.setAttribute('aria-label', `Highlight in ${c.replace('-', ' ')}`);
    swatches.append(b);
    return b;
  });
  const pauseBtn = btn('Add pause point', 'btn--ghost block-explainer__add-pause', () => {
    if (!recording) return;
    take.push({ id: eventId('pause'), t: round2(now()), kind: 'pause', prompt: '' });
    flash('Pause point added. Write its prompt after you stop.');
    repaint();
  });
  tools.append(swatches, pauseBtn);

  // Notes tray: pick a chip, or type a note, then select words to drop it.
  const notePanel = el('div', 'block-explainer__note-panel');
  notePanel.hidden = true;
  let armedTray: string | null = null;
  const chips = el('div', 'block-explainer__tray-chips');
  for (const note of content.tray ?? []) {
    const chip = el('button', 'block-explainer__chip');
    chip.type = 'button';
    chip.dataset.tray = note.id;
    chip.textContent = (new DOMParser().parseFromString(note.html, 'text/html').body.textContent ?? '').trim() || 'Note';
    chip.addEventListener('click', () => {
      armedTray = armedTray === note.id ? null : note.id;
      for (const c of chips.querySelectorAll<HTMLElement>('[data-tray]')) c.setAttribute('aria-pressed', String(c.dataset.tray === armedTray));
    });
    chip.setAttribute('aria-pressed', 'false');
    chips.append(chip);
  }
  const typed = el('input', 'block-explainer__typed-note');
  typed.type = 'text';
  typed.placeholder = 'Or type a note, then select its words';
  typed.setAttribute('aria-label', 'Typed note');
  notePanel.append(el('p', 'block-explainer__hint', 'Pick a note, then select the words it belongs to.'), chips, typed);

  const layout = content.layout ?? 'text';
  const startState = stateAt(content, startAt);
  let capture: BoardCapture | null = null;
  const view = createPanes(block, {
    editableBoard: true,
    boardElements: startState.board,
    onBoardChange: ({ appState }) => {
      if (recording && capture) capture.onChange(appState.newElement, now());
    }
  });
  const { el: panes, text } = view;
  const board = view.board;
  const commitBoard = () => {
    if (!board || !capture || !started) return;
    for (const ev of capture.commit(board.getElements(), now())) take.push(ev);
  };
  if (board) {
    board.setInteractive(false);
    // Excalidraw finishes an edit on release; diff the board just after.
    board.el.addEventListener('pointerup', () => setTimeout(commitBoard, 0), true);
    board.el.addEventListener('keyup', () => setTimeout(commitBoard, 0), true);
    board.el.addEventListener('pointermove', (e) => {
      if (!recording || tool !== 'pointer') return;
      const at = board.sceneCoords(e.clientX, e.clientY);
      if (at) take.boardSample(now(), at.x, at.y);
    }, true);
    board.el.addEventListener('pointerleave', () => {
      if (tool === 'pointer' && recording) take.endPointer(now());
    });
  }
  const stage = el('div', 'block-explainer__stage block-explainer__stage--recording');
  stage.append(panes);
  const countdown = el('div', 'block-explainer__countdown');
  countdown.hidden = true;
  stage.append(countdown);

  const actions = el('div', 'block-explainer__rec-actions');
  const startBtn = btn('Start recording', 'btn--primary block-explainer__start', () => void start());
  const holdBtn = btn('Pause', 'btn--secondary block-explainer__hold', () => (recording ? hold() : void resume()));
  holdBtn.hidden = true;
  const stopBtn = btn('Stop', 'btn--secondary block-explainer__stop', () => void stop());
  stopBtn.hidden = true;
  const cancelBtn = btn('Cancel', 'btn--ghost block-explainer__cancel', () => {
    dispose();
    options.onCancel();
  });
  const retryBtn = btn('Try again', 'btn--secondary block-explainer__retry', () => void finish());
  retryBtn.hidden = true;
  actions.append(startBtn, holdBtn, stopBtn, retryBtn, cancelBtn);

  root.append(head, tools, notePanel, stage, actions);

  function pickTool(next: RecorderTool): void {
    if (tool === 'pointer' && next !== 'pointer') take.endPointer(recording ? now() : undefined);
    tool = next;
    // The board's laser follows the pointer tool; board drawing uses Excalidraw's own tools.
    view.board?.setTool(next === 'pointer' ? 'laser' : 'selection');
    for (const b of toolBtns) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
    for (const b of swatchBtns) b.setAttribute('aria-pressed', String(tool === 'highlight' && b.dataset.colour === colour));
    notePanel.hidden = tool !== 'note';
    root.dataset.tool = tool;
  }
  pickTool('highlight');

  // Clock and audio.
  let stream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let mime = 'audio/webm';
  let recording = false;
  let started = false;
  let closed = 0;
  let clipStartedAt = 0;
  const blobs: Array<{ blob: Blob; duration_s: number }> = [];
  let chunks: Blob[] = [];
  let timer = 0;
  let disposed = false;
  let finishing = false;

  const wall = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  /** Seconds into this take: closed clips plus the open one. */
  function now(): number {
    return closed + (recording ? (wall() - clipStartedAt) / 1000 : 0);
  }

  function flash(msg: string): void {
    status.textContent = msg;
  }

  function repaint(selection: [number, number] | null = null): void {
    const t = now();
    const shifted = take.events.map((ev) => ({ ...ev, t: ev.t + startAt }));
    view.paint(stateAt({ board_start: content.board_start, recording: { status: 'draft', clips: [], duration_s: EXPLAINER_MAX_SECONDS, events: [...before, ...shifted] } }, startAt + t), { selection });
  }

  function openClip(): void {
    if (!stream) return;
    chunks = [];
    try {
      mediaRecorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64_000 });
    } catch {
      mediaRecorder = new MediaRecorder(stream);
    }
    mime = mediaRecorder.mimeType || mime;
    mediaRecorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    });
    mediaRecorder.start(1000);
    clipStartedAt = wall();
    recording = true;
  }

  /** Close the open clip; resolves when its audio is in hand. */
  function closeClip(): Promise<void> {
    const rec = mediaRecorder;
    const dur = (wall() - clipStartedAt) / 1000;
    closed += dur;
    recording = false;
    mediaRecorder = null;
    if (!rec || rec.state === 'inactive') return Promise.resolve();
    return new Promise((resolve) => {
      rec.addEventListener(
        'stop',
        () => {
          blobs.push({ blob: new Blob(chunks, { type: mime }), duration_s: round2(dur) });
          resolve();
        },
        { once: true }
      );
      rec.stop();
    });
  }

  function loop(): void {
    if (disposed) return;
    const t = now();
    clock.textContent = `${formatClock(startAt + t)} / ${formatClock(EXPLAINER_MAX_SECONDS)}`;
    if (recording && t >= maxTake) {
      flash('That is the 10-minute limit. Saving…');
      void stop();
      return;
    }
    timer = window.setTimeout(loop, 250);
  }

  async function start(): Promise<void> {
    if (started) return;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      flash('This browser cannot record audio. Try Chrome or Safari on a laptop.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      flash('Allow the microphone, then press Start again.');
      return;
    }
    started = true;
    mime = pickMime() ?? 'audio/webm';
    startBtn.hidden = true;
    cancelBtn.hidden = true;
    const step = options.countdownMs ?? 1000;
    countdown.hidden = false;
    for (const n of [3, 2, 1]) {
      countdown.textContent = String(n);
      await new Promise((r) => setTimeout(r, step));
      if (disposed) return;
    }
    countdown.hidden = true;
    if (board) {
      capture = new BoardCapture(board.getElements());
      board.setInteractive(true);
    }
    openClip();
    holdBtn.hidden = false;
    stopBtn.hidden = false;
    root.classList.add('is-recording');
    flash('Recording. Talk and mark the text.');
    loop();
  }

  async function hold(): Promise<void> {
    if (!recording) return;
    take.endPointer(now());
    commitBoard();
    board?.setInteractive(false);
    await closeClip();
    holdBtn.textContent = 'Resume';
    root.classList.remove('is-recording');
    flash('Paused. Resume when you are ready.');
  }

  async function resume(): Promise<void> {
    if (recording || !started || finishing) return;
    board?.setInteractive(true);
    openClip();
    holdBtn.textContent = 'Pause';
    root.classList.add('is-recording');
    flash('Recording. Talk and mark the text.');
  }

  async function stop(): Promise<void> {
    if (finishing) return;
    finishing = true;
    take.endPointer(recording ? now() : undefined);
    if (recording) commitBoard();
    board?.setInteractive(false);
    if (recording) await closeClip();
    window.clearTimeout(timer);
    for (const track of stream?.getTracks() ?? []) track.stop();
    holdBtn.hidden = true;
    stopBtn.hidden = true;
    tools.hidden = true;
    notePanel.hidden = true;
    root.classList.remove('is-recording');
    await finish();
  }

  /** Upload every clip, wait for word timings, then hand the take back. */
  async function finish(): Promise<void> {
    retryBtn.hidden = true;
    const duration_s = round2(Math.min(maxTake, closed));
    const clips: ExplainerClip[] = [];
    const jobs: Array<{ jobId: string; start_s: number; duration_s: number }> = [];
    let at = 0;
    try {
      for (const [i, part] of blobs.entries()) {
        flash(`Saving audio ${i + 1} of ${blobs.length}…`);
        const started = await uploadVoiceRecording({
          blob: part.blob,
          mime,
          title: content.title?.trim() || 'Explainer',
          trackId: `${options.blockId}_clip${i + 1}`,
          ...(options.lessonId ? { lessonId: options.lessonId } : {}),
          duration_s: part.duration_s
        });
        const media = started.media;
        clips.push({
          media_id: media.id,
          url: media.preview_url || media.download_url || `/api/media/${media.id}/file`,
          mime: media.mime_type || mime,
          start_s: round2(at),
          duration_s: part.duration_s
        });
        jobs.push({ jobId: started.jobId, start_s: at, duration_s: part.duration_s });
        at += part.duration_s;
      }
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : 'Upload failed.';
      flash(`The audio did not save (${reason}). Try again.`);
      retryBtn.hidden = false;
      cancelBtn.hidden = false;
      return;
    }
    flash('Audio saved. Writing captions…');
    const perClip = await Promise.all(
      jobs.map(async (job) => ({ start_s: job.start_s, transcript: await transcribe(job.jobId, job.duration_s, options.transcribeWaitMs ?? 120_000) }))
    );
    const transcript = perClip.some((p) => p.transcript) ? mergeTranscripts(perClip) : undefined;
    const events = take.events.filter((ev) => ev.t <= duration_s).sort((a, b) => a.t - b.t);
    flash('Done.');
    options.onDone({ clips, duration_s, events, ...(transcript ? { transcript } : {}) });
  }

  // Marking the text with the pointer (mouse, pen or touch).
  let dragFrom: number | null = null;
  let dragTo: number | null = null;
  text.el.addEventListener('pointerdown', (e) => {
    if (!recording) return;
    const w = text.wordAtPoint(e.clientX, e.clientY);
    if (w == null) return;
    if (tool === 'erase') {
      const target = text.itemOnWord(w);
      if (target) {
        take.push({ id: eventId('erase'), t: round2(now()), kind: 'erase', target });
        repaint();
      }
      return;
    }
    if (tool === 'pointer') return;
    e.preventDefault();
    dragFrom = w;
    dragTo = w;
    try {
      text.el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    repaint([w, w]);
  });
  text.el.addEventListener('pointermove', (e) => {
    if (!recording) return;
    const w = text.wordAtPoint(e.clientX, e.clientY);
    if (tool === 'pointer') {
      if (w != null) {
        take.pointerSample(now(), w);
        repaint();
      }
      return;
    }
    if (dragFrom != null && w != null && w !== dragTo) {
      dragTo = w;
      repaint([dragFrom, w]);
    }
  });
  text.el.addEventListener('pointerleave', () => {
    if (tool === 'pointer' && recording) take.endPointer(now());
  });
  const endDrag = () => {
    if (dragFrom == null || dragTo == null) return;
    const a = dragFrom;
    const b = dragTo;
    dragFrom = dragTo = null;
    if (!recording || !content.text) return repaint();
    const anchor = anchorFromWords(content.text, a, b, text.words);
    if (!anchor) return repaint();
    const t = round2(now());
    if (tool === 'note') {
      const tray = (content.tray ?? []).find((n) => n.id === armedTray);
      const typedText = typed.value.trim();
      if (tray) take.push({ id: eventId('note'), t, kind: 'note', anchor, html: tray.html, tray_id: tray.id });
      else if (typedText) {
        take.push({ id: eventId('note'), t, kind: 'note', anchor, html: `<p>${escapeHtml(typedText)}</p>` });
        typed.value = '';
      } else flash('Pick a note or type one first.');
    } else if (tool === 'send') {
      const added = board?.addText(anchor.quote.exact);
      if (added) {
        const copy = JSON.parse(JSON.stringify(added)) as ExplainerBoardElement;
        capture?.note(copy);
        take.push({ id: eventId('send'), t, kind: 'send', anchor, element: copy });
      }
    } else if (tool !== 'pointer' && tool !== 'erase') {
      take.push({ id: eventId('mark'), t, kind: 'mark', style: tool, ...(tool === 'highlight' ? { colour } : {}), anchor });
    }
    repaint();
  };
  text.el.addEventListener('pointerup', endDrag);
  text.el.addEventListener('pointercancel', endDrag);

  requestAnimationFrame(() => repaint());

  function dispose(): void {
    disposed = true;
    window.clearTimeout(timer);
    try {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    } catch {
      /* ignore */
    }
    for (const track of stream?.getTracks() ?? []) track.stop();
    view.dispose();
  }

  return { el: root, dispose };
}
