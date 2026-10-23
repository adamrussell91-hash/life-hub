import type { Narration } from '@/schemas/block';
import { el, readJSON, writeJSON } from '@/quiz/dom';

const RATES = [1, 1.25, 1.5] as const;
type Rate = (typeof RATES)[number];
const RATE_KEY = 'lecture:rate';

function savedRate(): Rate {
  const saved = readJSON<unknown>(RATE_KEY);
  return RATES.find((r) => r === saved) ?? 1;
}

export type NarrationHandle = {
  /** The play button, clip progress and speed, for the bottom bar. */
  el: HTMLElement;
  /** Swap to a scene's clip. Autoplays when allowed; otherwise waits for a tap. */
  load(narration: Narration | null): void;
  toggle(): void;
  pause(): void;
  /** Seconds into the current clip, for hand-ups. */
  time(): number;
  /** Called when a clip finishes or the scene has none (true), or starts playing (false). */
  onIdle(fn: (idle: boolean) => void): void;
  dispose(): void;
};

/**
 * One audio element for the whole lecture. Safari only lets a page play
 * sound after a tap, so the Start tap plays the first clip and later clips
 * reuse the same element. If a play is still refused, the button says so.
 */
export function createNarration(): NarrationHandle {
  const audio = new Audio();
  audio.preload = 'auto';
  let rate: Rate = savedRate();
  let idleFn: (idle: boolean) => void = () => {};
  let has = false;

  const root = el('div', 'lecture-narration');
  const play = el('button', 'lecture-narration__play');
  play.type = 'button';
  const track = el('div', 'lecture-narration__track');
  const fill = el('div', 'lecture-narration__fill');
  track.append(fill);
  track.setAttribute('aria-hidden', 'true');
  const speed = el('button', 'lecture-narration__speed');
  speed.type = 'button';
  root.append(play, track, speed);

  const paint = () => {
    root.hidden = !has;
    const playing = has && !audio.paused;
    play.textContent = playing ? '❚❚' : '▶';
    play.setAttribute('aria-label', playing ? 'Pause narration' : 'Play narration');
    speed.textContent = `${rate}×`;
    speed.setAttribute('aria-label', `Narration speed ${rate} times`);
    const pct = audio.duration > 0 && Number.isFinite(audio.duration) ? (audio.currentTime / audio.duration) * 100 : 0;
    fill.style.width = `${pct}%`;
  };

  const tryPlay = () => {
    audio.playbackRate = rate;
    // Autoplay refused: the student taps play. Count it as idle so the hint can still appear.
    void audio.play().catch(() => { paint(); idleFn(true); });
  };

  play.addEventListener('click', () => (audio.paused ? tryPlay() : audio.pause()));
  speed.addEventListener('click', () => {
    rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length]!;
    audio.playbackRate = rate;
    writeJSON(RATE_KEY, rate);
    paint();
  });
  audio.addEventListener('timeupdate', paint);
  audio.addEventListener('play', () => { paint(); idleFn(false); });
  audio.addEventListener('pause', paint);
  audio.addEventListener('ended', () => { paint(); idleFn(true); });
  // A clip that will not load never holds the lecture; it only lets the hint appear.
  audio.addEventListener('error', () => { if (!audio.getAttribute('src')) return; paint(); idleFn(true); });

  return {
    el: root,
    load(narration) {
      audio.pause();
      has = !!narration?.url;
      if (narration?.url) {
        audio.src = narration.url;
        tryPlay();
      } else {
        audio.removeAttribute('src');
        queueMicrotask(() => idleFn(true));
      }
      paint();
    },
    toggle: () => (audio.paused ? tryPlay() : audio.pause()),
    pause: () => audio.pause(),
    time: () => (Number.isFinite(audio.currentTime) ? Math.round(audio.currentTime) : 0),
    onIdle(fn) { idleFn = fn; },
    dispose() {
      idleFn = () => {};
      audio.pause();
      audio.removeAttribute('src');
    }
  };
}
