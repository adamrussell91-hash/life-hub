import {
  isCurriculumLinesV2,
  type CurriculumGate,
  type CurriculumLinesBlock,
  type CurriculumLinesV2Content,
  type CurriculumRailStop,
  type LineStop,
  type NetworkLine
} from '@/schemas/block';
import type { UnitNetworkContext } from '@/blocks/render';
import { lineColour } from '@/network/colour';
import { drawNetwork, measureStations, networkLegend } from '@/network/draw';
import { chooseNetworkOrientation, layoutNetwork, liveNudges } from '@/network/layout';
import { el, ghostButton, mountLinesEditor, networkId, selectOf, textInput } from '@/network/lines-editor';
import { MODE_LABEL, convertV1, orderLines, orderStations, placeByDate, withAutoDepths, type NetLesson } from '@/network/model';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { unitNetworkInput } from './render';
import { loadAlignment } from '@/alignment/coverage-panel';
import { focusAreaFor } from '@/alignment/coverage';
import { toggleLineStop } from '@/alignment/auto-lines';

/** What the unit page gives the editor: the network, plus how to save the parts that live elsewhere. */
export type UnitNetworkEditorContext = UnitNetworkContext & {
  saveLines?: (lines: NetworkLine[]) => Promise<void>;
  saveLessonStops?: (lessonId: string, stops: LineStop[], off: string[]) => Promise<void>;
  /** The blocks of one lesson, for stops that point at an activity. */
  lessonBlocks?: (lessonId: string) => Promise<Array<{ id: string; label: string }>>;
};

type Kind = CurriculumRailStop['kind'];
const KIND_LABEL: Record<Kind, string> = { stop: 'Stop', extension: 'Extension (optional spur)', support: 'Optional detour (fork)' };
const LEVEL_LETTER = { introduced: 'I', reinforced: 'R', mastered: 'M' } as const;
const BEFORE_FIRST = '';

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

function section(heading: string, hint?: string): HTMLElement {
  const s = el('div', 'cl-editor__section');
  s.append(el('h4', 'cl-editor__heading', heading));
  if (hint) s.append(el('p', 'cl-editor__hint', hint));
  return s;
}

/**
 * Unit map editor. Lines belong to the subject and stops to each lesson, so
 * this edits them where they live (through the context's save functions); the
 * block itself keeps light-rail stops, gates, nudges and the terminus. Drag a
 * station, stop or gate on the preview to nudge it.
 */
