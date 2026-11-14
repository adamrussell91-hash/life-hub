import { describe, expect, it, vi } from 'vitest';
import { buildMealMoment, inferMealType, withFromTitle } from '@/journal/quick-meal';
import { openQuickMealSheet, type QuickMealDeps } from '@/journal/quick-meal-sheet';
import type { JournalDocument } from '@/api/journal';
import type { Item } from '@/types';

const TZ = 'Australia/Sydney';

function foodStop(partial: Partial<Item> = {}): Item {
  return {
    id: 'itm_lunch0001',
    city_id: 'tst',
    date: '2027-03-04',
    time: '13:00',
    kind: 'food',
    title: 'Lunch at the Point with Sam',
    note: '',
    status: 'planned',
    place: { name: 'The Point Cafe', lat: -33.1, lon: 151.2 },
    created_at: '2027-01-01T00:00:00.000Z',
    updated_at: '2027-01-01T00:00:00.000Z',
    ...partial
  } as Item;
}

function emptyJournal(): JournalDocument {
  return {
    id: 'jrn_testjournal',
    schema_version: 1,
    trip_id: 'trp_test01',
    title: '',
    revision: 0,
    lifecycle: 'live',
    leg_ids: [],
    preferences: {},
    legs: [],
    days: [],
    moments: [],
    media: [],
    transitions: [],
    operations: []
  } as unknown as JournalDocument;
}

describe('quick meal helpers', () => {
  it('reads the meal type from the stop title, then the time', () => {
    expect(inferMealType('Brunch at the mall with Sam', '11:00')).toBe('Breakfast');
    expect(inferMealType('Breakfast at the cafe', '10:00')).toBe('Breakfast');
    expect(inferMealType('Dinner in town', null)).toBe('Dinner');
    expect(inferMealType('Coffee by the beach', '09:00')).toBe('Drinks');
    expect(inferMealType('The Point Cafe', '13:00')).toBe('Lunch');
    expect(inferMealType('The Point Cafe', '08:15')).toBe('Breakfast');
    expect(inferMealType('The Point Cafe', '16:00')).toBe('Snack');
    expect(inferMealType('The Point Cafe', '19:30')).toBe('Dinner');
  });

  it('takes people from a trailing "with" only when it names someone', () => {
    expect(withFromTitle('Lunch at the Point with Sam')).toBe('Sam');
    expect(withFromTitle('Dinner with Ana and Lee')).toBe('Ana and Lee');
    expect(withFromTitle('Coffee with a view')).toBe('');
    expect(withFromTitle('Dinner in town')).toBe('');
  });

  it('builds a moment for the stop, starting the journal when it is empty', () => {
    const { journal, moment } = buildMealMoment(emptyJournal(), foodStop(), {
      now: new Date('2027-03-04T03:05:00Z'), // 14:05 in Sydney (AEDT)
      timeZone: TZ,
      mediaIds: ['med_photo0001'],
      momentId: 'mom_meal0001',
      tripTitle: 'Test trip'
    });
    expect(moment).toMatchObject({
      id: 'mom_meal0001',
      item_id: 'itm_lunch0001',
      local_date: '2027-03-04',
      local_time: '14:05',
      place: { name: 'The Point Cafe' },
      coordinates: { lat: -33.1, lon: 151.2 },
      location_source: 'manual',
      media_ids: ['med_photo0001'],
      lifecycle: 'live'
    });
    expect(journal.legs).toHaveLength(1);
    expect(moment.leg_id).toBe(journal.legs[0]!.id);
    expect(journal.moments).toContainEqual(moment);
  });

  it("uses the stop's own time when logging a past day", () => {
    const { moment } = buildMealMoment(emptyJournal(), foodStop(), {
      now: new Date('2027-03-06T03:05:00Z'),
      timeZone: TZ,
      mediaIds: [],
      momentId: 'mom_meal0002'
    });
    expect(moment.local_time).toBe('13:00');
  });
});

function fakeDeps(over: Partial<QuickMealDeps> = {}): QuickMealDeps & { calls: string[] } {
  const calls: string[] = [];
  let journal = emptyJournal();
  return {
    calls,
    ensureJournal: vi.fn(async () => ({ journal, version: 'v1' })),
    getJournal: vi.fn(async () => ({ journal, version: 'v3' })),
    persist: vi.fn(async (_t: string, _v: string, next: JournalDocument) => {
      calls.push('persist');
      journal = next;
      return { journal: next, version: 'v2' };
    }),
    getMeal: vi.fn(async () => ({ visit: null, food_version: null, travel_version: 'v1' })),
    putMeal: vi.fn(async () => {
      calls.push('putMeal');
      return { visit: null, travel: journal, travel_version: 'v4', food_version: 'f1' };
    }),
    queueMedia: vi.fn(async () => {
      calls.push('queue');
    }),
    dropMedia: vi.fn(async () => {}),
    flush: vi.fn(async () => {
      calls.push('flush');
    }),
    ...over
  } as QuickMealDeps & { calls: string[] };
}

function open(deps: QuickMealDeps, onSaved = vi.fn(), item = foodStop()) {
  const handle = openQuickMealSheet({ tripId: 'trp_test01', item, timeZone: TZ, deps, onSaved, now: () => new Date('2027-03-04T03:05:00Z') });
  const sheet = document.querySelector('.quick-meal') as HTMLElement;
  return { handle, sheet, onSaved };
}

