import { attachVisualViewportInset } from '@/chat/visual-viewport';

export type ChatPanelController = {
  open: (slot: HTMLElement, accentColour?: string) => void;
  close: () => void;
  isOpen: () => boolean;
};

export function createChatPanelController({
  panel,
  homeSlot
}: {
  panel: HTMLElement;
  homeSlot: HTMLElement;
}): ChatPanelController {
  let openSlot: HTMLElement | null = null;

  function open(slot: HTMLElement, accentColour?: string): void {
    slot.append(panel);
    panel.hidden = false;
    panel.dataset.panelMode = 'overlay';
    if (accentColour) panel.style.setProperty('--agent-accent', accentColour);
    // Idempotent — main also attaches so full-page Clare keeps the contract.
    attachVisualViewportInset();
    openSlot = slot;
  }

  function close(): void {
    // Do not detach: full-page Chat still needs vv-keyboard-open / --vv-*.
    if (!openSlot) {
      if (panel.dataset.panelMode === 'overlay') {
        homeSlot.append(panel);
        panel.hidden = true;
        delete panel.dataset.panelMode;
      }
      return;
    }
    homeSlot.append(panel);
    panel.hidden = true;
    delete panel.dataset.panelMode;
    openSlot = null;
  }

  function isOpen(): boolean {
    return openSlot !== null;
  }

  return { open, close, isOpen };
}
