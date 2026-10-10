import type { JournalDocument } from '@/api/journal';
import type {
  JournalDay,
  JournalLeg,
  JournalLifecycle,
  JournalMedia,
  JournalMoment,
} from '@/journal/types';
import { offerTimedUndo } from '../../design-kit/js/hub-feedback.js';
import { persistJournalPatch } from '@/journal/journal-sheet-save';

export const JOURNAL_UNDO_MS = 10_000;

export type JournalDeleteKind = 'moment' | 'day' | 'leg' | 'trip';

export interface DeleteImpact {
  moments: number;
  media: number;
  days: number;
  legs: number;
  transitions: number;
}

export interface DeleteTarget {
  kind: JournalDeleteKind;
  id: string;
}

function bumpRevision(journal: JournalDocument): JournalDocument {
  return { ...journal, revision: journal.revision + 1 };
}

function markDeleted<T extends { lifecycle: JournalLifecycle; deleted_with?: string }>(
  row: T,
  cascadeParentId?: string,
): T {
  if (row.lifecycle === 'deleted') return row;
  return {
    ...row,
    lifecycle: 'deleted',
    deleted_at: new Date().toISOString(),
    ...(cascadeParentId ? { deleted_with: cascadeParentId } : {}),
  };
}

function liveMomentsOnDay(journal: JournalDocument, day: JournalDay): JournalMoment[] {
  return journal.moments.filter(
    (m) =>
      m.lifecycle === 'live' && m.leg_id === day.leg_id && m.local_date === day.local_date,
  );
}

function mediaIdsForMoments(moments: JournalMoment[]): Set<string> {
  const ids = new Set<string>();
  for (const m of moments) for (const id of m.media_ids) ids.add(id);
  return ids;
}

function liveMomentReferences(journal: JournalDocument, mediaId: string): number {
  return journal.moments.filter(
    (m) => m.lifecycle === 'live' && m.media_ids.includes(mediaId),
  ).length;
}

function softDeleteMediaIfOrphan(
  journal: JournalDocument,
  mediaId: string,
  cascadeParentId?: string,
): JournalMedia | null {
  const media = journal.media.find((m) => m.id === mediaId);
  if (!media || media.lifecycle === 'deleted') return null;
  if (liveMomentReferences(journal, mediaId) > 0) return null;
  return markDeleted(media, cascadeParentId);
}

export function deleteImpactSummary(
  journal: JournalDocument,
  target: DeleteTarget,
): DeleteImpact {
  const empty: DeleteImpact = {
    moments: 0,
    media: 0,
    days: 0,
    legs: 0,
    transitions: 0,
  };
  if (target.kind === 'moment') {
    const moment = journal.moments.find((m) => m.id === target.id && m.lifecycle === 'live');
    if (!moment) return empty;
    return {
      ...empty,
      moments: 1,
      media: moment.media_ids.length,
    };
  }
  if (target.kind === 'day') {
    const day = journal.days.find((d) => d.id === target.id && d.lifecycle === 'live');
    if (!day) return empty;
    const moments = liveMomentsOnDay(journal, day);
    const mediaIds = mediaIdsForMoments(moments);
    return {
      ...empty,
      days: 1,
      moments: moments.length,
      media: mediaIds.size,
    };
  }
  if (target.kind === 'leg') {
    const leg = journal.legs.find((l) => l.id === target.id && l.lifecycle === 'live');
    if (!leg) return empty;
    const days = journal.days.filter((d) => d.lifecycle === 'live' && d.leg_id === leg.id);
    const moments = journal.moments.filter((m) => m.lifecycle === 'live' && m.leg_id === leg.id);
    const mediaIds = mediaIdsForMoments(moments);
    const transitions = journal.transitions.filter(
      (t) =>
        t.lifecycle === 'live' &&
        (t.from_leg_id === leg.id || t.to_leg_id === leg.id),
    );
    return {
      moments: moments.length,
      media: mediaIds.size,
      days: days.length,
      legs: 1,
      transitions: transitions.length,
    };
  }
  if (target.kind === 'trip') {
    const moments = journal.moments.filter((m) => m.lifecycle === 'live');
    const mediaIds = mediaIdsForMoments(moments);
    return {
      moments: moments.length,
      media: mediaIds.size,
      days: journal.days.filter((d) => d.lifecycle === 'live').length,
      legs: journal.legs.filter((l) => l.lifecycle === 'live').length,
      transitions: journal.transitions.filter((t) => t.lifecycle === 'live').length,
    };
  }
  return empty;
}

