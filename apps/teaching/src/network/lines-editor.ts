import type { LineAlignment, NetworkLine, NetworkLineMode } from '@/schemas/block';
import { loadAlignment } from '@/alignment/coverage-panel';
import { SKILL_STRANDS } from '@/skills/schema';
import { COLOUR_LABEL, COLOUR_ORDER, lineColour, nextColour } from './colour';
import { MODE_HINT, MODE_LABEL, MODE_ORDER, orderLines, shortName } from './model';

export const MAX_LINES = 24;

let seq = 0;
export function networkId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, textContent?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

export function ghostButton(label: string, onClick: () => void, aria?: string): HTMLButtonElement {
  const b = el('button', 'btn btn--ghost', label);
  b.type = 'button';
  if (aria) b.setAttribute('aria-label', aria);
  b.addEventListener('click', onClick);
  return b;
}

export function selectOf(options: Array<{ value: string; label: string }>, value: string, aria?: string): HTMLSelectElement {
  const select = el('select');
  for (const o of options) {
    const opt = el('option', undefined, o.label);
    opt.value = o.value;
    opt.selected = o.value === value;
    select.append(opt);
  }
  if (aria) select.setAttribute('aria-label', aria);
  return select;
}

export function textInput(value: string, maxLength: number, placeholder = '', aria?: string): HTMLInputElement {
  const input = el('input');
  input.type = 'text';
  input.value = value;
  input.maxLength = maxLength;
  input.placeholder = placeholder;
  if (aria) input.setAttribute('aria-label', aria);
  return input;
}

export type LinesEditorOptions = {
  lines: readonly NetworkLine[];
  /** Saves the subject's whole line list. */
  onSave: (lines: NetworkLine[]) => Promise<void> | void;
  /** Where a line is used, for the confirmation before removing it. */
  usage?: (lineId: string) => string[];
  /** The subject is in the syllabus alignment: each line can say what it stands for there. */
  syllabus?: boolean;
};

const STRAND_LABEL = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** What a line can stand for in the syllabus, by mode: trains a dot-point group, metro a concept, light rail a skills strand. */
function syllabusChoices(mode: NetworkLineMode, concepts: ReadonlyArray<{ key: string; name: string }>): Array<{ value: string; label: string }> {
  const none = { value: '', label: 'Not linked' };
  if (mode === 'train') return [none, { value: 'points:U', label: 'Understanding dot points' }, { value: 'points:R', label: 'Responding dot points' }];
  if (mode === 'metro') return [none, ...concepts.map((c) => ({ value: `concept:${c.key}`, label: c.name }))];
  return [none, ...SKILL_STRANDS.map((s) => ({ value: `strand:${s}`, label: STRAND_LABEL(s) }))];
}

function linkValue(link: LineAlignment | undefined): string {
  if (!link) return '';
  return link.kind === 'points' ? `points:${link.group}` : link.kind === 'concept' ? `concept:${link.key}` : `strand:${link.strand}`;
}

function parseLink(value: string): LineAlignment | undefined {
  const [kind, v] = value.split(':');
  if (kind === 'points' && (v === 'U' || v === 'R')) return { kind, group: v };
  if (kind === 'concept' && v) return { kind, key: v };
  if (kind === 'strand' && (SKILL_STRANDS as readonly string[]).includes(v ?? '')) return { kind, strand: v as (typeof SKILL_STRANDS)[number] };
  return undefined;
}

/**
 * The subject's line list: add, rename, reorder, change mode and colour,
 * remove (asks first when the line is in use). Lines stay grouped by mode,
 * trains first, because that is the order of the map's columns.
 */
