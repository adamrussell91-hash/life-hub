import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import type { CompositionTemplate } from '@/schemas/composition';

export type CompositionFillKind = 'reading_comprehension' | 'vocabulary_study' | 'source_analysis';

export const COMPOSITION_FILL_ACTIONS = [
  { id: 'turn_into_reading_comprehension', label: 'Turn into reading comprehension' },
  { id: 'create_vocabulary_study', label: 'Create vocabulary study' },
  { id: 'create_source_analysis', label: 'Create source analysis' }
];

export interface CompositionFillMatch {
  kind: CompositionFillKind;
  id: string;
  title: string;
  root: Extract<Block, { block_type: 'section' }>;
  source: 'builtin' | 'library';
}

const KINDS: Array<{
  kind: CompositionFillKind;
  action: string;
  title: string;
  pattern: RegExp;
}> = [
  {
    kind: 'reading_comprehension',
    action: 'turn_into_reading_comprehension',
    title: 'Reading Comprehension',
    pattern: /reading comprehension|comprehension (task|activity|questions)/i
  },
  {
    kind: 'vocabulary_study',
    action: 'create_vocabulary_study',
    title: 'Vocabulary Study',
    pattern: /vocabulary study|vocabulary activity|vocab(ulary)? list|glossary activity/i
  },
  {
    kind: 'source_analysis',
    action: 'create_source_analysis',
    title: 'Source Analysis',
    pattern: /source analysis|analyse (this |the )?source|analyze (this |the )?source|source study/i
  }
];

type SectionBlock = Extract<Block, { block_type: 'section' }>;

function asSection(block: Block, title: string, children: SectionBlock['content']['blocks']): SectionBlock {
  if (block.block_type !== 'section') throw new Error('expected section');
  block.content.title = title;
  block.content.blocks = children;
  return block;
}

function heading(id: string, text: string): Extract<Block, { block_type: 'heading' }> {
  const block = createBlock('heading', id);
  if (block.block_type !== 'heading') throw new Error('expected heading');
  block.content.text = text;
  return block;
}

function richText(id: string, html: string): Extract<Block, { block_type: 'rich_text' }> {
  const block = createBlock('rich_text', id);
  if (block.block_type !== 'rich_text') throw new Error('expected rich_text');
  block.content.html = html;
  return block;
}

function quote(id: string, text: string): Extract<Block, { block_type: 'quote' }> {
  const block = createBlock('quote', id);
  if (block.block_type !== 'quote') throw new Error('expected quote');
  block.content.quote = text;
  return block;
}

function questions(id: string, title: string, count: number): Extract<Block, { block_type: 'question_set' }> {
  const block = createBlock('question_set', id);
  if (block.block_type !== 'question_set') throw new Error('expected question_set');
  block.content.title = title;
  block.content.questions = Array.from({ length: count }, (_, index) => ({
    id: `${id}_q${index + 1}`,
    prompt: '',
    kind: 'short_answer' as const,
    response_space: 'medium' as const
  }));
  return block;
}

function definition(id: string): Extract<Block, { block_type: 'definition' }> {
  const block = createBlock('definition', id);
  if (block.block_type !== 'definition') throw new Error('expected definition');
  return block;
}

function readingRoot(): SectionBlock {
  return asSection(createBlock('section', 'composition_reading_comprehension'), 'Reading Comprehension', [
    heading('rc_passage_h', 'Passage'),
    richText('rc_passage', '<p>Paste or generate the passage here.</p>'),
    heading('rc_literal_h', 'Literal questions'),
    questions('rc_literal', 'Literal', 3),
    heading('rc_infer_h', 'Inferential questions'),
    questions('rc_infer', 'Inferential', 3),
    heading('rc_extend_h', 'Extension'),
    richText('rc_extend', '<p>One extension task.</p>')
  ]);
}

function vocabularyRoot(): SectionBlock {
  const cards = createBlock('flashcards', 'vs_cards');
  if (cards.block_type !== 'flashcards') throw new Error('expected flashcards');
  return asSection(createBlock('section', 'composition_vocabulary_study'), 'Vocabulary Study', [
    heading('vs_h', 'Key terms'),
    definition('vs_d1'),
    definition('vs_d2'),
    definition('vs_d3'),
    cards,
    heading('vs_check_h', 'Check understanding'),
    questions('vs_check', 'Vocabulary', 3)
  ]);
}

function sourceRoot(): SectionBlock {
  return asSection(createBlock('section', 'composition_source_analysis'), 'Source Analysis', [
    heading('sa_source_h', 'Source'),
    quote('sa_source', 'Source extract'),
    heading('sa_origin_h', 'Origin and context'),
    richText('sa_origin', '<p>Who produced this, when, and for whom?</p>'),
    heading('sa_questions_h', 'Analysis questions'),
    questions('sa_questions', 'Source analysis', 4)
  ]);
}

const BUILTIN_ROOT: Record<CompositionFillKind, () => SectionBlock> = {
  reading_comprehension: readingRoot,
  vocabulary_study: vocabularyRoot,
  source_analysis: sourceRoot
};

export function builtinCompositionFill(kind: CompositionFillKind): CompositionFillMatch {
  const meta = KINDS.find((entry) => entry.kind === kind)!;
  return {
    kind,
    id: `composition_${kind}`,
    title: meta.title,
    root: BUILTIN_ROOT[kind](),
    source: 'builtin'
  };
}

function kindFromAction(action?: string): (typeof KINDS)[number] | undefined {
  if (!action) return undefined;
  return KINDS.find((entry) => entry.action === action);
}

function kindFromMessage(message?: string): (typeof KINDS)[number] | undefined {
  if (!message) return undefined;
  return KINDS.find((entry) => entry.pattern.test(message));
}

export function matchCompositionFill(input: {
  action?: string;
  message?: string;
  library?: CompositionTemplate[];
}): CompositionFillMatch | null {
  const meta = kindFromAction(input.action) ?? kindFromMessage(input.message);
  if (!meta) return null;

  const libraryHit = (input.library ?? []).find((entry) => {
    if (entry.status !== 'active') return false;
    const title = entry.title.toLowerCase();
    return title.includes(meta.title.toLowerCase()) || title.includes(meta.kind.replaceAll('_', ' '));
  });
  if (libraryHit && libraryHit.root.block_type === 'section') {
    return {
      kind: meta.kind,
      id: libraryHit.id,
      title: libraryHit.title,
      root: libraryHit.root,
      source: 'library'
    };
  }

  return builtinCompositionFill(meta.kind);
}
