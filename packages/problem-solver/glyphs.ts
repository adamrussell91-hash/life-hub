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
import type { PsToolId } from './types';

const SOURCES: Record<string, string> = {
  abstract_thinking, analysis, creative_thinking, critical_thinking, decision_making, inference,
  learning, logical_reasoning, metacognition, reflective_thinking, searching, synthesis
};

const EMBLEMS: Partial<Record<PsToolId, string>> = { five_whys, concept_map, problem_tree, gap_basic, gap_radar, problem_statement, smart, contradiction };

/** Raw emblem markup, for drawings that place an emblem inside a larger svg. */
export const EMBLEM_SVG: Partial<Record<PsToolId, string>> = EMBLEMS;

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
  span.innerHTML = EMBLEMS[id] ?? '';
  return span;
}
