import { afterEach, describe, expect, it, vi } from 'vitest';
import { findings, levelBars, reading, readingX } from '@/lab/charts';
import { levelGroups } from '@/lab/model';
import { LAB_DEFAULT_FEATURES } from '@/lab/schema';
import { findingRows } from '@/lab/steps-pairs';

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe('reading: every rating is a dot', () => {
  it('draws one dot per rating, stacked where they bunch, and a line at the average', () => {
    const values = [3, 5, 5, 5, 6, 8];
    const box = reading({ values, name: 'Your version' });
    const dots = [...box.querySelectorAll('circle')];
    expect(dots.length).toBe(6);
    expect(box.querySelector('p')?.textContent).toBe('Your version average 5.3, 6 readers');
    // The three fives sit at the same place across, one above the other.
    const fives = dots.filter((d) => d.getAttribute('cx') === String(readingX(5)));
    expect(fives.length).toBe(3);
    expect(new Set(fives.map((d) => d.getAttribute('cy'))).size).toBe(3);
    const cys = fives.map((d) => Number(d.getAttribute('cy')));
    expect(cys[0]! - cys[1]!).toBe(9);
    // The average line sits at 5.3 on the 0 to 10 line.
    const mean = box.querySelector('.lab-reading__mean')!;
    expect(mean.getAttribute('x1')).toBe(String(readingX(5.3)));
    expect(readingX(0)).toBe(14);
    expect(readingX(10)).toBe(286);
    expect(Number(mean.getAttribute('x1'))).toBeGreaterThan(readingX(5));
    expect(Number(mean.getAttribute('x1'))).toBeLessThan(readingX(6));
    expect(box.querySelector('svg')?.getAttribute('aria-label')).toBe('Your version: average 5.3 from 6 readers');
    expect([...box.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['0', '5', '10']);
  });

  it('drops the dots in one at a time, and leaves them still under reduced motion', () => {
    const moving = reading({ values: [4, 6, 7], name: 'Control', control: true });
    expect(moving.classList.contains('is-control')).toBe(true);
    expect([...moving.querySelectorAll('circle')].map((d) => (d as SVGElement).style.animationDelay)).toEqual(['0ms', '45ms', '90ms']);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const still = reading({ values: [4, 6, 7], name: 'Control', control: true });
    expect([...still.querySelectorAll('circle')].map((d) => (d as SVGElement).style.animationDelay)).toEqual(['', '', '']);
  });

  it('says so when a version has no readers', () => {
    const box = reading({ values: [], name: 'This version' });
    expect(box.querySelectorAll('circle').length).toBe(0);
    expect(box.querySelector('.lab-reading__mean')).toBeNull();
    expect(box.textContent).toContain('no readers yet');
  });
});

describe('findings: one row per trial against a centre line', () => {
  const trials = [
    { desc: ['changed "meant" to "wanted"'], shift: 0.3, n: 8, verdict: 0 as const, thin: false },
    { desc: ['cut "I think,"'], shift: -1.8, n: 8, verdict: -1 as const, thin: false, mine: true },
    { desc: ['broke line 2 after "the"'], shift: 1.2, n: 9, verdict: 1 as const, thin: false },
    { desc: ['joined lines 1 and 2'], shift: -2.4, n: 3, verdict: -1 as const, thin: true }
  ];

  it('sorts the rows from the biggest drop to the biggest rise, with bars left and right of the centre', () => {
    const chart = findings({ rows: findingRows(trials), ends: ['Rated lower', 'Rated higher'] });
    const rows = [...chart.querySelectorAll('.lab-find')] as HTMLElement[];
    expect(rows.map((r) => r.querySelector('.lab-find__value')?.textContent)).toEqual(['−2.4', '−1.8', '+0.3', '+1.2']);
    expect(rows.map((r) => r.dataset.row)).toEqual(['3', '1', '0', '2']);
    const fills = rows.map((r) => r.querySelector('.lab-find__track i') as HTMLElement);
    expect(fills.map((f) => (f.style.right ? 'left' : 'right'))).toEqual(['left', 'left', 'right', 'right']);
    // A shift of 3 points fills half the track.
    expect(fills.map((f) => Number(f.dataset.w))).toEqual([40, 30, 5, 20]);
    expect([...chart.querySelectorAll('.lab-finds__axis div span')].map((s) => s.textContent)).toEqual(['Rated lower', 'Rated higher']);
    expect(rows[1]!.classList.contains('is-mine')).toBe(true);
  });

  it('draws a row pale when its shift is under the threshold or it had under four readers, and says how many', () => {
    const chart = findings({ rows: findingRows(trials), ends: ['Rated lower', 'Rated higher'] });
    const rows = [...chart.querySelectorAll('.lab-find')] as HTMLElement[];
    expect(rows.map((r) => r.classList.contains('is-pale'))).toEqual([true, false, true, false]);
    expect(rows[0]!.querySelector('.lab-find__label')?.textContent).toBe('Joined lines 1 and 2 3 readers');
    expect(rows[1]!.querySelector('.lab-find__label')?.textContent).toBe('Cut "I think,"');
  });

  it('rows are buttons only when they can open, and say which one is open', () => {
    const still = findings({ rows: findingRows(trials), ends: ['Rated lower', 'Rated higher'] });
    expect(still.querySelector('button')).toBeNull();
    const onOpen = vi.fn();
    const chart = findings({ rows: findingRows(trials), ends: ['Rated lower', 'Rated higher'], open: 2, onOpen });
    const rows = [...chart.querySelectorAll('button.lab-find')] as HTMLButtonElement[];
    expect(rows.length).toBe(4);
    expect(rows.map((r) => r.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'false', 'true']);
    expect(rows[3]!.classList.contains('is-on')).toBe(true);
    rows[0]!.click();
    expect(onOpen).toHaveBeenCalledWith(3);
  });
});

describe('level bars: the trials regrouped by level of language', () => {
  it('draws one bar per level, biggest average shift first, with its trial count, and leaves a thin trial out', () => {
    // Two sentence-level trials, one form, and a word-level trial with three readers.
    const groups = levelGroups([
      { feature: 1, shift: -1.8, readers: 6 }, { feature: 2, shift: -2.4, readers: 5 }, { feature: 0, shift: 0.6, readers: 5 }, { feature: 5, shift: 2.7, readers: 3 }
    ], LAB_DEFAULT_FEATURES);
    const chart = levelBars(groups);
    const rows = [...chart.querySelectorAll('.lab-bar')] as HTMLElement[];
    expect(rows.map((r) => r.dataset.level)).toEqual(['Sentence', 'Form', 'Word']);
    expect(rows.map((r) => r.textContent)).toEqual(['Sentence 2 trials2.1', 'Form 1 trial0.6', 'Word 0 trials0.0']);
    expect(rows.map((r) => r.classList.contains('is-top'))).toEqual([true, false, false]);
    // A full bar stands for a shift of 3 points.
    expect(rows.map((r) => Number((r.querySelector('i') as HTMLElement).dataset.w))).toEqual([70, 20, 0]);
  });

  it('draws no leader before a named trial has moved readers', () => {
    const chart = levelBars(levelGroups([], LAB_DEFAULT_FEATURES));
    expect(chart.querySelectorAll('.lab-bar.is-top').length).toBe(0);
    expect(chart.querySelectorAll('.lab-bar').length).toBe(3);
  });
});
