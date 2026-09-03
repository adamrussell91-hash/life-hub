export type RailSectionId = 'home' | 'plan' | 'views' | 'work' | 'network' | 'tools';

export interface RailDisclosureState {
  isOpen(id: RailSectionId): boolean;
  openIds(): RailSectionId[];
  reset(): void;
  syncActive(id: RailSectionId): void;
  toggle(id: RailSectionId): void;
}

export function createRailDisclosureState(): RailDisclosureState {
  const open = new Set<RailSectionId>();
  let active: RailSectionId | null = null;
  return {
    isOpen: (id) => open.has(id),
    openIds: () => [...open],
    reset() {
      open.clear();
      active = null;
    },
    syncActive(id) {
      active = id;
      open.add(id);
    },
    toggle(id) {
      if (id === active) return;
      if (open.has(id)) open.delete(id);
      else open.add(id);
    }
  };
}
