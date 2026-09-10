import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeCardMenu } from '@/views/card-menu';
import {
  mountMapCard,
  mountMapCardIndex,
  renderLineRail,
  renderMapMicroCard,
  type MapCardModel
} from '@/views/map-cards';

const lines = [
  { id: 'line_justice', letter: 'J', name: 'Justice', color: 'blue' as const },
  { id: 'line_innovation', letter: 'I', name: 'Innovation', color: 'yellow' as const },
  { id: 'line_expression', letter: 'E', name: 'Expression', color: 'green' as const },
  { id: 'line_reasoning', letter: 'R', name: 'Reasoning', color: 'purple' as const }
];

function model(partial: Partial<MapCardModel> = {}): MapCardModel {
  return {
    id: 'st_advocacy',
    kind: 'station',
    label: 'Diplomacy and Advocacy',
    planning: 'planned',
    starts_on: '2026-01-27',
    ends_on: '2026-12-31',
    tracks: ['junior', 'rozelle', 'senior'],
    updated_at: '2026-08-20T00:00:00.000Z',
    line: lines[0]!,
    lines,
    linkedTitle: null,
    ...partial
  };
}

function reduceMotion(): void {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  } as unknown as MediaQueryList);
}

function openMenu(root: ParentNode): HTMLElement {
  const trigger = root.querySelector<HTMLButtonElement>('.card-menu');
  expect(trigger).not.toBeNull();
  trigger!.click();
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

describe('map cards', () => {
  it('puts line discs in a rail at the top of a planned card', () => {
    const card = renderMapMicroCard(model());
    const rail = card.querySelector('.map-card__rail');
    expect(rail).not.toBeNull();
    expect([...rail!.querySelectorAll('.map-card__disc')].map((disc) => disc.textContent)).toEqual([
      'J',
      'I',
      'E',
      'R'
    ]);
    expect(rail!.querySelector('.map-card__disc.is-on')?.textContent).toBe('J');
    expect(card.querySelector('.status-badge')?.textContent).toBe('planned');
  });

  it('puts delete and planned/active in the three-dot menu — not as a button', () => {
    const host = document.createElement('div');
    const onDelete = vi.fn();
    const onTogglePlanning = vi.fn();
    const slot = mountMapCard(host, model(), { onDelete, onTogglePlanning });

    expect(slot.querySelector('button.btn')?.textContent).not.toBe('Delete');
    expect(slot.textContent).not.toContain('Proposed write');

    const menu = openMenu(slot);
    expect(menuLabels(menu)).toEqual(['Expand', 'Full page', 'Make active', 'Delete']);
    expect(menu.querySelector('[data-card-menu-item="delete"]')?.classList.contains('hub-menu__opt--danger')).toBe(
      true
    );

    menu.querySelector<HTMLButtonElement>('[data-card-menu-item="delete"]')?.click();
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.confirm-card')).toBeNull();
  });

  it('expands in place like every other hub card', () => {
    reduceMotion();
    const host = document.createElement('div');
    const slot = mountMapCard(host, model(), {});
    expect(slot.dataset.state).toBe('compact');
    slot.querySelector('.hub-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(slot.dataset.state).toBe('expanded');
    expect(slot.querySelector('.hub-card__title')?.textContent).toBe('Diplomacy and Advocacy');
    expect(slot.querySelector('.hub-card__eyebrow')?.textContent).toBe('Program');
    expect(slot.querySelector('.map-card__rail')).not.toBeNull();
    expect(menuLabels(openMenu(slot))).toEqual(['Collapse', 'Full page']);
  });

  it('offers Make planned when the card is already active', () => {
    const host = document.createElement('div');
    const onTogglePlanning = vi.fn();
    const slot = mountMapCard(host, model({ planning: 'active' }), { onTogglePlanning });
    const menu = openMenu(slot);
    expect(menuLabels(menu)).toContain('Make planned');
    menu.querySelector<HTMLButtonElement>('[data-card-menu-item="planning"]')?.click();
    expect(onTogglePlanning).toHaveBeenCalledTimes(1);
  });

  it('filters the card index without leaving the Cotton Glass recipe', () => {
    const index = mountMapCardIndex(
      [model(), model({ id: 'tk_muna', kind: 'event', label: 'Rotary MUNA', line: lines[0]! })],
      null,
      () => ({})
    );
    expect(index.querySelectorAll('.map-card-slot')).toHaveLength(2);
    expect(index.classList.contains('is-open')).toBe(false);
    index.querySelector<HTMLButtonElement>('[data-map-index-toggle]')!.click();
    expect(index.classList.contains('is-open')).toBe(true);
    const input = index.querySelector<HTMLInputElement>('.hub-search__input')!;
    input.value = 'rotary';
    input.dispatchEvent(new Event('input'));
    expect(index.querySelectorAll('.map-card-slot')).toHaveLength(1);
    expect(index.querySelector('.hub-row__title')?.textContent).toBe('Rotary MUNA');
    expect(index.querySelector('.map-index__item')).toBeNull();
  });

  it('renders a line rail helper with the active letter on', () => {
    const rail = renderLineRail(lines, 'line_expression');
    const discs = [...rail.querySelectorAll('.map-card__disc')];
    expect(discs.find((disc) => disc.textContent === 'E')?.classList.contains('is-on')).toBe(true);
    expect(discs.find((disc) => disc.textContent === 'J')?.classList.contains('is-dim')).toBe(true);
  });
});
