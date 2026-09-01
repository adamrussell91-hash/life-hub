export function createChatPanelController({ root }) {
  const panel = root.querySelector('#chat-view');
  const homeSlot = root.querySelector('#chat-view-home');
  if (!panel || !homeSlot) throw new TypeError('Chat panel dependencies are unavailable');

  let openSlot = null;

  function open(slot, accentColour) {
    if (!slot) throw new TypeError('A slot element is required to open the chat panel');
    slot.append(panel);
    panel.hidden = false;
    panel.dataset.panelMode = 'overlay';
    panel.style.setProperty('--agent-accent', accentColour);
    openSlot = slot;
  }

  function close() {
    if (!openSlot) return;
    homeSlot.append(panel);
    panel.hidden = true;
    delete panel.dataset.panelMode;
    // Keep --agent-accent so Chat section / next open still shows the last personality
    // colour until open()/applyAgentAccent overwrites it. Clearing forced a blue fallback.
    openSlot = null;
  }

  function isOpen() {
    return openSlot !== null;
  }

  return { open, close, isOpen };
}
