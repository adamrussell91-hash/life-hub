// packages/decision-book/families/path.mjs
// The path family: ordered steps.
//   flow    a yes/no decision flow. Each stage's slot is its id. A question stage is tagged
//           yes or no and goes to its `yes` or `no` stage; a step goes to `next`; an end
//           stage closes the path. The flow must be acyclic and every route must end.
//   stages  stages in order, each slot `<stage>:<round>`. With `loop`, finishing a round opens
//           the first stage of the next (up to `rounds`), as in result optimisation.
//   layers  defences (`layer` slots) with the holes in them (`hole` slots, each linked "in"
//           to its layer), as in the Swiss cheese model.
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../../problem-solver/slots.mjs';
import { baseTool, check, checkCommon, framing, isKey, reflected, subjectFirst } from './common.mjs';

const RESERVED = new Set(['subject', 'reflection', 'layer', 'hole']);

function checkFlow(id, stages) {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  for (const stage of stages) {
    check(['question', 'step', 'end'].includes(stage.kind), id, `stage ${stage.id} kind is question, step or end`);
    const targets = stage.kind === 'question' ? [stage.yes, stage.no] : stage.kind === 'step' ? [stage.next] : [];
    for (const target of targets) check(byId.has(target), id, `stage ${stage.id} points at missing stage ${target}`);
  }
  // Every route from the first stage reaches an end, with no loops.
  const walk = (stageId, seen) => {
    check(!seen.has(stageId), id, `the flow loops back to ${stageId}`);
    const stage = byId.get(stageId);
    if (stage.kind === 'end') return;
    const next = new Set([...seen, stageId]);
    for (const target of stage.kind === 'question' ? [stage.yes, stage.no] : [stage.next]) walk(target, next);
  };
  walk(stages[0].id, new Set());
}

/** The stages a flow run has taken so far, in order, each with its node (or none yet). */
export function flowRoute(run, stages) {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const placed = new Map(run.nodes.map((node) => [parseSlot(node.slot)?.name, node]));
  const route = [];
  let stage = stages[0];
  while (stage) {
    const node = placed.get(stage.id) ?? null;
    route.push({ stage, node });
    if (!node || stage.kind === 'end') break;
    const target = stage.kind === 'question' ? (node.tag === 'yes' ? stage.yes : stage.no) : stage.next;
    stage = byId.get(target);
  }
  return route;
}

/** The highest round a stages run has reached (1 before anything is placed). */
export function roundOf(run, stages) {
  const ids = new Set(stages.map((stage) => stage.id));
  return Math.max(1, ...run.nodes.filter((node) => ids.has(parseSlot(node.slot)?.name)).map((node) => parseSlot(node.slot).index ?? 1));
}

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {'flow'|'stages'|'layers'} config.chart.variant
 * @param {{id: string, label: string, kind?: string, yes?: string, no?: string, next?: string}[]} [config.chart.stages]
 * @param {boolean} [config.chart.loop] stages may repeat in rounds
 * @param {number} [config.chart.rounds] most rounds (3)
 * @param {number} [config.chart.minRounds] complete rounds before the reflection (1)
 * @param {{layer: string, hole: string}} [config.chart.layers] what a layer and a hole are
 */
export function pathTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(['flow', 'stages', 'layers'].includes(chart.variant), id, 'variant is flow, stages or layers');
  const { subject, reflection } = framing(config);
  const head = (run) => subjectFirst(run, subject);
  const closing = (run) => (reflection && countSlots(run, 'reflection') ? [] : null);

  if (chart.variant === 'layers') {
    check(chart.layers?.layer && chart.layers?.hole, id, 'layers need layer and hole descriptions');
    const ready = (run) => countSlots(run, 'layer') >= 2 && countSlots(run, 'hole') >= 1;
    const layerOf = (run, nodeId) => parseSlot(run.nodes.find((node) => node.id === nodeId)?.slot)?.name;
    return baseTool(config, 'path', { layer: chart.layers.layer, hole: chart.layers.hole }, {
      edgeKinds: ['in'],
      requiredLinks: { hole: { kind: 'in', message: 'Link each hole to the layer it is in (link kind "in", from the hole to the layer).' } },
      canEdge(run, from, to, kind) {
        return kind === 'in' && layerOf(run, from) === 'hole' && layerOf(run, to) === 'layer' && !run.edges.some((edge) => edge.kind === 'in' && edge.from === from);
      },
      nextSlots(run) {
        return head(run) ?? closing(run) ?? open(nextIndexed(run, 'layer', 6), hasSlot(run, 'layer') ? nextIndexed(run, 'hole', 12) : null, reflection && ready(run) ? 'reflection' : null);
      },
      complete(run) {
        return ready(run) && reflected(run, reflection);
      }
    });
  }

  check(Array.isArray(chart.stages) && chart.stages.length >= 2, id, 'needs at least two stages');
  for (const stage of chart.stages) {
    check(isKey(stage.id) && !RESERVED.has(stage.id), id, `stage id ${stage.id} must be a lower-case key and not ${[...RESERVED].join(', ')}`);
    check(typeof stage.label === 'string' && stage.label, id, `stage ${stage.id} needs a label`);
  }
  check(new Set(chart.stages.map((stage) => stage.id)).size === chart.stages.length, id, 'stage ids are unique');
  const slots = Object.fromEntries(chart.stages.map((stage) => [stage.id, stage.label]));

  if (chart.variant === 'flow') {
    checkFlow(id, chart.stages);
    const questions = chart.stages.filter((stage) => stage.kind === 'question').map((stage) => stage.id);
    const ended = (run) => flowRoute(run, chart.stages).at(-1).stage.kind === 'end' && Boolean(flowRoute(run, chart.stages).at(-1).node);
    return baseTool(config, 'path', slots, {
      nodeTags: Object.fromEntries(questions.map((stageId) => [stageId, ['yes', 'no']])),
      nextSlots(run) {
        const first = head(run) ?? closing(run);
        if (first) return first;
        if (ended(run)) return reflection ? ['reflection'] : [];
        return [flowRoute(run, chart.stages).at(-1).stage.id];
      },
      complete(run) {
        return ended(run) && reflected(run, reflection);
      }
    });
  }

  const rounds = chart.loop ? (chart.rounds ?? 3) : 1;
  // Rounds that must be complete before the reflection (result optimisation runs three full loops).
  const minRounds = chart.minRounds ?? 1;
  check(Number.isInteger(minRounds) && minRounds >= 1 && minRounds <= rounds, id, 'minRounds is between 1 and rounds');
  const inRound = (run, round) => chart.stages.filter((stage) => run.nodes.some((node) => node.slot === `${stage.id}:${round}`));
  return baseTool(config, 'path', slots, {
    nextSlots(run) {
      const first = head(run) ?? closing(run);
      if (first) return first;
      const round = roundOf(run, chart.stages);
      const done = inRound(run, round).length;
      if (done < chart.stages.length) return [`${chart.stages[done].id}:${round}`];
      return open(round < rounds ? `${chart.stages[0].id}:${round + 1}` : null, reflection && round >= minRounds ? 'reflection' : null);
    },
    complete(run) {
      const full = Array.from({ length: minRounds }, (_, i) => inRound(run, i + 1).length === chart.stages.length).every(Boolean);
      return full && reflected(run, reflection);
    }
  });
}
