import type { Block } from '@/schemas/block';
import { COMPOSITION_FILL_ACTIONS } from '@/ai/composition-fill';

export interface AiAction {
  id: string;
  label: string;
}

const TEXTISH: AiAction[] = [
  { id: 'rewrite', label: 'Rewrite' },
  { id: 'shorten', label: 'Shorten' },
  { id: 'expand', label: 'Expand' },
  { id: 'simplify', label: 'Simplify' },
  { id: 'change_reading_level', label: 'Change reading level' },
  { id: 'summarise', label: 'Summarise' },
  { id: 'generate_questions', label: 'Generate questions' },
  ...COMPOSITION_FILL_ACTIONS
];

const QUESTION_SET: AiAction[] = [
  { id: 'generate_questions', label: 'Generate questions' },
  { id: 'generate_answers', label: 'Generate answers' },
  { id: 'increase_difficulty', label: 'Increase difficulty' },
  { id: 'decrease_difficulty', label: 'Decrease difficulty' },
  { id: 'add_scaffold', label: 'Add scaffold' },
  { id: 'improve_sequence', label: 'Improve sequence' },
  { id: 'create_extension', label: 'Create extension' }
];

const SECTION: AiAction[] = [
  { id: 'reorganise', label: 'Reorganise' },
  { id: 'condense', label: 'Condense' },
  { id: 'add_scaffolding', label: 'Add scaffolding' },
  { id: 'improve_progression', label: 'Improve progression' },
  { id: 'turn_into_guided_practice', label: 'Turn into guided practice' }
];

const LESSON: AiAction[] = [
  { id: 'build_lesson', label: 'Build lesson' },
  { id: 'reorganise', label: 'Reorganise' },
  { id: 'expand', label: 'Expand' },
  { id: 'condense', label: 'Condense' },
  ...COMPOSITION_FILL_ACTIONS
];

const MEDIA: AiAction[] = [
  { id: 'write_alt_text', label: 'Write alt text' },
  { id: 'generate_activity', label: 'Generate activity from media' },
  { id: 'summarise', label: 'Summarise' }
];

const ACTIVITY: AiAction[] = [
  { id: 'rewrite', label: 'Rewrite' },
  { id: 'simplify', label: 'Simplify' },
  { id: 'increase_difficulty', label: 'Increase difficulty' },
  { id: 'decrease_difficulty', label: 'Decrease difficulty' },
  { id: 'add_scaffold', label: 'Add scaffold' }
];

const VIZ: AiAction[] = [
  { id: 'explain', label: 'Explain' },
  { id: 'simplify', label: 'Simplify' },
  { id: 'generate_questions', label: 'Generate questions' }
];

const TABLE: AiAction[] = [
  { id: 'rewrite', label: 'Rewrite' },
  { id: 'expand', label: 'Expand' },
  { id: 'summarise', label: 'Summarise' },
  { id: 'generate_questions', label: 'Generate questions' }
];

const ACCORDION_TABS: AiAction[] = [
  { id: 'reorganise', label: 'Reorganise' },
  { id: 'condense', label: 'Condense' },
  { id: 'expand', label: 'Expand' },
  { id: 'improve_progression', label: 'Improve progression' }
];

const TIMELINE: AiAction[] = [
  { id: 'rewrite', label: 'Rewrite' },
  { id: 'expand', label: 'Expand' },
  { id: 'condense', label: 'Condense' },
  { id: 'improve_progression', label: 'Improve sequence' }
];

const COLLECTION: AiAction[] = [
  { id: 'summarise', label: 'Summarise listed items' },
  { id: 'suggest_additions', label: 'Suggest additions' }
];

const HTMLISH: AiAction[] = [
  { id: 'rewrite', label: 'Rewrite' },
  { id: 'simplify', label: 'Simplify' },
  { id: 'explain', label: 'Explain' }
];

const BY_TYPE: Partial<Record<Block['block_type'], AiAction[]>> = {
  rich_text: TEXTISH,
  heading: TEXTISH.filter((a) => a.id !== 'generate_questions'),
  callout: TEXTISH,
  quote: TEXTISH,
  definition: TEXTISH,
  code: [
    { id: 'rewrite', label: 'Rewrite' },
    { id: 'explain', label: 'Explain' },
    { id: 'simplify', label: 'Simplify' }
  ],
  question_set: QUESTION_SET,
  section: SECTION,
  image: MEDIA,
  gallery: MEDIA,
  video: MEDIA,
  audio: MEDIA,
  attachment: MEDIA,
  embed: MEDIA,
  flashcards: ACTIVITY,
  cloze: ACTIVITY,
  self_check: ACTIVITY,
  chart: VIZ,
  equation: VIZ,
  diagram: VIZ,
  mind_map: VIZ,
  concept_map: VIZ,
  table: TABLE,
  accordion: ACCORDION_TABS,
  tabs: ACCORDION_TABS,
  timeline: TIMELINE,
  collection: COLLECTION,
  outcomes: [],
  html: HTMLISH,
  html_app: HTMLISH,
  columns: [
    { id: 'reorganise', label: 'Reorganise columns' },
    { id: 'condense', label: 'Condense' },
    { id: 'balance', label: 'Balance content' }
  ],
  divider: [],
  spacer: []
};

export function actionsForBlockType(blockType: Block['block_type']): AiAction[] {
  return BY_TYPE[blockType] ?? [];
}

export function actionsForScope(
  scope: 'block' | 'section' | 'lesson',
  blockType: Block['block_type'] | null
): AiAction[] {
  if (scope === 'lesson') return LESSON;
  if (scope === 'section') return SECTION;
  if (!blockType) return LESSON;
  return actionsForBlockType(blockType);
}

export function isKnownAction(actionId: string): boolean {
  const all = new Set<string>();
  for (const list of Object.values(BY_TYPE)) {
    for (const a of list ?? []) all.add(a.id);
  }
  for (const a of SECTION) all.add(a.id);
  for (const a of LESSON) all.add(a.id);
  return all.has(actionId);
}
