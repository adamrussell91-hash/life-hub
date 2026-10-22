// packages/decision-book/families/curve.mjs
// The curve family: one or more conceptual curves (curves.mjs) over named regions of the
// x axis. The person's `position` (tagged with a region) is where they think they stand;
// `note` slots (each tagged with a region) say why. Regions cover the axis from 0 to 1 in
// order without overlapping. Lenses use this family with no notes required.
import { countSlots, hasSlot, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { CURVE_IDS } from '../curves.mjs';
import { baseTool, check, checkCommon, framing, isKey, reflected, subjectFirst } from './common.mjs';

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {{x: {label: string}, y: {label: string}}} config.chart.axes
 * @param {{id: string, label: string, shape: string}[]} config.chart.lines
 * @param {{id: string, label: string, from: number, to: number}[]} config.chart.regions
 * @param {string} config.chart.position what the marker means
 * @param {number} [config.chart.minNotes] notes before the reflection opens (0)
 */
export function curveTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(chart.axes?.x?.label && chart.axes?.y?.label, id, 'needs labelled x and y axes');
  check(Array.isArray(chart.lines) && chart.lines.length >= 1 && chart.lines.length <= 3, id, 'needs one to three lines');
  for (const line of chart.lines) {
    check(isKey(line.id), id, `line id ${line.id} must be a lower-case key`);
    check(CURVE_IDS.includes(line.shape), id, `line ${line.id} shape must be one of ${CURVE_IDS.join(', ')}`);
    check(chart.lines.length === 1 || line.label, id, `line ${line.id} needs a label when there are several`);
  }
  check(Array.isArray(chart.regions) && chart.regions.length >= 2, id, 'needs at least two regions');
  let edge = 0;
  for (const region of chart.regions) {
    check(isKey(region.id) && region.label, id, `region ${region.id} needs a key and a label`);
    check(region.from === edge && region.to > region.from, id, `region ${region.id} must start where the last ended (${edge})`);
    edge = region.to;
  }
  check(edge === 1, id, 'regions must end at 1');
  check(typeof chart.position === 'string' && chart.position, id, 'needs a position description');
  const regionIds = chart.regions.map((region) => region.id);
  const minNotes = chart.minNotes ?? 0;
  const { subject, reflection } = framing(config);
  const ready = (run) => hasSlot(run, 'position') && countSlots(run, 'note') >= minNotes;

  return baseTool(config, 'curve', { position: chart.position, note: 'Why: what puts you at that point, or what each part of the curve means here' }, {
    nodeTags: { position: regionIds, note: regionIds },
    nextSlots(run) {
      const first = subjectFirst(run, subject);
      if (first) return first;
      if (reflection && countSlots(run, 'reflection')) return [];
      return open(hasSlot(run, 'position') ? null : 'position', nextIndexed(run, 'note', 6), reflection && ready(run) ? 'reflection' : null);
    },
    complete(run) {
      return ready(run) && reflected(run, reflection);
    }
  });
}
