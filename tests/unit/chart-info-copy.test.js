import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODY_CHART_INFO,
  bodyChartInfo,
  healthThreadsInfo,
  repMixInfo
} from '../../apps/life/js/app/chart-info-copy.js';

test('body metaphor charts each have what/how copy', () => {
  for (const key of ['stack', 'stairs', 'carved', 'scissors', 'squares']) {
    const spec = bodyChartInfo(key);
    assert.equal(spec, BODY_CHART_INFO[key]);
    assert.ok(spec.id.startsWith('life.body.'));
    assert.ok(spec.title);
    assert.ok(spec.what.length > 20);
    assert.ok(spec.how.length > 20);
  }
  assert.equal(bodyChartInfo('missing'), null);
});

test('health threads and rep mix info cover the gap charts', () => {
  assert.equal(healthThreadsInfo.id, 'life.medical.threads');
  assert.match(healthThreadsInfo.how, /IBD|Liver|Mind|Acute/);
  assert.equal(repMixInfo.id, 'life.fitness.rep-mix');
  assert.match(repMixInfo.how, /1–5|6–8|9–12|13\+/);
});
