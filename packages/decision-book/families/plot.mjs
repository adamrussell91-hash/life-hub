// packages/decision-book/families/plot.mjs
// The plot family: named points (`point` slots) on two qualitative 1–10 axes. The coach places
// the names; the person places each point with the chart's controls, which send a score
// snapshot { points: { nodeId: { x, y, size?, plot? } } } through Problem Solver's scores
// action. Snapshots merge in order, so points can be placed one at a time and moved later.
// Options: a bubble `size` (1–10), a shaded `band` and several `plots` that never share axes
// (the project portfolio's two coordinate systems): a point then names its plot.
import { countSlots, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { baseTool, check, checkCommon, framing, isKey, nodesIn, reflected, subjectFirst } from './common.mjs';

const isScale = (value) => Number.isInteger(value) && value >= 1 && value <= 10;
const isAxes = (axes) => Boolean(axes?.x?.label && axes.x.low && axes.x.high && axes?.y?.label && axes.y.low && axes.y.high);

/** The plots a config draws: its own list, or one plot `main` on the shared axes. */
export function plotsOf(chart) {
  return chart.plots ?? [{ id: 'main', label: '', axes: chart.axes }];
}

/** Every point's latest position, merged across snapshots in order. */
export function positionsOf(run) {
  const out = {};
  for (const snap of run.scores?.snapshots ?? []) for (const [nodeId, place] of Object.entries(snap.points ?? {})) out[nodeId] = { ...out[nodeId], ...place };
  return out;
}

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {{x: object, y: object}} [config.chart.axes] one plot's axes (label, low, high each)
 * @param {{id: string, label: string, axes: object}[]} [config.chart.plots] separate plots instead
 * @param {string} config.chart.point what one point is
 * @param {{label: string}} [config.chart.size] a bubble size, 1–10
 * @param {{label: string, x: [number, number], y: [number, number]}} [config.chart.band] a shaded region
 * @param {number} [config.chart.max] points (10)
 * @param {number} [config.chart.minPoints] placed points before the reflection opens (2)
 */
export function plotTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  const plots = plotsOf(chart);
  check(chart.plots ? !chart.axes : isAxes(chart.axes), id, 'give either axes or plots, not both');
  for (const plot of plots) {
    check(isKey(plot.id), id, `plot id ${plot.id} must be a lower-case key`);
    check(isAxes(plot.axes), id, `plot ${plot.id} needs x and y axes with label, low and high`);
  }
  check(typeof chart.point === 'string' && chart.point, id, 'needs a point description');
  if (chart.band) check(chart.band.label && [...chart.band.x, ...chart.band.y].every(isScale), id, 'band needs a label and 1–10 bounds');
  const max = chart.max ?? 10;
  const minPoints = chart.minPoints ?? 2;
  const plotIds = plots.map((plot) => plot.id);
  const many = plots.length > 1;
  const { subject, reflection } = framing(config);

  const unplaced = (run) => {
    const at = positionsOf(run);
    return nodesIn(run, 'point').filter((node) => !(isScale(at[node.id]?.x) && isScale(at[node.id]?.y)));
  };
  const ready = (run) => countSlots(run, 'point') >= minPoints && unplaced(run).length === 0;

  return baseTool(config, 'plot', { point: chart.point }, {
    ...(many ? { nodeTags: { point: plotIds } } : {}),
    nextSlots(run) {
      const first = subjectFirst(run, subject);
      if (first) return first;
      if (reflection && countSlots(run, 'reflection')) return [];
      return open(nextIndexed(run, 'point', max), reflection && ready(run) ? 'reflection' : null);
    },
    pickScores(payload) {
      return { points: payload?.points };
    },
    validateScores(run, { points }) {
      if (!points || typeof points !== 'object' || !Object.keys(points).length) return 'Place at least one point.';
      const placed = new Set(nodesIn(run, 'point').map((node) => node.id));
      for (const [nodeId, place] of Object.entries(points)) {
        if (!placed.has(nodeId)) return 'Only placed points can be positioned.';
        if (!isScale(place?.x) || !isScale(place?.y)) return 'Positions run from 1 to 10 on each axis.';
        if (place.size !== undefined && (!chart.size || !isScale(place.size))) return chart.size ? 'Sizes run from 1 to 10.' : 'This chart has no bubble size.';
      }
      return null;
    },
    awaiting(run) {
      return unplaced(run).length ? 'The person places each point on the chart with its controls; ask them to, and wait.' : null;
    },
    complete(run) {
      return ready(run) && reflected(run, reflection);
    }
  });
}
