import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn() };
});

import { apiGet } from '@/api/client';
import { rubricRows } from '@/marking/rubric-model';
import { mountRubricPanel, type RubricSetup } from '@/marking/rubric-panel';
import { loadRubricSetup } from '@/marking/rubric-setup';
import { classLadder, createClassSkills } from '@/skills/class-view';
import { speakingWhere } from '@/blocks/voice-where';
import { voiceStartLoader } from '@/blocks/voice-last-time';
import { createVoiceTaskFields } from '@/blocks/voice-block-editor';
import { resetSkillsCacheForTests } from '@/skills/api';
import type { SkillRow } from '@/progress/types';

/** Invented continuum and class. Placeholder wording only. */
const rung = (n: string) => ({ i_can: `I can ${n}`, indicators: [{ group: 'Delivery', text: `Look ${n}` }], build: { formula: [], parts: [{ id: 'p', name: 'P', job: 'j', language: [] }], example: [['x', null]], why_here: 'w', checks: [], next_move: `Move up from ${n}` } });
const sub = (id: string, name: string) => ({ id, name, in_hsc: 'x', draws_on: 'x', outcomes: [], focus_areas: [], points: [], rungs: { capable: rung('capable'), skilled: rung('skilled'), accomplished: rung('accomplished'), excellent: rung('excellent') } });
const rungInfo = ['capable', 'skilled', 'accomplished', 'excellent'].map((id) => ({ id, name: id[0]!.toUpperCase() + id.slice(1), marks: '', marker_words: '', meaning: '' }));
const continuum = { strands: [
  { schema: 'skills_strand_v1', strand: 'reading', name: 'Reading', summary: '', rungs: rungInfo, sub_strands: [sub('technique', 'Technique')] },
  { schema: 'skills_strand_v1', strand: 'speaking', name: 'Speaking', summary: '', rungs: rungInfo, sub_strands: [sub('delivery', 'Delivery'), sub('responding', 'Responding')] }
] } as never;
const students = [
  { id: 'st_a', name: 'Ada Sample', initials: 'AS' },
  { id: 'st_b', name: 'Ben Example', initials: 'BE' },
  { id: 'st_c', name: 'Cal Test', initials: 'CT' }
];
const classRungs = { students: [
  { id: 'st_a', name: 'Ada Sample', initials: 'AS', rungs: { 'speaking.delivery': 'skilled' } },
  { id: 'st_b', name: 'Ben Example', initials: 'BE', rungs: { 'speaking.delivery': 'below', 'speaking.responding': 'excellent' } },
  { id: 'st_c', name: 'Cal Test', initials: 'CT', rungs: {} }
] };
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => { document.body.replaceChildren(); vi.mocked(apiGet).mockReset(); resetSkillsCacheForTests(); });

describe('marking: the speaking ladder', () => {
  const setup = (over: Partial<RubricSetup> = {}): RubricSetup => ({
    rows: rubricRows({ skills: ['speaking.delivery'], pieces: [], steps: [] }, { continuum, deep: [] }),
    unitPieces: [], deep: [], continuum, codes: [], ...over
  });

  it('shows every rung with its "I can", Excellent at the top', () => {
    const p = mountRubricPanel(setup());
    const rungs = [...p.el.querySelectorAll<HTMLButtonElement>('.rb-rung')];
    expect(rungs.map((b) => b.querySelector('.rb-rung__name')!.textContent)).toEqual(['Excellent', 'Accomplished', 'Skilled', 'Capable', 'Below']);
    expect(rungs[2]!.querySelector('.rb-rung__ican')!.textContent).toBe('I can skilled');
    expect(rungs[4]!.querySelector('.rb-rung__ican')!.textContent).toBe('Not yet at Capable');
  });

  it('marks where the student was last time, and changes when the student does', () => {
    const p = mountRubricPanel(setup({ last: { 'speaking.delivery': 'capable' } }));
    const last = () => [...p.el.querySelectorAll('.rb-rung.is-last')].map((b) => (b as HTMLElement).dataset.rung);
    expect(last()).toEqual(['speaking.delivery:capable']);
    expect(p.el.querySelector('.rb-rung.is-last .rb-rung__last')!.hasAttribute('hidden')).toBe(false);
    p.setLast({ 'speaking.delivery': 'accomplished' });
    expect(last()).toEqual(['speaking.delivery:accomplished']);
    p.setLast(null);
    expect(last()).toEqual([]);
  });

  it('says the next move once a rung is picked', () => {
    const p = mountRubricPanel(setup());
    const climb = () => p.el.querySelector('.rb-climb')!.textContent;
    expect(climb()).toBe('');
    p.el.querySelector<HTMLButtonElement>('[data-rung="speaking.delivery:skilled"]')!.click();
    expect(climb()).toBe('Next move, to Accomplished: Move up from skilled');
    p.el.querySelector<HTMLButtonElement>('[data-rung="speaking.delivery:below"]')!.click();
    expect(climb()).toBe('Next move, to Capable: I can capable');
    p.el.querySelector<HTMLButtonElement>('[data-rung="speaking.delivery:excellent"]')!.click();
    expect(climb()).toBe('Keep refining: Move up from excellent');
  });

  it('rubric setup reads the student’s last rungs for tagged skills', async () => {
    const rungs = vi.fn(async () => ({ 'speaking.delivery': 'skilled' }));
    const lesson = async () => ({ blocks: [{ id: 'blk', type: 'block', block_type: 'audio', content: {}, settings: { deep_skills: ['speaking.delivery'] } }] }) as never;
    const s = await loadRubricSetup({ lessonId: 'l1', blockId: 'blk', who: { classId: 'c1', studentId: 'st_a' } }, { lesson, continuum: async () => continuum, codes: async () => [], rungs });
    expect(rungs).toHaveBeenCalledWith('c1', 'st_a');
    expect(s!.last).toEqual({ 'speaking.delivery': 'skilled' });
  });
});

