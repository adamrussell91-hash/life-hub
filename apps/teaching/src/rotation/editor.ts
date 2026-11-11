import type { Lesson } from '@/schemas/lesson';
import type { Block } from '@/schemas/block';
import { el } from '@/quiz/dom';
import { blockTypeLabel } from '@/blocks/block-meta';
import { createBlock } from '@/blocks/create-block';
import { blankQuestion } from '@/quiz/core';
import { mountQuestionBuilder } from '@/quiz/builder';
import { SKILL_STRANDS } from '@/skills/schema';
import { TEACHING_AI_MODELS, estimateCostUsd, usdToAud } from '@/ai/job-runner';
import {
  DIAL_TABLE,
  PRESETS,
  PRESET_INFO,
  ROTATION_DIALS,
  ROTATION_DIAL_LABELS,
  ROTATION_FALLBACKS,
  ROTATION_FALLBACK_LABELS,
  ROTATION_KINDS,
  ROTATION_KIND_INFO,
  ROTATION_LEVELS,
  ROTATION_LEVEL_LABELS,
  ROTATION_PATHS,
  ROTATION_PATH_LABELS,
  ROTATION_ROLES,
  ROTATION_ROLE_LABELS,
  RotationSettingsSchema,
  WRITTEN_CHECKS,
  WRITTEN_CHECK_LABELS,
  WrittenGateSchema,
  type RotationSettings,
  type Station,
  type WrittenGate
} from './schema';
import {
  MAX_HINTS,
  PRETEST_PER_STATION,
  applyPreset,
  arrivalFromOf,
  findStationSection,
  gateViewOf,
  isHingeGate,
  levelOf,
  presetOf,
  roleOf,
  rotationIssues,
  sectionBlocks,
  suggestionFor,
  withSettings
} from './model';
import { newPretestItems, newStation, stationSection, withRotationSections } from './seed';
import { CHECK_TOKENS, DEFAULT_LESSON_MINUTES, timeBudget, type TimeBudget } from './rules';
import { createRotationTabs, stationTab, tabStation, type RotationTab } from './editor-tabs';
import './rotation.css';

export type RotationEditorOptions = {
  getLesson: () => Lesson;
  emitLesson: (next: Lesson) => void;
  /** Called after a change to the lesson's blocks, so the page redraws its canvas. */
  redrawCanvas: () => void;
  /** The classes that teach the unit, with this lesson's length from the timetable when it is scheduled. */
  classes?: Array<{ id: string; name: string; minutes?: number }>;
  idFactory: () => string;
  onTab?: (tab: RotationTab) => void;
};

export type RotationEditorHandle = {
  root: HTMLElement;
  tabs: ReturnType<typeof createRotationTabs>;
  repaint(): void;
  dispose(): void;
};

const STRAND_LABEL = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** About A$0.01 a check on the standard lane (an estimate until measured on a real dry run). */
export function checkEstimateAud(): number {
  return usdToAud(estimateCostUsd(TEACHING_AI_MODELS.standard, { ...CHECK_TOKENS }));
}

