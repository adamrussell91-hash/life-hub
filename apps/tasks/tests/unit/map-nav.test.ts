import { describe, expect, it } from 'vitest';
import { setMapFullscreenChrome } from '@/views/maps';
import { createFilteredPicker, createMapIndex, type MapIndexItem } from '@/views/map-nav';
import { createVizNodeList } from '@/views/viz-node-list';

describe('map fullscreen chrome', () => {
  it('toggles the immersive html class', () => {
    setMapFullscreenChrome(true);
    expect(document.documentElement.classList.contains('is-map-fullscreen')).toBe(true);
    setMapFullscreenChrome(false);
    expect(document.documentElement.classList.contains('is-map-fullscreen')).toBe(false);
  });
});

describe('map navigation helpers', () => {
  it('filters map index items by label', () => {
    const items: MapIndexItem[] = [
      { id: 'st1', kind: 'station', label: 'Young Diplomats', group: 'J · Justice', y: 200 },
      { id: 'tk1', kind: 'event', label: 'Rotary MUNA', group: 'J · competitions', y: 320 }
    ];
    const index = createMapIndex(items, null, () => {});
    expect(index.classList.contains('is-open')).toBe(false);
    index.querySelector<HTMLButtonElement>('[data-map-index-toggle]')!.click();
    expect(index.classList.contains('is-open')).toBe(true);
    const input = index.querySelector<HTMLInputElement>('.hub-search__input')!;
    expect(index.querySelector('.hub-search')).not.toBeNull();
    input.value = 'mun';
    input.dispatchEvent(new Event('input'));
    expect(index.querySelectorAll('.map-index__item').length).toBe(1);
    expect(index.querySelector('.map-index__item')?.textContent).toBe('Rotary MUNA');
  });

  it('returns the selected value from filtered picker', () => {
    const picker = createFilteredPicker(
      [
        { label: 'Lines', options: [{ value: 'line:a', label: 'J · Justice' }] },
        { label: 'Stations', options: [{ value: 'station:s1', label: 'Program A' }] }
      ],
      'station:s1',
      { ariaLabel: 'Attach to' }
    );
    expect(picker.getValue()).toBe('station:s1');
    const input = picker.root.querySelector<HTMLInputElement>('.hub-search__input')!;
    input.value = 'justice';
    input.dispatchEvent(new Event('input'));
    picker.root.querySelector<HTMLButtonElement>('.map-picker__opt')?.click();
    expect(picker.getValue()).toBe('line:a');
  });
});

describe('viz node list', () => {
  it('collapses by default when many nodes are passed', () => {
    const nodes = Array.from({ length: 15 }, (_, i) => ({
      id: `n${i}`,
      kind: 'task',
      label: `Task ${i}`
    }));
    const list = createVizNodeList('Nodes', nodes, () => {}, { collapsed: true });
    expect(list.querySelector<HTMLElement>('.viz-alt-panel__body')?.hidden).toBe(true);
  });

  it('filters nodes from search input', () => {
    const list = createVizNodeList(
      'Nodes',
      [
        { id: 'a', kind: 'task', label: 'MindWorks brief' },
        { id: 'b', kind: 'task', label: 'Ethics heat' }
      ],
      () => {}
    );
    const input = list.querySelector<HTMLInputElement>('.hub-search__input')!;
    input.value = 'ethics';
    input.dispatchEvent(new Event('input'));
    expect(list.querySelectorAll('.viz-alt .btn').length).toBe(1);
    expect(list.querySelector('.viz-alt .btn')?.textContent).toContain('Ethics heat');
  });
});
