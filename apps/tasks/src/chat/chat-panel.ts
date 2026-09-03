import { attachVisualViewportInset, detachVisualViewportInset } from '@/chat/visual-viewport';

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
    attachVisualViewportInset();
    openSlot = slot;
  }

  function close(): void {
    detachVisualViewportInset();
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
