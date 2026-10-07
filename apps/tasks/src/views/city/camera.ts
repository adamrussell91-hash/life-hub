/** Glance camera. Lives outside the paint function so a repaint keeps pan, zoom and turn. */
export type CityCameraState = {
  /** Quarter turns, 0–3. */
  quarter: number;
  zoom: number;
  panX: number;
  panZ: number;
  touched: boolean;
};

const state: CityCameraState = { quarter: 0, zoom: 1, panX: 0, panZ: 0, touched: false };

export function cityCameraState(): CityCameraState {
  return { ...state };
}

export function updateCityCamera(next: Partial<CityCameraState>): void {
  if (next.quarter != null) state.quarter = ((next.quarter % 4) + 4) % 4;
  if (next.zoom != null) state.zoom = Math.min(4, Math.max(0.35, next.zoom));
  if (next.panX != null) state.panX = next.panX;
  if (next.panZ != null) state.panZ = next.panZ;
  if (next.touched != null) state.touched = next.touched;
}

export function resetCityCameraForTests(): void {
  state.quarter = 0;
  state.zoom = 1;
  state.panX = 0;
  state.panZ = 0;
  state.touched = false;
}
