import { HUB_TZ } from '@/domain/queries';
import type { SchoolTerm } from '@/domain/school-time';

export type DismissedInsight = {
  id: string;
  fingerprint: string;
};

export type SchoolYearTerms = {
  year: number;
  terms: SchoolTerm[];
};

export type HubPrefs = {
  schema_version: 1;
  /** IANA timezone Clare uses for "today" / due words. Default Australia/Sydney. */
  timezone: string;
  updated_at: string | null;
  /** Graph insight dismissals — come back only if the underlying copy changes. */
  dismissed_insight_ids: DismissedInsight[];
  /** College term dates. Missing on an old blob becomes the NSW 2026 seed. */
  school_terms: SchoolYearTerms[];
  /** Starting guess for a marking shadow, minutes per script, until sessions exist. */
  marking_default_minutes_per_script: number;
};

/** NSW government dates for 2026. Labelled as public dates in Tools; 2027 is left empty. */
export const NSW_2026_TERMS: readonly SchoolTerm[] = [
  { term: 1, starts_on: '2026-02-02', ends_on: '2026-04-02' },
  { term: 2, starts_on: '2026-04-22', ends_on: '2026-07-03' },
  { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];

export const DEFAULT_HUB_PREFS: HubPrefs = {
  schema_version: 1,
  timezone: HUB_TZ,
  updated_at: null,
  dismissed_insight_ids: [],
  school_terms: [{ year: 2026, terms: NSW_2026_TERMS.map((term) => ({ ...term })) }],
  marking_default_minutes_per_script: 10
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

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function parseTerm(raw: unknown): SchoolTerm | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as { term?: unknown; starts_on?: unknown; ends_on?: unknown };
  const term = body.term;
  if (term !== 1 && term !== 2 && term !== 3 && term !== 4) return null;
  const starts = typeof body.starts_on === 'string' ? body.starts_on : '';
  const ends = typeof body.ends_on === 'string' ? body.ends_on : '';
  if (!DATE_KEY.test(starts) || !DATE_KEY.test(ends) || ends < starts) return null;
  return { term, starts_on: starts, ends_on: ends };
}

/** Absent field → NSW 2026 seed. An array, including empty, is kept as written. */
export function parseSchoolTerms(raw: unknown): SchoolYearTerms[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_HUB_PREFS.school_terms.map((year) => ({
      year: year.year,
      terms: year.terms.map((term) => ({ ...term }))
    }));
  }
  const years: SchoolYearTerms[] = [];
  const seenYears = new Set<number>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const body = row as { year?: unknown; terms?: unknown };
    const year = body.year;
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) continue;
    if (seenYears.has(year)) continue;
    seenYears.add(year);
    const terms: SchoolTerm[] = [];
    const seenTerms = new Set<number>();
    if (Array.isArray(body.terms)) {
      for (const item of body.terms) {
        const term = parseTerm(item);
        if (!term || seenTerms.has(term.term)) continue;
        seenTerms.add(term.term);
        terms.push(term);
      }
    }
    terms.sort((a, b) => a.term - b.term);
    years.push({ year, terms });
  }
  return years;
}

export function parseMarkingMinutes(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.NaN;
  if (!Number.isFinite(value) || value <= 0 || value > 24 * 60) return 10;
  return Math.round(value);
}

export function parseHubPrefs(raw: unknown): HubPrefs {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_HUB_PREFS);
  const body = raw as Record<string, unknown>;
  const timezone =
    typeof body.timezone === 'string' && isValidTimeZone(body.timezone)
      ? body.timezone
      : DEFAULT_HUB_PREFS.timezone;
  const dismissed = Array.isArray(body.dismissed_insight_ids)
    ? body.dismissed_insight_ids
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const item = row as { id?: unknown; fingerprint?: unknown };
          const id = String(item.id ?? '').trim();
          const fingerprint = String(item.fingerprint ?? '').trim();
          return id && fingerprint ? { id, fingerprint } : null;
        })
        .filter((row): row is DismissedInsight => Boolean(row))
    : [];
  return {
    schema_version: 1,
    timezone,
    updated_at: typeof body.updated_at === 'string' ? body.updated_at : null,
    dismissed_insight_ids: dismissed,
    school_terms: parseSchoolTerms(body.school_terms),
    marking_default_minutes_per_script: parseMarkingMinutes(body.marking_default_minutes_per_script)
  };
}
