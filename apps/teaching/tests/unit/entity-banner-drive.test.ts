import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const driveState = vi.hoisted(() => ({
  dialogOpenDuringPick: null as boolean | null,
  resolvePick: null as ((value: null) => void) | null
}));

vi.mock('@/teacher/drive-picker', () => ({
  openDrivePicker: vi.fn(
    () =>
      new Promise<null>((resolve) => {
        driveState.dialogOpenDuringPick =
          document.querySelector<HTMLDialogElement>('.entity-banner__dialog')?.open ?? null;
        driveState.resolvePick = resolve;
      })
  )
}));

import { renderEntityBanner } from '@/teacher/entity-banner';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

describe('renderEntityBanner cover dialog + Google Drive', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    document.querySelectorAll('.entity-banner__dialog').forEach((el) => el.remove());
  });

  it('steps the modal out of the way while Drive is open, then brings it back', async () => {
    renderEntityBanner(host, {
      entityId: 'unit_a',
      title: 'Focus unit',
      media: [],
      editable: true,
      onSave: vi.fn()
    });

    host.querySelector<HTMLButtonElement>('.entity-banner__edit')!.click();
    const dialog = document.querySelector<HTMLDialogElement>('.entity-banner__dialog')!;
    expect(dialog.open).toBe(true);

    const drive = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'Choose from Google Drive'
    )!;
    drive.click();
    await flush();

    // Google's picker would sit behind a modal dialog, so it must be closed meanwhile.
    expect(driveState.dialogOpenDuringPick).toBe(false);
    // Let any queued close event run; it must not tear the dialog down.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dialog.isConnected).toBe(true);

    driveState.resolvePick!(null);
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dialog.isConnected).toBe(true);
    expect(dialog.open).toBe(true);
  });
});
