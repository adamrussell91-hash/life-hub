/**
 * Diamond 9 maths, kept pure for tests. Slots run top to bottom, left to
 * right: slot 0 is the top of the diamond, slot 8 the bottom. Rows are
 * 1-2-3-2-1, so row 0 is "most" and row 4 "least".
 */

export const DIAMOND_ROWS = [1, 2, 3, 2, 1] as const;
export const SLOT_COUNT = 9;
/** A student's own card, swapped in for one of the teacher's. */
export const WILD_ID = 'wild';
export const TOP_SLOT = 0;
export const BOTTOM_SLOT = 8;

export type Slots = Array<string | null>;

/** The row (0 top to 4 bottom) a slot sits in. */
export function slotRow(slot: number): number {
  let start = 0;
  for (let row = 0; row < DIAMOND_ROWS.length; row += 1) {
    start += DIAMOND_ROWS[row]!;
    if (slot < start) return row;
  }
  return DIAMOND_ROWS.length - 1;
}

/** The slots in one row, left to right. */
export function rowSlots(row: number): number[] {
  const start = DIAMOND_ROWS.slice(0, row).reduce<number>((a, b) => a + b, 0);
  return Array.from({ length: DIAMOND_ROWS[row] ?? 0 }, (_, i) => start + i);
}

export function emptySlots(): Slots {
  return Array.from({ length: SLOT_COUNT }, () => null);
}

/** Nine slots, each a card id or empty: anything else becomes empty. */
export function cleanSlots(value: unknown): Slots {
  const slots = emptySlots();
  if (!Array.isArray(value)) return slots;
  const seen = new Set<string>();
  value.slice(0, SLOT_COUNT).forEach((id, i) => {
    if (typeof id === 'string' && id && !seen.has(id)) {
      seen.add(id);
      slots[i] = id;
    }
  });
  return slots;
}

export function isComplete(slots: Slots): boolean {
  return slots.length === SLOT_COUNT && slots.every((id) => !!id) && new Set(slots).size === SLOT_COUNT;
}

/**
 * Puts a card in a slot. A card already on the diamond swaps with whatever is
 * in the target; a card from the tray pushes the occupant back to the tray.
 */
export function placeCard(slots: Slots, cardId: string, slot: number): Slots {
  if (slot < 0 || slot >= SLOT_COUNT) return slots;
  const next = [...slots];
  const from = next.indexOf(cardId);
  const occupant = next[slot] ?? null;
  if (from === slot) return next;
  if (from >= 0) next[from] = occupant;
  next[slot] = cardId;
  return next;
}

export function clearSlot(slots: Slots, slot: number): Slots {
  const next = [...slots];
  if (slot >= 0 && slot < SLOT_COUNT) next[slot] = null;
  return next;
}

/** Each placed card's row. */
export function cardRows(slots: Slots): Record<string, number> {
  const rows: Record<string, number> = {};
  slots.forEach((id, slot) => {
    if (id) rows[id] = slotRow(slot);
  });
  return rows;
}

export type CardStat = { id: string; n: number; mean: number; spread: number; rows: number[] };

/** Mean row and spread (population standard deviation) for each card, across every layout that places it. */
export function consensus(layouts: ReadonlyArray<Slots | string[]>, cardIds: readonly string[]): CardStat[] {
  return cardIds.map((id) => {
    const rows: number[] = [];
    for (const layout of layouts) {
      const slot = layout.indexOf(id);
      if (slot >= 0 && slot < SLOT_COUNT) rows.push(slotRow(slot));
    }
    const n = rows.length;
    const mean = n ? rows.reduce((a, b) => a + b, 0) / n : 0;
    const spread = n ? Math.sqrt(rows.reduce((a, r) => a + (r - mean) ** 2, 0) / n) : 0;
    return { id, n, mean, spread, rows };
  });
}

/** The class diamond: cards in order of mean row, the closest-agreed first among ties. Unplaced cards go last. */
export function consensusSlots(stats: readonly CardStat[]): Slots {
  const order = stats
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      if (!a.s.n !== !b.s.n) return a.s.n ? -1 : 1;
      return a.s.mean - b.s.mean || a.s.spread - b.s.spread || a.i - b.i;
    })
    .map(({ s }) => s.id);
  const slots = emptySlots();
  order.slice(0, SLOT_COUNT).forEach((id, i) => {
    slots[i] = id;
  });
  return slots;
}

