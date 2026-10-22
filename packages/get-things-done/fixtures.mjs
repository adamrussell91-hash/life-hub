// packages/get-things-done/fixtures.mjs
// Sample tools and runs for Gear Shifter's own chart changes: invented content (no book
// text), shared by the factory tests, the renderer tests and the contact sheet. Each sample
// has an empty, a partial and a full run; the full run's last entry is contested where the
// chart has entries.
import { scalesTool } from '../decision-book/families/index.mjs';
import { sampleNode, sampleRun } from '../decision-book/fixtures.mjs';

const steps = [{ id: 'work', title: 'Work it', prompt: 'Fill the chart.' }];
const base = (id, name) => ({ id, name, when: `Sample ${name.toLowerCase()} for tests.`, steps });

export const GT_SAMPLE_TOOLS = Object.freeze({
  needs: scalesTool({
    ...base('gt_sample_needs', 'Sample needs'),
    chart: {
      mode: 'axes',
      min: 0,
      layout: 'radar',
      dated: true,
      scales: [{ id: 'order', label: 'Order' }, { id: 'novelty', label: 'Novelty' }, { id: 'thanks', label: 'Thanks' }]
    }
  })
});

const contested = { state: 'contested', objection: 'Is that really where it belongs?' };

export const GT_SAMPLE_RUNS = Object.freeze({
  needs: {
    partial: [],
    full: [sampleNode('n1', 'note:1', 'Thanks have dried up since the move', { tag: 'thanks' }), sampleNode('n2', 'note:2', 'Too much order, not enough new', { tag: 'novelty', ...contested })],
    scores: {
      snapshots: [
        { at: '2026-09-24T09:00:00.000Z', series: 'now', values: { order: 7, novelty: 3, thanks: 5 } },
        { at: '2026-10-01T09:00:00.000Z', series: 'now', values: { order: 8, novelty: 2, thanks: 3 } },
        { at: '2026-10-08T09:00:00.000Z', series: 'now', values: { order: 6, novelty: 4, thanks: 0 } }
      ]
    },
    partialScores: { snapshots: [{ at: '2026-10-08T09:00:00.000Z', series: 'now', values: { order: 6, novelty: 4, thanks: 0 } }] }
  }
});

/** An empty run of a Gear Shifter sample tool. */
export const gtRun = (key) => sampleRun(GT_SAMPLE_TOOLS[key].id);

/** The run for a sample key at a stage: 'empty', 'partial' or 'full'. */
export function gtRunFor(key, stage) {
  const sample = GT_SAMPLE_RUNS[key];
  const toolId = GT_SAMPLE_TOOLS[key].id;
  if (stage === 'empty') return sampleRun(toolId);
  const scores = stage === 'partial' ? sample.partialScores ?? sample.scores : sample.scores;
  return sampleRun(toolId, sample[stage], { ...(scores ? { scores } : {}), ...(sample.edges && stage === 'full' ? { edges: sample.edges } : {}) });
}
