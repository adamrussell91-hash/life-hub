import { describe, expect, it } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import {
  ATLAS_PREF_KEY,
  applyMaccasDrafts,
  blankDraft,
  countryCode,
  liveMaccasForMoment,
  maccasDraftsKey,
  momentWhere,
  needsRateRetry,
  type MaccasDraft,
  type MaccasItem,
} from '@/atlas/maccas';
import {
  bigMacIndex,
  bigMacStrip,
  deriveStickers,
  groupByCountry,
  stickerCode,
  starsLabel,
  vsHomeLabel,
} from '@/atlas/atlas-model';
import { atlasRoute, parseRoute } from '@/app/router';

function journal(prefs: Record<string, unknown> = {}): JournalDocument {
  return {
    id: 'jrn_aaaaaaaa',
    schema_version: 1,
    trip_id: 'trp_invented01',
    title: '',
    revision: 3,
    lifecycle: 'live',
    leg_ids: ['leg_osaka01'],
    preferences: prefs,
    legs: [{ id: 'leg_osaka01', trip_id: 'trp_invented01', pattern_id: 'p', destination: 'Osaka', timezone: 'Asia/Tokyo', order: 0, lifecycle: 'live', city_id: 'osa' }],
    days: [],
    moments: [],
    media: [],
    transitions: [],
    operations: [],
  };
}

const moment = { id: 'mom_lunch01', local_date: '2026-11-18', media_ids: ['med_photo01'] };
const where = { country: 'JP', city: 'Osaka' };

function draft(partial: Partial<MaccasDraft>): MaccasDraft {
  return { ...blankDraft('JPY'), ...partial };
}

function item(partial: Partial<MaccasItem>): MaccasItem {
  return {
    id: 'maccas_x', trip_id: 'trp_invented01', moment_id: 'mom_lunch01', country: 'JP', city: 'Osaka',
    date: '2026-11-18', name: 'Teriyaki McBurger', kind: 'exclusive', price: null, aud: null,
    big_mac: false, rating: null, vs_home: null, note: '', photo_ids: [], lifecycle: 'live', ...partial,
  };
}

describe('Arches Atlas: saving items', () => {
  it('converts a new price to AUD at save and keeps the rate it used', async () => {
    const calls: string[] = [];
    const next = await applyMaccasDrafts(journal(), moment, where, [draft({ name: 'Teriyaki McBurger', amount: '400' })], async (c) => {
      calls.push(c);
      return { rate: 0.0103, date: '2026-11-18' };
    });
    const [saved] = liveMaccasForMoment(next, moment.id);
    expect(calls).toEqual(['JPY']);
    expect(saved).toMatchObject({
      name: 'Teriyaki McBurger',
      country: 'JP',
      city: 'Osaka',
      date: '2026-11-18',
      price: { amount: 400, currency: 'JPY' },
      aud: { amount: 4.12, rate: 0.0103, as_of: '2026-11-18' },
      photo_ids: ['med_photo01'],
      trip_id: 'trp_invented01',
    });
    expect(saved!.id).toMatch(/^maccas_/);
    expect(next.revision).toBe(4);
  });

  it('never recalculates an unchanged price, so old entries do not drift', async () => {
    const stored = item({ id: 'maccas_keep01', price: { amount: 400, currency: 'JPY' }, aud: { amount: 4.12, rate: 0.0103, as_of: '2026-11-18' } });
    const start = journal({ [ATLAS_PREF_KEY]: { maccas_keep01: stored } });
    let asked = false;
    const next = await applyMaccasDrafts(start, moment, where, [draft({ id: 'maccas_keep01', name: 'Teriyaki McBurger', amount: '400', note: 'Sweet' })], async () => {
      asked = true;
      return { rate: 0.02, date: '2027-01-01' };
    });
    expect(asked).toBe(false);
    expect(liveMaccasForMoment(next, moment.id)[0]!.aud).toEqual(stored.aud);
  });

  it('still saves when the rate fails, and the next save tries again', async () => {
    const next = await applyMaccasDrafts(journal(), moment, where, [draft({ name: 'Ebi Filet-O', amount: '450' })], async () => {
      throw new Error('offline');
    });
    expect(liveMaccasForMoment(next, moment.id)[0]!.aud).toBeNull();
    expect(needsRateRetry(next, moment.id)).toBe(true);
  });

  it('prices in AUD need no lookup', async () => {
    const next = await applyMaccasDrafts(journal(), moment, where, [draft({ name: 'Big Mac', amount: '7.95', currency: 'AUD' })], async () => {
      throw new Error('should not ask');
    });
    expect(liveMaccasForMoment(next, moment.id)[0]!.aud).toEqual({ amount: 7.95, rate: 1, as_of: '2026-11-18' });
  });

  it('soft-deletes rows that were removed and gives new rows their ids', async () => {
    const stored = item({ id: 'maccas_gone01' });
    const start = journal({ [ATLAS_PREF_KEY]: { maccas_gone01: stored } });
    const fresh = draft({ name: 'Fries (M)', kind: 'classic', vs_home: 'same' });
    const next = await applyMaccasDrafts(start, moment, where, [fresh], async () => ({ rate: 1, date: 'x' }));
    const map = next.preferences[ATLAS_PREF_KEY] as Record<string, MaccasItem>;
    expect(map.maccas_gone01!.lifecycle).toBe('deleted');
    expect(map.maccas_gone01!.deleted_at).toBeTruthy();
    expect(fresh.id).toMatch(/^maccas_/);
    expect(liveMaccasForMoment(next, moment.id).map((i) => i.name)).toEqual(['Fries (M)']);
  });

  it('drops a vs-home call from an exclusive and ignores blank rows', async () => {
    const next = await applyMaccasDrafts(journal(), moment, where, [draft({ name: 'Shaka Shaka', kind: 'exclusive', vs_home: 'better' }), draft({ name: '  ' })], async () => ({ rate: 1, date: 'x' }));
    const live = liveMaccasForMoment(next, moment.id);
    expect(live).toHaveLength(1);
    expect(live[0]!.vs_home).toBeNull();
  });

  it('compares drafts by what is stored', () => {
    expect(maccasDraftsKey([draft({ name: 'Big Mac ' }), draft({ name: '' })])).toBe(maccasDraftsKey([draft({ name: 'Big Mac' })]));
  });

  it('takes country and currency from the leg city on the trip', () => {
    const trip = { cities: [{ id: 'osa', name: 'Osaka', country: 'Japan', local_currency: 'JPY' }] } as never;
    expect(momentWhere(journal(), { leg_id: 'leg_osaka01' }, trip)).toEqual({ country: 'JP', city: 'Osaka', currency: 'JPY' });
    expect(momentWhere(journal(), { leg_id: 'leg_osaka01' }, null)).toEqual({ country: '', city: 'Osaka', currency: 'AUD' });
    expect(countryCode('United Kingdom')).toBe('GB');
    expect(countryCode('UK')).toBe('GB');
  });
});

