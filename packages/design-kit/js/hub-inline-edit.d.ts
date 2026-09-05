export function enhanceInlineEdit(
  el: HTMLElement,
  options?: { onCommit?: (value: string) => void }
): HTMLElement;

export function createEditableChip(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  label?: string;
  onCommit?: (value: string) => void;
  onRemove?: () => void;
}): { el: HTMLElement };

export function createTagList(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLElement;
  tags?: string[];
  addLabel?: string;
  onChange?: (tags: string[]) => void;
}): { el: HTMLElement; tags: string[]; setTags: (tags: string[]) => void };

export function mountInlineEdits(scope?: ParentNode): HTMLElement[];
