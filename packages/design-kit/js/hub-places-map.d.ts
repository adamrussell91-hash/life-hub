export const MAP_PLACES_TYPE = 'map_places';
export const DEFAULT_MAP_STYLE: string;

export type HubPlace = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  address?: string;
  kind?: string;
  visitIds?: string[];
};

export type MapPlacesPayload = {
  type: 'map_places';
  places: HubPlace[];
  focus?: string;
  title?: string;
};

export function parseMapPlacesPayload(raw: unknown): MapPlacesPayload | null;

export function mapPlacesFromMedicalVisits(
  visits: Array<{
    id?: string;
    location?: string | null;
    location_kind?: string | null;
    title?: string;
    lng?: number;
    lat?: number;
  }>,
  opts?: { coordsByLocation?: Record<string, { lng: number; lat: number }> }
): MapPlacesPayload | null;

export function listMedicalPlaceLabels(
  visits: Array<{
    id?: string;
    location?: string | null;
    location_kind?: string | null;
  }>
): Array<{ name: string; visitIds: string[] }>;

export function mountHubPlacesMap(
  container: HTMLElement,
  payload: MapPlacesPayload | unknown,
  opts?: {
    loadMapLibre?: () => Promise<any>;
    style?: string;
    onSelect?: (place: HubPlace) => void;
  }
): Promise<{
  map: any;
  destroy: () => void;
  focusPlace: (id: string) => void;
} | null>;
