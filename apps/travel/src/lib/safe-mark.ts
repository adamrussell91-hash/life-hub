import type { Checkin, Item, Trip } from '@/types';

/** Stops that can be marked safe for followers (locations, not tickets). */
export function canMarkSafe(item: Item): boolean {
  if (item.kind === 'flight' || item.kind === 'train' || item.kind === 'checkin_slot' || item.kind === 'med') {
    return false;
  }
  if (item.private) return false;
  return true;
}

/** Latest stop-level check-in for an itinerary item, if any. */
export function latestSafeForItem(checkins: Checkin[] | undefined, itemId: string): Checkin | null {
  let best: Checkin | null = null;
  for (const c of checkins || []) {
    if (c.item_id !== itemId) continue;
    if (!best || c.at > best.at) best = c;
  }
  return best;
}

/** Map of item_id → latest safe check-in. */
export function safeByItemId(trip: Pick<Trip, 'checkins'> | { checkins?: Checkin[] }): Map<string, Checkin> {
  const map = new Map<string, Checkin>();
  for (const c of trip.checkins || []) {
    if (!c.item_id) continue;
    const prev = map.get(c.item_id);
    if (!prev || c.at > prev.at) map.set(c.item_id, c);
  }
  return map;
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
