import type { Item } from '@/types';
import { I } from '@/lib/icons';
import { safeSaveErrorMessage } from '@/lib/safe-photo';

export interface SafePhotoSheetOptions {
  item: Item;
  onConfirm: (file: File) => void | Promise<void>;
  onClose: () => void;
}

/** Sheet to attach a place photo for followers after a stop is marked safe (R4). */
export function renderSafePhotoSheet(host: HTMLElement, options: SafePhotoSheetOptions): void {
  host.replaceChildren();

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const heading = document.createElement('h3');
  heading.textContent = 'Add a photo';
  const blurb = document.createElement('p');
  blurb.textContent = `Share a photo of ${options.item.title} with people on the public link.`;
  sheet.append(heading, blurb);

  const form = document.createElement('form');
  form.className = 'addform__form';
  form.noValidate = true;

  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';
  const grid = document.createElement('div');
  grid.className = 'fgrid';

  // A real button, not the browser's bare "Choose File" box (register I18).
  const pick = document.createElement('div');
  pick.className = 'full safe-photo-pick';
  const flabel = document.createElement('span');
  flabel.className = 'flabel';
  flabel.textContent = 'Photo';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileInput.hidden = true;
  const chooseBtn = document.createElement('button');
  chooseBtn.type = 'button';
  chooseBtn.className = 'btn ghost safe-photo-choose';
  chooseBtn.innerHTML = `${I.camera}Choose photo`;
  chooseBtn.addEventListener('click', () => fileInput.click());
  pick.append(flabel, chooseBtn, fileInput);
  grid.append(pick);
  let picked: File | null = null;
  let previewUrl: string | null = null;

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

  function showPicked(file: File | null): void {
    picked = file;
    pick.querySelector('.safe-photo-picked')?.remove();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    chooseBtn.hidden = Boolean(file);
    if (!file) {
      fileInput.value = '';
      preview.hidden = true;
      preview.removeAttribute('src');
      return;
    }
    const row = document.createElement('div');
    row.className = 'safe-photo-picked';
    const name = document.createElement('span');
    name.className = 'safe-photo-picked__name';
    name.textContent = file.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mini';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => showPicked(null));
    row.append(name, remove);
    pick.append(row);
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.hidden = false;
    errorNote.hidden = true;
  }

  fileInput.addEventListener('change', () => showPicked(fileInput.files?.[0] ?? null));

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
  const idleLabel = `${I.check}Save photo`;
  saveBtn.innerHTML = idleLabel;

  // On mobile data the upload takes seconds; a silent disabled button reads as frozen.
  function setBusy(busy: boolean): void {
    saveBtn.disabled = busy;
    if (busy) {
      saveBtn.textContent = 'Uploading…';
      saveBtn.setAttribute('aria-busy', 'true');
    } else {
      saveBtn.innerHTML = idleLabel;
      saveBtn.removeAttribute('aria-busy');
    }
  }
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
    const file = picked;
    if (!file) {
      errorNote.hidden = false;
      errorNote.textContent = 'Choose a photo to share.';
      return;
    }
    setBusy(true);
    try {
      await options.onConfirm(file);
      host.replaceChildren();
    } catch (err) {
      setBusy(false);
      errorNote.hidden = false;
      errorNote.textContent = safeSaveErrorMessage(err);
      errorNote.scrollIntoView?.({ block: 'nearest' });
    }
  });

  sheet.append(form);
  back.append(sheet);
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  host.append(back);
}
