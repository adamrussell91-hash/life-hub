import { afterEach, describe, expect, it, vi } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Trip } from '@/types';

const trip = fixtureTrip as unknown as Trip;

async function openTrip(options: { cityId?: string; date?: string }): Promise<HTMLElement> {
  vi.resetModules();
  vi.doMock('@/api/travel', async (orig) => ({
    ...(await orig<typeof import('@/api/travel')>()),
    getTrip: vi.fn(async () => ({ trip, version: 'v1' }))
  }));
  vi.doMock('@/api/travel-atlas', () => ({ getAtlas: vi.fn(async () => null) }));
  const { renderTripPage } = await import('@/views/trip-page');
  const canvas = document.createElement('div');
  document.body.append(canvas);
  await renderTripPage(canvas, trip.id, { ...options, isCurrent: () => true });
  return canvas;
}

const selectedDay = (canvas: HTMLElement) => canvas.querySelector('.daybtn.is-on')?.textContent ?? '';

describe('trip page deep link', () => {
  afterEach(() => {
    vi.doUnmock('@/api/travel');
    vi.doUnmock('@/api/travel-atlas');
    document.body.replaceChildren();
  });

  it('opens on the day named in the link', async () => {
    const canvas = await openTrip({ cityId: 'lis', date: '2027-03-04' });
    expect(selectedDay(canvas)).toContain('4 Mar');
  });

  it('falls back to the city\'s first day when the date is outside the stay', async () => {
    const canvas = await openTrip({ cityId: 'lis', date: '2030-01-01' });
    const first = canvas.querySelector('.daybtn')?.textContent ?? '';
    expect(first).not.toBe('');
    expect(selectedDay(canvas)).toBe(first);
  });

  it('falls back to the city\'s first day when the date is not a date', async () => {
    const canvas = await openTrip({ cityId: 'lis', date: 'nonsense' });
    expect(selectedDay(canvas)).toBe(canvas.querySelector('.daybtn')?.textContent);
  });
});
