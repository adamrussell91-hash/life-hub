import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/alignment/api', () => ({ fetchAlignment: vi.fn(), saveAlignmentPoint: vi.fn() }));
vi.mock('@/skills/api', () => ({ loadSkills: vi.fn(() => Promise.reject(new Error('no skills in this test'))), refreshSkills: vi.fn() }));

import { fetchAlignment, saveAlignmentPoint } from '@/alignment/api';
import { loadSkills } from '@/skills/api';
import { alignmentDots, heatHits, heatScore, heatStep, pointsFor, sharedRuns, skillHits, subjectUsesAlignment, wordStems } from '@/alignment/model';
import { applyAlignmentPatch, mergeMissingSkills, needsSkills, type Alignment } from '@/alignment/schema';
import { mountAlignmentView, resetAlignmentViewForTests } from '@/alignment/view';

// Invented wording. The real syllabus text lives in the private data repo.
const doc: Alignment = {
  schema: 'syllabus_alignment_v1',
  title: 'Sample',
  match: { syllabus: 'Sample', version: '2024', year: 12 },
  sources: [],
  outcomes: [
    { n: 1, code: 'SAM-12-01', text: 'reads closely for meaning' },
    { n: 4, code: 'SAM-12-04', text: 'writes in new forms' }
  ],
  processes: [{ code: 'UN', name: 'Understanding', text: 'knows things' }, { code: 'EX', name: 'Experimenting', text: 'tries things' }],
  concepts: [
    { key: 'ARG', name: 'Argument', head: 'argues well', bullets: [{ n: 1, text: 'claims need reasons', adv: false }, { n: 2, text: 'counter claims help', adv: true }] },
    { key: 'STY', name: 'Style', head: 'style matters', bullets: [{ n: 1, text: 'style shapes meaning', adv: false }] }
  ],
  focus_areas: [
    { id: 'area-one', name: 'Area one', points: [
      { id: 'U1', kind: 'U', short: 'Close reading', text: 'Reading closely for meaning', outcomes: [{ n: 1, link: 'shared' }], concepts: [{ ref: 'ARG1', link: 'shared' }, { ref: 'STY1', link: 'related' }], processes: ['UN'], skills: ['analysis', 'inference'] },
      { id: 'R1', kind: 'R', short: 'New forms', text: 'Compose in new forms', outcomes: [{ n: 1, link: 'related' }, { n: 4, link: 'shared' }], concepts: [{ ref: 'ARG2', link: 'shared' }], processes: ['EX'], skills: ['creative_thinking'] }
    ] },
    { id: 'area-two', name: 'Area two', points: [
      { id: 'U1', kind: 'U', short: 'Style study', text: 'Style and meaning', outcomes: [{ n: 4, link: 'shared' }], concepts: [{ ref: 'STY1', link: 'shared' }], processes: [] }
    ] }
  ]
};

