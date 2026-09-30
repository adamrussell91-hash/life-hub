import { applyHubPillsThumb } from '../../design-kit/js/hub-motion.js';

/**
 * Kit `.hub-pills` for a closed choice (design kit: closed choices are pills,
 * not a native select). `aria-pressed` marks the selected option.
 */
export function createPillGroup<T extends string>(options: {
  label: string;
  choices: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange?: (value: T) => void;
}): { root: HTMLElement; get: () => T; set: (value: T) => void } {
  const root = document.createElement('div');
  root.className = 'hub-pills';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', options.label);
  let value = options.value;
  const buttons = options.choices.map(([choice, text]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hub-pills__btn';
    button.dataset.value = choice;
    button.textContent = text;
    button.addEventListener('click', () => {
      if (value === choice) return;
      set(choice);
      options.onChange?.(choice);
    });
    root.append(button);
    return button;
  });

  function paint(): void {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.value === value));
    if (root.isConnected) applyHubPillsThumb(root);
  }

  function set(next: T): void {
    value = next;
    paint();
  }

  paint();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => applyHubPillsThumb(root, { animate: false }));
  return { root, get: () => value, set };
}
