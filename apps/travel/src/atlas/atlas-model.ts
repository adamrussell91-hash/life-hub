import { countryName, type MaccasItem } from '@/atlas/maccas';

/** Home is always on the sheet. */
export const HOME_COUNTRY = 'AU';

export interface Sticker {
  code: string;
  label: string;
  /** Earliest item date in the country; home has none until a home item is logged. */
  since: string | null;
  home: boolean;
}

/** A country earns its sticker with its first live item. Nothing is stored. */
export function deriveStickers(items: MaccasItem[]): Sticker[] {
  const first = new Map<string, string>();
  for (const item of items) {
    const prior = first.get(item.country);
    if (!prior || item.date < prior) first.set(item.country, item.date);
  }
  const earned = [...first.entries()]
    .filter(([code]) => code !== HOME_COUNTRY)
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
    .map(([code, since]) => ({ code, label: countryName(code), since, home: false }));
  return [
    { code: HOME_COUNTRY, label: countryName(HOME_COUNTRY), since: first.get(HOME_COUNTRY) ?? null, home: true },
    ...earned,
  ];
}

/** Two letters for the sticker face; a stored name falls back to its initials. */
export function stickerCode(code: string): string {
  if (/^[A-Z]{2}$/.test(code)) return code;
  return code.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
}

export interface CountryGroup {
  code: string;
  label: string;
  latest: string;
  items: MaccasItem[];
}

/** Countries most recent first; inside each, exclusives then classics, newest first. */
export function groupByCountry(items: MaccasItem[]): CountryGroup[] {
  const groups = new Map<string, CountryGroup>();
  for (const item of items) {
    const group = groups.get(item.country) ?? { code: item.country, label: countryName(item.country), latest: item.date, items: [] };
    group.items.push(item);
    if (item.date > group.latest) group.latest = item.date;
    groups.set(item.country, group);
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'exclusive' ? -1 : 1) ||
      b.date.localeCompare(a.date) ||
      a.name.localeCompare(b.name));
  }
  return [...groups.values()].sort((a, b) => b.latest.localeCompare(a.latest) || a.label.localeCompare(b.label));
}

export interface IndexRow {
  code: string;
  label: string;
  aud: number;
  /** Set when the ticked item is a stand-in, not a Big Mac (e.g. the Maharaja Mac). */
  standIn: string | null;
  date: string;
}

/**
 * One bar per country with a ticked Big Mac that has an AUD price: the latest
 * real Big Mac, else the latest stand-in. Cheapest first.
 */
export function bigMacIndex(items: MaccasItem[]): IndexRow[] {
  const best = new Map<string, MaccasItem>();
  for (const item of items) {
    if (!item.big_mac || !item.aud) continue;
    const prior = best.get(item.country);
    const real = /^big\s*mac$/i.test(item.name.trim());
    const priorReal = prior ? /^big\s*mac$/i.test(prior.name.trim()) : false;
    if (!prior || (real && !priorReal) || (real === priorReal && item.date > prior.date)) best.set(item.country, item);
  }
  return [...best.values()]
    .map((item) => ({
      code: item.country,
      label: countryName(item.country),
      aud: item.aud!.amount,
      standIn: /^big\s*mac$/i.test(item.name.trim()) ? null : item.name,
      date: item.date,
    }))
    .sort((a, b) => a.aud - b.aud || a.label.localeCompare(b.label));
}

export function formatAudPrice(amount: number): string {
  return `A$${amount.toFixed(2)}`;
}

/** "A$4.90 here · A$3.10 cheaper than home". Without a home price, just the price. */
export function bigMacStrip(row: IndexRow | undefined, home: number | null): string | null {
  if (!row) return null;
  const here = `${formatAudPrice(row.aud)} here`;
  if (home === null) return here;
  const diff = Math.round((row.aud - home) * 100) / 100;
  if (diff === 0) return `${here} · same as home`;
  return `${here} · ${formatAudPrice(Math.abs(diff))} ${diff < 0 ? 'cheaper' : 'dearer'} than home`;
}

export function vsHomeLabel(vs: MaccasItem['vs_home']): string | null {
  if (vs === 'better') return '▲ BETTER THAN HOME';
  if (vs === 'same') return '= SAME AS HOME';
  if (vs === 'worse') return '▼ WORSE THAN HOME';
  return null;
}

export function starsLabel(rating: number | null): string {
  if (rating === null) return '';
  return '★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : '');
}

export function formatLocalPrice(price: MaccasItem['price']): string {
  if (!price) return '';
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: price.currency, currencyDisplay: 'narrowSymbol' })
      .format(price.amount);
  } catch {
    return `${price.amount} ${price.currency}`;
  }
}

export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
}

export function monthYear(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }).toUpperCase().replace(' ', ' ’');
}

export function tripBadgeLabel(count: number): string {
  return `${count} Maccas this trip`;
}
