import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  collectAnthology,
  normaliseTag,
  type AnthologySnapshot
} from '@/blocks/anthology-collect';
import { createBlock } from '@/blocks/create-block';
import { BlockSchema } from '@/schemas/block';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/annotation-anthology.json'), 'utf8')
) as {
  sentinel: string;
  teacher_layer_id: string;
  snapshots: AnthologySnapshot[];
};

describe('AnthologyBlockSchema', () => {
  it('parses anthology block and registers createBlock default', () => {
    const block = createBlock('anthology', 'anth_1');
    expect(block.block_type).toBe('anthology');
    if (block.block_type !== 'anthology') return;
    expect(block.content.default_view).toBe('text');
    expect(BlockSchema.parse(block).block_type).toBe('anthology');
  });
});

describe('normaliseTag', () => {
  it('collapses spaces and keeps first spelling', () => {
    const seen = new Map<string, string>();
    expect(normaliseTag('Memory', seen)).toBe('Memory');
    expect(normaliseTag(' memory ', seen)).toBe('Memory');
    expect(normaliseTag('  war  poems ', seen)).toBe('war poems');
    expect(normaliseTag('   ', seen)).toBeNull();
  });
});

describe('collectAnthology', () => {
  it('strips teacher-layer sentinel, normalises themes, skips unpublished', () => {
    const data = collectAnthology(structuredClone(fixture.snapshots), {
      lessonOrder: ['lesson_dulce', 'lesson_anthem', 'lesson_draft']
    });
    const json = JSON.stringify(data);
    expect(json).not.toContain(fixture.sentinel);
    expect(json).not.toContain(fixture.teacher_layer_id);
    expect(data.items.map((i) => i.annotation_id).sort()).toEqual([
      'ann_enjambment',
      'ann_rhetorical',
      'ann_simile'
    ]);
    expect(data.items.every((i) => i.themes.every((t) => t !== 'memory'))).toBe(true);
    // "Memory" / " memory " / "Memory" collapse to one spelling across items
    const memorySpellings = new Set(
      data.items.flatMap((i) => i.themes.filter((t) => t.toLowerCase() === 'memory'))
    );
    expect([...memorySpellings]).toEqual(['Memory']);
    expect(data.items.some((i) => i.lesson_id === 'lesson_draft')).toBe(false);
    expect(data.texts.map((t) => t.block_id)).toEqual(['block_dulce', 'block_anthem']);
  });

  it('counts fingerprint families by hand', () => {
    const data = collectAnthology(structuredClone(fixture.snapshots), {
      lessonOrder: ['lesson_dulce', 'lesson_anthem']
    });
    const dulce = data.texts.find((t) => t.block_id === 'block_dulce');
    expect(dulce?.fingerprint).toEqual({ Structural: 1, Comparative: 1 });
    const anthem = data.texts.find((t) => t.block_id === 'block_anthem');
    expect(anthem?.fingerprint).toEqual({ Structural: 1 });
  });

  it('includes unpublished when asked (teacher preview)', () => {
    const data = collectAnthology(structuredClone(fixture.snapshots), {
      includeUnpublished: true,
      lessonOrder: ['lesson_dulce', 'lesson_anthem', 'lesson_draft']
    });
    expect(data.items.some((i) => i.lesson_id === 'lesson_draft')).toBe(true);
    expect(data.items.find((i) => i.lesson_id === 'lesson_draft')?.published).toBe(false);
    expect(JSON.stringify(data)).not.toContain(fixture.sentinel);
  });
});
