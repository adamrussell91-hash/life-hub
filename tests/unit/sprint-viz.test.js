import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSprintViz,
  resolveSprintViz,
  formatSprintVizPickerBlock,
  formatVizForConfirm,
  vizPlainName,
  canonicalVizId
} from '../../apps/life/js/core/sprint-viz.js';
import {
  buildSprintGlideChart,
  buildSprintAreaSeries
} from '../../apps/life/js/app/sprint-viz-charts.js';
import { executeShortcut } from '../../netlify/functions/_shared/capabilities/shortcuts.mjs';
import { formatSprintRosterBlock } from '../../netlify/functions/_shared/sprint-prompt.mjs';

test('normalizeSprintViz accepts allowlisted ids and aliases', () => {
  const ok = normalizeSprintViz({ headline: 'glide-slope', lanes: 'progress-ring' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.viz, { headline: 'glide-slope', lanes: 'ring' });
  assert.equal(canonicalVizId('progress-ring'), 'ring');
  assert.equal(vizPlainName('glide-slope', 'headline'), 'Glide slope');
});

test('normalizeSprintViz denies unknown chart ids with readable reason', () => {
  const bad = normalizeSprintViz({ headline: 'sankey' });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /Unknown viz\.headline/);
  assert.match(bad.reason, /sankey/);
  const badLane = normalizeSprintViz({ lanes: 'force-graph' });
  assert.equal(badLane.ok, false);
  assert.match(badLane.reason, /Unknown viz\.lanes/);
});

test('resolveSprintViz defaults: down + readings → glide-slope; lanes → progress-track', () => {
  const resolved = resolveSprintViz({
    headline: {
      direction: 'down',
      readings: [
        { date: '2026-10-01', value: 89 },
        { date: '2026-10-04', value: 88 }
      ]
    }
  });
  assert.equal(resolved.headline, 'glide-slope');
  assert.equal(resolved.lanes, 'progress-track');
  assert.equal(resolved.explicit, false);
});

test('resolveSprintViz keeps explicit allowlisted picks', () => {
  const resolved = resolveSprintViz({
    viz: { headline: 'carved-away', lanes: 'gate-rings' },
    headline: { direction: 'down', readings: [{ date: 'a', value: 1 }, { date: 'b', value: 2 }] }
  });
  assert.equal(resolved.headline, 'carved-away');
  assert.equal(resolved.lanes, 'gate-rings');
  assert.equal(resolved.explicit, true);
});

test('formatSprintVizPickerBlock is compact allowlist, not full catalog dump', () => {
  const block = formatSprintVizPickerBlock(true);
  assert.match(block, /SPRINT VIZ PICKER/);
  assert.match(block, /glide-slope/);
  assert.match(block, /progress-track/);
  assert.doesNotMatch(block, /Sankey flow/);
  assert.doesNotMatch(block, /vis-timeline/);
  assert.ok(block.length < 3500);
});

test('formatVizForConfirm uses plain language chart names', () => {
  const text = formatVizForConfirm({ headline: 'glide-slope', lanes: 'progress-track' });
  assert.match(text, /Glide slope/);
  assert.match(text, /Progress tracks/);
});

test('buildSprintGlideChart adapts headline readings for chart-kit', () => {
  const chart = buildSprintGlideChart({
    readings: [
      { date: '2026-10-01', value: 89 },
      { date: '2026-10-02', value: 88.5 },
      { date: '2026-10-04', value: 88 }
    ]
  });
  assert.equal(chart.from, '2026-10-01');
  assert.equal(chart.points.length, 3);
  assert.equal(chart.points[0].weight_kg, 89);
  assert.ok(Number.isFinite(chart.points[0].trend_kg));
  assert.equal(buildSprintAreaSeries({ readings: chart.points.map(p => ({ date: p.date, value: p.weight_kg })) }).length, 3);
});

test('sprint roster block includes viz picker for designing agents', () => {
  const block = formatSprintRosterBlock(true);
  assert.match(block, /SPRINT ROSTER/);
  assert.match(block, /SPRINT VIZ PICKER/);
  assert.match(block, /track_open_sprint/);
});

function mockCtx(slug) {
  const blobs = new Map();
  const tree = [];
  return {
    ctx: {
      agentSlug: slug,
      today: '2026-10-04',
      client: {
        async resolveTree() { return { tree }; },
        async readBlob(sha) { return blobs.get(sha); },
        async createOrUpdateFile() { return { ok: true }; }
      },
      repoTree: tree,
      readBlob: async (sha) => blobs.get(sha)
    }
  };
}

test('track_open_sprint persists viz and shows plain names on Confirm diff', async () => {
  const { ctx } = mockCtx('hammond');
  const result = await executeShortcut('track_open_sprint', {
    title: 'Belly Flab Blitz',
    goal: 'Trim midsection',
    lanes: [
      { agent: 'brisket', role: 'Eating', lead_measures: [{ id: 'p', label: 'Protein', evidence: { source: 'self_report' } }] },
      { agent: 'sara', role: 'Tape', lead_measures: [{ id: 'w', label: 'Waist', evidence: { source: 'body.measurements.waist' } }] }
    ],
    headline: { label: 'Midsection', metric: { label: 'Waist', unit: 'cm', direction: 'down', source: 'body.measurements.waist' } },
    viz: { headline: 'glide-slope', lanes: 'progress-track' }
  }, ctx);
  assert.equal(result.kind, 'propose');
  const body = JSON.parse(result.proposal.writes[0].content);
  assert.deepEqual(body.viz, { headline: 'glide-slope', lanes: 'progress-track' });
  assert.match(result.proposal.writes[0].diff, /Glide slope/);
  assert.match(result.proposal.writes[0].diff, /Progress tracks/);
});

test('track_open_sprint denies unknown viz with readable reason', async () => {
  const { ctx } = mockCtx('hammond');
  const result = await executeShortcut('track_open_sprint', {
    title: 'X',
    goal: 'Y',
    lanes: [{ agent: 'brisket', role: 'Eating', lead_measures: [{ id: 'p', label: 'P', evidence: { source: 'self_report' } }] }],
    viz: { headline: 'sankey' }
  }, ctx);
  assert.equal(result.kind, 'error');
  assert.match(result.error, /Unknown viz\.headline/);
});
