import type { Checkin, Item } from '@/types';

const NOT_MARKABLE = new Set(['flight', 'train', 'checkin_slot', 'med']);

/** Stops that can be marked safe for followers (locations, not tickets). */
export function canMarkSafe(item: Item): boolean {
  return !NOT_MARKABLE.has(item.kind) && !item.private;
}

/** Map of item_id → latest safe check-in. */
export function safeByItemId(checkins: Checkin[] | undefined): Map<string, Checkin> {
  const map = new Map<string, Checkin>();
  for (const c of checkins || []) {
    if (!c.item_id) continue;
    const prev = map.get(c.item_id);
    if (!prev || c.at > prev.at) map.set(c.item_id, c);
  }
  return map;
}

/** Latest stop-level check-in for an itinerary item, if any. */
export function latestSafeForItem(checkins: Checkin[] | undefined, itemId: string): Checkin | null {
  return safeByItemId(checkins).get(itemId) ?? null;
}

export function formatSafeTime(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone
    });
  } catch {
    return iso.slice(11, 16);
  }
}
