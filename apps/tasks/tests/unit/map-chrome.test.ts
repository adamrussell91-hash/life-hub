import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeCardMenu } from '@/views/card-menu';
import { createMapIndexSearch, createMapIndexShell, createMapToolbar } from '@/views/map-chrome';

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

  it('shows labelled edit buttons and a map name field once editing, not a second menu', () => {
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
      onRenameMap: vi.fn()
    };
    const toolbar = createMapToolbar({
      maps: [{ id: 'map_a', title: 'MindWorks 2026' }],
      currentId: 'map_a',
      mode: 'edit',
      fullscreen: true,
      joining: true,
      handlers
    });
    expect(menuLabels(openMenu(toolbar, 'Map menu'))).toEqual([
      'View',
      'Editing',
      'Export',
      'New map',
      'Exit full screen'
    ]);
    closeCardMenu();
    expect(toolbar.querySelector('[aria-label="Lines menu"]')).toBeNull();

    const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>('.map-editbar .btn')];
    expect(buttons.map((btn) => btn.textContent)).toEqual([
      '+ Line',
      '+ Program',
      '+ Competition',
      'Stop joining',
      'Done'
    ]);
    expect(buttons[3]?.getAttribute('aria-pressed')).toBe('true');
    buttons[1]!.click();
    expect(handlers.onAddProgram).toHaveBeenCalled();
    buttons[4]!.click();
    expect(handlers.onMode).toHaveBeenCalledWith('view');

    const name = toolbar.querySelector<HTMLInputElement>('input[aria-label="Map name"]')!;
    expect(name.value).toBe('MindWorks 2026');
    name.value = '  ';
    name.dispatchEvent(new Event('change'));
    expect(handlers.onRenameMap).not.toHaveBeenCalled();
    expect(name.value).toBe('MindWorks 2026');
    name.value = 'MindWorks 2027';
    name.dispatchEvent(new Event('change'));
    expect(handlers.onRenameMap).toHaveBeenCalledWith('MindWorks 2027');
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
