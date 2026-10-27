// apps/teaching/tests/unit/sprint-model.test.ts
import { describe, it, expect } from 'vitest';
import { sprintParts, sprintIssues, publicSprint } from '@/sprint/model';
import { newSprintSettings, newSprintBlocks } from '@/sprint/defaults';

let n = 0;
const id = () => `b${++n}`;
const brief = { id: 'h1', type: 'block', block_type: 'heading', variant: 'medium', visibility: 'student_teacher', content: { text: 'The challenge' } } as const;

describe('sprint model', () => {
  it('splits the brief from the phase sections', () => {
    const parts = sprintParts([brief, ...newSprintBlocks(id)] as never);
    expect(parts.brief.map((b) => b.id)).toEqual(['h1']);
    expect([...parts.phases.keys()]).toEqual(['understand', 'sketch', 'decide', 'prototype', 'test']);
  });

  it('lists what stops a sprint publishing', () => {
    const s = newSprintSettings('class1');
    const issues = sprintIssues({ sprint: s, blocks: [] });
    expect(issues).toContain('Add at least 2 criteria in the Kit.');
    expect(issues).toContain('Set a deadline for every phase.');
    expect(issues).toContain('Put every student in a group.');
    const ready = { ...s, criteria: [{ id: 'c1', text: 'A' }, { id: 'c2', text: 'B' }], groups: [{ id: 'g1', name: 'Kestrel', students: ['st_ann'] }], phases: s.phases.map((p, i) => ({ ...p, due_date: `2026-11-0${i + 1}` })) };
    expect(sprintIssues({ sprint: ready, blocks: [] })).toEqual([]);
    const backwards = { ...ready, phases: ready.phases.map((p, i) => ({ ...p, due_date: `2026-11-0${5 - i}` })) };
    expect(sprintIssues({ sprint: backwards, blocks: [] })).toContain('Each phase’s deadline must come after the one before it.');
    expect(sprintIssues({ blocks: [] })).toEqual(['Set up the sprint’s Kit before publishing.']);
  });

  it('keeps groups, class, outcomes and columns out of the public subset', () => {
    const s = { ...newSprintSettings('class1'), criteria: [{ id: 'c1', text: 'A', outcome: 'ht4-9' }], groups: [{ id: 'g1', name: 'K', students: ['st_ann'] }], columns: { prototype: 'abcdefgh' } };
    const pub = publicSprint(s);
    expect(JSON.stringify(pub)).not.toMatch(/class1|st_ann|ht4-9|abcdefgh/);
    expect(pub.criteria).toEqual([{ id: 'c1', text: 'A' }]);
  });
});

describe('guides section', () => {
  it('keeps the Guides section out of the brief and finds it', async () => {
    const { withGuidesSection } = await import('@/sprint/defaults');
    const { sprintParts, briefText } = await import('@/sprint/model');
    const { inSprintTab } = await import('@/sprint/editor-tabs');
    let n = 0;
    const blocks = withGuidesSection(newSprintBlocks(() => `s${n++}`), () => `g${n++}`);
    expect(withGuidesSection(blocks, () => 'x')).toBe(blocks);
    const guides = blocks.find((b) => b.block_type === 'section' && b.content.sprint_guides)!;
    const parts = sprintParts(blocks);
    expect(parts.guides?.id).toBe(guides.id);
    expect(parts.brief).toHaveLength(0);
    expect(briefText(blocks)).toBe('');
    expect(inSprintTab(guides, 'guides')).toBe(true);
    expect(inSprintTab(guides, 'brief')).toBe(false);
  });
});
