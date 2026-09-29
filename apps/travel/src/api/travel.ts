import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import type { Checkin, Item, ItemDraft, Place, Trip, TripSummary } from '@/types';

export interface TripEnvelope {
  trip: Trip;
  version: string;
}

export interface TripImport {
  title: string;
  start_date: string;
  end_date: string;
  home_tz: string;
  followers_label: string;
  cities: Trip['cities'];
  items: Omit<Item, 'id' | 'created_at' | 'updated_at'>[];
  days: Trip['days'];
}

export function listTrips(): Promise<{ trips: TripSummary[] }> {
  return apiGet('/api/travel-trips');
}

export function createTrip(
  body: { title: string; start_date: string; end_date: string } | { import: TripImport }
): Promise<TripEnvelope> {
  return apiPost('/api/travel-trips', body);
}

export function getTrip(id: string): Promise<TripEnvelope> {
  return apiGet(`/api/travel-trip?id=${encodeURIComponent(id)}`);
}

export function patchTrip(id: string, ifVersion: string, patch: Partial<Trip>): Promise<TripEnvelope> {
  return apiPatch(`/api/travel-trip?id=${encodeURIComponent(id)}`, { if_version: ifVersion, patch });
}

export function deleteTrip(id: string, ifVersion: string): Promise<{ id: string; deleted: true }> {
  return apiDelete(`/api/travel-trip?id=${encodeURIComponent(id)}`, { if_version: ifVersion });
}

export function addItem(tripId: string, ifVersion: string, item: ItemDraft): Promise<TripEnvelope> {
  return apiPost(`/api/travel-items?trip=${encodeURIComponent(tripId)}`, { if_version: ifVersion, item });
}

export function editItem(
  tripId: string,
  itemId: string,
  ifVersion: string,
  item: ItemDraft
): Promise<TripEnvelope> {
  return apiPatch(
    `/api/travel-items?trip=${encodeURIComponent(tripId)}&id=${encodeURIComponent(itemId)}`,
    { if_version: ifVersion, item }
  );
}

export function removeItem(tripId: string, itemId: string, ifVersion: string): Promise<TripEnvelope> {
  return apiDelete(
    `/api/travel-items?trip=${encodeURIComponent(tripId)}&id=${encodeURIComponent(itemId)}`,
    { if_version: ifVersion }
  );
}

export function addCheckin(tripId: string, cityId: string, label: string): Promise<TripEnvelope> {
  return apiPost(`/api/travel-checkins?trip=${encodeURIComponent(tripId)}`, { city_id: cityId, label });
}

export function createShareLink(tripId: string): Promise<{ url: string }> {
  return apiPost(`/api/travel-share?trip=${encodeURIComponent(tripId)}`);
}

export function revokeShareLink(tripId: string): Promise<{ enabled: false }> {
  return apiDelete(`/api/travel-share?trip=${encodeURIComponent(tripId)}`);
}

export interface PublicTrip {
  trip: Omit<Trip, 'items' | 'checkins' | 'share'> & {
    items: Item[];
    last_checkin: (Pick<Checkin, 'at'> & { city_name: string; label: string }) | null;
  };
}

export function getPublicTrip(token: string): Promise<PublicTrip> {
  return apiGet(`/api/travel-public?token=${encodeURIComponent(token)}`);
}

export function searchPlaces(q: string, lat?: number, lon?: number): Promise<{ places: Place[] }> {
  const params = new URLSearchParams({ q });
  if (lat !== undefined) params.set('lat', String(lat));
  if (lon !== undefined) params.set('lon', String(lon));
  return apiGet(`/api/travel-places?${params.toString()}`);
}

export function getRate(from: string): Promise<{ from: string; to: 'AUD'; rate: number; date: string }> {
  return apiGet(`/api/travel-rates?from=${encodeURIComponent(from)}`);
}

export interface ParseResult {
  draft: ItemDraft;
  confidence: 'high' | 'low';
  missing: string[];
}

export function parseEmail(text: string): Promise<ParseResult> {
  return apiPost('/api/travel-parse', { text });
}
