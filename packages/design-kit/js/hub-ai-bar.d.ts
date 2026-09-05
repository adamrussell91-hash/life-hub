export function createContextualAiBar(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLElement;
  placeholder?: string;
  askLabel?: string;
  submitLabel?: string;
  tools?: Array<{ id: string; label: string }>;
  onSubmit?: (value: string) => void;
  onTool?: (id: string) => void;
}): { el: HTMLElement; input: HTMLInputElement; open: () => void; isOpen: () => boolean };

export function mountContextualAiBars(scope?: ParentNode): Array<{ el: HTMLElement }>;

export function createSelectAiAgent(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLElement;
  agents?: Array<{ id: string; label: string }>;
  value?: string;
  label?: string;
  onChange?: (id: string) => void;
}): { el: HTMLElement; value: string; setValue: (id: string) => void };

export function mountSelectAiAgents(scope?: ParentNode): Array<{ el: HTMLElement }>;
