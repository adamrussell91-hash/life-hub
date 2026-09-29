import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Item, Trip } from '@/types';

const removeItem = vi.fn();
const editItem = vi.fn();
const addItem = vi.fn();
const parseEmail = vi.fn();
const searchPlaces = vi.fn();

vi.mock('@/api/travel', () => ({
  removeItem: (...args: unknown[]) => removeItem(...args),
  editItem: (...args: unknown[]) => editItem(...args),
  addItem: (...args: unknown[]) => addItem(...args),
  parseEmail: (...args: unknown[]) => parseEmail(...args),
  searchPlaces: (...args: unknown[]) => searchPlaces(...args)
}));

import { renderAddForm } from '@/components/add-form';

const trip = fixtureTrip as unknown as Trip;
const editing = trip.items.find((item) => item.id === 'itm_testtodo01') as Item;

function findButton(host: ParentNode, text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.textContent === text);
}

/** Solid (non-ghost) Remove — the in-sheet confirm action. */
function findConfirmRemove(host: ParentNode): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find(
    (b) => b.textContent === 'Remove' && !b.classList.contains('ghost')
  );
}

describe('renderAddForm remove (TR-30)', () => {
  beforeEach(() => {
    removeItem.mockReset();
    editItem.mockReset();
    addItem.mockReset();
  });

  it('shows Remove only when editing, confirms in-sheet, then calls removeItem', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onSaved = vi.fn();
    const onClose = vi.fn();

    renderAddForm(host, {
      trip,
      tripId: trip.id,
      version: 'sha-v1',
      editing,
      onSaved,
      onClose
    });

    const remove = findButton(host, 'Remove');
    expect(remove).toBeTruthy();
    remove!.click();

    expect(host.textContent).toContain('Remove Book Belém tram tickets?');
    const confirm = findConfirmRemove(host);
    expect(confirm).toBeTruthy();

    const nextTrip = {
      ...trip,
      items: trip.items.filter((item) => item.id !== editing.id)
    };
    removeItem.mockResolvedValueOnce({ trip: nextTrip, version: 'sha-v2' });

    confirm!.click();
    await vi.waitFor(() => {
      expect(removeItem).toHaveBeenCalledWith(trip.id, editing.id, 'sha-v1');
      expect(onSaved).toHaveBeenCalledWith(nextTrip, 'sha-v2');
    });
    expect(host.children.length).toBe(0);
    host.remove();
  });

  it('does not show Remove when adding a new item', () => {
    const host = document.createElement('div');
    renderAddForm(host, {
      trip,
      tripId: trip.id,
      version: 'sha-v1',
      onSaved: vi.fn(),
      onClose: vi.fn()
    });
    expect(findButton(host, 'Remove')).toBeUndefined();
  });
});
