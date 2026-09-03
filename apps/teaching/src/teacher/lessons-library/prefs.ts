import type { LessonsDensity, LessonsViewMode, SavedLessonView } from './types';

const COLLAPSE_KEY = 'teaching-hub.lessons.collapsed-units';
const PIN_KEY = 'teaching-hub.lessons.pins';
const SAVED_KEY = 'teaching-hub.lessons.saved-views';
const VIEW_KEY = 'teaching-hub.lessons.view';
const DENSITY_KEY = 'teaching-hub.lessons.density';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode / quota
  }
}

export function readCollapsedUnits(): Set<string> {
  const ids = readJson<string[]>(COLLAPSE_KEY, []);
  return new Set(Array.isArray(ids) ? ids : []);
}

export function writeCollapsedUnits(ids: Set<string>): void {
  writeJson(COLLAPSE_KEY, [...ids]);
}

export function readPinnedIds(): Set<string> {
  const ids = readJson<string[]>(PIN_KEY, []);
  return new Set(Array.isArray(ids) ? ids : []);
}

export function writePinnedIds(ids: Set<string>): void {
  writeJson(PIN_KEY, [...ids]);
}

export function togglePinned(id: string): Set<string> {
  const next = readPinnedIds();
  if (next.has(id)) next.delete(id);
  else next.add(id);
  writePinnedIds(next);
  return next;
}

export function readSavedViews(): SavedLessonView[] {
  const views = readJson<SavedLessonView[]>(SAVED_KEY, []);
  return Array.isArray(views) ? views : [];
}

export function writeSavedViews(views: SavedLessonView[]): void {
  writeJson(SAVED_KEY, views);
}

export function readPreferredView(): LessonsViewMode | null {
  try {
    const value = localStorage.getItem(VIEW_KEY);
    if (value === 'library' || value === 'table' || value === 'map' || value === 'mine') return value;
  } catch {
    // ignore
  }
  return null;
}

export function writePreferredView(view: LessonsViewMode): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // ignore
  }
}

export function readPreferredDensity(): LessonsDensity | null {
  try {
    const value = localStorage.getItem(DENSITY_KEY);
    if (value === 'cards' || value === 'compact') return value;
  } catch {
    // ignore
  }
  return null;
}

export function writePreferredDensity(density: LessonsDensity): void {
  try {
    localStorage.setItem(DENSITY_KEY, density);
  } catch {
    // ignore
  }
}
