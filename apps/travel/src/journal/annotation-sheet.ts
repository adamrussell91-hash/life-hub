import type { JournalDocument } from '@/api/journal';
import type { JournalMedia } from '@/journal/types';
import { persistJournalPatch } from '@/journal/journal-sheet-save';
import { configureJournalImage } from '@/journal/media-loading';
import {
  defaultPhotoAnnotationRegion,
  getMediaPhotoAnnotations,
  parsePhotoAnnotationRegion,
  type MediaPhotoAnnotations,
  type PhotoAnnotationRegion,
  upsertMediaPhotoAnnotations,
} from '@/journal/annotations';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';
import { presentJournalOverlay, type JournalOverlayHandle } from '@/journal/overlay-host';

export interface OpenPhotoAnnotationSheetOptions {
  tripId: string;
  journal: JournalDocument;
  version: string;
  media: JournalMedia;
  anchor: HTMLElement;
  onSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
  onClose?: () => void;
}

function cloneRegions(doc: MediaPhotoAnnotations | null): PhotoAnnotationRegion[] {
  if (!doc) return [];
  return doc.regions.map((r) => ({ ...r }));
}

export function openPhotoAnnotationSheet(
  options: OpenPhotoAnnotationSheetOptions,
): { destroy(): void } {
  attachVisualViewportInset();
  let destroyed = false;
  let overlay: JournalOverlayHandle | null = null;
  let regions = cloneRegions(getMediaPhotoAnnotations(options.journal, options.media.id));

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-annotation-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Annotate photo');

  const heading = document.createElement('h3');
  heading.textContent = 'Photo notes';

  const hint = document.createElement('p');
  hint.className = 'journal-sheet__hint';
  hint.textContent =
    'Region notes are stored separately from the original photo. Toggle overlays on the moment to preview.';

  const preview = document.createElement('div');
  preview.className = 'journal-annotation-sheet__preview';
  const img = document.createElement('img');
  img.alt = options.media.caption?.trim() || 'Photo';
  configureJournalImage(img, {
    tripId: options.tripId,
    media: options.media,
    layout: 'single',
    eager: true,
  });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'journal-annotation-sheet__svg');
  svg.setAttribute('aria-hidden', 'true');
  preview.append(img, svg);

  const regionList = document.createElement('div');
  regionList.className = 'journal-annotation-sheet__regions';

  const form = document.createElement('form');
  form.className = 'addform__form compose';
  form.noValidate = true;
  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';
  const actions = document.createElement('div');
  actions.className = 'addform__actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--secondary';
  cancelBtn.textContent = 'Cancel';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn--primary';
  saveBtn.textContent = 'Save';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--secondary journal-annotation-sheet__add';
  addBtn.textContent = 'Add note region';

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    overlay?.release();
    options.onClose?.();
  }

  function paintSvg(): void {
    svg.replaceChildren();
    for (const region of regions) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(region.x * 100));
      rect.setAttribute('y', String(region.y * 100));
      rect.setAttribute('width', String(region.width * 100));
      rect.setAttribute('height', String(region.height * 100));
      rect.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(rect);
    }
  }

  function renderRegionEditors(): void {
    regionList.replaceChildren();
    for (const region of regions) {
      const row = document.createElement('div');
      row.className = 'journal-annotation-sheet__region';
      const label = document.createElement('label');
      label.textContent = 'Note';
      const textarea = document.createElement('textarea');
      textarea.rows = 2;
      textarea.value = region.note;
      textarea.addEventListener('input', () => {
        region.note = textarea.value;
      });
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn--ghost';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        regions = regions.filter((r) => r.id !== region.id);
        renderRegionEditors();
        paintSvg();
      });
      label.append(textarea);
      row.append(label, removeBtn);
      regionList.append(row);
    }
    paintSvg();
  }

  addBtn.addEventListener('click', () => {
    regions = [...regions, defaultPhotoAnnotationRegion()];
    renderRegionEditors();
  });

  cancelBtn.addEventListener('click', destroy);
  const status = document.createElement('p');
  status.className = 'journal-sheet__status';
  status.setAttribute('role', 'alert');
  status.hidden = true;

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    status.hidden = true;
    void (async () => {
      try {
        const cleaned = regions
          .map((r) => parsePhotoAnnotationRegion(r))
          .filter((r): r is PhotoAnnotationRegion => Boolean(r));
        const nextJournal = upsertMediaPhotoAnnotations(options.journal, {
          media_id: options.media.id,
          regions: cleaned,
          revision: 0,
        });
        const saved = await persistJournalPatch(options.tripId, options.version, nextJournal);
        options.onSaved?.(saved);
        destroy();
      } catch {
        saveBtn.disabled = false;
        status.hidden = false;
        status.textContent = 'Could not save notes. Try again.';
      }
    })();
  });

  renderRegionEditors();
  actions.append(cancelBtn, saveBtn);
  scroll.append(heading, hint, preview, addBtn, regionList, status);
  form.append(scroll, actions);
  sheet.append(form);
  back.append(sheet);
  heading.tabIndex = -1;
  overlay = presentJournalOverlay(back, {
    anchor: options.anchor,
    dismiss: destroy,
    initialFocus: heading,
  });
  return { destroy };
}
