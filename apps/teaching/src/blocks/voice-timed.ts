import type { Block } from '@/schemas/block';

/**
 * Time pressure and follow-ups for the Voice block. Time pressure runs once:
 * the question is hidden until the student starts prepping, then prep time, a
 * big "about to speak" countdown, the speaking time and a grace period, and
 * the take sends itself. Follow-ups are drawn from the teacher's bank after
 * the main answer; the recording pauses while the student thinks, so each
 * answer lands on the same take as a point of its own.
 */

type VoiceBlock = Extract<Block, { block_type: 'audio' }>;

export type Pressure = { prep_s: number; countdown_s: number; grace_s: number };
export type FollowUps = { questions: string[]; count: number; think_s: number; answer_s: number };

export const PRESSURE_DEFAULTS: Pressure = { prep_s: 60, countdown_s: 10, grace_s: 10 };
export const FOLLOW_UP_DEFAULTS = { count: 1, think_s: 10, answer_s: 30 };
/** Speaking time when a timed task has no limit set. */
export const PRESSURE_SPEAKING_DEFAULT = 90;
export const FOLLOW_UP_PREFIX = 'Follow-up: ';

/** Time pressure settings, or null when it is off. Recite shows its text, so it never runs under pressure. */
export function pressureOf(block: VoiceBlock): Pressure | null {
  const p = block.content.pressure;
  if (!p?.enabled || block.content.oracy === 'recite') return null;
  return { prep_s: p.prep_s ?? PRESSURE_DEFAULTS.prep_s, countdown_s: p.countdown_s ?? PRESSURE_DEFAULTS.countdown_s, grace_s: p.grace_s ?? PRESSURE_DEFAULTS.grace_s };
}

/** Follow-up settings with the blank questions dropped, or null when off or the bank is empty. */
export function followUpsOf(block: VoiceBlock): FollowUps | null {
  const f = block.content.follow_up;
  if (!f?.enabled) return null;
  const questions = (f.questions ?? []).map((q) => q.trim()).filter(Boolean);
  if (!questions.length) return null;
  return {
    questions,
    count: Math.min(questions.length, Math.max(1, f.count ?? FOLLOW_UP_DEFAULTS.count)),
    think_s: f.think_s ?? FOLLOW_UP_DEFAULTS.think_s,
    answer_s: f.answer_s ?? FOLLOW_UP_DEFAULTS.answer_s
  };
}

/** `count` different questions in random order. */
export function drawFollowUps(questions: string[], count: number, random: () => number = Math.random): string[] {
  const pool = [...questions];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.max(0, count));
}

export function followUpPoint(question: string, t: number): { label: string; t: number } {
  return { label: `${FOLLOW_UP_PREFIX}${question}`.slice(0, 320), t };
}

export function isFollowUpPoint(point: { label: string }): boolean {
  return point.label.startsWith(FOLLOW_UP_PREFIX);
}

const SAND = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Letters in the shape of the question, so the hidden card holds the same
 * length of text without the question itself being on the page.
 */
export function sandText(text: string, random: () => number = Math.random): string {
  return text.replace(/[A-Za-z0-9]/g, (ch) => {
    const letter = SAND[Math.floor(random() * SAND.length)]!;
    return ch === ch.toUpperCase() && /[A-Z]/.test(ch) ? letter.toUpperCase() : letter;
  });
}

/** Where a timed run stands, from the seconds since it began (the server's count). */
export type TimedPhase = { phase: 'prep'; left: number } | { phase: 'over' };

export function phaseAt(pressure: Pressure, elapsed: number): TimedPhase {
  const left = pressure.prep_s - elapsed;
  return left > 1 ? { phase: 'prep', left } : { phase: 'over' };
}

/**
 * The follow-up questions a take answered, in order, so whoever reads the
 * transcript knows what each answer was to. `onJump` makes each a button
 * that plays from where its answer starts. Null when there were none.
 */
export function followUpList(points: ReadonlyArray<{ label: string; t: number }>, onJump?: (t: number) => void): HTMLElement | null {
  const asked = points.filter(isFollowUpPoint);
  if (!asked.length) return null;
  const box = document.createElement('section');
  box.className = 'voice-follow-list';
  const title = document.createElement('p');
  title.className = 'voice-follow-list__title';
  title.textContent = asked.length === 1 ? 'Follow-up question' : 'Follow-up questions';
  const list = document.createElement('ol');
  list.className = 'voice-follow-list__items';
  for (const point of asked) {
    const item = document.createElement('li');
    const text = point.label.slice(FOLLOW_UP_PREFIX.length);
    const at = `${Math.floor(point.t / 60)}:${String(Math.floor(point.t % 60)).padStart(2, '0')}`;
    if (onJump) {
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'voice-follow-list__jump';
      jump.textContent = `${at} · ${text}`;
      jump.title = 'Play from this answer';
      jump.addEventListener('click', () => onJump(point.t));
      item.append(jump);
    } else {
      item.textContent = `${at} · ${text}`;
    }
    list.append(item);
  }
  box.append(title, list);
  return box;
}
