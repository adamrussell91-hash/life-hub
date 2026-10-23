// apps/teaching/tests/unit/tutorial-model.test.ts
import { BlockSchema } from '@/schemas/block';
import { describe, it, expect } from 'vitest';
import type { Block } from '@/schemas/block';
import { groupOf, splitAtTeacher, tutorialCommon, tutorialIssues, tutorialParts, tutorialSkeleton } from '@/tutorial/model';
import type { TutorialSettings } from '@/tutorial/schema';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}): Block =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', created_at: '2026-10-23T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z', schema_version: 1, content }) as Block;
const section = (id: string, extra: Record<string, unknown>, blocks: Block[] = []): Block => b(id, 'section', { title: id, blocks, ...extra });

const tree: Block[] = [
  b('h1', 'heading', { text: 'Demo' }),
  section('tabA', { tutorial_group: 'ga' }, [b('f1', 'faded_example', {}), b('w1', 'with_teacher', { talking_points: [] }), b('y1', 'self_check', {})]),
  section('exitA', { tutorial_group: 'ga', tutorial_exit: true }, [b('q1', 'quiz_question', {})]),
  section('tabB', { tutorial_group: 'gb' }, []),
  b('r1', 'rich_text', { text: 'Wrap-up' })
];

const settings: TutorialSettings = {
  class_id: 'class1',
  groups: [
    { id: 'ga', name: 'A', why: '', goal: 'Today: naming it', gap_type: 'knowledge', students: ['st_ann'], evidence: [] },
    { id: 'gb', name: 'B', why: '', goal: 'Today: telling them apart', gap_type: 'mix_up', students: ['st_cy'], evidence: [] }
  ]
};

describe('tutorial model', () => {
  it('splits Common, tabs and exits', () => {
    const parts = tutorialParts(tree);
    expect(parts.common.map((x) => x.id)).toEqual(['h1', 'r1']);
    expect([...parts.tabs.keys()]).toEqual(['ga', 'gb']);
    expect(parts.exits.get('ga')?.id).toBe('exitA');
    expect(tutorialCommon(tree).map((x) => x.id)).toEqual(['h1', 'r1']);
  });

  it('splits a tab at With teacher', () => {
    const tab = tutorialParts(tree).tabs.get('ga')!;
    const split = splitAtTeacher(tab.content.blocks as Block[]);
    expect(split.before.map((x) => x.id)).toEqual(['f1']);
    expect(split.withTeacher?.id).toBe('w1');
    expect(split.after.map((x) => x.id)).toEqual(['y1']);
    expect(splitAtTeacher([b('x', 'rich_text')]).withTeacher).toBeNull();
  });

  it('finds a student’s group', () => {
    expect(groupOf(settings, 'st_cy')?.id).toBe('gb');
    expect(groupOf(settings, 'st_zz')).toBeNull();
    expect(groupOf(undefined, 'st_cy')).toBeNull();
  });

  it('builds a skeleton: a Common heading, then a tab and an exit per group', () => {
    let n = 0;
    const blocks = tutorialSkeleton(settings.groups, () => `id${++n}`);
    const parts = tutorialParts(blocks);
    expect(parts.common).toHaveLength(1);
    expect([...parts.tabs.keys()]).toEqual(['ga', 'gb']);
    expect([...parts.exits.keys()]).toEqual(['ga', 'gb']);
    const tab = parts.tabs.get('ga')!;
    expect((tab.content.blocks as Block[]).some((x) => x.block_type === 'with_teacher')).toBe(true);
  });

  it('lists publish issues', () => {
    const missing = tutorialIssues({ tutorial: settings, blocks: [section('tabA', { tutorial_group: 'ga' }, [])] });
    expect(missing).toContain('Group “A” has no With teacher step.');
    expect(missing).toContain('Group “A” has no exit check questions.');
    expect(missing).toContain('Group “B” has no tab.');
    const hinge = tutorialIssues({ tutorial: settings, blocks: [section('tabA', { tutorial_group: 'ga' }, [b('hq', 'hinge_question', {})])] });
    expect(hinge).toContain('Group “A” has a hinge question. In a group tab, use a faded example, cloze or self-check instead.');
    expect(tutorialIssues({ blocks: [] })).toEqual(['Plan the groups first: open the markbook and press Plan a tutorial.']);
    const stray = tutorialIssues({ tutorial: settings, blocks: [b('q9', 'quiz_question', {})] });
    expect(stray).toContain('Quiz questions in a tutorial go in a group’s exit check.');
  });

  it('skeleton blocks all parse, children included', () => {
    let n = 0;
    const check = (list: Block[]) => {
      for (const x of list) {
        const parsed = BlockSchema.parse(x);
        if (parsed.block_type === 'section') check(parsed.content.blocks as Block[]);
      }
    };
    check(tutorialSkeleton(settings.groups, () => `id${++n}`));
  });

  it('keeps the first of two tabs and flags duplicates', () => {
    const dup = [section('t1', { tutorial_group: 'ga' }), section('t2', { tutorial_group: 'ga' }), section('e1', { tutorial_group: 'ga', tutorial_exit: true }), section('e2', { tutorial_group: 'ga', tutorial_exit: true })];
    const parts = tutorialParts(dup);
    expect(parts.tabs.get('ga')?.id).toBe('t1');
    expect(parts.duplicates).toEqual({ tabs: ['ga'], exits: ['ga'] });
    const issues = tutorialIssues({ tutorial: settings, blocks: dup });
    expect(issues).toContain('Group “A” has two tabs.');
    expect(issues).toContain('Group “A” has two exit checks.');
  });

  it('flags a tab whose group is gone, once', () => {
    const blocks = [section('o1', { tutorial_group: 'zz' }), section('o2', { tutorial_group: 'zz', tutorial_exit: true })];
    const issues = tutorialIssues({ tutorial: settings, blocks });
    expect(issues.filter((m) => m === 'A tab is for a group that’s gone. Delete it or plan the groups again.')).toHaveLength(1);
  });

  it('flags a quiz question nested in columns inside a tab', () => {
    const cols = b('c1', 'columns', { columns: [{ blocks: [b('qx', 'quiz_question', {})] }, { blocks: [] }] });
    const issues = tutorialIssues({ tutorial: settings, blocks: [section('tabA', { tutorial_group: 'ga' }, [cols])] });
    expect(issues).toContain('Quiz questions in a tutorial go in a group’s exit check.');
  });
});
