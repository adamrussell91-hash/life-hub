import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { JournalCoordinates } from '@/journal/types';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export interface PinEditorResult {
  coordinates: JournalCoordinates;
  /** Optional label when user did not pick a named place. */
  label?: string;
}

export interface OpenPinEditorOptions {
  initial?: JournalCoordinates;
  anchor: HTMLElement;
  onCommit: (result: PinEditorResult) => void;
  onCancel?: () => void;
}

export interface CoordinateParseResult {
  ok: true;
  coordinates: JournalCoordinates;
}

export interface CoordinateParseError {
  ok: false;
  message: string;
}

export function parseCoordinates(
  latRaw: string,
  lonRaw: string,
): CoordinateParseResult | CoordinateParseError {
  const lat = Number(latRaw.trim());
  const lon = Number(lonRaw.trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, message: 'Latitude and longitude must be valid numbers.' };
  }
  if (lat < -90 || lat > 90) {
    return { ok: false, message: 'Latitude must be between −90 and 90.' };
  }
  if (lon < -180 || lon > 180) {
    return { ok: false, message: 'Longitude must be between −180 and 180.' };
  }
  return { ok: true, coordinates: { lat, lon } };
}

const DEFAULT_CENTER: JournalCoordinates = { lat: 3.14, lon: 101.69 };

/** Interactive pin picker: map pans under a fixed centre crosshair. */
export function openPinEditor(options: OpenPinEditorOptions): { destroy(): void } {
  const start = options.initial ?? DEFAULT_CENTER;
  let committedPreview: JournalCoordinates = { ...start };
  let destroyed = false;

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-back journal-pin-backdrop';

  const panel = document.createElement('div');
  panel.className = 'journal-pin-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Choose location on map');

  const title = document.createElement('h3');
  title.className = 'journal-pin-panel__title';
  title.textContent = 'Choose on map';

  const hint = document.createElement('p');
  hint.className = 'journal-pin-panel__hint';
  hint.textContent = 'Drag the map to position the crosshair. Tap Use this location, then Save in the editor.';

  const mapShell = document.createElement('div');
  mapShell.className = 'journal-pin-panel__map';
  const mapHost = document.createElement('div');
  mapHost.className = 'journal-pin-panel__map-host';
  const crosshair = document.createElement('div');
  crosshair.className = 'journal-pin-panel__crosshair';
  crosshair.setAttribute('aria-hidden', 'true');
  mapShell.append(mapHost, crosshair);

  const advanced = document.createElement('details');
  advanced.className = 'journal-pin-panel__advanced';
  const advancedSummary = document.createElement('summary');
  advancedSummary.textContent = 'Advanced coordinates';
  const coordRow = document.createElement('div');
  coordRow.className = 'journal-pin-panel__coords';
  const latInput = document.createElement('input');
  latInput.type = 'text';
  latInput.inputMode = 'decimal';
  latInput.setAttribute('aria-label', 'Latitude');
  latInput.value = String(start.lat);
  const lonInput = document.createElement('input');
  lonInput.type = 'text';
  lonInput.inputMode = 'decimal';
  lonInput.setAttribute('aria-label', 'Longitude');
  lonInput.value = String(start.lon);
  const coordError = document.createElement('p');
  coordError.className = 'journal-pin-panel__coord-error';
  coordError.hidden = true;
  coordRow.append(
    fieldLabel('Latitude', latInput),
    fieldLabel('Longitude', lonInput),
  );
  advanced.append(advancedSummary, coordRow, coordError);

  const actions = document.createElement('div');
  actions.className = 'journal-pin-panel__actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--secondary';
  cancelBtn.textContent = 'Cancel';
  const useBtn = document.createElement('button');
  useBtn.type = 'button';
  useBtn.className = 'btn btn--primary';
  useBtn.textContent = 'Use this location';

  actions.append(cancelBtn, useBtn);
  panel.append(title, hint, mapShell, advanced, actions);
  backdrop.append(panel);
  options.anchor.append(backdrop);

  let map: MapLibreMap | null = new MapLibreMap({
    container: mapHost,
    style: STYLE_URL,
    center: [start.lon, start.lat],
    zoom: 14,
    cooperativeGestures: true,
    attributionControl: { compact: false },
  });
  const nav = new NavigationControl({ showCompass: false });
  map.addControl(nav, 'bottom-right');
  const navEl = mapHost.parentElement?.querySelector('.maplibregl-ctrl-group');
  if (navEl instanceof HTMLElement) navEl.classList.add('journal-pin-panel__zoom');

  function syncInputsFromCenter(): void {
    if (!map) return;
    const c = map.getCenter();
    committedPreview = { lat: c.lat, lon: c.lng };
    latInput.value = committedPreview.lat.toFixed(6);
    lonInput.value = committedPreview.lon.toFixed(6);
  }

  map.on('moveend', () => syncInputsFromCenter());
  syncInputsFromCenter();

  function applyManualCoords(): boolean {
    const parsed = parseCoordinates(latInput.value, lonInput.value);
    if (!parsed.ok) {
      coordError.textContent = parsed.message;
      coordError.hidden = false;
      return false;
    }
    coordError.hidden = true;
    committedPreview = parsed.coordinates;
    map?.jumpTo({ center: [parsed.coordinates.lon, parsed.coordinates.lat] });
    return true;
  }

  latInput.addEventListener('change', () => applyManualCoords());
  lonInput.addEventListener('change', () => applyManualCoords());

  function finish(committed: boolean): void {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('keydown', onKey);
    map?.remove();
    map = null;
    backdrop.remove();
    if (committed) {
      options.onCommit({ coordinates: committedPreview, label: 'Dropped pin' });
    } else {
      options.onCancel?.();
    }
  }

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      finish(false);
    }
  };
  document.addEventListener('keydown', onKey);

  cancelBtn.addEventListener('click', () => finish(false));
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) finish(false);
  });

  useBtn.addEventListener('click', () => {
    if (advanced.open && !applyManualCoords()) return;
    syncInputsFromCenter();
    finish(true);
  });

  return {
    destroy() {
      finish(false);
    },
  };
}

function fieldLabel(text: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'journal-pin-panel__field';
  const span = document.createElement('span');
  span.textContent = text;
  wrap.append(span, control);
  return wrap;
}
