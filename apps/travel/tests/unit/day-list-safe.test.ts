import { describe, expect, it, vi } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Item, Trip } from '@/types';
import { renderDayList } from '@/views/day-list';

const trip = fixtureTrip as unknown as Trip;

function stopItem(): Item {
  const found = trip.items.find((i) => i.kind === 'do' && !i.private);
  if (!found) throw new Error('fixture missing do stop');
  return found;
}

describe('renderDayList marked safe', () => {
  it('shows Mark safe for the owner and calls onMarkSafe', () => {
    const host = document.createElement('div');
    const onMarkSafe = vi.fn();
    const item = stopItem();
    renderDayList(host, { ...trip, checkins: [] }, item.city_id, item.date, { onMarkSafe });
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Mark safe'));
    expect(btn).toBeTruthy();
    btn!.click();
    expect(onMarkSafe).toHaveBeenCalledWith(expect.objectContaining({ id: item.id }), 'mark');
  });

  it('shows Safe · time and photo on the public link when safe_at is set', () => {
    const host = document.createElement('div');
    const item = stopItem();
    const publicTrip: Trip = {
      ...trip,
      items: trip.items.map((i) =>
        i.id === item.id
          ? ({ ...i, safe_at: '2027-03-04T15:30:00.000Z', safe_photo_id: 'tph_abc' } as Item)
          : i
      )
    };
    renderDayList(host, publicTrip, item.city_id, item.date, {
      isPublic: true,
      shareToken: 'share-token',
      cityTz: 'UTC'
    });
    expect(host.textContent).toMatch(/Safe · 15:30/);
    const img = host.querySelector('img.safe-mark__photo') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.src).toContain('tph_abc');
    expect(img!.src).toContain('token=share-token');
    expect(host.textContent).not.toContain('Mark safe');
  });

  it('reads live check-ins for the owner without redacted fields', () => {
    const host = document.createElement('div');
    const item = stopItem();
    const withCheckin: Trip = {
      ...trip,
      checkins: [
        {
          id: 'chk_1',
          at: '2027-03-04T11:05:00.000Z',
          city_id: item.city_id,
          label: `Safe · ${item.title}`,
          item_id: item.id
        }
      ]
    };
    renderDayList(host, withCheckin, item.city_id, item.date, {
      onMarkSafe: vi.fn(),
      cityTz: 'UTC'
    });
    expect(host.textContent).toMatch(/Safe · 11:05/);
    expect(host.textContent).toContain('Photo');
  });
});
