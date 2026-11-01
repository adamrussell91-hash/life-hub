import type { Block } from '@/schemas/block';
import type { PlacedStep } from './schema';

/**
 * A block's deep understanding tags, kept in its settings like a chosen
 * WalkThru (walkthru-note/attach.ts). Teacher-only: visibility.ts strips them.
 *   deep_taught   pieces this block teaches
 *   deep_step     the step this block is the evidence task for
 *   deep_targets  pieces a writing task expects students to use (2–3)
 */

type Settings = Record<string, unknown>;
const PIECE = /^kp_[a-z0-9]{4,16}$/;
const DU = /^du_[a-z0-9]{4,16}$/;
const PLACED = new Set(['2a', '2b', '3', '4']);
export const DEEP_SETTING_KEYS = ['deep_taught', 'deep_step', 'deep_targets'] as const;

const settingsOf = (block: Pick<Block, 'settings'>): Settings => ((block.settings ?? {}) as Settings);
const pieceList = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && PIECE.test(x)))] : []);

function withSetting<T extends Block>(block: T, key: string, value: unknown): T {
  const { [key]: _old, ...rest } = settingsOf(block);
  const empty = value === null || (Array.isArray(value) && value.length === 0);
  return { ...block, settings: empty ? rest : { ...rest, [key]: value } };
}

export const piecesTaught = (block: Pick<Block, 'settings'>): string[] => pieceList(settingsOf(block).deep_taught);
export const targetPieces = (block: Pick<Block, 'settings'>): string[] => pieceList(settingsOf(block).deep_targets).slice(0, 3);
export const withPiecesTaught = <T extends Block>(block: T, ids: string[]): T => withSetting(block, 'deep_taught', pieceList(ids));
export const withTargetPieces = <T extends Block>(block: T, ids: string[]): T => withSetting(block, 'deep_targets', pieceList(ids).slice(0, 3));

export type EvidenceStep = { du: string; step: PlacedStep };
export function evidenceStepOf(block: Pick<Block, 'settings'>): EvidenceStep | null {
  const v = settingsOf(block).deep_step as { du?: unknown; step?: unknown } | undefined;
  return v && typeof v.du === 'string' && DU.test(v.du) && typeof v.step === 'string' && PLACED.has(v.step) ? { du: v.du, step: v.step as PlacedStep } : null;
}
export const withEvidenceStep = <T extends Block>(block: T, value: EvidenceStep | null): T => withSetting(block, 'deep_step', value);