describe('alignment model', () => {
  it('shows the tab for English Advanced but not Year 11', () => {
    expect(subjectUsesAlignment('English Advanced')).toBe(true);
    expect(subjectUsesAlignment('Year 12 English Advanced')).toBe(true);
    expect(subjectUsesAlignment('Year 11 English Advanced')).toBe(false);
    expect(subjectUsesAlignment('English Standard')).toBe(false);
  });

  it('makes one dot per point, outcome and concept, solid only when both links share wording', () => {
    const dots = alignmentDots(pointsFor(doc, 'area-one'));
    const u1 = dots.filter((d) => d.point.id === 'U1');
    expect(u1.map((d) => `${d.n}${d.concept}${d.link}`)).toEqual(['1ARGshared', '1STYrelated']);
    const r1 = dots.filter((d) => d.point.id === 'R1');
    expect(r1.map((d) => `${d.n}${d.concept}${d.link}`)).toEqual(['1ARGrelated', '4ARGshared']);
  });

  it('counts heatmap cells across all focus areas', () => {
    const all = pointsFor(doc, 'all');
    expect(heatHits(all, 4, 'STY').map((h) => `${h.point.area}:${h.point.id}`)).toEqual(['area-two:U1']);
    expect(heatScore(heatHits(all, 1, 'ARG'))).toBe(1.5);
    expect(heatStep(0, 3)).toBe(0);
    expect(heatStep(0.1, 3)).toBe(1);
    expect(heatStep(3, 3)).toBe(7);
  });

  it('counts thinking skills against outcomes, and fills in skills a saved copy predates', () => {
    const one = pointsFor(doc, 'area-one');
    expect(skillHits(one, 1, 'analysis').map((h) => h.point.id)).toEqual(['U1']);
    expect(skillHits(one, 4, 'creative_thinking').map((h) => `${h.point.id}:${h.link}`)).toEqual(['R1:shared']);
    const old = structuredClone(doc);
    delete old.focus_areas[0]!.points[0]!.skills;
    old.focus_areas[0]!.points[1]!.skills = ['learning'];
    expect(needsSkills(old)).toBe(true);
    const { doc: merged, changed } = mergeMissingSkills(old, doc);
    expect(changed).toBe(true);
    expect(merged.focus_areas[0]!.points.map((p) => p.skills)).toEqual([['analysis', 'inference'], ['learning']]);
    expect(merged.focus_areas[1]!.points[0]!.skills).toEqual([]);
  });

  it('highlights only the content words both sides share', () => {
    const runs = sharedRuns('evaluates the meaning of texts', wordStems('meanings in a text'));
    expect(runs.filter((r) => r.shared).map((r) => r.text)).toEqual(['meaning']);
  });

  it('keeps wording when links change, and refuses links outside the syllabus', () => {
    const next = applyAlignmentPatch(doc, { focus_area: 'area-one', point: 'U1', outcomes: [{ n: 4, link: 'related' }], concepts: [], processes: ['EX'], skills: ['metacognition'] });
    const u1 = next.focus_areas[0]!.points[0]!;
    expect(u1).toMatchObject({ text: 'Reading closely for meaning', outcomes: [{ n: 4, link: 'related' }], processes: ['EX'], edited: true });
    expect(doc.focus_areas[0]!.points[0]!.edited).toBeUndefined();
    expect(() => applyAlignmentPatch(doc, { focus_area: 'area-one', point: 'U1', outcomes: [{ n: 2, link: 'shared' }], concepts: [], processes: [], skills: [] })).toThrow();
    expect(() => applyAlignmentPatch(doc, { focus_area: 'area-one', point: 'U1', outcomes: [], concepts: [], processes: [], skills: ['mind_reading'] })).toThrow();
  });
});

