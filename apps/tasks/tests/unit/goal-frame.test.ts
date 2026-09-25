// apps/tasks/tests/unit/goal-frame.test.ts
import { describe, expect, it, vi } from 'vitest';
import { renderGoalFrame } from '@/views/goal-frame';
import { goal } from './goal-fixtures';

function commit(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

describe('goal structure card', () => {
  it('WOOP edits one quadrant and keeps the others', () => {
    const onPatch = vi.fn();
    const g = goal({ id: 'g', title: 'x', structure: 'woop', frame: { woop: { wish: 'a', outcome: 'b', obstacle: '', plan: '' } } });
    const node = renderGoalFrame(g, onPatch);
    expect(node.querySelectorAll('.goal-frame__tile')).toHaveLength(4);
    commit(node.querySelector<HTMLTextAreaElement>('[data-field="woop.obstacle"]')!, 'after 9pm');
    expect(onPatch).toHaveBeenCalledWith({ frame: { woop: { wish: 'a', outcome: 'b', obstacle: 'after 9pm', plan: '' } } });
  });

  it('Floor·target·stretch marks the highest level reached', () => {
    const g = goal({
      id: 'g', title: 'x', structure: 'floor_target_stretch',
      frame: { floor_target_stretch: { unit: 'standards', floor: 3, target: 5, stretch: 7, current: 3 } }
    });
    const node = renderGoalFrame(g, vi.fn());
    const tiles = [...node.querySelectorAll('.goal-frame__tile')];
    expect(tiles[0]!.querySelector('.goal-frame__here')).not.toBeNull();
    expect(tiles[1]!.querySelector('.goal-frame__here')).toBeNull();
  });

  it('OKR adds a key result', () => {
    const onPatch = vi.fn();
    const g = goal({ id: 'g', title: 'x', structure: 'okr', frame: { okr: { objective: 'Ship', key_results: [] } } });
    const node = renderGoalFrame(g, onPatch);
    node.querySelector<HTMLButtonElement>('[data-action="add-kr"]')!.click();
    expect(onPatch).toHaveBeenCalledWith({
      frame: { okr: { objective: 'Ship', key_results: [{ id: 'kr1', label: 'New key result', target: null, current: null }] } }
    });
  });

  it('SMARTER shows seven rows and Lead/lag shows the lag field', () => {
    expect(renderGoalFrame(goal({ id: 'g', title: 'x', structure: 'smarter' }), vi.fn()).querySelectorAll('.goal-rows .goal-field')).toHaveLength(7);
    expect(renderGoalFrame(goal({ id: 'g', title: 'x', structure: 'lead_lag' }), vi.fn()).querySelector('[data-field="lead_lag.lag"]')).not.toBeNull();
  });
});
