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

export type ClosedFieldOption = {
  value: string;
  label?: string;
};

export type MorphingClosedFieldApi = MorphingPopoverApi & {
  getValue: () => string;
  getDraft: () => string;
  setValue: (value: string) => void;
};

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
    options?: ClosedFieldOption[] | string;
    value?: string;
    onSave?: (value: string, api: Pick<MorphingPopoverApi, 'open' | 'close' | 'isOpen'>) => void;
    onDiscard?: (value: string) => void;
    onChange?: (value: string) => void;
  }
): MorphingPopoverApi | MorphingClosedFieldApi | null;

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

export function createMorphingClosedFieldPopover(options?: {
  root: ParentNode & { createElement: typeof document.createElement };
  label?: string;
  title?: string;
  supporting?: string;
  options?: ClosedFieldOption[] | string;
  value?: string;
  submitLabel?: string;
  discardLabel?: string;
  className?: string;
  layoutId?: string;
  triggerClass?: string;
  wrap?: HTMLElement;
  trigger?: HTMLElement;
  onChange?: (value: string) => void;
  onSave?: (value: string, api: Pick<MorphingPopoverApi, 'open' | 'close' | 'isOpen'>) => void;
  onDiscard?: (value: string) => void;
}): MorphingClosedFieldApi;

export function resetMorphingPopoverForTests(): void;
