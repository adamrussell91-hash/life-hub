import { describe, expect, it } from 'vitest';
import { SectionBlockSchema } from '@/schemas/block';
import type { CompositionTemplate } from '@/schemas/composition';
import {
  builtinCompositionFill,
  matchCompositionFill,
  COMPOSITION_FILL_ACTIONS
} from '@/ai/composition-fill';
import { actionsForScope, isKnownAction } from '@/ai/capabilities';
import { buildAiSystemPrompt } from '@/ai/context';
import { emptySearchPack } from '@/ai/search-pack';
import { createBlock } from '@/blocks/create-block';
import type { Lesson } from '@/schemas/lesson';

const ISO = '2026-08-15T00:00:00.000Z';

describe('composition fill match', () => {
  it('matches quick actions and chat phrasing to the three approved kinds', () => {
    expect(matchCompositionFill({ action: 'turn_into_reading_comprehension' })?.kind).toBe(
      'reading_comprehension'
    );
    expect(
      matchCompositionFill({ message: 'Turn this article into a reading comprehension task' })?.title
    ).toBe('Reading Comprehension');
    expect(matchCompositionFill({ action: 'create_vocabulary_study' })?.kind).toBe('vocabulary_study');
    expect(matchCompositionFill({ message: 'Make a vocabulary study from this passage' })?.kind).toBe(
      'vocabulary_study'
    );
    expect(matchCompositionFill({ action: 'create_source_analysis' })?.kind).toBe('source_analysis');
    expect(matchCompositionFill({ message: 'Build a source analysis of this extract' })?.kind).toBe(
      'source_analysis'
    );
    expect(matchCompositionFill({ message: 'shorten this paragraph' })).toBeNull();
  });

  it('prefers a library composition with a matching title', () => {
    const root = createBlock('section', 'lib_root');
    if (root.block_type !== 'section') throw new Error('expected section');
    root.content.title = 'Year 12 Reading Comprehension';
    const library: CompositionTemplate[] = [
      {
        id: 'composition_custom_rc',
        type: 'composition_template',
        title: 'Year 12 Reading Comprehension',
        slug: 'year_12_reading_comprehension',
        status: 'active',
        root,
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1
      }
    ];
    const match = matchCompositionFill({
      message: 'turn this into a reading comprehension activity',
      library
    });
    expect(match?.source).toBe('library');
    expect(match?.id).toBe('composition_custom_rc');
    expect(match?.root.id).toBe('lib_root');
  });
});

describe('builtin composition skeletons', () => {
  it('returns schema-valid section trees for the three kinds', () => {
    for (const kind of ['reading_comprehension', 'vocabulary_study', 'source_analysis'] as const) {
      const built = builtinCompositionFill(kind);
      expect(SectionBlockSchema.safeParse(built.root).success).toBe(true);
      expect(built.root.block_type).toBe('section');
      expect(built.root.content.blocks.length).toBeGreaterThan(2);
    }
  });
});

describe('composition fill prompt + actions', () => {
  it('exposes fill actions on lesson and text blocks', () => {
    expect(COMPOSITION_FILL_ACTIONS.map((a) => a.id)).toEqual([
      'turn_into_reading_comprehension',
      'create_vocabulary_study',
      'create_source_analysis'
    ]);
    expect(actionsForScope('lesson', null).some((a) => a.id === 'turn_into_reading_comprehension')).toBe(
      true
    );
    expect(actionsForScope('block', 'rich_text').some((a) => a.id === 'create_vocabulary_study')).toBe(
      true
    );
    expect(isKnownAction('create_source_analysis')).toBe(true);
  });

  it('injects the composition JSON and fill rules into the system prompt', () => {
    const lesson: Lesson = {
      id: 'l1',
      type: 'lesson',
      title: 'Draft',
      slug: 'draft',
      status: 'active',
      unit_id: 'u1',
      sequence: 1,
      blocks: [createBlock('rich_text', 'rt1')],
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const fill = matchCompositionFill({ action: 'turn_into_reading_comprehension' });
    const prompt = buildAiSystemPrompt({
      agentName: "Ann O'Tation",
      protocol: 'Be precise.',
      lesson,
      scope: 'block',
      selectedBlockId: 'rt1',
      action: 'turn_into_reading_comprehension',
      compositionFill: fill ?? undefined,
      searchPack: emptySearchPack('reading comprehension', ISO)
    });
    expect(prompt).toContain('Composition fill');
    expect(prompt).toContain('Reading Comprehension');
    expect(prompt).toContain('Do not invent a new page architecture');
    expect(prompt).toContain('"block_type":"section"');
  });
});
