// packages/problem-solver/glyphs.ts
import { SKILLS } from './skills.mjs';
import abstract_thinking from './glyphs/skills/abstract_thinking.svg?raw';
import analysis from './glyphs/skills/analysis.svg?raw';
import creative_thinking from './glyphs/skills/creative_thinking.svg?raw';
import critical_thinking from './glyphs/skills/critical_thinking.svg?raw';
import decision_making from './glyphs/skills/decision_making.svg?raw';
import inference from './glyphs/skills/inference.svg?raw';
import learning from './glyphs/skills/learning.svg?raw';
import logical_reasoning from './glyphs/skills/logical_reasoning.svg?raw';
import metacognition from './glyphs/skills/metacognition.svg?raw';
import reflective_thinking from './glyphs/skills/reflective_thinking.svg?raw';
import searching from './glyphs/skills/searching.svg?raw';
import synthesis from './glyphs/skills/synthesis.svg?raw';
import contradiction from './glyphs/tools/contradiction.svg?raw';
import concept_map from './glyphs/tools/concept_map.svg?raw';
import five_whys from './glyphs/tools/five_whys.svg?raw';
import gap_basic from './glyphs/tools/gap_basic.svg?raw';
import gap_radar from './glyphs/tools/gap_radar.svg?raw';
import problem_statement from './glyphs/tools/problem_statement.svg?raw';
import problem_tree from './glyphs/tools/problem_tree.svg?raw';
import smart from './glyphs/tools/smart.svg?raw';
import causal_map from './glyphs/tools/causal_map.svg?raw';
import perspective_shift from './glyphs/tools/perspective_shift.svg?raw';
import radial_tree from './glyphs/tools/radial_tree.svg?raw';
import force_field from './glyphs/tools/force_field.svg?raw';
import from_to from './glyphs/tools/from_to.svg?raw';
import intent_statement from './glyphs/tools/intent_statement.svg?raw';
import problem_reduction from './glyphs/tools/problem_reduction.svg?raw';
import analogical_reasoning from './glyphs/tools/analogical_reasoning.svg?raw';
import solution_tree from './glyphs/tools/solution_tree.svg?raw';
import lotus_blossom from './glyphs/tools/lotus_blossom.svg?raw';
import duncker from './glyphs/tools/duncker.svg?raw';
import decision_matrix from './glyphs/tools/decision_matrix.svg?raw';
import swot from './glyphs/tools/swot.svg?raw';
import morphological from './glyphs/tools/morphological.svg?raw';
import pareto from './glyphs/tools/pareto.svg?raw';
import dmaic from './glyphs/tools/dmaic.svg?raw';
import fifteen_percent from './glyphs/tools/fifteen_percent.svg?raw';
import kanban from './glyphs/tools/kanban.svg?raw';
import eisenhower from './glyphs/tools/eisenhower.svg?raw';
import type { PsToolId } from './types';

const SOURCES: Record<string, string> = {
  abstract_thinking, analysis, creative_thinking, critical_thinking, decision_making, inference,
  learning, logical_reasoning, metacognition, reflective_thinking, searching, synthesis
};

const EMBLEMS: Record<PsToolId, string> = {
  five_whys, concept_map, problem_tree, gap_basic, gap_radar, problem_statement, smart, contradiction,
  causal_map, perspective_shift, radial_tree, force_field, from_to, intent_statement,
  problem_reduction, analogical_reasoning, solution_tree, lotus_blossom, duncker,
  decision_matrix, swot, morphological, pareto, dmaic, fifteen_percent, kanban, eisenhower,
  // Task 2 replaces these temporary fallbacks with real emblems
  after_action_review: eisenhower, double_loop: eisenhower, feedback_matrix: eisenhower
};

/** Raw emblem markup, for drawings that place an emblem inside a larger svg. */
export const EMBLEM_SVG: Record<PsToolId, string> = EMBLEMS;

let copy = 0;

/** The glyph's SVG with its internal ids suffixed, so two copies on one page never share a mask. */
export function skillGlyph(id: string, doc: Document = document): HTMLSpanElement {
  const span = doc.createElement('span');
  span.className = 'ps-glyph';
  span.setAttribute('aria-hidden', 'true');
  const source = SOURCES[id];
  if (!source) return span;
  copy += 1;
  span.innerHTML = source.replace(/id="(ps-[a-z-]+)"/g, `id="$1-${copy}"`).replace(/url\(#(ps-[a-z-]+)\)/g, `url(#$1-${copy})`);
  span.querySelector('title')?.remove();
  return span;
}

export function skillName(id: string): string {
  return SKILLS.find((skill) => skill.id === id)?.name ?? id;
}

/** Small chip: glyph plus name. Missing skills render outlined. */
export function skillChip(id: string, { missing = false }: { missing?: boolean } = {}, doc: Document = document): HTMLSpanElement {
  const chip = doc.createElement('span');
  chip.className = `ps-skill${missing ? ' ps-skill--missing' : ''}`;
  const label = doc.createElement('span');
  label.textContent = skillName(id);
  chip.append(skillGlyph(id, doc), label);
  chip.title = SKILLS.find((skill) => skill.id === id)?.description ?? '';
  return chip;
}

/** The tool's emblem from the corner of its toolkit page, in book colours. */
export function toolEmblem(id: PsToolId, doc: Document = document): HTMLSpanElement {
  const span = doc.createElement('span');
  span.className = 'ps-emblem';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = EMBLEMS[id];
  return span;
}
