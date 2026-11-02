import { describe, expect, it, vi } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Trip } from '@/types';
import { renderDayList } from '@/views/day-list';
import { renderScene } from '@/scenes';
import { splitGuideText } from '@/lib/guide-text';

const PAYLOAD = '<img src=x onerror="globalThis.__pwned=1">';
const base = fixtureTrip as unknown as Trip;

function hostileTrip(): Trip {
  const trip = structuredClone(base) as Trip;
  for (const item of trip.items) {
    (item as { title: string }).title = `${item.title} ${PAYLOAD}`;
    const hop = (item as { hop?: { note?: string } }).hop;
    if (hop) hop.note = PAYLOAD;
  }
  for (const city of trip.cities) {
    city.name = `${city.name}${PAYLOAD}`;
    if (city.arrival_guide) {
      city.arrival_guide.rows = [
        { icon: 'phone', text: `<b>Phone${PAYLOAD}.</b> ${PAYLOAD}` },
        { icon: 'constructor' as never, text: PAYLOAD }
      ];
    }
  }
  return trip;
}

const injected = (host: HTMLElement) => host.querySelector('img:not(.safe-mark__photo), [onerror], script');

describe('Travel render escaping', () => {
  it('renders hostile item titles, hop notes and Soft Landing rows as text', () => {
    const trip = hostileTrip();
    for (const item of trip.items) {
      const host = document.createElement('div');
      renderDayList(host, trip, item.city_id, item.date, { onEditArrivalGuide: () => {} });
      expect(injected(host), `${item.kind} ${item.date}`).toBeNull();
    }
    const host = document.createElement('div');
    const slot = trip.items.find((i) => i.kind === 'checkin_slot')!;
    renderDayList(host, trip, slot.city_id, slot.date);
    expect(host.querySelector('.checkin')?.textContent).toContain(PAYLOAD);
  });

  it('keeps the Soft Landing label bold without running stored markup', () => {
    expect(splitGuideText(`<b>Money<script>x</script>.</b> Cards <img src=x> work`)).toEqual({
      label: 'Moneyx',
      detail: 'Cards  work'
    });
  });

  it('drops unsafe accent colours from scene SVG', () => {
    const svg = renderScene('generic', { color: '"/><script>alert(1)</script>', soft: '#fff', ink: 'red' });
    expect(svg).not.toContain('<script');
    expect(svg).toContain('#fff');
  });

  it('escapes city names and to-book rows on the trip page', async () => {
    const trip = hostileTrip();
    vi.resetModules();
    vi.doMock('@/api/travel', async (orig) => ({
      ...(await orig<typeof import('@/api/travel')>()),
      getTrip: vi.fn(async () => ({ trip, version: 'v1' }))
    }));
    vi.doMock('@/api/travel-atlas', () => ({ getAtlas: vi.fn(async () => null) }));
    const { renderTripPage } = await import('@/views/trip-page');
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderTripPage(canvas, trip.id, { isCurrent: () => true });
    expect(canvas.querySelector('.chips')?.textContent).toContain(PAYLOAD);
    for (const row of canvas.querySelectorAll('.tobook li b')) expect(row.textContent).toContain(PAYLOAD);
    expect(injected(canvas)).toBeNull();
    vi.doUnmock('@/api/travel');
    vi.doUnmock('@/api/travel-atlas');
  });
});
