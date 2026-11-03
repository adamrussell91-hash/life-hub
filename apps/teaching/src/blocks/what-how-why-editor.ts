import type { Block } from '@/schemas/block';
import { el, field } from '@/blocks/peer-feedback-ui';
import '@/blocks/peer-feedback.css';

type OutcomesBlock = Extract<Block, { block_type: 'outcomes' }>;
type Criterion = OutcomesBlock['content']['how'][number];

/** A block placed before this design can be saved with empty content, and lessons reach here unparsed. */
export function whatHowWhyContent(content: Partial<OutcomesBlock['content']> | undefined): OutcomesBlock['content'] {
  return { what: content?.what ?? '', how: content?.how ?? [] };
}

/** One criterion a line. A line that stays the same keeps its id, so a student's self-check stays with it. */
export function criteriaFromLines(text: string, existing: Criterion[]): Criterion[] {
  const spare = [...existing];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = spare.findIndex((c) => c.text === line);
      if (at >= 0) return spare.splice(at, 1)[0]!;
      return { id: `c_${Math.random().toString(36).slice(2, 10)}`, text: line };
    });
}

export function createWhatHowWhyFields(onChange: (block: OutcomesBlock) => void, getLatest: () => OutcomesBlock): HTMLElement {
  const root = el('div', 'peer-feedback peer-feedback--editor');
  const set = (patch: Partial<OutcomesBlock['content']>) => {
    const latest = getLatest();
    onChange({ ...latest, content: { ...latest.content, ...patch } });
  };
  const start = whatHowWhyContent(getLatest().content);

  const what = field('What we’re learning', 'One line on what the class is learning about.');
  what.input.rows = 2;
  what.input.maxLength = 200;
  what.input.value = start.what;
  what.input.addEventListener('input', () => set({ what: what.input.value }));

  const how = field('How we’ll learn it and show it', 'One a line. Leave it short if you’ll build the list with the class.');
  how.input.rows = 4;
  how.input.value = start.how.map((c) => c.text).join('\n');
  how.input.addEventListener('input', () => set({ how: criteriaFromLines(how.input.value, whatHowWhyContent(getLatest().content).how) }));

  root.append(
    what.wrap,
    how.wrap,
    el('p', 'pf-note block-secondary', 'Students write their own why in class. Once this is published, their suggestions and whys appear on the block for you to pick from.')
  );
  return root;
}
