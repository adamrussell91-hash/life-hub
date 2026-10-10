import type { JournalDocument } from '@/api/journal';
import type { JournalFixture, JournalLeg, JournalMoment } from '@/journal/types';

export class MomentOperationError extends Error {}

export function makeMomentId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = 'mom_';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function liveDayMoments(
  journal: JournalFixture,
  legId: string,
  localDate: string,
): JournalMoment[] {
  return journal.moments
    .filter(
      (m) => m.lifecycle === 'live' && m.leg_id === legId && m.local_date === localDate,
    )
    .sort((a, b) => a.display_order - b.display_order);
}

export function splitMoment(
  moment: JournalMoment,
  selectedMediaIds: string[],
  newIdForB: string,
): { a: JournalMoment; b: JournalMoment } {
  const selected = new Set(selectedMediaIds);
  const all = moment.media_ids;
  if (selected.size === 0 || selected.size >= all.length) {
    throw new MomentOperationError('Split requires a non-empty proper subset of media');
  }
  for (const id of selected) {
    if (!all.includes(id)) {
      throw new MomentOperationError(`Unknown media id: ${id}`);
    }
  }
  const groupA: string[] = [];
  const groupB: string[] = [];
  for (const id of all) {
    if (selected.has(id)) groupA.push(id);
    else groupB.push(id);
  }
  const a: JournalMoment = {
    ...moment,
    media_ids: groupA,
  };
  const b: JournalMoment = {
    id: newIdForB,
    leg_id: moment.leg_id,
    local_date: moment.local_date,
    media_ids: groupB,
    display_order: moment.display_order + 1,
    lifecycle: moment.lifecycle,
    local_time: undefined,
    place: undefined,
    coordinates: undefined,
    location_source: undefined,
    text: undefined,
  };
  return { a, b };
}

export interface MergeMomentsOptions {
  locationFromMomentId: string;
}

export function mergeMoments(moments: JournalMoment[], opts: MergeMomentsOptions): JournalMoment {
  if (moments.length < 2) {
    throw new MomentOperationError('Merge requires at least two moments');
  }
  const ordered = [...moments].sort((a, b) => a.display_order - b.display_order);
  const leg = ordered[0]!.leg_id;
  const day = ordered[0]!.local_date;
  if (ordered.some((m) => m.leg_id !== leg || m.local_date !== day)) {
    throw new MomentOperationError('Merge moments must share leg and day');
  }
  const locationSource = ordered.find((m) => m.id === opts.locationFromMomentId);
  if (!locationSource) {
    throw new MomentOperationError('locationFromMomentId must match a merged moment');
  }
  const media_ids = ordered.flatMap((m) => m.media_ids);
  const seen = new Set<string>();
  for (const id of media_ids) {
    if (seen.has(id)) throw new MomentOperationError('Duplicate media across merge inputs');
    seen.add(id);
  }
  const paragraphs = ordered.map((m) => m.text?.trim()).filter(Boolean) as string[];
  const primary = ordered[0]!;
  return {
    ...primary,
    media_ids,
    text: paragraphs.length ? paragraphs.join('\n\n') : undefined,
    place: locationSource.place,
    coordinates: locationSource.coordinates,
    location_source: locationSource.location_source,
    local_time: primary.local_time ?? ordered.find((m) => m.local_time)?.local_time,
    display_order: Math.min(...ordered.map((m) => m.display_order)),
  };
}

export type TimezoneMoveMode = 'preserve_instant' | 'keep_wall_clock';

export interface MoveMomentTarget {
  legId: string;
  localDate: string;
  timezoneMode: TimezoneMoveMode;
}

