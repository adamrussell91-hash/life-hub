import { describe, expect, it } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { UNKIND_WORDING, type NoticeCard } from '@/journal/noticing/model';
import { countingCards, type NoticingHistory } from '@/journal/noticing/rules';
import type { Trip } from '@/types';
import testTrip from '../../fixtures/test-trip.json';

const trip = testTrip as unknown as Trip; // Lisbon 3 to 5 March 2027, Porto 5 to 7 March
const journal = lisbonPortoJournal(trip.id) as JournalDocument;
const empty: NoticingHistory = { trips: [], days: [] };
const cardsFor = (day: string, history: NoticingHistory): NoticeCard[] => countingCards({ journal, trip, history, day });
const find = (cards: NoticeCard[], kind: string): NoticeCard | undefined => cards.find((c) => c.kind === kind);

describe('food journal cards', () => {
  const dish = (title: string, rating: number, date: string, moment_id = 'mom_lpdinner1') => ({ date, title, venue: 'Taberna do Cais', rating, moment_id });

  it('best dish: rated above every other on the trip, on the day it was eaten, with three rated', () => {
    const food = { dishes: [dish('Grilled sardines', 5, '2027-03-05'), dish('Soup', 3, '2027-03-03', 'mom_x'), dish('Custard tart', 4, '2027-03-04', 'mom_y')], order_again: [] };
    const card = find(cardsFor('2027-03-05', { ...empty, food }), 'best-dish')!;
    expect(card.headline).toBe('The best thing you have eaten this trip');
    expect(card.body).toBe('Grilled sardines, at Taberna do Cais.');
    expect(card.stats).toEqual([{ value: '5', label: 'out of 5, your rating' }]);
    expect(card.basis).toBe('Rated above the other 2 dishes you have rated on this trip');
    expect(card.momentId).toBe('mom_lpdinner1');
    expect(card.source).toBe('food');
    // Another day, a tie for the top, or only two rated dishes: no card.
    expect(find(cardsFor('2027-03-06', { ...empty, food }), 'best-dish')).toBeUndefined();
    const tie = { ...food, dishes: [...food.dishes, dish('Octopus', 5, '2027-03-04', 'mom_z')] };
    expect(find(cardsFor('2027-03-05', { ...empty, food: tie }), 'best-dish')).toBeUndefined();
    expect(find(cardsFor('2027-03-05', { ...empty, food: { ...food, dishes: food.dishes.slice(0, 2) } }), 'best-dish')).toBeUndefined();
  });

  it('order again: on the first day in a city with a dish marked that way before', () => {
    const food = {
      dishes: [],
      order_again: [
        { city: 'Porto', title: 'Francesinha', venue: 'Café Inventado', date: '2025-06-10' },
        { city: 'Porto', title: 'Custard tart', venue: 'Padaria Inventada', date: '2025-06-09' },
      ],
    };
    const card = find(cardsFor('2027-03-05', { ...empty, food }), 'order-again')!;
    expect(card.headline).toBe('Worth ordering again in Porto');
    expect(card.body).toBe('Francesinha, at Café Inventado. You marked it to order again on 10 June 2025.');
    expect(card.basis).toBe('From your food journal, with 1 more dish marked the same way here');
    expect(find(cardsFor('2027-03-06', { ...empty, food }), 'order-again')).toBeUndefined(); // the second day there
    expect(find(cardsFor('2027-03-03', { ...empty, food }), 'order-again')).toBeUndefined(); // a different city
  });
});

describe('diary card', () => {
  it('shows this date a year or more ago, as a mood word and one line', () => {
    const diary = [
      { date: '2026-03-05', mood: 'content', line: 'Walked the long way home' },
      { date: '2025-03-05', mood: 'restless', line: 'Planted the lemon tree' },
    ];
    const card = find(cardsFor('2027-03-05', { ...empty, diary }), 'diary-on-this-day')!;
    expect(card.source).toBe('diary');
    expect(card.headline).toBe('A year ago today, in your diary');
    expect(card.body).toBe('The mood you wrote down that day: content.');
    expect(card.evidence).toEqual({ label: 'One line from that day', text: 'Walked the long way home' });
    expect(card.basis).toBe('From your diary entry of 5 March 2026');
    // The server answered for a different date than the one now in hand: no card.
    expect(find(cardsFor('2027-03-06', { ...empty, diary }), 'diary-on-this-day')).toBeUndefined();
    expect(find(cardsFor('2027-03-05', { ...empty, diary: [{ date: '2026-03-05', mood: '', line: '' }] }), 'diary-on-this-day')).toBeUndefined();
    const lineOnly = find(cardsFor('2027-03-05', { ...empty, diary: [{ date: '2024-03-05', mood: '', line: 'A quiet day' }] }), 'diary-on-this-day')!;
    expect(lineOnly.headline).toBe('3 years ago today, in your diary');
    expect(lineOnly.body).toBeUndefined();
  });
});

describe('bookshelf card', () => {
  it('names a book whose title names the city or country, on the first day there', () => {
    const books = [
      { title: 'A Winter in Porto', author: 'Invented Author', completed_on: '2026-08-01', place: 'Porto' },
      { title: 'The Portugal Papers', author: '', completed_on: null, place: 'Portugal' },
    ];
    const porto = find(cardsFor('2027-03-05', { ...empty, books }), 'book-on-shelf')!;
    expect(porto.headline).toBe('A Winter in Porto is on your shelf');
    expect(porto.body).toBe('By Invented Author. You finished it on 1 August 2026.');
    expect(porto.basis).toBe('Matched by its title only, which names Porto');
    const country = find(cardsFor('2027-03-03', { ...empty, books }), 'book-on-shelf')!;
    expect(country.headline).toBe('The Portugal Papers is on your shelf');
    expect(country.body).toBeUndefined();
    expect(find(cardsFor('2027-03-04', { ...empty, books }), 'book-on-shelf')).toBeUndefined();
    expect(find(cardsFor('2027-03-06', { ...empty, books }), 'book-on-shelf')).toBeUndefined();
  });
});

describe('every one of these cards', () => {
  it('has a basis line and kind wording', () => {
    const history: NoticingHistory = {
      ...empty,
      food: {
        dishes: [
          { date: '2027-03-05', title: 'Grilled sardines', venue: 'Taberna do Cais', rating: 5, moment_id: 'mom_lpdinner1' },
          { date: '2027-03-03', title: 'Soup', venue: 'A', rating: 3, moment_id: 'a' },
          { date: '2027-03-04', title: 'Tart', venue: 'B', rating: 4, moment_id: 'b' },
        ],
        order_again: [{ city: 'Porto', title: 'Francesinha', venue: 'Café Inventado', date: '2025-06-10' }],
      },
      diary: [{ date: '2026-03-05', mood: 'content', line: 'Walked the long way home' }],
      books: [{ title: 'A Winter in Porto', author: '', completed_on: null, place: 'Porto' }],
    };
    const cards = cardsFor('2027-03-05', history).filter((c) => ['food', 'diary', 'books'].includes(c.source));
    expect(cards.map((c) => c.kind).sort()).toEqual(['best-dish', 'book-on-shelf', 'diary-on-this-day', 'order-again']);
    for (const card of cards) {
      const text = [card.headline, card.body ?? '', card.basis, card.evidence?.text ?? ''].join(' ');
      expect(card.basis.length).toBeGreaterThan(10);
      expect(text).not.toMatch(UNKIND_WORDING);
      expect(text).not.toMatch(/undefined|NaN|null/);
    }
  });
});
