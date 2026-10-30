import type { JournalDocument } from '@/api/journal';
import type { JournalMoment, JournalMomentAuthor } from '@/journal/types';

/** Agent-context integrity: Partner lines are coordination/perspective — not proven user state. */
export const PARTNER_PERSPECTIVE_AUTHORITY_RULE =
  "Partner's journal lines are a separate perspective lane. They are not authoritative user truth and must not override your corrections in digests or summaries.";

export const PARTNER_EXPORT_AUTHORSHIP_LABEL = "[Partner's perspective — not your words]";
export const ADAM_EXPORT_AUTHORSHIP_LABEL = '[Adam — your journal]';

/**
 * Only a missing author or 'adam' is Adam's own words. Any other value,
 * including author ids saved before the rename to 'partner', is someone
 * else's perspective, so it can never pass as authoritative user truth.
 */
export function parseMomentAuthor(raw: unknown): JournalMomentAuthor {
  return raw === undefined || raw === null || raw === '' || raw === 'adam' ? 'adam' : 'partner';
}

export function resolveMomentAuthor(moment: Pick<JournalMoment, 'author'>): JournalMomentAuthor {
  return parseMomentAuthor(moment.author);
}

export function isAuthoritativeUserMoment(moment: Pick<JournalMoment, 'author'>): boolean {
  return resolveMomentAuthor(moment) === 'adam';
}

export function formatAuthorshipExportLabel(author: JournalMomentAuthor): string {
  return author === 'partner' ? PARTNER_EXPORT_AUTHORSHIP_LABEL : ADAM_EXPORT_AUTHORSHIP_LABEL;
}

export function journalHasPartnerMoments(journal: JournalDocument): boolean {
  return journal.moments.some(
    (m) => m.lifecycle === 'live' && resolveMomentAuthor(m) === 'partner',
  );
}

export function filterMomentsForPerspectiveDisplay(
  moments: JournalMoment[],
  showPartnerPerspective: boolean,
): JournalMoment[] {
  if (showPartnerPerspective) return moments;
  return moments.filter((m) => isAuthoritativeUserMoment(m));
}

/** Moments safe to treat as owner truth for digests and agent context assembly. */
export function authoritativeLiveMoments(journal: JournalDocument): JournalMoment[] {
  return journal.moments.filter(
    (m) => m.lifecycle === 'live' && isAuthoritativeUserMoment(m),
  );
}

export function partnerPerspectiveVisibleStorageKey(tripId: string): string {
  return `lifehub.travel.journal.showPartnerPerspective.${tripId}`;
}

export function readPartnerPerspectiveVisible(tripId: string): boolean {
  try {
    const raw = localStorage.getItem(partnerPerspectiveVisibleStorageKey(tripId));
    if (raw === '0' || raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function writePartnerPerspectiveVisible(tripId: string, visible: boolean): void {
  try {
    localStorage.setItem(partnerPerspectiveVisibleStorageKey(tripId), visible ? '1' : '0');
  } catch {
    /* ignore quota */
  }
}