describe('markbook: where the class sits', () => {
  it('groups students by rung and lists who is not placed', () => {
    const { by, none } = classLadder('speaking.delivery', students, classRungs);
    expect(by.skilled.map((s) => s.id)).toEqual(['st_a']);
    expect(by.below.map((s) => s.id)).toEqual(['st_b']);
    expect(none.map((s) => s.id)).toEqual(['st_c']);
  });

  it('opens on Speaking, draws the ladder with names, and opens a student', async () => {
    const open = vi.fn();
    const view = createClassSkills('c1', { continuum: async () => continuum, rungs: async () => classRungs });
    const el = view.render(students, open);
    document.body.append(el);
    await flush(); await flush();
    expect(el.querySelector('[aria-selected="true"]')!.textContent).toBe('Speaking');
    const rows = [...el.querySelectorAll<HTMLElement>('.skc__rung')];
    expect(rows.map((r) => r.dataset.rung)).toEqual(['excellent', 'accomplished', 'skilled', 'capable', 'below']);
    expect(el.querySelector('[data-rung="skilled"] .skc__who')!.textContent).toContain('Ada Sample');
    expect(el.querySelector('.skc__none summary')!.textContent).toBe('Not placed yet: 1');
    expect(el.textContent).not.toContain('null');
    el.querySelector<HTMLButtonElement>('[data-rung="skilled"] .skc__student')!.click();
    expect(open).toHaveBeenCalledWith('st_a');
    el.querySelector<HTMLButtonElement>('[data-skill-sub="responding"]')!.click();
    expect(el.querySelector('[data-rung="excellent"] .skc__who')!.textContent).toContain('Ben Example');
  });

  it('says so when the rungs can’t load', async () => {
    const view = createClassSkills('c1', { continuum: async () => continuum, rungs: async () => { throw new Error('no'); } });
    const el = view.render(students, vi.fn());
    document.body.append(el);
    await flush(); await flush();
    expect(el.querySelector('.skc__status')!.textContent).toContain('didn’t load');
  });
});

describe('student: before the next speaking task', () => {
  const row: SkillRow = { key: 'skill:speaking.delivery', name: 'Delivery', counts: { below: 0, capable: 1, skilled: 1, accomplished: 0, excellent: 0 }, now: 'skilled', story: { kind: 'now', step: 'skilled' }, i_can: 'I can skilled', next_move: 'Move up from skilled', next_rung: 'accomplished' };

  it('shows where they sit and the move to the next rung', () => {
    const box = speakingWhere([row])!;
    expect(box.querySelector('.voice-where__title')!.textContent).toBe('Your speaking so far');
    expect(box.querySelector('.pg-rung.is-now')).not.toBeNull();
    expect(box.querySelector('.voice-where__next')!.textContent).toBe('To reach Accomplished: Move up from skilled');
  });

  it('shows nothing with no rows, no class or no initials', async () => {
    expect(speakingWhere([])).toBeNull();
    const want = { speaking: true, vivas: false };
    const rows = async (classId: string | undefined, call: Parameters<typeof voiceStartLoader>[3]) => (await voiceStartLoader(classId, 'l1', want, call)).rows;
    expect(await rows(undefined, undefined)).toEqual([]);
    expect(await rows('c1', async () => ({ need: 'initials' }))).toEqual([]);
    expect(await rows('c1', async () => { throw new Error('x'); })).toEqual([]);
    expect(await rows('c1', async () => ({ need: null, skills: [{ rows: [row] }] }))).toEqual([row]);
  });
});

describe('editor: ticking Speaking links the task to a Speaking skill', () => {
  it('offers the Speaking sub-strands and tags the block with the one picked', async () => {
    vi.mocked(apiGet).mockResolvedValue({ continuum } as never);
    let block = { id: 'blk', type: 'block', block_type: 'audio', variant: 'medium', visibility: 'all', content: { mode: 'viva', prompt: 'Q' }, settings: {} } as never as Parameters<typeof createVoiceTaskFields>[0] extends () => infer B ? B : never;
    const fields = createVoiceTaskFields(() => block, (next) => { block = next; });
    document.body.append(fields.el);
    fields.refresh();
    await flush(); await flush();
    const pick = [...fields.el.querySelectorAll<HTMLButtonElement>('.voice-editor__skills button')];
    expect(pick.map((b) => b.textContent)).toEqual(['Delivery', 'Responding']);
    pick[0]!.click();
    expect((block.settings as { deep_skills?: string[] }).deep_skills).toEqual(['speaking.delivery']);
    expect(fields.el.querySelector('.voice-editor__skills button[aria-pressed="true"]')!.textContent).toBe('Delivery');
  });

  it('hides the picker when Speaking codes are off', async () => {
    vi.mocked(apiGet).mockResolvedValue({ continuum } as never);
    const block = { id: 'blk', type: 'block', block_type: 'audio', variant: 'medium', visibility: 'all', content: { mode: 'viva', prompt: 'Q', code_groups: ['composition'] }, settings: {} } as never;
    const fields = createVoiceTaskFields(() => block, () => {});
    document.body.append(fields.el);
    fields.refresh();
    await flush(); await flush();
    expect(fields.el.querySelector('.voice-editor__skills')).toBeNull();
  });
});
