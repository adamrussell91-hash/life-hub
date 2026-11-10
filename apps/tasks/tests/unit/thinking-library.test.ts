import { describe, expect, it } from 'vitest';
import { buildCards, cardElement, filterCards, renderLibraryView, tabCounts } from '../../src/views/thinking/library';
import { coverFor, hashId } from '../../src/views/thinking/library-covers';

describe('library cards', () => {
  const cards = buildCards();
  it('holds options, toolkit tools and snares, no tool-level entries', () => {
    expect(cards.some((c) => c.id === 'sn_confirmation' && c.family === 'snare' && c.tool === 'Snare')).toBe(true);
    expect(cards.some((c) => c.id === 'impact_effort' && c.family === 'action' && c.tool === 'Problem Solver')).toBe(true);
    expect(cards.some((c) => c.id === 'rb_second_order')).toBe(true);
    expect(cards.some((c) => c.id.startsWith('tool:'))).toBe(false);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    const counts = tabCounts(cards);
    expect(counts.all).toBe(counts.action + counts.insight + counts.frame + counts.snare);
    expect(counts.snare).toBeGreaterThanOrEqual(40);
  });
  it('filters by family and by title or when line', () => {
    expect(filterCards(cards, 'snare', '').every((c) => c.family === 'snare')).toBe(true);
    const hits = filterCards(cards, 'all', 'CONFIRMATION');
    expect(hits.map((c) => c.id)).toContain('sn_confirmation');
    expect(filterCards(cards, 'frame', 'confirmation').some((c) => c.family !== 'frame')).toBe(false);
    expect(filterCards(cards, 'all', 'zzzz-no-match')).toEqual([]);
  });
  it('links model cards to their tool and protocols to Knowledge', () => {
    expect(cards.find((c) => c.id === 'impact_effort')?.href).toBe('#/problem-solver');
    expect(cards.find((c) => c.id.startsWith('protocol:'))?.href).toBe('/knowledge/#protocols');
  });
});

describe('snare card', () => {
  it('expands in place and links its counters', () => {
    const card = buildCards().find((c) => c.id === 'sn_confirmation')!;
    const root = cardElement(card);
    const head = root.querySelector('button')!;
    const panel = root.querySelector<HTMLElement>('.tl-card__panel')!;
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    head.click();
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('Ask yourself');
    expect(panel.querySelectorAll('a').length).toBeGreaterThan(0);
  });
});

describe('covers', () => {
  it('uses tailored recipes for three ids and a stable family mark otherwise', () => {
    expect(coverFor('impact_effort', 'action').recipe).toBe('impact_effort');
    expect(coverFor('rb_second_order', 'insight').recipe).toBe('rb_second_order');
    expect(coverFor('sn_confirmation', 'snare').recipe).toBe('sn_confirmation');
    expect(coverFor('swot', 'action').recipe).toBe('action-mark');
    expect(coverFor('swot', 'action').svg).toBe(coverFor('swot', 'action').svg);
    expect(coverFor('swot', 'action').svg).not.toBe(coverFor('pareto', 'action').svg);
    expect(hashId('a')).toBe(hashId('a'));
    expect(coverFor('x', 'frame').svg).toContain('aria-hidden="true"');
  });
});

describe('page', () => {
  it('switches tabs, searches and sets the banner', () => {
    const canvas = document.createElement('div');
    renderLibraryView(canvas);
    const pressed = () => canvas.querySelector('.tl-tab[aria-pressed="true"]')?.getAttribute('data-tab');
    expect(pressed()).toBe('all');
    expect(canvas.querySelector<HTMLImageElement>('.tl-banner__img')?.src).toContain('welcome.jpg');
    canvas.querySelector<HTMLButtonElement>('.tl-tab[data-tab="snare"]')!.click();
    expect(pressed()).toBe('snare');
    expect(canvas.querySelector<HTMLImageElement>('.tl-banner__img')?.src).toContain('snares.jpg');
    expect(canvas.querySelector('.tl-banner__img')?.getAttribute('alt')).toBe('');
    expect(canvas.querySelectorAll('.tl-grid > .tl-card--snare').length).toBeGreaterThanOrEqual(40);
    const search = canvas.querySelector<HTMLInputElement>('.tl-search')!;
    search.value = 'sunk';
    search.dispatchEvent(new Event('input'));
    expect(canvas.querySelectorAll('.tl-grid > *').length).toBeGreaterThan(0);
    expect(canvas.querySelectorAll('.tl-grid > *').length).toBeLessThan(10);
    search.value = 'zzzz-no-match';
    search.dispatchEvent(new Event('input'));
    expect(canvas.querySelector<HTMLElement>('.tl-empty')!.hidden).toBe(false);
  });
});
