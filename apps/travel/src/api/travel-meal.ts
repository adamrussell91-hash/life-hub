import { apiDelete, apiGet, apiPut } from '@/api/client';
import type { JournalDocument } from '@/api/journal';

export interface FoodDish {
  id?: string;
  title: string;
  title_en?: string;
  meal_type: string;
  rating: number | null;
  ingredients?: string;
  /** Read only: counted in Brisket, so only the Food Journal can remove it. */
  counted?: boolean;
  /** Read only: `from` is the moment media id a copied photo came from. */
  photos?: { from?: string }[];
}

export interface FoodVisit {
  id: string;
  title: string;
  dishes: FoodDish[];
}

export interface MealRead {
  visit: FoodVisit | null;
  food_version: string | null;
  travel_version: string;
}

export interface MealWrite {
  visit: FoodVisit | null;
  travel: JournalDocument;
  travel_version: string;
  food_version: string | null;
  photo_failed?: boolean;
}

export interface MealPutBody {
  travel_version: string;
  food_version: string | null;
  food: { title: string; dishes: FoodDish[] };
  extras: { mood?: string; vibe?: string; with?: string };
}

export interface MealDeleteBody {
  travel_version: string;
  food_version: string | null;
}

const path = (tripId: string, momentId: string) =>
  `/api/travel-meal?trip=${encodeURIComponent(tripId)}&moment=${encodeURIComponent(momentId)}`;

export const getTravelMeal = (tripId: string, momentId: string) =>
  apiGet<MealRead>(path(tripId, momentId));

export const putTravelMeal = (tripId: string, momentId: string, body: MealPutBody) =>
  apiPut<MealWrite>(path(tripId, momentId), body);

export const deleteTravelMeal = (tripId: string, momentId: string, body: MealDeleteBody) =>
  apiDelete<MealWrite>(path(tripId, momentId), body);
