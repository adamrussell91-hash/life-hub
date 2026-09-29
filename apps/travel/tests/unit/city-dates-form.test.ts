import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Trip } from '@/types';

const patchTrip = vi.fn();
vi.mock('@/api/travel', () => ({
  patchTrip: (...args: unknown[]) => patchTrip(...args)
}));

import { renderCityDatesForm } from '@/components/city-dates-form';

const trip = fixtureTrip as unknown as Trip;
const lisbon = trip.cities.find((c) => c.id === 'lis')!;

describe('renderCityDatesForm', () => {
  beforeEach(() => {
    patchTrip.mockReset();
  });

  it('patches city start/end dates through patchTrip', async () => {
    const host = document.createElement('div');
    const onSaved = vi.fn();
    renderCityDatesForm(host, {
      trip,
      tripId: trip.id,
      version: 'sha-1',
      city: lisbon,
      onSaved,
      onClose: vi.fn()
    });

    const start = host.querySelector<HTMLInputElement>('input[type="date"]')!;
    const end = host.querySelectorAll<HTMLInputElement>('input[type="date"]')[1]!;
    start.value = '2027-03-03';
    end.value = '2027-03-06';

    const nextTrip = {
      ...trip,
      cities: trip.cities.map((c) =>
        c.id === 'lis' ? { ...c, end_date: '2027-03-06' } : c
      )
    };
    patchTrip.mockResolvedValueOnce({ trip: nextTrip, version: 'sha-2' });

    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(patchTrip).toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalledWith(nextTrip, 'sha-2');
    });
    const patch = patchTrip.mock.calls[0]![2] as { cities: { id: string; end_date: string }[] };
    expect(patch.cities.find((c) => c.id === 'lis')!.end_date).toBe('2027-03-06');
  });

  it('blocks an inverted date range without calling the API', async () => {
    const host = document.createElement('div');
    renderCityDatesForm(host, {
      trip,
      tripId: trip.id,
      version: 'sha-1',
      city: lisbon,
      onSaved: vi.fn(),
      onClose: vi.fn()
    });
    const start = host.querySelector<HTMLInputElement>('input[type="date"]')!;
    const end = host.querySelectorAll<HTMLInputElement>('input[type="date"]')[1]!;
    start.value = '2027-03-06';
    end.value = '2027-03-03';
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(host.textContent).toMatch(/First day must be on or before/);
    });
    expect(patchTrip).not.toHaveBeenCalled();
  });
});
