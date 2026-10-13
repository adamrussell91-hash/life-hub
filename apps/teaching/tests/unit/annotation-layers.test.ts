import { describe, expect, it } from 'vitest';
import { resolveAnnotation } from '@/blocks/annotation-anchor';
import {
  activeLayerIds,
  createLayerState,
  markersFor,
  revealedLayers,
  studentStops,
  teacherStops,
  toggleSuppressed
} from '@/blocks/annotation-layers';
import { dulceAnnotationFixture } from '../../fixtures/annotation-dulce';

const layers = dulceAnnotationFixture.content.layers;
const annotations = dulceAnnotationFixture.content.annotations;
const text = dulceAnnotationFixture.content.text;

describe('annotation layers (pure)', () => {
  it('studentStops excludes the teacher layer', () => {
    const stops = studentStops(layers);
    expect(stops.map((l) => l.id)).toEqual(['layer_structure', 'layer_imagery']);
    expect(teacherStops(layers).map((l) => l.kind)).toContain('teacher');
  });

  it('visible set for stop 0, 2, and last', () => {
    const stops = studentStops(layers);
    expect(revealedLayers(stops, 0)).toEqual([]);
    expect(revealedLayers(stops, 2).map((l) => l.id)).toEqual([
      'layer_structure',
      'layer_imagery'
    ]);
    expect(revealedLayers(stops, stops.length)).toHaveLength(stops.length);
  });

  it('toggle off layer 1 at stop 3 leaves later layers active', () => {
    const stops = teacherStops(layers);
    let state = createLayerState(layers, { show_markers: true }, 'teacher');
    expect(state.stop).toBe(stops.length);
    state = toggleSuppressed(state, 'layer_structure');
    const active = activeLayerIds(stops, state);
    expect(active.has('layer_structure')).toBe(false);
    expect(active.has('layer_imagery')).toBe(true);
    expect(active.has('layer_teacher')).toBe(true);
  });

  it('markers list for a given state; show_markers:false gives none', () => {
    const stops = studentStops(layers);
    const state = {
      stop: 0,
      suppressed: new Set<string>(),
      openAnnotationId: null
    };
    const markers = markersFor(
      annotations,
      layers,
      stops,
      state,
      true,
      (ann) => resolveAnnotation(text, ann)
    );
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((m) => m.layerId !== 'layer_teacher')).toBe(true);
    expect(markers.every((m) => m.symbol.length > 0 && m.layerName.length > 0)).toBe(
      true
    );

    const none = markersFor(
      annotations,
      layers,
      stops,
      state,
      false,
      (ann) => resolveAnnotation(text, ann)
    );
    expect(none).toEqual([]);
  });

  it('teacher layer is excluded from the student visible set', () => {
    const stops = studentStops(layers);
    const state = {
      stop: stops.length,
      suppressed: new Set<string>(),
      openAnnotationId: null
    };
    const active = activeLayerIds(stops, state);
    expect(active.has('layer_teacher')).toBe(false);
    const studentState = createLayerState(
      layers,
      { show_markers: true, default_layer_id: 'layer_imagery' },
      'student'
    );
    expect(studentState.stop).toBe(2);
  });
});
