import type { AnchorResolveResult } from '@/blocks/annotation-anchor';
import type {
  AnnotationBlock,
  AnnotationItem,
  AnnotationLayer
} from '@/schemas/block';

export type AnnotationLayerState = {
  /** 0 = Text only; n = layers[0..n-1] revealed. */
  stop: number;
  /** Layer or sub-layer ids currently toggled off (hidden despite being revealed). */
  suppressed: Set<string>;
  openAnnotationId: string | null;
  /** Thread focus (3b). Resets on load — never persisted. */
  focusThreadId: string | null;
  /** ± lines of context kept around each stop in fold view. */
  context: 0 | 1;
  /** Fold bar ids currently expanded. */
  expandedFolds: Set<string>;
  /** Step-through index when active; null = focus without step captions. */
  stepIndex: number | null;
};

export type AnnotationMarker = {
  annotationId: string;
  layerId: string;
  layerName: string;
  colour: AnnotationLayer['colour'];
  symbol: string;
  stanzaId: string;
  lineId?: string;
  start?: number;
  end?: number;
};

/** Layers shown on the student / print slider (never teacher). */
export function studentStops(layers: AnnotationLayer[]): AnnotationLayer[] {
  return layers.filter((layer) => layer.kind !== 'teacher');
}

/** Teacher mode stops: non-teacher layers, then teacher notes last if present. */
export function teacherStops(layers: AnnotationLayer[]): AnnotationLayer[] {
  const student = studentStops(layers);
  const teacher = layers.filter((layer) => layer.kind === 'teacher');
  return [...student, ...teacher];
}

export function stopsForMode(
  layers: AnnotationLayer[],
  mode: 'teacher' | 'student' | 'print'
): AnnotationLayer[] {
  return mode === 'teacher' ? teacherStops(layers) : studentStops(layers);
}

export function clampStop(stop: number, stopCount: number): number {
  if (stopCount <= 0) return 0;
  return Math.max(0, Math.min(stop, stopCount));
}

export function createLayerState(
  layers: AnnotationLayer[],
  settings: AnnotationBlock['content']['settings'],
  mode: 'teacher' | 'student' | 'print'
): AnnotationLayerState {
  const stops = stopsForMode(layers, mode);
  // Ticks are the visibility control. Layers up to the student default start
  // ticked; anything after that starts unticked. Teachers start with every tick on.
  let revealed = 0;
  if (mode === 'teacher') {
    revealed = stops.length;
  } else if (settings.default_layer_id) {
    const idx = stops.findIndex((layer) => layer.id === settings.default_layer_id);
    if (idx >= 0) revealed = idx + 1;
  }
  const suppressed = new Set<string>();
  for (const layer of stops.slice(revealed)) suppressed.add(layer.id);
  return {
    stop: stops.length,
    suppressed,
    openAnnotationId: null,
    // Thread focus fields reset on every load — never persisted (slice 3b).
    focusThreadId: null,
    context: settings.thread_context === 1 ? 1 : 0,
    expandedFolds: new Set(),
    stepIndex: null
  };
}

/** Layers revealed by the slider stop (not yet applying chip toggles). */
export function revealedLayers(
  stops: AnnotationLayer[],
  stop: number
): AnnotationLayer[] {
  return stops.slice(0, clampStop(stop, stops.length));
}

/**
 * Layer ids currently drawn as full annotations.
 * A revealed layer is active unless suppressed. A suppressed sub-layer id
 * hides annotations on that sub-layer only; suppressing a layer id hides all
 * of its annotations (including those with sublayers).
 */
export function activeLayerIds(
  stops: AnnotationLayer[],
  state: AnnotationLayerState
): Set<string> {
  const active = new Set<string>();
  for (const layer of revealedLayers(stops, state.stop)) {
    if (!state.suppressed.has(layer.id)) active.add(layer.id);
  }
  return active;
}

export function isAnnotationActive(
  annotation: AnnotationItem,
  activeIds: Set<string>,
  suppressed: Set<string>
): boolean {
  if (!activeIds.has(annotation.layer_id)) return false;
  if (annotation.sublayer_id && suppressed.has(annotation.sublayer_id)) return false;
  return true;
}

/** Markers for annotations on the slider path that are not currently drawn. */
export function markersFor(
  annotations: AnnotationItem[],
  layers: AnnotationLayer[],
  stops: AnnotationLayer[],
  state: AnnotationLayerState,
  showMarkers: boolean,
  resolve: (annotation: AnnotationItem) => AnchorResolveResult,
  techniqueSymbol?: (annotation: AnnotationItem) => string | undefined
): AnnotationMarker[] {
  if (!showMarkers) return [];

  const activeIds = activeLayerIds(stops, state);
  const layerMap = new Map(layers.map((layer) => [layer.id, layer]));
  const stopIds = new Set(stops.map((layer) => layer.id));
  const out: AnnotationMarker[] = [];

  for (const annotation of annotations) {
    if (!stopIds.has(annotation.layer_id)) continue;
    // Skip annotations already shown as anchors / bars.
    if (isAnnotationActive(annotation, activeIds, state.suppressed)) continue;
    // A layer (or sub-layer) the reader switched off stays quiet: markers only
    // hint at layers the slider has not reached yet.
    if (state.suppressed.has(annotation.layer_id)) continue;
    if (annotation.sublayer_id && state.suppressed.has(annotation.sublayer_id)) continue;

    const resolved = resolve(annotation);
    if (resolved.status !== 'ok') continue;
    const layer = layerMap.get(annotation.layer_id);
    if (!layer) continue;

    const techSym = techniqueSymbol?.(annotation);
    out.push({
      annotationId: annotation.id,
      layerId: layer.id,
      layerName: layer.name,
      colour: layer.colour,
      // Technique symbol (e.g. "Vi") when tagged; otherwise a plain dot.
      symbol: techSym?.trim() ?? '',
      stanzaId: resolved.stanzaId,
      lineId: resolved.lineId,
      start: resolved.start,
      end: resolved.end
    });
  }
  return out;
}

export function toggleSuppressed(
  state: AnnotationLayerState,
  id: string
): AnnotationLayerState {
  const suppressed = new Set(state.suppressed);
  if (suppressed.has(id)) suppressed.delete(id);
  else suppressed.add(id);
  return { ...state, suppressed };
}
