/**
 * The explainer player: chains the clip audio, folds the events at the
 * current time and paints them. Play, pause, scrub, speed, captions and pause
 * points. Students and the teacher view get the same player.
 */
import type { ExplainerBlock } from '@/schemas/block';
import { clipAt } from './clips';
import { nextPauseAfter, pauseTicks, stateAt, type PauseEvent } from './fold';
import { createTextPane, type TextPane } from './text-pane';
import { mountBoard, type BoardHandle } from './board-runtime';
import type { ExplainerState } from './fold';

export const SPEEDS = [1, 1.25, 1.5] as const;

export type ExplainerPlayer = {
  el: HTMLElement;
  /** Current time on the recording's timeline. */
  time: () => number;
  seek: (t: number) => void;
  play: () => void;
  pause: () => void;
  playing: () => boolean;
  dispose: () => void;
};

export function formatClock(s: number): string {
  const total = Math.max(0, Math.floor(s));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

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

export type Panes = {
  el: HTMLElement;
  text: TextPane;
  /** The board, when the layout has one. */
  board: BoardHandle | null;
  /** Draw a state on both panes; the board only redraws when its picture changed. */
  paint: (state: ExplainerState, opts?: { selection?: [number, number] | null }) => void;
  dispose: () => void;
};

/** Every board element seen at any point in the recording (latest shape of each), for framing playback. */
export function everyBoardElement(content: ExplainerBlock['content']): ExplainerState['board'] {
  const seen = new Map<string, ExplainerState['board'][number]>();
  const times = [0, ...(content.recording?.events ?? []).map((e) => e.t), Number.POSITIVE_INFINITY];
  for (const t of times) {
    for (const element of stateAt(content, t).board) {
      if (!element.isDeleted) seen.set(String(element.id), element);
    }
  }
  return [...seen.values()];
}

/** The panes for the block's layout: text, board, or both side by side. */
export function createPanes(
  block: Pick<ExplainerBlock, 'content'>,
  opts: {
    editableBoard?: boolean;
    /** The board's first picture; default the starting picture. */
    boardElements?: ExplainerState['board'];
    onBoardChange?: Parameters<typeof mountBoard>[0]['onChange'];
  } = {}
): Panes {
  const layout = block.content.layout ?? 'text';
  const panes = el('div', 'block-explainer__panes');
  panes.dataset.layout = layout;
  const text = createTextPane(block.content.text);
  if (layout !== 'board') panes.append(text.el);
  let board: BoardHandle | null = null;
  if (layout !== 'text') {
    const start = opts.boardElements ?? stateAt({ board_start: block.content.board_start }, 0).board;
    // Playback frames everything drawn across the recording, so nothing lands off-screen later.
    const fitElements =
      opts.editableBoard === true ? undefined : everyBoardElement(block.content);
    board = mountBoard({
      elements: start,
      fitElements,
      files: block.content.board_start?.files,
      background: block.content.board_start?.appState?.viewBackgroundColor,
      editable: opts.editableBoard === true,
      onChange: opts.onBoardChange
    });
    panes.append(board.el);
  }
  let boardKey = '';
  return {
    el: panes,
    text,
    board,
    paint: (state, paintOpts) => {
      if (layout !== 'board') text.paint(state, paintOpts);
      if (!board) return;
      const key = `${state.board.length}:${state.boardTick}`;
      if (key !== boardKey && !opts.editableBoard) {
        boardKey = key;
        board.setElements(state.board);
      }
      const p = state.pointer;
      board.showPointer(p && p.pane === 'board' ? { x: p.x, y: p.y } : null);
    },
    dispose: () => {
      text.dispose();
      board?.dispose();
    }
  };
}

/** The text with every mark at its final place: no recording, or nothing to play yet. */
export function renderExplainerStatic(block: Pick<ExplainerBlock, 'content'>, upTo = Infinity): HTMLElement {
  const panes = createPanes(block);
  const state = stateAt(block.content, upTo);
  requestAnimationFrame(() => panes.paint({ ...state, pointer: null }));
  return panes.el;
}

export function mountExplainerPlayer(block: Pick<ExplainerBlock, 'content'>, opts: { autoplay?: boolean } = {}): ExplainerPlayer {
  const content = block.content;
  const rec = content.recording!;
  const duration = rec.duration_s;
  const events = rec.events;
  const root = el('div', 'block-explainer__player');
  const view = createPanes(block);
  const { el: panes } = view;
  const stage = el('div', 'block-explainer__stage');
  stage.append(panes);

  // Pause point card.
  const card = el('div', 'block-explainer__pause-card');
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Pause point');
  const cardEyebrow = el('p', 'block-explainer__pause-eyebrow', 'Pause and think');
  const cardPrompt = el('p', 'block-explainer__pause-prompt');
  const cont = btn('Continue', 'btn--primary block-explainer__continue', () => {
    card.hidden = true;
    play();
  });
  card.append(cardEyebrow, cardPrompt, cont);
  stage.append(card);

  const captions = el('p', 'block-explainer__captions');
  captions.hidden = true;
  captions.setAttribute('aria-live', 'off');

  // Controls.
  const bar = el('div', 'block-explainer__controls');
  const playBtn = btn('Play', 'btn--primary block-explainer__play', () => (isPlaying ? pause() : play()));
  playBtn.setAttribute('aria-label', 'Play');
  const clock = el('span', 'block-explainer__clock', `0:00 / ${formatClock(duration)}`);
  const scrubWrap = el('div', 'block-explainer__scrub');
  const scrub = el('input', 'block-explainer__scrubber');
  scrub.type = 'range';
  scrub.min = '0';
  scrub.max = String(duration);
  scrub.step = '0.05';
  scrub.value = '0';
  scrub.setAttribute('aria-label', 'Position');
  scrubWrap.append(scrub);
  for (const tick of pauseTicks(events)) {
    const mark = el('span', 'block-explainer__tick');
    mark.style.left = `${duration > 0 ? (tick.t / duration) * 100 : 0}%`;
    mark.title = tick.prompt || 'Pause point';
    scrubWrap.append(mark);
  }
  const speedGroup = el('div', 'block-explainer__speeds');
  speedGroup.setAttribute('role', 'group');
  speedGroup.setAttribute('aria-label', 'Speed');
  const speedBtns = SPEEDS.map((s) => {
    const b = btn(`${s}×`, 'btn--ghost block-explainer__speed', () => setRate(s));
    b.dataset.rate = String(s);
    b.setAttribute('aria-pressed', String(s === 1));
    speedGroup.append(b);
    return b;
  });
  const ccBtn = btn('Captions', 'btn--ghost block-explainer__cc', () => {
    captions.hidden = !captions.hidden;
    ccBtn.setAttribute('aria-pressed', String(!captions.hidden));
    paintCaptions(t);
  });
  ccBtn.setAttribute('aria-pressed', 'false');
  if (!rec.transcript?.words.length) ccBtn.hidden = true;
  bar.append(playBtn, clock, scrubWrap, speedGroup, ccBtn);
  root.append(stage, captions, bar);

  // Audio: one element per clip, chained.
  const audios = rec.clips.map((c) => {
    const a = el('audio', 'block-explainer__audio');
    a.preload = 'metadata';
    a.src = c.url;
    root.append(a);
    return a;
  });

  let t = 0;
  let lastT = -0.001;
  let rate = 1;
  let isPlaying = false;
  let active = -1;
  let wallAt = 0;
  let wallBase = 0;
  let raf = 0;
  let paintedKey = '';
  let disposed = false;

  const safePlay = (a: HTMLAudioElement) => {
    try {
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      /* no audio support (tests, old engines): the wall clock carries on */
    }
  };
  const stopAudio = () => {
    for (const a of audios) {
      try {
        a.pause();
      } catch {
        /* ignore */
      }
    }
    active = -1;
  };
  const startAudioAt = (time: number) => {
    stopAudio();
    const { index, offset } = clipAt(rec.clips, time);
    const a = audios[index];
    if (!a || offset >= rec.clips[index]!.duration_s) return;
    active = index;
    // Safari loads nothing before play, so a seek set now is dropped: set it
    // again once the length is known, or the voice restarts at the clip start.
    if (a.readyState < 1) a.addEventListener('loadedmetadata', () => { if (active === index) a.currentTime = offset; }, { once: true });
    try {
      a.currentTime = offset;
    } catch {
      /* metadata not loaded yet */
    }
    // Safari resets playbackRate to the default when a source loads.
    a.defaultPlaybackRate = rate;
    a.playbackRate = rate;
    safePlay(a);
  };

  /**
   * iPhones only let audio start from a tap. The next clip starts mid-play, not
   * from a tap, so on the first Play every other clip is started silently and
   * stopped, which lets it play later on its own.
   */
  let unlocked = false;
  const unlockOthers = () => {
    if (unlocked) return;
    unlocked = true;
    audios.forEach((a, i) => {
      if (i === active || !a.paused) return;
      a.muted = true;
      try {
        const p = a.play();
        const done = () => {
          if (i !== active) a.pause();
          a.muted = false;
        };
        if (p && typeof p.then === 'function') p.then(done, () => (a.muted = false));
        else done();
      } catch {
        a.muted = false;
      }
    });
  };

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const clockTime = () => {
    const a = audios[active];
    const c = rec.clips[active];
    if (a && c && !a.paused && a.readyState >= 2) return c.start_s + a.currentTime;
    return wallBase + ((now() - wallAt) / 1000) * rate;
  };

  function render(time: number): void {
    const evCount = events.findIndex((ev) => ev.t > time);
    const state = stateAt(content, time);
    const p = state.pointer;
    const key = `${evCount}|${state.boardTick}|${p ? (p.pane === 'text' ? p.word : `${p.x},${p.y}`) : '-'}`;
    if (key !== paintedKey) {
      paintedKey = key;
      view.paint(state);
    }
    scrub.value = String(time);
    clock.textContent = `${formatClock(time)} / ${formatClock(duration)}`;
    paintCaptions(time);
  }

  let capKey = '';
  function paintCaptions(time: number): void {
    if (captions.hidden) return;
    const words = rec.transcript?.words ?? [];
    let cur = -1;
    for (let i = 0; i < words.length; i += 1) {
      if (words[i]!.start <= time) cur = i;
      else break;
    }
    const lineStart = cur < 0 ? 0 : cur - (cur % 10);
    const k = `${lineStart}:${cur}`;
    if (k === capKey) return;
    capKey = k;
    captions.replaceChildren();
    for (let i = lineStart; i < Math.min(words.length, lineStart + 10); i += 1) {
      const span = el('span', i === cur ? 'is-current' : '', `${words[i]!.w} `);
      captions.append(span);
    }
  }

  function syncButton(): void {
    playBtn.textContent = isPlaying ? 'Pause' : t >= duration && duration > 0 ? 'Play again' : 'Play';
    playBtn.setAttribute('aria-label', playBtn.textContent);
    root.classList.toggle('is-playing', isPlaying);
  }

  function stopAtPause(p: PauseEvent): void {
    pause();
    t = p.t;
    lastT = p.t;
    render(t);
    syncButton();
    cardPrompt.textContent = p.prompt.trim() || 'Pause and think about what you have just seen.';
    card.hidden = false;
    cont.focus?.();
  }

  function tick(): void {
    if (!isPlaying || disposed) return;
    let next = clockTime();
    // Move on to the next clip when this one runs out (a shortened clip ends early).
    const c = rec.clips[active];
    const a = audios[active];
    if (c && a && (a.ended || a.currentTime >= c.duration_s - 0.02)) {
      next = c.start_s + c.duration_s;
      const following = rec.clips[active + 1];
      if (following) {
        wallBase = following.start_s;
        wallAt = now();
        startAudioAt(following.start_s);
        next = following.start_s;
      } else {
        // The last clip has run out: that is the end, even if rounding left a sliver.
        next = duration;
      }
    }
    const p = nextPauseAfter(events, lastT);
    if (p && p.t <= next) {
      stopAtPause(p);
      return;
    }
    if (next >= duration) {
      pause();
      t = duration;
      lastT = duration;
      render(t);
      syncButton();
      return;
    }
    t = Math.max(0, next);
    lastT = t;
    render(t);
    raf = requestAnimationFrame(tick);
  }

  function play(): void {
    if (disposed || duration <= 0) return;
    card.hidden = true;
    if (t >= duration) {
      t = 0;
      lastT = -0.001;
    }
    isPlaying = true;
    // Pan and zoom are for pauses; play puts the board back where it was.
    view.board?.setInteractive(false);
    view.board?.snapBack();
    wallBase = t;
    wallAt = now();
    startAudioAt(t);
    unlockOthers();
    syncButton();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function pause(): void {
    if (isPlaying) t = Math.min(duration, Math.max(0, clockTime()));
    isPlaying = false;
    view.board?.setInteractive(true);
    cancelAnimationFrame(raf);
    stopAudio();
    syncButton();
  }

  function seek(time: number): void {
    const was = isPlaying;
    if (was) pause();
    card.hidden = true;
    t = Math.max(0, Math.min(duration, time));
    lastT = t;
    render(t);
    syncButton();
    if (was && t < duration) play();
  }

  function setRate(next: number): void {
    if (isPlaying) {
      wallBase = clockTime();
      wallAt = now();
    }
    rate = next;
    for (const a of audios) {
      a.defaultPlaybackRate = next;
      a.playbackRate = next;
    }
    for (const b of speedBtns) b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === next));
  }

  // Dragging the scrubber moves the picture; the voice picks up on release,
  // not on every step of the drag.
  let resumeAfterScrub = false;
  scrub.addEventListener('input', () => {
    if (isPlaying) {
      pause();
      resumeAfterScrub = true;
    }
    card.hidden = true;
    t = Math.max(0, Math.min(duration, Number(scrub.value)));
    lastT = t;
    render(t);
  });
  scrub.addEventListener('change', () => {
    seek(Number(scrub.value));
    if (resumeAfterScrub) {
      resumeAfterScrub = false;
      if (t < duration) play();
    }
  });

  requestAnimationFrame(() => render(t));
  if (opts.autoplay) play();
  syncButton();

  return {
    el: root,
    time: () => t,
    seek,
    play,
    pause,
    playing: () => isPlaying,
    dispose: () => {
      disposed = true;
      pause();
      view.dispose();
    }
  };
}
