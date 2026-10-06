import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Trip } from '@/types';

vi.mock('@/api/travel', () => ({
  addItem: vi.fn(),
  editItem: vi.fn(),
  getTrip: vi.fn(),
  parseEmail: vi.fn(),
  removeItem: vi.fn(),
  searchPlaces: vi.fn()
}));

import { renderAddForm } from '@/components/add-form';

const trip = fixtureTrip as unknown as Trip;
const css = readFileSync(resolve(__dirname, '../../src/styles/travel.css'), 'utf8');

describe('add form docked actions (R4)', () => {
  it('keeps Add/Cancel outside the scroll region so they stay tappable', () => {
    const host = document.createElement('div');
    renderAddForm(host, {
      trip,
      tripId: trip.id,
      version: 'sha-v1',
      onSaved: vi.fn(),
      onClose: vi.fn()
    });

    const form = host.querySelector('form.addform__form');
    const scroll = host.querySelector('.addform__scroll');
    const actions = host.querySelector('[data-part="form-actions"]');
    expect(form).toBeTruthy();
    expect(scroll).toBeTruthy();
    expect(actions).toBeTruthy();
    expect(actions?.classList.contains('addform__actions')).toBe(true);
    expect(scroll?.contains(actions!)).toBe(false);
    expect(form?.contains(actions!)).toBe(true);
    expect(form?.lastElementChild).toBe(actions);

    const labels = [...actions!.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toEqual(['Add', 'Cancel']);
    expect(scroll?.querySelector('.fgrid')).toBeTruthy();
  });

  it('docks the action row with safe-area padding and 44px-tall buttons', () => {
    expect(css).toMatch(/\.sheet\.addform\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.addform__actions\s*\{[^}]*safe-area-inset-bottom/);
    expect(css).toMatch(/\.addform__actions \.btn[\s\S]*?min-height:\s*2\.75rem/);
    expect(css).toMatch(/@media \(max-width: 719px\)[\s\S]*?\.addform__actions \.btn[\s\S]*?min-height:\s*3rem/);
  });
});