export function impactConfirmCopy(target: DeleteTarget, impact: DeleteImpact): string {
  if (target.kind === 'moment') {
    return 'Delete this moment? You can undo for 10 seconds or restore it from Trash.';
  }
  if (target.kind === 'day') {
    return `Delete this day from your journal? This removes ${impact.moments} moment${
      impact.moments === 1 ? '' : 's'
    } and ${impact.media} photo${impact.media === 1 ? '' : 's'}. Your itinerary bookings are not changed.`;
  }
  if (target.kind === 'leg') {
    return `Delete this leg from your journal? This removes ${impact.days} day${
      impact.days === 1 ? '' : 's'
    }, ${impact.moments} moment${impact.moments === 1 ? '' : 's'}, and ${impact.media} photo${
      impact.media === 1 ? '' : 's'
    }. This does not cancel flights, hotels, or other bookings.`;
  }
  return `Delete this entire trip journal? ${impact.legs} leg${impact.legs === 1 ? '' : 's'}, ${
    impact.moments
  } moment${impact.moments === 1 ? '' : 's'}, and ${impact.media} photo${
    impact.media === 1 ? '' : 's'
  } move to Trash. Your travel itinerary and bookings stay as they are.`;
}

export function applySoftDelete(
  journal: JournalDocument,
  target: DeleteTarget,
): JournalDocument {
  let next = journal;
  if (target.kind === 'moment') {
    const moment = next.moments.find((m) => m.id === target.id && m.lifecycle === 'live');
    if (!moment) return journal;
    const moments = next.moments.map((m) => (m.id === target.id ? markDeleted(m) : m));
    let media = next.media;
    for (const mediaId of moment.media_ids) {
      const patched = softDeleteMediaIfOrphan({ ...next, moments }, mediaId);
      if (patched) {
        media = media.map((row) => (row.id === mediaId ? patched : row));
      }
    }
    next = { ...next, moments, media };
    return bumpRevision(next);
  }

  if (target.kind === 'day') {
    const day = next.days.find((d) => d.id === target.id && d.lifecycle === 'live');
    if (!day) return journal;
    const cascade = day.id;
    const momentsOnDay = liveMomentsOnDay(next, day);
    const moments = next.moments.map((m) => {
      if (m.lifecycle !== 'live') return m;
      if (m.leg_id === day.leg_id && m.local_date === day.local_date) {
        return markDeleted(m, cascade);
      }
      return m;
    });
    let media = next.media;
    for (const id of mediaIdsForMoments(momentsOnDay)) {
      const patched = softDeleteMediaIfOrphan({ ...next, moments }, id, cascade);
      if (patched) media = media.map((row) => (row.id === id ? patched : row));
    }
    const days = next.days.map((d) => (d.id === target.id ? markDeleted(d) : d));
    next = { ...next, moments, media, days };
    return bumpRevision(next);
  }

  if (target.kind === 'leg') {
    const leg = next.legs.find((l) => l.id === target.id && l.lifecycle === 'live');
    if (!leg) return journal;
    const cascade = leg.id;
    const moments = next.moments.map((m) =>
      m.lifecycle === 'live' && m.leg_id === leg.id ? markDeleted(m, cascade) : m,
    );
    let media = next.media;
    for (const m of next.moments.filter((row) => row.leg_id === leg.id && row.lifecycle === 'live')) {
      for (const id of m.media_ids) {
        const patched = softDeleteMediaIfOrphan({ ...next, moments }, id, cascade);
        if (patched) media = media.map((row) => (row.id === id ? patched : row));
      }
    }
    const days = next.days.map((d) =>
      d.lifecycle === 'live' && d.leg_id === leg.id ? markDeleted(d, cascade) : d,
    );
    const transitions = next.transitions.map((t) =>
      t.lifecycle === 'live' && (t.from_leg_id === leg.id || t.to_leg_id === leg.id)
        ? markDeleted(t, cascade)
        : t,
    );
    const legs = next.legs.map((l) => (l.id === target.id ? markDeleted(l) : l));
    const leg_ids = next.leg_ids.filter((id) => id !== target.id);
    next = { ...next, moments, media, days, transitions, legs, leg_ids };
    return bumpRevision(next);
  }

  if (target.kind === 'trip') {
    const cascade = next.id;
    next = {
      ...next,
      lifecycle: 'deleted',
      deleted_at: new Date().toISOString(),
      legs: next.legs.map((l) => (l.lifecycle === 'live' ? markDeleted(l, cascade) : l)),
      days: next.days.map((d) => (d.lifecycle === 'live' ? markDeleted(d, cascade) : d)),
      moments: next.moments.map((m) => (m.lifecycle === 'live' ? markDeleted(m, cascade) : m)),
      media: next.media.map((m) => (m.lifecycle === 'live' ? markDeleted(m, cascade) : m)),
      transitions: next.transitions.map((t) =>
        t.lifecycle === 'live' ? markDeleted(t, cascade) : t,
      ),
      leg_ids: [],
    };
    return bumpRevision(next);
  }

  return journal;
}

