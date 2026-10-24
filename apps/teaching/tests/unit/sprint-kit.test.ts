// apps/teaching/tests/unit/sprint-kit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountKitEditor, evenGroups, kitId } from '@/sprint/kit-editor';
import { inSprintTab } from '@/sprint/editor-tabs';
import { newSprintSettings, newSprintBlocks } from '@/sprint/defaults';
import type { Lesson } from '@/schemas/lesson';

let n = 0;
const id = () => `b${++n}`;
const lesson = (): Lesson => ({ id: 'l1', type: 'lesson', title: 'Pompeii', unit_id: 'u1', sequence: 0, blocks: newSprintBlocks(id), created_at: 'x', updated_at: 'x', pedagogical_mode: 'design_sprint', sprint: newSprintSettings('class1') }) as unknown as Lesson;
const roster = [{ id: 'st_ann', name: 'Ann Bell', initials: 'AB' }, { id: 'st_cy', name: 'Cy Dale', initials: 'CD' }, { id: 'st_ed', name: 'Ed Fox', initials: 'EF' }, { id: 'st_gus', name: 'Gus Hale', initials: 'GH' }, { id: 'st_ivy', name: 'Ivy Jones', initials: 'IJ' }];

describe('kit editor', () => {
  it('makes ids that are valid markbook ids', () => {
    expect(kitId()).toMatch(/^[a-z0-9]{10}$/);
  });

  it('splits a roster into even groups in roster order', () => {
    const groups = evenGroups(roster, 2);
    expect(groups.map((g) => g.students)).toEqual([['st_ann', 'st_cy', 'st_ed'], ['st_gus', 'st_ivy']]);
    expect(groups.map((g) => g.name)).toEqual(['Group 1', 'Group 2']);
  });

  it('adds a criterion with an outcome and emits the lesson', async () => {
    let current = lesson();
    const emit = vi.fn((next: Lesson) => { current = next; });
    const k = mountKitEditor({ getLesson: () => current, emit, classes: [{ id: 'class1', name: '7B' }], loadRoster: async () => roster, outcomes: async () => [{ id: 'ht4-9', label: 'HT4-9 Sources' }] });
    await new Promise((r) => setTimeout(r, 0));
    k.root.querySelector<HTMLButtonElement>('[data-add="criterion"]')!.click();
    expect(current.sprint!.criteria).toHaveLength(1);
    const text = k.root.querySelector<HTMLInputElement>('.kit-criterion input')!;
    text.value = 'Uses sources';
    text.dispatchEvent(new Event('input'));
    const out = k.root.querySelector<HTMLSelectElement>('.kit-criterion select')!;
    out.value = 'ht4-9';
    out.dispatchEvent(new Event('change'));
    expect(current.sprint!.criteria[0]).toMatchObject({ text: 'Uses sources', outcome: 'ht4-9' });
  });

  it('switches requirement phases with the chips', () => {
    let current = lesson();
    const k = mountKitEditor({ getLesson: () => current, emit: (next) => { current = next; }, classes: [], loadRoster: async () => [], outcomes: async () => [] });
    k.root.querySelector<HTMLButtonElement>('[data-add="requirement"]')!.click();
    k.root.querySelector<HTMLButtonElement>('.kit-requirement [data-phase="decide"]')!.click();
    expect(current.sprint!.requirements[0]!.phases).toEqual(['sketch', 'prototype', 'decide']);
  });
});

describe('sprint tabs', () => {
  it('shows the brief on Brief and each phase section on its tab', () => {
    const blocks = newSprintBlocks(id);
    const brief = { id: 'h1', block_type: 'heading' } as never;
    expect(inSprintTab(brief, 'brief')).toBe(true);
    expect(inSprintTab(blocks[1]!, 'sketch')).toBe(true);
    expect(inSprintTab(blocks[1]!, 'brief')).toBe(false);
    expect(inSprintTab(blocks[1]!, 'all')).toBe(true);
  });
});
