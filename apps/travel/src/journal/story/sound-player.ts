import { setJournalMediaSrc } from '@/journal/media-loading';
import { ICONS, button, el, icon } from '@/journal/story/dom';

export interface SoundPlayerOptions {
  src: string;
  /** Length in seconds when the journal knows it. */
  durationS?: number;
}

/** "0:24". */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

let playing: HTMLAudioElement | null = null;

/**
 * A sound clip: play or pause, a plain progress bar and the length. There is
 * no drawn waveform, because the journal holds no waveform data.
 */
export function renderSoundPlayer(options: SoundPlayerOptions): HTMLElement {
  const wrap = el('div', 'story-sound');
  const audio = el('audio');
  audio.preload = 'none';
  setJournalMediaSrc(audio, options.src);

  const toggle = button('story-sound__toggle');
  toggle.setAttribute('aria-label', 'Play sound');
  toggle.append(icon(ICONS.play, 'story-icon story-icon--solid'));

  const main = el('div', 'story-sound__main');
  const bar = el('progress', 'story-sound__bar');
  bar.max = 1;
  bar.value = 0;
  bar.setAttribute('aria-label', 'Sound progress');
  const meta = el('div', 'story-sound__meta');
  const label = el('span', 'story-sound__label', 'Sound');
  const time = el('span', 'story-sound__time num', formatClock(options.durationS ?? 0));
  meta.append(label, time);
  main.append(bar, meta);

  const length = (): number =>
    Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : options.durationS ?? 0;

  function paint(isPlaying: boolean): void {
    toggle.replaceChildren(icon(isPlaying ? ICONS.pause : ICONS.play, `story-icon${isPlaying ? '' : ' story-icon--solid'}`));
    toggle.setAttribute('aria-label', isPlaying ? 'Pause sound' : 'Play sound');
    wrap.classList.toggle('is-playing', isPlaying);
  }

  toggle.addEventListener('click', () => {
    if (audio.paused) {
      // Only one clip at a time.
      if (playing && playing !== audio) playing.pause();
      playing = audio;
      void audio.play().catch(() => paint(false));
    } else {
      audio.pause();
    }
  });
  audio.addEventListener('play', () => paint(true));
  audio.addEventListener('pause', () => paint(false));
  audio.addEventListener('timeupdate', () => {
    const total = length();
    bar.value = total > 0 ? Math.min(1, audio.currentTime / total) : 0;
    time.textContent = formatClock(audio.paused ? total : audio.currentTime);
  });
  audio.addEventListener('ended', () => {
    bar.value = 0;
    time.textContent = formatClock(length());
    paint(false);
  });

  wrap.append(toggle, main, audio);
  return wrap;
}