function reviveRow<T extends { lifecycle: JournalLifecycle; deleted_at?: string; deleted_with?: string }>(
  row: T,
): T {
  if (row.lifecycle !== 'deleted') return row;
  const { deleted_at: _da, deleted_with: _dw, ...rest } = row;
  return { ...rest, lifecycle: 'live' };
}

function reviveCascade<T extends { lifecycle: JournalLifecycle; deleted_with?: string }>(
  row: T,
  parentId: string,
): T {
  if (row.lifecycle !== 'deleted' || row.deleted_with !== parentId) return row;
  return reviveRow(row);
}

export function applyRestore(
  journal: JournalDocument,
  target: DeleteTarget,
): JournalDocument {
  if (target.kind === 'moment') {
    const moment = journal.moments.find((m) => m.id === target.id);
    if (!moment || moment.lifecycle === 'live') return journal;
    const moments = journal.moments.map((m) => (m.id === target.id ? reviveRow(m) : m));
    const revived = moments.find((m) => m.id === target.id)!;
    let media = journal.media;
    for (const mediaId of revived.media_ids) {
      const row = media.find((m) => m.id === mediaId);
      if (row?.lifecycle === 'deleted' && !row.deleted_with) {
        media = media.map((m) => (m.id === mediaId ? reviveRow(m) : m));
      }
    }
    return bumpRevision({ ...journal, moments, media });
  }

  if (target.kind === 'day') {
    const day = journal.days.find((d) => d.id === target.id);
    if (!day || day.lifecycle === 'live') return journal;
    const days = journal.days.map((d) => (d.id === target.id ? reviveRow(d) : d));
    const moments = journal.moments.map((m) => reviveCascade(m, target.id));
    let media = journal.media.map((m) => reviveCascade(m, target.id));
    return bumpRevision({ ...journal, days, moments, media });
  }

  if (target.kind === 'leg') {
    const leg = journal.legs.find((l) => l.id === target.id);
    if (!leg || leg.lifecycle === 'live') return journal;
    const legs = journal.legs.map((l) => (l.id === target.id ? reviveRow(l) : l));
    const leg_ids = [...journal.leg_ids];
    if (!leg_ids.includes(target.id)) {
      leg_ids.push(target.id);
      leg_ids.sort(
        (a, b) =>
          (legs.find((l) => l.id === a)?.order ?? 0) - (legs.find((l) => l.id === b)?.order ?? 0),
      );
    }
    const days = journal.days.map((d) => reviveCascade(d, target.id));
    const moments = journal.moments.map((m) => reviveCascade(m, target.id));
    const transitions = journal.transitions.map((t) => reviveCascade(t, target.id));
    const media = journal.media.map((m) => reviveCascade(m, target.id));
    return bumpRevision({ ...journal, legs, leg_ids, days, moments, transitions, media });
  }

  if (target.kind === 'trip') {
    if (journal.lifecycle === 'live') return journal;
    const cascade = journal.id;
    const legs = journal.legs.map((l) => reviveCascade(l, cascade));
    const leg_ids = legs.filter((l) => l.lifecycle === 'live').map((l) => l.id);
    return bumpRevision({
      ...journal,
      lifecycle: 'live',
      legs,
      leg_ids,
      days: journal.days.map((d) => reviveCascade(d, cascade)),
      moments: journal.moments.map((m) => reviveCascade(m, cascade)),
      media: journal.media.map((m) => reviveCascade(m, cascade)),
      transitions: journal.transitions.map((t) => reviveCascade(t, cascade)),
    });
  }

  return journal;
}

