import type { TerrainCanvas } from "./atlasTerrain";

/**
 * Chrome shared by the Atlas (one book) and the Islands (the shelf): the zoom
 * and full-screen controls, the drifting sky, and the terrain's surf layer.
 * One surface, one set of styles (failure register S1).
 */

const ICON = {
  full: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>`,
  leave: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/></svg>`,
  fit: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3"/><circle cx="8" cy="8" r="2"/></svg>`,
};

export function mapControlsHtml(fitLabel: string) {
  return `<div class="atlas__controls" role="group" aria-label="Map controls">
      <button class="hub-icon-btn atlas__zoom" type="button" data-full aria-pressed="false" aria-label="Full screen">${ICON.full}</button>
      <button class="hub-icon-btn atlas__zoom" type="button" data-zoom="in" aria-label="Zoom in">+</button>
      <button class="hub-icon-btn atlas__zoom" type="button" data-zoom="out" aria-label="Zoom out">−</button>
      <button class="hub-icon-btn atlas__zoom" type="button" data-zoom="fit" aria-label="${fitLabel}">${ICON.fit}</button>
    </div>`;
}

/** Under the land: the light on the water (tinted by the hour) and the stars it reflects at night. */
export const MAP_SEA_HTML = `<div class="atlas__tide" aria-hidden="true"></div><div class="atlas__stars" aria-hidden="true"></div>`;

/** Over the land, under the names: slow clouds, then the air (gulls, shooting stars). */
export const MAP_SKY_HTML = `<div class="atlas__sky" aria-hidden="true"><i></i><i></i><i></i></div><div class="atlas__air" aria-hidden="true"></div>`;

/** The land canvas plus its surf, positioned by the view on every frame. */
export function terrainLayers(terrain: TerrainCanvas): HTMLCanvasElement[] {
  terrain.className = "atlas__terrain";
  if (!terrain.surf) return [terrain];
  terrain.surf.className = "atlas__surf";
  return [terrain, terrain.surf];
}

export function positionTerrain(terrain: TerrainCanvas, worldWidth: number, scale: number, ox: number, oy: number) {
  const res = terrain.width / worldWidth;
  terrain.style.transform = `translate(${ox}px, ${oy}px) scale(${scale / res})`;
  if (terrain.surf) terrain.surf.style.transform = `translate(${ox}px, ${oy}px) scale(${(scale * worldWidth) / terrain.surf.width})`;
}

/** The layer that carries world-space decoration (sea life) with the land. */
export function positionWorld(layer: HTMLElement, scale: number, ox: number, oy: number) {
  layer.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
}

/**
 * The god's-eye view: from the whole world you see only land, sea and weather.
 * Zoom past it and the sea's life (and the notes' landmarks) fade into view.
 * `closer` is the current scale over the scale that fits the whole map.
 */
export function revealAt(root: HTMLElement, closer: number) {
  const reveal = Math.max(0, Math.min(1, (closer - 1.2) / 0.9));
  root.style.setProperty("--reveal", reveal.toFixed(3));
  if (reveal > 0.02) root.dataset.revealed = "";
  else delete root.dataset.revealed;
}

/**
 * Full screen: the browser's own where it has one (desktop), otherwise the map
 * fills the window above the page and its chat button. Esc leaves either way.
 */
export function wireFullScreen(root: HTMLElement, onChange: () => void): () => void {
  const button = root.querySelector<HTMLButtonElement>("[data-full]");
  if (!button) return () => {};
  let on = false;
  const set = (next: boolean) => {
    if (next === on) return;
    on = next;
    root.classList.toggle("is-expanded", on);
    document.body.classList.toggle("is-map-expanded", on);
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? "Leave full screen" : "Full screen");
    button.innerHTML = on ? ICON.leave : ICON.full;
    if (on && document.fullscreenEnabled && root.requestFullscreen) root.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
    onChange();
  };
  button.onclick = () => set(!on);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && on && !document.fullscreenElement) set(false);
  };
  const onFullscreen = () => {
    if (on && document.fullscreenElement !== root) set(false);
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("fullscreenchange", onFullscreen);
  return () => {
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("fullscreenchange", onFullscreen);
    if (document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
    document.body.classList.remove("is-map-expanded");
  };
}
