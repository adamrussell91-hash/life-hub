import { describe, expect, it } from 'vitest';
import { CurriculumOutcomeSchema } from '@/schemas/outcome';
import { attachedOutcomeIds, uniqueOutcomeIds } from '@/curriculum/outcome-ids';
import { nesaEnglishAdvancedOutcomes } from '@/curriculum/nesa-english-advanced';
import { catalogForSubject, filterOutcomeCatalog } from '@/curriculum/outcome-catalog';
import { mountPublicOutcomeChips } from '@/outcomes/strip';

describe('curriculum outcomes', () => {
  it('parses a NESA outcome record', () => {
    const [first] = nesaEnglishAdvancedOutcomes('2026-01-01T00:00:00.000Z');
    const parsed = CurriculumOutcomeSchema.parse(first);
    expect(parsed.id).toBe('EA12-1');
    expect(parsed.source).toBe('nesa');
    expect(parsed.subject_id).toBe('subject_y12_engadv');
  });

  it('prefers outcome_ids over legacy syllabus_outcomes', () => {
    expect(
      attachedOutcomeIds({
        outcome_ids: ['EA12-6'],
        syllabus_outcomes: ['EA12-1']
      })
    ).toEqual(['EA12-6']);
  });

  it('falls back to syllabus_outcomes when outcome_ids is empty', () => {
    expect(attachedOutcomeIds({ syllabus_outcomes: ['EA12-8'] })).toEqual(['EA12-8']);
  });

  it('dedupes ids while preserving order', () => {
    expect(uniqueOutcomeIds(['EA12-1', 'EA12-1', 'EA12-6', ''])).toEqual(['EA12-1', 'EA12-6']);
  });

  it('orders a subject catalog from subject.outcome_ids', () => {
    const catalog = nesaEnglishAdvancedOutcomes('2026-01-01T00:00:00.000Z');
    const ordered = catalogForSubject(
      { id: 'subject_y12_engadv', outcome_ids: ['EA12-6', 'EA12-1'] },
      catalog
    );
    expect(ordered.map((row) => row.id).slice(0, 2)).toEqual(['EA12-6', 'EA12-1']);
    expect(ordered).toHaveLength(catalog.length);
  });

  it('filters the picker by code, group, and wording', () => {
    const catalog = nesaEnglishAdvancedOutcomes('2026-01-01T00:00:00.000Z');
    const hits = filterOutcomeCatalog(catalog, 'EA12-6');
    expect(hits.map((row) => row.id)).toEqual(['EA12-6']);
    expect(filterOutcomeCatalog(catalog, 'module b').map((row) => row.id)).toEqual([
      'EA12-6',
      'EA12-7'
    ]);
  });

  it('toggles official wording when a chip is clicked', () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountPublicOutcomeChips(host, [
      {
        id: 'EA12-6',
        code: 'EA12-6',
        title: 'Critical study',
        description: 'Investigates relationships between texts.'
      }
    ]);
    const chip = host.querySelector('.outcome-chip');
    expect(chip).toBeTruthy();
    (chip as HTMLButtonElement).click();
    expect(host.querySelector('.outcome-strip__expand')?.textContent).toContain(
      'Investigates relationships between texts.'
    );
    (chip as HTMLButtonElement).click();
    expect(host.querySelector('.outcome-strip__expand')).toBeNull();
    host.remove();
  });
});
