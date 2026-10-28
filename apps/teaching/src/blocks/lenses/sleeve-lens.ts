import type { Block } from '@/schemas/block';
import { SleeveConfigSchema, type SleeveConfig } from '@/schemas/lens';
import type { LibraryItem } from '@/toolkit/library';
import { SLEEVE_LEVELS, type SleeveContent, type SleeveText } from '@/toolkit/sleeves';
import { canHaveKaplanQualifier } from '../kaplan';
import { readLens, withLens, withoutLens } from './attachments';
import type { SleeveLens } from './types';

/** A block holds at most two sleeves, so an open one is never more than three steps. */
export const MAX_SLEEVES = 2;
export const SLEEVE_PREFIX = 'sleeve:';

/** The toolkit and thinking blocks are the old cards themselves, so they never wear a sleeve. */
const NO_SLEEVE = new Set(['toolkit_skill', 'toolkit_tool', 'toolkit_value', 'thinking_move', 'teacher_note']);

export function canWearSleeve(block: Block): boolean {
  return canHaveKaplanQualifier(block) && !NO_SLEEVE.has(block.block_type);
}

/** Drop blank overrides so the block falls back to the sleeve's own text. */
function cleanConfig(raw: SleeveConfig): SleeveConfig {
  const c = SleeveConfigSchema.parse(raw);
  const next: SleeveConfig = { level: c.level, student_level: c.student_level };
  const move = c.do?.trim();
  if (move) next.do = move;
  const checks = (c.checks ?? []).slice(0, 3).map((check) => check.trim());
  if (checks.some(Boolean)) next.checks = checks;
  return next;
}

export function sleeveLens(item: LibraryItem, text: SleeveContent): SleeveLens {
  const id = `${SLEEVE_PREFIX}${item.id}`;
  return {
    kind: 'sleeve',
    id,
    toolkitId: item.id,
    toolkitKind: item.kind,
    label: item.label,
    goal: text.goal,
    levels: SLEEVE_LEVELS,
    canAttach: canWearSleeve,
    read: (block) => {
      const raw = readLens(block, id);
      if (!raw) return undefined;
      const parsed = SleeveConfigSchema.safeParse(raw);
      return parsed.success ? parsed.data : undefined;
    },
    write: (block, config) => withLens(block, id, cleanConfig(config)),
    remove: (block) => withoutLens(block, id),
    create: () => SleeveConfigSchema.parse({}),
    content: (level, config): SleeveText => {
      const base = text[level];
      // Overrides belong to the level the teacher wrote them for.
      if (level !== config.level) return base;
      const checks = base.checks.map((check, i) => config.checks?.[i]?.trim() || check) as SleeveText['checks'];
      return { ...base, do: config.do?.trim() || base.do, checks };
    }
  };
}
