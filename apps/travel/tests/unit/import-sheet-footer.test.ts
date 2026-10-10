import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';
import { openImportSheet } from '@/journal/import-sheet';

const css = readFileSync(resolve(__dirname, '../../src/styles/travel.css'), 'utf8');

describe('import sheet docked actions (R4)', () => {
  it('keeps Upload/Cancel outside the scroll region so they stay tappable', () => {
    const anchor = document.createElement('div');
    const handle = openImportSheet({ fixture: klIstanbulFixture(), anchor });

    const form = anchor.querySelector('form.addform__form');
    const scroll = anchor.querySelector('.addform__scroll');
    const actions = anchor.querySelector('.addform__actions');
    expect(form).toBeTruthy();
    expect(scroll).toBeTruthy();
    expect(actions).toBeTruthy();
    expect(scroll?.contains(actions!)).toBe(false);
    expect(form?.contains(actions!)).toBe(true);
    expect(form?.lastElementChild).toBe(actions);

    const labels = [...actions!.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toEqual(['Cancel', 'Upload']);

    handle.destroy();
  });

  it('docks the action row with safe-area padding and 44px-tall buttons', () => {
    expect(css).toMatch(/\.sheet\.addform\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.addform__actions\s*\{[^}]*safe-area-inset-bottom/);
    expect(css).toMatch(/\.addform__actions \.btn[\s\S]*?min-height:\s*2\.75rem/);
    expect(css).toMatch(/@media \(max-width: 719px\)[\s\S]*?\.addform__actions \.btn[\s\S]*?min-height:\s*3rem/);
  });
});
