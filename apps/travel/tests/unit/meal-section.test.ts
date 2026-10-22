import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/api/client';
import { samePatch } from '@/journal/edit-moment-sheet';
import {
  canBeMeal,
  EXTRA_MAX,
  mealChanged,
  mealPayload,
  MEAL_MESSAGES,
  RATING_OPTIONS,
  removeDishLabel,
  saveErrorMessage,
  type MealState,
} from '@/journal/meal-section';

describe('meal section', () => {
  it('only your own moments can be meals', () => {
    expect(canBeMeal({ author: 'adam' } as never)).toBe(true);
    expect(canBeMeal({} as never)).toBe(true);
    expect(canBeMeal({ author: 'corey' } as never)).toBe(false);
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

  it('caps the extras at the journal schema limits', () => {
    expect(EXTRA_MAX).toEqual({ mood: 40, vibe: 600, with: 200 });
  });

  it('names the error by what failed', () => {
    const err = (status: number, code = 'x') => new ApiClientError({ code, message: 'm' }, status);
    expect(saveErrorMessage(err(409), 'meal')).toBe(MEAL_MESSAGES.conflict);
    expect(saveErrorMessage(err(409), 'moment')).toBe(MEAL_MESSAGES.conflict);
    expect(saveErrorMessage(err(400), 'meal')).toBe(
      "Couldn't save the meal. Check the dish names and try again.",
    );
    expect(saveErrorMessage(err(400), 'moment')).toBe('Could not save. Try again.');
    expect(saveErrorMessage(err(500), 'meal')).toBe('Could not save. Try again.');
    expect(saveErrorMessage(new Error('offline'), 'meal')).toBe('Could not save. Try again.');
  });

  it('labels Remove by the dish title, or its number when untitled', () => {
    expect(removeDishLabel({ title: ' Tortilla ' }, 0)).toBe('Remove dish Tortilla');
    expect(removeDishLabel({ title: '  ' }, 1)).toBe('Remove dish 2');
  });

  it('sees an identical moment patch so a retry skips the moment save', () => {
    const patch = { text: 'Hi', local_date: '2026-03-01', coordinates: { lat: 1, lon: 2 } };
    expect(samePatch(null, patch)).toBe(false);
    expect(samePatch({ ...patch, place: undefined }, patch)).toBe(true);
    expect(samePatch(patch, { ...patch, text: 'Hello' })).toBe(false);
  });
});
