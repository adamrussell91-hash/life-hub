/**
 * One audio element for every voice note in an annotation view. Marks in the
 * poem and rows in the Voice notes list are plain buttons tagged with
 * `data-voice-key`; `sync()` repaints their play state, progress and time, so
 * they survive the view rebuilding its DOM.
 */
import { activeClipAt, type PlaybackClip } from '@/blocks/voice-playback';

export type VoiceNoteSource = {
  key: string;
  url: string;
  start_s: number;
  end_s: number;
  /** Lines to light while a whole recording plays: one per pinned clip. */
  clips?: PlaybackClip[];
};

export type VoiceNotePlayer = {
  toggle: (note: VoiceNoteSource) => void;
  /** Jump within a note to `fraction` (0–1) of its length; starts it if idle. */
  seek: (note: VoiceNoteSource, fraction: number) => void;
  stop: () => void;
  /** Repaint every tagged control under the root. Call after each rebuild. */
  sync: () => void;
  currentKey: () => string | null;
  dispose: () => void;
};

/** `m:ss`, never negative, never NaN. */
export function formatVoiceTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function voiceNoteLength(note: Pick<VoiceNoteSource, 'start_s' | 'end_s'>): number {
  return Math.max(0, note.end_s - note.start_s);
}

export function createVoiceNotePlayer(
  root: HTMLElement,
  hooks: { onLine?: (clipId: string | null) => void } = {}
): VoiceNotePlayer {
  const audio = document.createElement('audio');
  audio.preload = 'none';
  audio.hidden = true;
  root.append(audio);

  let current: VoiceNoteSource | null = null;
  let raf = 0;
  let disposed = false;

  function elapsed(): number {
    if (!current) return 0;
    return Math.min(voiceNoteLength(current), Math.max(0, audio.currentTime - current.start_s));
  }

  function lightLine(): void {
    if (!current?.clips?.length) return;
    hooks.onLine?.(activeClipAt(current.clips, audio.currentTime)?.id ?? null);
  }

  function sync(): void {
    const playing = Boolean(current) && !audio.paused;
    root.querySelectorAll<HTMLElement>('[data-voice-key]').forEach((el) => {
      const mine = current?.key === el.dataset.voiceKey;
      const length = Number(el.dataset.voiceLength) || 0;
      const at = mine ? elapsed() : 0;
      el.classList.toggle('is-playing', mine && playing);
      el.classList.toggle('is-current', mine);
      el.style.setProperty('--voice-progress', length > 0 ? String(Math.min(1, at / length)) : '0');
      if (el instanceof HTMLButtonElement && el.dataset.voiceToggle != null) {
        el.setAttribute('aria-pressed', mine && playing ? 'true' : 'false');
        el.setAttribute('aria-label', `${mine && playing ? 'Pause' : 'Play'} voice note: ${el.dataset.voiceLabel ?? ''}`);
      }
      el.querySelectorAll<HTMLElement>('[data-voice-time]').forEach((time) => {
        time.textContent =
          mine && (playing || at > 0)
            ? `${formatVoiceTime(at)} / ${formatVoiceTime(length)}`
            : formatVoiceTime(length);
      });
      el.querySelectorAll<HTMLInputElement>('input[data-voice-scrub]').forEach((scrub) => {
        if (document.activeElement === scrub && mine && !playing) return;
        scrub.value = String(length > 0 ? Math.round((at / length) * 1000) : 0);
      });
    });
  }

  function stopTicking(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function tick(): void {
    raf = 0;
    if (!current || disposed) return;
    if (audio.currentTime >= current.end_s - 0.02) {
      finish();
      return;
    }
    lightLine();
    sync();
    if (!audio.paused) raf = requestAnimationFrame(tick);
  }

  function finish(): void {
    audio.pause();
    stopTicking();
    current = null;
    hooks.onLine?.(null);
    sync();
  }

  function start(note: VoiceNoteSource, at: number): void {
    if (current?.key !== note.key) hooks.onLine?.(null);
    current = note;
    // Same file: seek in place. New file: point at it, seek once it can.
    const resolved = new URL(note.url, location.href).href;
    if (audio.src !== resolved) {
      audio.src = resolved;
      audio.preload = 'auto';
    }
    audio.currentTime = at;
    if (audio.readyState < 1) {
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (current === note && Math.abs(audio.currentTime - at) > 0.25) audio.currentTime = at;
        },
        { once: true }
      );
    }
    // play() must run inside the click itself, or Safari and iPad refuse it.
    void audio.play().catch(() => {
      if (current === note) finish();
    });
    sync();
  }

  audio.addEventListener('play', () => {
    stopTicking();
    raf = requestAnimationFrame(tick);
    sync();
  });
  audio.addEventListener('pause', () => {
    stopTicking();
    sync();
  });
  audio.addEventListener('ended', () => finish());
  audio.addEventListener('error', () => {
    if (current) finish();
  });

  return {
    toggle(note) {
      if (current?.key === note.key) {
        if (audio.paused) void audio.play().catch(() => finish());
        else audio.pause();
        return;
      }
      start(note, note.start_s);
    },
    seek(note, fraction) {
      const at = note.start_s + voiceNoteLength(note) * Math.min(1, Math.max(0, fraction));
      if (current?.key === note.key) {
        audio.currentTime = at;
        lightLine();
        sync();
        return;
      }
      start(note, at);
    },
    stop() {
      if (current) finish();
    },
    sync,
    currentKey: () => current?.key ?? null,
    dispose() {
      disposed = true;
      stopTicking();
      audio.pause();
      audio.removeAttribute('src');
      audio.remove();
    }
  };
}
