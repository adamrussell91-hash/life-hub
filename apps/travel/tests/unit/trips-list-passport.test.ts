import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/api/travel', () => ({
  listTrips: vi.fn(async () => ({
    trips: [
      {
        id: 'trp_future',
        title: 'Future',
        start_date: '2027-03-01',
        end_date: '2027-03-10',
        cities: ['Seoul'],
        countries: ['South Korea']
      },
      {
        id: 'trp_past',
        title: 'Past',
        start_date: '2025-01-01',
        end_date: '2025-01-10',
        cities: ['Lisbon'],
        countries: ['Portugal']
      }
    ]
  })),
  createTrip: vi.fn()
}));

import { listTrips } from '@/api/travel';
import { renderTripsList } from '@/views/trips-list';

describe('renderTripsList passport homepage', () => {
  beforeEach(() => {
    vi.mocked(listTrips).mockClear();
  });

  it('renders passport map and upcoming card before finished', async () => {
    const canvas = document.createElement('div');
    await renderTripsList(canvas, { isCurrent: () => true });
    expect(canvas.querySelector('.passport')).toBeTruthy();
    const ids = [...canvas.querySelectorAll('.trips-list__card')].map((el) =>
      el.getAttribute('data-trip-id')
    );
    expect(ids[0]).toBe('trp_future');
    expect(ids[1]).toBe('trp_past');
  });
});
