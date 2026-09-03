import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapLine } from '@/schemas/map';
import { closeCardMenu } from '@/views/card-menu';
import { createMapIndexSearch, createMapIndexShell, createMapToolbar } from '@/views/map-chrome';

function line(partial: Partial<MapLine> = {}): MapLine {
  return {
    id: 'line_justice',
    name: 'Justice',
    letter: 'J',
    color: 'blue',
    points: [
      { x: 80, y: 0 },
      { x: 80, y: 400 }
    ],
    extra_tracks: [],
    ...partial
  };
}

function openMenu(root: ParentNode, label: string): HTMLElement {
  root.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click();
  const menu = document.querySelector<HTMLElement>('.card-menu__panel');
  expect(menu).not.toBeNull();
  return menu!;
}

function menuLabels(menu: HTMLElement): string[] {
  return [...menu.querySelectorAll('.hub-menu__opt')].map((item) => item.textContent ?? '');
}

afterEach(() => {
  closeCardMenu();
});

describe('map chrome', () => {
  it('keeps the map picker and hides the rest of the toolbar behind one menu', () => {
    const handlers = {
      onSelectMap: vi.fn(),
      onMode: vi.fn(),
      onExport: vi.fn(),
      onNewMap: vi.fn(),
      onFullscreen: vi.fn(),
      onAddLine: vi.fn(),
      onAddProgram: vi.fn(),
      onAddCompetition: vi.fn(),
      onJoin: vi.fn()
    };
    const toolbar = createMapToolbar({
      maps: [{ id: 'map_a', title: 'MindWorks 2026' }],
      currentId: 'map_a',
      mode: 'view',
      fullscreen: false,
      joining: false,
      handlers
    });

    expect(toolbar.querySelector('.hub-filter')).not.toBeNull();
    expect(toolbar.textContent).not.toContain('T1');
    expect(toolbar.querySelector('.map-term-pills')).toBeNull();
    expect([...toolbar.querySelectorAll('.btn')].map((btn) => btn.textContent)).toEqual([]);
    expect(toolbar.querySelector('.hub-pills')).toBeNull();

    const menu = openMenu(toolbar, 'Map menu');
    expect(menuLabels(menu)).toEqual(['Viewing', 'Edit', 'Export', 'New map', 'Full screen']);
    expect(menu.querySelector('.hub-menu__head')?.textContent).toBe('Map');
    menu.querySelector<HTMLButtonElement>('[data-card-menu-item="edit"]')?.click();
    expect(handlers.onMode).toHaveBeenCalledWith('edit');
  });

  it('adds edit actions to the same menu once editing', () => {
    const toolbar = createMapToolbar({
      maps: [{ id: 'map_a', title: 'MindWorks 2026' }],
      currentId: 'map_a',
      mode: 'edit',
      fullscreen: true,
      joining: true,
      handlers: {
        onSelectMap: vi.fn(),
        onMode: vi.fn(),
        onExport: vi.fn(),
        onNewMap: vi.fn(),
        onFullscreen: vi.fn(),
        onAddLine: vi.fn(),
        onAddProgram: vi.fn(),
        onAddCompetition: vi.fn(),
        onJoin: vi.fn()
      }
    });
    expect(menuLabels(openMenu(toolbar, 'Map menu'))).toEqual([
      'View',
      'Editing',
      'Export',
      'New map',
      'Exit full screen',
      'Add line',
      'Add program',
      'Add competition',
      'Stop joining'
    ]);
  });

  it('hides line chrome in view and parks line edits in the toolbar menu', () => {
    const onMove = vi.fn();
    const onAddYearLine = vi.fn();
    const lines = [
      line(),
      line({ id: 'line_innovation', name: 'Innovation', letter: 'I', color: 'yellow' })
    ];
    const handlers = {
      onSelectMap: vi.fn(),
      onMode: vi.fn(),
      onExport: vi.fn(),
      onNewMap: vi.fn(),
      onFullscreen: vi.fn(),
      onAddLine: vi.fn(),
      onAddProgram: vi.fn(),
      onAddCompetition: vi.fn(),
      onJoin: vi.fn(),
      onMove,
      onAddYearLine
    };
    const viewing = createMapToolbar({
      maps: [{ id: 'map_a', title: 'MindWorks 2026' }],
      currentId: 'map_a',
      mode: 'view',
      fullscreen: false,
      joining: false,
      lines,
      handlers
    });
    expect(viewing.querySelector('[aria-label="Lines menu"]')).toBeNull();
    expect(viewing.textContent).not.toContain('Justice Line');
    expect(viewing.textContent).not.toContain('Junior · Rozelle · Senior');

    const editing = createMapToolbar({
      maps: [{ id: 'map_a', title: 'MindWorks 2026' }],
      currentId: 'map_a',
      mode: 'edit',
      fullscreen: false,
      joining: false,
      lines,
      handlers
    });
    const menu = openMenu(editing, 'Lines menu');
    expect(menuLabels(menu)).toEqual([
      'Move Justice right',
      'Add extra year line to Justice',
      'Move Innovation left',
      'Add extra year line to Innovation'
    ]);
    menu.querySelector<HTMLButtonElement>('[data-card-menu-item="right-line_justice"]')?.click();
    expect(onMove).toHaveBeenCalledWith('line_justice', 1);
  });

  it('starts the map index as an icon and expands the panel on click', () => {
    const onOpen = vi.fn();
    const onInput = vi.fn();
    const shell = createMapIndexShell({ onOpenChange: onOpen });
    const search = createMapIndexSearch({
      placeholder: 'Programs & competitions…',
      ariaLabel: 'Search map cards',
      onInput
    });
    shell.inner.append(search.root);

    expect(shell.root.classList.contains('is-open')).toBe(false);
    expect(shell.root.querySelector('[data-map-index-toggle]')?.getAttribute('aria-expanded')).toBe('false');
    shell.root.querySelector<HTMLButtonElement>('[data-map-index-toggle]')!.click();
    expect(shell.root.classList.contains('is-open')).toBe(true);
    expect(onOpen).toHaveBeenCalledWith(true);
    expect(search.input.placeholder).toBe('Programs & competitions…');
    search.input.value = 'rotary';
    search.input.dispatchEvent(new Event('input'));
    expect(onInput).toHaveBeenCalledWith('rotary');

    shell.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(shell.root.classList.contains('is-open')).toBe(false);
    expect(onOpen).toHaveBeenCalledWith(false);
  });
});
