import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { buildBodyChartData } from '../../apps/life/js/app/body-chart-data.js';
import { buildBodyModel } from '../../apps/life/js/app/body-model.js';
import { renderBody } from '../../apps/life/js/app/render-body.js';

const AS_OF = '2026-09-22';
const TARGETS = {
  forecast: {
    body_composition: {
      weight_kg_min: 78,
      weight_kg_max: 82,
      body_fat_pct_min: 8,
      body_fat_pct_max: 10,
      body_fat_pct_tight: 8,
      shoulder_waist_ratio: 1.6
    }
  }
};

const weigh = (date, weight_kg) => ({ record: { type: 'weight', date, weight_kg } });
const comp = (date, fields) => ({ record: { type: 'composition', date, ...fields } });

function events() {
  return [
    weigh('2024-04-12', 130.2),
    weigh('2025-04-01', 96.5),
    weigh('2026-09-01', 87.0),
    weigh('2026-09-22', 86.3),
    comp('2025-05-20', { body_fat_pct: 24.8, skeletal_muscle_kg: 36.0, weight_kg: 95.9 }),
    comp('2026-08-10', { body_fat_pct: 20.0, skeletal_muscle_kg: 39.9, weight_kg: 87.4 }),
    comp('2026-09-20', { body_fat_pct: 18.9, skeletal_muscle_kg: 40.2, weight_kg: 86.5 })
  ];
}

function mountRoot() {
  const window = new Window({ url: 'https://life-hub.example/' });
  const { document } = window;
  document.body.innerHTML = `
    <section id="body-dashboard" hidden>
      <div id="body-range-control" class="hub-pills"></div>
      <div id="body-sections"></div>
    </section>
  `;
  return { window, document, root: document };
}

test('body metaphor charts mount an opaque chart info control', () => {
  const { document, root } = mountRoot();
  const model = buildBodyModel({ events: events(), date: AS_OF, range: 'five_year' });
  const charts = buildBodyChartData({
    events: events(),
    date: AS_OF,
    range: 'five_year',
    targetsConfig: TARGETS
  });
  renderBody(root, model, { charts, quiet: true });

  const labels = [...document.querySelectorAll('.metric-label')]
    .map(node => node.textContent.trim());
  assert.ok(labels.includes('Shed stack'));
  assert.ok(labels.includes('Stairs'));
  assert.ok(labels.includes('Carved away'));
  assert.ok(labels.includes('Scissors'));

  for (const id of [
    'hub-chart-info-life-body-shed-stack',
    'hub-chart-info-life-body-stairs',
    'hub-chart-info-life-body-carved',
    'hub-chart-info-life-body-scissors'
  ]) {
    const note = document.getElementById(id);
    assert.ok(note, id);
    assert.equal(note.hidden, true);
    assert.match(note.textContent, /What this shows/);
    assert.match(note.textContent, /How it's worked out/);
  }

  const infoButtons = document.querySelectorAll('.hub-chart-info');
  assert.ok(infoButtons.length >= 4);

  const squaresPill = document.querySelector('[data-body-view="squares"]');
  assert.ok(squaresPill);
  squaresPill.click();
  assert.ok(document.getElementById('hub-chart-info-life-body-squares'));
  assert.match(
    document.getElementById('hub-chart-info-life-body-squares').textContent,
    /100 squares|one hundred squares|100%/i
  );
});
