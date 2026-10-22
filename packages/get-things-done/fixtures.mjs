// packages/get-things-done/fixtures.mjs
// Sample tools and runs for Gear Shifter's own chart changes: invented content (no book
// text), shared by the factory tests, the renderer tests and the contact sheet. Each sample
// has an empty, a partial and a full run; the full run's last entry is contested where the
// chart has entries.
import { ratingsTool, scalesTool } from '../decision-book/families/index.mjs';
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
  }),
  ratings: ratingsTool({
    ...base('gt_sample_ratings', 'Sample ratings'),
    chart: { idea: 'One idea on the shortlist', criterion: 'One criterion to rate by', rater: 'One person rating', reflection: false }
  })
});

const ratingNodes = [
  sampleNode('idea1', 'idea:1', 'Swap shelf in the hall'),
  sampleNode('idea2', 'idea:2', 'Saturday stall'),
  sampleNode('idea3', 'idea:3', 'Lunch club'),
  sampleNode('criterion1', 'criterion:1', 'Cost to run'),
  sampleNode('criterion2', 'criterion:2', 'People reached'),
  sampleNode('rater1', 'rater:1', 'Ines'),
  sampleNode('rater2', 'rater:2', 'Tomas'),
  sampleNode('rater3', 'rater:3', 'Wren')
];
const rate = (rater, at, rows, ranking) => ({ at, rater, scores: Object.fromEntries(rows.map(([a, b], i) => [`idea${i + 1}`, { criterion1: a, criterion2: b }])), ranking });

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
  },
  // idea1 on criterion1 is rated 4, 6 and 8: mean 6, sample SD 2, n 3.
  ratings: {
    partial: ratingNodes,
    full: [...ratingNodes, sampleNode('rec', 'recommendation', 'Try the stall first; Wren rates it far lower, so ask why before committing.'), sampleNode('own', 'owner', 'Ines', contested)],
    scores: {
      snapshots: [
        rate('rater1', '2026-10-22T10:00:00.000Z', [[4, 6], [8, 9], [3, 5]], ['idea2', 'idea1', 'idea3']),
        rate('rater2', '2026-10-22T10:01:00.000Z', [[6, 5], [7, 8], [5, 4]], ['idea2', 'idea1', 'idea3']),
        rate('rater3', '2026-10-22T10:02:00.000Z', [[8, 7], [2, 3], [6, 6]], ['idea1', 'idea3', 'idea2'])
      ]
    },
    partialScores: { snapshots: [rate('rater1', '2026-10-22T10:00:00.000Z', [[4, 6], [8, 9], [3, 5]], ['idea2', 'idea1', 'idea3'])] }
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
