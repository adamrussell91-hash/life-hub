export function openHubCommandSearch(options?: {
  root?: Document;
  placeholder?: string;
  groups?: Array<{
    heading: string;
    items: Array<{ id: string; label: string; hint?: string; onSelect?: () => void }>;
  }>;
  onClose?: () => void;
}): { el: HTMLElement; panel: HTMLElement; input: HTMLInputElement; list: HTMLElement; close: () => void };

export function enhanceSearchPalette(panel: HTMLElement | null | undefined): HTMLElement | null | undefined;

export function resetHubCommandSearchForTests(): void;
