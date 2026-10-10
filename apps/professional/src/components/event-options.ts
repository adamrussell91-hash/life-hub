import {positionHubFloating, autoUpdateHubFloating} from '../../design-kit/js/hub-floating.js';

export function eventOptions(onEdit: () => void, onDelete: () => void): HTMLElement {
  const root = document.createElement('div');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'btn btn--ghost';
  trigger.textContent = 'Options';
  trigger.setAttribute('aria-label', 'Event options');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  root.append(trigger);
  let close: (() => void) | null = null;
  trigger.addEventListener('click', () => {
    if (close) {close(); return;}
    const menu = document.createElement('div');
    menu.className = 'hub-menu is-open event-options-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Event options');
    const items = [['Edit event', 'edit-event', onEdit], ['Delete event', 'delete-event', onDelete]] as const;
    const buttons = items.map(([label, part, action]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hub-menu__opt';
      button.setAttribute('role', 'menuitem');
      button.dataset.part = part;
      button.textContent = label;
      button.addEventListener('click', () => {close?.(); action();});
      menu.append(button);
      return button;
    });
    document.body.append(menu);
    trigger.setAttribute('aria-expanded', 'true');
    const stop = autoUpdateHubFloating(trigger, menu, {placement:'bottom-end'});
    void positionHubFloating(trigger, menu, {placement:'bottom-end'});
    const outside = (event: MouseEvent) => {
      if (!menu.contains(event.target as Node) && !root.contains(event.target as Node)) close?.();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') {close?.(); return;}
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1) + buttons.length) % buttons.length]!.focus();
      }
    };
    // Header replacement/navigation must not leave an orphan menu or listeners.
    const observer = new MutationObserver(() => {if (!trigger.isConnected) close?.();});
    observer.observe(document.body, {childList:true, subtree:true});
    close = () => {
      close = null; stop(); observer.disconnect();
      document.removeEventListener('click', outside);
      document.removeEventListener('keydown', keyboard);
      menu.remove(); trigger.setAttribute('aria-expanded', 'false');
      if (trigger.isConnected) trigger.focus();
    };
    document.addEventListener('click', outside);
    document.addEventListener('keydown', keyboard);
    buttons[0]!.focus();
  });
  return root;
}
