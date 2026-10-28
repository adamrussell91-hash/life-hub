// apps/teaching/tests/unit/case-study-player.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountCasePlayer } from '@/case-study/player';
import type { CaseClient, CaseStatus } from '@/case-study/api';
import type { PublicCase } from '@/case-study/schema';
import type { PublishedLesson } from '@/schemas/published-lesson';

const publicCase = (over: Partial<PublicCase> = {}): PublicCase => ({
  purpose: 'x', pace: 'own', support: 'standard', release: 'whole',
  decision: { prompt: 'The dam is at 31%. What do you do?', options: [{ id: 'a', label: 'Restrict now' }, { id: 'b', label: 'Wait for rain' }] },
  part_titles: ['Part one'], has_objections: true,
  ...over
});
const lessonOf = (c: PublicCase, blocks: unknown[] = []) => ({ lesson_id: 'cs1', title: 'The dam', unit_id: 'u1', blocks, published_at: 'x', schema_version: 1, pedagogical_mode: 'case_study', case: c }) as unknown as PublishedLesson;
const doc = { id: 'd1', kind: 'memo', title: 'Storage update', source: 'Operations, 3 October', text: 'The dam is low.\n\nUse is rising.' } as const;
const status = (over: Partial<CaseStatus> = {}): CaseStatus => ({
  identity: { need: null, initials: 'AB' }, open_to: 0, done: [],
  parts: [], parts_total: 1, work: {}, objections: null, outcome: null, held_until: null, spread: null, not_used: [], transfer: null,
  ...over
});
const withCase = (over: Partial<CaseStatus> = {}) => status({ open_to: 2, done: ['brief'], parts: [{ id: 'p1', title: 'Part one', docs: [doc] }], work: { first_take: { option_id: 'a', why: 'gut' } }, ...over });
const client = (s: CaseStatus): CaseClient => ({
  status: vi.fn(async () => s), claim: vi.fn(async () => s), save: vi.fn(async () => s),
  nextPart: vi.fn(async () => s), advance: vi.fn(async () => s), lock: vi.fn(async () => s)
});
const flush = () => new Promise((r) => setTimeout(r, 0));
const mount = async (c: PublicCase, s: CaseStatus, blocks: unknown[] = []) => {
  const host = document.createElement('div');
  document.body.append(host);
  const cl = client(s);
  const player = mountCasePlayer(host, { lesson: lessonOf(c, blocks), classId: 'c1', client: cl, renderHero: () => {} });
  await flush();
  return { host, cl, player };
};
const click = (host: HTMLElement, text: string) => {
  const b = [...host.querySelectorAll('button')].find((x) => x.textContent?.startsWith(text));
  expect(b, `button "${text}"`).toBeTruthy();
  b!.click();
};

