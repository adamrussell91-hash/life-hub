export function createPinList(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLElement;
  items?: Array<{ id: string; label: string; pinned?: boolean }>;
  onPin?: (id: string, pinned: boolean) => void;
  onOpen?: (id: string) => void;
}): { el: HTMLElement; items: Array<{ id: string; label: string; pinned: boolean }>; paint: () => void };

export function createLabeledProgress(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLElement;
  label?: string;
  value?: number | string;
  max?: number | string;
}): { el: HTMLElement; value: number; max: number; pct: number };

export function createStepIndicator(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLElement;
  steps?: string[];
  current?: number;
}): { el: HTMLElement };

export function createRunWidget(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLElement;
  distance?: number;
  unit?: string;
  label?: string;
}): { el: HTMLElement; value: HTMLElement };

export function createScheduleButton(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLElement;
  label?: string;
  onSchedule?: () => void;
}): { el: HTMLElement; button: HTMLButtonElement };

export function createSlotPicker(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLElement;
  slots?: Array<{ id: string; label?: string }>;
  selected?: string[];
  onToggle?: (id: string, on: boolean) => void;
}): { el: HTMLElement; selected: Set<string> };

export function createEventReminders(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  reminders?: string[];
}): { el: HTMLElement; selected: Set<string> };

export function createDisclosureCard(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLElement;
  title?: string;
  meta?: string;
  detail?: string;
  className?: string;
}): { el: HTMLElement; trigger: HTMLButtonElement; body: HTMLElement; open: () => void };

export function createTaskDisclosure(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  title?: string;
  progress?: string;
  detail?: string;
}): { el: HTMLElement; trigger: HTMLButtonElement; body: HTMLElement; open: () => void };

export function createActivitiesCard(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  title?: string;
  items?: string[];
}): { el: HTMLElement; trigger: HTMLButtonElement; body: HTMLElement; open: () => void };

export function createCollectionGrid(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  items?: Array<{ id: string; label: string }>;
  onExpand?: (item: { id: string; label: string }) => void;
}): { el: HTMLElement };

export function createScrollIsland(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  progressLabel?: string;
  actions?: Array<{ label: string; onSelect?: () => void }>;
}): { el: HTMLElement };

export function createProgressiveInputStack(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  fields?: Array<{ label: string; name?: string }>;
  onChange?: (name: string, value: string) => void;
}): { el: HTMLElement };

export function createJournalNav(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  sections?: Array<{ id: string; label: string }>;
  current?: string;
  label?: string;
  onSelect?: (id: string) => void;
}): { el: HTMLElement };

export function createSaveToggle(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLButtonElement;
  saved?: boolean;
  label?: string;
  savedLabel?: string;
  onToggle?: (saved: boolean) => void;
}): { el: HTMLButtonElement; isSaved: () => boolean };

export function createStatusPicker(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  statuses?: Array<{ id: string; label: string }>;
  value?: string;
  onChange?: (id: string) => void;
}): { el: HTMLElement; value: string };

export function mountHubSurfaces(scope?: ParentNode): Array<{ el: HTMLElement }>;
