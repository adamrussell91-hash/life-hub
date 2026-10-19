import type { CurriculumLinesBlock } from '@/schemas/block';
import { COLOUR_LABEL, COLOUR_ORDER, LEVEL_WORD, nextColour, strandColour, type LinesContent, type LinesLesson, type LinesLevel } from './model';
import { renderCurriculumLines } from './render';

type Station = LinesContent['stations'][number];
type Checkpoint = LinesContent['checkpoints'][number];

const LEVELS: LinesLevel[] = ['introduced', 'reinforced', 'mastered'];
const LEVEL_LETTER: Record<LinesLevel, string> = { introduced: 'I', reinforced: 'R', mastered: 'M' };
const TEXT_ONLY = '';

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, textContent?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

/** A <label> for one input; a named group for a set of buttons or checkboxes (a label would forward their clicks). */
function field(label: string, control: HTMLElement, grow = false): HTMLElement {
  const single = control instanceof HTMLInputElement || control instanceof HTMLSelectElement;
  const wrap = el(single ? 'label' : 'div', `cl-editor__field${grow ? ' cl-editor__field--grow' : ''}`);
  if (!single) {
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', label);
  }
  wrap.append(el('span', undefined, label), control);
  return wrap;
}

function textInput(value: string, maxLength: number, placeholder = ''): HTMLInputElement {
  const input = el('input');
  input.type = 'text';
  input.value = value;
  input.maxLength = maxLength;
  input.placeholder = placeholder;
  return input;
}

function button(label: string, onClick: () => void, aria?: string): HTMLButtonElement {
  const b = el('button', 'btn btn--ghost', label);
  b.type = 'button';
  if (aria) b.setAttribute('aria-label', aria);
  b.addEventListener('click', onClick);
  return b;
}

function selectOf(options: Array<{ value: string; label: string }>, value: string): HTMLSelectElement {
  const select = el('select');
  for (const o of options) {
    const opt = el('option', undefined, o.label);
    opt.value = o.value;
    opt.selected = o.value === value;
    select.append(opt);
  }
  return select;
}

function lessonSelect(lessons: readonly LinesLesson[], value: string | undefined): HTMLSelectElement {
  const options = [{ value: TEXT_ONLY, label: 'Text label (no link)' }, ...lessons.map((l) => ({ value: l.id, label: l.title || 'Untitled lesson' }))];
  if (value && !lessons.some((l) => l.id === value)) options.push({ value, label: 'A lesson no longer in this unit' });
  return selectOf(options, value ?? TEXT_ONLY);
}

/**
 * Grid editor: strands are rows, weeks are columns. A cell is one station
 * (level plus a lesson link or a text label). The live map sits underneath.
 */