/** The cards the class disagrees on most: highest spread, placed by at least `min` students. */
export function contested(stats: readonly CardStat[], options: { min?: number; count?: number } = {}): CardStat[] {
  const min = options.min ?? 3;
  const count = options.count ?? 3;
  return stats
    .filter((s) => s.n >= min && s.spread > 0)
    .sort((a, b) => b.spread - a.spread || a.mean - b.mean)
    .slice(0, count);
}

export type RankedStudent = { initials: string; slots: Slots | string[]; reasons?: Record<string, string> };
export type Outlier = { initials: string; row: number; gap: number; reason: string };

/** Students whose row for a card is furthest from the class mean (at least `minGap` rows), with any reason they wrote. */
export function outliers(students: readonly RankedStudent[], stat: CardStat, minGap = 2): Outlier[] {
  const out: Outlier[] = [];
  for (const s of students) {
    const slot = s.slots.indexOf(stat.id);
    if (slot < 0) continue;
    const row = slotRow(slot);
    const gap = Math.abs(row - stat.mean);
    if (gap + 1e-9 >= minGap) out.push({ initials: s.initials, row, gap, reason: (s.reasons?.[stat.id] ?? '').trim() });
  }
  return out.sort((a, b) => b.gap - a.gap || (b.reason ? 1 : 0) - (a.reason ? 1 : 0));
}

/** How far each card moved between two rounds: positive means it moved up the diamond. */
export function movement(before: Slots | string[], after: Slots | string[]): Record<string, number> {
  const was = cardRows(before as Slots);
  const now = cardRows(after as Slots);
  const moved: Record<string, number> = {};
  for (const [id, row] of Object.entries(now)) {
    if (id in was) moved[id] = was[id]! - row;
  }
  return moved;
}

/** Cards that moved two rows or more: each one asks "What changed your mind?". */
export function needsWhy(moved: Record<string, number>, threshold = 2): string[] {
  return Object.entries(moved).filter(([, d]) => Math.abs(d) >= threshold).map(([id]) => id);
}

/** The ends of the diamond, which need a written reason. */
export function endCards(slots: Slots): { top: string | null; bottom: string | null } {
  return { top: slots[TOP_SLOT] ?? null, bottom: slots[BOTTOM_SLOT] ?? null };
}

/** What a round still needs before it can be sent: every slot filled, the end reasons, and a why for every big move. */
export function roundGaps(slots: Slots, reasons: Record<string, string>, whyChanged?: { moved: Record<string, number>; why: Record<string, string> }): string[] {
  const gaps: string[] = [];
  const empty = slots.filter((id) => !id).length;
  if (empty) gaps.push(`Place ${empty} more card${empty === 1 ? '' : 's'}`);
  const { top, bottom } = endCards(slots);
  if (top && !reasons[top]?.trim()) gaps.push('Say why your top card is at the top');
  if (bottom && !reasons[bottom]?.trim()) gaps.push('Say why your bottom card is at the bottom');
  if (whyChanged) {
    const missing = needsWhy(whyChanged.moved).filter((id) => !whyChanged.why[id]?.trim()).length;
    if (missing) gaps.push(`Say what changed your mind for ${missing} card${missing === 1 ? '' : 's'}`);
  }
  return gaps;
}

/** Cards whose class mean shifted most between two criteria. */
export function criterionShift(first: readonly CardStat[], second: readonly CardStat[]): Array<{ id: string; from: number; to: number; shift: number }> {
  const byId = new Map(second.map((s) => [s.id, s]));
  return first
    .filter((s) => s.n && byId.get(s.id)?.n)
    .map((s) => ({ id: s.id, from: s.mean, to: byId.get(s.id)!.mean, shift: s.mean - byId.get(s.id)!.mean }))
    .sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));
}

/** Rows as words for students: row 0 is the top. */
export function rowName(row: number): string {
  return ['Top', 'Second row', 'Middle row', 'Fourth row', 'Bottom'][row] ?? '';
}
