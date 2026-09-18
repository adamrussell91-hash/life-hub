import { bindTitleAutosave, type TitleAutosaveHandle } from '@/teacher/title-autosave';

export interface EntityPageTitleOptions {
  value: string;
  ariaLabel: string;
  inputClassName?: string;
  onPreview: (value: string) => void;
  onSave?: (value: string) => void | Promise<void>;
  onSaved?: (value: string) => void | Promise<void>;
  onError?: (error: unknown) => void;
}

export interface EntityPageTitleHandle {
  update(value: string): void;
  flush(): Promise<void>;
  dispose(): void;
}

/**
 * One title editing surface for full Teaching pages.
 *
 * Unit and Class pages pass onSave and use the shared title autosave path.
 * Lesson pages delegate persistence to their existing SaveController while
 * still using the same visible edit control and immediate preview behaviour.
 */
export function mountEntityPageTitle(
  host: HTMLElement,
  options: EntityPageTitleOptions
): EntityPageTitleHandle {
  const root = document.createElement('div');
  root.className = 'entity-page-title';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = ['entity-page-title__input', options.inputClassName]
    .filter(Boolean)
    .join(' ');
  input.value = options.value;
  input.setAttribute('aria-label', options.ariaLabel);
  input.autocomplete = 'off';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'entity-page-title__edit';
  edit.textContent = 'Edit name';
  edit.setAttribute('aria-label', `Edit ${options.ariaLabel.toLowerCase()}`);
  edit.addEventListener('click', () => {
    input.focus();
    input.select();
  });

  const status = document.createElement('span');
  status.className = 'entity-page-title__status';
  status.setAttribute('aria-live', 'polite');
  status.hidden = !options.onSave;

  root.append(input, edit, status);
  host.append(root);

  let autosave: TitleAutosaveHandle | null = null;
  let delegatedValue = options.value;

  const onInputStatus = (): void => {
    if (!options.onSave) return;
    status.hidden = false;
    status.textContent = 'Saving…';
    status.classList.remove('entity-page-title__status--error');
  };

  input.addEventListener('input', onInputStatus);

  if (options.onSave) {
    autosave = bindTitleAutosave(input, {
      initialValue: options.value,
      onPreview: options.onPreview,
      onSave: options.onSave,
      onSaved: async (value) => {
        status.hidden = false;
        status.textContent = 'Saved';
        status.classList.remove('entity-page-title__status--error');
        await options.onSaved?.(value);
      },
      onError: (error) => {
        status.hidden = false;
        status.textContent = 'Save failed';
        status.classList.add('entity-page-title__status--error');
        options.onError?.(error);
      }
    });
  } else {
    const onInput = (): void => {
      delegatedValue = input.value.replace(/[\r\n]+/g, ' ');
      if (input.value !== delegatedValue) input.value = delegatedValue;
      options.onPreview(delegatedValue);
    };
    const onBlur = (): void => {
      if (input.value.trim()) return;
      input.value = delegatedValue;
      options.onPreview(delegatedValue);
    };
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      input.blur();
    };
    input.addEventListener('input', onInput);
    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', onKeydown);

    return {
      update(value: string) {
        delegatedValue = value;
        input.value = value;
      },
      flush: () => Promise.resolve(),
      dispose() {
        input.removeEventListener('input', onInputStatus);
        input.removeEventListener('input', onInput);
        input.removeEventListener('blur', onBlur);
        input.removeEventListener('keydown', onKeydown);
        root.remove();
      }
    };
  }

  return {
    update(value: string) {
      autosave?.update(value);
    },
    flush: () => autosave?.flush() ?? Promise.resolve(),
    dispose() {
      input.removeEventListener('input', onInputStatus);
      autosave?.dispose();
      root.remove();
    }
  };
}
