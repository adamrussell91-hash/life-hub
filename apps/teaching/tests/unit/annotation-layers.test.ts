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
    expect(studentStops(layers).map((l) => l.id)).toEqual([
      'layer_structure',
      'layer_imagery'
    ]);
    expect(teacherStops(layers).map((l) => l.kind)).toContain('teacher');
  });

  it('revealedLayers covers stop 0, mid, and last', () => {
    const stops = studentStops(layers);
    expect(revealedLayers(stops, 0)).toEqual([]);
    expect(revealedLayers(stops, 2).map((l) => l.id)).toEqual([
      'layer_structure',
      'layer_imagery'
    ]);
    expect(revealedLayers(stops, stops.length)).toHaveLength(stops.length);
  });

  it('suppressing an early layer leaves later revealed layers active', () => {
    const stops = teacherStops(layers);
    let state = createLayerState(layers, { show_markers: true }, 'teacher');
    expect(state.stop).toBe(stops.length);
    state = toggleSuppressed(state, 'layer_structure');
    const active = activeLayerIds(stops, state);
    expect(active.has('layer_structure')).toBe(false);
    expect(active.has('layer_imagery')).toBe(true);
    expect(active.has('layer_teacher')).toBe(true);
  });

  it('markersFor lists hidden-layer markers; show_markers false yields none', () => {
    const stops = studentStops(layers);
    const state = {
      stop: 0,
      suppressed: new Set<string>(),
      openAnnotationId: null,
      focusThreadId: null,
      context: 0 as const,
      expandedFolds: new Set<string>(),
      stepIndex: null
    };
    const resolve = (ann: (typeof annotations)[number]) => resolveAnnotation(text, ann);
    const markers = markersFor(annotations, layers, stops, state, true, resolve);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((m) => m.layerId !== 'layer_teacher')).toBe(true);
    // Untagged notes draw a plain dot (empty symbol); every marker names its layer.
    expect(markers.every((m) => m.layerName.length > 0)).toBe(true);
    expect(markersFor(annotations, layers, stops, state, false, resolve)).toEqual([]);
  });

  it('student mode never activates the teacher layer; default_layer_id sets stop', () => {
    const stops = studentStops(layers);
    const active = activeLayerIds(stops, {
      stop: stops.length,
      suppressed: new Set<string>(),
      openAnnotationId: null,
      focusThreadId: null,
      context: 0,
      expandedFolds: new Set(),
      stepIndex: null
    });
    expect(active.has('layer_teacher')).toBe(false);
    expect(
      createLayerState(
        layers,
        { show_markers: true, default_layer_id: 'layer_imagery' },
        'student'
      ).stop
    ).toBe(2);
  });
});
