import { describe, expect, it } from 'vitest';
import {
  cardKindsForAnnotation,
  chunkItems,
  composeCardFromAnnotation,
  fadeText,
  sourceHash
} from '@/blocks/flashcard-from-annotation';
import { setLiteraryElementsForTests } from '@/blocks/literary-elements';
import type { AnnotationBlock, AnnotationItem } from '@/schemas/block';

const table = {
  version: '1',
  source: 'test',
  families: [
    { key: 'Structural' as const, name: 'Structural', colour: '#000' },
    { key: 'Comparative' as const, name: 'Comparative', colour: '#111' },
    { key: 'Descriptive' as const, name: 'Descriptive', colour: '#222' },
    { key: 'Repetitive' as const, name: 'Repetitive', colour: '#333' },
    { key: 'Intertextual' as const, name: 'Intertextual', colour: '#444' }
  ],
  subgroups: [
    {
      id: 'sg_struct',
      family: 'Structural' as const,
      name: 'Structure',
      definition: 'd'
    },
    {
      id: 'sg_comp',
      family: 'Comparative' as const,
      name: 'Figurative',
      definition: 'd'
    }
  ],
  techniques: [
    {
      id: 'enjambment',
      symbol: 'En',
      name: 'Enjambment',
      subgroup: 'sg_struct',
      definition: 'Run-on line',
      effect: 'Urgency',
      example: 'x',
      related: []
    },
    {
      id: 'simile',
      symbol: 'Si',
      name: 'Simile',
      subgroup: 'sg_comp',
      definition: 'Like or as',
      effect: 'Comparison',
      example: 'x',
      related: []
    }
  ]
};

function poemBlock(): AnnotationBlock {
  return {
    id: 'block_poem',
    type: 'block',
    block_type: 'annotation',
    variant: 'medium',
    visibility: 'student_teacher',
    layout: {},
    print: {},
    settings: {},
    created_at: '2026-10-13T00:00:00.000Z',
    updated_at: '2026-10-13T00:00:00.000Z',
    schema_version: 1,
    content: {
      title: 'Dulce',
      text: {
        kind: 'verse',
        stanzas: [
          {
            id: 's1',
            lines: [
              { id: 'l1', text: 'Bent double, like old beggars under sacks,' },
              { id: 'l2', text: 'Knock-kneed, coughing like hags.' }
            ]
          }
        ]
      },
      layers: [
        {
          id: 'layer_struct',
          name: 'Structural',
          kind: 'family',
          family: 'Structural',
          colour: 'sand',
          symbol: 'St'
        }
      ],
      annotations: [],
      settings: { show_markers: true }
    }
  };
}

function note(partial: Partial<AnnotationItem> & Pick<AnnotationItem, 'id'>): AnnotationItem {
  return {
    layer_id: 'layer_struct',
    anchor: {
      granularity: 'line',
      stanza: 's1',
      line: 'l1',
      quote: { exact: 'Bent double, like old beggars under sacks,' }
    },
    body: { html: '<p>Carries the trudging on.</p>', attachments: [] },
    created_at: '2026-10-13T00:00:00.000Z',
    updated_at: '2026-10-13T00:00:00.000Z',
    ...partial
  };
}

describe('fadeText', () => {
  it('fades level 1 keeping first letters and punctuation', () => {
    expect(fadeText('Bent double, like old beggars!', 1)).toBe(
      'B___ d_____, l___ o__ b______!'
    );
  });

  it('fades hyphenated segments and keeps first/last words at level 2', () => {
    expect(fadeText('Knock-kneed coughing like hags', 1)).toBe(
      'K____-k____ c_______ l___ h___'
    );
    expect(fadeText('Bent double like old beggars under sacks', 2)).toBe(
      'Bent d_____ l___ o__ b______ u____ sacks'
    );
  });
});

describe('composeCardFromAnnotation', () => {
  it('builds three kinds and changes hash when the quote edits', () => {
    setLiteraryElementsForTests(table);
    const block = poemBlock();
    const ann = note({
      id: 'ann_1',
      technique: { id: 'enjambment', table_version: '1' }
    });
    expect(cardKindsForAnnotation(ann)).toEqual([
      'quote_to_technique',
      'find_it',
      'line_recall'
    ]);

    const q2t = composeCardFromAnnotation({
      annotation: ann,
      block,
      lessonId: 'lesson_1',
      kind: 'quote_to_technique',
      table,
      cardId: 'c1'
    });
    expect(q2t?.front).toContain('Bent double');
    expect(q2t?.back).toContain('Enjambment');
    expect(q2t?.back).toContain('Urgency');
    expect(q2t?.source?.kind).toBe('quote_to_technique');

    const find = composeCardFromAnnotation({
      annotation: ann,
      block,
      lessonId: 'lesson_1',
      kind: 'find_it',
      table,
      cardId: 'c2'
    });
    expect(find?.front).toContain('Enjambment');
    expect(find?.front).toContain('Dulce');

    const recall = composeCardFromAnnotation({
      annotation: ann,
      block,
      lessonId: 'lesson_1',
      kind: 'line_recall',
      fadeLevel: 1,
      table,
      cardId: 'c3'
    });
    expect(recall?.front).toBe(fadeText(ann.anchor.quote.exact, 1));
    expect(recall?.back).toBe(ann.anchor.quote.exact);

    const before = sourceHash(
      ann.anchor.quote.exact,
      ann.technique?.id,
      'Carries the trudging on.'
    );
    const edited = {
      ...ann,
      anchor: {
        ...ann.anchor,
        quote: { exact: 'Bent double, like old beggars under sacks' }
      }
    };
    const after = sourceHash(
      edited.anchor.quote.exact,
      edited.technique?.id,
      'Carries the trudging on.'
    );
    expect(before).not.toBe(after);
    setLiteraryElementsForTests(null);
  });

  it('omits technique kinds without a tag', () => {
    const ann = note({ id: 'ann_plain' });
    expect(cardKindsForAnnotation(ann)).toEqual(['line_recall']);
  });
});

describe('chunkItems', () => {
  it('splits 45 into 20, 20, 5', () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    expect(chunkItems(items, 20).map((c) => c.length)).toEqual([20, 20, 5]);
  });
});