export function mountLinesEditor(host: HTMLElement, options: LinesEditorOptions): { update(lines: readonly NetworkLine[]): void } {
  let lines = orderLines(options.lines);
  let concepts: Array<{ key: string; name: string }> = [];
  const root = el('div', 'net-lines');
  const status = el('p', 'net-lines__status');
  status.setAttribute('role', 'status');
  host.append(root);

  const save = async (next: NetworkLine[]) => {
    lines = orderLines(next);
    paint();
    status.textContent = 'Saving…';
    try {
      await options.onSave(lines);
      status.textContent = 'Saved';
    } catch {
      status.textContent = 'Could not save the lines. Try again.';
    }
  };
  const patch = (id: string, change: Partial<NetworkLine>) => save(lines.map((l) => (l.id === id ? { ...l, ...change } : l)));

  function row(line: NetworkLine): HTMLElement {
    const r = el('div', 'net-lines__row');
    r.dataset.lineId = line.id;
    const swatch = el('span', `net-lines__swatch net-lines__swatch--${line.mode}`);
    swatch.style.setProperty('--net-colour', lineColour(line.colour));
    const name = textInput(line.name, 60, 'Line name', `${MODE_LABEL[line.mode]} line name`);
    name.addEventListener('change', () => void patch(line.id, { name: name.value.trim() }));
    const short = textInput(line.short ?? '', 4, shortName(line.name) || 'ABCD', `Badge for ${line.name || 'line'}`);
    short.className = 'net-lines__short';
    short.addEventListener('change', () => void patch(line.id, { short: short.value.trim().toUpperCase() || undefined }));
    const mode = selectOf(MODE_ORDER.map((m) => ({ value: m, label: MODE_LABEL[m] })), line.mode, `Mode of ${line.name || 'line'}`);
    mode.addEventListener('change', () => {
      // A link only fits its own mode (a train's dot points, a metro's concept, light rail's strand).
      const { alignment: _link, ...rest } = line;
      void save(lines.map((l) => (l.id === line.id ? { ...rest, mode: mode.value as NetworkLineMode } : l)));
    });
    const colour = selectOf(COLOUR_ORDER.map((c) => ({ value: c, label: COLOUR_LABEL[c] })), line.colour, `Colour of ${line.name || 'line'}`);
    colour.addEventListener('change', () => void patch(line.id, { colour: colour.value as NetworkLine['colour'] }));
    const same = lines.filter((l) => l.mode === line.mode);
    const at = same.findIndex((l) => l.id === line.id);
    const move = (delta: number) => {
      const other = same[at + delta];
      if (!other) return;
      const next = [...lines];
      const i = next.findIndex((l) => l.id === line.id), j = next.findIndex((l) => l.id === other.id);
      [next[i], next[j]] = [next[j]!, next[i]!];
      void save(next);
    };
    const up = ghostButton('↑', () => move(-1), `Move ${line.name || 'line'} up`);
    up.disabled = at === 0;
    const down = ghostButton('↓', () => move(1), `Move ${line.name || 'line'} down`);
    down.disabled = at === same.length - 1;
    const remove = ghostButton('Remove', () => {
      const used = options.usage?.(line.id) ?? [];
      if (used.length) {
        const list = used.slice(0, 8).join('\n• ');
        const more = used.length > 8 ? `\n…and ${used.length - 8} more` : '';
        if (!window.confirm(`“${line.name || 'This line'}” is used in:\n• ${list}${more}\n\nRemove it anyway? Those stops will no longer show.`)) return;
      }
      void save(lines.filter((l) => l.id !== line.id));
    }, `Remove ${line.name || 'line'}`);
    r.append(swatch, name, short, mode, colour);
    if (options.syllabus) {
      const choices = syllabusChoices(line.mode, concepts);
      const current = linkValue(line.alignment);
      // A concept saved before the list loads still shows.
      if (current && !choices.some((c) => c.value === current)) choices.push({ value: current, label: current.split(':')[1]! });
      const link = selectOf(choices, current, `What ${line.name || 'this line'} stands for in the syllabus`);
      link.className = 'net-lines__syllabus';
      link.title = 'What this line stands for in the syllabus';
      link.addEventListener('change', () => {
        const next = parseLink(link.value);
        void save(lines.map((l) => {
          if (l.id !== line.id) return l;
          const { alignment: _old, ...rest } = l;
          return next ? { ...rest, alignment: next } : rest;
        }));
      });
      r.append(link);
    }
    r.append(up, down, remove);
    return r;
  }

  function paint(): void {
    root.replaceChildren();
    for (const m of MODE_ORDER) {
      const group = el('div', 'net-lines__group');
      group.append(el('h5', 'net-lines__mode', `${MODE_LABEL[m]} · ${MODE_HINT[m]}`));
      const list = lines.filter((l) => l.mode === m);
      if (!list.length) group.append(el('p', 'net-lines__none', 'None yet.'));
      for (const line of list) group.append(row(line));
      const add = ghostButton(`Add ${MODE_LABEL[m].toLowerCase()} line`, () => {
        if (lines.length >= MAX_LINES) return;
        const id = networkId('line');
        void save([...lines, { id, mode: m, name: '', colour: nextColour(lines.map((l) => l.colour)) }]);
        root.querySelector<HTMLInputElement>(`[data-line-id="${id}"] input`)?.focus();
      });
      add.disabled = lines.length >= MAX_LINES;
      group.append(add);
      root.append(group);
    }
    root.append(status);
  }
  paint();
  if (options.syllabus) {
    void loadAlignment()
      .then((doc) => {
        concepts = doc.concepts.map((c) => ({ key: c.key, name: c.name }));
        paint();
      })
      .catch(() => { /* Concepts stay unlisted; trains and light rail still link. */ });
  }
  return {
    update(next) {
      lines = orderLines(next);
      paint();
    }
  };
}
