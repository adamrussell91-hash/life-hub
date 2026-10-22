import { describe, expect, it } from 'vitest';
import { mealPayload, canBeMeal, mealChanged, RATING_OPTIONS, type MealState } from '@/journal/meal-section';

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

  describe('mealChanged', () => {
    const loaded = (): MealState => ({
      title: 'Market lunch',
      dishes: [{ id: 'dish_1', title: 'Tortilla', title_en: 'Omelette', meal_type: 'Lunch', rating: 4, ingredients: 'egg' }],
      extras: { mood: 'buzzing', vibe: '', with: '' },
    });

    it('a newly enabled switch counts as changed', () => {
      expect(mealChanged(null, loaded())).toBe(true);
    });

    it('is unchanged when only whitespace, blank dishes or read-only fields differ', () => {
      const now = loaded();
      now.title = ' Market lunch ';
      now.extras.vibe = '  ';
      now.dishes[0]!.ingredients = 'egg, potato';
      now.dishes.push({ title: ' ', meal_type: 'Dinner', rating: null });
      expect(mealChanged(loaded(), now)).toBe(false);
    });

    it('sees edits to the title, a dish, the dishes or the extras', () => {
      const edits: ((s: MealState) => void)[] = [
        (s) => { s.title = 'Market supper'; },
        (s) => { s.dishes[0]!.rating = 4.5; },
        (s) => { s.dishes[0]!.meal_type = 'Dinner'; },
        (s) => { s.dishes.push({ title: 'Churros', meal_type: 'Dessert', rating: null }); },
        (s) => { s.dishes = []; },
        (s) => { s.extras.with = 'Sam'; },
      ];
      for (const edit of edits) {
        const now = loaded();
        edit(now);
        expect(mealChanged(loaded(), now)).toBe(true);
      }
    });
  });
});