/** Teacher editor for a Station Rotation. Settings live in `lesson.rotation`; station content in its sections. */
export function mountRotationEditor(o: RotationEditorOptions): RotationEditorHandle {
  const current = (): RotationSettings => RotationSettingsSchema.parse(o.getLesson().rotation ?? {});
  const root = el('section', 'rot rot-edit');
  const body = el('div', 'rot-grid');
  const tabs = createRotationTabs({
    onTab: (tab) => { paint(); o.onTab?.(tab); },
    stations: () => current().stations
  });
  root.append(tabs.root, body);
  let confirmDelete: string | null = null;

  /** Settings change. `repaint` redraws the panel (structural changes); typing doesn't, so focus stays. */
  const put = (change: (draft: RotationSettings) => void, repaint = false): void => {
    const draft = structuredClone(current());
    change(draft);
    o.emitLesson({ ...o.getLesson(), rotation: draft });
    if (repaint) paint();
    else paintMarks();
  };
  /** A change to the station sections' blocks. */
  const putBlocks = (blocks: Block[], rotation?: RotationSettings): void => {
    o.emitLesson({ ...o.getLesson(), blocks, ...(rotation ? { rotation } : {}) });
    o.redrawCanvas();
    paint();
  };
  const updateSection = (stationId: string, change: (blocks: Block[]) => Block[]): void => {
    const lesson = o.getLesson();
    const blocks = lesson.blocks.map((b) => (b.block_type === 'section' && b.content.rotation_station === stationId ? ({ ...b, content: { ...b.content, blocks: change(b.content.blocks as Block[]) } } as Block) : b));
    putBlocks(blocks);
  };

  // ---- small controls
  const input = (value: string, max: number, label: string, onInput: (v: string) => void, type = 'text'): HTMLInputElement => {
    const i = el('input', 'rot-input');
    i.type = type;
    if (type === 'text') i.maxLength = max;
    i.value = value;
    i.setAttribute('aria-label', label);
    i.addEventListener('input', () => onInput(i.value));
    return i;
  };
  const num = (value: number | undefined, min: number, max: number, label: string, onInput: (v: number | undefined) => void): HTMLInputElement => {
    const i = el('input', 'rot-input');
    i.type = 'number';
    i.min = String(min);
    i.max = String(max);
    i.value = value === undefined ? '' : String(value);
    i.setAttribute('aria-label', label);
    i.addEventListener('change', () => {
      const n = Math.round(Number(i.value));
      onInput(i.value === '' || !Number.isFinite(n) ? undefined : Math.max(min, Math.min(max, n)));
    });
    return i;
  };
  const area = (value: string, max: number, label: string, onInput: (v: string) => void, rows = 3): HTMLTextAreaElement => {
    const t = el('textarea', 'rot-input');
    t.maxLength = max;
    t.rows = rows;
    t.value = value;
    t.setAttribute('aria-label', label);
    t.addEventListener('input', () => onInput(t.value));
    return t;
  };
  const pick = <T extends string>(items: ReadonlyArray<readonly [T, string]>, value: T | '', label: string, onPick: (v: T) => void, blank?: string): HTMLSelectElement => {
    const s = el('select', 'rot-input');
    s.setAttribute('aria-label', label);
    if (blank !== undefined) { const op = el('option', '', blank); op.value = ''; s.append(op); }
    for (const [v, l] of items) { const op = el('option', '', l); op.value = v; op.selected = v === value; s.append(op); }
    s.addEventListener('change', () => onPick(s.value as T));
    return s;
  };
  const field = (label: string, control: HTMLElement, hint?: string): HTMLElement => {
    // A div, not a label: some controls (check lists) hold labels of their own. Each control carries its own aria-label.
    const f = el('div', 'rot-field');
    f.append(el('span', '', label), control);
    if (hint) f.append(el('small', 'rot-note', hint));
    return f;
  };
  const check = (label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement => {
    const l = el('label', 'rot-check');
    const c = el('input');
    c.type = 'checkbox';
    c.checked = value;
    c.addEventListener('change', () => onChange(c.checked));
    l.append(c, el('span', '', label));
    return l;
  };
  const btn = (label: string, onClick: () => void, cls = 'rot-btn rot-btn--small'): HTMLButtonElement => {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };
  const panel = (title: string, ...children: Array<HTMLElement | null>): HTMLElement => {
    const p = el('section', 'rot-panel');
    if (title) p.append(el('h3', '', title));
    p.append(...children.filter((c): c is HTMLElement => !!c));
    return p;
  };
  const seg = <T extends string>(items: ReadonlyArray<readonly [T, string]>, value: T, label: string, onPick: (v: T) => void): HTMLElement => {
    const wrap = el('span', 'rot-seg');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', label);
    for (const [v, l] of items) {
      const b = el('button', '', l);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(v === value));
      b.addEventListener('click', () => onPick(v));
      wrap.append(b);
    }
    return wrap;
  };

  const lessonMinutes = (r: RotationSettings): number => o.classes?.find((c) => c.id === r.class_id)?.minutes ?? r.minutes ?? DEFAULT_LESSON_MINUTES;

  /** One coloured segment per part, in the order students do them, with the bell marked. */
  function budgetBar(b: TimeBudget): HTMLElement {
    const wrap = el('div', 'rot-budget2');
    const bar = el('div', 'rot-budget2__bar');
    bar.setAttribute('aria-hidden', 'true');
    const scale = Math.max(b.total, b.available);
    for (const part of b.parts) {
      const seg = el('span', `rot-budget2__seg rot-budget2__seg--${part.kind}`);
      seg.style.flexGrow = String(part.minutes);
      seg.title = `${part.label}: ${part.minutes} min`;
      if (part.kind !== 'moving' && part.minutes / scale > 0.07) seg.append(el('span', 'rot-budget2__label', `${part.label} ${part.minutes}`));
      bar.append(seg);
    }
    if (b.total > b.available) {
      const bell = el('span', 'rot-budget2__bell');
      bell.style.left = `${(b.available / scale) * 100}%`;
      bell.append(el('span', '', b.finishAtHome ? 'Bell · home from here' : 'Bell'));
      bar.append(bell);
      if (b.finishAtHome) {
        const home = el('span', 'rot-budget2__home');
        home.style.left = `${(b.available / scale) * 100}%`;
        bar.append(home);
      }
    }
    wrap.append(bar);
    return wrap;
  }

  function budgetSummary(b: TimeBudget, scheduled: boolean): HTMLElement {
    const box = el('div', 'rot-budget2__sum');
    const stat = (big: string, small: string, tone = '') => { const d = el('div', `rot-budget2__stat${tone ? ` rot-budget2__stat--${tone}` : ''}`); d.append(el('b', '', big), el('span', '', small)); return d; };
    const row = el('div', 'rot-budget2__stats');
    row.append(stat(`${b.total} min`, 'each student’s work'), stat(`${b.available} min`, scheduled ? 'in class, from the timetable' : 'in class'));
    if (b.finishAtHome) row.append(stat(b.home ? `${b.home} min` : 'None', 'at home', 'home'));
    else if (b.over) row.append(stat(`${b.over} min`, 'over the bell', 'over'));
    else row.append(stat(`${b.available - b.total} min`, 'spare', 'ok'));
    box.append(row);
    const stationsText = b.stations ? `${b.parts.filter((p) => p.kind === 'station').length} stations (${b.stations} min)` : 'no stations yet';
    const sentence = `Pretest ${b.pretest} min, ${stationsText}${b.teacher ? `, ${b.parts.find((p) => p.kind === 'teacher')!.label} ${b.teacher} min` : ''}, moving ${b.moves} min, finale ${b.finale} min.`;
    const tail = b.finishAtHome
      ? (b.home ? ` Students work until the bell and finish the last ${b.home} min at home.` : ' It all fits in class.')
      : (b.over ? ` That runs ${b.over} min past the bell: tick “Students finish at home” if the rest is homework, or cut or shorten a station.` : '');
    box.append(el('p', b.over ? 'rot-small rot-err' : 'rot-small rot-muted', sentence + tail));
    return box;
  }

  // ---- Build tab

  function stationChips(s: Station): HTMLElement {
    const chips = el('span', 'rot-chips');
    if (s.kind === 'teacher') { chips.append(el('span', 'rot-chip rot-chip--gold', 'Groups from the pretest')); return chips; }
    const blocks = sectionBlocks(findStationSection(o.getLesson().blocks, s.id));
    const levels = new Set(blocks.map(levelOf).filter(Boolean));
    chips.append(el('span', `rot-chip ${levels.size ? 'rot-chip--sage' : 'rot-chip--none'}`, levels.size ? `${levels.size} level${levels.size === 1 ? '' : 's'}` : 'One level'));
    const gate = s.written_gate ? 'Written gate' : blocks.some(isHingeGate) ? 'Hinge gate' : null;
    if (gate) chips.append(el('span', 'rot-chip rot-chip--gold', gate));
    const exits = blocks.filter((b) => roleOf(b) === 'exit').length;
    chips.append(el('span', `rot-chip ${exits ? '' : 'rot-chip--warn'}`, exits ? `${exits} exit check${exits === 1 ? '' : 's'}` : 'No exit check'));
    return chips;
  }

  function stationRow(s: Station, i: number, r: RotationSettings): HTMLElement {
    const row = el('div', 'rot-stn-row');
    row.dataset.station = s.id;
    const learningIndex = r.stations.filter((x) => x.kind !== 'teacher').findIndex((x) => x.id === s.id);
    row.append(el('span', `rot-stn-row__num${s.kind === 'teacher' ? ' rot-stn-row__num--t' : ''}`, s.kind === 'teacher' ? 'T' : String(learningIndex + 1)));
    const main = el('div', 'rot-stn-row__main');
    const title = input(s.title, 120, 'Station title', (v) => put((d) => { d.stations[i]!.title = v; }));
    title.classList.add('rot-stn-row__title');
    const meta = el('div', 'rot-stn-row__meta');
    const kinds = ROTATION_KINDS.filter((k) => k !== 'teacher').map((k) => [k, ROTATION_KIND_INFO[k].label] as const);
    if (s.kind !== 'teacher') meta.append(pick(kinds, s.kind, 'Knowledge type', (v) => put((d) => { d.stations[i]!.kind = v; }, true)));
    meta.append(el('span', 'rot-suggest', suggestionFor(s.kind)));
    meta.append(pick(SKILL_STRANDS.map((x) => [x, STRAND_LABEL(x)] as const), (s.strand ?? '') as (typeof SKILL_STRANDS)[number] | '', 'Strand', (v) => put((d) => { d.stations[i]!.strand = v || undefined; }), 'No strand'));
    const mins = num(s.minutes, 1, 90, 'Minutes', (v) => put((d) => { d.stations[i]!.minutes = v ?? 20; }, true));
    const seats = num(s.seats, 1, 40, 'Seats', (v) => put((d) => { d.stations[i]!.seats = v ?? 6; }));
    meta.append(mins, el('span', 'rot-note', 'min'), seats, el('span', 'rot-note', 'seats'));
    main.append(title, meta, stationChips(s));
    const toolbar = el('div', 'rot-stn-row__tools');
    const up = btn('Up', () => put((d) => { if (i > 0) [d.stations[i - 1], d.stations[i]] = [d.stations[i]!, d.stations[i - 1]!]; }, true));
    up.disabled = i === 0;
    up.setAttribute('aria-label', `Move ${s.title || 'station'} up`);
    const down = btn('Down', () => put((d) => { if (i < d.stations.length - 1) [d.stations[i + 1], d.stations[i]] = [d.stations[i]!, d.stations[i + 1]!]; }, true));
    down.disabled = i === r.stations.length - 1;
    down.setAttribute('aria-label', `Move ${s.title || 'station'} down`);
    const edit = btn('Edit', () => openStation(s.id), 'rot-btn rot-btn--small rot-btn--primary');
    edit.setAttribute('aria-label', `Edit ${s.title || 'station'}`);
    toolbar.append(up, down, edit);
    row.append(main, toolbar);
    return row;
  }

  function addStation(kind: Station['kind']): void {
    const r = current();
    const s = newStation(r, kind);
    const next: RotationSettings = { ...r, stations: [...r.stations, s], pretest: kind === 'teacher' ? r.pretest : [...r.pretest, ...newPretestItems(r, s.id, PRETEST_PER_STATION, o.idFactory)] };
    const lesson = o.getLesson();
    putBlocks([...lesson.blocks.filter((b) => !(b.block_type === 'section' && b.content.rotation_finale === true)), stationSection(s, o.idFactory), ...lesson.blocks.filter((b) => b.block_type === 'section' && b.content.rotation_finale === true)], next);
  }

  function openStation(id: string): void {
    // A station that has lost its section gets it back before it opens.
    const lesson = o.getLesson();
    const r = current();
    const withSections = withRotationSections(lesson.blocks, r, o.idFactory);
    if (withSections !== lesson.blocks) { o.emitLesson({ ...lesson, blocks: withSections }); o.redrawCanvas(); }
    tabs.set(stationTab(id));
  }

  function buildTab(r: RotationSettings): HTMLElement[] {
    const presets = el('div', 'rot-presets');
    const now = presetOf(r);
    for (const key of PRESETS) {
      const p = PRESET_INFO[key];
      const b = el('button', 'rot-preset');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(now === key));
      b.append(el('strong', '', p.label), el('span', '', p.blurb));
      b.addEventListener('click', () => put((d) => Object.assign(d, applyPreset(d, key)), true));
      presets.append(b);
    }
    const presetWrap = el('div', 'rot-grid');
    presetWrap.style.gap = '6px';
    presetWrap.append(el('p', 'rot-eyebrow', 'Start from a preset'), presets, el('p', 'rot-note', 'A preset only sets the path, the control dial and the evidence. Everything else stays as you set it.'));

    const rows = el('div', 'rot-stn-rows');
    r.stations.forEach((s, i) => rows.append(stationRow(s, i, r)));
    if (!r.stations.length) rows.append(el('p', 'rot-note', 'No stations yet.'));
    const adds = el('div', 'rot-row');
    adds.append(btn('+ Add a station', () => addStation('concepts')));
    if (!r.stations.some((s) => s.kind === 'teacher')) adds.append(btn('+ Add the teacher station', () => addStation('teacher')));
    const stations = panel('Stations', rows, adds, el('p', 'rot-note', 'The knowledge type suggests the mode. The aim is the right mode for the content, for every student, not a mode per student.'));

    const classSel = pick((o.classes ?? []).map((c) => [c.id, c.name] as const), r.class_id, 'Class', (v) => put((d) => { d.class_id = v; }, true), 'Pick a class');
    const path = pick(ROTATION_PATHS.map((p) => [p, ROTATION_PATH_LABELS[p]] as const), r.path, 'Path', (v) => put((d) => { d.path = v; if (v === 'choose_n' && !d.choose_n) d.choose_n = Math.max(1, d.stations.filter((s) => s.kind !== 'teacher').length - 1); }, true));
    const fields: HTMLElement[] = [field('Class', classSel), field('Path', path)];
    const learning = r.stations.filter((s) => s.kind !== 'teacher');
    if (r.path === 'choose_n') fields.push(field('How many they choose', num(r.choose_n, 1, Math.max(1, learning.length - 1), 'How many stations', (v) => put((d) => { d.choose_n = v; }, true)), `Of ${learning.length} stations`));
    if (r.path === 'must_may') {
      const box = el('div', 'rot-grid');
      box.style.gap = '4px';
      r.stations.forEach((s, i) => { if (s.kind !== 'teacher') box.append(check(s.title || `Station ${i + 1}`, !!s.must_do, (v) => put((d) => { d.stations[i]!.must_do = v || undefined; }, true))); });
      fields.push(field('Must-do stations', box));
    }
    if (r.path === 'unlocks') fields.push(el('p', 'rot-note', 'Set what each station opens after on its own tab (Edit).'));
    fields.push(field('Pace', el('span', 'rot-small', 'Self-paced; call groups to the teacher station.')));
    fields.push(field('Evidence', pick([['board', 'Evidence board (arrange and link)'], ['list', 'Passport list']] as const, r.evidence, 'Evidence', (v) => put((d) => { d.evidence = v; }, true))));
    fields.push(field('If we run behind', pick(ROTATION_FALLBACKS.map((f) => [f, ROTATION_FALLBACK_LABELS[f]] as const), r.behind_fallback, 'If we run behind', (v) => put((d) => { d.behind_fallback = v; }))));
    if (r.evidence === 'board') {
      const words = input(r.link_words.join(', '), 300, 'Link words', () => undefined);
      words.addEventListener('change', () => {
        const list = words.value.split(',').map((w) => w.trim()).filter(Boolean).slice(0, 6);
        if (list.length < 2) { words.setCustomValidity('Give 2 to 6 link words, separated by commas.'); words.reportValidity(); return; }
        words.setCustomValidity('');
        put((d) => { d.link_words = list.map((w) => w.slice(0, 40)); });
      });
      fields.push(field('Link words', words, '2 to 6, separated by commas. Students link two cards with one of these.'));
    }
    const pathPanel = panel('Path and pace', ...fields);

    const dialTable = el('table', 'rot-dial-table');
    const tbody = el('tbody');
    for (const row of DIAL_TABLE) {
      const tr = el('tr');
      tr.append(el('td', '', row.row), el('td', '', row[r.dial]));
      tbody.append(tr);
    }
    dialTable.append(tbody);
    const dialPanel = panel(`Control dial: ${ROTATION_DIAL_LABELS[r.dial]}`,
      seg(ROTATION_DIALS.map((d) => [d, ROTATION_DIAL_LABELS[d]] as const), r.dial, 'Control dial', (v) => put((d) => { d.dial = v; }, true)),
      dialTable,
      check('Fade the dial: clearing Extend at two stations opens route choice', r.fade_dial, (v) => put((d) => { d.fade_dial = v; })));

    const available = lessonMinutes(r);
    const b = timeBudget(r, available);
    const scheduled = o.classes?.find((c) => c.id === r.class_id)?.minutes;
    const timePanel = panel('Time budget', budgetBar(b), budgetSummary(b, !!scheduled),
      check('Students finish at home', b.finishAtHome, (v) => put((d) => { d.finish_at_home = v || undefined; }, true)),
      scheduled ? null : field('Lesson length (not scheduled yet)', num(r.minutes ?? DEFAULT_LESSON_MINUTES, 10, 240, 'Lesson length in minutes', (v) => put((d) => { d.minutes = v; }, true))));

    const storyOn = !!r.story;
    const story = panel('Story (breakout)',
      check('Frame the rotation as a story', storyOn, (v) => put((d) => { d.story = v ? { title: d.story?.title ?? '', intro: d.story?.intro ?? '' } : undefined; }, true)),
      storyOn ? field('Title', input(r.story!.title, 120, 'Story title', (v) => put((d) => { d.story = { ...(d.story ?? { intro: '' }), title: v }; }))) : null,
      storyOn ? field('Intro', area(r.story!.intro, 800, 'Story intro', (v) => put((d) => { d.story = { ...(d.story ?? { title: '' }), intro: v }; }), 3)) : null,
      storyOn ? el('p', 'rot-note', 'Give each station a letter on its tab; the lock question in the Finale needs all of them.') : null);

    const issues = rotationIssues(o.getLesson());
    const list = el('ul', 'rot-issues');
    for (const m of issues) list.append(el('li', '', m));
    const check2 = panel('Before you publish', issues.length ? list : el('p', 'rot-note', 'Ready to publish.'));

    const side = el('div', 'rot-grid');
    side.append(pathPanel, dialPanel, timePanel, story);
    const grid = el('div', 'rot-grid rot-grid--side');
    const left = el('div', 'rot-grid');
    left.append(stations, check2);
    grid.append(left, side);
    return [presetWrap, grid, el('p', 'rot-note', 'Blocks you add on this tab show above the map, before students start.')];
  }

  // ---- Station tab

  function stationDetails(s: Station, i: number, r: RotationSettings): HTMLElement {
    const fields: HTMLElement[] = [field('Title', input(s.title, 120, 'Station title', (v) => put((d) => { d.stations[i]!.title = v; tabs.repaint(); })))];
    if (s.kind !== 'teacher') {
      const kindSel = pick(ROTATION_KINDS.filter((k) => k !== 'teacher').map((k) => [k, ROTATION_KIND_INFO[k].label] as const), s.kind, 'Knowledge type', (v) => put((d) => { d.stations[i]!.kind = v; }, true));
      const tries = ROTATION_KIND_INFO[s.kind].blocks.map((t) => t.replace(/_/g, ' ')).join(', ');
      fields.push(field('Knowledge type', kindSel, `${suggestionFor(s.kind)}. Try: ${tries}. A suggestion, never a lock.`));
    }
    const grid = el('div', 'rot-fields');
    grid.append(
      field('Minutes', num(s.minutes, 1, 90, 'Minutes', (v) => put((d) => { d.stations[i]!.minutes = v ?? 20; }))),
      field('Seats', num(s.seats, 1, 40, 'Seats', (v) => put((d) => { d.stations[i]!.seats = v ?? 6; }))),
      field('Where', input(s.location ?? '', 80, 'Where in the room', (v) => put((d) => { d.stations[i]!.location = v || undefined; }))),
      field('Strand', pick(SKILL_STRANDS.map((x) => [x, STRAND_LABEL(x)] as const), (s.strand ?? '') as (typeof SKILL_STRANDS)[number] | '', 'Strand', (v) => put((d) => { d.stations[i]!.strand = v || undefined; }), 'No strand'))
    );
    fields.push(grid);
    if (s.kind === 'teacher') {
      fields.push(field('What you say to a group', area(s.script ?? '', 600, 'Teacher script', (v) => put((d) => { d.stations[i]!.script = v || undefined; })), 'Shown beside each group the pretest sends you.'));
      return panel('Teacher station', ...fields, el('p', 'rot-note', 'Students come here when you call their group. The pretest’s misconception questions make the groups.'));
    }
    fields.push(field('Evidence card', area(s.piece, 300, 'Evidence card text', (v) => put((d) => { d.stations[i]!.piece = v; }), 2), 'What students collect onto their board when they pass the exit check.'));
    fields.push(field('Outcomes', area(s.outcomes.join('\n'), 1200, 'Outcomes, one a line', (v) => put((d) => { d.stations[i]!.outcomes = v.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6).map((x) => x.slice(0, 200)); }), 2), 'One a line.'));
    const extra = el('div', 'rot-fields');
    extra.append(
      field('Letter (breakout)', input(s.token ?? '', 4, 'Letter', (v) => put((d) => { d.stations[i]!.token = v.trim() || undefined; }))),
      field('Offline code', input(s.offline_code ?? '', 20, 'Offline code', (v) => put((d) => { d.stations[i]!.offline_code = v.trim() || undefined; }))),
      field('Map across (0–100)', num(s.x, 0, 100, 'Map position across', (v) => put((d) => { d.stations[i]!.x = v; }))),
      field('Map down (0–100)', num(s.y, 0, 100, 'Map position down', (v) => put((d) => { d.stations[i]!.y = v; })))
    );
    fields.push(extra, el('p', 'rot-note', 'An offline station is marked done when the student types its code. Leave the map position blank to lay stations out automatically.'));
    if (r.path === 'must_may') fields.push(check('Must-do station', !!s.must_do, (v) => put((d) => { d.stations[i]!.must_do = v || undefined; })));
    if (r.path === 'unlocks') {
      const box = el('div', 'rot-grid');
      box.style.gap = '4px';
      for (const other of r.stations) {
        if (other.id === s.id || other.kind === 'teacher') continue;
        box.append(check(other.title || other.id, (s.unlock_after ?? []).includes(other.id), (v) => put((d) => {
          const set = new Set(d.stations[i]!.unlock_after ?? []);
          if (v) set.add(other.id); else set.delete(other.id);
          d.stations[i]!.unlock_after = set.size ? [...set] : undefined;
        }, true)));
      }
      fields.push(field('Opens after', box));
    }
    return panel('Station', ...fields);
  }

  function writtenGateEditor(s: Station, i: number): HTMLElement {
    const g = WrittenGateSchema.parse(s.written_gate ?? {});
    const set = (change: (gate: WrittenGate) => void, repaint = false) => put((d) => {
      const gate = WrittenGateSchema.parse(d.stations[i]!.written_gate ?? {});
      change(gate);
      d.stations[i]!.written_gate = gate;
    }, repaint);
    const checks = el('div', 'rot-grid');
    checks.style.gap = '4px';
    for (const c of WRITTEN_CHECKS) checks.append(check(WRITTEN_CHECK_LABELS[c], g.checks.includes(c), (v) => set((gate) => { gate.checks = WRITTEN_CHECKS.filter((x) => (x === c ? v : gate.checks.includes(x))); })));
    const nums = el('div', 'rot-fields');
    nums.append(
      field('Marks (one a point)', num(g.marks, 1, 6, 'Marks', (v) => set((gate) => { gate.marks = v ?? 3; }, true))),
      field('Pass at', num(g.pass_at, 1, 6, 'Pass at', (v) => set((gate) => { gate.pass_at = v ?? gate.marks; }, true))),
      field('Pass at (Support)', num(g.pass_at_support, 1, 6, 'Pass at for Support', (v) => set((gate) => { gate.pass_at_support = v; }))),
      field('Checks before you’re flagged', num(g.max_checks, 1, 6, 'Checks before the teacher is flagged', (v) => set((gate) => { gate.max_checks = v ?? 3; })))
    );
    const keyRows = el('div', 'rot-grid');
    keyRows.style.gap = '6px';
    (g.answer_key ?? []).forEach((k, ki) => {
      const row = el('div', 'rot-key-row');
      row.append(
        input(k.quote, 400, `Expected quote ${ki + 1}`, (v) => set((gate) => { gate.answer_key![ki]!.quote = v; })),
        input(k.techniques.join(', '), 300, `Techniques for quote ${ki + 1}`, (v) => set((gate) => { gate.answer_key![ki]!.techniques = v.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6); })),
        btn('Remove', () => set((gate) => { gate.answer_key!.splice(ki, 1); if (!gate.answer_key!.length) delete gate.answer_key; }, true))
      );
      keyRows.append(row);
    });
    const addKey = btn('+ Add an expected quote', () => set((gate) => { gate.answer_key = [...(gate.answer_key ?? []), { quote: '', techniques: [] }]; }, true));
    addKey.disabled = (g.answer_key?.length ?? 0) >= 12;
    const each = aud(checkEstimateAud());
    const klass = aud(checkEstimateAud() * 28 * 2);
    return panel('Written gate',
      field('Question', area(g.prompt, 600, 'Gate question', (v) => set((gate) => { gate.prompt = v; }), 2)),
      field('Passage', area(g.passage, 4000, 'Passage', (v) => set((gate) => { gate.passage = v; }), 6), 'Quotes are checked word for word against this.'),
      field('The idea each point links to', input(g.idea, 120, 'The idea', (v) => set((gate) => { gate.idea = v; }))),
      field('Each mark needs', checks),
      check('Different techniques in each point', g.different_techniques, (v) => set((gate) => { gate.different_techniques = v; })),
      nums,
      field('Answer key (optional)', keyRows, 'Quotes you expect and the techniques that fit them. The checker can accept others it can justify.'),
      addKey,
      field('Model answer (only you see it)', area(g.model_answer ?? '', 3000, 'Model answer', (v) => set((gate) => { gate.model_answer = v || undefined; }), 3), 'Never sent to students or to the checker.'),
      field('Daily cap for this class (A$)', num(g.daily_cap_aud, 0, 50, 'Daily cap in dollars', (v) => set((gate) => { gate.daily_cap_aud = v ?? 3; })), 'At the cap, written gates turn into teacher checks for the rest of the day.'),
      el('p', 'rot-note', `Cost estimate: about ${each} a check · about ${klass} for 28 students at two checks each. The checker uses the stronger model. Practice only: a gate never writes a mark.`)
    );
  }

  const aud = (n: number) => `A$${n < 0.1 ? n.toFixed(2) : (Math.round(n * 20) / 20).toFixed(2)}`;

  function gatePanel(s: Station, i: number): HTMLElement {
    const blocks = sectionBlocks(findStationSection(o.getLesson().blocks, s.id));
    const hinge = blocks.find(isHingeGate);
    const kind: 'none' | 'hinge' | 'written' = s.written_gate ? 'written' : hinge ? 'hinge' : 'none';
    const choose = (next: 'none' | 'hinge' | 'written') => {
      if (next === kind) return;
      const lesson = o.getLesson();
      const r = current();
      const st = r.stations[i]!;
      if (next !== 'written') delete st.written_gate;
      else st.written_gate = WrittenGateSchema.parse({});
      const blocksNext = lesson.blocks.map((b) => {
        if (!(b.block_type === 'section' && b.content.rotation_station === s.id)) return b;
        let list = (b.content.blocks as Block[]).filter((x) => !isHingeGate(x));
        if (next === 'hinge') {
          const h = createBlock('hinge_question', o.idFactory());
          const gateBlock = withSettings({ ...h, content: { ...(h.content as object), gate: true, pace: 'independent', seconds: 0 } } as Block, { rotation_role: 'gate' });
          const at = list.findIndex((x) => ['after', 'done', 'exit'].includes(roleOf(x)));
          list = at < 0 ? [...list, gateBlock] : [...list.slice(0, at), gateBlock, ...list.slice(at)];
        }
        return { ...b, content: { ...b.content, blocks: list } } as Block;
      });
      putBlocks(blocksNext, r);
    };
    const p = panel('Gate',
      seg([['none', 'No gate'], ['hinge', 'Hinge question'], ['written', 'Written answer']] as const, kind, 'Gate', choose),
      el('p', 'rot-note', kind === 'hinge'
        ? 'Edit the hinge question in the blocks below. A miss shows the misconception and your back-up question; a second miss flags the student for the teacher station. Gates are practice only.'
        : kind === 'written'
          ? 'A written answer checked by rules, then by AI. Any doubt goes to you, and your decision wins.'
          : 'A gate stops students skipping past a misconception. Steps marked “after the gate” stay blurred until it opens.')
    );
    return kind === 'written' ? (() => { const wrap = el('div', 'rot-grid'); wrap.append(p, writtenGateEditor(s, i)); return wrap; })() : p;
  }

  function contentPanel(s: Station, r: RotationSettings): HTMLElement {
    const blocks = sectionBlocks(findStationSection(o.getLesson().blocks, s.id));
    const list = el('div', 'rot-content');
    const others = r.stations.filter((x) => x.id !== s.id && x.kind !== 'teacher');
    blocks.forEach((b, bi) => {
      const row = el('div', 'rot-content__row');
      const role = roleOf(b);
      const c = b.content as Record<string, unknown>;
      const snippet = b.block_type === 'rich_text' ? plain(String(c.html ?? '')) : b.block_type === 'quiz_question' ? String((c.question as { prompt?: string }).prompt ?? '') : String(c.title ?? c.prompt ?? c.question ?? '');
      row.append(el('span', 'rot-content__label', `${blockTypeLabel(b)}${snippet ? ` · ${snippet.slice(0, 80)}` : ''}`));
      const ctl = el('span', 'rot-content__ctl');
      const roles = ROTATION_ROLES.filter((x) => (x === 'gate' ? b.block_type === 'hinge_question' : x === 'recall' || x === 'exit' ? b.block_type === 'quiz_question' : true));
      ctl.append(pick(roles.map((x) => [x, ROTATION_ROLE_LABELS[x]] as const), role, 'Role on the card', (v) => updateSection(s.id, (bs) => bs.map((x, xi) => (xi === bi ? withSettings(x, { rotation_role: v }) : x)))));
      if (role === 'step' || role === 'after' || role === 'hint') {
        ctl.append(pick(ROTATION_LEVELS.map((l) => [l, ROTATION_LEVEL_LABELS[l]] as const), levelOf(b) ?? '', 'Level', (v) => updateSection(s.id, (bs) => bs.map((x, xi) => (xi === bi ? withSettings(x, { level: v || undefined }) : x))), 'Every level'));
      }
      if (role === 'after' || role === 'done' || role === 'exit') {
        ctl.append(pick([['blurred', 'Blurred before the gate'], ['hidden', 'Hidden before the gate']] as const, gateViewOf(b), 'Before the gate opens', (v) => updateSection(s.id, (bs) => bs.map((x, xi) => (xi === bi ? withSettings(x, { gate_view: v === 'hidden' ? 'hidden' : undefined }) : x)))));
      }
      if (role === 'recall') {
        ctl.append(pick([['previous', 'From their last station'], ...others.map((x) => [x.id, `From ${x.title || x.id}`] as const)], arrivalFromOf(b), 'Recall from', (v) => updateSection(s.id, (bs) => bs.map((x, xi) => (xi === bi ? withSettings(x, { arrival_from: v === 'previous' ? undefined : v }) : x)))));
      }
      row.append(ctl);
      list.append(row);
    });
    if (!blocks.length) list.append(el('p', 'rot-note', 'No blocks yet.'));
    const add = (role: 'recall' | 'hint' | 'exit' | 'step') => updateSection(s.id, (bs) => {
      const id = o.idFactory();
      const block = role === 'recall' || role === 'exit'
        ? ({ ...createBlock('quiz_question', id), content: { question: blankQuestion('multiple_choice', id, 1, o.idFactory) } } as Block)
        : createBlock('rich_text', id);
      return [...bs, withSettings(block, { rotation_role: role })];
    });
    const adds = el('div', 'rot-row');
    const hints = blocks.filter((b) => roleOf(b) === 'hint').length;
    const recallBtn = btn('+ Arrival recall', () => add('recall'));
    recallBtn.disabled = blocks.some((b) => roleOf(b) === 'recall');
    const hintBtn = btn('+ Hint', () => add('hint'));
    hintBtn.disabled = hints >= MAX_HINTS;
    const exitBtn = btn('+ Exit check question', () => add('exit'));
    exitBtn.disabled = blocks.filter((b) => roleOf(b) === 'exit').length >= 2;
    adds.append(btn('+ Step', () => add('step')), recallBtn, hintBtn, exitBtn);
    return panel('On the station card',
      el('p', 'rot-note', 'Students see these in card order: arrival recall, goal, steps, hints (one at a time), the gate, steps after the gate, done when, exit check. Tag a step with a level to show it only at that level.'),
      list, adds, el('p', 'rot-note', 'Edit each block’s content below, or add any block from the insert menu; new blocks are steps.'));
  }

  function deletePanel(s: Station): HTMLElement {
    const p = panel('');
    if (confirmDelete !== s.id) {
      p.append(btn(`Delete ${s.title || 'this station'}`, () => { confirmDelete = s.id; paint(); }, 'rot-btn rot-btn--small rot-btn--danger'));
      return p;
    }
    const row = el('div', 'rot-row');
    row.append(el('span', 'rot-small', `Delete ${s.title || 'this station'}, its blocks and its pretest questions?`),
      btn('Delete', () => {
        confirmDelete = null;
        const r = current();
        const lesson = o.getLesson();
        const next: RotationSettings = { ...r, stations: r.stations.filter((x) => x.id !== s.id).map((x) => (x.unlock_after ? { ...x, unlock_after: x.unlock_after.filter((id) => id !== s.id) } : x)), pretest: r.pretest.filter((p2) => p2.station !== s.id) };
        tabs.set('build');
        putBlocks(lesson.blocks.filter((b) => !(b.block_type === 'section' && b.content.rotation_station === s.id)), next);
      }, 'rot-btn rot-btn--small rot-btn--danger'),
      btn('Keep it', () => { confirmDelete = null; paint(); }));
    p.append(row);
    return p;
  }

  function stationTabBody(id: string, r: RotationSettings): HTMLElement[] {
    const i = r.stations.findIndex((s) => s.id === id);
    const s = r.stations[i];
    if (!s) return [el('p', 'rot-note', 'That station is gone.')];
    // One full-width column: a side column here held only the chips and squeezed the station card list.
    const main = el('div', 'rot-grid');
    const details = stationDetails(s, i, r);
    details.insertBefore(stationChips(s), details.children[1] ?? null);
    main.append(details);
    if (s.kind !== 'teacher') main.append(gatePanel(s, i), contentPanel(s, r));
    main.append(deletePanel(s));
    return [main];
  }

  // ---- Pretest tab

  function pretestTab(r: RotationSettings): HTMLElement[] {
    const out: HTMLElement[] = [el('p', 'rot-note', 'Three questions a station. Scores set each student’s level there: 0 or 1 right is Support, 2 is Core, 3 is Extend. Tick “misconception” on a question whose miss should send the student to the teacher station. Students see the right answer straight after each question. Not marked.')];
    for (const s of r.stations.filter((x) => x.kind !== 'teacher')) {
      const items = r.pretest.filter((p) => p.station === s.id);
      const box = el('div', 'rot-pt-station');
      items.forEach((item) => {
        const at = r.pretest.findIndex((p) => p.id === item.id);
        const wrap = el('div', 'rot-pt-item');
        const builder = mountQuestionBuilder({
          question: item.question,
          audience: 'teacher',
          kinds: ['multiple_choice', 'true_false', 'multi_select', 'short_answer', 'odd_one_out', 'matching', 'ordering', 'categorise', 'fill_gap', 'quote_technique'],
          marks: { min: 1, max: 1 },
          onChange: (q) => put((d) => { const k = d.pretest.findIndex((p) => p.id === item.id); if (k >= 0) d.pretest[k]!.question = q; })
        });
        const row = el('div', 'rot-row rot-row--between');
        const rm = btn('Remove', () => put((d) => { d.pretest.splice(at, 1); }, true));
        row.append(check('Misconception: a miss routes to the teacher station', !!item.misconception, (v) => put((d) => { const k = d.pretest.findIndex((p) => p.id === item.id); if (k >= 0) d.pretest[k]!.misconception = v || undefined; })), rm);
        wrap.append(builder.root, row);
        box.append(wrap);
      });
      const add = btn('+ Add a question', () => put((d) => { d.pretest.push(...newPretestItems(d, s.id, 1, o.idFactory)); }, true));
      add.disabled = items.length >= PRETEST_PER_STATION;
      box.append(add);
      out.push(panel(`${s.title || 'Station'} · ${items.length} of ${PRETEST_PER_STATION}`, box));
    }
    return out;
  }

  // ---- Finale tab

  function finaleTab(r: RotationSettings): HTMLElement[] {
    const lock = r.finale.lock;
    const lockBox = el('div', 'rot-grid');
    if (lock) {
      lockBox.append(field('Lock question', area(lock.prompt, 500, 'Lock question', (v) => put((d) => { d.finale.lock!.prompt = v; }), 2), 'Something only all the pieces can answer together. Multiple choice; no ciphers.'));
      lock.options.forEach((opt, oi) => {
        const row = el('div', 'rot-opt-row');
        const radio = el('input');
        radio.type = 'radio';
        radio.name = 'rot-lock-right';
        radio.checked = lock.correct_id === opt.id;
        radio.setAttribute('aria-label', `Option ${oi + 1} is right`);
        radio.addEventListener('change', () => put((d) => { d.finale.lock!.correct_id = opt.id; }));
        row.append(radio, input(opt.text, 300, `Option ${oi + 1}`, (v) => put((d) => { d.finale.lock!.options[oi]!.text = v; })), btn('Remove', () => put((d) => { d.finale.lock!.options.splice(oi, 1); }, true)));
        lockBox.append(row);
      });
      const add = btn('+ Option', () => put((d) => {
        const used = new Set(d.finale.lock!.options.map((x) => x.id));
        let n = 1;
        while (used.has(`l${n}`)) n += 1;
        d.finale.lock!.options.push({ id: `l${n}`, text: '' });
      }, true));
      add.disabled = lock.options.length >= 5;
      lockBox.append(el('p', 'rot-note', 'Tick the right answer.'), add, btn('Remove the lock', () => put((d) => { delete d.finale.lock; }, true)));
    } else {
      lockBox.append(btn('+ Add a lock question', () => put((d) => { d.finale.lock = { prompt: '', options: [{ id: 'l1', text: '' }, { id: 'l2', text: '' }], correct_id: '' }; }, true)));
    }
    const formats = el('div', 'rot-grid');
    formats.style.gap = '6px';
    r.finale.formats.forEach((f, fi) => {
      const row = el('div', 'rot-opt-row');
      row.append(el('span', 'rot-note', String(fi + 1)), input(f, 60, `Format ${fi + 1}`, (v) => put((d) => { d.finale.formats[fi] = v; })), btn('Remove', () => put((d) => { d.finale.formats.splice(fi, 1); }, true)));
      formats.append(row);
    });
    const addFormat = btn('+ Format', () => put((d) => { d.finale.formats.push(''); }, true));
    addFormat.disabled = r.finale.formats.length >= 5;
    const debrief = el('div', 'rot-grid');
    debrief.style.gap = '6px';
    r.finale.debrief.forEach((q, qi) => {
      const row = el('div', 'rot-opt-row');
      row.append(el('span', 'rot-note', String(qi + 1)), input(q, 300, `Debrief question ${qi + 1}`, (v) => put((d) => { d.finale.debrief[qi] = v; })), btn('Remove', () => put((d) => { d.finale.debrief.splice(qi, 1); }, true)));
      debrief.append(row);
    });
    const addDebrief = btn('+ Debrief question', () => put((d) => { d.finale.debrief.push(''); }, true));
    addDebrief.disabled = r.finale.debrief.length >= 4;
    const grid = el('div', 'rot-grid rot-grid--2');
    grid.append(panel('The lock', lockBox), panel('Debrief', debrief, addDebrief));
    return [
      grid,
      panel('Build', field('What they write', area(r.finale.build_prompt, 400, 'Build prompt', (v) => put((d) => { d.finale.build_prompt = v; }), 2), 'Their board’s cards and links come with them.'),
        field('Formats', formats, 'Guided gets the first; Standard picks from these; Open may choose any.'), addFormat),
      el('p', 'rot-note', 'Blocks you add on this tab show at the top of the finale.')
    ];
  }

  // ---- paint

  function marks(r: RotationSettings): Set<RotationTab> {
    const out = new Set<RotationTab>();
    const issues = rotationIssues(o.getLesson());
    if (issues.length) out.add('build');
    for (const s of r.stations) {
      if (s.kind === 'teacher') continue;
      if (r.pretest.filter((p) => p.station === s.id).length !== PRETEST_PER_STATION) out.add('pretest');
      const blocks = sectionBlocks(findStationSection(o.getLesson().blocks, s.id));
      if (!blocks.some((b) => roleOf(b) === 'exit') || !blocks.some((b) => roleOf(b) === 'goal')) out.add(stationTab(s.id));
    }
    return out;
  }
  let marked = '';
  function paintMarks(): void {
    const next = [...marks(current())].sort().join('|');
    if (next === marked) return;
    marked = next;
    tabs.mark(next ? (next.split('|') as RotationTab[]) : []);
  }

  function paint(): void {
    const r = current();
    tabs.repaint();
    const tab = tabs.current();
    const station = tabStation(tab);
    body.replaceChildren(...(station ? stationTabBody(station, r) : tab === 'build' ? buildTab(r) : tab === 'pretest' ? pretestTab(r) : tab === 'finale' ? finaleTab(r) : [el('p', 'rot-note', 'Every block in the lesson, in order. Station sections are tagged with their station.')]));
    marked = '';
    paintMarks();
  }

  paint();
  return {
    root,
    tabs,
    repaint: paint,
    dispose() { root.remove(); }
  };
}
