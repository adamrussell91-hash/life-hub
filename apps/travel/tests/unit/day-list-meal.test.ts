import { describe, expect, it, vi } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Item, Trip } from '@/types';
import { renderDayList } from '@/views/day-list';

const trip = fixtureTrip as unknown as Trip;
const food = trip.items.find((i) => i.kind === 'food') as Item;

function render(options: Parameters<typeof renderDayList>[4]) {
  const host = document.createElement('div');
  renderDayList(host, { ...trip, checkins: [] }, food.city_id, food.date, options);
  return host;
}

function mealButton(host: HTMLElement, id = food.id): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>(`[data-item-id="${id}"] .meal-log`);
}

describe('Log meal on food stops', () => {
  it("shows a quiet Log meal on a food stop from that stop's day", () => {
    const onLogMeal = vi.fn();
    const host = render({ onLogMeal, today: food.date });
    const btn = mealButton(host);
    expect(btn?.textContent).toContain('Log meal');
    btn!.click();
    expect(onLogMeal).toHaveBeenCalledWith(expect.objectContaining({ id: food.id }), undefined);
  });

  it('stays hidden before the day, on other kinds of stop, and on the public link', () => {
    expect(mealButton(render({ onLogMeal: vi.fn(), today: '2027-03-03' }))).toBeNull();
    const all = render({ onLogMeal: vi.fn(), today: food.date });
    expect(all.querySelectorAll('.meal-log')).toHaveLength(1);
    expect(mealButton(render({ onLogMeal: vi.fn(), today: food.date, isPublic: true }))).toBeNull();
  });

  it('turns into Meal logged once a meal is saved, and reopens it', () => {
    const onLogMeal = vi.fn();
    const host = render({
      onLogMeal,
      today: '2027-03-09',
      mealMomentByItem: new Map([[food.id, 'mom_meal0001']])
    });
    const btn = mealButton(host)!;
    expect(btn.textContent).toContain('Meal logged');
    expect(btn.classList.contains('is-logged')).toBe(true);
    btn.click();
    expect(onLogMeal).toHaveBeenCalledWith(expect.objectContaining({ id: food.id }), 'mom_meal0001');
  });
});
