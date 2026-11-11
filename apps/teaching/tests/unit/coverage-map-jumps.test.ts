// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { CurriculumLinesV2Content } from '@/schemas/block';
import { buildCoverageMap, type MapLesson } from '@/network/coverage-map/model';
import { mountCoverageMap } from '@/network/coverage-map/mount';

/* Invented names only: this repository is public. */
const content: CurriculumLinesV2Content = { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Essay' } };
const lessons: MapLesson[] = [
  { id: 'a', title: 'Opening' }, { id: 'rot', title: 'Rotation', href: '/l/rot', after: ['viva'] },
  { id: 'b', title: 'Poem two' }, { id: 'c', title: 'Poem three' }, { id: 'viva', title: 'Viva' }
];
const dates = new Map([['a', '2026-10-05'], ['rot', '2026-10-12'], ['b', '2026-10-19'], ['c', '2026-10-26'], ['viva', '2026-11-02']]);

describe('Coverage map: a "next" link that jumps past dated lessons', () => {
  it('says which link the map set aside, linking to the lesson', () => {
    const host = document.createElement('div');
    mountCoverageMap(host, { map: buildCoverageMap({ content, lines: [], lessons, dates }), label: 'Unit map' });
    const note = host.querySelector<HTMLElement>('.cm__jump')!;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('Rotation leads straight on to Viva, skipping Poem two and Poem three. The map follows the dates instead. Open the lesson and set its next lesson back to the unit order to clear this.');
    expect(note.querySelector('a')?.getAttribute('href')).toBe('/l/rot');
  });

  it('stays hidden when the links follow the dates', () => {
    const host = document.createElement('div');
    const plain = lessons.map(({ after: _a, ...l }) => l);
    mountCoverageMap(host, { map: buildCoverageMap({ content, lines: [], lessons: plain, dates }), label: 'Unit map' });
    expect(host.querySelector<HTMLElement>('.cm__jump')!.hidden).toBe(true);
  });
});