export function createCurriculumLinesEditor(
  block: CurriculumLinesBlock,
  onChange: (block: CurriculumLinesBlock) => void,
  context: UnitNetworkEditorContext | undefined = undefined
): HTMLElement {
  let current = block;
  let lines: NetworkLine[] = orderLines(context?.lines ?? []);
  let lessons: NetLesson[] = [...(context?.lessons ?? [])];
  const root = el('div', 'cl-editor');
  const blockCache = new Map<string, Promise<Array<{ id: string; label: string }>>>();

  const dates = context?.dates;
  const network = (): UnitNetworkContext => ({
    lines,
    lessons,
    ...(context?.bands ? { bands: context.bands } : {}),
    ...(dates ? { dates } : {})
  });
  const v2 = (): CurriculumLinesV2Content => current.content as CurriculumLinesV2Content;
  /** The unit's lessons in this map's station order, shown or not. */
  const mapLessons = (): NetLesson[] =>
    placeByDate(orderStations(lessons, isCurriculumLinesV2(current.content) ? v2().station_order : undefined), dates);
  const emit = (content: CurriculumLinesBlock['content']) => {
    current = { ...current, content };
    onChange(current);
  };
  const commit = (patch: Partial<CurriculumLinesV2Content>, repaint = true) => {
    emit({ ...v2(), ...patch });
    if (repaint) paint();
    else paintPreview();
  };

  /* Preview, with drag to nudge. */
  const preview = el('div', 'cl-editor__preview');
  function paintPreview(): void {
    const input = unitNetworkInput(current, { network: network() });
    const width = Math.max(320, Math.floor(root.getBoundingClientRect().width) || 900);
    const measure = measureStations(input);
    const orientation = chooseNetworkOrientation(width, input, { measure });
    const editable = isCurriculumLinesV2(current.content);
    const layout = layoutNetwork(input, orientation, { width, measure });
    const svg = drawNetwork(layout, {
      label: 'Unit curriculum map preview',
      ...(editable ? {
        nudgeRows: true,
        onNudge: (key: string, across: number, along: number) => {
          const was = v2().nudges[key] ?? { dx: 0, dy: 0 };
          const ids = [...v2().rail_stops.map((s) => s.id), ...v2().gates.map((g) => g.id), ...input.rows.map((r) => r.id)];
          commit({ nudges: liveNudges({ ...v2().nudges, [key]: { dx: was.dx + across, dy: was.dy + along } }, ids) }, false);
        }
      } : {})
    });
    const frame = el('div', orientation === 'vertical' && layout.width <= width ? 'cl-editor__map' : 'cl-editor__map net-scroll');
    frame.append(svg);
    const tools = el('div', 'cl-editor__row');
    if (editable) {
      tools.append(el('span', 'cl-editor__hint', 'Drag a station, stop or gate on the map to tidy it.'));
      const reset = ghostButton('Reset positions', () => commit({ nudges: {} }, false));
      reset.disabled = !Object.keys(v2().nudges).length;
      tools.append(reset);
    }
    // Splits come from each lesson's Before and after; anything the map had to set aside is listed here.
    const issues = el('ul', 'cl-editor__issues');
    for (const problem of input.flowProblems ?? []) issues.append(el('li', undefined, problem.message));
    const flowNote = (input.flowProblems ?? []).length
      ? [el('p', 'cl-editor__hint', 'Fix these in Before and after at the foot of each lesson:'), issues]
      : [el('p', 'cl-editor__hint', 'Splits come from Before and after at the foot of each lesson: a lesson with more than one lesson after it is a choice.')];
    preview.replaceChildren(el('h4', 'cl-editor__heading', 'Map'), tools, frame, ...flowNote, networkLegend('unit'));
  }

  /* Version 1: one step converts and saves. */
  function upgradeBar(): HTMLElement {
    const bar = el('div', 'cl-editor__upgrade');
    bar.append(el('p', undefined, 'This map uses the old strands and weeks. Upgrade it to the network: strands become the subject’s lines and stations become stops on their lessons.'));
    const go = el('button', 'btn btn--primary', 'Upgrade this map');
    go.type = 'button';
    const status = el('span', 'cl-editor__hint');
    status.setAttribute('role', 'status');
    go.addEventListener('click', async () => {
      if (isCurriculumLinesV2(current.content)) return;
      if (!context?.saveLines || !context.saveLessonStops) {
        status.textContent = 'Open this unit from the Teaching hub to upgrade it.';
        return;
      }
      go.disabled = true;
      status.textContent = 'Upgrading…';
      const out = convertV1(current.content, lines, lessons, current.id);
      try {
        if (out.added.length) await context.saveLines(out.lines);
        for (const [lessonId, stops] of out.lessonStops) {
          await context.saveLessonStops(lessonId, stops, [...(lessons.find((l) => l.id === lessonId)?.line_off ?? [])]);
        }
      } catch {
        go.disabled = false;
        status.textContent = 'Could not upgrade. Try again; the map itself has not changed.';
        return;
      }
      lines = orderLines(out.lines);
      lessons = lessons.map((l) => (out.lessonStops.has(l.id) ? { ...l, line_stops: out.lessonStops.get(l.id) } : l));
      emit(out.content);
      paint();
    });
    bar.append(go, status);
    return bar;
  }

  function titleRow(): HTMLElement {
    const row = el('div', 'cl-editor__row');
    const title = textInput(current.content.title ?? '', 120, 'e.g. Texts and Human Experiences');
    title.addEventListener('input', () => {
      emit({ ...current.content, title: title.value || undefined });
      paintPreview();
    });
    row.append(field('Title (optional)', title, true));
    return row;
  }

  /* Lines: the subject's, edited in place. */
  function lineChips(): HTMLElement {
    const chips = el('div', 'cl-editor__chips');
    for (const line of lines) {
      const chip = el('span', `cl-editor__chip cl-editor__chip--${line.mode}`, line.name || 'Untitled line');
      chip.style.setProperty('--net-colour', lineColour(line.colour));
      chips.append(chip);
    }
    if (!lines.length) chips.append(el('span', 'cl-editor__hint', 'No lines yet.'));
    return chips;
  }

  function linesSection(): HTMLElement {
    const s = section('Lines', 'Lines belong to the subject, so every unit map and the year network share them. Trains are syllabus groupings, metro lines are concepts, light rail is skills.');
    let chips = lineChips();
    s.append(chips);
    if (context?.saveLines) {
      const host = el('div', 'cl-editor__lines');
      host.hidden = true;
      const toggle = ghostButton(lines.length ? 'Edit lines' : 'Add lines', () => {
        host.hidden = !host.hidden;
        toggle.setAttribute('aria-expanded', String(!host.hidden));
      });
      toggle.setAttribute('aria-expanded', 'false');
      mountLinesEditor(host, {
        lines,
        syllabus: context.usesAlignment === true,
        onSave: async (next) => {
          await context.saveLines!(next);
          lines = orderLines(next);
          const fresh = lineChips();
          chips.replaceWith(fresh);
          chips = fresh;
          paintStops();
          paintPreview();
        },
        usage: (lineId) => [
          ...lessons.filter((l) => l.line_stops?.some((x) => x.line_id === lineId)).map((l) => l.title || 'Untitled lesson'),
          ...v2().rail_stops.filter((r) => r.line_id === lineId).map((r) => `Stop on this map: ${r.label || 'untitled'}`)
        ]
      });
      s.append(toggle, host);
    }
    return s;
  }

  /* Which lines each lesson serves (saved on the lesson). */
  function stopsSection(): HTMLElement {
    const s = section('Stations', `Each lesson is a station.${dates?.size ? ' A lesson with a class date sits in date order: change its date in the calendar to move it. Move the others up or down to place them,' : ' Move it up or down to change its place on this map,'} or untick it to leave it off. Tap a line to say the lesson serves it; tap again to step the depth (introduced, reinforced, mastered), then off. The lesson’s settings show the same line chips. Stops set from a lesson’s dot points come and go with them.`);
    if (!lessons.length) {
      s.append(el('p', 'cl-editor__hint', 'Add lessons to this unit first.'));
      return s;
    }
    if (!lines.length) {
      s.append(el('p', 'cl-editor__hint', 'Add lines first.'));
      return s;
    }
    const wrap = el('div', 'cl-editor__grid-wrap');
    const table = el('table', 'cl-editor__grid');
    const head = el('tr');
    head.append(el('th', 'cl-editor__place', 'On map'), el('th', undefined, 'Lesson'));
    for (const line of lines) {
      const th = el('th', `cl-editor__col cl-editor__col--${line.mode}`, line.short?.trim() || line.name.slice(0, 4) || '?');
      th.title = `${MODE_LABEL[line.mode]}: ${line.name}`;
      th.style.setProperty('--net-colour', lineColour(line.colour));
      head.append(th);
    }
    table.append(head);
    const ordered = mapLessons();
    const hidden = new Set(v2().hidden_lessons ?? []);
    // Auto stops show the depth the map gives them.
    const shownStops = new Map(withAutoDepths(ordered.filter((l) => !hidden.has(l.id))).map((l) => [l.id, l.line_stops]));
    ordered.forEach((lesson, index) => {
      const name = lesson.title || 'Untitled lesson';
      const tr = el('tr', hidden.has(lesson.id) ? 'cl-editor__station--off' : undefined);
      const place = el('td', 'cl-editor__place');
      const shown = el('input');
      shown.type = 'checkbox';
      shown.checked = !hidden.has(lesson.id);
      shown.setAttribute('aria-label', `Show ${name} on this map`);
      shown.addEventListener('change', () => {
        const next = ordered.map((l) => l.id).filter((id) => (id === lesson.id ? !shown.checked : hidden.has(id)));
        commit({ hidden_lessons: next.length ? next : undefined });
      });
      const when = dates?.get(lesson.id);
      const up = ghostButton('↑', () => move(ordered, index, -1), `Move ${name} up`);
      up.disabled = index === 0 || Boolean(when);
      const down = ghostButton('↓', () => move(ordered, index, 1), `Move ${name} down`);
      down.disabled = index === ordered.length - 1 || Boolean(when);
      place.append(shown, up, down);
      const th = el('th', undefined, name);
      if (when) th.append(el('span', 'cl-editor__date', formatDisplayDate(when.slice(0, 10))));
      tr.append(place, th);
      for (const line of lines) {
        const stop = (shownStops.get(lesson.id) ?? lesson.line_stops)?.find((x) => x.line_id === line.id);
        const td = el('td');
        const cell = el('button', `cl-editor__cell${stop ? '' : ' cl-editor__cell--empty'}`);
        cell.type = 'button';
        cell.style.setProperty('--cl-colour', lineColour(line.colour));
        cell.textContent = stop ? (line.mode === 'light_rail' ? '●' : LEVEL_LETTER[stop.level ?? 'reinforced']) : '·';
        cell.setAttribute('aria-label', `${lesson.title || 'Lesson'} on ${line.name || 'line'}: ${stop ? (line.mode === 'light_rail' ? 'stops' : stop.level ?? 'reinforced') : 'passes'}`);
        cell.disabled = !context?.saveLessonStops;
        cell.addEventListener('click', () => void cycle(lesson.id, line, stop?.level));
        td.append(cell);
        tr.append(td);
      }
      table.append(tr);
    });
    wrap.append(table);
    s.append(wrap);
    return s;
  }

  function move(ordered: readonly NetLesson[], index: number, by: -1 | 1): void {
    const ids = ordered.map((l) => l.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id!);
    // Back in unit order means no custom order to keep.
    const same = ids.join() === lessons.map((l) => l.id).join();
    commit({ station_order: same ? undefined : ids });
  }

  /** A tap steps the depth from the one shown, then off; an auto stop tapped back on stays automatic. */
  async function cycle(lessonId: string, line: NetworkLine, shown: LineStop['level']): Promise<void> {
    const lesson = lessons.find((l) => l.id === lessonId);
    if (!lesson || !context?.saveLessonStops) return;
    const next = toggleLineStop(lesson.line_stops, lesson.line_off, line, shown ? { shown } : {});
    const before = lessons;
    lessons = lessons.map((l) => (l.id === lessonId ? { ...l, line_stops: next.stops, line_off: next.off } : l));
    paintStops();
    paintPreview();
    try {
      await context.saveLessonStops(lessonId, next.stops, next.off);
    } catch {
      lessons = before;
      paintStops();
      paintPreview();
      window.alert('Could not save that stop. Try again.');
    }
  }

  const positionOptions = () => [
    { value: BEFORE_FIRST, label: 'Before the first lesson' },
    ...mapLessons().map((l) => ({ value: l.id, label: `After ${l.title || 'untitled lesson'}` }))
  ];
  const lessonOptions = (none: string) => [{ value: '', label: none }, ...mapLessons().map((l) => ({ value: l.id, label: l.title || 'Untitled lesson' }))];

  /* Light-rail stops, extensions and support loops (saved in the block). */
  function railSection(): HTMLElement {
    const s = section('Light-rail stops', 'Practice points, optional extension spurs and support loops on a skill line. A stop can link a lesson, one activity in a lesson, or be a text label.');
    const rails = lines.filter((l) => l.mode === 'light_rail');
    if (!rails.length) {
      s.append(el('p', 'cl-editor__hint', 'Add a light-rail line to place stops.'));
      return s;
    }
    const update = (id: string, patch: Partial<CurriculumRailStop>, repaint = true) =>
      commit({ rail_stops: v2().rail_stops.map((r) => (r.id === id ? { ...r, ...patch } : r)) }, repaint);
    for (const stop of v2().rail_stops) {
      const row = el('div', 'cl-editor__item');
      const line = selectOf(rails.map((l) => ({ value: l.id, label: l.name || 'Untitled line' })), stop.line_id, 'Line');
      if (!rails.some((l) => l.id === stop.line_id)) line.prepend(new Option('A line no longer on this subject', stop.line_id, true, true));
      line.addEventListener('change', () => update(stop.id, { line_id: line.value }));
      const pos = selectOf(positionOptions(), stop.after_lesson_id ?? BEFORE_FIRST, 'Position');
      pos.addEventListener('change', () => update(stop.id, { after_lesson_id: pos.value || undefined }));
      const kind = selectOf((['stop', 'extension', 'support'] as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] })), stop.kind, 'Kind');
      kind.addEventListener('change', () => update(stop.id, { kind: kind.value as Kind }));
      const lesson = selectOf(lessonOptions('Text label (no link)'), stop.lesson_id ?? '', 'Links to');
      lesson.addEventListener('change', () => update(stop.id, { lesson_id: lesson.value || undefined, block_id: undefined }));
      const label = textInput(stop.label, 120, stop.lesson_id ? 'Uses the lesson or activity title' : 'e.g. Paragraph drill', 'Label');
      label.addEventListener('input', () => update(stop.id, { label: label.value }, false));
      const remove = ghostButton('Remove', () => commit({ rail_stops: v2().rail_stops.filter((r) => r.id !== stop.id) }), `Remove stop ${stop.label}`);
      row.append(field('Line', line), field('Position', pos, true), field('Kind', kind), field('Links to', lesson, true));
      if (stop.lesson_id && context?.lessonBlocks) {
        row.append(field('Activity', activitySelect(stop, (blockId, blockLabel) => {
          update(stop.id, { block_id: blockId, ...(blockId && !stop.label ? { label: blockLabel } : {}) });
        }), true));
      }
      row.append(field('Label', label, true));
      if (stop.kind !== 'stop') {
        // Who may take the straight track past it: shown under the stop's name on the map.
        const skip = textInput(stop.skip_rule ?? '', 80, 'e.g. 90%+ on the techniques quiz', 'Who can skip it');
        skip.addEventListener('input', () => update(stop.id, { skip_rule: skip.value.trim() ? skip.value : undefined }, false));
        row.append(field('Who can skip it', skip, true));
      }
      row.append(remove);
      s.append(row);
    }
    const add = ghostButton('Add light-rail stop', () => {
      const last = mapLessons().at(-1);
      commit({ rail_stops: [...v2().rail_stops, { id: networkId('stop'), line_id: rails[0]!.id, ...(last ? { after_lesson_id: last.id } : {}), kind: 'stop', label: '' }] });
    });
    add.disabled = v2().rail_stops.length >= 60;
    s.append(add);
    return s;
  }

  function activitySelect(stop: CurriculumRailStop, onPick: (blockId: string | undefined, label: string) => void): HTMLSelectElement {
    const select = selectOf([{ value: '', label: 'The whole lesson' }], '', 'Activity');
    if (stop.block_id) select.append(new Option('Loading…', stop.block_id, true, true));
    const lessonId = stop.lesson_id!;
    if (!blockCache.has(lessonId)) blockCache.set(lessonId, context!.lessonBlocks!(lessonId).catch(() => []));
    void blockCache.get(lessonId)!.then((blocks) => {
      select.replaceChildren(new Option('The whole lesson', '', !stop.block_id, !stop.block_id));
      for (const b of blocks) select.append(new Option(b.label, b.id, false, b.id === stop.block_id));
      if (stop.block_id && !blocks.some((b) => b.id === stop.block_id)) select.append(new Option('An activity no longer in the lesson', stop.block_id, true, true));
    });
    select.addEventListener('change', () => onPick(select.value || undefined, select.selectedOptions[0]?.textContent ?? ''));
    return select;
  }

  /* Gates: diagnostic and checkpoint quizzes. */
  function gatesSection(): HTMLElement {
    const s = section('Gates', 'A diagnostic at the start or a checkpoint quiz, drawn as a heavy capsule across the lines it checks.');
    const update = (id: string, patch: Partial<CurriculumGate>, repaint = true) =>
      commit({ gates: v2().gates.map((g) => (g.id === id ? { ...g, ...patch } : g)) }, repaint);
    for (const gate of v2().gates) {
      const row = el('div', 'cl-editor__item');
      const pos = selectOf(positionOptions(), gate.after_lesson_id ?? BEFORE_FIRST, 'Position');
      pos.addEventListener('change', () => update(gate.id, { after_lesson_id: pos.value || undefined }));
      const label = textInput(gate.label, 80, 'e.g. Diagnostic', 'Label');
      label.addEventListener('input', () => update(gate.id, { label: label.value }, false));
      const lesson = selectOf(lessonOptions('No quiz lesson'), gate.lesson_id ?? '', 'Quiz lesson');
      lesson.addEventListener('change', () => update(gate.id, { lesson_id: lesson.value || undefined }));
      const checks = el('div', 'cl-editor__checks');
      for (const line of lines) {
        const box = el('label');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = gate.line_ids.includes(line.id);
        input.addEventListener('change', () => {
          const ids = lines.map((l) => l.id).filter((id) => (id === line.id ? input.checked : gate.line_ids.includes(id)));
          update(gate.id, { line_ids: ids });
        });
        box.append(input, document.createTextNode(` ${line.name || 'Untitled line'}`));
        checks.append(box);
      }
      const remove = ghostButton('Remove', () => commit({ gates: v2().gates.filter((g) => g.id !== gate.id) }), `Remove gate ${gate.label}`);
      row.append(field('Position', pos, true), field('Label', label, true), field('Quiz lesson', lesson, true), field('Checks', checks, true), remove);
      s.append(row);
    }
    const add = ghostButton('Add gate', () => {
      commit({ gates: [...v2().gates, { id: networkId('gate'), label: 'Diagnostic', line_ids: lines.filter((l) => l.mode !== 'light_rail').map((l) => l.id) }] });
    });
    add.disabled = v2().gates.length >= 12;
    s.append(add);
    return s;
  }

  function terminusSection(): HTMLElement {
    const s = section('Terminus', 'The assessment every line runs into.');
    const t = v2().terminus;
    const set = (patch: Partial<CurriculumLinesV2Content['terminus']>, repaint = false) => commit({ terminus: { ...v2().terminus, ...patch } }, repaint);
    const label = textInput(t.label, 80, 'Assessment task', 'Terminus label');
    label.addEventListener('input', () => set({ label: label.value }));
    const detail = textInput(t.detail ?? '', 160, 'e.g. Extended response · short answers', 'Terminus detail');
    detail.addEventListener('input', () => set({ detail: detail.value || undefined }));
    const when = textInput(t.when ?? '', 24, 'Task', 'When');
    when.addEventListener('input', () => set({ when: when.value || undefined }));
    const lesson = selectOf(lessonOptions('No lesson'), t.lesson_id ?? '', 'Terminus lesson');
    lesson.addEventListener('change', () => set({ lesson_id: lesson.value || undefined }, true));
    const row = el('div', 'cl-editor__row');
    row.append(field('Label', label, true), field('Detail', detail, true), field('When', when), field('Lesson', lesson, true));
    s.append(row);
    return s;
  }

  const stopsHost = el('div', 'cl-editor__stack');
  const paintStops = () => stopsHost.replaceChildren(stopsSection(), railSection(), gatesSection());
  /* Syllabus focus area: the guess from the unit's title, or the teacher's pick. */
  function syllabusSection(): HTMLElement | null {
    if (!context?.usesAlignment) return null;
    const s = section('Syllabus', 'The focus area this unit covers. The coverage under the map counts its dot points.');
    const select = selectOf([{ value: '', label: 'From the unit’s title' }], v2().focus_area ?? '', 'Syllabus focus area');
    select.addEventListener('change', () => commit({ focus_area: select.value || undefined }, false));
    s.append(field('Focus area', select, true));
    void loadAlignment()
      .then((doc) => {
        const guess = focusAreaFor(doc, context.unitTitle);
        select.options[0]!.text = guess ? `From the unit’s title (${guess.name})` : 'From the unit’s title (no match)';
        for (const area of doc.focus_areas) select.append(new Option(area.name, area.id, false, area.id === v2().focus_area));
      })
      .catch(() => { s.hidden = true; });
    return s;
  }

  function paint(): void {
    if (!isCurriculumLinesV2(current.content)) {
      root.replaceChildren(upgradeBar(), titleRow(), preview);
      paintPreview();
      return;
    }
    paintStops();
    root.replaceChildren(...[titleRow(), linesSection(), stopsHost, syllabusSection(), terminusSection(), preview].filter((n): n is HTMLElement => Boolean(n)));
    paintPreview();
  }
  paint();
  // The first paint happens before the editor is in the page; redraw once it has a width.
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => paintPreview());
  return root;
}
