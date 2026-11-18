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
    const btn = host.querySelector<HTMLButtonElement>('button[aria-label="Mark safe"]');
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
          ? ({
              ...i,
              safe_at: '2027-03-04T15:30:00.000Z',
              safe_photo_id: 'tph_abc'
            } as Item & { safe_at: string; safe_photo_id: string })
          : i
      )
    };
    renderDayList(host, publicTrip, item.city_id, item.date, {
      isPublic: true,
      shareToken: 'share-token',
      cityTz: 'UTC'
    });
    expect(host.querySelector('.safe-mark.is-safe')?.getAttribute('aria-label')).toBe('Safe at 15:30');
    const img = host.querySelector('img.safe-mark__photo') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.src).toContain('tph_abc');
    expect(img!.src).toContain('token=share-token');
    // The API refuses an <img> that does not name its origin (Safari sends Sec-Fetch-Site only).
    expect(img!.crossOrigin).toBe('use-credentials');
    expect(host.querySelector('button[aria-label="Mark safe"]')).toBeNull();
  });

  it('loads the owner\'s safe photo with the session cookie and its origin', () => {
    const host = document.createElement('div');
    const item = stopItem();
    const withPhoto: Trip = {
      ...trip,
      checkins: [
        {
          id: 'chk_1',
          at: '2027-03-04T11:05:00.000Z',
          city_id: item.city_id,
          label: `Safe · ${item.title}`,
          item_id: item.id,
          photo_id: 'tph_owner1'
        }
      ]
    };
    renderDayList(host, withPhoto, item.city_id, item.date, { onMarkSafe: vi.fn(), cityTz: 'UTC' });
    const img = host.querySelector('img.safe-mark__photo') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.src).toContain('id=tph_owner1');
    expect(img!.src).not.toContain('token=');
    expect(img!.crossOrigin).toBe('use-credentials');
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
    expect(host.querySelector('.safe-mark.is-safe')?.getAttribute('aria-label')).toBe('Safe at 11:05');
    expect(host.textContent).toContain('Postcard');
  });

  it('offers Postcard on a safe stop with none, and opens the sheet for it', () => {
    const host = document.createElement('div');
    const onMarkSafe = vi.fn();
    const item = stopItem();
    const ticked: Trip = {
      ...trip,
      checkins: [{ id: 'chk_1', at: '2027-03-04T11:05:00.000Z', city_id: item.city_id, label: 'Safe', item_id: item.id }]
    };
    renderDayList(host, ticked, item.city_id, item.date, { onMarkSafe, cityTz: 'UTC' });
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Postcard');
    expect(btn).toBeTruthy();
    btn!.click();
    expect(onMarkSafe).toHaveBeenCalledWith(expect.objectContaining({ id: item.id }), 'postcard');
  });

  it('shows a stop\'s postcard as a small card that opens it, and no Postcard button', () => {
    const host = document.createElement('div');
    const onOpenPostcard = vi.fn();
    const item = stopItem();
    const posted: Trip = {
      ...trip,
      checkins: [
        {
          id: 'chk_1',
          at: '2027-03-04T11:05:00.000Z',
          city_id: item.city_id,
          label: 'Safe',
          item_id: item.id,
          photo_id: 'tph_card1',
          postcard: {
            photo_id: 'tph_card1',
            orientation: 'portrait',
            address: ['Rua do Exemplo', 'Lisboa'],
            posted_at: '2027-03-04T11:30:00.000Z'
          }
        },
        // A later plain tick does not hide the postcard.
        { id: 'chk_2', at: '2027-03-04T13:00:00.000Z', city_id: item.city_id, label: 'Safe', item_id: item.id }
      ]
    };
    renderDayList(host, posted, item.city_id, item.date, { onMarkSafe: vi.fn(), onOpenPostcard, cityTz: 'UTC' });
    const small = host.querySelector<HTMLButtonElement>('button.safe-mark__postcard');
    expect(small).toBeTruthy();
    expect(small!.dataset.orient).toBe('portrait');
    expect(small!.getAttribute('aria-label')).toBe(`Open the postcard from ${item.title}`);
    expect(small!.querySelector('img')!.src).toContain('id=tph_card1');
    small!.click();
    expect(onOpenPostcard).toHaveBeenCalledWith(item.id);
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Postcard')).toBe(false);
  });

  it('draws the small card as a picture, not a dead button, when nothing can open it', () => {
    const host = document.createElement('div');
    const item = stopItem();
    const posted: Trip = {
      ...trip,
      checkins: [
        { id: 'chk_1', at: '2027-03-04T11:05:00.000Z', city_id: item.city_id, label: 'Safe', item_id: item.id, photo_id: 'tph_old1' }
      ]
    };
    renderDayList(host, posted, item.city_id, item.date, { cityTz: 'UTC' });
    expect(host.querySelector('button.safe-mark__postcard')).toBeNull();
    expect(host.querySelector('span.safe-mark__postcard img')?.getAttribute('alt')).toBe(`Photo from ${item.title}`);
  });
});
