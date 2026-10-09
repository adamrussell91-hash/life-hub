import type { Item } from '@/types';
import { I } from '@/lib/icons';

export interface SafePhotoSheetOptions {
  item: Item;
  mode: 'mark' | 'photo';
  onConfirm: (file: File | null) => void | Promise<void>;
  onClose: () => void;
}

/** Sheet to mark a stop safe, optionally with a place photo for followers (R4). */
export function renderSafePhotoSheet(host: HTMLElement, options: SafePhotoSheetOptions): void {
  host.replaceChildren();

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const heading = document.createElement('h3');
  heading.textContent = options.mode === 'photo' ? 'Add a photo' : 'Mark safe';
  const blurb = document.createElement('p');
  blurb.textContent =
    options.mode === 'photo'
      ? `Share a photo of ${options.item.title} with people on the public link.`
      : `Tick ${options.item.title} as safe. Followers on the public link see the time you marked it — add a photo if you want.`;
  sheet.append(heading, blurb);

  const form = document.createElement('form');
  form.className = 'addform__form';
  form.noValidate = true;

  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';
  const grid = document.createElement('div');
  grid.className = 'fgrid';

  const fileLabel = document.createElement('label');
  fileLabel.className = 'full';
  const flabel = document.createElement('span');
  flabel.className = 'flabel';
  flabel.textContent = options.mode === 'photo' ? 'Photo' : 'Photo (optional)';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileLabel.append(flabel, fileInput);
  grid.append(fileLabel);

  const preview = document.createElement('img');
  preview.className = 'safe-photo-preview full';
  preview.alt = '';
  preview.hidden = true;
  grid.append(preview);

  const errorNote = document.createElement('p');
  errorNote.className = 'hint';
  errorNote.hidden = true;
  errorNote.setAttribute('role', 'alert');
  scroll.append(grid, errorNote);
  form.append(scroll);

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      preview.hidden = true;
      preview.removeAttribute('src');
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });

  function close(): void {
    host.replaceChildren();
    options.onClose();
  }

  const actions = document.createElement('div');
  actions.className = 'addform__actions';
  actions.setAttribute('data-part', 'form-actions');
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn';
  saveBtn.innerHTML = `${I.check}${options.mode === 'photo' ? 'Save photo' : 'Mark safe'}`;
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', close);
  actions.append(saveBtn, cancelBtn);
  form.append(actions);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorNote.hidden = true;
    const file = fileInput.files?.[0] ?? null;
    if (options.mode === 'photo' && !file) {
      errorNote.hidden = false;
      errorNote.textContent = 'Choose a photo to share.';
      return;
    }
    saveBtn.disabled = true;
    try {
      await options.onConfirm(file);
      host.replaceChildren();
    } catch (err) {
      saveBtn.disabled = false;
      errorNote.hidden = false;
      errorNote.textContent = err instanceof Error ? err.message : 'Could not save. Try again.';
    }
  });

  sheet.append(form);
  back.append(sheet);
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  host.append(back);
}
