import { describe, expect, it } from 'vitest';
import { createRailDisclosureState } from '@/shell/rail-disclosure';

describe('rail disclosure state', () => {
  it('starts closed and independently opens multiple sections', () => {
    const state = createRailDisclosureState();
    expect(state.isOpen('plan')).toBe(false);
    state.toggle('plan');
    state.toggle('views');
    expect(state.openIds()).toEqual(['plan', 'views']);
  });

  it('opens the active section and will not hide it', () => {
    const state = createRailDisclosureState();
    state.syncActive('views');
    expect(state.isOpen('views')).toBe(true);
    state.toggle('views');
    expect(state.isOpen('views')).toBe(true);
  });
});
