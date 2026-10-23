import type { JournalDocument } from '@/api/journal';
import type { JournalMoment } from '@/journal/types';
import type { Trip } from '@/types';
import { isDeletedRecord } from '../../design-kit/js/record-liveness.js';

/**
 * Arches Atlas items: McDonald's eaten on a Travel moment. They live in the
 * trip journal's preferences (same key the server validates), never in the
 * Food Journal. An item counts while it and its moment are live.
 */
export const ATLAS_PREF_KEY = 'journal_maccas_v1';
export const ATLAS_LIMITS = { name: 80, note: 140 } as const;

export type MaccasKind = 'exclusive' | 'classic';
export type VsHome = 'better' | 'same' | 'worse';

export interface MaccasPrice {
  amount: number;
  currency: string;
}

export interface MaccasAud {
  amount: number;
  rate: number;
  as_of: string;
}

export interface MaccasItem {
  id: string;
  trip_id: string;
  moment_id: string;
  country: string;
  city: string;
  date: string;
  name: string;
  kind: MaccasKind;
  price: MaccasPrice | null;
  aud: MaccasAud | null;
  big_mac: boolean;
  rating: number | null;
  vs_home: VsHome | null;
  note: string;
  photo_ids: string[];
  lifecycle?: 'live' | 'deleted';
  deleted_at?: string;
}

/** What the sheet edits per row; the rest comes from the moment. */
export interface MaccasDraft {
  id?: string;
  name: string;
  kind: MaccasKind;
  amount: string;
  currency: string;
  rating: number | null;
  vs_home: VsHome | null;
  big_mac: boolean;
  /** Set once the person touches the tick, so typing "Big Mac" stops changing it. */
  big_mac_touched?: boolean;
  note: string;
}

export function newMaccasId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = 'maccas_';
  for (const b of crypto.getRandomValues(new Uint8Array(12))) out += alphabet[b % alphabet.length];
  return out;
}

export function isBigMacName(name: string): boolean {
  return /^big\s*mac$/i.test(name.trim());
}

function readMap(journal: Pick<JournalDocument, 'preferences'>): Record<string, MaccasItem> {
  const raw = journal.preferences?.[ATLAS_PREF_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, MaccasItem>;
}

export function liveMaccasForMoment(journal: Pick<JournalDocument, 'preferences'>, momentId: string): MaccasItem[] {
  return Object.values(readMap(journal))
    .filter((item) => item.moment_id === momentId && !isDeletedRecord(item));
}

export function draftFromItem(item: MaccasItem): MaccasDraft {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    amount: item.price ? String(item.price.amount) : '',
    currency: item.price?.currency ?? 'AUD',
    rating: item.rating,
    vs_home: item.vs_home,
    big_mac: item.big_mac,
    big_mac_touched: true,
    note: item.note,
  };
}

export function blankDraft(currency: string): MaccasDraft {
  return { name: '', kind: 'exclusive', amount: '', currency, rating: null, vs_home: null, big_mac: false, note: '' };
}

export function parseAmount(raw: string): number | null {
  const n = Number(raw.replace(/,/g, '').trim());
  return raw.trim() && Number.isFinite(n) && n >= 0 ? n : null;
}

/** Rows that will be saved: a name is all a row needs. */
export function keptDrafts(drafts: MaccasDraft[]): MaccasDraft[] {
  return drafts.filter((d) => d.name.trim());
}

