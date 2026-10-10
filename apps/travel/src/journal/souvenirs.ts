import type { JournalDocument } from '@/api/journal';
import type { JournalDeletedMeta, JournalLifecycle, JournalMoment } from '@/journal/types';

/** Object-moment collection — derived records, not burned into media bytes. */
export const JOURNAL_SOUVENIRS_PREF_KEY = 'journal_souvenirs_v1';

export const SOUVENIR_MOMENT_DELETE_RULE =
  'Deleting a moment also removes souvenirs linked to that moment (or its photos) from your collection. Restore the moment from Trash to bring them back. Souvenirs with no moment link stay in the collection.';

export interface JournalSouvenir extends JournalDeletedMeta {
  id: string;
  title: string;
  note?: string;
  moment_id?: string;
  media_id?: string;
  lifecycle: JournalLifecycle;
  created_at: string;
}

export type JournalSouvenirsMap = Record<string, JournalSouvenir>;

function newSouvenirId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = 'sv_';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function isLiveSouvenir(row: JournalSouvenir): boolean {
  return row.lifecycle === 'live';
}

export function parseJournalSouvenir(raw: unknown): JournalSouvenir | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  if (!id || !title) return null;
  const lifecycle =
    row.lifecycle === 'deleted' || row.lifecycle === 'archived' || row.lifecycle === 'live'
      ? row.lifecycle
      : 'live';
  const created_at =
    typeof row.created_at === 'string' && row.created_at.trim()
      ? row.created_at.trim()
      : new Date(0).toISOString();
  const note = typeof row.note === 'string' && row.note.trim() ? row.note.trim() : undefined;
  const moment_id =
    typeof row.moment_id === 'string' && row.moment_id.trim() ? row.moment_id.trim() : undefined;
  const media_id =
    typeof row.media_id === 'string' && row.media_id.trim() ? row.media_id.trim() : undefined;
  const deleted_at = typeof row.deleted_at === 'string' ? row.deleted_at : undefined;
  const deleted_with =
    typeof row.deleted_with === 'string' && row.deleted_with.trim()
      ? row.deleted_with.trim()
      : undefined;
  return {
    id,
    title,
    note,
    moment_id,
    media_id,
    lifecycle,
    created_at,
    deleted_at,
    deleted_with,
  };
}

export function readSouvenirsMap(journal: JournalDocument): JournalSouvenirsMap {
  const raw = journal.preferences?.[JOURNAL_SOUVENIRS_PREF_KEY];
  if (!raw || typeof raw !== 'object') return {};
  const map: JournalSouvenirsMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = parseJournalSouvenir(value);
    if (!parsed) continue;
    map[key] = { ...parsed, id: parsed.id || key };
  }
  return map;
}

export function listLiveSouvenirs(journal: JournalDocument): JournalSouvenir[] {
  return Object.values(readSouvenirsMap(journal))
    .filter(isLiveSouvenir)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function listSouvenirsForMoment(
  journal: JournalDocument,
  momentId: string,
  liveOnly = true,
): JournalSouvenir[] {
  return Object.values(readSouvenirsMap(journal)).filter((row) => {
    if (liveOnly && !isLiveSouvenir(row)) return false;
    return row.moment_id === momentId;
  });
}

export function countLiveSouvenirsForMoment(journal: JournalDocument, momentId: string): number {
  const moment = journal.moments.find((m) => m.id === momentId);
  if (!moment) return listSouvenirsForMoment(journal, momentId).length;
  const mediaIds = new Set(moment.media_ids);
  return Object.values(readSouvenirsMap(journal)).filter((row) => {
    if (!isLiveSouvenir(row)) return false;
    if (row.moment_id === momentId) return true;
    return row.media_id ? mediaIds.has(row.media_id) : false;
  }).length;
}

function writeSouvenirsMap(journal: JournalDocument, map: JournalSouvenirsMap): JournalDocument {
  return {
    ...journal,
    revision: journal.revision + 1,
    preferences: {
      ...journal.preferences,
      [JOURNAL_SOUVENIRS_PREF_KEY]: map,
    },
  };
}

export function defaultJournalSouvenir(partial: {
  title: string;
  note?: string;
  moment_id?: string;
  media_id?: string;
}): JournalSouvenir {
  return {
    id: newSouvenirId(),
    title: partial.title.trim(),
    note: partial.note?.trim() || undefined,
    moment_id: partial.moment_id,
    media_id: partial.media_id,
    lifecycle: 'live',
    created_at: new Date().toISOString(),
  };
}

export function upsertJournalSouvenir(
  journal: JournalDocument,
  souvenir: JournalSouvenir,
): JournalDocument {
  const parsed = parseJournalSouvenir(souvenir);
  if (!parsed || !parsed.title) return journal;
  const map = { ...readSouvenirsMap(journal), [parsed.id]: parsed };
  return writeSouvenirsMap(journal, map);
}

export function softDeleteJournalSouvenir(
  journal: JournalDocument,
  souvenirId: string,
  cascadeParentId?: string,
): JournalDocument {
  const map = { ...readSouvenirsMap(journal) };
  const row = map[souvenirId];
  if (!row || row.lifecycle === 'deleted') return journal;
  map[souvenirId] = {
    ...row,
    lifecycle: 'deleted',
    deleted_at: new Date().toISOString(),
    ...(cascadeParentId ? { deleted_with: cascadeParentId } : {}),
  };
  return writeSouvenirsMap(journal, map);
}

function reviveSouvenir(row: JournalSouvenir): JournalSouvenir {
  if (row.lifecycle !== 'deleted') return row;
  const { deleted_at: _da, deleted_with: _dw, ...rest } = row;
  return { ...rest, lifecycle: 'live' };
}

export function souvenirLinkedToMoment(row: JournalSouvenir, moment: JournalMoment): boolean {
  if (row.moment_id === moment.id) return true;
  if (row.media_id && moment.media_ids.includes(row.media_id)) return true;
  return false;
}

/** Soft-delete souvenirs tied to a deleted moment (restored with the moment). */
export function applySouvenirDeleteForMoment(
  journal: JournalDocument,
  moment: JournalMoment,
): JournalDocument {
  const map = { ...readSouvenirsMap(journal) };
  let changed = false;
  for (const [id, row] of Object.entries(map)) {
    if (!isLiveSouvenir(row)) continue;
    if (!souvenirLinkedToMoment(row, moment)) continue;
    map[id] = {
      ...row,
      lifecycle: 'deleted',
      deleted_at: new Date().toISOString(),
      deleted_with: moment.id,
    };
    changed = true;
  }
  return changed ? writeSouvenirsMap(journal, map) : journal;
}

export function applySouvenirRestoreForMoment(
  journal: JournalDocument,
  momentId: string,
): JournalDocument {
  const map = { ...readSouvenirsMap(journal) };
  let changed = false;
  for (const [id, row] of Object.entries(map)) {
    if (row.lifecycle !== 'deleted' || row.deleted_with !== momentId) continue;
    map[id] = reviveSouvenir(row);
    changed = true;
  }
  return changed ? writeSouvenirsMap(journal, map) : journal;
}

export function formatSouvenirListLabel(
  journal: JournalDocument,
  souvenir: JournalSouvenir,
): string {
  const bits = [souvenir.title];
  if (souvenir.note) bits.push(souvenir.note);
  if (souvenir.moment_id) {
    const moment = journal.moments.find((m) => m.id === souvenir.moment_id);
    if (moment?.place?.name) bits.push(moment.place.name);
  }
  return bits.join(' · ');
}
