import { describe, expect, it, vi } from 'vitest';
import { renderPassportMap } from '@/components/passport-map';

describe('renderPassportMap', () => {
  it('notifies onSelect when a visited country path is clicked', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onSelect = vi.fn();
    renderPassportMap(host, {
      visited: new Set(['Portugal']),
      onSelect
    });
    const path = host.querySelector(
      'path.passport-country.is-visited[data-country="Portugal"]'
    ) as SVGPathElement | null;
    expect(path).toBeTruthy();
    path!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('Portugal');
  });
});
