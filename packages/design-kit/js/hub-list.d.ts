export const HUB_HOLD_MS: number;

export const HUB_LIST_ICONS: Record<
  'grip' | 'more' | 'plus' | 'up' | 'down' | 'left' | 'right' | 'copy' | 'trash' | 'columns' | 'edit' | 'check',
  string
>;

export type HubMenuItem =
  | {
      label: string;
      icon?: string;
      hint?: string;
      onSelect?: () => void;
      disabled?: boolean;
      /** Shown under a disabled item so the person knows why. */
      reason?: string;
      danger?: boolean;
      /** Press-and-hold to confirm (destructive actions). */
      hold?: boolean;
      dataset?: Record<string, string>;
    }
  | 'separator';

export function openHubMenu(
  anchor: HTMLElement,
  items: HubMenuItem[],
  opts?: { label?: string }
): HTMLElement | null;

export function closeHubMenu(): void;

export function createHubMenuButton(
  getItems: () => HubMenuItem[],
  opts?: { label?: string; className?: string }
): HTMLButtonElement;

export function bindHoldToConfirm(
  target: HTMLElement,
  opts: { onConfirm: () => void; ms?: number; onEarlyRelease?: () => void }
): void;

export type HubListItemContext<T> = {
  index: number;
  /** Replace this item after a content edit. Does not re-render the list. */
  update(next: T): void;
  readonly current: T;
};

export type HubListOptions<T> = {
  items: readonly T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, ctx: HubListItemContext<T>) => Node;
  /** Lowercase singular, used in labels: "Add item", "Delete item". */
  noun?: string;
  label?: string;
  /** Visual density: blocks (nested blocks), items (multi-field rows), compact (one line). */
  variant?: 'blocks' | 'items' | 'compact';
  axis?: 'vertical' | 'horizontal';
  getKey?: (item: T) => string;
  itemLabel?: (item: T, index: number) => string | Node | null | undefined;
  describe?: (item: T, index: number) => string;
  create?: (index: number) => T | null | undefined;
  /** Typed insert (block picker). Call `done` with the new item. */
  pick?: (anchor: HTMLElement, done: (item: T) => void, index: number) => void;
  duplicate?: (item: T, index: number) => T | null | undefined;
  /** Return a string to block deleting this item and say why. */
  canRemove?: (item: T, index: number) => true | string | undefined;
  onRemove?: (item: T, index: number) => void;
  min?: number;
  max?: number;
  minReason?: string;
  maxReason?: string;
  /** `false` hides the end-of-list add row; a string relabels it. */
  addLabel?: string | false;
  /** Show a + insert target between rows. */
  insertBetween?: boolean;
  reorderable?: boolean;
  /** Undo toast after delete (default on). */
  undo?: boolean;
  /** Fresh items for undo when the list may have been rebuilt. */
  read?: () => readonly T[];
  /** Lists sharing a group accept each other's drags via onTransfer. */
  group?: string;
  dragData?: (item: T, index: number) => unknown;
  onTransfer?: (source: { data: unknown; index: number }, toIndex: number) => void;
  extraMenuItems?: (item: T, index: number) => HubMenuItem[];
  /** Shown instead of the list when empty. `insert` adds an item; `pick` opens the picker. */
  empty?: (insert: (item: T) => void, pick: (anchor: HTMLElement) => void) => Node;
};

export type HubListHandle<T> = {
  el: HTMLElement;
  readonly items: T[];
  setItems(items: readonly T[]): void;
  refresh(): void;
  focusItem(index: number): void;
  insert(index: number, item: T): void;
  dispose(): void;
};

export function createHubList<T>(options: HubListOptions<T>): HubListHandle<T>;

export type HubInsertOption = {
  value: string;
  label: string;
  description?: string;
  iconSrc?: string;
};

export function openHubInsertPicker(
  anchor: HTMLElement,
  opts: {
    groups: Array<{ label: string; options: HubInsertOption[] }>;
    onPick: (value: string) => void;
    placeholder?: string;
  }
): void;

export type HubTabStripOptions<T> = {
  tabs: readonly T[];
  onChange: (tabs: T[]) => void;
  getLabel: (tab: T) => string;
  setLabel: (tab: T, label: string) => T;
  create: (index: number) => T;
  duplicate?: (tab: T) => T;
  renderPanel: (tab: T, index: number) => Node;
  countChildren?: (tab: T) => number;
  read?: () => readonly T[];
  active?: number;
  /** Called after every render with the open tab (e.g. to remember it). */
  onActiveChange?: (index: number) => void;
  min?: number;
  max?: number;
  minReason?: string;
  maxReason?: string;
  label?: string;
};

export function createHubTabStrip<T>(options: HubTabStripOptions<T>): {
  el: HTMLElement;
  readonly active: number;
  setTabs(tabs: readonly T[]): void;
};
