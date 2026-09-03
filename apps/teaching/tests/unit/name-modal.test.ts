import { describe, expect, it, vi, afterEach } from 'vitest';
import { openNameModal } from '@/teacher/create/name-modal';

describe('openNameModal', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('saves the typed title through a dialog, not window.prompt', async () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    openNameModal({
      title: 'Save as lesson template',
      label: 'Title',
      defaultValue: 'Retrieval in 20 minutes',
      confirmLabel: 'Save',
      onConfirm
    });

    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.body.textContent).toContain('Save as lesson template');
    expect(window.prompt).not.toHaveBeenCalled();

    const input = document.querySelector<HTMLInputElement>('[data-name-modal-field="title"]');
    expect(input?.value).toBe('Retrieval in 20 minutes');
    if (input) input.value = 'Retrieval pack';

    document.querySelector<HTMLButtonElement>('[data-name-modal-action="save"]')?.click();

    await vi.waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith('Retrieval pack');
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    promptSpy.mockRestore();
  });

  it('cancel closes without confirming', () => {
    const onConfirm = vi.fn();
    openNameModal({
      title: 'Save as lesson template',
      label: 'Title',
      defaultValue: 'Draft',
      confirmLabel: 'Save',
      onConfirm
    });

    document.querySelector<HTMLButtonElement>('[data-name-modal-action="cancel"]')?.click();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
