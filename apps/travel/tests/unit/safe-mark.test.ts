import { describe, expect, it } from 'vitest';
import { canMarkSafe, formatSafeTime, latestSafeForItem, safeByItemId } from '@/lib/safe-mark';
import type { Checkin, Item } from '@/types';

function item(partial: Partial<Item> & Pick<Item, 'id' | 'kind'>): Item {
  return {
    city_id: 'lis',
    date: '2027-03-04',
    time: '10:00',
    title: 'Stop',
    note: '',
    status: 'planned',
    created_at: '2027-01-01T00:00:00.000Z',
    updated_at: '2027-01-01T00:00:00.000Z',
    ...partial
  } as Item;
}

describe('canMarkSafe', () => {
  it('allows place stops and stays', () => {
    expect(canMarkSafe(item({ id: 'a', kind: 'do' }))).toBe(true);
    expect(canMarkSafe(item({ id: 'b', kind: 'food' }))).toBe(true);
    expect(
      canMarkSafe(
        item({
          id: 'c',
          kind: 'stay',
          nights: 2,
          check_out_date: '2027-03-06',
          home_base: true
        } as never)
      )
    ).toBe(true);
  });

  it('skips tickets, meds, private and check-in slots', () => {
    expect(canMarkSafe(item({ id: 'f', kind: 'flight' } as never))).toBe(false);
    expect(canMarkSafe(item({ id: 't', kind: 'train' } as never))).toBe(false);
    expect(canMarkSafe(item({ id: 'm', kind: 'med' }))).toBe(false);
    expect(canMarkSafe(item({ id: 'p', kind: 'do', private: true }))).toBe(false);
    expect(canMarkSafe(item({ id: 'c', kind: 'checkin_slot' }))).toBe(false);
  });
});

describe('latestSafeForItem / safeByItemId', () => {
  const checkins: Checkin[] = [
    { id: '1', at: '2027-03-04T10:00:00.000Z', city_id: 'lis', label: 'a', item_id: 'itm_a' },
    { id: '2', at: '2027-03-04T12:00:00.000Z', city_id: 'lis', label: 'b', item_id: 'itm_a', photo_id: 'tph_x' },
    { id: '3', at: '2027-03-04T09:00:00.000Z', city_id: 'lis', label: 'city only' }
  ];

  it('picks the latest check-in for a stop', () => {
    expect(latestSafeForItem(checkins, 'itm_a')?.id).toBe('2');
    expect(latestSafeForItem(checkins, 'itm_a')?.photo_id).toBe('tph_x');
    expect(latestSafeForItem(checkins, 'missing')).toBeNull();
  });

  it('maps each stop to its latest mark', () => {
    const map = safeByItemId(checkins);
    expect(map.get('itm_a')?.id).toBe('2');
    expect(map.size).toBe(1);
  });
});

describe('formatSafeTime', () => {
  it('formats a clock time in the city zone', () => {
    expect(formatSafeTime('2027-03-04T15:30:00.000Z', 'UTC')).toBe('15:30');
  });
});
