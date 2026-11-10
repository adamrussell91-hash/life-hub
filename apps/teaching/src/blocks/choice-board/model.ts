/**
 * Choice board rules, kept pure for tests. Tiles are numbered left to right,
 * top to bottom; `columns` tiles make a row.
 */

export type ChoiceRule = 'none' | 'each_column' | 'line';
export type ChoiceSettings = { pick: number; columns: number; rule: ChoiceRule };

export const TIER_NAMES = ['Core', 'Stretch', 'Challenge'] as const;

export function tierName(tier: number | undefined): string {
  return TIER_NAMES[(tier ?? 1) - 1] ?? TIER_NAMES[0];
}

export const tileColumn = (index: number, columns: number): number => index % columns;
export const tileRow = (index: number, columns: number): number => Math.floor(index / columns);

/** The rows, columns and diagonals of a 3 × 3 board. */
export const BOARD_LINES: readonly (readonly number[])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

/** Whether the rule can be met at all with this board: a line needs a 3 × 3 board and three picks. */
export function ruleApplies(settings: ChoiceSettings, tileCount: number): boolean {
  if (settings.rule === 'each_column') return settings.pick >= Math.min(settings.columns, tileCount);
  if (settings.rule === 'line') return tileCount === 9 && settings.columns === 3 && settings.pick >= 3;
  return false;
}

/** The student-facing instruction for the rule. */
export function ruleText(settings: ChoiceSettings, tileCount: number): string {
  const picks = `Pick ${settings.pick} task${settings.pick === 1 ? '' : 's'}`;
  if (!ruleApplies(settings, tileCount)) return `${picks}.`;
  if (settings.rule === 'each_column') return `${picks}, at least one from each column.`;
  return `${picks} that make a line: a row, a column or a diagonal.`;
}

export type RuleStatus = { met: boolean; need: string };

