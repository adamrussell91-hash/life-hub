import { ApiClientError, apiDelete, apiGet, apiPatch, apiPost, parseApiResponse } from '@/api/client';
import { getApiBaseUrl } from '@/api/config';
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

export function addCheckin(
  tripId: string,
  body: { city_id: string; label: string; item_id?: string; photo_id?: string; if_version?: string }
): Promise<TripEnvelope> {
  return apiPost(`/api/travel-checkins?trip=${encodeURIComponent(tripId)}`, body);
}

export async function uploadTravelPhoto(tripId: string, file: File): Promise<{ photo_id: string }> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${getApiBaseUrl()}/api/travel-photo?trip=${encodeURIComponent(tripId)}`, {
    method: 'POST',
    body: form,
    credentials: 'include'
  });
  const result = await parseApiResponse<{ photo_id: string }>(response);
  if (!result.ok) {
    throw new ApiClientError(result.error, response.status, result.data);
  }
  if (!result.data?.photo_id) {
    throw new ApiClientError({ code: 'invalid_response', message: 'Photo upload failed.' }, response.status);
  }
  return { photo_id: result.data.photo_id };
}

export function travelPhotoUrl(photoId: string, shareToken?: string | null): string {
  const params = new URLSearchParams({ id: photoId });
  if (shareToken) params.set('token', shareToken);
  return `${getApiBaseUrl()}/api/travel-photo?${params.toString()}`;
}

export function createShareLink(tripId: string): Promise<{ url: string }> {
  return apiPost(`/api/travel-share?trip=${encodeURIComponent(tripId)}`);
}

export function revokeShareLink(tripId: string): Promise<{ enabled: false }> {
  return apiDelete(`/api/travel-share?trip=${encodeURIComponent(tripId)}`);
}

export interface PublicTrip {
  trip: Omit<Trip, 'items' | 'checkins' | 'share'> & {
    items: Array<Item & { safe_at?: string; safe_photo_id?: string }>;
    last_checkin: (Pick<Checkin, 'at' | 'item_id' | 'photo_id'> & {
      city_name: string;
      label: string;
    }) | null;
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
