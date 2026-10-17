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

const SOURCES: Record<string, string> = {
  abstract_thinking, analysis, creative_thinking, critical_thinking, decision_making, inference,
  learning, logical_reasoning, metacognition, reflective_thinking, searching, synthesis
};

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
