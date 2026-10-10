import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';
import { openCaptureSheet } from '@/journal/capture-sheet';

const css = readFileSync(resolve(__dirname, '../../src/styles/travel.css'), 'utf8');
const journalCss = readFileSync(resolve(__dirname, '../../src/styles/journal.css'), 'utf8');

describe('capture sheet docked actions (R4)', () => {
  it('keeps Save/Cancel outside the scroll region', () => {
    const anchor = document.createElement('div');
    const fixture = klIstanbulFixture();
    const day = fixture.days.find((d) => d.empty_marker)!;
    const handle = openCaptureSheet({
      tripId: fixture.trip_id,
      legId: day.leg_id,
      localDate: day.local_date,
      journal: fixture as import('@/api/journal').JournalDocument,
      version: 'test',
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

  it('uses 48px mode buttons and docked action row styles', () => {
    expect(css).toMatch(/\.addform__actions \.btn[\s\S]*?min-height:\s*2\.75rem/);
    expect(journalCss).toMatch(/\.journal-capture__mode\s*\{[^}]*min-height:\s*3rem/);
    expect(journalCss).toMatch(/vv-keyboard-open[\s\S]*journal-capture-sheet/);
  });
});
