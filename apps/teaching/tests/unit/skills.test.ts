import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/skills/api', () => ({ loadSkills: vi.fn(), refreshSkills: vi.fn() }));
vi.mock('@/teacher/confirm-dialog', () => ({ askConfirmCard: vi.fn() }));

import { loadSkills, refreshSkills } from '@/skills/api';
import { findSkill, nextMoveFor, rungForMark, skillsForArea, skillsForOutcome } from '@/skills/model';
import type { SkillsContinuum, SkillStrand } from '@/skills/schema';
import { renderSkillsLibrary, resetSkillsViewForTests, selectSkill } from '@/skills/view';
import { openColumnForm } from '@/markbook/column-form';
import { openAssessmentPanel } from '@/markbook/assessment-panel';
import type { AssessmentColumn, Column } from '@/markbook/schema';

// Invented content. The real continuum lives in the private data repo.
const rung = (label: string, next: string) => ({
  i_can: `I can ${label}.`,
  indicators: [] as { group: string; text: string; eg?: string }[],
  build: { formula: ['Claim', 'Reason'], parts: [{ id: 'c', name: 'Claim', job: 'Says it', language: ['so'] }, { id: 'r', name: 'Reason', job: 'Backs it', language: ['because'] }],
    example: [['A claim', 'c'], [' because a reason', 'r'], ['.', null]] as [string, string | null][], why_here: `Why ${label}`, checks: [`Check ${label}`], next_move: next }
});
const sub = (id: string, name: string, outcomes: number[], areas: string[]) => ({
  id, name, in_hsc: `${name} in the HSC`, draws_on: 'Sources', outcomes, focus_areas: areas,
  rungs: { capable: rung('claim', 'Add a reason.'), skilled: rung('reason', 'Add a concept.'), accomplished: rung('concept', 'Qualify it.'), excellent: rung('qualify', 'Keep refining: cut words.') }
});
const rungs = (['capable', 'skilled', 'accomplished', 'excellent'] as const).map((id, i) => ({ id, name: id[0]!.toUpperCase() + id.slice(1), marks: `${13 + i * 2}`, marker_words: 'x', meaning: 'y' }));
const strand = (id: SkillStrand['strand'], name: string, subs: ReturnType<typeof sub>[]): SkillStrand => ({ schema: 'skills_strand_v1', strand: id, name, summary: `${name} summary`, rungs, sub_strands: subs });
const continuum: SkillsContinuum = {
  strands: [
    strand('arguing', 'Arguing', [sub('thesis', 'Thesis', [5, 1], ['area-one']), sub('evidence', 'Evidence', [1], ['area-one', 'area-two'])]),
    strand('composing', 'Composing', [sub('reflection', 'Reflecting on choices', [6], ['area-two'])])
  ]
};

describe('skills model', () => {
  it('maps marks to rungs on the out-of-20 scale, scaled to any total', () => {
    expect([12, 13, 14, 15, 16, 17, 18, 19, 20].map((m) => rungForMark(m, 20))).toEqual(['below', 'capable', 'capable', 'skilled', 'skilled', 'accomplished', 'accomplished', 'excellent', 'excellent']);
    expect(rungForMark(8.5, 10)).toBe('accomplished');
    expect(rungForMark(5, 0)).toBe('below');
  });

  it('gives the next move from the rung reached, and aims below-the-line students at Capable', () => {
    const thesis = findSkill(continuum, 'arguing.thesis')!.sub;
    expect(nextMoveFor(thesis, 'skilled')).toMatchObject({ target: 'accomplished', move: 'Add a concept.' });
    expect(nextMoveFor(thesis, 'excellent')).toMatchObject({ target: 'excellent', move: 'cut words.' });
    expect(nextMoveFor(thesis, 'below')).toMatchObject({ target: 'capable', move: 'I can claim.' });
  });

  it('finds the skills for an outcome or a focus area', () => {
    expect(skillsForOutcome(continuum, 1).map((e) => e.ref)).toEqual(['arguing.thesis', 'arguing.evidence']);
    expect(skillsForOutcome(continuum, 1, 'area-two').map((e) => e.ref)).toEqual(['arguing.evidence']);
    expect(skillsForArea(continuum, 'area-two').map((e) => e.ref)).toEqual(['arguing.evidence', 'composing.reflection']);
  });
});

