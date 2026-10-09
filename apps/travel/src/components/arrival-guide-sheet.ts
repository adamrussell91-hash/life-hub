import type { City, GuideIcon, Trip } from '@/types';
import { patchTrip } from '@/api/travel';

export interface ArrivalGuideSheetOptions {
  trip: Trip;
  tripId: string;
  version: string;
  city: City;
  onSaved: (trip: Trip, version: string) => void;
  onClose: () => void;
}

const ICONS: { value: GuideIcon; label: string }[] = [
  { value: 'phone', label: 'Phone' },
  { value: 'transport', label: 'Getting around' },
  { value: 'money', label: 'Money' },
  { value: 'weather', label: 'Outside' },
  { value: 'paperwork', label: 'Paperwork' }
];

/** Edit Soft Landing tips for a city (R4). */
export function renderArrivalGuideSheet(host: HTMLElement, options: ArrivalGuideSheetOptions): void {
  const { city } = options;
  const guide = city.arrival_guide;

  host.replaceChildren();
  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const heading = document.createElement('h3');
  heading.textContent = `Soft landing · ${city.name}`;
  const blurb = document.createElement('p');
  blurb.textContent = 'Tips shown on arrival days. Fix anything that’s wrong.';
  sheet.append(heading, blurb);

  const form = document.createElement('form');
  form.className = 'addform__form';
  form.noValidate = true;
  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';
  const grid = document.createElement('div');
  grid.className = 'fgrid';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = guide?.title ?? `Landing in ${city.name}`;
  titleInput.required = true;
  titleInput.autocomplete = 'off';
  grid.append(field('Title', titleInput, true));

  const rowsHost = document.createElement('div');
  rowsHost.className = 'full guide-rows';
  grid.append(rowsHost);

  type RowDraft = { icon: GuideIcon; label: string; detail: string };
  const rows: RowDraft[] = (guide?.rows?.length ? guide.rows : defaultRows()).map((r) => {
    const parts = splitGuideText(r.text);
    return { icon: r.icon, label: parts.label, detail: parts.detail };
  });

  function paintRows(): void {
    rowsHost.replaceChildren();
    rows.forEach((row, index) => {
      const block = document.createElement('div');
      block.className = 'guide-row';

      const iconSelect = document.createElement('select');
      for (const opt of ICONS) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === row.icon) o.selected = true;
        iconSelect.append(o);
      }
      iconSelect.addEventListener('change', () => {
        row.icon = iconSelect.value as GuideIcon;
      });

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.value = row.label;
      labelInput.placeholder = 'Label';
      labelInput.autocomplete = 'off';
      labelInput.addEventListener('input', () => {
        row.label = labelInput.value;
      });

      const detailInput = document.createElement('textarea');
      detailInput.rows = 3;
      detailInput.value = row.detail;
      detailInput.placeholder = 'Tip for landing day';
      detailInput.addEventListener('input', () => {
        row.detail = detailInput.value;
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'mini';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        rows.splice(index, 1);
        paintRows();
      });

      block.append(
        field('Icon', iconSelect),
        field('Label', labelInput),
        field('Tip', detailInput, true),
        removeBtn
      );
      rowsHost.append(block);
    });
  }
  paintRows();

  const addRowBtn = document.createElement('button');
  addRowBtn.type = 'button';
  addRowBtn.className = 'btn ghost full';
  addRowBtn.textContent = 'Add tip';
  addRowBtn.addEventListener('click', () => {
    rows.push({ icon: 'phone', label: '', detail: '' });
    paintRows();
  });
  grid.append(addRowBtn);
  scroll.append(grid);

  const errorNote = document.createElement('p');
  errorNote.className = 'hint';
  errorNote.hidden = true;
  errorNote.setAttribute('role', 'alert');
  scroll.append(errorNote);
  form.append(scroll);

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
  saveBtn.textContent = 'Save tips';
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
    const title = titleInput.value.trim();
    if (!title) {
      errorNote.hidden = false;
      errorNote.textContent = 'Add a title.';
      return;
    }
    const nextRows = rows
      .map((r) => ({
        icon: r.icon,
        text: joinGuideText(r.label, r.detail)
      }))
      .filter((r) => r.text.trim());
    if (nextRows.length === 0) {
      errorNote.hidden = false;
      errorNote.textContent = 'Add at least one tip, or Cancel.';
      return;
    }
    saveBtn.disabled = true;
    try {
      const cities = options.trip.cities.map((c) =>
        c.id === city.id ? { ...c, arrival_guide: { title, rows: nextRows } } : c
      );
      const saved = await patchTrip(options.tripId, options.version, { cities });
      options.onSaved(saved.trip, saved.version);
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
  titleInput.focus();
}

function defaultRows(): { icon: GuideIcon; text: string }[] {
  return [
    { icon: 'phone', text: '' },
    { icon: 'transport', text: '' },
    { icon: 'money', text: '' }
  ];
}

export function splitGuideText(html: string): { label: string; detail: string } {
  const m = String(html || '').match(/^<b>(.*?)<\/b>\s*(.*)$/is);
  if (m) {
    return {
      label: decodeEntities(m[1]!).replace(/\.$/, '').trim(),
      detail: decodeEntities(m[2]!).trim()
    };
  }
  return { label: '', detail: decodeEntities(String(html || '').replace(/<[^>]+>/g, '')).trim() };
}

export function joinGuideText(label: string, detail: string): string {
  const l = label.trim();
  const d = detail.trim();
  if (l && d) return `<b>${escapeHtml(l)}.</b> ${escapeHtml(d)}`;
  if (l) return `<b>${escapeHtml(l)}.</b>`;
  return escapeHtml(d);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

function field(labelText: string, control: HTMLElement, full = false): HTMLElement {
  const wrap = document.createElement('label');
  if (full) wrap.classList.add('full');
  const label = document.createElement('span');
  label.className = 'flabel';
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}
