export type MorphingPopoverApi = {
  el: HTMLElement;
  trigger: HTMLButtonElement;
  content: HTMLElement;
  open: () => void;
  close: (opts?: { restoreFocus?: boolean }) => void;
  isOpen: () => boolean;
  setTriggerLabel: (label: string) => void;
  destroy: () => void;
};

export function createMorphingPopover(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  triggerLabel?: string;
  title?: string;
  supporting?: string;
  layoutId?: string;
  triggerClass?: string;
  className?: string;
  trigger?: HTMLElement;
  content?: HTMLElement;
  wrap?: HTMLElement;
  renderContent?: (body: HTMLElement, api: Pick<MorphingPopoverApi, 'open' | 'close' | 'isOpen'>) => void;
  autoFocus?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}): MorphingPopoverApi;

export function mountMorphingPopover(
  el: HTMLElement,
  options?: {
    root?: Document;
    title?: string;
    supporting?: string;
    layoutId?: string;
    autoFocus?: boolean;
    onOpen?: () => void;
    onClose?: () => void;
  }
): MorphingPopoverApi | null;

export function mountMorphingPopovers(scope?: ParentNode): MorphingPopoverApi[];

export function createMorphingNotePopover(options?: {
  root: ParentNode & { createElement: typeof document.createElement };
  label?: string;
  title?: string;
  supporting?: string;
  placeholder?: string;
  value?: string;
  rows?: number;
  className?: string;
  layoutId?: string;
  triggerClass?: string;
  extra?: (
    body: HTMLElement,
    api: Pick<MorphingPopoverApi, 'open' | 'close' | 'isOpen'>,
    refs: { textarea: HTMLTextAreaElement }
  ) => void;
  onChange?: (value: string) => void;
  onDone?: (value: string) => void;
}): MorphingPopoverApi & { textarea: HTMLTextAreaElement };

export function createMorphingValuesPopover(options?: {
  root: ParentNode & { createElement: typeof document.createElement };
  label?: string;
  title?: string;
  supporting?: string;
  fields?: Array<{
    id?: string;
    name?: string;
    label?: string;
    type?: string;
    value?: string | number;
    placeholder?: string;
    inputMode?: string;
    step?: string | number;
    min?: string | number;
    max?: string | number;
    autoFocus?: boolean;
  }>;
  submitLabel?: string;
  className?: string;
  layoutId?: string;
  triggerClass?: string;
  onSubmit?: (values: Record<string, string>, api: Pick<MorphingPopoverApi, 'open' | 'close' | 'isOpen'>) => void;
}): MorphingPopoverApi & { inputs: Array<{ field: object; input: HTMLInputElement }> };

export function resetMorphingPopoverForTests(): void;
