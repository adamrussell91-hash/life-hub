// packages/problem-solver/tools/morphological.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';
import { withChoice } from './choice.mjs';

const PER_SUBJECT = 8;
const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;
const named = (run, name) => run.nodes.filter((node) => parseSlot(node.slot)?.name === name);

export const subjectsOf = (run) => named(run, 'subject');

/** Attribute nodes of one subject id, in placement order. */
export function attributesOf(run, subjectId) {
  const ids = run.edges.filter((edge) => edge.kind === 'of' && edge.to === subjectId).map((edge) => edge.from);
  return run.nodes.filter((node) => ids.includes(node.id));
}

const subjectOfId = (run, attributeId) => run.edges.find((edge) => edge.kind === 'of' && edge.from === attributeId)?.to ?? null;
const subjectOfSlot = (run, slot) => {
  const node = run.nodes.find((item) => item.slot === slot);
  return node && parseSlot(node.slot)?.name === 'attribute' ? subjectOfId(run, node.id) : null;
};

/** Attribute ids a scenario picks. */
export const picksOf = (run, scenarioId) => run.edges.filter((edge) => edge.kind === 'picks' && edge.from === scenarioId).map((edge) => edge.to);

/** Attribute id pairs that cannot go together. */
export const contradictionPairs = (run) => named(run, 'contradiction').map((node) => run.edges.filter((edge) => edge.kind === 'pair' && edge.from === node.id).map((edge) => edge.to)).filter((pair) => pair.length === 2);

/** A scenario is consistent when it picks no contradictory pair. */
export function consistent(run, scenarioId) {
  const picked = new Set(picksOf(run, scenarioId));
  return !contradictionPairs(run).some(([a, b]) => picked.has(a) && picked.has(b));
}

const gridReady = (run) => {
  const subjects = subjectsOf(run);
  return subjects.length >= 3 && subjects.every((subject) => attributesOf(run, subject.id).length >= 2);
};

export const morphological = withChoice({
  id: 'morphological',
  name: 'Morphological analysis',
  kind: 'decision',
  step: 'decide',
  when: 'An ill-defined or many-sided problem where the answer is a combination of choices: lay out the parts and their possible forms, then test which combinations hold together (Zwicky\'s box, with cross-consistency checks).',
  failureModes: [
    'Subjects that overlap, so one choice is counted twice.',
    'Too few attributes per subject to give real alternatives.',
    'Keeping a scenario that contains a pair already shown to clash.',
    'Evaluating only the first scenario found.'
  ],
  steps: [
    { id: 'define', title: 'Define the problem', prompt: 'State the problem and what a good solution must do.' },
    { id: 'grid', title: 'Build the grid', prompt: 'List the subjects (the parts of the solution) and, under each, the different forms it could take.' },
    { id: 'explore', title: 'Explore combinations', prompt: 'Make scenarios by picking one form from every subject.' },
    { id: 'consistency', title: 'Remove what clashes', prompt: 'Name pairs of forms that cannot go together; any scenario holding such a pair drops out.' },
    { id: 'evaluate', title: 'Evaluate', prompt: 'Weigh the scenarios that hold together and say which is most promising and why.' }
  ],
  slots: {
    problem: 'The problem and what a solution must do',
    subject: 'A part of the solution that can take several forms',
    attribute: 'One form a subject could take',
    contradiction: 'Two forms, from different subjects, that cannot go together, and why',
    scenario: 'A combination: one form from every subject',
    evaluation: 'Which consistent scenario is most promising, and why'
  },
  edgeKinds: ['of', 'pair', 'picks'],
  requiredLinks: { attribute: { kind: 'of', message: 'Link each attribute to its subject (link kind "of", from the attribute to the subject).' } },
  validateNode(run, node, edges) {
    const name = parseSlot(node.slot)?.name;
    if (name === 'contradiction') {
      const pair = edges.filter((edge) => edge.kind === 'pair' && edge.from === node.slot).map((edge) => subjectOfSlot(run, edge.to));
      return pair.length === 2 && !pair.includes(null) && pair[0] !== pair[1] ? null : 'Link a contradiction to two attributes that cannot go together, from different subjects (link kind "pair").';
    }
    if (name === 'scenario') {
      const picked = edges.filter((edge) => edge.kind === 'picks' && edge.from === node.slot).map((edge) => subjectOfSlot(run, edge.to));
      const all = subjectsOf(run).map((subject) => subject.id);
      return picked.length === all.length && new Set(picked).size === all.length && picked.every((id) => all.includes(id)) ? null : 'A scenario picks exactly one attribute from every subject (link kind "picks", from the scenario to each attribute).';
    }
    return null;
  },
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    if (hasSlot(run, 'evaluation')) return [];
    const ready = gridReady(run);
    const scenarios = named(run, 'scenario');
    return open(
      scenarios.length ? null : nextIndexed(run, 'subject', 6),
      countSlots(run, 'subject') ? nextIndexed(run, 'attribute', 48) : null,
      ready ? nextIndexed(run, 'contradiction', 12) : null,
      ready ? nextIndexed(run, 'scenario', 6) : null,
      scenarios.some((scenario) => consistent(run, scenario.id)) ? 'evaluation' : null
    );
  },
  canEdge(run, from, to, kind) {
    const source = nameOf(run, from);
    const target = nameOf(run, to);
    if (kind === 'of') return source === 'attribute' && target === 'subject' && !subjectOfId(run, from) && attributesOf(run, to).length < PER_SUBJECT;
    if (kind === 'pair') {
      if (source !== 'contradiction' || target !== 'attribute') return false;
      const existing = run.edges.filter((edge) => edge.kind === 'pair' && edge.from === from).map((edge) => edge.to);
      return existing.length < 2 && existing.every((id) => subjectOfId(run, id) !== subjectOfId(run, to));
    }
    if (kind === 'picks') {
      if (source !== 'scenario' || target !== 'attribute') return false;
      return picksOf(run, from).every((id) => subjectOfId(run, id) !== subjectOfId(run, to));
    }
    return false;
  },
  complete(run) {
    return hasSlot(run, 'evaluation') && gridReady(run);
  }
});