describe('case study player', () => {
  it('asks for initials first', async () => {
    const { host, player } = await mount(publicCase(), status({ identity: { need: 'initials', initials: null } }));
    expect(host.querySelector('input[aria-label="Your initials"]')).not.toBeNull();
    player.dispose();
  });

  it('shows the Brief section\'s blocks above the first take and keeps them off Decide', async () => {
    const text = (id: string, body: string) => ({ id, type: 'block', block_type: 'rich_text', variant: 'medium', content: { html: `<p>${body}</p>` } });
    const blocks = [
      { id: 'brief', block_type: 'section', content: { title: 'Brief', blocks: [text('t1', 'Listen to the viva first.')], case_brief: true } },
      text('t2', 'Decide-stage reading.')
    ];
    const brief = await mount(publicCase(), status({ open_to: 0 }), blocks);
    const panel = brief.host.querySelector('.cs__panelhost')!;
    expect(panel.textContent).toContain('Listen to the viva first.');
    expect(panel.textContent).not.toContain('Decide-stage reading.');
    expect(panel.textContent!.indexOf('Listen to the viva')).toBeLessThan(panel.textContent!.indexOf('The dam is at 31%'));
    brief.player.dispose();
    const decide = await mount(publicCase(), withCase(), blocks);
    expect(decide.host.querySelector('.cs__panelhost')!.textContent).toContain('Decide-stage reading.');
    expect(decide.host.querySelector('.cs__panelhost')!.textContent).not.toContain('Listen to the viva first.');
    decide.player.dispose();
  });

  it('shows the open part\'s blocks in the work panel and keeps them off Decide', async () => {
    const text = (id: string, body: string) => ({ id, type: 'block', block_type: 'rich_text', variant: 'medium', content: { html: `<p>${body}</p>` } });
    const blocks = [
      { id: 'sp1', block_type: 'section', content: { title: 'Part 1', blocks: [text('t1', 'Hinge: what is that line doing?')], case_part: 'p1' } },
      { id: 'sp2', block_type: 'section', content: { title: 'Part 2', blocks: [text('t3', 'Later part task.')], case_part: 'p2' } },
      text('t2', 'Decide-stage reading.')
    ];
    const work = await mount(publicCase(), withCase({ open_to: 1 }), blocks);
    const panel = work.host.querySelector('.cs__panelhost')!;
    expect(panel.textContent).toContain('Hinge: what is that line doing?');
    expect(panel.textContent).not.toContain('Later part task.');
    expect(panel.textContent).not.toContain('Decide-stage reading.');
    work.player.dispose();
    const decide = await mount(publicCase(), withCase(), blocks);
    expect(decide.host.querySelector('.cs__panelhost')!.textContent).toContain('Decide-stage reading.');
    expect(decide.host.querySelector('.cs__panelhost')!.textContent).not.toContain('Hinge:');
    decide.player.dispose();
  });

  it('draws five stations with done, now and later states', async () => {
    const { host, player } = await mount(publicCase(), withCase({ open_to: 1 }));
    const states = [...host.querySelectorAll<HTMLElement>('.srail__stn')].map((b) => b.dataset.state);
    expect(states).toEqual(['in', 'now', 'later', 'later', 'later']);
    expect(host.querySelector('.srail__stn[data-state="now"]')?.getAttribute('aria-current')).toBe('step');
    expect(host.querySelector<HTMLButtonElement>('.srail__stn[data-state="later"]')?.disabled).toBe(true);
    player.dispose();
  });

  it('holds the outcome back until the server sends it, then shows it first with its source', async () => {
    const hidden = await mount(publicCase(), withCase({ open_to: 3, work: { first_take: { option_id: 'a', why: 'g' }, decision: { option_id: 'a', because: 'b', confidence: 60, locked_at: '2026-10-27T05:41:00Z' } } }));
    expect(hidden.host.querySelector('.cs-doc--outcome')).toBeNull();
    expect(hidden.host.textContent).toContain('Your teacher shows the outcome');
    hidden.player.dispose();
    const shown = await mount(publicCase(), withCase({ open_to: 3, outcome: { text: 'The Authority waited.', source: 'Authority review' }, work: { first_take: { option_id: 'a', why: 'g' }, decision: { option_id: 'b', because: 'b', confidence: 60, locked_at: '2026-10-27T05:41:00Z' } } }));
    expect(shown.host.querySelector('.cs-doc--outcome')?.textContent).toContain('Source: Authority review');
    expect(shown.host.querySelector('.cs-compare__changed')).not.toBeNull();
    shown.player.dispose();
  });

  it('shows the locked decision with no controls once locked', async () => {
    const { host, player } = await mount(publicCase(), withCase({ done: ['brief', 'decide'], work: { first_take: { option_id: 'a', why: 'g' }, decision: { option_id: 'a', because: 'it is cheap', confidence: 70, locked_at: '2026-10-27T05:41:00Z' } } }));
    expect(host.querySelector('.cs-decision')?.textContent).toContain('Locked at');
    expect(host.querySelector('.cs-opt')).toBeNull();
    expect(host.querySelector('textarea')).toBeNull();
    expect(host.querySelector('.cs-para__cite')).toBeNull();
    player.dispose();
  });

  it('sends the decision through lock', async () => {
    const { host, cl, player } = await mount(publicCase(), withCase());
    host.querySelector<HTMLButtonElement>('.cs-opt')!.click();
    const because = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Because…"]')!;
    because.value = 'Water is low';
    because.dispatchEvent(new Event('input'));
    click(host, 'Lock in my decision');
    expect(cl.lock).toHaveBeenCalledWith({ option_id: 'a', because: 'Water is low', confidence: 60 });
    player.dispose();
  });

  it('shows Next in own pace and a waiting note in teacher pace', async () => {
    const own = await mount(publicCase(), withCase({ open_to: 0, done: ['brief'], parts: [] }));
    click(own.host, 'Next: The case');
    expect(own.cl.advance).toHaveBeenCalled();
    own.player.dispose();
    const teacher = await mount(publicCase({ pace: 'teacher' }), withCase({ open_to: 0, done: ['brief'], parts: [] }));
    expect(teacher.host.textContent).toContain('Your teacher moves the class on to The case');
    expect([...teacher.host.querySelectorAll('button')].some((b) => b.textContent?.startsWith('Next:'))).toBe(false);
    teacher.player.dispose();
  });

  it('adds evidence through the client from a paragraph and removes a chip', async () => {
    const withEv = withCase({ work: { first_take: { option_id: 'a', why: 'g' }, evidence: [{ id: 'e1', doc_id: 'd1', quote: 'The dam is low.' }] } });
    const { host, cl, player } = await mount(publicCase(), withEv);
    host.querySelector<HTMLButtonElement>('.cs-para__cite')!.click();
    expect(cl.save).toHaveBeenCalledWith({ kind: 'evidence', doc_id: 'd1', quote: 'The dam is low.' });
    expect(host.querySelector('.cs-ev')?.textContent).toContain('The dam is low.');
    expect(host.querySelector('.cs-doc__cited')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('.cs-ev button')!.click();
    expect(cl.save).toHaveBeenCalledWith({ kind: 'evidence_remove', id: 'e1' });
    player.dispose();
  });

  it('posts the objection and the reflection', async () => {
    const locked = { first_take: { option_id: 'a', why: 'g' }, decision: { option_id: 'a', because: 'b', confidence: 60, locked_at: '2026-10-27T05:41:00Z' } };
    const objection = await mount(publicCase(), withCase({ done: ['brief', 'decide'], objections: ['Why should households go first?'], work: locked }));
    const answer = objection.host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your answer to the objection"]')!;
    answer.value = 'Because it is fair';
    answer.dispatchEvent(new Event('input'));
    click(objection.host, 'Send');
    expect(objection.cl.save).toHaveBeenCalledWith({ kind: 'objection', index: 0, answer: 'Because it is fair' });
    objection.player.dispose();
    const out = await mount(publicCase(), withCase({ open_to: 3, outcome: { text: 'It dried.', source: 'Review' }, work: locked }));
    const reflection = out.host.querySelector<HTMLTextAreaElement>('textarea[aria-label^="What the case told you"]')!;
    reflection.value = 'The memo showed it';
    reflection.dispatchEvent(new Event('input'));
    click(out.host, 'Save reflection');
    expect(out.cl.save).toHaveBeenCalledWith({ kind: 'reflection', text: 'The memo showed it' });
    out.player.dispose();
  });

  it('says so when the first load fails instead of leaving "Loading…" up', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const cl = client(status());
    cl.status = vi.fn(async () => { throw new Error('404'); });
    const player = mountCasePlayer(host, { lesson: lessonOf(publicCase()), classId: 'c1', client: cl, renderHero: () => {} });
    await flush();
    expect(host.textContent).toContain('couldn’t be loaded');
    expect(host.textContent).not.toContain('Loading…');
    player.dispose();
  });
});