/** Compares what would be stored, so blank rows and spacing don't count. */
export function maccasDraftsKey(drafts: MaccasDraft[]): string {
  return JSON.stringify(
    keptDrafts(drafts).map((d) => [
      d.id ?? '', d.name.trim(), d.kind, parseAmount(d.amount), d.currency, d.rating,
      d.kind === 'classic' ? d.vs_home : null, d.big_mac, d.note.trim(),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Where a moment is: the leg's city on the trip gives the country and currency.

let codeByName: Map<string, string> | null = null;

/** ISO country code for an English country name ("Japan" → "JP"). */
export function countryCode(name: string): string | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key]!;
  if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();
  if (!codeByName) {
    codeByName = new Map();
    try {
      const names = new Intl.DisplayNames(['en'], { type: 'region' });
      for (let a = 65; a <= 90; a += 1) {
        for (let b = 65; b <= 90; b += 1) {
          const code = String.fromCharCode(a, b);
          const label = names.of(code);
          // First code wins: GB, not the reserved UK.
          if (label && label !== code && !codeByName.has(label.toLowerCase())) codeByName.set(label.toLowerCase(), code);
        }
      }
    } catch {
      /* no Intl region names: fall back to the stored name */
    }
  }
  return codeByName.get(key) ?? null;
}

const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  usa: 'US', 'united states of america': 'US', korea: 'KR', 'south korea': 'KR',
  turkiye: 'TR', türkiye: 'TR', czechia: 'CZ', 'czech republic': 'CZ', vietnam: 'VN',
};

export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export interface MomentWhere {
  country: string;
  city: string;
  currency: string;
}

export function momentWhere(
  journal: Pick<JournalDocument, 'legs'>,
  moment: Pick<JournalMoment, 'leg_id'>,
  trip: Pick<Trip, 'cities'> | null | undefined,
): MomentWhere {
  const leg = journal.legs.find((l) => l.id === moment.leg_id);
  const city = trip?.cities.find((c) => c.id === leg?.city_id);
  const countryRaw = city?.country ?? '';
  return {
    country: countryCode(countryRaw) ?? countryRaw,
    city: city?.name ?? leg?.destination ?? '',
    currency: city?.local_currency ?? 'AUD',
  };
}

// ---------------------------------------------------------------------------
// Saving: the AUD price is worked out once, at save, and then kept.

export type RateLookup = (currency: string) => Promise<{ rate: number; date: string }>;

export function audFor(price: MaccasPrice, quote: { rate: number; date: string }): MaccasAud {
  return { amount: Math.round(price.amount * quote.rate * 100) / 100, rate: quote.rate, as_of: quote.date };
}

function samePrice(a: MaccasPrice | null, b: MaccasPrice | null): boolean {
  return a?.amount === b?.amount && a?.currency === b?.currency;
}

/**
 * The journal with this moment's items replaced by the drafts. Rows that
 * disappeared are soft-deleted. An unchanged price keeps its stored AUD; a
 * new or changed one, or one that failed before, asks for today's rate.
 * New drafts are given their ids.
 */
export async function applyMaccasDrafts(
  journal: JournalDocument,
  moment: Pick<JournalMoment, 'id' | 'local_date' | 'media_ids'>,
  where: Pick<MomentWhere, 'country' | 'city'>,
  drafts: MaccasDraft[],
  lookup: RateLookup,
): Promise<JournalDocument> {
  const map = { ...readMap(journal) };
  const kept = keptDrafts(drafts);
  const keptIds = new Set(kept.map((d) => d.id).filter(Boolean));
  const now = new Date().toISOString();

  for (const item of Object.values(map)) {
    if (item.moment_id === moment.id && !isDeletedRecord(item) && !keptIds.has(item.id)) {
      map[item.id] = { ...item, lifecycle: 'deleted', deleted_at: now };
    }
  }

  const quotes = new Map<string, Promise<{ rate: number; date: string } | null>>();
  const quote = (currency: string) => {
    if (!quotes.has(currency)) {
      quotes.set(currency, currency === 'AUD'
        ? Promise.resolve({ rate: 1, date: moment.local_date })
        : lookup(currency).catch(() => null));
    }
    return quotes.get(currency)!;
  };

  for (const draft of kept) {
    const prior = draft.id ? map[draft.id] : undefined;
    const amount = parseAmount(draft.amount);
    const price = amount === null ? null : { amount, currency: draft.currency };
    let aud: MaccasAud | null = null;
    if (price) {
      if (prior?.aud && samePrice(prior.price, price)) aud = prior.aud;
      else {
        const q = await quote(price.currency);
        aud = q ? audFor(price, q) : null;
      }
    }
    const id = prior?.id ?? draft.id ?? newMaccasId();
    // The sheet keeps the id, so a retried save updates this row.
    draft.id = id;
    map[id] = {
      id,
      trip_id: journal.trip_id,
      moment_id: moment.id,
      country: where.country,
      city: where.city,
      date: moment.local_date,
      name: draft.name.trim().slice(0, ATLAS_LIMITS.name),
      kind: draft.kind,
      price,
      aud,
      big_mac: draft.big_mac,
      rating: draft.rating,
      vs_home: draft.kind === 'classic' ? draft.vs_home : null,
      note: draft.note.trim().slice(0, ATLAS_LIMITS.note),
      photo_ids: [...moment.media_ids],
      lifecycle: 'live',
    };
  }

  return { ...journal, revision: journal.revision + 1, preferences: { ...journal.preferences, [ATLAS_PREF_KEY]: map } };
}

/** True when a save should run again to fill an AUD price that failed. */
export function needsRateRetry(journal: Pick<JournalDocument, 'preferences'>, momentId: string): boolean {
  return liveMaccasForMoment(journal, momentId).some((item) => item.price && !item.aud);
}
