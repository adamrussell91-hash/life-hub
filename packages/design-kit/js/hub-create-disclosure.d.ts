export function createCreateDisclosure(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLElement;
  trigger?: HTMLButtonElement;
  triggerLabel?: string;
  items?: Array<{ id: string; label: string; onSelect?: () => void }>;
}): {
  el: HTMLElement;
  trigger: HTMLButtonElement;
  panel: HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
};

export function mountCreateDisclosures(scope?: ParentNode): Array<{ el: HTMLElement }>;
