/**
 * Wall-clock helpers for datetime-local ↔ ISO in a chosen IANA timezone.
 * datetime-local values are civil time in the selected zone, not the device zone.
 */

export function isValidTimeZone(zone) {
  if (typeof zone !== 'string' || !zone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: zone.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function assertValidTimeZone(zone) {
  const trimmed = typeof zone === 'string' ? zone.trim() : '';
  if (!isValidTimeZone(trimmed)) {
    throw Object.assign(new Error('time_zone must be a valid IANA timezone.'), {
      status: 400,
      code: 'invalid_time_zone'
    });
  }
  return trimmed;
}

/**
 * Convert datetime-local (`YYYY-MM-DDTHH:mm` or with seconds) wall time in
 * `timeZone` to a UTC ISO string.
 */
export function wallLocalToUtcIso(localValue, timeZone) {
  const zone = assertValidTimeZone(timeZone);
  if (typeof localValue !== 'string' || !localValue.trim()) {
    throw Object.assign(new Error('datetime-local value is required.'), {
      status: 400,
      code: 'invalid_datetime_local'
    });
  }
  const match = localValue
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw Object.assign(new Error('datetime-local value is malformed.'), {
      status: 400,
      code: 'invalid_datetime_local'
    });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? '0');

  // Guess UTC instant, then correct by the zone offset at that instant.
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

/**
 * Format a UTC ISO instant as datetime-local wall time in `timeZone`.
 */
export function utcIsoToWallLocal(iso, timeZone) {
  const zone = assertValidTimeZone(timeZone);
  if (typeof iso !== 'string' || !Number.isFinite(Date.parse(iso))) {
    throw Object.assign(new Error('ISO timestamp is required.'), {
      status: 400,
      code: 'invalid_iso_timestamp'
    });
  }
  const parts = zonedParts(new Date(iso), zone);
  const pad = (n) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function zonedParts(date, timeZone) {
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
    fmt.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
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