function formatInTimeZone(
  instantIso: string,
  timeZone: string,
): { local_date: string; local_time: string } {
  const d = new Date(instantIso);
  const local_date = d.toLocaleDateString('en-CA', { timeZone });
  const local_time = d.toLocaleTimeString('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { local_date, local_time };
}

/** ponytail: rough local→UTC via formatter probe (good enough for journal move preview). */
function zonedLocalToUtcIso(localDate: string, localTime: string, timeZone: string): string | null {
  const [y, mo, d] = localDate.split('-').map(Number);
  const [hh, mm] = localTime.split(':').map(Number);
  if (!y || !mo || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  const probe = new Date(guess);
  const parts = formatInTimeZone(probe.toISOString(), timeZone);
  if (parts.local_date !== localDate || parts.local_time !== localTime) {
    const probe2 = new Date(guess - 60 * 60_000);
    const parts2 = formatInTimeZone(probe2.toISOString(), timeZone);
    if (parts2.local_date === localDate && parts2.local_time === localTime) {
      return probe2.toISOString();
    }
    const probe3 = new Date(guess + 60 * 60_000);
    const parts3 = formatInTimeZone(probe3.toISOString(), timeZone);
    if (parts3.local_date === localDate && parts3.local_time === localTime) {
      return probe3.toISOString();
    }
  }
  return probe.toISOString();
}

export function moveMoment(
  moment: JournalMoment,
  target: MoveMomentTarget,
  legs: JournalLeg[],
): { moment: JournalMoment; previewLocalTime: string | null } {
  const fromLeg = legs.find((l) => l.id === moment.leg_id);
  const toLeg = legs.find((l) => l.id === target.legId);
  let local_date = target.localDate;
  let local_time = moment.local_time;
  let previewLocalTime: string | null = moment.local_time ?? null;

  if (
    moment.local_time &&
    fromLeg &&
    toLeg &&
    target.timezoneMode === 'preserve_instant' &&
    fromLeg.timezone !== toLeg.timezone
  ) {
    const instant = zonedLocalToUtcIso(moment.local_date, moment.local_time, fromLeg.timezone);
    if (instant) {
      const parts = formatInTimeZone(instant, toLeg.timezone);
      local_date = parts.local_date;
      local_time = parts.local_time;
      previewLocalTime = parts.local_time;
    }
  } else if (moment.local_time && target.timezoneMode === 'keep_wall_clock') {
    previewLocalTime = moment.local_time;
  }

  return {
    moment: {
      ...moment,
      leg_id: target.legId,
      local_date,
      local_time,
    },
    previewLocalTime,
  };
}

export function chronologicMomentOrder(moments: JournalMoment[]): JournalMoment[] {
  return [...moments].sort((a, b) => {
    const ta = a.local_time ?? '99:99';
    const tb = b.local_time ?? '99:99';
    if (ta !== tb) return ta.localeCompare(tb);
    return a.display_order - b.display_order;
  });
}

export function reorderMomentsByIds(
  dayMoments: JournalMoment[],
  orderedIds: string[],
): JournalMoment[] {
  const byId = new Map(dayMoments.map((m) => [m.id, m]));
  if (orderedIds.length !== dayMoments.length) {
    throw new MomentOperationError('Reorder list must include every moment on the day');
  }
  for (const id of orderedIds) {
    if (!byId.has(id)) throw new MomentOperationError(`Unknown moment id: ${id}`);
  }
  return orderedIds.map((id, index) => ({
    ...byId.get(id)!,
    display_order: index + 1,
  }));
}

function bumpRevision(journal: JournalDocument): JournalDocument {
  return { ...journal, revision: journal.revision + 1 };
}

export function applySplitToJournal(
  journal: JournalDocument,
  momentId: string,
  selectedMediaIds: string[],
): JournalDocument {
  const moment = journal.moments.find((m) => m.id === momentId);
  if (!moment) throw new MomentOperationError('Moment not found');
  const { a, b } = splitMoment(moment, selectedMediaIds, makeMomentId());
  const moments = journal.moments.flatMap((m) => {
    if (m.id !== momentId) {
      if (
        m.leg_id === moment.leg_id &&
        m.local_date === moment.local_date &&
        m.lifecycle === 'live' &&
        m.display_order > moment.display_order
      ) {
        return [{ ...m, display_order: m.display_order + 1 }];
      }
      return [m];
    }
    return [a, b];
  });
  return bumpRevision({ ...journal, moments });
}

export function applyMergeToJournal(
  journal: JournalDocument,
  momentIds: string[],
  opts: MergeMomentsOptions,
): JournalDocument {
  const inputs = momentIds.map((id) => journal.moments.find((m) => m.id === id));
  if (inputs.some((m) => !m)) throw new MomentOperationError('Moment not found');
  const merged = mergeMoments(inputs as JournalMoment[], opts);
  const remove = new Set(momentIds.filter((id) => id !== merged.id));
  const leg = merged.leg_id;
  const day = merged.local_date;
  let moments = journal.moments.filter((m) => !remove.has(m.id));
  moments = moments.map((m) => (m.id === merged.id ? merged : m));
  const dayPeers = moments
    .filter((m) => m.lifecycle === 'live' && m.leg_id === leg && m.local_date === day)
    .sort((a, b) => a.display_order - b.display_order);
  const orderMap = new Map(
    reorderMomentsByIds(dayPeers, dayPeers.map((m) => m.id)).map((m) => [m.id, m.display_order]),
  );
  moments = moments.map((m) =>
    orderMap.has(m.id) ? { ...m, display_order: orderMap.get(m.id)! } : m,
  );
  return bumpRevision({ ...journal, moments });
}

export function applyMoveToJournal(
  journal: JournalDocument,
  momentId: string,
  target: MoveMomentTarget,
): JournalDocument {
  const moment = journal.moments.find((m) => m.id === momentId);
  if (!moment) throw new MomentOperationError('Moment not found');
  const { moment: moved } = moveMoment(moment, target, journal.legs);
  const targetPeers = journal.moments.filter(
    (m) =>
      m.lifecycle === 'live' &&
      m.leg_id === target.legId &&
      m.local_date === moved.local_date &&
      m.id !== momentId,
  );
  const nextOrder =
    targetPeers.reduce((max, m) => Math.max(max, m.display_order), 0) + 1;
  const moments = journal.moments.map((m) =>
    m.id === momentId ? { ...moved, display_order: nextOrder } : m,
  );
  return bumpRevision({ ...journal, moments });
}

export function applyReorderToJournal(
  journal: JournalDocument,
  legId: string,
  localDate: string,
  orderedIds: string[],
): JournalDocument {
  const dayMoments = liveDayMoments(journal, legId, localDate);
  const reordered = reorderMomentsByIds(dayMoments, orderedIds);
  const orderMap = new Map(reordered.map((m) => [m.id, m.display_order]));
  const moments = journal.moments.map((m) =>
    orderMap.has(m.id) ? { ...m, display_order: orderMap.get(m.id)! } : m,
  );
  return bumpRevision({ ...journal, moments });
}

export function applyChronologicReorderToJournal(
  journal: JournalDocument,
  legId: string,
  localDate: string,
): JournalDocument {
  const dayMoments = liveDayMoments(journal, legId, localDate);
  const ordered = chronologicMomentOrder(dayMoments);
  return applyReorderToJournal(
    journal,
    legId,
    localDate,
    ordered.map((m) => m.id),
  );
}
