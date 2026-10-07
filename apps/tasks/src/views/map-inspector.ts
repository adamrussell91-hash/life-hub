import type { MapColorToken, MapLine, YearTrack } from '@/schemas/map';
import { canonicalLineColor, LINE_COLORS, YEAR_TRACKS, YEAR_TRACK_LABELS, addExtraYearTrack } from '@/domain/maps-layout';
import { discCss, letterCss } from '@/domain/maps-colors';
import { el } from '@/views/hub-kit';

/** Side panel beside the map: what is selected, and the controls to change it. */
export function createMapInspector(options: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  body: HTMLElement[];
}): HTMLElement {
  const root = el('aside', 'map-inspector');
  root.setAttribute('aria-label', `${options.eyebrow}: ${options.title}`);
  root.setAttribute('data-map-inspector', '');
  const head = el('header', 'map-inspector__head');
  const titles = el('div', 'map-inspector__titles');
  titles.append(el('span', 'map-inspector__eyebrow', options.eyebrow), el('h2', 'map-inspector__title', options.title));
  const close = el('button', 'hub-icon-btn map-inspector__close', '×') as HTMLButtonElement;
  close.type = 'button';
  close.setAttribute('aria-label', 'Close panel');
  close.addEventListener('click', options.onClose);
  head.append(titles, close);
  const body = el('div', 'map-inspector__body');
  body.append(...options.body);
  root.append(head, body);
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    event.stopPropagation();
    options.onClose();
  });
  return root;
}

/** A labelled row in the inspector. The label sits above its control at a readable size. */
export function inspectorField(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const wrap = el('div', 'map-inspector__field');
  wrap.append(el('span', 'map-inspector__label', label), control);
  if (hint) wrap.append(el('p', 'map-inspector__hint', hint));
  return wrap;
}

/**
 * Text input that reports every keystroke (`onDraft`, cheap) and the settled value
 * on blur / Enter (`onCommit`). Blank values snap back to the last good one.
 */
export function inspectorText(options: {
  value: string;
  ariaLabel: string;
  maxLength?: number;
  className?: string;
  onDraft?: (value: string) => void;
  onCommit: (value: string) => void;
}): HTMLInputElement {
  const input = el('input', ['map-inspector__input', options.className].filter(Boolean).join(' ')) as HTMLInputElement;
  input.type = 'text';
  input.value = options.value;
  input.setAttribute('aria-label', options.ariaLabel);
  if (options.maxLength) input.maxLength = options.maxLength;
  let last = options.value;
  input.addEventListener('input', () => {
    const next = input.value.trim();
    if (next) options.onDraft?.(next);
  });
  input.addEventListener('change', () => {
    const next = input.value.trim();
    if (!next) {
      input.value = last;
      return;
    }
    last = next;
    options.onCommit(next);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    }
  });
  return input;
}

export function inspectorButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', `btn ${className}`, label) as HTMLButtonElement;
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

export type LineEditorHandlers = {
  /** `settled` is false while typing (save quietly), true when the map should redraw. */
  onChange: (next: MapLine, settled: boolean) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
};

export function buildLineEditor(
  line: MapLine,
  context: { index: number; count: number; itemCount: number },
  handlers: LineEditorHandlers
): HTMLElement[] {
  let draft: MapLine = { ...line };
  const emit = (patch: Partial<MapLine>, settled: boolean) => {
    draft = { ...draft, ...patch };
    handlers.onChange(draft, settled);
  };

  const name = inspectorText({
    value: line.name,
    ariaLabel: 'Line name',
    onDraft: (value) => emit({ name: value }, false),
    onCommit: (value) => emit({ name: value }, true)
  });
  const letter = inspectorText({
    value: line.letter,
    ariaLabel: 'Line letter',
    maxLength: 4,
    className: 'map-inspector__input--short',
    onDraft: (value) => emit({ letter: value.toUpperCase() }, false),
    onCommit: (value) => emit({ letter: value.toUpperCase() }, true)
  });

  const fields: HTMLElement[] = [
    inspectorField('Name', name),
    inspectorField('Letter', letter, 'Shown in the circle at the top of the line.')
  ];

  const fixed = canonicalLineColor(line);
  if (fixed) {
    fields.push(inspectorField('Colour', swatchRow(fixed, null), `The ${line.letter} line always uses this colour.`));
  } else {
    fields.push(inspectorField('Colour', swatchRow(line.color, (color) => emit({ color }, true))));
  }

  fields.push(inspectorField('Year lines', yearLineEditor(line, (patch) => emit(patch, true))));

  const actions = el('div', 'map-inspector__actions');
  const left = inspectorButton('← Move left', 'btn--ghost', () => handlers.onMove(-1));
  left.disabled = context.index <= 0;
  const right = inspectorButton('Move right →', 'btn--ghost', () => handlers.onMove(1));
  right.disabled = context.index >= context.count - 1;
  actions.append(left, right);
  fields.push(actions);

  const danger = el('div', 'map-inspector__actions map-inspector__actions--end');
  const remove = inspectorButton('Delete line', 'btn--ghost map-inspector__danger', handlers.onDelete);
  if (context.itemCount > 0) {
    remove.disabled = true;
    danger.append(remove, el('p', 'map-inspector__hint', 'Move or delete its programs and competitions first.'));
  } else {
    danger.append(remove);
  }
  fields.push(danger);
  return fields;
}

