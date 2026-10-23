import { apiGet, apiPut } from '@/api/client';
import { getApiBaseUrl } from '@/api/config';
import type { MaccasItem } from '@/atlas/maccas';

export interface AtlasSettings {
  home_big_mac_aud: number | null;
}

export interface AtlasRead {
  items: MaccasItem[];
  settings: AtlasSettings;
  settings_version: string | null;
}

/** Every live Atlas item, or one trip's with `tripId`. */
export function getAtlas(tripId?: string): Promise<AtlasRead> {
  const query = tripId ? `?trip=${encodeURIComponent(tripId)}` : '';
  return apiGet<AtlasRead>(`/api/travel-atlas${query}`);
}

export function saveAtlasHome(
  home: number | null,
  settingsVersion: string | null,
): Promise<Omit<AtlasRead, 'items'>> {
  return apiPut(`/api/travel-atlas`, { home_big_mac_aud: home, settings_version: settingsVersion });
}

/** Private artwork by slot; the page draws its own badge when a slot is missing. */
export function atlasAssetUrl(slot: string): string {
  return `${getApiBaseUrl()}/api/travel-atlas-asset?slot=${encodeURIComponent(slot)}`;
}
