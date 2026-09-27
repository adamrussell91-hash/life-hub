import { describe, expect, it } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Trip } from '@/types';
import { buildTodo } from '@/model/day';

const trip = fixtureTrip as unknown as Trip;

describe('buildTodo (§3 rule 7)', () => {
  it('includes every status:todo item, by date', () => {
    const rows = buildTodo(trip, '2027-02-01');
    const todoRow = rows.find((r) => r.title === 'Book Belém tram tickets');
    expect(todoRow).toBeDefined();
    expect(todoRow?.city_id).toBe('lis');
    expect(todoRow?.date).toBe('2027-03-04');
  });

  it('includes a stay with cancel_until in the future, labelled with the deadline', () => {
    const rows = buildTodo(trip, '2027-02-01');
    const cancelRow = rows.find((r) => r.title === 'Test Alfama Inn');
    expect(cancelRow).toBeDefined();
    expect(cancelRow?.detail).toContain('Free cancellation ends');
  });

  it('drops a cancellation row once cancel_until is in the past', () => {
    const rows = buildTodo(trip, '2027-03-01');
    expect(rows.find((r) => r.title === 'Test Alfama Inn')).toBeUndefined();
  });

  it('produces no "no bed" rows when every night is covered by a stay', () => {
    const rows = buildTodo(trip, '2027-02-01');
    expect(rows.find((r) => r.title === 'No bed')).toBeUndefined();
  });

  it('reports a "no bed" range for an uncovered night, excluding the last trip night', () => {
    const gappy: Trip = {
      ...trip,
      items: trip.items.filter((item) => item.kind !== 'stay')
    };
    const rows = buildTodo(gappy, '2027-02-01');
    const noBedRows = rows.filter((r) => r.title === 'No bed');
    // Nights are 03-03..03-06 (the trip ends 03-07); all uncovered → one merged range.
    expect(noBedRows).toHaveLength(1);
    expect(noBedRows[0]?.date).toBe('2027-03-03');
  });

  it('the row count equals the "still to book" badge count (V4)', () => {
    const rows = buildTodo(trip, '2027-02-01');
    expect(rows.length).toBe(2);
  });
});
