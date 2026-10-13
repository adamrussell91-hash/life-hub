import type { AnnotationBlock } from '@/schemas/block';

const stamp = '2026-10-13T00:00:00.000Z';

/**
 * Public-domain opening of Wilfred Owen's "Dulce et Decorum Est"
 * with one annotation at each granularity (word, phrase, line, stanza).
 */
export const dulceAnnotationFixture: AnnotationBlock = {
  id: 'block_dulce_annotation',
  type: 'block',
  block_type: 'annotation',
  variant: 'medium',
  visibility: 'student_teacher',
  layout: {},
  print: {},
  settings: {},
  created_at: stamp,
  updated_at: stamp,
  schema_version: 1,
  content: {
    title: 'Dulce et Decorum Est',
    attribution: 'Wilfred Owen',
    text: {
      kind: 'verse',
      stanzas: [
        {
          id: 'stanza_1',
          lines: [
            { id: 'line_1', text: 'Bent double, like old beggars under sacks,' },
            { id: 'line_2', text: 'Knock-kneed, coughing like hags, we cursed through sludge,' },
            { id: 'line_3', text: 'Till on the haunting flares we turned our backs' },
            { id: 'line_4', text: 'And towards our distant rest began to trudge.' }
          ]
        }
      ]
    },
    layers: [
      {
        id: 'layer_structure',
        name: 'Structure',
        kind: 'free',
        colour: 'wave',
        symbol: 'St'
      },
      {
        id: 'layer_imagery',
        name: 'Imagery',
        kind: 'free',
        colour: 'sand',
        symbol: 'Im'
      },
      {
        id: 'layer_teacher',
        name: 'Teacher notes',
        kind: 'teacher',
        colour: 'navy'
      }
    ],
    annotations: [
      {
        id: 'ann_word',
        layer_id: 'layer_imagery',
        anchor: {
          granularity: 'word',
          stanza: 'stanza_1',
          line: 'line_4',
          start: 38,
          end: 44,
          quote: { exact: 'trudge', prefix: 'distant rest began to ', suffix: '.' }
        },
        body: {
          html: '<p>Heavy verb — the march ends in a trudging cadence.</p>',
          attachments: []
        },
        created_at: stamp,
        updated_at: stamp
      },
      {
        id: 'ann_phrase',
        layer_id: 'layer_imagery',
        anchor: {
          granularity: 'phrase',
          stanza: 'stanza_1',
          line: 'line_1',
          start: 13,
          end: 41,
          quote: {
            exact: 'like old beggars under sacks',
            prefix: 'Bent double, ',
            suffix: ','
          }
        },
        body: {
          html: '<p>Dehumanising simile: soldiers as beggars.</p>',
          attachments: []
        },
        created_at: stamp,
        updated_at: stamp
      },
      {
        id: 'ann_line',
        layer_id: 'layer_structure',
        anchor: {
          granularity: 'line',
          stanza: 'stanza_1',
          line: 'line_2',
          quote: {
            exact: 'Knock-kneed, coughing like hags, we cursed through sludge,'
          }
        },
        body: {
          html: '<p>Compound physical detail piles exhaustion into one line.</p>',
          attachments: []
        },
        created_at: stamp,
        updated_at: stamp
      },
      {
        id: 'ann_stanza',
        layer_id: 'layer_structure',
        anchor: {
          granularity: 'stanza',
          stanza: 'stanza_1',
          quote: {
            exact:
              'Bent double, like old beggars under sacks,\nKnock-kneed, coughing like hags, we cursed through sludge,\nTill on the haunting flares we turned our backs\nAnd towards our distant rest began to trudge.'
          }
        },
        body: {
          html: '<p>Opening quatrain: march toward rest under fire.</p>',
          attachments: []
        },
        created_at: stamp,
        updated_at: stamp
      },
      {
        id: 'ann_teacher',
        layer_id: 'layer_teacher',
        anchor: {
          granularity: 'word',
          stanza: 'stanza_1',
          line: 'line_3',
          start: 12,
          end: 20,
          quote: { exact: 'haunting', prefix: 'Till on the ', suffix: ' flares' }
        },
        body: {
          html: '<p>SECRET-TEACHER-NOTE — pacing tip only.</p>',
          attachments: []
        },
        created_at: stamp,
        updated_at: stamp
      }
    ],
    settings: { show_markers: true }
  }
};
