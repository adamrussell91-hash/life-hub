import type { Block } from '@/schemas/block';
import type { KaplanLens, KaplanQualifier } from '@/schemas/kaplan';

export const KAPLAN_LENSES: readonly KaplanLens[] = ['patterns', 'multiple_perspectives', 'ethics'];
export const KAPLAN_LABELS: Record<KaplanLens, string> = {
  patterns: 'Patterns', multiple_perspectives: 'Multiple Perspectives', ethics: 'Ethics'
};
export const KAPLAN_PATHS: Record<KaplanLens, string> = {
  patterns: 'Two details → a relationship → an explanation',
  multiple_perspectives: 'One detail → two readings → a judgement',
  ethics: 'One detail → a question of values → a supported judgement'
};

export function canHaveKaplanQualifier(block: Block): boolean {
  return !['heading', 'divider', 'spacer', 'columns', 'section', 'tabs', 'collection', 'outcomes'].includes(block.block_type);
}

/** Plain-language symbol drawings: repeating tiles, spectacles, and balance scales. */
export function kaplanSymbol(lens: KaplanLens): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('kaplan-symbol');
  const paths: Record<KaplanLens, string> = {
    patterns: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7zM5 5h3v3H5zM16 16h3v3h-3z',
    multiple_perspectives: 'M2 10V7h4M22 10V7h-4M10 12h4M2 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0M14 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
    ethics: 'M12 3v18M4 7h16M7 7l-4 7h8L7 7zM17 7l-4 7h8l-4-7zM7 21h10'
  };
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[lens]);
  svg.append(path);
  return svg;
}

export type KaplanStep = { title: string; prompt: string; support: string };
export function kaplanSteps(qualifier: KaplanQualifier): [KaplanStep, KaplanStep, KaplanStep] {
  const focus = qualifier.focus || 'the idea in the original activity';
  const defaults: Record<KaplanLens, [KaplanStep, KaplanStep, KaplanStep]> = {
    patterns: [
      { title: 'Choose two details', prompt: `Choose two specific details from this activity that help you explore ${focus}.`, support: 'Record a quotation, observation or example for each. Include where you found it.' },
      { title: 'Find the relationship', prompt: 'Do these details repeat, contrast or show a change? Explain the connection.', support: 'Try: “Both details…”, “Whereas the first…, the second…” or “From… to…”' },
      { title: 'Return to the question', prompt: `What does that relationship reveal about ${focus}? Use it to develop your answer to the original activity.`, support: 'Explain what the relationship suggests, rather than simply naming a pattern.' }
    ],
    multiple_perspectives: [
      { title: 'Choose one detail', prompt: `Choose one specific detail from this activity that helps you explore ${focus}.`, support: 'Keep this same detail in view as you test both readings. Use a precise quotation, observation or example.' },
      { title: 'Consider two readings', prompt: `What are two different ways of understanding this detail in relation to ${focus}? Explain what supports each reading.`, support: 'Try: “One reading is… because…” and “Another reading is… because…”. Consider what each reading notices or overlooks.' },
      { title: 'Make a judgement', prompt: 'Which reading is better supported, or what does their tension reveal? Use your judgement in your answer to the original activity.', support: 'You can favour one reading or explain why both matter. Ground your decision in the detail you chose.' }
    ],
    ethics: [
      { title: 'Choose one detail', prompt: `Choose one specific detail from this activity that raises a question about ${focus}.`, support: 'Start with something you can point to: a quotation, observation, action or example.' },
      { title: 'Ask what is at stake', prompt: 'Whose needs or values matter here? Explain the difficult choice or tension your detail reveals.', support: 'Who benefits? Who might lose out? What seems fair or unfair? Choose one question your evidence can support.' },
      { title: 'Support your judgement', prompt: `What does this tension help you understand about ${focus}? Use your evidence to answer the original activity.`, support: 'Explain your judgement and acknowledge one complication. You do not need to find a single “right” moral answer.' }
    ]
  };
  return defaults[qualifier.lens].map((step, i) => ({
    ...step,
    prompt: qualifier.prompts?.[i]?.trim() || step.prompt,
    support: qualifier.supports?.[i] != null ? qualifier.supports[i]!.trim() : step.support
  })) as [KaplanStep, KaplanStep, KaplanStep];
}

export function suggestKaplanFocus(block: Block): string {
  const source = block.block_type === 'question_set' ? block.content.questions[0]?.prompt ?? '' : '';
  const match = source.match(/\b(?:explore|explores|present|presents|represent|represents|develop|develops)\s+(.+?)\s+(?:through|using|in)\b/i);
  return match?.[1]?.trim().slice(0, 200) ?? '';
}

export function withKaplanQualifier<T extends Block>(block: T, qualifier: KaplanQualifier): T {
  const qualifiers = [...(block.qualifiers ?? [])];
  const at = qualifiers.findIndex((item) => item.lens === qualifier.lens);
  if (at < 0) qualifiers.push(qualifier);
  else qualifiers[at] = qualifier;
  return { ...block, qualifiers };
}

export function withoutKaplanQualifier<T extends Block>(block: T, lens: KaplanLens): T {
  const qualifiers = block.qualifiers?.filter((item) => item.lens !== lens) ?? [];
  const { qualifiers: _removed, ...rest } = block;
  return (qualifiers.length ? { ...rest, qualifiers } : rest) as T;
}
