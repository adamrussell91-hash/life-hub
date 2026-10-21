// packages/decision-book/render/path.ts
// The path family's chart.
//   flow    the route taken, top to bottom: each stage a disc on a dotted line, its answer
//           beside it; a question's answer carries a Yes or No word chip; the stage being
//           asked shows as an open disc saying "Now"; an end stage is a filled disc.
//   stages  one track per round, the stages left to right on a dotted line ending in an arrow.
//   layers  the safeguards as stacked slices, each with its holes; a hole not yet linked to a
//           layer waits under them.
// Phone: tracks turn vertical; the flow is already vertical.
import type { PsNode } from '../../problem-solver/types';
import { flowRoute, roundOf } from '../families/path.mjs';
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setAttr, setText, slotIndex, slotName } from './core';
import type { ChartTool } from './quadrant';

type Stage = { id: string; label: string; kind?: 'question' | 'step' | 'end'; yes?: string; no?: string; next?: string };
export type PathChart = { variant: 'flow' | 'stages' | 'layers'; stages?: Stage[]; loop?: boolean; rounds?: number; layers?: { layer: string; hole: string } };

export function createPathView(tool: ChartTool & { chart: PathChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const route = el(doc, 'ol', 'dm-path__route');
  const steps = new Map<string, { row: HTMLLIElement; answer: HTMLDivElement; chip: HTMLSpanElement }>();
  const rounds = new Map<number, Map<string, HTMLDivElement>>();
  const layerRows = new Map<string, { row: HTMLDivElement; holes: HTMLDivElement }>();
  const loose = el(doc, 'div', 'dm-path__loose');
  let built = false;

  function stepRow(stage: Stage): { row: HTMLLIElement; answer: HTMLDivElement; chip: HTMLSpanElement } {
    const row = el(doc, 'li', 'dm-path__step');
    row.setAttribute('data-stage', stage.id);
    row.setAttribute('data-kind', stage.kind ?? 'step');
    const disc = el(doc, 'span', 'dm-path__disc');
    disc.setAttribute('aria-hidden', 'true');
    const label = el(doc, 'span', 'dm-path__label', stage.label);
    const chip = el(doc, 'span', 'dm-path__chip');
    chip.hidden = true;
    const answer = el(doc, 'div', 'dm-path__answer');
    row.append(disc, label, chip, answer);
    return { row, answer, chip };
  }

  function roundTrack(round: number, frame: HTMLDivElement): Map<string, HTMLDivElement> {
    let hosts = rounds.get(round);
    if (hosts) return hosts;
    hosts = new Map();
    const track = el(doc, 'div', 'dm-path__round');
    track.setAttribute('role', 'group');
    track.setAttribute('aria-label', `Round ${round}`);
    track.append(el(doc, 'span', 'dm-path__round-label', `Round ${round}`));
    const line = el(doc, 'div', 'dm-path__stages');
    for (const stage of chart.stages!) {
      const cell = el(doc, 'div', 'dm-path__stage');
      cell.setAttribute('data-stage', stage.id);
      cell.append(el(doc, 'span', 'dm-path__disc'), el(doc, 'span', 'dm-path__label', stage.label));
      line.append(cell);
      hosts.set(stage.id, cell);
    }
    track.append(line);
    frame.append(track);
    rounds.set(round, hosts);
    return hosts;
  }

  return createChart({
    family: 'path',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!built) {
        built = true;
        if (chart.variant === 'flow') ctx.frame.append(route);
        if (chart.variant === 'stages') roundTrack(1, ctx.frame);
        if (chart.variant === 'layers') {
          const stack = el(doc, 'div', 'dm-path__layers');
          stack.setAttribute('data-empty', chart.layers!.layer);
          loose.setAttribute('data-label', 'Holes not yet linked to a layer');
          ctx.frame.append(stack, loose);
        }
      }
      if (chart.variant === 'flow') return drawFlow(run);
      if (chart.variant === 'stages') return drawStages(run, ctx.frame);
      return drawLayers(run, ctx.frame.querySelector('.dm-path__layers') as HTMLDivElement);
    }
  }, doc);

  function drawFlow(run: DmToolRun): EntrySpec[] {
    const taken = flowRoute(run, chart.stages!) as { stage: Stage; node: PsNode | null }[];
    const wanted = new Set(taken.map((step) => step.stage.id));
    for (const [id, step] of steps) if (!wanted.has(id)) {
      step.row.remove();
      steps.delete(id);
    }
    const out: EntrySpec[] = [];
    taken.forEach(({ stage, node }, i) => {
      let step = steps.get(stage.id);
      if (!step) {
        step = stepRow(stage);
        steps.set(stage.id, step);
      }
      if (route.children[i] !== step.row) route.insertBefore(step.row, route.children[i] ?? null);
      setAttr(step.row, 'data-now', node ? null : 'true');
      const answer = stage.kind === 'question' && node ? (node.tag === 'yes' ? 'Yes' : 'No') : node ? '' : 'Now';
      step.chip.hidden = !answer;
      setText(step.chip, answer);
      if (node) out.push({ node, host: step.answer, fill: stage.kind === 'end' ? 'green' : node.tag === 'no' ? 'red' : 'tint', label: `${stage.label}${answer && answer !== 'Now' ? ` ${answer}` : ''}` });
    });
    return out;
  }

  function drawStages(run: DmToolRun, frame: HTMLDivElement): EntrySpec[] {
    const last = roundOf(run, chart.stages!);
    for (let round = 1; round <= last; round += 1) roundTrack(round, frame);
    for (const [round, hosts] of rounds) if (round > last) {
      hosts.values().next().value?.closest('.dm-path__round')?.remove();
      rounds.delete(round);
    }
    const ids = new Set(chart.stages!.map((stage) => stage.id));
    return run.nodes
      .filter((node) => ids.has(slotName(node)))
      .map((node) => {
        const stage = chart.stages!.find((s) => s.id === slotName(node))!;
        const round = slotIndex(node) || 1;
        return { node, host: rounds.get(round)!.get(stage.id)!, fill: 'tint', label: `Round ${round}, ${stage.label}` };
      });
  }

  function drawLayers(run: DmToolRun, stack: HTMLDivElement): EntrySpec[] {
    const layers = run.nodes.filter((node) => slotName(node) === 'layer');
    for (const [id, layer] of layerRows) if (!layers.some((node) => node.id === id)) {
      layer.row.remove();
      layerRows.delete(id);
    }
    const out: EntrySpec[] = [];
    for (const node of layers) {
      let layer = layerRows.get(node.id);
      if (!layer) {
        const row = el(doc, 'div', 'dm-path__layer');
        row.setAttribute('role', 'group');
        const name = el(doc, 'div', 'dm-path__layer-name');
        const holes = el(doc, 'div', 'dm-path__holes');
        row.append(name, holes);
        stack.append(row);
        layer = { row, holes };
        layerRows.set(node.id, layer);
      }
      layer.row.style.order = String(slotIndex(node));
      setAttr(layer.row, 'aria-label', `${chart.layers!.layer} ${slotIndex(node)}`);
      out.push({ node, host: layer.row.querySelector('.dm-path__layer-name') as HTMLDivElement, fill: 'green', label: `${chart.layers!.layer} ${slotIndex(node)}` });
    }
    for (const node of run.nodes.filter((n) => slotName(n) === 'hole')) {
      const into = run.edges.find((edge) => edge.kind === 'in' && edge.from === node.id)?.to;
      const layer = into ? layerRows.get(into) : undefined;
      out.push({ node, host: layer ? layer.holes : loose, fill: 'red', label: `${chart.layers!.hole} ${slotIndex(node)}${layer ? '' : ', not linked'}` });
    }
    loose.hidden = !out.some((spec) => spec.host === loose);
    return out;
  }
}
