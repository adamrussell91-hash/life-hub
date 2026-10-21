// packages/decision-book/render/curve.ts
// The curve family's chart: the configured conceptual line(s) drawn from curves.mjs over the
// regions of the x axis, with no numbers on either axis. Regions are alternate tint bands with
// their names along the foot; the chasm shape leaves its gap unshaded. The person's position
// is a disc on the first line at the middle of its region, and its pill sits in that region's
// column with any notes. Phone: the drawing keeps its width (the axes are words, not ticks)
// and the region columns stack as labelled cards.
import { CHASM_GAP, curveAt, curvePoints } from '../curves.mjs';
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setAttr, slotIndex, slotName, svg } from './core';
import type { ChartTool } from './quadrant';

export type CurveChart = {
  axes: { x: { label: string }; y: { label: string } };
  lines: { id: string; label: string; shape: string }[];
  regions: { id: string; label: string; from: number; to: number }[];
  position: string;
};

const W = 100;
const H = 56;
const LINE_STYLES = ['solid', 'dashed', 'dotted'];

/** The SVG path for a shape across the drawing. */
export function curvePath(shape: string): string {
  return curvePoints(shape, 60).map(([t, h], i) => `${i ? 'L' : 'M'}${(t * W).toFixed(2)} ${((1 - h) * H).toFixed(2)}`).join('');
}

export function createCurveView(tool: ChartTool & { chart: CurveChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const columns = new Map<string, HTMLDivElement>();
  let marker: SVGCircleElement | null = null;
  return createChart({
    family: 'curve',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!columns.size) {
        const drawing = svg(doc, 'svg', { class: 'dm-curve__drawing', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
        chart.regions.forEach((region, i) => drawing.append(svg(doc, 'rect', { class: 'dm-curve__band', 'data-band': String(i % 2), x: String(region.from * W), y: '0', width: String((region.to - region.from) * W), height: String(H) })));
        if (chart.lines.some((line) => line.shape === 'chasm')) drawing.append(svg(doc, 'rect', { class: 'dm-curve__gap', x: String(CHASM_GAP[0] * W), y: '0', width: String((CHASM_GAP[1] - CHASM_GAP[0]) * W), height: String(H) }));
        drawing.append(svg(doc, 'path', { class: 'dm-curve__axis', d: `M0 0V${H}H${W}` }));
        chart.lines.forEach((line, i) => drawing.append(svg(doc, 'path', { class: 'dm-curve__line', 'data-style': LINE_STYLES[i], 'data-line': line.id, d: curvePath(line.shape) })));
        marker = svg(doc, 'circle', { class: 'dm-curve__marker', r: '2.6', cx: '0', cy: '0' });
        marker.style.display = 'none';
        drawing.append(marker);
        const plotArea = el(doc, 'div', 'dm-curve__plot');
        const y = el(doc, 'span', 'dm-curve__y', chart.axes.y.label);
        y.setAttribute('aria-hidden', 'true');
        plotArea.append(y, drawing);
        const x = el(doc, 'p', 'dm-curve__x', chart.axes.x.label);
        x.setAttribute('aria-hidden', 'true');
        const legend = el(doc, 'p', 'dm-curve__legend');
        legend.setAttribute('aria-hidden', 'true');
        if (chart.lines.length > 1) chart.lines.forEach((line, i) => {
          const chip = el(doc, 'span', 'dm-curve__legend-item', line.label);
          chip.setAttribute('data-style', LINE_STYLES[i]);
          legend.append(chip);
        });
        const regions = el(doc, 'div', 'dm-curve__regions');
        for (const region of chart.regions) {
          const column = el(doc, 'div', 'dm-curve__region');
          column.setAttribute('role', 'group');
          column.setAttribute('aria-label', region.label);
          column.setAttribute('data-region', region.id);
          column.style.flexGrow = String(region.to - region.from);
          column.append(el(doc, 'span', 'dm-curve__region-label', region.label));
          regions.append(column);
          columns.set(region.id, column);
        }
        ctx.frame.append(legend, plotArea, x, regions);
      }
      const position = run.nodes.find((node) => slotName(node) === 'position' && columns.has(node.tag ?? ''));
      if (marker) {
        const region = chart.regions.find((r) => r.id === position?.tag);
        if (region) {
          const t = (region.from + region.to) / 2;
          setAttr(marker, 'cx', (t * W).toFixed(2));
          setAttr(marker, 'cy', ((1 - curveAt(chart.lines[0].shape, t)) * H).toFixed(2));
          marker.style.display = '';
        } else marker.style.display = 'none';
      }
      for (const column of columns.values()) column.classList.toggle('is-here', column.getAttribute('data-region') === position?.tag);
      return run.nodes
        .filter((node) => ['position', 'note'].includes(slotName(node)) && columns.has(node.tag ?? ''))
        .map((node) => {
          const region = chart.regions.find((r) => r.id === node.tag)!;
          const isPosition = slotName(node) === 'position';
          return {
            node,
            host: columns.get(region.id)!,
            fill: isPosition ? 'red' : 'tint',
            label: isPosition ? `${chart.position}, in ${region.label}` : `Note ${slotIndex(node)} on ${region.label}`,
            order: isPosition ? 0 : slotIndex(node)
          };
        });
    }
  }, doc);
}
