import type { RecentItem } from './types';

export const RECENT_STORAGE_KEY = 'teaching-hub.recent';
const MAX = 10;

export type { RecentItem };

function isRecentItem(value: unknown): value is RecentItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (v.type === 'lesson' || v.type === 'unit' || v.type === 'class') &&
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.opened_at === 'string'
  );
}

export function readRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentItem).slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecent(item: RecentItem): void {
  const next = [item, ...readRecent().filter((r) => !(r.type === item.type && r.id === item.id))].slice(
    0,
    MAX
  );
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}
