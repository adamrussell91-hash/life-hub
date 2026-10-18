import type { JournalDocument } from '@/api/journal';
import type { JournalFixture } from '@/journal/types';

export function bootstrapLegId(tripId: string): string {
  const slug = tripId.replace(/^trp_/, '').slice(0, 48) || 'main';
  return `leg_bootstrap_${slug}`;
}

function makeDayId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `day_${out}`;
}

/** True when the journal has no backed-up story content yet (no moments or media). */
export function isJournalStoryEmpty(fixture: JournalFixture): boolean {
  const liveMoments = fixture.moments.filter((m) => m.lifecycle === 'live');
  const liveMedia = fixture.media.filter((m) => m.lifecycle === 'live');
  return liveMoments.length === 0 && liveMedia.length === 0;
}

function todayLocalIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function resolveCaptureContext(
  fixture: JournalFixture,
  dayId?: string,
): { legId: string; localDate: string } | null {
  if (dayId) {
    const day = fixture.days.find((d) => d.id === dayId);
    if (day) return { legId: day.leg_id, localDate: day.local_date };
  }
  // Mid-trip, "Add moment" means today, not the first day of the trip.
  const today = todayLocalIso();
  const todayDay = fixture.days.find((d) => d.lifecycle === 'live' && d.local_date === today);
  if (todayDay) return { legId: todayDay.leg_id, localDate: today };
  const todayLeg = fixture.legs.find(
    (l) =>
      l.lifecycle === 'live' &&
      l.start_date &&
      l.end_date &&
      l.start_date <= today &&
      today <= l.end_date,
  );
  if (todayLeg) return { legId: todayLeg.id, localDate: today };
  const empty = fixture.days.find((d) => d.empty_marker);
  if (empty) return { legId: empty.leg_id, localDate: empty.local_date };
  const firstDay = [...fixture.days].sort((a, b) => a.local_date.localeCompare(b.local_date))[0];
  if (firstDay) return { legId: firstDay.leg_id, localDate: firstDay.local_date };
  const firstLeg = [...fixture.legs].sort((a, b) => a.order - b.order)[0];
  if (firstLeg?.start_date) return { legId: firstLeg.id, localDate: firstLeg.start_date };
  if (isJournalStoryEmpty(fixture)) {
    return { legId: bootstrapLegId(fixture.trip_id), localDate: todayLocalIso() };
  }
  return null;
}

/** Adds a minimal leg + day when saving the first moment on an empty journal. */
export function bootstrapJournalForFirstMoment(
  journal: JournalDocument,
  legId: string,
  localDate: string,
  destination = 'Trip',
): JournalDocument {
  if (journal.legs.some((l) => l.lifecycle === 'live')) {
    return journal;
  }
  const dayId = makeDayId();
  const leg = {
    id: legId,
    trip_id: journal.trip_id,
    pattern_id: 'neutral',
    destination,
    timezone: 'UTC',
    order: 0,
    lifecycle: 'live' as const,
    start_date: localDate,
    end_date: localDate,
  };
  const day = {
    id: dayId,
    leg_id: legId,
    local_date: localDate,
    lifecycle: 'live' as const,
    empty_marker: true,
  };
  return {
    ...journal,
    leg_ids: [legId],
    legs: [leg],
    days: [day],
  };
}

/**
 * The story is drawn day by day, so a live moment whose (leg, date) has no
 * live day row would be saved but never shown. Add (or revive) the day, and
 * clear the "no moments yet" marker on days that now have moments.
 */
export function ensureMomentDays(journal: JournalDocument): JournalDocument {
  let days = journal.days;
  let changed = false;
  for (const moment of journal.moments) {
    if (moment.lifecycle !== 'live') continue;
    const matches = days.filter(
      (d) => d.leg_id === moment.leg_id && d.local_date === moment.local_date,
    );
    const live = matches.find((d) => d.lifecycle === 'live');
    if (live) {
      if (live.empty_marker) {
        days = days.map((d) => (d === live ? { ...d, empty_marker: false } : d));
        changed = true;
      }
      continue;
    }
    const deleted = matches[0];
    if (deleted) {
      days = days.map((d) =>
        d === deleted
          ? { ...d, lifecycle: 'live' as const, deleted_at: undefined, deleted_with: undefined }
          : d,
      );
    } else {
      days = [
        ...days,
        { id: makeDayId(), leg_id: moment.leg_id, local_date: moment.local_date, lifecycle: 'live' },
      ];
    }
    changed = true;
  }
  return changed ? { ...journal, days } : journal;
}
