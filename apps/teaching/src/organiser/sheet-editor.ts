import './organiser.css';
import { loadAlignment } from '@/alignment/api';
import { focusAreaFor } from '@/alignment/coverage';
import { conceptKeyOf, subjectUsesAlignment } from '@/alignment/model';
import type { Alignment, AlignmentConcept } from '@/alignment/schema';
import { lineColour } from '@/network/colour';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import { unitConceptKeysFor, unitLessonLines, unitMapContent, unitNetworkContext } from '@/teacher/network-context';
import { lessonsByDate } from '@/teacher/unit-lesson-order';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Unit } from '@/schemas';
import { organiserApi } from './api';
import {
  anthologyFromLessons,
  anthologyItems,
  BRING_LABEL,
  bringLine,
  deepItems,
  freshItems,
  loadUnitLessons,
  planItems,
  renderBringPanel,
  type BringItem,
  type BringSource
} from './bring-in';
import { columnSlots, conceptColourAt, createSerialQueue, parsePaste } from './editor-model';
import { printOrganiser } from './print';
import type { OrganiserChange, OrganiserLine, OrganiserRole, OrganiserSection, TeacherOrganiser, VocabTier } from './types';

/**
 * The whole sheet on the unit page, written before teaching: concepts with their sentence and key
 * ideas down the left; facts, words and any other sections down the right. Nothing here says when
 * a line goes out: a lesson ticks that (lesson-card.ts).
 * Edits wait ~600ms, then go to the server one at a time. Every reply replaces the state, but the
 * page is not redrawn while a field has focus.
 */

export interface OrganiserSectionOptions {
  unit: Unit;
  lessons: Array<{ id: string; title: string; sequence: number }>;
  classes: Array<{ id: string; label: string }>;
  curriculum: CurriculumResponse;
}

