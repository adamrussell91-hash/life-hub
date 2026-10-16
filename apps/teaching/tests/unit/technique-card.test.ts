import { describe, expect, it, vi } from 'vitest';
import { linksOfTechnique, loadLiteraryElements } from '@/blocks/literary-elements';
import { buildQuizQuestion, renderElementCard } from '@/blocks/technique-card';

describe('interactive technique card', () => {
  it('the snapshot carries the widget connections, word origins and lineage', async () => {
    const table = await loadLiteraryElements();
    expect(table.connections?.length).toBeGreaterThan(50);
    expect(table.axes?.map((a) => a.key)).toEqual(['gradient', 'subtype', 'mirror', 'cross', 'effect']);
    const metaphor = table.techniques.find((t) => t.id === 'metaphor')!;
    expect(metaphor.lang).toBe('Greek');
    expect(metaphor.lineage?.[0]).toEqual({ word: 'phérein', lang: 'Greek', meaning: 'to carry, bear' });
    expect(metaphor.etymology).toMatch(/metaphorá/);
  });

  it('shows word origin and mapped connections, and opens a connected card with a way back', async () => {
    const table = await loadLiteraryElements();
    const metaphor = table.techniques.find((t) => t.id === 'metaphor')!;
    const card = renderElementCard(metaphor, table);
    const headings = [...card.querySelectorAll('h4')].map((h) => h.textContent);
    expect(headings).toEqual(expect.arrayContaining(['Definition', 'Word origin', 'Connections']));
    expect(card.querySelectorAll('.block-annotation__element-lineage-step').length).toBe(5);
    expect(card.querySelector('.block-annotation__element-chip--lang')?.textContent).toBe('Greek origin');

    const links = linksOfTechnique(table, metaphor);
    expect(links.length).toBeGreaterThan(0);
    const first = card.querySelector<HTMLButtonElement>(
      '.block-annotation__element-rel, .block-annotation__element-relchip'
    )!;
    first.click();
    expect(card.dataset.techniqueId).toBe(links[0]!.technique.id);
    const back = card.querySelector<HTMLButtonElement>('.block-annotation__element-back')!;
    expect(back.textContent).toBe('← Back to Metaphor');
    back.click();
    expect(card.dataset.techniqueId).toBe('metaphor');
    expect(card.querySelector('.block-annotation__element-back')).toBeNull();
  });

  it('lists the other places this technique appears in the poem and opens them', async () => {
    const table = await loadLiteraryElements();
    const syn = table.techniques.find((t) => t.id === 'synaesthesia') ?? table.techniques[0]!;
    const onOpenNote = vi.fn();
    const card = renderElementCard(syn, table, {
      poemSpots: [
        { annotationId: 'ann_2', quote: 'the chill speaks volumes', techniqueId: syn.id },
        { annotationId: 'ann_3', quote: 'spectres', techniqueId: 'metaphor' }
      ],
      onOpenNote
    });
    const spots = [...card.querySelectorAll<HTMLButtonElement>('.block-annotation__element-spot')];
    expect(spots[0]!.textContent).toContain('the chill speaks volumes');
    spots[0]!.click();
    expect(onOpenNote).toHaveBeenCalledWith('ann_2');
  });

  it('check yourself: four distinct options, scored, then a next question', async () => {
    const table = await loadLiteraryElements();
    const metaphor = table.techniques.find((t) => t.id === 'metaphor')!;
    const question = buildQuizQuestion(table, metaphor);
    expect(question.options).toHaveLength(4);
    expect(new Set(question.options.map((o) => o.id)).size).toBe(4);
    expect(question.options.some((o) => o.id === 'metaphor')).toBe(true);

    const card = renderElementCard(metaphor, table);
    expect(card.querySelector('.block-annotation__element-quiz-def')?.textContent).toBe(metaphor.definition);
    const right = [...card.querySelectorAll<HTMLButtonElement>('.block-annotation__element-quiz-opt')].find(
      (b) => b.textContent === 'Metaphor'
    )!;
    right.click();
    expect(right.classList.contains('is-right')).toBe(true);
    expect(card.querySelector('.block-annotation__element-quiz-score')?.textContent).toBe('1 of 1');
    const next = card.querySelector<HTMLButtonElement>('.block-annotation__element-quiz-next')!;
    expect(next.hidden).toBe(false);
    next.click();
    expect(card.querySelector('.block-annotation__element-quiz-score')?.textContent).toBe('1 of 1');
  });

  it('try it keeps the student line on the device', async () => {
    const table = await loadLiteraryElements();
    const metaphor = table.techniques.find((t) => t.id === 'metaphor')!;
    localStorage.removeItem('lh-technique-try:metaphor');
    const card = renderElementCard(metaphor, table);
    [...card.querySelectorAll<HTMLButtonElement>('.block-annotation__element-tab')][1]!.click();
    const area = card.querySelector<HTMLTextAreaElement>('.block-annotation__element-try-input')!;
    area.value = 'Grief is a locked room';
    area.dispatchEvent(new Event('input'));
    const again = renderElementCard(metaphor, table);
    [...again.querySelectorAll<HTMLButtonElement>('.block-annotation__element-tab')][1]!.click();
    expect(again.querySelector<HTMLTextAreaElement>('.block-annotation__element-try-input')!.value).toBe(
      'Grief is a locked room'
    );
  });

  it('the teacher preview is compact: facts and connections, no practice', async () => {
    const table = await loadLiteraryElements();
    const card = renderElementCard(table.techniques[0]!, table, { compact: true });
    expect(card.querySelector('.block-annotation__element-practice')).toBeNull();
  });
});
