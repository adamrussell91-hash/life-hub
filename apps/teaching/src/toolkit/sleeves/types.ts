/**
 * A sleeve lays a Thinking Toolkit item over a question students are already
 * answering. It sets no task of its own: See it, Do it, Check it, at two levels.
 */
export type SleeveLevel = 'support' | 'extend';
export const SLEEVE_LEVELS: readonly SleeveLevel[] = ['support', 'extend'];

export type SleeveText = {
  /** See it: one sentence on what good looks like. */
  see: string;
  /** Example pair shown under Show example. */
  weaker: string;
  stronger: string;
  /** Do it: one move. */
  do: string;
  /** Tap-to-insert sentence starters (2 or 3). */
  starters: string[];
  /** Check it: exactly three ticks students check against their own work. */
  checks: [string, string, string];
};

export type SleeveContent = {
  /** Library id, e.g. `value:clarity`. */
  id: string;
  /** One line under the chip, shown when the sleeve is closed. */
  goal: string;
  support: SleeveText;
  extend: SleeveText;
};