function typeDish(sheet: HTMLElement, value: string, index = 0) {
  const input = sheet.querySelectorAll<HTMLInputElement>('.quick-meal__dish input[type="text"]')[index]!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('quick meal sheet', () => {
  it('opens short: the stop, one dish row, add photo, and the rest folded under More', () => {
    const { sheet, handle } = open(fakeDeps());
    expect(sheet.querySelector('h3')?.textContent).toBe('Lunch at the Point with Sam');
    expect(sheet.textContent).toContain('The Point Cafe');
    expect(sheet.querySelectorAll('.quick-meal__dish')).toHaveLength(1);
    expect((sheet.querySelector('.quick-meal__dish input') as HTMLInputElement).placeholder).toBe('What did you have?');
    expect([...sheet.querySelectorAll('button')].some((b) => b.textContent?.includes('Add photo'))).toBe(true);
    const more = sheet.querySelector('details.quick-meal__more') as HTMLDetailsElement;
    expect(more.open).toBe(false);
    expect((more.querySelector('input[name="with"]') as HTMLInputElement).value).toBe('Sam');
    expect((more.querySelector('select[name="meal_type"]') as HTMLSelectElement).value).toBe('Lunch');
    handle.destroy();
  });

  it('keeps Save off until a dish has a name, and stars set and clear', () => {
    const { sheet, handle } = open(fakeDeps());
    const save = sheet.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    typeDish(sheet, 'Fish tacos');
    expect(save.disabled).toBe(false);
    const star4 = sheet.querySelector('[aria-label="4 stars"]') as HTMLButtonElement;
    star4.click();
    expect(star4.getAttribute('aria-pressed')).toBe('true');
    star4.click();
    expect(star4.getAttribute('aria-pressed')).toBe('false');
    handle.destroy();
  });

  it('saves the moment for the stop, then the meal, then tells the trip page', async () => {
    const deps = fakeDeps();
    const { sheet, onSaved } = open(deps);
    typeDish(sheet, 'Fish tacos');
    (sheet.querySelector('[aria-label="5 stars"]') as HTMLButtonElement).click();
    (sheet.querySelector('.quick-meal__add-dish') as HTMLButtonElement).click();
    typeDish(sheet, 'Lime soda', 1);
    sheet.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());

    expect(deps.calls).toEqual(['persist', 'putMeal']);
    const saved = (deps.persist as ReturnType<typeof vi.fn>).mock.calls[0]![2] as JournalDocument;
    const m = saved.moments[0]!;
    expect(m.item_id).toBe('itm_lunch0001');
    const [tripId, momentId, body] = (deps.putMeal as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(tripId).toBe('trp_test01');
    expect(momentId).toBe(m.id);
    expect(body.travel_version).toBe('v2');
    expect(body.food.title).toBe('The Point Cafe');
    expect(body.food.dishes).toEqual([
      { title: 'Fish tacos', meal_type: 'Lunch', rating: 5 },
      { title: 'Lime soda', meal_type: 'Lunch', rating: null }
    ]);
    expect(body.extras).toEqual({ with: 'Sam' });
    expect(onSaved).toHaveBeenCalledWith(m.id);
    expect(document.querySelector('.quick-meal')).toBeNull();
  });

  it('uploads a photo before the meal so the Food Journal can copy it', async () => {
    const deps = fakeDeps();
    const { sheet, onSaved } = open(deps);
    typeDish(sheet, 'Fish tacos');
    const input = sheet.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File([new Uint8Array(32)], 'tacos.jpg', { type: 'image/jpeg' })], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(sheet.querySelectorAll('.journal-capture__thumb img')).toHaveLength(1));
    sheet.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(deps.calls).toEqual(['queue', 'persist', 'flush', 'putMeal']);
    expect((deps.putMeal as ReturnType<typeof vi.fn>).mock.calls[0]![2].travel_version).toBe('v3');
  });

  it('retries only the meal when the meal call fails, without a second moment', async () => {
    let fail = true;
    const deps = fakeDeps({
      putMeal: vi.fn(async () => {
        if (fail) throw new Error('boom');
        return { visit: null, travel: emptyJournal(), travel_version: 'v5', food_version: 'f1' };
      })
    });
    const { sheet, onSaved } = open(deps);
    typeDish(sheet, 'Fish tacos');
    const form = sheet.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect((sheet.querySelector('[role="alert"]') as HTMLElement).hidden).toBe(false));
    fail = false;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(deps.persist).toHaveBeenCalledTimes(1);
    expect(deps.putMeal).toHaveBeenCalledTimes(2);
  });

  it('reopens a logged meal with its dishes filled in', async () => {
    const deps = fakeDeps({
      getMeal: vi.fn(async () => ({
        visit: { id: 'visit_1', title: 'The Point Cafe', dishes: [{ id: 'dish_1', title: 'Fish tacos', meal_type: 'Lunch', rating: 4 }] },
        food_version: 'f9',
        travel_version: 'v7'
      }))
    });
    const handle = openQuickMealSheet({ tripId: 'trp_test01', item: foodStop(), timeZone: TZ, momentId: 'mom_meal0001', deps, now: () => new Date('2027-03-04T03:05:00Z') });
    const sheet = document.querySelector('.quick-meal') as HTMLElement;
    await vi.waitFor(() =>
      expect((sheet.querySelector('.quick-meal__dish input[type="text"]') as HTMLInputElement | null)?.value).toBe('Fish tacos')
    );
    expect(sheet.querySelector('[aria-label="4 stars"]')?.getAttribute('aria-pressed')).toBe('true');
    handle.destroy();
  });
});
