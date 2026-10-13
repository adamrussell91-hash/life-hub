import type { AnnotationBlock } from '@/schemas/block';

const stamp = '2026-10-13T00:00:00.000Z';

/**
 * Public-domain Dulce extract with a 5-stop motif thread for focus / fold tests.
 */
export const threadFocusFixture: AnnotationBlock = {
  id: 'block_thread_focus',
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
    title: 'Dulce — thread focus',
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
            { id: 'line_4', text: 'And towards our distant rest began to trudge.' },
            { id: 'line_5', text: 'Men marched asleep. Many had lost their boots' },
            { id: 'line_6', text: 'But limped on, blood-shod. All went lame; all blind;' },
            { id: 'line_7', text: 'Drunk with fatigue; deaf even to the hoots' },
            { id: 'line_8', text: 'Of tired, outstripped Five-Nines that dropped behind.' }
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
      }
    ],
    annotations: [
      {
        id: 'ann_motif',
        layer_id: 'layer_imagery',
        anchor: {
          id: 'stop_1',
          granularity: 'line',
          stanza: 'stanza_1',
          line: 'line_1',
          quote: { exact: 'Bent double, like old beggars under sacks,' },
          note_html: '<p>Opening posture — already broken.</p>'
        },
        also_anchors: [
          {
            id: 'stop_2',
            granularity: 'line',
            stanza: 'stanza_1',
            line: 'line_3',
            quote: { exact: 'Till on the haunting flares we turned our backs' },
            note_html: '<p>Turning away from light.</p>'
          },
          {
            id: 'stop_3',
            granularity: 'line',
            stanza: 'stanza_1',
            line: 'line_5',
            quote: { exact: 'Men marched asleep. Many had lost their boots' },
            note_html: '<p>Sleep-walking the march.</p>'
          },
          {
            id: 'stop_4',
            granularity: 'line',
            stanza: 'stanza_1',
            line: 'line_6',
            quote: { exact: 'But limped on, blood-shod. All went lame; all blind;' },
            note_html: '<p>Bodies fail together.</p>'
          },
          {
            id: 'stop_5',
            granularity: 'line',
            stanza: 'stanza_1',
            line: 'line_8',
            quote: { exact: 'Of tired, outstripped Five-Nines that dropped behind.' },
            note_html: '<p>Shells still chase the exhausted.</p>'
          }
        ],
        thread: { kind: 'motif', order: 'text' },
        body: {
          html: '<p>Exhaustion motif across the stanza.</p>',
          attachments: []
        },
        created_at: stamp,
        updated_at: stamp
      },
      {
        id: 'ann_word',
        layer_id: 'layer_structure',
        anchor: {
          granularity: 'word',
          stanza: 'stanza_1',
          line: 'line_4',
          start: 38,
          end: 44,
          quote: { exact: 'trudge' }
        },
        body: {
          html: '<p>Heavy cadence.</p>',
          attachments: []
        },
        created_at: stamp,
        updated_at: stamp
      }
    ],
    settings: {
      show_markers: true,
      default_layer_id: 'layer_imagery',
      thread_context: 0
    }
  }
};
