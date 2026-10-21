import type { Block } from '@/schemas/block';
import { BECAUSE_BUT_SO_LENS } from './because-but-so';
import { KAPLAN_STEPPED_LENSES } from './kaplan-lenses';
import { QUESTION_LEVELS_LENS } from './question-levels';
import type { LensConfig, LensLevel, SteppedLens } from './types';
import { WINDOWS_MIRRORS } from './windows-mirrors';

/**
 * Every stepped lens the picker offers, in picker order. Adding a framework
 * means adding an entry here, not a block type, schema field or menu item.
 */
export const STEPPED_LENSES: readonly SteppedLens[] = [
  ...KAPLAN_STEPPED_LENSES, WINDOWS_MIRRORS, QUESTION_LEVELS_LENS, BECAUSE_BUT_SO_LENS
];

export function steppedLens(id: string): SteppedLens | undefined {
  return STEPPED_LENSES.find((lens) => lens.id === id);
}

export type AttachedLens = { lens: SteppedLens; config: LensConfig };

export function attachedSteppedLenses(block: Block): AttachedLens[] {
  const attached: AttachedLens[] = [];
  for (const lens of STEPPED_LENSES) {
    const config = lens.canAttach(block) ? lens.read(block) : undefined;
    if (config) attached.push({ lens, config });
  }
  return attached;
}

/** The teacher's level, or a level this lens has written, never one it lacks. */
export function lensLevel(lens: SteppedLens, config: LensConfig, chosen?: LensLevel): LensLevel {
  const wanted = (config.student_level !== false && chosen) || config.level || 'core';
  return lens.levels.includes(wanted) ? wanted : lens.levels.includes('core') ? 'core' : lens.levels[0]!;
}
