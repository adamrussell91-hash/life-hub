import { describe, expect, it } from 'vitest';
import { mealPayload, canBeMeal, RATING_OPTIONS } from '@/journal/meal-section';

describe('meal section', () => {
  it('only your own moments can be meals', () => {
    expect(canBeMeal({ author: 'adam' } as never)).toBe(true);
    expect(canBeMeal({} as never)).toBe(true);
    expect(canBeMeal({ author: 'Redacted' } as never)).toBe(false);
  });

  it('builds the PUT body from the form state, dropping empty extras and blank dishes', () => {
    expect(
      mealPayload(
        {
          title: 'Market lunch',
          dishes: [
            { id: 'dish_1', title: 'Tortilla', meal_type: 'Lunch', rating: 4 },
            { id: 'dish_2', title: '  ', meal_type: 'Lunch', rating: null },
          ],
          extras: { mood: 'buzzing', vibe: '', with: '' },
        },
        { travel_version: 'a', food_version: 'b' },
      ),
    ).toEqual({
      travel_version: 'a',
      food_version: 'b',
      food: { title: 'Market lunch', dishes: [{ id: 'dish_1', title: 'Tortilla', meal_type: 'Lunch', rating: 4 }] },
      extras: { mood: 'buzzing' },
    });
  });

  it('trims text, leaves out a missing dish id and keeps a blank rating as null', () => {
    expect(
      mealPayload(
        {
          title: '  Harbour supper ',
          dishes: [{ title: ' Grilled squid ', meal_type: 'Dinner', rating: null }],
          extras: { mood: '  ', vibe: ' loud ', with: 'Sam' },
        },
        { travel_version: 'a', food_version: null },
      ),
    ).toEqual({
      travel_version: 'a',
      food_version: null,
      food: { title: 'Harbour supper', dishes: [{ title: 'Grilled squid', meal_type: 'Dinner', rating: null }] },
      extras: { vibe: 'loud', with: 'Sam' },
    });
  });

  it('offers no rating, then 1 to 5 in half steps', () => {
    expect(RATING_OPTIONS).toEqual([null, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  });
});