const SAVE_DELAY_MS = 600;
const TIER_WORDS: Record<VocabTier, string> = { 1: 'everyday', 2: 'across subjects', 3: 'this subject' };
const CHEVRON = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5 7 5 3 8.500" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SIDE_ROLES: Array<{ role: OrganiserRole; name: string; add: string; optional?: boolean }> = [
  { role: 'facts', name: 'Facts and topics', add: 'Add fact' },
  { role: 'key_lines', name: 'Key lines', add: 'Add line', optional: true },
  { role: 'story', name: 'Story order', add: 'Add step', optional: true }
];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function quiet(label: string, onClick: () => void, extra = ''): HTMLButtonElement {
  const node = h('button', `ko-quiet${extra ? ` ${extra}` : ''}`, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

const isField = (node: Element | null): boolean => !!node && node.matches('input:not([type="checkbox"]), textarea');
const sameCells = (a: readonly string[] | undefined, b: readonly string[]): boolean => !!a && a.length === b.length && a.every((c, i) => c === b[i]);
/** A field shows all its text: the box grows with what's typed. */
const fitField = (field: HTMLTextAreaElement): void => {
  field.style.height = 'auto';
  if (field.scrollHeight) field.style.height = `${field.scrollHeight}px`;
};
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One concept card: a section on the sheet, or a concept the unit map names that has no section yet. */
type ConceptRow = { id: string; name: string; key?: string; section?: OrganiserSection; colour: string; bullets: AlignmentConcept['bullets'] };

export function mountOrganiserSection(host: HTMLElement, options: OrganiserSectionOptions): { dispose(): void } {
  const { unit, classes, curriculum } = options;
  const root = h('div', 'ko-root');
  host.append(root);

  const order = lessonsByDate(options.lessons, curriculum.scheduled_lessons.filter((row) => row.unit_id === unit.id)).map((lesson) => lesson.id);
  const networkLines = unitNetworkContext(curriculum, unit).lines;
  const colourOfKey = new Map(networkLines.flatMap((l) => (l.alignment?.kind === 'concept' ? [[l.alignment.key, lineColour(l.colour)] as const] : [])));
  const skillNames = unitMapContent(unit)?.skill_lines?.length ? unitLessonLines(unit, networkLines).filter((l) => l.mode === 'light_rail' && l.name).map((l) => l.name) : [];

  let data: TeacherOrganiser | null = null;
  let alignment: Alignment | null = null;
  let mapKeys: string[] = [];
  let loadFailed = false;
  let status = '';
  let statusBad = false;
  let disposed = false;
  let renderPending = false;
  let printing = false;
  /** Folds that are open, by concept, line or dot-point id. */
  const open = new Set<string>();
  const localCells = new Map<string, string[]>();
  const localSentences = new Map<string, string>();
  const timers = new Map<string, number>();
  /** Draft rows being typed, by the panel or concept they belong to. */
  const drafts = new Map<string, string[]>();
  let panel: { kind: 'paste' | 'syllabus' | 'bring'; at: string; source?: BringSource } | null = null;
  let pasteText = '';
  let bringCache: Promise<Record<BringSource, BringItem[]>> | null = null;
  let focusAfter: (() => void) | null = null;
  const queue = createSerialQueue();

  const sections = (): OrganiserSection[] => data?.organiser.sections ?? [];
  const sectionOf = (role: OrganiserRole): OrganiserSection | undefined => sections().find((s) => s.role === role);

  // ---- talking to the server ---------------------------------------------------------------

  function say(text: string, bad = false): void {
    status = text;
    statusBad = bad;
  }

  function reason(error: unknown): string {
    return error instanceof Error && error.message ? error.message : 'That did not save. Try again.';
  }

  function softRender(): void {
    if (disposed) return;
    const active = document.activeElement;
    const typing = host.contains(active) && isField(active);
    const draft = typing ? active?.closest<HTMLElement>('.ko-draft') : null;
    if (typing && !draft) {
      renderPending = true;
      return;
    }
    // A draft row keeps its words in `drafts`, so the new line can show while the teacher keeps typing.
    const at = draft ? [...draft.querySelectorAll('textarea')].indexOf(active as HTMLTextAreaElement) : -1;
    const keep = draft && !focusAfter ? draft.dataset.draft : undefined;
    render();
    if (!keep) return;
    const field = root.querySelectorAll<HTMLTextAreaElement>(`[data-draft="${keep}"] textarea`)[at];
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  }

  /** One change, in order. Resolves true when the server took it. */
  function send(change: OrganiserChange, after?: (next: TeacherOrganiser) => void): Promise<boolean> {
    return queue
      .add(() => organiserApi.change(unit.id, change))
      .then((next) => {
        data = next;
        say('');
        after?.(next);
        softRender();
        return true;
      })
      .catch(async (error: unknown) => {
        say(reason(error), true);
        // Lines the server turned down are put back as the server holds them.
        await organiserApi.get(unit.id).then((fresh) => { data = fresh; }).catch(() => undefined);
        render();
        return false;
      });
  }

  function flushLine(lineId: string): void {
    window.clearTimeout(timers.get(lineId));
    timers.delete(lineId);
    const cells = localCells.get(lineId);
    if (!cells) return;
    const sent = cells.slice();
    void send({ op: 'update_line', line_id: lineId, cells: sent }, () => {
      if (sameCells(localCells.get(lineId), sent)) localCells.delete(lineId);
    });
  }

  function editLine(lineId: string, cells: string[]): void {
    localCells.set(lineId, cells);
    window.clearTimeout(timers.get(lineId));
    timers.set(lineId, window.setTimeout(() => flushLine(lineId), SAVE_DELAY_MS));
  }

  function flushSentence(sectionId: string): void {
    const key = `s:${sectionId}`;
    window.clearTimeout(timers.get(key));
    timers.delete(key);
    const sentence = localSentences.get(sectionId);
    if (sentence === undefined) return;
    void send({ op: 'update_section', section_id: sectionId, sentence }, () => {
      if (localSentences.get(sectionId) === sentence) localSentences.delete(sectionId);
    });
  }

  /** The section a concept card writes to, made on first use. */
  async function ensureConcept(row: ConceptRow, sentence?: string): Promise<OrganiserSection | undefined> {
    if (row.section) return row.section;
    const ok = await send({ op: 'add_section', role: 'concept', name: row.name, ...(row.key ? { concept_key: row.key } : {}), ...(sentence ? { sentence } : {}) });
    return ok ? sections().find((s) => s.concept_key === row.key) : undefined;
  }

  /** The section a side panel writes to, made on first use. */
  async function ensureRole(role: OrganiserRole, name: string): Promise<OrganiserSection | undefined> {
    const held = sectionOf(role);
    if (held) return held;
    const ok = await send({ op: 'add_section', role, name });
    return ok ? sectionOf(role) : undefined;
  }

  function load(): void {
    loadFailed = false;
    render();
    const usesAlignment = subjectUsesAlignment(curriculum.subjects.find((s) => s.id === unit.subject_id)?.title ?? '');
    void Promise.all([organiserApi.get(unit.id), usesAlignment ? loadAlignment().catch(() => null) : Promise.resolve(null)])
      .then(([next, doc]) => {
        if (disposed) return;
        data = next;
        alignment = doc;
        mapKeys = doc ? unitConceptKeysFor(curriculum, unit, doc) : [];
        render();
      })
      .catch(() => {
        if (disposed) return;
        loadFailed = true;
        render();
      });
  }

  // ---- what the page shows -----------------------------------------------------------------

  function conceptRows(): ConceptRow[] {
    const byKey = new Map((alignment?.concepts ?? []).map((c) => [c.key, c]));
    const held = sections().filter((s) => s.role === 'concept');
    const keys = [...mapKeys, ...held.flatMap((s) => (s.concept_key && !mapKeys.includes(s.concept_key) ? [s.concept_key] : []))];
    const rows: ConceptRow[] = keys.flatMap((key) => {
      const section = held.find((s) => s.concept_key === key);
      const concept = byKey.get(key);
      return concept || section ? [{ id: `concept:${key}`, key, name: section?.name ?? concept?.name ?? key, section, colour: '', bullets: concept?.bullets ?? [] }] : [];
    });
    for (const section of held) if (!section.concept_key) rows.push({ id: section.id, name: section.name, section, colour: '', bullets: [] });
    return rows.map((row, i) => ({ ...row, colour: (row.key && colourOfKey.get(row.key)) || conceptColourAt(i) }));
  }

  /** Dot points kept: what the teacher ticked, else the ones this unit's focus area links to. */
  function keptDots(row: ConceptRow): number[] {
    if (row.section?.dot_points) return row.section.dot_points;
    if (!alignment || !row.key) return [];
    const area = focusAreaFor(alignment, unit.title, unitMapContent(unit)?.focus_area);
    const points = alignment.focus_areas.find((f) => f.id === area?.id)?.points ?? [];
    return row.bullets.map((b) => b.n).filter((n) => points.some((p) => p.concepts.some((c) => c.ref === `${row.key}${n}`)));
  }

  function syllabusItems(row: ConceptRow): BringItem[] {
    if (!alignment || !row.key) return [];
    const area = focusAreaFor(alignment, unit.title, unitMapContent(unit)?.focus_area);
    const areas = area ? alignment.focus_areas.filter((f) => f.id === area.id) : alignment.focus_areas;
    return areas.flatMap((f) => f.points.filter((p) => p.concepts.some((c) => conceptKeyOf(c.ref) === row.key)).map((p): BringItem => ({
      key: `syllabus:${p.id}`,
      source: 'plan',
      group: f.name,
      label: p.text,
      know: p.text
    })));
  }

  // ---- small pieces ------------------------------------------------------------------------

  function chevron(id: string, label: string): HTMLButtonElement {
    const node = h('button', 'ko-chev');
    node.type = 'button';
    node.innerHTML = CHEVRON;
    node.setAttribute('aria-label', label);
    node.setAttribute('aria-expanded', String(open.has(id)));
    node.setAttribute('aria-controls', foldId(id));
    node.addEventListener('click', () => toggle(id, node));
    return node;
  }

  const foldId = (id: string): string => `ko-fold-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`;

  function toggle(id: string, control: HTMLElement): void {
    const on = !open.has(id);
    if (on) open.add(id);
    else open.delete(id);
    control.setAttribute('aria-expanded', String(on));
    root.querySelector(`#${foldId(id)}`)?.classList.toggle('open', on);
  }

  function fold(id: string, ...inner: Node[]): HTMLElement {
    const box = h('div', `ko-fold${open.has(id) ? ' open' : ''}`);
    box.id = foldId(id);
    const clip = h('div');
    clip.append(...inner);
    box.append(clip);
    return box;
  }

  function cellField(section: OrganiserSection, line: OrganiserLine, at: number, label: string, className = 'ko-edit'): HTMLTextAreaElement {
    const field = h('textarea', className);
    field.rows = 1;
    field.maxLength = 400;
    field.placeholder = label;
    field.setAttribute('aria-label', label);
    field.value = (localCells.get(line.id) ?? line.cells)[at] ?? '';
    field.addEventListener('input', () => {
      const cells = (localCells.get(line.id) ?? line.cells).slice();
      cells[at] = field.value;
      editLine(line.id, cells);
    });
    field.addEventListener('change', () => flushLine(line.id));
    return field;
  }

  function lineTools(section: OrganiserSection, line: OrganiserLine): HTMLElement {
    const at = section.lines.findIndex((l) => l.id === line.id);
    const tools = h('div', 'ko-tools');
    const up = quiet('Move up', () => void send({ op: 'move_line', line_id: line.id, to: at - 1 }));
    up.disabled = at === 0;
    const down = quiet('Move down', () => void send({ op: 'move_line', line_id: line.id, to: at + 1 }));
    down.disabled = at === section.lines.length - 1;
    tools.append(up, down);
    if (section.role === 'concept' || section.role === 'ideas') tools.append(moveToConcept(section, line));
    tools.append(quiet('Delete', () => {
      window.clearTimeout(timers.get(line.id));
      timers.delete(line.id);
      localCells.delete(line.id);
      void send({ op: 'delete_line', line_id: line.id });
    }, 'ko-quiet--danger'));
    return tools;
  }

  function moveToConcept(section: OrganiserSection, line: OrganiserLine): HTMLSelectElement {
    const select = h('select', 'ko-select');
    select.setAttribute('aria-label', 'Move to another concept');
    select.append(new Option('Move to…', ''));
    const rows = conceptRows().filter((row) => row.section?.id !== section.id);
    rows.forEach((row) => select.append(new Option(row.name, row.id)));
    select.addEventListener('change', () => {
      const row = rows.find((r) => r.id === select.value);
      if (!row) return;
      void ensureConcept(row).then((target) => {
        if (target) void send({ op: 'move_line', line_id: line.id, section_id: target.id, to: target.lines.length });
      });
    });
    return select;
  }

  function moreFields(section: OrganiserSection, line: OrganiserLine, slots: number[]): HTMLElement[] {
    const columns = section.columns ?? [];
    return slots.map((at) => {
      const row = h('label', 'ko-field');
      row.append(h('small', undefined, columns[at]?.label ?? ''), cellField(section, line, at, `Add ${(columns[at]?.label ?? 'detail').toLowerCase()}`));
      return row;
    });
  }

  /** The typing row at the foot of a list. `labels` name the cells it fills, `slots` where they go. */
  function draftRow(id: string, labels: string[], commit: (values: string[]) => void): HTMLElement {
    const values = drafts.get(id) ?? labels.map(() => '');
    drafts.set(id, values);
    const row = h('div', 'ko-draft');
    row.dataset.draft = id;
    const submit = (): void => {
      if (!values.some((v) => v.trim())) return;
      const sent = values.slice();
      values.fill('');
      focusAfter = () => root.querySelector<HTMLTextAreaElement>(`[data-draft="${id}"] textarea`)?.focus();
      commit(sent);
    };
    labels.forEach((label, i) => {
      const field = h('textarea', 'ko-edit ko-edit--draft');
      field.rows = 1;
      field.maxLength = 400;
      field.placeholder = label;
      field.setAttribute('aria-label', label);
      field.value = values[i] ?? '';
      field.addEventListener('input', () => { values[i] = field.value; });
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          values[i] = field.value;
          submit();
        }
        if (event.key === 'Escape') {
          drafts.delete(id);
          render();
        }
      });
      row.append(field);
    });
    const tools = h('div', 'ko-tools');
    tools.append(quiet('Add', submit), quiet('Close', () => { drafts.delete(id); render(); }));
    row.append(tools);
    return row;
  }

  function openDraft(id: string): void {
    if (!drafts.has(id)) drafts.set(id, []);
    focusAfter = () => root.querySelector<HTMLTextAreaElement>(`[data-draft="${id}"] textarea`)?.focus();
    render();
  }

  // ---- concepts ----------------------------------------------------------------------------

  function ideaRow(section: OrganiserSection, line: OrganiserLine): HTMLElement {
    const { answer, cue, rest } = columnSlots(section);
    const stop = h('div', 'ko-stop');
    const row = h('div', 'ko-linerow');
    const main = answer !== -1 ? answer : Math.max(cue, 0);
    row.append(cellField(section, line, main, 'Key idea'), chevron(line.id, 'Prompt and example'));
    const inner = h('div', 'ko-more__in');
    inner.append(...moreFields(section, line, [cue, ...rest].filter((i) => i !== -1 && i !== main)), lineTools(section, line));
    stop.append(row, fold(line.id, inner));
    return stop;
  }

  function dotPoints(row: ConceptRow): HTMLElement {
    const id = `dots:${row.id}`;
    const kept = new Set(keptDots(row));
    const box = h('div', 'ko-dots');
    for (const bullet of row.bullets) {
      const label = h('label');
      const check = h('input');
      check.type = 'checkbox';
      check.checked = kept.has(bullet.n);
      check.addEventListener('change', () => {
        const next = new Set(keptDots(row));
        if (check.checked) next.add(bullet.n);
        else next.delete(bullet.n);
        void ensureConcept(row).then((section) => {
          if (section) void send({ op: 'update_section', section_id: section.id, dot_points: [...next].sort((a, b) => a - b) });
        });
      });
      label.append(check, h('span', undefined, bullet.text));
      box.append(label);
    }
    return fold(id, box);
  }

  function conceptCard(row: ConceptRow): HTMLElement {
    const section = row.section;
    const card = h('article', 'ko-concept');
    card.style.setProperty('--c', row.colour);
    card.dataset.concept = row.id;
    const top = h('div', 'ko-concept__row');
    const text = h('div');
    const meta = h('div', 'ko-concept__meta');
    meta.append(h('span', 'ko-capsule', row.name), h('span', 'ko-count', plural(section?.lines.length ?? 0, 'key idea')));
    const sentence = h('textarea', 'ko-edit ko-concept__line');
    sentence.rows = 1;
    sentence.maxLength = 400;
    sentence.placeholder = 'One sentence for this unit';
    sentence.setAttribute('aria-label', `${row.name}: one sentence for this unit`);
    sentence.value = (section && localSentences.get(section.id)) ?? section?.sentence ?? '';
    sentence.addEventListener('input', () => {
      if (!section) return;
      localSentences.set(section.id, sentence.value);
      window.clearTimeout(timers.get(`s:${section.id}`));
      timers.set(`s:${section.id}`, window.setTimeout(() => flushSentence(section.id), SAVE_DELAY_MS));
    });
    sentence.addEventListener('change', () => {
      if (section) flushSentence(section.id);
      else if (sentence.value.trim()) void ensureConcept(row, sentence.value);
    });
    text.append(meta, sentence);
    top.append(text, chevron(row.id, `Open ${row.name}`));
    card.append(top);

    const stops = h('div', 'ko-stops');
    for (const line of section?.lines ?? []) if (section) stops.append(ideaRow(section, line));
    const foot = h('div', 'ko-foot');
    const draftId = `idea:${row.id}`;
    foot.append(quiet('+ Add key idea', () => openDraft(draftId)));
    if (row.key && alignment) foot.append(quiet('From syllabus', () => togglePanel({ kind: 'syllabus', at: row.id })));
    foot.append(quiet('Bring in', () => togglePanel({ kind: 'bring', at: row.id, source: 'deep' })));
    if (row.bullets.length) {
      const dotsButton = quiet(`Dot points ${keptDots(row).length} of ${row.bullets.length}`, () => toggle(`dots:${row.id}`, dotsButton));
      dotsButton.setAttribute('aria-expanded', String(open.has(`dots:${row.id}`)));
      foot.append(dotsButton);
    }
    if (section && !row.key) foot.append(quiet('Remove', () => removeSection(section), 'ko-quiet--danger'));

    const inner: Node[] = [stops];
    if (drafts.has(draftId)) {
      inner.push(draftRow(draftId, ['New key idea'], ([value]) => {
        void ensureConcept(row).then((target) => {
          if (!target) return;
          const cells = (target.columns ?? []).map(() => '');
          const { answer } = columnSlots(target);
          cells[answer] = value ?? '';
          void send({ op: 'add_lines', section_id: target.id, lines: [{ cells }] });
        });
      }));
    }
    inner.push(foot);
    if (row.bullets.length) inner.push(dotPoints(row));
    if (panel?.at === row.id && panel.kind === 'syllabus') inner.push(syllabusHolder(row));
    if (panel?.at === row.id && panel.kind === 'bring') inner.push(bringHolder(row));
    card.append(fold(row.id, ...inner));
    return card;
  }

  function looseIdeas(section: OrganiserSection): HTMLElement {
    const card = h('article', 'ko-concept');
    card.style.setProperty('--c', 'var(--muted)');
    const top = h('div', 'ko-concept__row');
    const text = h('div');
    const meta = h('div', 'ko-concept__meta');
    meta.append(h('span', 'ko-capsule', section.name), h('span', 'ko-count', plural(section.lines.length, 'key idea')));
    text.append(meta, h('p', 'ko-status', 'Written before concepts. Open one and use Move to.'));
    top.append(text, chevron(section.id, `Open ${section.name}`));
    const stops = h('div', 'ko-stops');
    for (const line of section.lines) stops.append(ideaRow(section, line));
    card.append(top, fold(section.id, stops));
    return card;
  }

  function addConcept(): HTMLElement {
    const held = new Set(conceptRows().map((row) => row.key));
    const others = (alignment?.concepts ?? []).filter((c) => !held.has(c.key));
    if (!others.length) {
      return quiet('+ Add concept', () => void send({ op: 'add_section', role: 'concept', name: 'New concept' }));
    }
    const select = h('select', 'ko-select');
    select.setAttribute('aria-label', 'Add a concept');
    select.append(new Option('+ Add concept', ''));
    for (const c of others) select.append(new Option(c.name, c.key));
    select.addEventListener('change', () => {
      const concept = others.find((c) => c.key === select.value);
      if (!concept) return;
      open.add(`concept:${concept.key}`);
      void send({ op: 'add_section', role: 'concept', name: concept.name, concept_key: concept.key });
    });
    return select;
  }

  function removeSection(section: OrganiserSection): void {
    void askConfirmCard({
      title: `Delete “${section.name}”?`,
      supporting: `Its ${plural(section.lines.length, 'line')} are deleted too, and students lose them.`,
      confirmLabel: 'Delete section'
    }).then((ok) => { if (ok) void send({ op: 'delete_section', section_id: section.id }); });
  }

  // ---- side panels -------------------------------------------------------------------------

  function sideRow(section: OrganiserSection, line: OrganiserLine): HTMLElement {
    const { cue, answer, rest } = columnSlots(section);
    const item = h('div', 'ko-item');
    const row = h('div', 'ko-linerow');
    const inner = h('div', 'ko-more__in');
    const columns = section.columns ?? [];
    if (section.kind === 'table' && cue !== -1) {
      // A table line is one short line, its name; everything else opens under it, as a concept does.
      const nameOf = (): string => (localCells.get(line.id) ?? line.cells)[cue]?.trim() || 'Untitled';
      const more = chevron(line.id, `Open ${nameOf()}`);
      const name = h('button', 'ko-sidename', nameOf());
      name.type = 'button';
      name.tabIndex = -1;
      name.addEventListener('click', () => more.click());
      row.append(name, more);
      const fields = moreFields(section, line, [cue, answer, ...rest].filter((i) => i !== -1));
      fields[0]?.querySelector('textarea')?.addEventListener('input', () => { name.textContent = nameOf(); });
      inner.append(...fields);
    } else {
      const pair = h('div', 'ko-pair');
      if (cue !== -1) pair.append(cellField(section, line, cue, columns[cue]?.label ?? 'Name', 'ko-edit ko-edit--name'));
      if (answer !== -1) pair.append(cellField(section, line, answer, columns[answer]?.label ?? 'Detail'));
      row.append(pair, chevron(line.id, 'More'));
      inner.append(...moreFields(section, line, rest));
    }
    if (section.role === 'vocab') {
      const levels = h('div', 'ko-tools');
      levels.append(h('span', 'ko-label', 'Level'));
      for (const tier of [1, 2, 3] as VocabTier[]) {
        const button = quiet(`Tier ${tier}`, () => void send({ op: 'update_line', line_id: line.id, tier: line.tier === tier ? null : tier }));
        button.setAttribute('aria-pressed', String(line.tier === tier));
        levels.append(button);
      }
      inner.append(levels);
    }
    inner.append(lineTools(section, line));
    item.append(row, fold(line.id, inner));
    return item;
  }

  function sideBody(section: OrganiserSection, into: HTMLElement): void {
    if (section.role !== 'vocab') {
      for (const line of section.lines) into.append(sideRow(section, line));
      return;
    }
    for (const tier of [1, 2, 3, undefined] as Array<VocabTier | undefined>) {
      const words = section.lines.filter((l) => l.tier === tier);
      if (!words.length) continue;
      const head = h('div', 'ko-tier');
      if (tier) {
        const bars = h('span', 'ko-bars');
        bars.setAttribute('aria-hidden', 'true');
        for (const n of [1, 2, 3]) bars.append(h('i', n <= tier ? 'on' : undefined));
        head.append(bars, `Tier ${tier} `, h('span', undefined, `· ${TIER_WORDS[tier]}`));
      } else {
        head.append('No level yet');
      }
      into.append(head);
      for (const line of words) into.append(sideRow(section, line));
    }
  }

  function sidePanel(name: string, add: string, role: OrganiserRole | undefined, section: OrganiserSection | undefined): HTMLElement {
    const box = h('section', 'ko-panel');
    box.dataset.panel = role ?? section?.id ?? '';
    const head = h('div', 'ko-panel__head');
    const tools = h('div', 'ko-panel__tools');
    tools.append(...sideTools(name, add, role, section));
    if (section && !role) tools.append(quiet('Delete', () => removeSection(section), 'ko-quiet--danger'));
    head.append(h('h3', 'ko-panel__name', name), tools);
    box.append(head);
    if (section) sideBody(section, box);
    sideExtras(box, name, role, section);
    return box;
  }

  /** Add, Paste and Open all for a list of lines. */
  function sideTools(name: string, add: string, role: OrganiserRole | undefined, section: OrganiserSection | undefined): HTMLElement[] {
    const id = `side:${role ?? section?.id}`;
    const tools: HTMLElement[] = [
      quiet(`+ ${add}`, () => openDraft(id)),
      quiet('Paste', () => {
        const ready = role ? ensureRole(role, name) : Promise.resolve(section);
        void ready.then((target) => { if (target) togglePanel({ kind: 'paste', at: target.id }); });
      })
    ];
    if (section?.lines.length) {
      const allOpen = section.lines.every((line) => open.has(line.id));
      tools.push(quiet(allOpen ? 'Close all' : 'Open all', () => {
        for (const line of section.lines) {
          if (allOpen) open.delete(line.id);
          else open.add(line.id);
        }
        render();
      }));
    }
    return tools;
  }

  /** The typing row and the paste box, when either is open. */
  function sideExtras(box: HTMLElement, name: string, role: OrganiserRole | undefined, section: OrganiserSection | undefined): void {
    const id = `side:${role ?? section?.id}`;
    if (drafts.has(id)) {
      const single = (section?.kind ?? (role === 'story' ? 'sequence' : 'table')) !== 'table';
      const labels = single ? ['Next step'] : section ? [section.columns?.find((c) => !c.hide)?.label ?? 'Name', section.columns?.find((c) => c.hide)?.label ?? 'Detail'] : role === 'vocab' ? ['Word', 'Meaning'] : role === 'key_lines' ? ['Line', 'Who'] : ['Label', 'Detail'];
      box.append(draftRow(id, labels, (values) => {
        const ready = role ? ensureRole(role, name) : Promise.resolve(section);
        void ready.then((target) => {
          if (!target) return;
          const { cue, answer } = columnSlots(target);
          const cells = target.kind === 'table' ? (target.columns ?? []).map(() => '') : [''];
          if (target.kind !== 'table') cells[0] = values[0] ?? '';
          else {
            if (cue !== -1) cells[cue] = values[0] ?? '';
            if (answer !== -1) cells[answer] = values[1] ?? '';
          }
          void send({ op: 'add_lines', section_id: target.id, lines: [{ cells }] });
        });
      }));
    }
    if (section && panel?.kind === 'paste' && panel.at === section.id) box.append(pastePanel(section));
  }

  /** Vocabulary under the concepts: closed to its count, and open like a concept card. */
  function vocabCard(): HTMLElement {
    const section = sectionOf('vocab');
    const id = 'card:vocab';
    const card = h('article', 'ko-concept ko-vocab');
    const top = h('div', 'ko-concept__row ko-vocab__row');
    const meta = h('div', 'ko-concept__meta');
    meta.append(h('span', 'ko-capsule', 'Vocabulary'), h('span', 'ko-count', plural(section?.lines.length ?? 0, 'word')));
    const more = chevron(id, 'Vocabulary');
    meta.addEventListener('click', () => more.click());
    top.append(meta, more);
    card.append(top);
    const body = h('div', 'ko-vocab__body');
    body.dataset.panel = 'vocab';
    if (section) sideBody(section, body);
    sideExtras(body, 'Vocabulary', 'vocab', section);
    const foot = h('div', 'ko-foot');
    foot.append(...sideTools('Vocabulary', 'Add word', 'vocab', section));
    card.append(fold(id, body, foot));
    return card;
  }

  function togglePanel(next: NonNullable<typeof panel>): void {
    panel = panel?.kind === next.kind && panel.at === next.at ? null : next;
    render();
  }

  function pastePanel(section: OrganiserSection): HTMLElement {
    const width = section.kind === 'table' ? (section.columns ?? []).length : 1;
    const labels = section.kind === 'table' ? (section.columns ?? []).map((c) => c.label).join(', ') : 'one item';
    const wrap = h('div', 'ko-paste ko-bring');
    wrap.append(h('p', 'ko-bring__head', `Paste rows from Word or Sheets: ${labels}.`));
    const area = h('textarea');
    area.value = pasteText;
    area.setAttribute('aria-label', 'Pasted rows');
    const count = h('p', 'ko-status');
    const update = (): void => {
      const rows = parsePaste(area.value, width);
      count.textContent = rows.length ? `${plural(rows.length, 'row')} ready.` : 'Nothing to add yet.';
      add.disabled = !rows.length;
    };
    const add = h('button', 'btn btn--primary ko-btn', 'Add these rows');
    add.type = 'button';
    add.addEventListener('click', () => {
      const rows = parsePaste(area.value, width);
      if (!rows.length) return;
      add.disabled = true;
      pasteText = '';
      panel = null;
      void send({ op: 'add_lines', section_id: section.id, lines: rows.map((cells) => ({ cells })) });
    });
    area.addEventListener('input', () => { pasteText = area.value; update(); });
    update();
    const actions = h('div', 'ko-actions');
    actions.append(add, quiet('Close', () => { panel = null; render(); }));
    wrap.append(area, count, actions);
    return wrap;
  }

  // ---- bringing lines in -------------------------------------------------------------------

  function addItems(row: ConceptRow, chosen: BringItem[]): Promise<void> {
    return ensureConcept(row).then(async (target) => {
      if (!target) throw new Error('not added');
      // Copies only: the lesson that teaches a line ticks it.
      const lines = chosen.map((item) => {
        const { cells, piece_id } = bringLine(item, target);
        return { cells, ...(piece_id ? { piece_id } : {}) };
      });
      if (!(await send({ op: 'add_lines', section_id: target.id, lines }))) throw new Error('not added');
    });
  }

  function syllabusHolder(row: ConceptRow): HTMLElement {
    return renderBringPanel({
      title: `Syllabus points for ${row.name}`,
      items: freshItems(syllabusItems(row), data?.organiser ?? { sections: [] }),
      startTicked: false,
      onAdd: (chosen) => addItems(row, chosen),
      onClose: () => { panel = null; render(); }
    });
  }

  function bringData() {
    bringCache ??= (async () => {
      const lessons = await loadUnitLessons(order);
      const deep = unit.deep_understandings ?? [];
      const plan = curriculum.scope_sequences
        .find((scope) => scope.subject_id === unit.subject_id && scope.knowledge_plan)
        ?.knowledge_plan?.units.find((row) => row.unit_id === unit.id);
      return {
        deep: deepItems(deep, lessons, order),
        anthology: anthologyItems(anthologyFromLessons(lessons, order)),
        plan: planItems(plan, lessons, order, deep)
      };
    })();
    return bringCache;
  }

  function bringHolder(row: ConceptRow): HTMLElement {
    const source = panel?.source ?? 'deep';
    const wrap = h('div', 'ko-bringwrap');
    const pills = h('div', 'ko-pills');
    for (const each of ['deep', 'anthology', 'plan'] as BringSource[]) {
      const pill = h('button', 'ko-pill', BRING_LABEL[each]);
      pill.type = 'button';
      pill.setAttribute('aria-pressed', String(each === source));
      pill.addEventListener('click', () => { panel = { kind: 'bring', at: row.id, source: each }; render(); });
      pills.append(pill);
    }
    const holder = h('div');
    holder.append(h('p', 'ko-status', 'Loading…'));
    wrap.append(pills, holder);
    void bringData().then(
      (all) => {
        if (disposed || !holder.isConnected || !data) return;
        holder.replaceChildren(
          renderBringPanel({
            title: BRING_LABEL[source],
            items: freshItems(all[source], data.organiser),
            onAdd: (chosen) => addItems(row, chosen),
            onClose: () => { panel = null; render(); }
          })
        );
      },
      () => {
        holder.replaceChildren(h('p', 'ko-status ko-status--bad', 'Could not read the source. Close this and try again.'));
      }
    );
    return wrap;
  }

  // ---- banner ------------------------------------------------------------------------------

  function printFor(classId: string): void {
    printing = false;
    say('Getting the sheet…');
    render();
    void organiserApi
      .get(unit.id, classId)
      .then((res) => {
        if (disposed) return;
        if (!res.sheet || !res.sheet.sections.length) {
          say('Nothing has gone out to that class yet, so there is nothing to print.');
          render();
          return;
        }
        say('');
        render();
        printOrganiser(res.sheet);
      })
      .catch((error: unknown) => {
        say(reason(error), true);
        render();
      });
  }

  function hero(): HTMLElement {
    const box = h('header', 'ko-hero');
    const top = h('div', 'ko-hero__top');
    const title = h('div');
    title.append(h('p', 'ko-hero__crumb', `${unit.title} · Unit plan`), h('h2', 'ko-hero__title', 'Organiser'));
    const right = h('div', 'ko-hero__right');
    const stats = h('div', 'ko-hero__stats');
    const count = (role: OrganiserRole): number => sections().filter((s) => s.role === role && !s.off).reduce((n, s) => n + s.lines.length, 0);
    const rows: Array<[number, string]> = [
      [conceptRows().length, 'concepts'],
      [count('concept') + count('ideas'), 'key ideas'],
      [count('facts'), 'facts'],
      [count('vocab'), 'words']
    ];
    for (const [n, word] of rows) {
      const span = h('span');
      span.append(h('b', undefined, String(n)), ` ${word}`);
      stats.append(span);
    }
    const print = h('button', 'ko-hero__print', 'Print');
    print.type = 'button';
    print.disabled = !classes.length;
    if (!classes.length) print.title = 'Give this unit to a class first.';
    print.addEventListener('click', () => {
      if (classes.length === 1) return printFor(classes[0]!.id);
      printing = !printing;
      render();
    });
    right.append(stats, print);
    top.append(title, right);
    box.append(top);

    const row = h('div', 'ko-hero__row');
    const chips = h('div', 'ko-hero__chips');
    if (skillNames.length) {
      chips.append(h('span', undefined, 'Skills'));
      for (const name of skillNames) chips.append(h('span', 'ko-hero__chip', name));
    }
    const ticks = h('div', 'ko-hero__ticks');
    for (const spec of SIDE_ROLES.filter((s) => s.optional)) {
      const label = h('label');
      const check = h('input');
      check.type = 'checkbox';
      const held = sectionOf(spec.role);
      check.checked = !!held && !held.off;
      check.addEventListener('change', () => {
        if (held) void send({ op: 'update_section', section_id: held.id, off: !check.checked });
        else void send({ op: 'add_section', role: spec.role, name: spec.name });
      });
      label.append(check, h('span', undefined, spec.name));
      ticks.append(label);
    }
    row.append(chips, ticks);
    box.append(row);
    if (printing && classes.length > 1) {
      const ask = h('div', 'ko-hero__chips');
      ask.append(h('span', undefined, 'Print for which class?'));
      for (const klass of classes) {
        const pick = h('button', 'ko-hero__chip', klass.label);
        pick.type = 'button';
        pick.addEventListener('click', () => printFor(klass.id));
        ask.append(pick);
      }
      box.append(ask);
    }
    return box;
  }

  // ---- drawing -----------------------------------------------------------------------------

  function render(): void {
    if (disposed) return;
    renderPending = false;
    root.replaceChildren(hero());
    if (status) {
      const line = h('p', `ko-status${statusBad ? ' ko-status--bad' : ''}`, status);
      line.setAttribute('role', 'status');
      root.append(line);
    }
    if (loadFailed) {
      const again = h('button', 'btn btn--ghost ko-btn', 'Try again');
      again.type = 'button';
      again.addEventListener('click', load);
      root.append(h('p', 'ko-status ko-status--bad', 'The organiser could not be loaded.'), again);
      return;
    }
    if (!data) {
      root.append(h('p', 'ko-status', 'Loading the organiser…'));
      return;
    }

    const grid = h('div', 'ko-grid');
    const left = h('section', 'ko-column');
    const head = h('div', 'ko-panel__head');
    const tools = h('div', 'ko-panel__tools');
    const rows = conceptRows();
    const allOpen = rows.length > 0 && rows.every((row) => open.has(row.id));
    tools.append(addConcept(), quiet(allOpen ? 'Close all' : 'Open all', () => {
      for (const row of rows) {
        if (allOpen) open.delete(row.id);
        else open.add(row.id);
      }
      render();
    }));
    head.append(h('h3', 'ko-panel__name', 'Concepts'), tools);
    left.append(head);
    const loose = sectionOf('ideas');
    if (loose?.lines.length) left.append(looseIdeas(loose));
    for (const row of rows) left.append(conceptCard(row));
    left.append(vocabCard());

    const right = h('div', 'ko-column');
    for (const spec of SIDE_ROLES) {
      const section = sectionOf(spec.role);
      if (spec.optional && (!section || section.off)) continue;
      right.append(sidePanel(spec.name, spec.add, spec.role, section));
    }
    for (const section of sections().filter((s) => !s.role)) right.append(sidePanel(section.name, 'Add line', undefined, section));

    grid.append(left, right);
    root.append(grid);
    root.querySelectorAll<HTMLTextAreaElement>('textarea.ko-edit').forEach(fitField);
    const run = focusAfter;
    focusAfter = null;
    run?.();
  }

  const onFocusOut = (): void => {
    window.setTimeout(() => {
      if (!renderPending || disposed) return;
      if (host.contains(document.activeElement) && isField(document.activeElement)) return;
      render();
    }, 0);
  };
  root.addEventListener('focusout', onFocusOut);
  root.addEventListener('input', (event) => {
    if (event.target instanceof HTMLTextAreaElement && event.target.classList.contains('ko-edit')) fitField(event.target);
  });

  load();

  return {
    dispose() {
      // Edits still waiting for their delay go now, so leaving the page loses nothing.
      for (const lineId of [...localCells.keys()]) flushLine(lineId);
      for (const sectionId of [...localSentences.keys()]) flushSentence(sectionId);
      disposed = true;
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
      root.removeEventListener('focusout', onFocusOut);
      root.remove();
    }
  };
}