describe('Arches Atlas: stickers, menu and index', () => {
  const items = [
    item({ id: 'maccas_a1', country: 'JP', date: '2026-11-18', name: 'Ebi Filet-O' }),
    item({ id: 'maccas_a2', country: 'JP', date: '2026-11-20', name: 'Big Mac', kind: 'classic', vs_home: 'better', big_mac: true, aud: { amount: 4.9, rate: 1, as_of: 'x' } }),
    item({ id: 'maccas_a3', country: 'IN', date: '2026-12-02', name: 'Maharaja Mac', big_mac: true, aud: { amount: 3.4, rate: 1, as_of: 'x' } }),
    item({ id: 'maccas_a4', country: 'FR', date: '2027-01-05', name: 'Big Mac', kind: 'classic', big_mac: true, aud: { amount: 9.1, rate: 1, as_of: 'x' } }),
    item({ id: 'maccas_a5', country: 'JP', date: '2026-11-10', name: 'Big Mac', kind: 'classic', big_mac: true, aud: { amount: 5.2, rate: 1, as_of: 'x' } }),
  ];

  it('earns a sticker per country, home always first, dated by the first item', () => {
    const stickers = deriveStickers(items);
    expect(stickers.map((s) => s.code)).toEqual(['AU', 'JP', 'IN', 'FR']);
    expect(stickers[0]).toMatchObject({ home: true, since: null });
    expect(stickers[1]!.since).toBe('2026-11-10');
    expect(deriveStickers([]).map((s) => s.code)).toEqual(['AU']);
    expect(stickerCode('Narnia Land')).toBe('NL');
  });

  it('orders countries newest first, exclusives before classics', () => {
    const groups = groupByCountry(items);
    expect(groups.map((g) => g.code)).toEqual(['FR', 'IN', 'JP']);
    expect(groups[2]!.items.map((i) => i.id)).toEqual(['maccas_a1', 'maccas_a2', 'maccas_a5']);
  });

  it('shows one bar per country, cheapest first, with stand-ins named', () => {
    const index = bigMacIndex(items);
    expect(index.map((r) => [r.code, r.aud, r.standIn])).toEqual([
      ['IN', 3.4, 'Maharaja Mac'],
      ['JP', 4.9, null],
      ['FR', 9.1, null],
    ]);
  });

  it('prefers a real Big Mac over a stand-in in the same country', () => {
    const index = bigMacIndex([
      item({ id: 'maccas_b1', country: 'IN', date: '2026-12-09', name: 'Maharaja Mac', big_mac: true, aud: { amount: 3.4, rate: 1, as_of: 'x' } }),
      item({ id: 'maccas_b2', country: 'IN', date: '2026-12-01', name: 'Big Mac', big_mac: true, aud: { amount: 3.0, rate: 1, as_of: 'x' } }),
    ]);
    expect(index).toHaveLength(1);
    expect(index[0]!.standIn).toBeNull();
  });

  it('words the strip against home', () => {
    const row = { code: 'JP', label: 'Japan', aud: 4.9, standIn: null, date: 'x' };
    expect(bigMacStrip(row, 8)).toBe('A$4.90 here · A$3.10 cheaper than home');
    expect(bigMacStrip(row, 4)).toBe('A$4.90 here · A$0.90 dearer than home');
    expect(bigMacStrip(row, null)).toBe('A$4.90 here');
    expect(bigMacStrip(undefined, 8)).toBeNull();
  });

  it('labels pills and stars', () => {
    expect(vsHomeLabel('better')).toBe('▲ BETTER THAN HOME');
    expect(vsHomeLabel('same')).toBe('= SAME AS HOME');
    expect(vsHomeLabel('worse')).toBe('▼ WORSE THAN HOME');
    expect(starsLabel(4.5)).toBe('★★★★½');
  });
});

describe('Arches Atlas route', () => {
  it('parses the page and its trip filter', () => {
    expect(parseRoute('#/atlas')).toEqual({ name: 'atlas' });
    expect(parseRoute('#/atlas?trip=trp_invented01')).toEqual({ name: 'atlas', tripId: 'trp_invented01' });
    expect(parseRoute(atlasRoute('trp_invented01'))).toEqual({ name: 'atlas', tripId: 'trp_invented01' });
  });
});
