// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { CurriculumLinesV2Content, NetworkLine } from '@/schemas/block';
import { buildCoverageMap, type MapLesson } from '@/network/coverage-map/model';
import { mountProgressMap } from '@/network/coverage-map/progress';

/* Invented names only: this repository is public. */
const LINES: NetworkLine[] = [
  { id: 'und', mode: 'train', name: 'Understanding', short: 'UND', colour: 'wave' },
  { id: 'rep', mode: 'metro', name: 'Representation', short: 'REP', colour: 'lilac', meaning: 'How a text shows people, places and ideas.' },
  { id: 'read', mode: 'light_rail', name: 'Reading', short: 'READ', colour: 'amber' }
];
const LESSONS: MapLesson[] = [
  { id: 'a', title: 'Harbour poems', line_stops: [{ line_id: 'und' }, { line_id: 'rep' }] },
  { id: 'b', title: 'Salt and stone', line_stops: [{ line_id: 'rep' }, { line_id: 'read' }] },
  { id: 'c', title: 'Lighthouse talk', line_stops: [{ line_id: 'rep' }] }
];
const content: CurriculumLinesV2Content = { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Essay' } };

const mount = (lineStatus?: (id: string) => string | null) => {
  const host = document.createElement('div');
  document.body.append(host);
  mountProgressMap(host, {
    map: buildCoverageMap({ content, lines: LINES, lessons: LESSONS }),
    classId: 'cls1',
    label: 'Your unit map',
    done: new Set(['a']),
    faded: new Set(),
    next: 'b',
    ...(lineStatus ? { lineStatus } : {})
  });
  return host;
};
const tag = (host: HTMLElement, name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}: what this means"]`)!;
const card = (host: HTMLElement) => host.querySelector<HTMLElement>('.cm-card');

afterEach(() => document.body.replaceChildren());

describe('Student unit map: line tags', () => {
  it('makes every column tag a button', () => {
    const host = mount();
    const tags = [...host.querySelectorAll<HTMLButtonElement>('button.cm-tagbtn')];
    expect(tags.map((b) => b.getAttribute('aria-label'))).toEqual(['Understanding: what this means', 'Representation: what this means', 'Reading: what this means']);
    expect(tags.every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
  });

  it('opens one card saying what the line means, its lessons and the next one to do', () => {
    const host = mount((id) => (id === 'rep' ? 'Now: Secure' : null));
    tag(host, 'Representation').click();
    const box = card(host)!;
    expect(tag(host, 'Representation').getAttribute('aria-expanded')).toBe('true');
    expect(box.querySelector('.cm-card__kind')?.textContent).toBe('Concept line');
    expect(box.querySelector('.cm-card__title')?.textContent).toBe('REP · Representation');
    expect(box.querySelector('.cm-card__meaning')?.textContent).toBe('How a text shows people, places and ideas.');
    expect(box.querySelector('.cm-card__count')?.textContent).toBe('3 lessons in this unit · 1 done');
    expect(box.querySelector('.cm-card__status')?.textContent).toBe('Now: Secure');
    const next = box.querySelector<HTMLAnchorElement>('.cm-card__next')!;
    expect(next.textContent).toBe('Next lesson on this line: Salt and stone →');
    expect(next.href).toMatch(/\/s\/classes\/cls1\/lessons\/b$/);

    // Another tag swaps the card: only one is ever open.
    tag(host, 'Understanding').click();
    expect(host.querySelectorAll('.cm-card')).toHaveLength(1);
    expect(card(host)!.querySelector('.cm-card__kind')?.textContent).toBe('Syllabus line');
    expect(card(host)!.querySelector('.cm-card__meaning')?.textContent).toBe('Your teacher hasn’t added a description for this line yet.');
    // Every lesson on it is done: no next lesson link, and no status line.
    expect(card(host)!.querySelector('.cm-card__next')).toBeNull();
    expect(card(host)!.querySelector('.cm-card__status')).toBeNull();
  });

  it('closes on the same tag, the close button, Escape and a click outside', () => {
    const host = mount();
    const rep = tag(host, 'Representation');
    rep.click();
    rep.click();
    expect(card(host)).toBeNull();
    expect(rep.getAttribute('aria-expanded')).toBe('false');

    rep.click();
    card(host)!.querySelector<HTMLButtonElement>('.cm-card__close')!.click();
    expect(card(host)).toBeNull();

    rep.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(card(host)).toBeNull();

    rep.click();
    card(host)!.click();
    expect(card(host)).not.toBeNull();
    document.body.click();
    expect(card(host)).toBeNull();
  });
});
