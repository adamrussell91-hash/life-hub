import type { TeacherNoteBlock } from '@/toolkit/content';
import type { Block } from '@/schemas/block';
import { CATALOGUE, SERIES, seriesByKey, techniqueById } from '../../../../../packages/walkthrus/catalogue.mjs';
import { countsAsRep, hasLapsed, isToLog, repKey } from '../../../../../packages/walkthrus/reps.mjs';
import { isFusionId } from '../../../../../packages/walkthrus/tiles.mjs';
import { classLabel } from '@/toolkit/class-context';
import { createEditorFilter } from '@/blocks/editor-filter';
import { peekCurriculum } from '@/app/curriculum-state';
import {
  listAllReps, listReps, loadFusions, loadLiveGoal, loadWalkthruText, planRep, tapRep, unplanRep,
  type Fusion, type GoalLite, type Rep, type WalkthruTechniqueText
} from './api';
import { createStepTicks, RepSync, type StepTicks } from './ticks';

export type WalkthruContent = { set: number; id: string; jots: Record<string, string> };

function option(label: string, value: string, selected = false): HTMLOptionElement {
  const node = document.createElement('option');
  node.textContent = label;
  node.value = value;
  node.selected = selected;
  return node;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const STEPS = [1, 2, 3, 4, 5] as const;

/** The steps of a tile: a book technique's from the private text, a fusion's from the board. */
async function loadTileSteps(id: string): Promise<WalkthruTechniqueText | null> {
  if (isFusionId(id)) {
    const fusion = (await loadFusions()).find((f) => f.id === id);
    return fusion ? { id, steps: fusion.steps } : null;
  }
  return (await loadWalkthruText()).sets.flatMap((s) => s.techniques).find((t) => t.id === id) ?? null;
}

// ── the lesson's timetable slots for this note ───────────────────────────────

export interface Slot { lessonId: string; classId: string | null; label: string; endIso: string | null; delivered: boolean }

/** Each time this lesson is scheduled, or one open slot when it isn't on a timetable yet. */
export function lessonSlots(lessonId: string): Slot[] {
  const rows = (peekCurriculum()?.scheduled_lessons ?? []).filter((s) => s.lesson_id === lessonId);
  if (!rows.length) return [{ lessonId, classId: null, label: 'This lesson', endIso: null, delivered: false }];
  return rows
    .map((s) => {
      const d = new Date(`${s.date}T${s.end_time ?? '23:59'}:00`);
      return {
        lessonId,
        classId: s.class_id,
        label: `${classLabel(s.class_id)} · ${s.date}`,
        endIso: Number.isNaN(d.getTime()) ? null : d.toISOString(),
        delivered: s.delivery_status === 'delivered'
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

const planned = new Set<string>();

/** Tell the board a timetabled lesson will use this technique. Once per page load per lesson and class. */
function planSlots(id: string, slots: Slot[]): void {
  for (const slot of slots) {
    if (!slot.endIso) continue;
    const key = `${id}/${slot.lessonId}/${repKey(slot.lessonId, slot.classId)}`;
    if (planned.has(key)) continue;
    planned.add(key);
    void planRep({ technique_id: id, lesson_id: slot.lessonId, class_id: slot.classId, lesson_end: slot.endIso }).catch(() => planned.delete(key));
  }
}

/** A technique that has come off every note in the lesson no longer expects a rep. */
export function reconcilePlans(lessonId: string, pageBlocks: Block[] | undefined): void {
  if (!pageBlocks) return;
  const used = new Set(pageBlocks.flatMap((b) => (b.block_type === 'teacher_note' ? [(b as TeacherNoteBlock).content.walkthru?.id] : [])).filter(Boolean) as string[]);
  void listAllReps().then((reps) => {
    for (const rep of reps) {
      if (rep.lesson_id === lessonId && rep.state === 'planned' && !used.has(rep.technique_id)) {
        void unplanRep({ technique_id: rep.technique_id, lesson_id: lessonId, class_id: rep.class_id });
        planned.delete(`${rep.technique_id}/${lessonId}/${repKey(lessonId, rep.class_id)}`);
      }
    }
  }).catch(() => undefined);
}

// ── master steps with your notes ─────────────────────────────────────────────

function stepsList(master: WalkthruTechniqueText, goal: GoalLite | null, jots: Record<string, string>, ticks: StepTicks | null): HTMLElement {
  const list = el('ol', 'tk-wt__steps');
  for (const step of master.steps) {
    // One line per step to glance at in class; the book's full text opens on tap.
    const item = el('li', 'tk-wt__step');
    const body = ticks ? el('div', 'tk-wt__stepbody') : item;
    const more = el('details', 'tk-wt__more');
    more.append(el('summary', 'tk-wt__label', `${step.n}. ${step.label}`), el('p', 'tk-wt__text block-body', step.text));
    body.append(more);
    const adapted = goal?.walkthru?.adapted?.[String(step.n)];
    if (adapted) body.append(el('p', 'tk-wt__adapted', adapted));
    const jot = jots[String(step.n)];
    if (jot?.trim()) body.append(el('p', 'tk-wt__jot', jot));
    if (ticks) {
      item.classList.add('has-tick');
      item.append(ticks.button(step.n), body);
    }
    list.append(item);
  }
  return list;
}

/**
 * Where step ticks save. Only for the lesson's teacher view: callers leave it out on Display, in
 * the student view and anywhere without a lesson.
 */
export interface TickPlace { lessonId: string; slots: Slot[]; sync?: RepSync }

/** Master steps (fetched), then your adapted notes if a goal is behind it, then the day's jots. */
export function renderStepsInto(host: HTMLElement, techniqueId: string, jots: Record<string, string>, ticksAt: TickPlace | null = null): void {
  host.append(el('p', 'tk-wt__status block-secondary', 'Loading the steps…'));
  Promise.all([loadTileSteps(techniqueId), loadLiveGoal(techniqueId).catch(() => null)])
    .then(([master, goal]) => {
      if (!master?.steps.length) {
        host.replaceChildren(el('p', 'tk-wt__status block-secondary', isFusionId(techniqueId) ? 'This fusion has no steps on the board yet.' : 'The private file has no steps for this technique yet.'));
        return;
      }
      const ticks = ticksAt ? createStepTicks({ techniqueId, lessonId: ticksAt.lessonId, slots: ticksAt.slots, total: Math.min(9, master.steps.length), sync: ticksAt.sync }) : null;
      host.replaceChildren(...(ticks ? [ticks.el] : []), stepsList(master, goal, jots, ticks));
    })
    .catch(() => host.replaceChildren(el('p', 'tk-wt__status block-secondary', 'The steps couldn’t be loaded. Check the private WalkThrus file.')));
}

// ── rep strip ────────────────────────────────────────────────────────────────

const TAPS: Array<{ state: 'ran' | 'partly' | 'skipped'; label: string }> = [
  { state: 'ran', label: 'Ran it' },
  { state: 'partly', label: 'Partly' },
  { state: 'skipped', label: 'Didn’t get to it' }
];

function repStrip(techniqueId: string, lessonId: string, slots: Slot[], sync?: RepSync): HTMLElement {
  const strip = el('div', 'tk-wt__reps');
  strip.append(el('p', 'tk-wt__reps-title', 'After the lesson'));
  const rows = new Map<string, HTMLElement>();
  const byKey = new Map<string, Rep>();
  const now = (): number => Date.now();

  const paint = (slot: Slot): void => {
    const key = repKey(slot.lessonId, slot.classId);
    const row = rows.get(key)!;
    const rep = byKey.get(key);
    const ended = slot.delivered || !slot.endIso || Date.parse(slot.endIso) <= now();
    row.replaceChildren(el('span', 'tk-wt__slot', slot.label));
    if (rep && hasLapsed(rep, now())) {
      row.append(el('span', 'block-secondary', 'Lapsed. It counts as nothing.'));
      return;
    }
    if (!ended) {
      row.append(el('span', 'block-secondary', 'Opens when the lesson ends.'));
      return;
    }
    const group = el('div', 'tk-wt__taps');
    for (const tap of TAPS) {
      const b = el('button', 'btn btn--secondary btn--small', tap.label);
      b.type = 'button';
      const on = rep?.state === tap.state;
      b.setAttribute('aria-pressed', String(on));
      if (on) b.classList.add('is-on');
      b.addEventListener('click', () => {
        b.disabled = true;
        void tapRep({ technique_id: techniqueId, lesson_id: slot.lessonId, class_id: slot.classId, lesson_end: slot.endIso, state: tap.state, note: rep?.note })
          .then((next) => {
            if (next) byKey.set(key, next); else byKey.delete(key);
            sync?.set(key, next, strip);
            paint(slot);
          })
          .catch(() => { b.disabled = false; row.append(el('span', 'block-secondary', 'That didn’t save. Try again.')); });
      });
      group.append(b);
    }
    row.append(group);
    if (rep && countsAsRep(rep)) row.append(el('span', 'tk-wt__counted block-secondary', rep.state === 'partly' ? 'Counted as a rep (hollow dot)' : 'Counted as a rep'));
    else if (rep && isToLog(rep, now())) row.append(el('span', 'block-secondary', 'To log'));
  };

  sync?.on((key, rep, from) => {
    if (from === strip) return;
    if (rep) byKey.set(key, rep); else byKey.delete(key);
    for (const slot of slots) if (repKey(slot.lessonId, slot.classId) === key) paint(slot);
  });
  for (const slot of slots) {
    const row = el('div', 'tk-wt__rep-row');
    rows.set(repKey(slot.lessonId, slot.classId), row);
    strip.append(row);
    paint(slot);
  }
  listReps(techniqueId)
    .then((reps) => {
      for (const rep of reps) if (rep.lesson_id === lessonId) byKey.set(repKey(rep.lesson_id, rep.class_id), rep);
      for (const slot of slots) paint(slot);
    })
    .catch(() => strip.append(el('p', 'block-secondary', 'Reps couldn’t be loaded.')));
  return strip;
}

// ── the note section ─────────────────────────────────────────────────────────

/** A fusion's head: FUSED over its parents' codes, then its name, filled in once the board loads. */
function fusionHead(wrap: HTMLElement, id: string): void {
  const code = el('p', 'tk-wt__code', 'Fused');
  const name = el('p', 'tk-wt__name', 'Fusion');
  wrap.append(code, name);
  loadFusions()
    .then((fusions) => {
      const fusion: Fusion | undefined = fusions.find((f) => f.id === id);
      if (!fusion) return;
      const codes = fusion.parents.map((p) => techniqueById(p)?.page).filter((p) => p != null).map(String);
      code.textContent = codes.length ? `Fused | ${codes.join(' + ')}` : 'Fused';
      name.textContent = fusion.name;
    })
    .catch(() => undefined);
}

/**
 * Teacher view of a WalkThru note: the steps (with a tick on each in a lesson), your notes, and the
 * rep strip. The note can carry a book technique or a fusion from the board. Ticks never show on
 * Display (`ctx.display`); the note itself never reaches students.
 */
export function renderWalkthruSection(content: WalkthruContent, ctx: { lessonId?: string; pageBlocks?: Block[]; display?: boolean }): HTMLElement | null {
  const entry = techniqueById(content.id);
  const fusion = !entry && isFusionId(content.id);
  if (!entry && !fusion) return null;
  const wrap = el('section', 'tk-wt');
  wrap.dataset.technique = content.id;
  if (entry) {
    const series = entry.series ? seriesByKey(entry.series) : null;
    wrap.append(el('p', 'tk-wt__code', `${entry.code} | ${entry.page}${series ? ` · ${series.name}` : ''}`), el('p', 'tk-wt__name', entry.name));
  } else {
    fusionHead(wrap, content.id);
  }
  const steps = el('div', 'tk-wt__stepswrap');
  wrap.append(steps);
  const slots = ctx.lessonId ? lessonSlots(ctx.lessonId) : [];
  const sync = new RepSync();
  renderStepsInto(steps, content.id, content.jots, ctx.lessonId && !ctx.display ? { lessonId: ctx.lessonId, slots, sync } : null);
  if (ctx.lessonId) {
    planSlots(content.id, slots);
    reconcilePlans(ctx.lessonId, ctx.pageBlocks);
    wrap.append(repStrip(content.id, ctx.lessonId, slots, sync));
  }
  return wrap;
}

// ── editor fields ────────────────────────────────────────────────────────────

/** Technique picker and the day's jots for each step. `emit` receives the new content, or undefined for none. */
export function walkthruEditorFields(current: WalkthruContent | undefined, emit: (next: WalkthruContent | undefined) => void): HTMLElement {
  let content = current ? { ...current, jots: { ...current.jots } } : undefined;
  const wrap = el('div', 'tk-wt-ed');
  const jots = el('div', 'tk-wt-ed__jots');

  // 52 techniques is not a small choice, so it is the kit filter menu (with type-ahead), never a native select.
  // Fusions from the board join the list once they load.
  const bookOptions = [
    { value: '', label: 'None' },
    ...(CATALOGUE as unknown as Array<{ id: string; kind: string; code: string; name: string }>)
      .filter((e) => e.kind === 'technique')
      .map((e) => ({ value: e.id, label: `${e.name} · ${e.code}` }))
  ];
  let fusions: Fusion[] = [];
  const stepCount = (id: string): number => (isFusionId(id) ? Math.min(9, fusions.find((f) => f.id === id)?.steps.length || STEPS.length) : STEPS.length);
  const picker = createEditorFilter({
    key: 'WalkThru',
    ariaLabel: 'WalkThru technique',
    value: content?.id ?? '',
    defaultValue: '',
    options: bookOptions,
    onChange: (value) => {
      const entry = techniqueById(value);
      const isFusion = !entry && isFusionId(value);
      content = entry || isFusion ? { set: entry?.set ?? 1, id: value, jots: content?.id === value ? content.jots : {} } : undefined;
      paintJots();
      emit(content ? { ...content, jots: { ...content.jots } } : undefined);
    }
  });
  loadFusions()
    .then((list) => {
      fusions = list;
      if (!list.length) return;
      picker.setOptions([...bookOptions, ...list.map((f) => ({ value: f.id, label: `${f.name} · Fused` }))], content?.id ?? '');
      if (content && isFusionId(content.id)) paintJots();
    })
    .catch(() => undefined);
  const label = el('div', 'tk-ed__field');
  label.append(el('span', 'tk-ed__label', 'WalkThru technique'), picker.el);

  const paintJots = (): void => {
    jots.replaceChildren();
    if (!content) return;
    const id = content.id;
    jots.append(el('p', 'tk-ed__hint', 'Your notes for the day, under each step. Only you see these.'));
    for (let n = 1; n <= stepCount(id); n += 1) {
      const area = el('textarea', 'tk-ed__jot');
      area.rows = 2;
      area.maxLength = 2000;
      area.placeholder = `Step ${n}`;
      area.value = content.jots[String(n)] ?? '';
      area.setAttribute('aria-label', `Your notes for step ${n}`);
      area.addEventListener('input', () => {
        if (!content || content.id !== id) return;
        if (area.value.trim()) content.jots[String(n)] = area.value; else delete content.jots[String(n)];
        emit({ ...content, jots: { ...content.jots } });
      });
      jots.append(area);
    }
  };
  paintJots();
  wrap.append(label, jots);
  return wrap;
}
