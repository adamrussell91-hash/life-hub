/**
 * Shared focus across Tasks views (board / calendar / Gantt / timeline).
 * Calendar item ids are namespaced (`task:…`); Gantt uses bare ids — normalize here.
 */

export type FocusKind = 'task' | 'project' | 'milestone';

export type FocusRef = {
  type: FocusKind;
  id: string;
  /** Milestone calendar ids need the project for round-trips. */
  projectId?: string;
};

const STORAGE_KEY = 'tasks-hub:focus';

type Listener = (ref: FocusRef | null) => void;

let current: FocusRef | null = readStored();
const listeners = new Set<Listener>();

function readStored(): FocusRef | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return parseFocusParam(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStored(ref: FocusRef | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (!ref) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, serializeFocusParam(ref));
  } catch {
    /* private mode */
  }
}

export function focusEquals(a: FocusRef | null, b: FocusRef | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.type === b.type && a.id === b.id && (a.projectId ?? '') === (b.projectId ?? '');
}

/** `task:uuid` | `milestone:projectId:milestoneId` | bare uuid (treated as task). */
export function normalizeCalendarItemId(raw: string): FocusRef | null {
  const id = String(raw ?? '').trim();
  if (!id) return null;
  if (id.startsWith('task:')) {
    const taskId = id.slice('task:'.length).trim();
    return taskId ? { type: 'task', id: taskId } : null;
  }
  if (id.startsWith('milestone:')) {
    const rest = id.slice('milestone:'.length);
    const split = rest.indexOf(':');
    if (split <= 0) return null;
    const projectId = rest.slice(0, split).trim();
    const milestoneId = rest.slice(split + 1).trim();
    if (!projectId || !milestoneId) return null;
    return { type: 'milestone', id: milestoneId, projectId };
  }
  if (id.startsWith('key:')) return null;
  return { type: 'task', id };
}

export function calendarItemIdForFocus(ref: FocusRef): string | null {
  if (ref.type === 'task') return `task:${ref.id}`;
  if (ref.type === 'milestone' && ref.projectId) return `milestone:${ref.projectId}:${ref.id}`;
  return null;
}

export function parseFocusParam(raw: string | null | undefined): FocusRef | null {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const colon = text.indexOf(':');
  if (colon <= 0) return normalizeCalendarItemId(text);
  const type = text.slice(0, colon);
  const rest = text.slice(colon + 1);
  if (type === 'task' && rest) return { type: 'task', id: decodeURIComponent(rest) };
  if (type === 'project' && rest) return { type: 'project', id: decodeURIComponent(rest) };
  if (type === 'milestone' && rest) {
    const split = rest.indexOf(':');
    if (split > 0) {
      return {
        type: 'milestone',
        projectId: decodeURIComponent(rest.slice(0, split)),
        id: decodeURIComponent(rest.slice(split + 1))
      };
    }
    return { type: 'milestone', id: decodeURIComponent(rest) };
  }
  return normalizeCalendarItemId(text);
}

export function serializeFocusParam(ref: FocusRef): string {
  if (ref.type === 'milestone' && ref.projectId) {
    return `milestone:${encodeURIComponent(ref.projectId)}:${encodeURIComponent(ref.id)}`;
  }
  return `${ref.type}:${encodeURIComponent(ref.id)}`;
}

export function getFocus(): FocusRef | null {
  return current;
}

export function setFocus(ref: FocusRef | null, opts?: { persistUrl?: boolean }): void {
  if (focusEquals(current, ref)) {
    if (opts?.persistUrl) mergeFocusIntoHash(ref);
    return;
  }
  current = ref;
  writeStored(ref);
  if (opts?.persistUrl !== false) mergeFocusIntoHash(ref);
  for (const listener of listeners) listener(current);
}

export function subscribeFocus(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Merge or clear `focus=` on the current hash without dropping other query keys. */
export function mergeFocusIntoHash(ref: FocusRef | null, hash = typeof location !== 'undefined' ? location.hash : ''): string {
  const path = hash.replace(/^#\/?/, '').split('?')[0] || 'board';
  const query = new URLSearchParams(hash.split('?')[1] ?? '');
  if (ref) query.set('focus', serializeFocusParam(ref));
  else query.delete('focus');
  const qs = query.toString();
  const next = qs ? `#/${path}?${qs}` : `#/${path}`;
  if (typeof location !== 'undefined' && typeof history !== 'undefined' && location.hash !== next) {
    history.replaceState(null, '', next);
  }
  return next;
}

/** Hydrate from hash `focus=` (wins over session) once on paint. */
export function hydrateFocusFromHash(hash = typeof location !== 'undefined' ? location.hash : ''): FocusRef | null {
  const query = new URLSearchParams(hash.split('?')[1] ?? '');
  const fromHash = parseFocusParam(query.get('focus'));
  if (fromHash) {
    if (!focusEquals(current, fromHash)) {
      current = fromHash;
      writeStored(fromHash);
      for (const listener of listeners) listener(current);
    }
    return fromHash;
  }
  return current;
}

export function isFocusedTaskId(taskId: string): boolean {
  return current?.type === 'task' && current.id === taskId;
}
