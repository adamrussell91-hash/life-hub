import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';
import { openEditMomentSheet } from '@/journal/edit-moment-sheet';

const journalCss = readFileSync(resolve(__dirname, '../../src/styles/journal.css'), 'utf8');

describe('edit moment sheet (R4)', () => {
  it('keeps Save/Cancel outside the scroll region', () => {
    const anchor = document.createElement('div');
    const fixture = klIstanbulFixture();
    const moment = fixture.moments[0]!;
    const handle = openEditMomentSheet({
      tripId: fixture.trip_id,
      journal: fixture as import('@/api/journal').JournalDocument,
      version: 'fixture',
      moment,
      anchor,
    });

    const form = anchor.querySelector('form.addform__form');
    const scroll = anchor.querySelector('.addform__scroll');
    const actions = anchor.querySelector('.addform__actions');
    expect(scroll?.contains(actions!)).toBe(false);
    expect(form?.lastElementChild).toBe(actions);

    const labels = [...actions!.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toEqual(['Cancel', 'Save']);

    handle.destroy();
  });

  it('uses keyboard inset class on edit sheet', () => {
    expect(journalCss).toMatch(/vv-keyboard-open[\s\S]*journal-edit-moment-sheet/);
  });
});
