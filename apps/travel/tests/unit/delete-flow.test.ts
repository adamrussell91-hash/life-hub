import { describe, expect, it } from 'vitest';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';
import {
  applyRestore,
  applySoftDelete,
  deleteImpactSummary,
} from '@/journal/delete-flow';
import type { JournalDocument } from '@/api/journal';

function asDoc(): JournalDocument {
  const fixture = klIstanbulFixture();
  return {
    ...fixture,
    leg_ids: fixture.legs.map((l) => l.id),
    preferences: {},
    operations: [],
  };
}

describe('delete-flow', () => {
  it('soft-deletes a moment and hides it from impact until restored', () => {
    const journal = asDoc();
    const moment = journal.moments.find((m) => m.lifecycle === 'live');
    expect(moment).toBeTruthy();
    const next = applySoftDelete(journal, { kind: 'moment', id: moment!.id });
    const row = next.moments.find((m) => m.id === moment!.id);
    expect(row?.lifecycle).toBe('deleted');
    expect(deleteImpactSummary(next, { kind: 'moment', id: moment!.id }).moments).toBe(0);
    const restored = applyRestore(next, { kind: 'moment', id: moment!.id });
    expect(restored.moments.find((m) => m.id === moment!.id)?.lifecycle).toBe('live');
  });

  it('parent day restore does not revive independently deleted children', () => {
    const journal = asDoc();
    const day = journal.days.find((d) => d.lifecycle === 'live');
    expect(day).toBeTruthy();
    const onDay = journal.moments.filter(
      (m) =>
        m.lifecycle === 'live' && m.leg_id === day!.leg_id && m.local_date === day!.local_date,
    );
    expect(onDay.length).toBeGreaterThan(1);
    const independent = onDay[0]!;
    const cascadePeer = onDay[1]!;

    let draft = applySoftDelete(journal, { kind: 'moment', id: independent.id });
    draft = applySoftDelete(draft, { kind: 'day', id: day!.id });

    const deletedIndependent = draft.moments.find((m) => m.id === independent.id);
    const deletedCascade = draft.moments.find((m) => m.id === cascadePeer.id);
    expect(deletedIndependent?.lifecycle).toBe('deleted');
    expect(deletedIndependent?.deleted_with).toBeUndefined();
    expect(deletedCascade?.deleted_with).toBe(day!.id);

    const restored = applyRestore(draft, { kind: 'day', id: day!.id });
    expect(restored.moments.find((m) => m.id === cascadePeer.id)?.lifecycle).toBe('live');
    expect(restored.moments.find((m) => m.id === independent.id)?.lifecycle).toBe('deleted');
  });

  it('leg delete impact copy distinguishes itinerary', () => {
    const journal = asDoc();
    const leg = journal.legs.find((l) => l.lifecycle === 'live');
    const impact = deleteImpactSummary(journal, { kind: 'leg', id: leg!.id });
    expect(impact.legs).toBe(1);
    expect(impact.moments).toBeGreaterThan(0);
  });
});
