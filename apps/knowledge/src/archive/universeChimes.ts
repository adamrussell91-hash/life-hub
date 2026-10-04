/**
 * Soft chimes. Each planet owns a note on a pentatonic scale; events chime, and an optional ambient
 * layer plays a quiet note from a planet on screen every few seconds. Audio only starts from a click.
 */

export type AmbientLevel = 0 | 1 | 2 | 3;
export const AMBIENT_LABELS = ["Off", "Sparse", "Gentle", "Often"] as const;
const AMBIENT_GAPS: Array<[number, number]> = [
  [Infinity, Infinity],
  [9000, 15000],
  [4000, 8000],
  [1800, 3800],
];
const PENTATONIC = [0, 2, 4, 7, 9];

export function noteFrequency(step: number) {
  const octave = Math.floor(step / 5);
  const degree = ((step % 5) + 5) % 5;
  return 261.63 * Math.pow(2, octave + PENTATONIC[degree]! / 12);
}

export function ambientDelay(level: AmbientLevel, random: number) {
  if (level === 0) return Infinity;
  const [lo, hi] = AMBIENT_GAPS[level]!;
  return lo + random * (hi - lo);
}

export const UNIVERSE_SOUND_KEY = "kh-universe-sound";

export type SoundPrefs = { on: boolean; ambient: AmbientLevel };

export function readSoundPrefs(storage: Pick<Storage, "getItem"> | null | undefined): SoundPrefs {
  try {
    const parsed = JSON.parse(storage?.getItem(UNIVERSE_SOUND_KEY) ?? "null");
    const ambient = Number(parsed?.ambient);
    return {
      on: parsed?.on === true,
      ambient: (ambient >= 0 && ambient <= 3 ? Math.round(ambient) : 2) as AmbientLevel,
    };
  } catch {
    return { on: false, ambient: 2 };
  }
}

export function writeSoundPrefs(prefs: SoundPrefs, storage: Pick<Storage, "setItem"> | null | undefined) {
  try {
    storage?.setItem(UNIVERSE_SOUND_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode / quota */
  }
}

export class Chimes {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = 0;
  enabled = false;

  /** Must run inside a user gesture. Returns false where Web Audio is unavailable. */
  start() {
    if (this.ctx) {
      void this.ctx.resume?.();
      return true;
    }
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctor) return false;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0.16;
    const verb = ctx.createConvolver();
    const length = Math.floor(ctx.sampleRate * 2.6);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.2);
    }
    verb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    master.connect(ctx.destination);
    master.connect(verb);
    verb.connect(wet);
    wet.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    return true;
  }

  chime(step: number, velocity = 1, delaySeconds = 0) {
    if (!this.enabled || !this.ctx || !this.master) return;
    const now = performance.now();
    if (delaySeconds === 0 && now - this.last < 70) return;
    this.last = now;
    const t = this.ctx.currentTime + delaySeconds;
    const f = noteFrequency(step);
    for (const [mult, gain] of [
      [1, 1],
      [2.001, 0.22],
      [3.01, 0.06],
    ] as const) {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f * mult;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.5 * gain * velocity, t + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 2.4 / mult);
      osc.connect(env);
      env.connect(this.master);
      osc.start(t);
      osc.stop(t + 2.6);
    }
  }

}

/** One audio engine for the app, so remounting Universe never stacks contexts. */
export const universeChimes = new Chimes();
