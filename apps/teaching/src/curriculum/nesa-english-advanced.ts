import type { CurriculumOutcome } from '@/schemas/outcome';

const SUBJECT_ID = 'subject_y12_engadv';
const SYLLABUS = 'English Advanced';
const VERSION = '2017';

type Seed = Pick<
  CurriculumOutcome,
  'id' | 'code' | 'title' | 'description' | 'group' | 'source' | 'subject_id' | 'syllabus' | 'syllabus_version'
>;

const SEED: Seed[] = [
  {
    id: 'EA12-1',
    code: 'EA12-1',
    title: 'Independent, insightful, creative texts',
    description:
      'Independently responds to, composes and evaluates a range of complex texts for understanding, interpretation, critical analysis, imaginative expression and pleasure.',
    group: 'Common Module',
    source: 'nesa',
    subject_id: SUBJECT_ID,
    syllabus: SYLLABUS,
    syllabus_version: VERSION
  },
  {
    id: 'EA12-2',
    code: 'EA12-2',
    title: 'Language forms and features for purpose',
    description:
      'Uses, evaluates and justifies processes, skills and knowledge required to effectively respond to and compose texts in different modes, media and technologies.',
    group: 'Common Module',
    source: 'nesa',
    subject_id: SUBJECT_ID,
    syllabus: SYLLABUS,
    syllabus_version: VERSION
  },
  {
    id: 'EA12-3',
    code: 'EA12-3',
    title: 'Complex ideas through considered composition',
    description:
      'Critically analyses and uses language forms, features and structures of texts, justifying appropriateness for specific purposes, audiences and contexts and evaluating their effects on meaning.',
    group: 'Common Module',
    source: 'nesa',
    subject_id: SUBJECT_ID,
    syllabus: SYLLABUS,
    syllabus_version: VERSION
  },
  {
    id: 'EA12-4',
    code: 'EA12-4',
    title: 'Textual conversations — context and value',
    description:
      'Strategically adapts and applies knowledge, skills and understanding of language concepts and literary devices into new and different contexts.',
    group: 'Module A',
    source: 'nesa',
    subject_id: SUBJECT_ID,
    syllabus: SYLLABUS,
    syllabus_version: VERSION
  },
  {
    id: 'EA12-5',
    code: 'EA12-5',
    title: 'How texts influence and are influenced',
    description:
      'Thinks imaginatively, creatively, interpretively, critically and discerningly to respond to, evaluate and compose texts that synthesise complex information, ideas and arguments.',
    group: 'Module A',
    source: 'nesa',
    subject_id: SUBJECT_ID,
    syllabus: SYLLABUS,
    syllabus_version: VERSION
  },
  {
    id: 'EA12-6',
    code: 'EA12-6',
    title: 'Critical study — literary value',
    description:
      'Investigates and evaluates the relationships between texts.',
    group: 'Module B',
    source: 'nesa',
    subject_id: SUBJECT_ID,
    syllabus: SYLLABUS,
    syllabus_version: VERSION
  },
  {
    id: 'EA12-7',
    code: 'EA12-7',
    title: 'Informed personal response to a text',
    description:
      'Evaluates the diverse ways texts can represent personal and public worlds and recognises how they are valued.',
    group: 'Module B',
    source: 'nesa',
    subject_id: SUBJECT_ID,
    syllabus: SYLLABUS,
    syllabus_version: VERSION
  },
  {
    id: 'EA12-8',
    code: 'EA12-8',
    title: 'Craft of writing — imaginative',
    description:
      'Explains and evaluates nuanced cultural assumptions and values in texts and their effects on meaning.',
    group: 'Module C',
    source: 'nesa',
    subject_id: SUBJECT_ID,
    syllabus: SYLLABUS,
    syllabus_version: VERSION
  },
  {
    id: 'EA12-9',
    code: 'EA12-9',
    title: 'Craft of writing — discursive / persuasive',
    description:
      'Reflects on, evaluates and monitors own learning and consolidates to set learning goals in relation to English.',
    group: 'Module C',
    source: 'nesa',
    subject_id: SUBJECT_ID,
    syllabus: SYLLABUS,
    syllabus_version: VERSION
  }
];

export const NESA_ENGLISH_ADVANCED_SUBJECT_ID = SUBJECT_ID;

export function nesaEnglishAdvancedOutcomes(now: string): CurriculumOutcome[] {
  return SEED.map((row) => ({
    ...row,
    type: 'curriculum_outcome' as const,
    slug: row.code.toLowerCase(),
    status: 'active' as const,
    created_at: now,
    updated_at: now,
    schema_version: 1 as const
  }));
}
