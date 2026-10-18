/**
 * The classroom tools chime. On by default; one mute covers every tool and is
 * remembered on this device.
 */
const MUTE_KEY = 'teaching-hub.classroom-tools.muted';

let muted: boolean | null = null;
let audio: AudioContext | null = null;

export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** Wake the audio context from a click, so later chimes are allowed to play. */
export function primeSound(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!audio && Ctor) audio = new Ctor();
    void audio?.resume?.();
  } catch {
    audio = null;
  }
}

/** One soft tone per beat; the last beat is higher. */
export function chime(beats = 1): void {
  if (isMuted()) return;
  primeSound();
  if (!audio) return;
  try {
    for (let i = 0; i < beats; i += 1) {
      const t = audio.currentTime + i * 0.28;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === beats - 1 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    }
  } catch {
    // Sound is a nicety; the tools work without it.
  }
}
