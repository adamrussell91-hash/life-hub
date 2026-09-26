import type { LifeWall } from '@/schemas/life-wall';
import { createHubField, el, labeledField } from '@/views/hub-kit';
import { createSaveToggle } from '../../design-kit/js/hub-surfaces.js';

export type LifeWallRead = { ok: true; wall: LifeWall | null } | { ok: false; message: string };

/** Life Wall toggle via kit save-toggle (not a bare checkbox). */
export function mountLifeWallEditor(options: {
  title: string;
  wall: LifeWall | null | undefined;
  suggest: () => { starts_on: string; ends_on: string } | null;
  onCommit?: (wall: LifeWall | null) => void;
}): { el: HTMLElement; read: () => LifeWallRead } {
  const wrap = el('div', 'life-wall');
  let enabled = Boolean(options.wall);

  const dates = el('div', 'life-wall__dates');
  dates.hidden = !enabled;
  const start = createHubField({
    type: 'date',
    ariaLabel: `Life Wall start for ${options.title}`,
    value: options.wall?.starts_on ?? ''
  });
  const end = createHubField({
    type: 'date',
    ariaLabel: `Life Wall end for ${options.title}`,
    value: options.wall?.ends_on ?? ''
  });
  const label = createHubField({
    ariaLabel: `Life Wall label for ${options.title}`,
    placeholder: options.title,
    value: options.wall?.label ?? ''
  });
  dates.append(labeledField('Starts', start.el), labeledField('Ends', end.el), labeledField('Label', label.el));

  const read = (): LifeWallRead => {
    if (!enabled) return { ok: true, wall: null };
    const starts_on = start.input.value;
    const ends_on = end.input.value;
    if (!starts_on || !ends_on) return { ok: false, message: 'Add dates before saving the Life Wall.' };
    if (ends_on < starts_on) return { ok: false, message: 'Life Wall end is before the start.' };
    const text = label.input.value.trim();
    return { ok: true, wall: { starts_on, ends_on, label: text || null } };
  };

  const commit = (): void => {
    if (!options.onCommit) return;
    const next = read();
    if (!next.ok) return;
    options.onCommit(next.wall);
  };

  const toggle = createSaveToggle({
    root: document,
    label: 'Life Wall off',
    savedLabel: 'Life Wall on',
    saved: enabled,
    onToggle: (saved: boolean) => {
      enabled = saved;
      if (enabled && !start.input.value && !end.input.value) {
        const suggested = options.suggest();
        if (suggested) {
          start.input.value = suggested.starts_on;
          end.input.value = suggested.ends_on;
        }
      }
      dates.hidden = !enabled;
      commit();
    }
  });
  toggle.el.setAttribute('aria-label', `Life Wall for ${options.title}`);
  wrap.append(toggle.el, dates);

  for (const input of [start.input, end.input, label.input]) input.addEventListener('change', commit);

  return { el: wrap, read };
}
