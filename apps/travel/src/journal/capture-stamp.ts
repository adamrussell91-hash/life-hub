import type { JournalCoordinates, JournalLocationSource, JournalMoment } from '@/journal/types';

/**
 * Every captured moment is stamped with a date, time and (when the phone can
 * give one) a location, so the journal assembles itself in order without any
 * typing on the road.
 */

export interface CaptureStamp {
  local_date: string;
  local_time: string;
  coordinates?: JournalCoordinates;
  location_source?: JournalLocationSource;
  /** Where the date and time came from, for the on-screen stamp line. */
  time_source: 'now' | 'photo';
}

/** Metadata read from a photo picked from the library. */
export interface LibraryPhotoMeta {
  /** UTC instant when the photo carried an offset. */
  instant?: string;
  /** EXIF wall time, "YYYY:MM:DD HH:MM:SS", when no offset was recorded. */
  wall?: string | null;
  coordinates?: JournalCoordinates;
}

export interface ResolveCaptureStampInput {
  /** When the capture screen was opened. */
  openedAt: Date;
  /** The leg's IANA time zone; the journal is written in local time. */
  timeZone: string;
  /** Fix from the phone's location service, if one arrived. */
  deviceCoordinates?: JournalCoordinates;
  /** True when something was captured live (camera photo or ambient sound). */
  hasLiveCapture: boolean;
  /** Photos added from the library, in the order they were picked. */
  libraryPhotos: LibraryPhotoMeta[];
}

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** Date (YYYY-MM-DD) and 24-hour time (HH:MM) of an instant in a time zone. */
export function localPartsInZone(
  instant: Date | string,
  timeZone: string,
): { local_date: string; local_time: string } {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const zone = safeZone(timeZone);
  const local_date = d.toLocaleDateString('en-CA', { timeZone: zone });
  const local_time = d
    .toLocaleTimeString('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false })
    // Some engines print midnight as 24:00.
    .replace(/^24:/, '00:');
  return { local_date, local_time };
}

function partsFromWall(wall: string): { local_date: string; local_time: string } | null {
  const m = wall.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return { local_date: `${m[1]}-${m[2]}-${m[3]}`, local_time: `${m[4]}:${m[5]}` };
}

function photoParts(
  photo: LibraryPhotoMeta,
  timeZone: string,
): { local_date: string; local_time: string } | null {
  if (photo.instant) return localPartsInZone(photo.instant, timeZone);
  if (photo.wall) return partsFromWall(photo.wall);
  return null;
}

/**
 * Live captures (camera, ambient sound) are stamped "now, here". A moment made
 * only from library photos takes the earliest photo's own time and place, so
 * a shot from this morning added tonight still lands this morning.
 */
export function resolveCaptureStamp(input: ResolveCaptureStampInput): CaptureStamp {
  const now = localPartsInZone(input.openedAt, input.timeZone);
  const device = input.deviceCoordinates
    ? { coordinates: input.deviceCoordinates, location_source: 'device' as const }
    : {};

  if (!input.hasLiveCapture && input.libraryPhotos.length) {
    const dated = input.libraryPhotos
      .map((photo) => ({ photo, parts: photoParts(photo, input.timeZone) }))
      .filter((p): p is { photo: LibraryPhotoMeta; parts: { local_date: string; local_time: string } } =>
        Boolean(p.parts),
      )
      .sort((a, b) =>
        `${a.parts.local_date} ${a.parts.local_time}`.localeCompare(
          `${b.parts.local_date} ${b.parts.local_time}`,
        ),
      );
    const earliest = dated[0];
    const withGps = (earliest?.photo.coordinates ? earliest.photo : undefined) ??
      input.libraryPhotos.find((p) => p.coordinates);
    const place = withGps?.coordinates
      ? { coordinates: withGps.coordinates, location_source: 'exif' as const }
      : // An old photo with no GPS should not borrow where the phone is now.
        earliest
        ? {}
        : device;
    if (earliest) {
      return { ...earliest.parts, ...place, time_source: 'photo' };
    }
    return { ...now, ...place, time_source: 'now' };
  }

  return { ...now, ...device, time_source: 'now' };
}

/**
 * A display_order that slots the new moment into time order among the leg's
 * live moments. The story sorts each day by display_order, so a moment
 * captured at 10:15 lands between 09:40 and 13:05 even if it was saved last.
 * Moments with no time keep their place; the new one goes after them.
 */
export function chronologicalDisplayOrder(
  moments: JournalMoment[],
  legId: string,
  localDate: string,
  localTime: string,
): number {
  const leg = moments
    .filter((m) => m.leg_id === legId && m.lifecycle === 'live')
    .sort((a, b) => a.display_order - b.display_order);
  if (!leg.length) return 1;
  const key = `${localDate} ${localTime}`;
  const nextIndex = leg.findIndex((m) => {
    if (m.local_date > localDate) return true;
    if (m.local_date < localDate) return false;
    return Boolean(m.local_time) && `${m.local_date} ${m.local_time}` > key;
  });
  if (nextIndex === -1) return leg[leg.length - 1]!.display_order + 1;
  const next = leg[nextIndex]!.display_order;
  if (nextIndex === 0) return next - 1;
  const prev = leg[nextIndex - 1]!.display_order;
  return (prev + next) / 2;
}

/** "9:41 am" style for the stamp line. */
export function formatStampTime(localTime: string): string {
  const [hRaw, m] = localTime.split(':');
  const h = Number(hRaw);
  if (!Number.isFinite(h) || m === undefined) return localTime;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/** "Tue 27 Oct" for the stamp line. */
export function formatStampDate(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  if (!y || !m || !d) return localDate;
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' });
  const month = date.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' });
  return `${weekday} ${d} ${month}`;
}

/** "0:42" for recording length. */
export function formatClipLength(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
