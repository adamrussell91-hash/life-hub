// packages/decision-book/families/scales.mjs
// The scales family: profiles the person scores with the chart's controls, one snapshot per
// series ({ series, values: { scaleId: n } }), the latest snapshot of a series winning.
//   pairs   opposed poles (body/mind); n is the low pole's share of 10, the high pole has 10 − n.
//   axes    independent 1–10 scales, drawn as bars or as a radar.
//   shares  parts of a whole; the values sum to 100.
// Series are the overlays a model compares (now and wanted, two dates, four perspectives).
// Notes (`note` slots) are optional, each tagged with the scale it is about. With `named`, the
// person names each scale first (`scale_name` slots, axes and shares only), as the team model
// names the skills a team needs; the config's labels are then only placeholders.
import { countSlots, nextIndexed, open, parseSlot } from '../../problem-solver/slots.mjs';
import { baseTool, check, checkCommon, framing, isKey, nodesIn, reflected, subjectFirst } from './common.mjs';

const MODES = Object.freeze(['pairs', 'axes', 'shares']);

/** The latest values of each series that has been scored. */
export function valuesOf(run) {
  const out = {};
  for (const snap of run.scores?.snapshots ?? []) if (snap.series) out[snap.series] = { ...snap.values };
  return out;
}

/** A scale's words for this run: the name the person gave it, or its configured label. */
export function scaleLabel(run, scale) {
  const named = run.nodes.find((node) => parseSlot(node.slot)?.name === 'scale_name' && node.tag === scale.id);
  return named ? (named.title ?? named.text) : (scale.label ?? `${scale.low} or ${scale.high}`);
}

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {'pairs'|'axes'|'shares'} config.chart.mode
 * @param {{id: string, label?: string, low?: string, high?: string}[]} config.chart.scales pairs need low and high, others a label
 * @param {{id: string, label: string}[]} [config.chart.series] defaults to one series, now
 * @param {'bars'|'radar'} [config.chart.layout] axes mode only (bars)
 * @param {{label: string}} [config.chart.named] the person names every scale before scoring
 */
export function scalesTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(MODES.includes(chart.mode), id, `mode is one of ${MODES.join(', ')}`);
  check(Array.isArray(chart.scales) && chart.scales.length >= 2, id, 'needs at least two scales');
  for (const scale of chart.scales) {
    check(isKey(scale.id), id, `scale id ${scale.id} must be a lower-case key`);
    if (chart.mode === 'pairs') check(scale.low && scale.high, id, `pair ${scale.id} needs low and high poles`);
    else check(scale.label, id, `scale ${scale.id} needs a label`);
  }
  if (chart.layout === 'radar') check(chart.mode === 'axes' && chart.scales.length >= 3, id, 'a radar needs axes mode and three scales');
  const series = chart.series ?? [{ id: 'now', label: 'Now' }];
  for (const s of series) check(isKey(s.id) && s.label, id, `series ${s.id} needs a key and a label`);
  const scaleIds = chart.scales.map((scale) => scale.id);
  const seriesIds = series.map((s) => s.id);
  if (chart.named) check(chart.mode !== 'pairs' && typeof chart.named.label === 'string', id, 'named scales need axes or shares mode and a label');
  const { subject, reflection } = framing(config);

  const missing = (run) => seriesIds.filter((s) => !valuesOf(run)[s]);
  const unnamed = (run) => (chart.named ? scaleIds.filter((scale) => !nodesIn(run, 'scale_name').some((node) => node.tag === scale)) : []);

  return baseTool(config, 'scales', { ...(chart.named ? { scale_name: chart.named.label } : {}), note: 'A note on one scale: why it sits where it does' }, {
    nodeTags: { note: scaleIds, ...(chart.named ? { scale_name: scaleIds } : {}) },
    validateNode(run, node) {
      if (node.slot.startsWith('scale_name') && !unnamed(run).includes(node.tag)) return 'That scale already has a name; name another.';
      return null;
    },
    nextSlots(run) {
      const first = subjectFirst(run, subject);
      if (first) return first;
      if (unnamed(run).length) return [nextIndexed(run, 'scale_name', scaleIds.length)];
      if (reflection && countSlots(run, 'reflection')) return [];
      return open(nextIndexed(run, 'note', scaleIds.length * 2), reflection && !missing(run).length ? 'reflection' : null);
    },
    pickScores(payload) {
      return { series: payload?.series, values: payload?.values };
    },
    validateScores(run, { series: which, values }) {
      if (unnamed(run).length) return 'Name every scale before scoring.';
      if (!seriesIds.includes(which)) return `Score one of: ${seriesIds.join(', ')}.`;
      if (!values || scaleIds.some((scale) => !Number.isInteger(values[scale])) || Object.keys(values).length !== scaleIds.length) return 'Give a whole number for every scale.';
      const list = scaleIds.map((scale) => values[scale]);
      if (chart.mode === 'pairs' && !list.every((n) => n >= 0 && n <= 10)) return 'Each pair shares 10 points: give the first pole 0 to 10.';
      if (chart.mode === 'axes' && !list.every((n) => n >= 1 && n <= 10)) return 'Scores run from 1 to 10.';
      if (chart.mode === 'shares' && (!list.every((n) => n >= 0) || list.reduce((a, b) => a + b, 0) !== 100)) return 'The shares must add up to 100.';
      return null;
    },
    awaiting(run) {
      const left = missing(run);
      if (unnamed(run).length) return null;
      return left.length ? `The person scores ${left.map((s) => series.find((x) => x.id === s).label.toLowerCase()).join(' and ')} with the chart's controls; ask them to, and wait.` : null;
    },
    complete(run) {
      return !missing(run).length && reflected(run, reflection);
    }
  });
}