/** Whether a set of picks meets the board: the right number, and the rule. `need` says what to do next. */
export function ruleStatus(picks: readonly number[], tileCount: number, settings: ChoiceSettings): RuleStatus {
  const unique = [...new Set(picks)].filter((i) => i >= 0 && i < tileCount);
  const left = settings.pick - unique.length;
  if (ruleApplies(settings, tileCount) && settings.rule === 'each_column') {
    const columns = Math.min(settings.columns, tileCount);
    const missing: number[] = [];
    for (let c = 0; c < columns; c += 1) if (!unique.some((i) => tileColumn(i, settings.columns) === c)) missing.push(c + 1);
    const cols = `column${missing.length === 1 ? '' : 's'} ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}` : missing[0]}`;
    if (missing.length > left) return { met: false, need: `Swap a pick so every column has one: ${cols} still need${missing.length === 1 ? 's' : ''} one.` };
    if (missing.length && left === missing.length) return { met: false, need: `Pick from ${cols}.` };
  }
  if (ruleApplies(settings, tileCount) && settings.rule === 'line' && left <= 0 && !BOARD_LINES.some((line) => line.every((i) => unique.includes(i)))) {
    return { met: false, need: 'Make your picks a line: a row, a column or a diagonal.' };
  }
  if (left > 0) return { met: false, need: `Pick ${left} more.` };
  if (left < 0) return { met: false, need: `Keep ${settings.pick}: swap one out.` };
  return { met: true, need: '' };
}

/** A tile can be added while there is room; the rule is checked as a whole. */
export function canAdd(picks: readonly number[], settings: ChoiceSettings): boolean {
  return picks.length < settings.pick;
}

export type ChoicePattern = 'lowest' | 'highest' | 'mixed';

/**
 * A student's pattern across the tiers on offer: every pick at the lowest
 * level, every pick at the highest, or a mix. Needs two picks and two levels.
 */
export function choicePattern(pickedTiers: readonly number[], offeredTiers: readonly number[]): ChoicePattern | null {
  const offered = [...new Set(offeredTiers)];
  if (pickedTiers.length < 2 || offered.length < 2) return null;
  const low = Math.min(...offered);
  const high = Math.max(...offered);
  if (pickedTiers.every((t) => t === low)) return 'lowest';
  if (pickedTiers.every((t) => t === high)) return 'highest';
  return 'mixed';
}

/** How many students picked each tile. */
export function pickCounts(allPicks: ReadonlyArray<readonly number[]>, tileCount: number): number[] {
  const counts = Array.from({ length: tileCount }, () => 0);
  for (const picks of allPicks) for (const i of new Set(picks)) if (i >= 0 && i < tileCount) counts[i]! += 1;
  return counts;
}

/** The board's settings with defaults filled in and the pick count kept within the tiles. */
export function choiceSettings(given: Partial<ChoiceSettings> | undefined, tileCount: number): ChoiceSettings {
  const pick = Math.max(1, Math.min(Math.round(given?.pick ?? 3), Math.max(1, tileCount)));
  const columns = Math.max(2, Math.min(Math.round(given?.columns ?? 3), 4));
  const rule: ChoiceRule = given?.rule === 'each_column' || given?.rule === 'line' ? given.rule : 'none';
  return { pick, columns, rule };
}

/** How hard a finished task felt, 1 to 3. */
export const RATING_NAMES = ['Easy', 'About right', 'Hard'] as const;

export function ratingName(rating: number | undefined): string {
  return rating ? RATING_NAMES[rating - 1] ?? '' : '';
}

/** One pick as a student's device sends it. `index` is the tile's place when sent; `tab` is the panel id. */
export type ChoicePickRecord = {
  tab: string;
  index: number;
  tier: number;
  reason: string;
  started: boolean;
  finished: boolean;
  rating?: number;
  learned?: string;
};

export type ChoiceData = { picks: ChoicePickRecord[] };

/** Reads a stored or sent record defensively: unknown fields dropped, bad picks skipped. */
export function cleanChoiceData(raw: unknown): ChoiceData {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { picks?: unknown }).picks) ? (raw as { picks: unknown[] }).picks : [];
  const picks: ChoicePickRecord[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    if (typeof p.tab !== 'string' || !p.tab) continue;
    const rating = typeof p.rating === 'number' && p.rating >= 1 && p.rating <= 3 ? Math.round(p.rating) : undefined;
    picks.push({
      tab: p.tab,
      index: typeof p.index === 'number' ? p.index : -1,
      tier: typeof p.tier === 'number' ? p.tier : 1,
      reason: typeof p.reason === 'string' ? p.reason : '',
      started: p.started === true,
      finished: p.finished === true,
      ...(rating ? { rating } : {}),
      ...(typeof p.learned === 'string' && p.learned ? { learned: p.learned } : {})
    });
  }
  return { picks };
}

/** Where a sent pick sits on the board now: by panel id first, then by its place when sent. */
export function pickTileIndex(pick: Pick<ChoicePickRecord, 'tab' | 'index'>, tabIds: readonly string[]): number {
  const byId = tabIds.indexOf(pick.tab);
  if (byId >= 0) return byId;
  return pick.index >= 0 && pick.index < tabIds.length ? pick.index : -1;
}

/** The teacher's words for a pattern, naming the level on offer; mixed needs no flag. */
export function patternText(pattern: ChoicePattern | null, offeredTiers: readonly number[]): string {
  if (!pattern || pattern === 'mixed' || !offeredTiers.length) return '';
  const tier = pattern === 'lowest' ? Math.min(...offeredTiers) : Math.max(...offeredTiers);
  return `Took ${tierName(tier)} every time`;
}

/**
 * Why adding a tile would leave the rule out of reach, or '' when it is fine.
 * Each column: the columns still empty must fit in the picks left. A line:
 * some row, column or diagonal must still be completable with the picks left.
 */
export function pickProblem(picks: readonly number[], index: number, tileCount: number, settings: ChoiceSettings): string {
  if (!canAdd(picks, settings) || !ruleApplies(settings, tileCount)) return '';
  const next = [...new Set([...picks, index])];
  const left = settings.pick - next.length;
  if (settings.rule === 'each_column') {
    const columns = Math.min(settings.columns, tileCount);
    const missing: number[] = [];
    for (let c = 0; c < columns; c += 1) if (!next.some((i) => tileColumn(i, settings.columns) === c)) missing.push(c + 1);
    if (missing.length > left) {
      const cols = missing.length === 1 ? `column ${missing[0]}` : `columns ${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
      return `Pick from ${cols} next, so every column has one.`;
    }
    return '';
  }
  const reachable = BOARD_LINES.some((line) => line.filter((i) => !next.includes(i)).length <= left);
  return reachable ? '' : 'Pick a task that lines up with your others: a row, a column or a diagonal.';
}