describe('skills continuum in the Resource Library', () => {
  beforeEach(() => {
    resetSkillsViewForTests();
    vi.mocked(loadSkills).mockResolvedValue(continuum);
  });
  afterEach(() => document.body.replaceChildren());
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('opens at a chosen skill and shows four labelled rungs', async () => {
    selectSkill('arguing.evidence');
    const host = document.createElement('div');
    document.body.append(host);
    renderSkillsLibrary(host);
    await settle();
    expect(host.querySelector('[data-skill-sub="evidence"]')?.getAttribute('aria-pressed')).toBe('true');
    expect([...host.querySelectorAll('.skl__rung')].map((r) => (r as HTMLElement).dataset.rung)).toEqual(['capable', 'skilled', 'accomplished', 'excellent']);
    expect(host.querySelectorAll('.skl__rung')[0]!.querySelectorAll('.skl__seg sup').length).toBe(2);
  });

  it('groups each rung\'s indicators under Look for, and leaves rungs without them unchanged', async () => {
    const withIndicators = structuredClone(continuum);
    withIndicators.strands[0]!.sub_strands[0]!.rungs.capable.indicators = [
      { group: 'Claim', text: 'names the writer as the subject', eg: '“The poet shows…”' },
      { group: 'Claim', text: 'uses one key term' },
      { group: 'Language', text: 'writes in the present tense' }
    ];
    vi.mocked(loadSkills).mockResolvedValue(withIndicators);
    selectSkill('arguing.thesis');
    const host = document.createElement('div');
    document.body.append(host);
    renderSkillsLibrary(host);
    await settle();
    const [capable, skilled] = host.querySelectorAll('.skl__rung');
    expect([...capable!.querySelectorAll('.skl__group-name')].map((g) => g.textContent)).toEqual(['Claim', 'Language']);
    expect(capable!.querySelector('.skl__inds li')?.textContent).toBe('names the writer as the subject (e.g. “The poet shows…”)');
    expect(skilled!.querySelector('.skl__look')).toBeNull();
  });

  it('switches strands, shows the whole-strand grid and refreshes', async () => {
    vi.mocked(refreshSkills).mockResolvedValue(continuum);
    const host = document.createElement('div');
    document.body.append(host);
    renderSkillsLibrary(host);
    await settle();
    (host.querySelector('[data-skill-strand="composing"]') as HTMLElement).click();
    expect(host.querySelector('.skl__rung .skl__ican')?.textContent).toBe('I can claim.');
    (host.querySelector('[data-skill-mode="grid"]') as HTMLElement).click();
    expect(host.querySelectorAll('.skl__grid tbody tr').length).toBe(1);
    (host.querySelector('.skl__refresh') as HTMLElement).click();
    expect(refreshSkills).toHaveBeenCalled();
  });
});

describe('skills in the markbook', () => {
  afterEach(() => document.body.replaceChildren());

  it('saves a criterion linked to a skill', async () => {
    const onSave = vi.fn(async (_c: Column) => undefined);
    let n = 0;
    const root = openColumnForm({ kind: 'assessment', outcomes: [], today: '2026-11-03', onSave, skills: continuum, random: () => ((n++ % 36) / 36) });
    const set = (name: string, value: string) => {
      const input = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
    };
    set('title', 'Essay');
    set('weight', '40');
    set('criterion-label', 'Argument');
    set('criterion-max', '20');
    set('criterion-skill', 'arguing.thesis');
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]![0];
    expect(saved.kind === 'assessment' && saved.criteria[0]!.skill).toBe('arguing.thesis');
  });

  it('shows the rung a mark reaches and adds the next move to the feedback', () => {
    const column: AssessmentColumn = { id: 'essay0001', kind: 'assessment', title: 'Essay', date: '2026-11-03', weight: 40,
      criteria: [{ id: 'c1', label: 'Argument', max: 20, outcomes: [], skill: 'arguing.thesis' }] };
    const root = openAssessmentPanel({ column, students: [{ id: 's1', name: 'Bob Brown', initials: 'BB' }], studentId: 's1', markFor: () => undefined, onSave: () => undefined, skills: continuum });
    expect(root.querySelector('.mb-panel__skill-hint')).not.toBeNull();
    const box = root.querySelector<HTMLInputElement>('.mb-panel__mark')!;
    box.value = '16';
    box.dispatchEvent(new Event('input'));
    expect(root.querySelector('.mb-panel__rung')?.textContent).toBe('Skilled');
    expect(root.querySelector('.mb-panel__skill-next')?.textContent).toBe('Next move: Add a concept.');
    root.querySelector<HTMLButtonElement>('.mb-panel__skill-add')!.click();
    expect(root.querySelector<HTMLTextAreaElement>('.mb-panel__feedback')!.value).toBe('Thesis: Add a concept.');
  });

  it('leaves criteria without a skill exactly as before', () => {
    const column: AssessmentColumn = { id: 'essay0002', kind: 'assessment', title: 'Essay', date: '2026-11-03', weight: 40,
      criteria: [{ id: 'c1', label: 'Argument', max: 20, outcomes: [] }] };
    const root = openAssessmentPanel({ column, students: [{ id: 's1', name: 'Bob Brown', initials: 'BB' }], studentId: 's1', markFor: () => undefined, onSave: () => undefined, skills: continuum });
    expect(root.querySelector('.mb-panel__skill')).toBeNull();
  });
});
