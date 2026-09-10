import { HUB_TZ } from '@/domain/queries';

export type HubPrefs = {
  schema_version: 1;
  /** IANA timezone Clare uses for "today" / due words. Default Australia/Sydney. */
  timezone: string;
  updated_at: string | null;
};

export const DEFAULT_HUB_PREFS: HubPrefs = {
  schema_version: 1,
  timezone: HUB_TZ,
  updated_at: null
};

/** Common city / shorthand → IANA. Clare can learn these from chat. */
const ZONE_ALIASES: Record<string, string> = {
  sydney: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne',
  brisbane: 'Australia/Brisbane',
  perth: 'Australia/Perth',
  adelaide: 'Australia/Adelaide',
  hobart: 'Australia/Hobart',
  canberra: 'Australia/Sydney',
  australia: 'Australia/Sydney',
  aus: 'Australia/Sydney',
  aest: 'Australia/Sydney',
  aedt: 'Australia/Sydney',
  utc: 'UTC',
  gmt: 'UTC',
  london: 'Europe/London',
  'new york': 'America/New_York',
  nyc: 'America/New_York',
  'los angeles': 'America/Los_Angeles',
  la: 'America/Los_Angeles'
};

const IANA = /^[A-Za-z|_+\-]+\/[A-Za-z0-9|_+\-]+$/;

/** True when Intl accepts the zone (throws on junk). */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve Adam's words ("Sydney", "Australia/Sydney") to an IANA zone.
 * Returns null when we cannot map it safely.
 */
export function resolveTimeZoneInput(raw: string): string | null {
  const text = raw.trim().replace(/_/g, ' ').replace(/\s+/g, ' ');
  if (!text) return null;
  const lower = text.toLowerCase();
  if (ZONE_ALIASES[lower]) return ZONE_ALIASES[lower]!;

  const candidates = [
    text,
    text.replace(/ /g, '_'),
    text
      .split('/')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('/')
  ];
  for (const candidate of candidates) {
    if (!IANA.test(candidate) && !candidate.includes('/')) continue;
    if (!isValidTimeZone(candidate)) continue;
    try {
      return new Intl.DateTimeFormat('en-AU', { timeZone: candidate }).resolvedOptions()
        .timeZone;
    } catch {
      /* try next */
    }
  }
  return null;
}

export function parseHubPrefs(raw: unknown): HubPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_HUB_PREFS };
  const body = raw as Record<string, unknown>;
  const timezone =
    typeof body.timezone === 'string' && isValidTimeZone(body.timezone)
      ? body.timezone
      : DEFAULT_HUB_PREFS.timezone;
  return {
    schema_version: 1,
    timezone,
    updated_at: typeof body.updated_at === 'string' ? body.updated_at : null
  };
}
