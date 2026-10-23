import { describe, expect, it, vi } from 'vitest';
import { renderGuideCard } from '@/guides/guide-card';
import { motivationSdt as g } from '@/guides/motivation-sdt';
import type { GuideRun } from '@/guides/types';

const run: GuideRun = {
  id: 'g1', guide: 'motivation_sdt', person_ref: 'shared:person:p_jonah', person_name: 'Jonah Pereira', context: 'English · essays',
  taps: {}, quotes: ['I’d feel bad if Mum saw it wasn’t done.'], checks: {},
  values: { amotivation: 1, external: 3, introjected: 7, identified: 5, integrated: 2, intrinsic: 2 },
  profile: 'control', moves: g.profiles.find((p) => p.id === 'control')!.moves,
  created_at: '2026-10-27T01:00:00.000Z', updated_at: '2026-10-27T01:00:00.000Z'
};

describe('guide card', () => {
  it('shows the guide, context, profile, chart, moves, words and citation', () => {
    const card = renderGuideCard(document, { guide: g, run, history: [] });
    expect(card.querySelector('.guide-card__kicker')?.textContent).toBe('Motivation guide · 27 Oct');
    expect(card.querySelector('.guide-card__title')?.textContent).toBe('English · essays');
    expect(card.querySelector('.guide-card__pname')?.textContent).toBe('Leaning on control');
    expect(card.querySelectorAll('.guide-chart__bar').length).toBe(6);
    expect([...card.querySelectorAll('.guide-card__moves li')].map((li) => li.textContent)).toEqual(run.moves);
    expect(card.querySelector('.guide-card__words blockquote')?.textContent).toBe(run.quotes[0]);
    expect(card.querySelector('.guide-card__cite')?.textContent).toContain('Your read');
    expect(card.dataset.run).toBe('g1');
  });

  it('Edit and Change call back; no buttons without handlers', () => {
    const onEdit = vi.fn();
    const onProfile = vi.fn();
    const card = renderGuideCard(document, { guide: g, run, history: [], onEdit, onProfile });
    (card.querySelector('[data-part="guide-edit"]') as HTMLButtonElement).click();
    expect(onEdit).toHaveBeenCalled();
    const select = card.querySelector('select') as HTMLSelectElement;
    select.value = 'own';
    select.dispatchEvent(new Event('change'));
    expect(onProfile).toHaveBeenCalledWith('own');
    const bare = renderGuideCard(document, { guide: g, run, history: [] });
    expect(bare.querySelector('[data-part="guide-edit"]')).toBeNull();
    expect(bare.querySelector('select')).toBeNull();
  });
});
