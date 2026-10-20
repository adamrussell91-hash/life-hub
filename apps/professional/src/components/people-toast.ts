/**
 * One toast at a time for the People page: a short line plus up to two
 * actions (Open, Undo, Retry). It stays 10 seconds, or until an action runs.
 */

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastHandle {
  dismiss: () => void;
}

export const TOAST_MS = 10_000;

export function createToastHost(): {
  root: HTMLElement;
  show: (message: string, actions?: ToastAction[], timeoutMs?: number) => ToastHandle;
} {
  const root = document.createElement('div');
  root.className = 'people-toast-host';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  let timer = 0;

  function clear(): void {
    window.clearTimeout(timer);
    root.replaceChildren();
  }

  function show(message: string, actions: ToastAction[] = [], timeoutMs = TOAST_MS): ToastHandle {
    clear();
    const toast = document.createElement('div');
    toast.className = 'people-toast';
    const text = document.createElement('span');
    text.className = 'people-toast__text';
    text.textContent = message;
    toast.append(text);
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'people-toast__act';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        clear();
        action.onClick();
      });
      toast.append(btn);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'people-toast__close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '✕';
    close.addEventListener('click', clear);
    toast.append(close);
    root.append(toast);
    timer = window.setTimeout(() => {
      if (root.contains(toast)) clear();
    }, timeoutMs);
    return { dismiss: () => { if (root.contains(toast)) clear(); } };
  }

  return { root, show };
}
