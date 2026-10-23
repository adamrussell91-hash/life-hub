import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JournalDocument } from '@/api/journal';

const meal = vi.hoisted(() => ({
  getTravelMeal: vi.fn(),
  putTravelMeal: vi.fn(),
  deleteTravelMeal: vi.fn(),
}));
const save = vi.hoisted(() => ({ persistJournalPatch: vi.fn() }));
const travel = vi.hoisted(() => ({
  getRate: vi.fn(async () => ({ from: 'JPY', to: 'AUD', rate: 0.01, date: '2026-11-18' })),
  getTrip: vi.fn(),
  searchPlaces: vi.fn(),
}));

vi.mock('@/api/travel-meal', () => meal);
vi.mock('@/journal/journal-sheet-save', () => save);
vi.mock('@/api/travel', () => travel);

import { openEditMomentSheet } from '@/journal/edit-moment-sheet';
import { ATLAS_PREF_KEY, type MaccasItem } from '@/atlas/maccas';
import { MACCAS_SWITCH_CONFIRM } from '@/journal/meal-section';

const trip = {
  id: 'trp_invented01',
  cities: [{ id: 'osa', name: 'Osaka', country: 'Japan', local_currency: 'JPY' }],
} as unknown as import('@/types').Trip;

function journal(meal?: { food_visit_id: string }): JournalDocument {
  return {
    id: 'jrn_aaaaaaaa',
    schema_version: 1,
    trip_id: 'trp_invented01',
    title: '',
    revision: 1,
    lifecycle: 'live',
    leg_ids: ['leg_osaka01'],
    preferences: {},
    legs: [{ id: 'leg_osaka01', trip_id: 'trp_invented01', pattern_id: 'p', destination: 'Osaka', timezone: 'Asia/Tokyo', order: 0, lifecycle: 'live', city_id: 'osa' }],
    days: [],
    moments: [{ id: 'mom_lunch01', leg_id: 'leg_osaka01', local_date: '2026-11-18', media_ids: [], display_order: 0, lifecycle: 'live', ...(meal ? { meal } : {}) }],
    media: [],
    transitions: [],
    operations: [],
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
}

function maccasSwitch(anchor: HTMLElement): HTMLInputElement {
  return anchor.querySelector<HTMLInputElement>('.journal-edit-moment__maccas-switch input')!;
}

function mealSwitch(anchor: HTMLElement): HTMLInputElement {
  return anchor.querySelector<HTMLInputElement>('.journal-edit-moment__meal-switch:not(.journal-edit-moment__maccas-switch):not(.maccas-row__bigmac) input')!;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('Maccas run on the moment sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    save.persistJournalPatch.mockImplementation(async (_trip: string, _v: string, j: JournalDocument) => ({ journal: j, version: 'v2' }));
  });

  it('saves items into the trip journal and never writes to the Food Journal', async () => {
    meal.getTravelMeal.mockResolvedValue({ visit: null, food_version: 'f1', travel_version: 'v1' });
    const j = journal();
    const anchor = document.createElement('div');
    const handle = openEditMomentSheet({ tripId: j.trip_id, journal: j, version: 'v1', moment: j.moments[0]!, anchor, trip });
    await flush();

    const sw = maccasSwitch(anchor);
    sw.checked = true;
    sw.dispatchEvent(new Event('change'));
    expect(mealSwitch(anchor).checked).toBe(false);

    const row = anchor.querySelector('.maccas-row')!;
    const [name, amount] = [...row.querySelectorAll<HTMLInputElement>('input[type="text"]')];
    type(name!, 'Big Mac');
    expect(row.querySelector<HTMLInputElement>('.maccas-row__bigmac input')!.checked).toBe(true);
    expect(row.querySelector<HTMLSelectElement>('select')!.value).toBe('classic');
    type(amount!, '480');

    anchor.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(meal.putTravelMeal).not.toHaveBeenCalled();
    expect(meal.deleteTravelMeal).not.toHaveBeenCalled();
    expect(save.persistJournalPatch).toHaveBeenCalledTimes(1);
    const saved = save.persistJournalPatch.mock.calls[0]![2] as JournalDocument;
    const items = Object.values(saved.preferences[ATLAS_PREF_KEY] as Record<string, MaccasItem>);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: 'Big Mac', big_mac: true, country: 'JP', city: 'Osaka',
      price: { amount: 480, currency: 'JPY' }, aud: { amount: 4.8, rate: 0.01 },
    });
    handle.destroy();
  });

  it('asks before turning a Food Journal meal into a Maccas run, then removes the visit', async () => {
    meal.getTravelMeal.mockResolvedValue({
      visit: { id: 'vis_1', title: 'Lunch', dishes: [{ id: 'd1', title: 'Ramen', meal_type: 'Lunch', rating: null }] },
      food_version: 'f1',
      travel_version: 'v1',
    });
    meal.deleteTravelMeal.mockResolvedValue({ travel: journal(), travel_version: 'v3', visit: null });
    const j = journal({ food_visit_id: 'vis_1' });
    const anchor = document.createElement('div');
    const handle = openEditMomentSheet({ tripId: j.trip_id, journal: j, version: 'v1', moment: j.moments[0]!, anchor, trip });
    await flush();

    const sw = maccasSwitch(anchor);
    sw.checked = true;
    sw.dispatchEvent(new Event('change'));
    const confirm = anchor.querySelector<HTMLElement>('.journal-edit-moment__maccas-confirm')!;
    expect(confirm.hidden).toBe(false);
    expect(confirm.textContent).toContain(MACCAS_SWITCH_CONFIRM);
    expect(sw.checked).toBe(false);
    expect(mealSwitch(anchor).checked).toBe(true);

    [...confirm.querySelectorAll('button')].find((b) => b.textContent === 'Make it a Maccas run')!.click();
    expect(sw.checked).toBe(true);
    expect(mealSwitch(anchor).checked).toBe(false);

    type(anchor.querySelector<HTMLInputElement>('.maccas-row input[type="text"]')!, 'Ebi Filet-O');
    anchor.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(meal.putTravelMeal).not.toHaveBeenCalled();
    expect(meal.deleteTravelMeal).toHaveBeenCalledTimes(1);
    const saved = save.persistJournalPatch.mock.calls[0]![2] as JournalDocument;
    expect(Object.values(saved.preferences[ATLAS_PREF_KEY] as Record<string, MaccasItem>)[0]!.name).toBe('Ebi Filet-O');
    handle.destroy();
  });

  it('needs an item before a Maccas run saves', async () => {
    meal.getTravelMeal.mockResolvedValue({ visit: null, food_version: null, travel_version: 'v1' });
    const j = journal();
    const anchor = document.createElement('div');
    const handle = openEditMomentSheet({ tripId: j.trip_id, journal: j, version: 'v1', moment: j.moments[0]!, anchor, trip });
    await flush();
    const sw = maccasSwitch(anchor);
    sw.checked = true;
    sw.dispatchEvent(new Event('change'));
    anchor.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(save.persistJournalPatch).not.toHaveBeenCalled();
    expect(anchor.querySelector('.journal-edit-moment__status')!.textContent).toBe('Add at least one Maccas item.');
    handle.destroy();
  });
});
