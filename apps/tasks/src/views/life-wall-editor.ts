import type { LifeWall } from '@/schemas/life-wall';
import { createHubField, el, labeledField } from '@/views/hub-kit';

export type LifeWallRead = { ok: true; wall: LifeWall | null } | { ok: false; message: string };

/** Life wall toggle. Dates pre-fill from `suggest` when the item already has them. */
export function mountLifeWallEditor(options: {
  title: string;
  wall: LifeWall | null | undefined;
  suggest: () => { starts_on: string; ends_on: string } | null;
  onCommit?: (wall: LifeWall | null) => void;
}): { el: HTMLElement; read: () => LifeWallRead } {
  const wrap = el('div', 'life-wall');
  const toggle = el('label', 'life-wall__toggle');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = Boolean(options.wall);
  box.setAttribute('aria-label', `Life wall for ${options.title}`);
  toggle.append(box, document.createTextNode(' Life wall'));

  const dates = el('div', 'life-wall__dates');
  dates.hidden = !box.checked;
  const start = createHubField({
    type: 'date',
    ariaLabel: `Life wall start for ${options.title}`,
    value: options.wall?.starts_on ?? ''
  });
  const end = createHubField({
    type: 'date',
    ariaLabel: `Life wall end for ${options.title}`,
    value: options.wall?.ends_on ?? ''
  });
  const label = createHubField({
    ariaLabel: `Life wall label for ${options.title}`,
    placeholder: options.title,
    value: options.wall?.label ?? ''
  });
  dates.append(labeledField('Starts', start.el), labeledField('Ends', end.el), labeledField('Label', label.el));
  wrap.append(toggle, dates);

  const read = (): LifeWallRead => {
    if (!box.checked) return { ok: true, wall: null };
    const starts_on = start.input.value;
    const ends_on = end.input.value;
    if (!starts_on || !ends_on) return { ok: false, message: 'Add dates before saving the life wall.' };
    if (ends_on < starts_on) return { ok: false, message: 'Life wall end is before the start.' };
    const text = label.input.value.trim();
    return { ok: true, wall: { starts_on, ends_on, label: text || null } };
  };

  const commit = (): void => {
    if (!options.onCommit) return;
    const next = read();
    if (!next.ok) return;
    options.onCommit(next.wall);
  };

  box.addEventListener('change', () => {
    if (box.checked && !start.input.value && !end.input.value) {
      const suggested = options.suggest();
      if (suggested) {
        start.input.value = suggested.starts_on;
        end.input.value = suggested.ends_on;
      }
    }
    dates.hidden = !box.checked;
    commit();
  });
  for (const input of [start.input, end.input, label.input]) input.addEventListener('change', commit);

  return { el: wrap, read };
}
