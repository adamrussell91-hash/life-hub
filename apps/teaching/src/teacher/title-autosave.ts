export interface TitleAutosaveOptions {
  initialValue: string;
  onPreview?: (value: string) => void;
  onSave: (value: string) => void | Promise<void>;
  onSaved?: (value: string) => void | Promise<void>;
  onError?: (error: unknown) => void;
  debounceMs?: number;
}

export interface TitleAutosaveHandle {
  flush(): Promise<void>;
  update(value: string): void;
  dispose(): void;
}

/**
 * Shared title persistence for Teaching entities.
 *
 * Input is optimistic. A short debounce writes while the teacher types.
 * Blur and Enter flush immediately. Failed writes restore the last confirmed
 * value so the UI never implies an unsaved rename succeeded.
 */
export function bindTitleAutosave(
  input: HTMLInputElement | HTMLTextAreaElement,
  options: TitleAutosaveOptions
): TitleAutosaveHandle {
  let confirmed = options.initialValue.trim() || options.initialValue;
  let timer: number | null = null;
  let disposed = false;
  let inFlight: Promise<void> | null = null;
  let rerun = false;
  const debounceMs = options.debounceMs ?? 450;

  input.value = options.initialValue;

  const preview = (value: string): void => {
    options.onPreview?.(value);
  };

  const clearTimer = (): void => {
    if (timer === null) return;
    window.clearTimeout(timer);
    timer = null;
  };

  const normalise = (): string => input.value.replace(/[\r\n]+/g, ' ').trim();

  const persist = async (): Promise<void> => {
    clearTimer();
    if (disposed) return;

    const next = normalise();
    if (!next) {
      input.value = confirmed;
      preview(confirmed);
      return;
    }

    if (inFlight) {
      rerun = true;
      await inFlight;
      if (!disposed && rerun) {
        rerun = false;
        await persist();
      }
      return;
    }

    if (next === confirmed) return;

    const attempted = next;
    inFlight = (async () => {
      try {
        await options.onSave(attempted);
        confirmed = attempted;
        if (normalise() === attempted) input.value = attempted;
        await options.onSaved?.(attempted);
      } catch (error) {
        if (normalise() === attempted) {
          input.value = confirmed;
          preview(confirmed);
        }
        options.onError?.(error);
      } finally {
        inFlight = null;
      }
    })();

    await inFlight;

    if (!disposed && normalise() !== confirmed) {
      await persist();
    }
  };

  const schedule = (): void => {
    clearTimer();
    timer = window.setTimeout(() => {
      timer = null;
      void persist();
    }, debounceMs);
  };

  const onInput = (): void => {
    const cleaned = input.value.replace(/[\r\n]+/g, ' ');
    if (cleaned !== input.value) input.value = cleaned;
    preview(input.value);
    schedule();
  };

  const onBlur = (): void => {
    void persist();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void persist().then(() => input.blur());
  };

  input.addEventListener('input', onInput);
  input.addEventListener('blur', onBlur);
  input.addEventListener('keydown', onKeydown);

  return {
    flush: persist,
    update(value: string) {
      confirmed = value.trim() || value;
      input.value = value;
      preview(value);
    },
    dispose() {
      disposed = true;
      clearTimer();
      input.removeEventListener('input', onInput);
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('keydown', onKeydown);
    }
  };
}
