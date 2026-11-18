/**
 * Which postcards this browser has opened, per trip. Followers do not sign in, so this
 * is all there is: a new device, or cleared browser data, shows everything as new again.
 * When the browser refuses storage, nothing is marked new and everything else works.
 */
import type { PostcardView } from '@/postcard/model';

const key = (tripId: string): string => `travel.postcards.seen.${tripId}`;

/** The opened ids, or null when storage cannot be read. */
export function readSeen(tripId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(key(tripId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return null;
  }
}

export function markSeen(tripId: string, postcardId: string): void {
  const seen = readSeen(tripId);
  if (!seen || seen.has(postcardId)) return;
  seen.add(postcardId);
  try {
    localStorage.setItem(key(tripId), JSON.stringify([...seen]));
  } catch {
    /* private window or full storage: the count just stays where it is */
  }
}

/** The postcards this browser has not opened, oldest first. Empty when storage is unavailable. */
export function unseenPostcards(tripId: string, cards: PostcardView[]): PostcardView[] {
  const seen = readSeen(tripId);
  return seen ? cards.filter((card) => !seen.has(card.id)) : [];
}