describe('alignment view', () => {
  let host: HTMLElement;
  beforeEach(() => {
    resetAlignmentViewForTests();
    host = document.createElement('div');
    document.body.append(host);
    vi.mocked(fetchAlignment).mockResolvedValue({ alignment: structuredClone(doc) });
  });
  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  const settle = () => new Promise((r) => setTimeout(r, 0));
  const click = (el: Element | null | undefined) => (el as HTMLElement).click();

  it('draws numbered dots with process badges, and traces a point in the panel', async () => {
    mountAlignmentView(host);
    await settle();
    const dots = [...host.querySelectorAll('.align__dot')];
    expect(dots.map((d) => d.textContent)).toEqual(['1', '1', '1', '4']);
    expect(host.querySelector('.align__badge')?.textContent).toBe('UN');
    click(host.querySelector('.align__ylab-btn'));
    expect(host.querySelector('.align__panel .align__title')?.textContent).toContain('U1');
    expect(host.querySelector('.align__panel mark')).not.toBeNull();
  });

  it('switches to the heatmap and offers all of Year 12', async () => {
    mountAlignmentView(host);
    await settle();
    click(host.querySelector('[data-align-mode="heat"]'));
    click(host.querySelector('[data-align-area="all"]'));
    const cells = [...host.querySelectorAll('.align__hc')].map((c) => c.textContent);
    expect(cells).toEqual(['2', '1', '1', '1']);
  });

  it('shows skill glyphs and a thinking skills heatmap', async () => {
    mountAlignmentView(host);
    await settle();
    expect(host.querySelectorAll('.align__ylab .align__glyph').length).toBe(3);
    expect(host.querySelector<HTMLElement>('[data-align-rows="skills"]')?.closest('.align__modes')?.hidden).toBe(true);
    click(host.querySelector('[data-align-mode="heat"]'));
    click(host.querySelector('[data-align-rows="skills"]'));
    expect(host.querySelectorAll('.align__rl-btn--skill').length).toBe(12);
    click(host.querySelector('.align__rl-btn--skill'));
    expect(host.querySelector('.align__panel .align__title')?.textContent).toContain('Abstract thinking');
  });

  it('saves edited links and shows the result', async () => {
    const saved = applyAlignmentPatch(doc, { focus_area: 'area-one', point: 'U1', outcomes: [{ n: 4, link: 'shared' }], concepts: [{ ref: 'ARG1', link: 'shared' }], processes: ['UN'], skills: ['analysis'] });
    vi.mocked(saveAlignmentPoint).mockResolvedValue({ alignment: saved });
    mountAlignmentView(host);
    await settle();
    click(host.querySelector('.align__ylab-btn'));
    click(host.querySelector('.align__edit'));
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.align__panel button')];
    click(buttons.find((b) => b.textContent === 'Save links'));
    await settle();
    expect(saveAlignmentPoint).toHaveBeenCalledWith(expect.objectContaining({ focus_area: 'area-one', point: 'U1' }));
    expect(host.querySelector('.align__edited')?.textContent).toBe('Edited');
  });

  it('shows an HSC skills layer when the continuum loads', async () => {
    const r = (x: string) => ({ i_can: x, build: { formula: ['P'], parts: [{ id: 'p', name: 'P', job: 'j', language: [] }], example: [['e', 'p']] as [string, string | null][], why_here: 'w', checks: [], next_move: 'n' } });
    vi.mocked(loadSkills).mockResolvedValueOnce({ strands: [{ schema: 'skills_strand_v1', strand: 'arguing', name: 'Arguing', summary: 's',
      rungs: (['capable', 'skilled', 'accomplished', 'excellent'] as const).map((id) => ({ id, name: id, marks: '13', marker_words: 'x', meaning: 'y' })),
      sub_strands: [{ id: 'thesis', name: 'Thesis', in_hsc: 'h', draws_on: 'd', outcomes: [1], focus_areas: ['area-one'], rungs: { capable: r('a'), skilled: r('b'), accomplished: r('c'), excellent: r('d') } }] }] });
    mountAlignmentView(host);
    await settle();
    await settle();
    expect(host.querySelector('.align__panel')?.textContent).toContain('HSC skills for this focus area');
    click(host.querySelector('[data-align-mode="heat"]'));
    click(host.querySelector('[data-align-rows="hsc"]'));
    expect([...host.querySelectorAll('.align__hc')].map((c) => c.textContent)).toEqual(['2', '']);
    click(host.querySelector('.align__rl-btn'));
    expect(host.querySelector('.align__panel .align__title')?.textContent).toBe('Arguing · Thesis');
  });

  it('explains when the private file can’t be reached', async () => {
    const { ApiClientError } = await import('@/api/client');
    vi.mocked(fetchAlignment).mockRejectedValue(new ApiClientError({ code: 'private_data_unbound', message: 'The private syllabus file can’t be reached from here.', retryable: false }));
    mountAlignmentView(host);
    await settle();
    expect(host.textContent).toContain('can’t be reached');
    expect(host.querySelector('button')?.textContent).toBe('Try again');
  });
});
