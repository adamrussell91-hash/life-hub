/** View on Map — compact pill that morphs into an embedded Google Map. */

export const DEFAULT_MAP_IMAGE: string;

export function isMappablePlace(
  address?: string | null,
  locationKind?: string | null
): boolean;

export function mapsSearchUrl(address?: string | null): string | null;

export function mapsEmbedUrl(address?: string | null): string | null;

export type ViewOnMapControl = {
  el: HTMLElement;
  trigger: HTMLButtonElement;
  place: HTMLAnchorElement;
};

export function createViewOnMap(options?: {
  locationName?: string;
  address?: string;
  mapsUrl?: string | null;
  mapImageUrl?: string;
  locationKind?: string;
  className?: string;
  createElement?: (tag: string) => any;
  document?: Document;
}): ViewOnMapControl | null;
