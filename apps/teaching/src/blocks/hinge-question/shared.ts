import type { Block } from '@/schemas/block';

export type HingeBlock = Extract<Block, { block_type: 'hinge_question' }>;
export type HingeContent = HingeBlock['content'];
export type HingeOption = HingeContent['options'][number];

export const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 5;
const POLL_MS = 3000;

/** Four empty answers, the usual shape of a hinge question. */
export function starterHingeOptions(blockId: string): HingeOption[] {
  return ['a', 'b', 'c', 'd'].map((k) => ({ id: `${blockId}_${k}`, text: '', misconception: '' }));
}

/** What stops the block publishing, in the teacher's words. */
export function hingeIssue(content: HingeContent): string | null {
  if (!content.prompt.trim()) return 'Write the hinge question';
  if (content.options.length < MIN_OPTIONS) return 'A hinge question needs at least two answers';
  if (content.options.some((o) => !o.text.trim())) return 'Fill in every answer, or remove the empty one';
  if (!content.options.some((o) => o.id === content.correct_id)) return 'Mark the right answer';
  if (content.reteach >= content.move_on) return 'The reteach mark must be below the move-on mark';
  return null;
}

export type NextStep = { kind: 'move_on' | 'split' | 'reteach'; label: string };

/** The teacher's next move from the share of the class who got it right. Never shown to students. */
export function nextStep(rightPct: number, moveOn: number, reteach: number): NextStep {
  if (rightPct >= moveOn) return { kind: 'move_on', label: 'Move on' };
  if (rightPct < reteach) return { kind: 'reteach', label: 'Reteach' };
  return { kind: 'split', label: 'Split the class' };
}

export const percent = (n: number, total: number): number => (total ? Math.round((n / total) * 100) : 0);

/** Runs `tick` now and every few seconds while the block is on the page and the tab is visible. */
export function poller(root: HTMLElement, tick: () => Promise<void>): void {
  let timer: number | undefined;
  const onVisible = () => {
    if (!root.isConnected) return document.removeEventListener('visibilitychange', onVisible);
    if (!document.hidden) void tick();
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      if (!root.isConnected) return document.removeEventListener('visibilitychange', onVisible);
      if (!document.hidden) await tick();
      schedule();
    }, POLL_MS);
  };
  document.addEventListener('visibilitychange', onVisible);
  void tick().finally(schedule);
}

/** Seconds left on an open round, or null when it has no time limit. */
export function secondsLeft(closesAt: string | null | undefined): number | null {
  if (!closesAt) return null;
  return Math.max(0, Math.ceil((Date.parse(closesAt) - Date.now()) / 1000));
}

export function formatSeconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
