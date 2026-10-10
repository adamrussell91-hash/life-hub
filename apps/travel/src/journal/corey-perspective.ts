import type { JournalDocument } from '@/api/journal';
import type { JournalMoment, JournalMomentAuthor } from '@/journal/types';

/** Agent-context integrity: Corey lines are coordination/perspective — not proven user state. */
export const COREY_PERSPECTIVE_AUTHORITY_RULE =
  "Corey's journal lines are a separate perspective lane. They are not authoritative user truth and must not override your corrections in digests or summaries.";

export const COREY_EXPORT_AUTHORSHIP_LABEL = "[Corey's perspective — not your words]";
export const ADAM_EXPORT_AUTHORSHIP_LABEL = '[Adam — your journal]';

export function parseMomentAuthor(raw: unknown): JournalMomentAuthor {
  return raw === 'corey' ? 'corey' : 'adam';
}

export function resolveMomentAuthor(moment: Pick<JournalMoment, 'author'>): JournalMomentAuthor {
  return parseMomentAuthor(moment.author);
}

export function isAuthoritativeUserMoment(moment: Pick<JournalMoment, 'author'>): boolean {
  return resolveMomentAuthor(moment) === 'adam';
}

export function formatAuthorshipExportLabel(author: JournalMomentAuthor): string {
  return author === 'corey' ? COREY_EXPORT_AUTHORSHIP_LABEL : ADAM_EXPORT_AUTHORSHIP_LABEL;
}

export function journalHasCoreyMoments(journal: JournalDocument): boolean {
  return journal.moments.some(
    (m) => m.lifecycle === 'live' && resolveMomentAuthor(m) === 'corey',
  );
}

export function filterMomentsForPerspectiveDisplay(
  moments: JournalMoment[],
  showCoreyPerspective: boolean,
): JournalMoment[] {
  if (showCoreyPerspective) return moments;
  return moments.filter((m) => isAuthoritativeUserMoment(m));
}

/** Moments safe to treat as owner truth for digests and agent context assembly. */
export function authoritativeLiveMoments(journal: JournalDocument): JournalMoment[] {
  return journal.moments.filter(
    (m) => m.lifecycle === 'live' && isAuthoritativeUserMoment(m),
  );
}

export function coreyPerspectiveVisibleStorageKey(tripId: string): string {
  return `lifehub.travel.journal.showCoreyPerspective.${tripId}`;
}

export function readCoreyPerspectiveVisible(tripId: string): boolean {
  try {
    const raw = localStorage.getItem(coreyPerspectiveVisibleStorageKey(tripId));
    if (raw === '0' || raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function writeCoreyPerspectiveVisible(tripId: string, visible: boolean): void {
  try {
    localStorage.setItem(coreyPerspectiveVisibleStorageKey(tripId), visible ? '1' : '0');
  } catch {
    /* ignore quota */
  }
}
