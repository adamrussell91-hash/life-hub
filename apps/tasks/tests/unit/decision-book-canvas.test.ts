// The canvas map: every catalogue model and the decision record get a chart through the shared
// registry; a family model gets its family's chart, the one-offs and reused tools their own.
import { describe, expect, it } from 'vitest';
import { createChartForRun } from '../../../../packages/decision-book/render/charts';
import { CATALOGUE } from '../../../../packages/decision-book/catalogue.mjs';
import { RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';

describe('Decision Maker canvas', () => {
  it.each(CATALOGUE.map((entry) => [entry.id, entry.family, entry.reuse] as const))('%s has a chart', (id, family, reuse) => {
    const chart = createChartForRun({ tool: id });
    expect(chart, id).not.toBeNull();
    expect(chart!.el).toBeInstanceOf(HTMLElement);
    if (family !== 'oneoff' && !reuse) expect(chart!.el.className).toContain(`dm-chart--${family}`);
  });

  it('draws the decision record and refuses a tool it does not know', () => {
    expect(createChartForRun({ tool: RECORD_ID })).not.toBeNull();
    expect(createChartForRun({ tool: 'five_whys' })).toBeNull();
    expect(createChartForRun({ tool: 'nope' })).toBeNull();
  });

});
