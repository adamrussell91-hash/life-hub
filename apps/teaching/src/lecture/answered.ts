import type { GateResult } from './state';

/**
 * Gate blocks fire this when a student answers. Outside a lecture nothing
 * listens; the lecture player listens on its stage to unlock the next beat.
 */
export const LECTURE_ANSWERED = 'lecture:answered';
export type AnsweredDetail = { blockId: string; result: GateResult };

export function emitAnswered(from: HTMLElement, blockId: string, result: GateResult): void {
  from.dispatchEvent(new CustomEvent<AnsweredDetail>(LECTURE_ANSWERED, { bubbles: true, detail: { blockId, result } }));
}
