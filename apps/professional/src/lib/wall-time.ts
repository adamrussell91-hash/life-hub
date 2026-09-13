/**
 * Client wall-clock helpers — datetime-local is civil time in the selected
 * IANA zone, not the device timezone.
 */

export function isValidTimeZone(zone: string): boolean {
  if (!zone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: zone.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function assertValidTimeZone(zone: string): string {
  const trimmed = zone.trim();
  if (!isValidTimeZone(trimmed)) {
    throw new Error('time_zone must be a valid IANA timezone.');
  }
  return trimmed;
}

export function wallLocalToUtcIso(localValue: string, timeZone: string): string {
  const zone = assertValidTimeZone(timeZone);
  const match = localValue
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error('datetime-local value is malformed.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? '0');

  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i += 1) {
    const parts = zonedParts(new Date(utcMs), zone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    utcMs += desired - asUtc;
  }
  return new Date(utcMs).toISOString();
}

export function utcIsoToWallLocal(iso: string, timeZone: string): string {
  const zone = assertValidTimeZone(timeZone);
  const parts = zonedParts(new Date(iso), zone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const bag = Object.fromEntries(
    fmt
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second)
  };
}