function swatchRow(selected: MapColorToken, onPick: ((color: MapColorToken) => void) | null): HTMLElement {
  const row = el('div', 'map-swatches');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Line colour');
  const colors = onPick ? LINE_COLORS : [selected];
  for (const color of colors) {
    const swatch = el('button', 'map-swatch') as HTMLButtonElement;
    swatch.type = 'button';
    swatch.style.background = discCss(color);
    swatch.style.color = letterCss(color);
    swatch.setAttribute('aria-label', color.replace(/-/g, ' '));
    swatch.setAttribute('aria-pressed', color === selected ? 'true' : 'false');
    swatch.title = color.replace(/-/g, ' ');
    if (onPick) swatch.addEventListener('click', () => onPick(color));
    else swatch.disabled = true;
    row.append(swatch);
  }
  return row;
}

function yearLineEditor(line: MapLine, onChange: (patch: Partial<MapLine>) => void): HTMLElement {
  const root = el('div', 'map-yearlines');
  const standard = new Set<YearTrack>(line.year_tracks?.length ? line.year_tracks : YEAR_TRACKS);
  const extras = [...(line.extra_tracks ?? [])];
  const total = () => standard.size + extras.length;

  const boxes = el('div', 'map-tracks');
  boxes.setAttribute('role', 'group');
  boxes.setAttribute('aria-label', 'Standard year lines');
  for (const id of YEAR_TRACKS) {
    const label = el('label', 'map-tracks__item');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = standard.has(id);
    box.addEventListener('change', () => {
      if (box.checked) standard.add(id);
      else if (total() > 1) standard.delete(id);
      else {
        box.checked = true;
        return;
      }
      onChange({ year_tracks: YEAR_TRACKS.filter((track) => standard.has(track)) });
    });
    label.append(box, document.createTextNode(YEAR_TRACK_LABELS[id]));
    boxes.append(label);
  }
  root.append(boxes);

  for (const [index, track] of extras.entries()) {
    const row = el('div', 'map-yearlines__extra');
    const input = inspectorText({
      value: track.label,
      ariaLabel: `Rename ${track.label} year line`,
      onCommit: (value) => {
        extras[index] = { ...track, label: value };
        onChange({ extra_tracks: [...extras] });
      }
    });
    const remove = inspectorButton('Remove', 'btn--ghost', () => {
      if (total() <= 1) return;
      extras.splice(index, 1);
      onChange({ extra_tracks: [...extras] });
    });
    remove.setAttribute('aria-label', `Remove ${track.label} year line`);
    remove.disabled = total() <= 1;
    row.append(input, remove);
    root.append(row);
  }

  const addRow = el('div', 'map-yearlines__extra');
  const addInput = el('input', 'map-inspector__input') as HTMLInputElement;
  addInput.type = 'text';
  addInput.placeholder = 'Extra year line, e.g. Middle';
  addInput.setAttribute('aria-label', 'New year line name');
  const add = () => {
    const label = addInput.value.trim();
    if (!label) return;
    const next = addExtraYearTrack({ ...line, extra_tracks: extras }, label);
    onChange({ extra_tracks: next.extra_tracks ?? [] });
  };
  addInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }
  });
  addRow.append(addInput, inspectorButton('Add', 'btn--ghost', add));
  root.append(addRow);
  return root;
}
