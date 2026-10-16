import { renderAnnotationBlock } from '@/blocks/render';
import type { AnnotationItem } from '@/schemas/block';
import { threadFocusFixture } from '../../fixtures/annotation-thread-focus';
import '../styles/app.css';

/** Dulce with Periodic Table techniques on three phrases, for the interactive card. */
const stamp = '2026-10-16T00:00:00.000Z';

function tagged(
  id: string,
  line: string,
  start: number,
  exact: string,
  technique: string,
  note: string
): AnnotationItem {
  return {
    id,
    layer_id: 'layer_imagery',
    anchor: {
      granularity: 'phrase',
      stanza: 'stanza_1',
      line,
      start,
      end: start + exact.length,
      quote: { exact }
    },
    technique: { id: technique, table_version: 'preview' },
    body: { html: `<p>${note}</p>`, attachments: [] },
    created_at: stamp,
    updated_at: stamp
  };
}

const mount = document.getElementById('mount');
if (mount) {
  const fixture = structuredClone(threadFocusFixture);
  fixture.content.settings.default_layer_id = 'layer_imagery';
  fixture.content.annotations = [
    tagged('ann_beggars', 'line_1', 13, 'like old beggars', 'simile', 'Soldiers reduced to beggars.'),
    tagged('ann_hags', 'line_2', 22, 'like hags', 'simile', 'A second simile, harsher still.'),
    tagged('ann_blood', 'line_6', 15, 'blood-shod', 'metaphor', 'Blood where boots should be.')
  ];
  mount.append(renderAnnotationBlock(fixture, 'student'));
}