export function applyPermanentDelete(
  journal: JournalDocument,
  target: DeleteTarget,
): { journal: JournalDocument; purgeMediaIds: string[] } {
  const purgeMediaIds: string[] = [];

  const maybePurgeMedia = (mediaId: string, draft: JournalDocument) => {
    if (liveMomentReferences(draft, mediaId) > 0) return;
    const row = draft.media.find((m) => m.id === mediaId);
    if (!row || row.lifecycle !== 'deleted') return;
    purgeMediaIds.push(mediaId);
  };

  if (target.kind === 'moment') {
    const moment = journal.moments.find((m) => m.id === target.id);
    if (!moment) return { journal, purgeMediaIds };
    const mediaIds = [...moment.media_ids];
    let next: JournalDocument = {
      ...journal,
      moments: journal.moments.filter((m) => m.id !== target.id),
    };
    for (const id of mediaIds) maybePurgeMedia(id, next);
    next = {
      ...next,
      media: next.media.filter((m) => !purgeMediaIds.includes(m.id)),
    };
    return { journal: bumpRevision(next), purgeMediaIds };
  }

  if (target.kind === 'day') {
    const day = journal.days.find((d) => d.id === target.id);
    if (!day) return { journal, purgeMediaIds };
    const doomed = journal.moments.filter(
      (m) => m.leg_id === day.leg_id && m.local_date === day.local_date && m.lifecycle === 'deleted',
    );
    let next: JournalDocument = {
      ...journal,
      days: journal.days.filter((d) => d.id !== target.id),
      moments: journal.moments.filter(
        (m) => !(m.leg_id === day.leg_id && m.local_date === day.local_date && m.lifecycle === 'deleted'),
      ),
    };
    for (const m of doomed) for (const id of m.media_ids) maybePurgeMedia(id, next);
    next = { ...next, media: next.media.filter((m) => !purgeMediaIds.includes(m.id)) };
    return { journal: bumpRevision(next), purgeMediaIds };
  }

  if (target.kind === 'leg') {
    const legId = target.id;
    const doomedMoments = journal.moments.filter((m) => m.leg_id === legId && m.lifecycle === 'deleted');
    let next: JournalDocument = {
      ...journal,
      legs: journal.legs.filter((l) => l.id !== legId),
      leg_ids: journal.leg_ids.filter((id) => id !== legId),
      days: journal.days.filter((d) => d.leg_id !== legId || d.lifecycle !== 'deleted'),
      moments: journal.moments.filter((m) => m.leg_id !== legId || m.lifecycle !== 'deleted'),
      transitions: journal.transitions.filter(
        (t) =>
          !(
            t.lifecycle === 'deleted' &&
            (t.from_leg_id === legId || t.to_leg_id === legId)
          ),
      ),
    };
    for (const m of doomedMoments) for (const id of m.media_ids) maybePurgeMedia(id, next);
    next = { ...next, media: next.media.filter((m) => !purgeMediaIds.includes(m.id)) };
    return { journal: bumpRevision(next), purgeMediaIds };
  }

  return { journal, purgeMediaIds };
}

export const PERMANENT_DELETE_EXPLAINER =
  'Permanent delete removes journal originals from storage when nothing live still references them. This cannot be undone.';

export async function commitJournalDelete(
  tripId: string,
  version: string,
  journal: JournalDocument,
): Promise<{ journal: JournalDocument; version: string }> {
  return persistJournalPatch(tripId, version, journal);
}

export function runMomentDeleteWithUndo(options: {
  tripId: string;
  version: string;
  journal: JournalDocument;
  momentId: string;
  momentLabel: string;
  onSaved: (envelope: { journal: JournalDocument; version: string }) => void;
}): void {
  const target: DeleteTarget = { kind: 'moment', id: options.momentId };
  const before = options.journal;
  const afterDelete = applySoftDelete(before, target);

  void (async () => {
    const saved = await commitJournalDelete(options.tripId, options.version, afterDelete);
    options.onSaved(saved);
    offerTimedUndo({
      message: `Deleted “${options.momentLabel}”`,
      durationMs: JOURNAL_UNDO_MS,
      onUndo: () => {
        void (async () => {
          const restored = applyRestore(saved.journal, target);
          const undone = await commitJournalDelete(options.tripId, saved.version, restored);
          options.onSaved(undone);
        })();
      },
      onCommit: () => {},
    });
  })();
}
