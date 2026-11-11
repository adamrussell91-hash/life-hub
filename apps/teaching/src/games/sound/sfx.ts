import { audioContext, isMuted, primeSound, setMuted } from '@/blocks/classroom-tools/sound';

/**
 * Game sound effects (spec §5.3): WebAudio synthesis, no audio files, on the
 * classroom tools' audio context and mute. The board plays sound (one mute,
 * the classroom tools' one, remembered per device). Phones are silent unless
 * the student turns game sound on for this device.
 */

export type SfxRole = 'board' | 'phone';
export const SFX_NAMES = ['tick', 'lock', 'right', 'wrong', 'reveal', 'fanfare', 'whoosh', 'click', 'ding', 'buzz', 'coin'] as const;
export type SfxName = (typeof SFX_NAMES)[number];

const PHONE_KEY = 'teaching-hub.games.phone-sound';
let role: SfxRole = 'phone';
let phoneOn: boolean | null = null;

/** Board screens call this with 'board'; everything else is a phone (silent by default). */
export function setSfxRole(next: SfxRole): void {
  role = next;
}
export function sfxRole(): SfxRole {
  return role;
}

/** The phone's own sound choice on this device. Off unless the student turned it on. */
export function phoneSoundOn(): boolean {
  if (phoneOn === null) {
    try {
      phoneOn = localStorage.getItem(PHONE_KEY) === '1';
    } catch {
      phoneOn = false;
    }
  }
  return phoneOn;
}

export function setPhoneSound(on: boolean): void {
  phoneOn = on;
  try {
    localStorage.setItem(PHONE_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
  if (on) {
    // Turning sound on is a tap, so the browser lets audio start now; and the shared mute must not silence it.
    if (isMuted()) setMuted(false);
    primeSound();
  }
}

/** Whether a sound would play now in this role. */
export function soundOn(): boolean {
  if (isMuted()) return false;
  return role === 'board' || phoneSoundOn();
}

/** Turns sound on or off for the current role (the board's mute or the phone's toggle). */
export function setSoundOn(on: boolean): void {
  if (role === 'board') {
    setMuted(!on);
    if (on) primeSound();
  } else setPhoneSound(on);
}

/** Forget cached choices (tests). */
export function resetSfxForTests(): void {
  role = 'phone';
  phoneOn = null;
}

type ToneOptions = { type?: OscillatorType; gain?: number; at?: number; slide?: number };

function tone(ctx: AudioContext, freq: number, dur: number, { type = 'sine', gain = 0.14, at = 0, slide }: ToneOptions = {}): void {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** The effects, as tone recipes (ported from the approved mockups). */
const RECIPES: Record<SfxName, (c: AudioContext) => void> = {
  tick: (c) => tone(c, 880, 0.05, { type: 'square', gain: 0.04 }),
  lock: (c) => {
    tone(c, 520, 0.08, { type: 'triangle' });
    tone(c, 780, 0.1, { type: 'triangle', at: 0.06 });
  },
  right: (c) => {
    tone(c, 660, 0.12, { type: 'triangle' });
    tone(c, 990, 0.2, { type: 'triangle', at: 0.1 });
  },
  wrong: (c) => tone(c, 220, 0.3, { type: 'sawtooth', gain: 0.06, slide: 140 }),
  reveal: (c) => [392, 494, 587, 784].forEach((f, i) => tone(c, f, 0.35, { type: 'triangle', at: i * 0.07, gain: 0.1 })),
  fanfare: (c) => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(c, f, 0.28, { type: 'triangle', at: i * 0.12, gain: 0.12 })),
  whoosh: (c) => tone(c, 300, 0.35, { type: 'sine', gain: 0.08, slide: 1400 }),
  click: (c) => tone(c, 1500, 0.02, { type: 'square', gain: 0.03 }),
  ding: (c) => {
    tone(c, 1320, 0.4, { gain: 0.1 });
    tone(c, 1980, 0.3, { gain: 0.05, at: 0.01 });
  },
  buzz: (c) => tone(c, 110, 0.45, { type: 'square', gain: 0.07 }),
  coin: (c) => {
    tone(c, 988, 0.07, { type: 'square', gain: 0.05 });
    tone(c, 1319, 0.18, { type: 'square', gain: 0.05, at: 0.07 });
  }
};

/** Plays one effect if sound is on for this role. Returns whether it played. Never throws. */
export function play(name: SfxName): boolean {
  if (!soundOn()) return false;
  const ctx = audioContext();
  if (!ctx) return false;
  try {
    RECIPES[name](ctx);
    return true;
  } catch {
    return false;
  }
}

/** `sfx.right()`, `sfx.tick()` and so on. */
export const sfx: Record<SfxName, () => boolean> = Object.fromEntries(SFX_NAMES.map((n) => [n, () => play(n)])) as Record<SfxName, () => boolean>;
export type Sfx = typeof sfx;

/**
 * The small per-device sound toggle (a real button with its state in
 * `aria-pressed`). On a phone it is the phone's own choice; on a board, the mute.
 */
export function soundToggle(className = 'gm-icon-btn gm-sound-toggle'): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  const paint = () => {
    const on = soundOn();
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? 'Sound on' : 'Sound off';
    b.title = on ? 'Turn game sound off on this device' : 'Turn game sound on on this device';
  };
  b.addEventListener('click', () => {
    setSoundOn(!soundOn());
    paint();
    play('click');
  });
  paint();
  return b;
}