export function createCurriculumLinesEditor(
  block: CurriculumLinesBlock,
  onChange: (block: CurriculumLinesBlock) => void,
  lessons: readonly LinesLesson[] = []
): HTMLElement {
  let current = block;
  let selected: { strandId: string; week: number } | null = null;
  const root = el('div', 'cl-editor');

  const content = () => current.content;
  const commit = (next: Partial<LinesContent>, repaint = true) => {
    current = { ...current, content: { ...current.content, ...next } };
    onChange(current);
    if (repaint) paint();
    else paintPreview();
  };

  const preview = el('div', 'cl-editor__preview');
  const paintPreview = () => preview.replaceChildren(renderCurriculumLines(current, 'teacher', { unitLessons: [...lessons] }));

  function settings(): HTMLElement {
    const row = el('div', 'cl-editor__row');
    const title = textInput(content().title ?? '', 120, 'e.g. Texts and Human Experiences');
    title.addEventListener('input', () => commit({ title: title.value || undefined }, false));
    const weeks = el('input');
    weeks.type = 'number';
    weeks.min = '1';
    weeks.max = '20';
    weeks.value = String(content().weeks);
    weeks.addEventListener('change', () => {
      const n = Math.min(20, Math.max(1, Math.round(Number(weeks.value) || 1)));
      commit({ weeks: n });
    });
    row.append(field('Title (optional)', title, true), field('Teaching weeks', weeks));
    return row;
  }

  function strandsSection(): HTMLElement {
    const section = el('div', 'cl-editor__section');
    section.append(el('h4', 'cl-editor__heading', 'Strands'), el('p', 'cl-editor__hint', 'One line per strand of learning, in the colours of the transit map.'));
    const strands = content().strands;
    strands.forEach((strand, i) => {
      const row = el('div', 'cl-editor__strand');
      const swatch = el('span', 'cl-editor__swatch');
      swatch.style.background = strandColour(strand.colour);
      const name = textInput(strand.name, 60, 'Strand name');
      name.setAttribute('aria-label', `Strand ${i + 1} name`);
      name.addEventListener('input', () => {
        commit({ strands: content().strands.map((s) => (s.id === strand.id ? { ...s, name: name.value } : s)) }, false);
        grid.replaceWith((grid = gridSection()));
      });
      const colour = selectOf(COLOUR_ORDER.map((c) => ({ value: c, label: COLOUR_LABEL[c] })), strand.colour);
      colour.setAttribute('aria-label', `Strand ${i + 1} colour`);
      colour.addEventListener('change', () =>
        commit({ strands: content().strands.map((s) => (s.id === strand.id ? { ...s, colour: colour.value as typeof s.colour } : s)) }));
      const move = (delta: number) => {
        const list = [...content().strands];
        const j = i + delta;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j]!, list[i]!];
        commit({ strands: list });
      };
      const up = button('↑', () => move(-1), `Move ${strand.name || 'strand'} up`);
      up.disabled = i === 0;
      const down = button('↓', () => move(1), `Move ${strand.name || 'strand'} down`);
      down.disabled = i === strands.length - 1;
      const remove = button('Remove', () => {
        if (content().strands.length <= 1) return;
        commit({
          strands: content().strands.filter((s) => s.id !== strand.id),
          stations: content().stations.filter((st) => st.strand_id !== strand.id),
          checkpoints: content().checkpoints
            .map((cp) => ({ ...cp, strand_ids: cp.strand_ids.filter((id) => id !== strand.id) }))
            .filter((cp) => cp.strand_ids.length > 0)
        });
      }, `Remove ${strand.name || 'strand'}`);
      remove.disabled = strands.length <= 1;
      row.append(swatch, name, colour, up, down, remove);
      section.append(row);
    });
    const add = button('Add strand', () => {
      const list = content().strands;
      if (list.length >= 8) return;
      commit({ strands: [...list, { id: uid('strand'), name: '', colour: nextColour(list.map((s) => s.colour)) }] });
    });
    add.disabled = strands.length >= 8;
    section.append(add);
    return section;
  }

  function stationAt(strandId: string, week: number): Station | undefined {
    return content().stations.find((st) => st.strand_id === strandId && st.week === week);
  }

  function cellText(st: Station): string {
    if (st.lesson_id) return st.label || lessons.find((l) => l.id === st.lesson_id)?.title || 'Lesson';
    return st.label || 'Untitled';
  }

  function gridSection(): HTMLElement {
    const section = el('div', 'cl-editor__section');
    section.append(el('h4', 'cl-editor__heading', 'Map'), el('p', 'cl-editor__hint', 'Pick a cell to set its depth and its lesson or label. Strands that link the same lesson in the same week join into an interchange.'));
    const wrap = el('div', 'cl-editor__grid-wrap');
    const table = el('table', 'cl-editor__grid');
    const head = el('tr');
    head.append(el('th', undefined, 'Strand'));
    for (let w = 1; w <= content().weeks; w++) head.append(el('th', undefined, `Wk ${w}`));
    table.append(head);
    for (const strand of content().strands) {
      const row = el('tr');
      row.style.setProperty('--cl-colour', strandColour(strand.colour));
      row.append(el('th', undefined, strand.name || 'Untitled strand'));
      for (let w = 1; w <= content().weeks; w++) {
        const st = stationAt(strand.id, w);
        const td = el('td');
        const cell = el('button', `cl-editor__cell${st ? '' : ' cl-editor__cell--empty'}`);
        cell.type = 'button';
        cell.setAttribute('aria-pressed', String(selected?.strandId === strand.id && selected.week === w));
        cell.setAttribute('aria-label', `${strand.name || 'Strand'}, week ${w}${st ? `, ${LEVEL_WORD[st.level]}: ${cellText(st)}` : ', empty'}`);
        if (st) {
          cell.append(el('span', 'cl-editor__cell-level', LEVEL_LETTER[st.level]), el('span', 'cl-editor__cell-text', cellText(st)));
        } else {
          cell.append(el('span', undefined, '+'));
        }
        cell.addEventListener('click', () => {
          selected = selected?.strandId === strand.id && selected.week === w ? null : { strandId: strand.id, week: w };
          paint();
        });
        td.append(cell);
        row.append(td);
      }
      table.append(row);
    }
    wrap.append(table);
    section.append(wrap);
    if (selected) section.append(cellPanel(selected.strandId, selected.week));
    return section;
  }

  function cellPanel(strandId: string, week: number): HTMLElement {
    const panel = el('div', 'cl-editor__panel');
    const strand = content().strands.find((s) => s.id === strandId);
    const st = stationAt(strandId, week);
    panel.append(el('h4', 'cl-editor__heading', `${strand?.name || 'Strand'} · week ${week}`));

    const setStation = (patch: Partial<Station> | null) => {
      const others = content().stations.filter((s) => !(s.strand_id === strandId && s.week === week));
      if (!patch) return commit({ stations: others });
      const base: Station = st ?? { id: uid('station'), strand_id: strandId, week, level: 'reinforced', label: '' };
      commit({ stations: [...others, { ...base, ...patch }] });
    };

    const levels = el('div', 'cl-editor__levels');
    const none = button('Empty', () => setStation(null));
    none.setAttribute('aria-pressed', String(!st));
    levels.append(none);
    for (const level of LEVELS) {
      const b = button(`${LEVEL_LETTER[level]} · ${LEVEL_WORD[level]}`, () => setStation({ level }));
      b.setAttribute('aria-pressed', String(st?.level === level));
      if (st?.level === level) b.className = 'btn btn--secondary';
      levels.append(b);
    }
    panel.append(field('Depth', levels));

    const row = el('div', 'cl-editor__row');
    const lesson = lessonSelect(lessons, st?.lesson_id);
    const label = textInput(st?.label ?? '', 120, st?.lesson_id ? 'Uses the lesson title' : 'e.g. Thesis workshop');
    lesson.addEventListener('change', () => {
      const id = lesson.value || undefined;
      setStation({ lesson_id: id, label: label.value });
    });
    label.addEventListener('input', () => {
      const others = content().stations.filter((s) => !(s.strand_id === strandId && s.week === week));
      const base: Station = stationAt(strandId, week) ?? { id: uid('station'), strand_id: strandId, week, level: 'reinforced', label: '' };
      current = { ...current, content: { ...current.content, stations: [...others, { ...base, label: label.value }] } };
      onChange(current);
      paintPreview();
    });
    row.append(field('Lesson', lesson, true), field(st?.lesson_id ? 'Short label (optional)' : 'Label', label, true));
    panel.append(row);
    if (!lessons.length) panel.append(el('p', 'cl-editor__hint', 'Add lessons to this unit to link stations to them.'));
    return panel;
  }

  function checkpointsSection(): HTMLElement {
    const section = el('div', 'cl-editor__section');
    section.append(el('h4', 'cl-editor__heading', 'Checkpoints'), el('p', 'cl-editor__hint', 'Interchanges you add by hand, such as a formative task that joins several strands.'));
    const update = (id: string, patch: Partial<Checkpoint>, repaint = true) =>
      commit({ checkpoints: content().checkpoints.map((cp) => (cp.id === id ? { ...cp, ...patch } : cp)) }, repaint);
    for (const cp of content().checkpoints) {
      const row = el('div', 'cl-editor__checkpoint');
      const week = selectOf(Array.from({ length: content().weeks }, (_, i) => ({ value: String(i + 1), label: `Week ${i + 1}` })), String(cp.week));
      week.addEventListener('change', () => update(cp.id, { week: Number(week.value) }));
      const label = textInput(cp.label, 80, 'e.g. Timed check');
      label.addEventListener('input', () => update(cp.id, { label: label.value }, false));
      const lesson = lessonSelect(lessons, cp.lesson_id);
      lesson.addEventListener('change', () => update(cp.id, { lesson_id: lesson.value || undefined }));
      const checks = el('div', 'cl-editor__checks');
      for (const strand of content().strands) {
        const box = el('label');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = cp.strand_ids.includes(strand.id);
        input.addEventListener('change', () => {
          const ids = content().strands.map((s) => s.id).filter((id) => (id === strand.id ? input.checked : cp.strand_ids.includes(id)));
          if (ids.length) update(cp.id, { strand_ids: ids });
          else input.checked = true;
        });
        box.append(input, document.createTextNode(` ${strand.name || 'Untitled strand'}`));
        checks.append(box);
      }
      const remove = button('Remove', () => commit({ checkpoints: content().checkpoints.filter((c) => c.id !== cp.id) }), `Remove checkpoint ${cp.label}`);
      row.append(field('Week', week), field('Label', label, true), field('Lesson', lesson, true), field('Strands', checks, true), remove);
      section.append(row);
    }
    const add = button('Add checkpoint', () => {
      const strands = content().strands;
      commit({ checkpoints: [...content().checkpoints, { id: uid('checkpoint'), week: 1, label: '', strand_ids: strands.slice(0, 2).map((s) => s.id) }] });
    });
    add.disabled = content().checkpoints.length >= 20;
    section.append(add);
    return section;
  }

  function terminusSection(): HTMLElement {
    const section = el('div', 'cl-editor__section');
    section.append(el('h4', 'cl-editor__heading', 'Terminus'), el('p', 'cl-editor__hint', 'The assessment every line runs into.'));
    const t = content().terminus;
    const set = (patch: Partial<LinesContent['terminus']>, repaint = false) => commit({ terminus: { ...content().terminus, ...patch } }, repaint);
    const label = textInput(t.label, 80, 'Assessment task');
    label.addEventListener('input', () => set({ label: label.value }));
    const detail = textInput(t.detail ?? '', 160, 'e.g. Extended response · short answers');
    detail.addEventListener('input', () => set({ detail: detail.value || undefined }));
    const when = textInput(t.when ?? '', 24, 'Task');
    when.addEventListener('input', () => set({ when: when.value || undefined }));
    const lesson = lessonSelect(lessons, t.lesson_id);
    lesson.addEventListener('change', () => set({ lesson_id: lesson.value || undefined }, true));
    const row = el('div', 'cl-editor__row');
    row.append(field('Label', label, true), field('Detail', detail, true), field('When', when), field('Lesson', lesson, true));
    section.append(row);
    return section;
  }

  let grid = gridSection();
  function paint(): void {
    grid = gridSection();
    root.replaceChildren(settings(), strandsSection(), grid, checkpointsSection(), terminusSection(), preview);
    paintPreview();
  }
  paint();
  return root;
}
