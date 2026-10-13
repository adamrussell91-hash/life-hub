import { beforeAll, describe, expect, it } from 'vitest';
import {
  FAMILY_PALETTE,
  loadLiteraryElements,
  lookupTechnique,
  subgroupsOf,
  type LiteraryElementsTable
} from '@/blocks/literary-elements';
import { applyTechniqueTag } from '@/blocks/annotation-technique';
import type { AnnotationItem, AnnotationLayer } from '@/schemas/block';

let table: LiteraryElementsTable;

beforeAll(async () => {
  table = await loadLiteraryElements();
});

describe('literary-elements snapshot', () => {
  it('has 5 families, 21 subgroups, and 280–340 techniques', () => {
    expect(table.families).toHaveLength(5);
    expect(table.subgroups).toHaveLength(21);
    expect(table.techniques.length).toBeGreaterThanOrEqual(280);
    expect(table.techniques.length).toBeLessThanOrEqual(340);
  });

  it('has unique technique ids and symbols', () => {
    const ids = table.techniques.map((t) => t.id);
    const symbols = table.techniques.map((t) => t.symbol);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it('resolves every related id', () => {
    const ids = new Set(table.techniques.map((t) => t.id));
    for (const tech of table.techniques) {
      for (const related of tech.related) {
        expect(ids.has(related)).toBe(true);
      }
    }
  });

  it('gives every family a colour and every subgroup at least one technique', () => {
    for (const family of table.families) {
      expect(family.colour).toMatch(/^#/);
      expect(FAMILY_PALETTE[family.key]).toBeTruthy();
      expect(subgroupsOf(table, family.key).length).toBeGreaterThan(0);
    }
    for (const sg of table.subgroups) {
      expect(table.techniques.some((t) => t.subgroup === sg.id)).toBe(true);
    }
  });
});

describe('applyTechniqueTag', () => {
  function baseAnnotation(layerId: string): AnnotationItem {
    return {
      id: 'ann_1',
      layer_id: layerId,
      anchor: {
        granularity: 'word',
        stanza: 'stanza_1',
        line: 'line_1',
        start: 0,
        end: 4,
        quote: { exact: 'word' }
      },
      body: { html: '<p></p>', attachments: [] },
      created_at: '2026-10-13T00:00:00.000Z',
      updated_at: '2026-10-13T00:00:00.000Z'
    };
  }

  it('tags Enjambment onto the Structural family layer', () => {
    const enjambment = lookupTechnique(table, 'enjambment');
    expect(enjambment).toBeTruthy();
    const result = applyTechniqueTag({
      table,
      techniqueId: 'enjambment',
      annotation: baseAnnotation('missing'),
      layers: [],
      blockId: 'block_a',
      keepLayer: false,
      now: '2026-10-13T01:00:00.000Z'
    });
    expect(result).toBeTruthy();
    expect(result!.familyKey).toBe('Structural');
    expect(result!.colour).toBe(FAMILY_PALETTE.Structural);
    expect(result!.symbol).toBe(enjambment!.symbol);
    expect(result!.subgroupId).toBe(enjambment!.subgroup);
    expect(result!.layers[0]?.kind).toBe('family');
    expect(result!.layers[0]?.family).toBe('Structural');
    expect(result!.annotation.technique).toEqual({
      id: 'enjambment',
      table_version: table.version
    });
    expect(result!.annotation.layer_id).toBe(result!.layers[0]!.id);
  });

  it('tags one technique from each family onto the matching family layer', () => {
    const picks = table.families.map((family) => {
      const sg = subgroupsOf(table, family.key)[0]!;
      const tech = table.techniques.find((t) => t.subgroup === sg.id)!;
      return { family, tech };
    });
    expect(picks).toHaveLength(5);

    let layers: AnnotationLayer[] = [];
    for (const pick of picks) {
      const result = applyTechniqueTag({
        table,
        techniqueId: pick.tech.id,
        annotation: baseAnnotation('missing'),
        layers,
        blockId: 'block_b',
        keepLayer: false,
        now: '2026-10-13T01:00:00.000Z'
      });
      expect(result).toBeTruthy();
      expect(result!.familyKey).toBe(pick.family.key);
      expect(result!.colour).toBe(FAMILY_PALETTE[pick.family.key]);
      expect(result!.symbol).toBe(pick.tech.symbol);
      layers = result!.layers;
    }
    expect(layers.filter((layer) => layer.kind === 'family')).toHaveLength(5);
  });

  it('keeps a free layer when keepLayer is true', () => {
    const layers = [
      {
        id: 'layer_free',
        name: 'My notes',
        kind: 'free' as const,
        colour: 'wave' as const,
        symbol: 'Mn'
      }
    ];
    const result = applyTechniqueTag({
      table,
      techniqueId: 'enjambment',
      annotation: baseAnnotation('layer_free'),
      layers,
      blockId: 'block_c',
      keepLayer: true,
      now: '2026-10-13T01:00:00.000Z'
    });
    expect(result!.annotation.layer_id).toBe('layer_free');
    expect(result!.annotation.technique?.id).toBe('enjambment');
    expect(result!.layers).toHaveLength(1);
  });
});
