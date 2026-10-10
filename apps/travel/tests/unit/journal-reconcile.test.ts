import { describe, expect, it } from 'vitest';
import { renderJournal } from '@/journal/render-journal';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';

describe('journal reconcile on refresh', () => {
  it('updates story without replacing the journal root', () => {
    const root = document.createElement('div');
    const handle = renderJournal(root, { fixture: klIstanbulFixture(), journalVersion: 'v1' });
    const journalRoot = root.querySelector('.journal');
    expect(journalRoot).toBeTruthy();

    const next = klIstanbulFixture();
    next.legs[0]!.destination = 'Reconciled leg label';
    handle.reconcile({
      journal: {
        ...next,
        leg_ids: next.legs.map((l) => l.id),
        preferences: {},
        operations: [],
      },
      version: 'v2',
    });

    expect(root.querySelector('.journal')).toBe(journalRoot);
    expect(root.textContent).toContain('Reconciled leg label');
    handle.destroy();
  });

});
