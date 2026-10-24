import type { Lesson } from '@/schemas/lesson';
import { button, el } from '@/quiz/dom';
import { PHASE_LABELS, SPRINT_LIMITS, SPRINT_PHASES, UNDERSTAND_ALONE, UNDERSTAND_GROUP, UNDERSTAND_STEP_LABELS, defaultUnderstand, type SprintGroup, type SprintPhase, type SprintPhaseKey, type SprintSettings, type UnderstandSettings } from './schema';
import { newSprintSettings } from './defaults';
import { noteEl, type KitNoteKey } from './notes';
import { phaseSpans, renderPhaseGantt } from './phase-timeline';

export type KitEditorOptions = {
  getLesson: () => Lesson;
  emit: (next: Lesson) => void;
  /** The classes that teach this unit; the sprint belongs to one. */
  classes: Array<{ id: string; name: string }>;
  loadRoster: (classId: string) => Promise<Array<{ id: string; name: string; initials: string }>>;
  /** Outcomes the lesson's dot points reach, for linking criteria. */
  outcomes: () => Promise<Array<{ id: string; label: string }>>;
};

/** 10 lowercase letters and digits: valid as a markbook criterion id too. */
export function kitId(): string {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) out += a[b % a.length];
  return out;
}

/** n groups, students in roster order, as even as possible. */
export function evenGroups(students: ReadonlyArray<{ id: string }>, n: number): SprintGroup[] {
  const count = Math.max(1, Math.min(SPRINT_LIMITS.groups, n));
  const groups: SprintGroup[] = Array.from({ length: count }, (_, i) => ({ id: kitId(), name: `Group ${i + 1}`, students: [] }));
  const size = Math.ceil(students.length / count);
  students.forEach((s, i) => groups[Math.min(count - 1, Math.floor(i / size))]!.students.push(s.id));
  return groups.filter((g) => g.students.length);
}

const SHORT: Record<SprintPhaseKey, string> = { understand: 'U', sketch: 'S', decide: 'D', prototype: 'P', test: 'T' };

/**
 * The Kit: everything set once and used through the phases. Every change
 * emits the whole lesson, as the canvas does; the page autosaves it.
 */
export function mountKitEditor(o: KitEditorOptions): { root: HTMLElement; repaint(): void; dispose(): void } {
  const root = el('section', 'kit');
  let outcomes: Array<{ id: string; label: string }> = [];
  let roster: Array<{ id: string; name: string; initials: string }> = [];
  const openNotes = new Set<string>();
  let picked: SprintPhaseKey | null = null;
  const s = (): SprintSettings => o.getLesson().sprint ?? newSprintSettings(o.classes[0]?.id ?? '');
  const put = (change: (draft: SprintSettings) => void, repaint = false) => {
    const draft = structuredClone(s());
    change(draft);
    o.emit({ ...o.getLesson(), sprint: draft });
    if (repaint) paint();
  };
  const card = (title: string, why: string, note: KitNoteKey) => {
    const c = el('div', 'kit-card');
    c.append(el('h3', '', title), el('p', 'kit-why', why), noteEl(note, openNotes));
    root.append(c);
    return c;
  };
  const text = (value: string, max: number, onInput: (v: string) => void, label: string) => {
    const i = el('input', 'qz-input');
    i.maxLength = max;
    i.value = value;
    i.setAttribute('aria-label', label);
    i.addEventListener('input', () => onInput(i.value));
    return i;
  };
  const selectOf = (options: Array<[string, string]>, value: string, onChange: (v: string) => void, label: string) => {
    const sel = el('select', 'qz-input');
    sel.setAttribute('aria-label', label);
    for (const [v, l] of options) { const op = el('option', '', l); op.value = v; op.selected = v === value; sel.append(op); }
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  };

  /** One phase's settings, shown under the chart when its bar is picked. */
  function phaseEditor(p: SprintPhase, i: number): HTMLElement {
    const box = el('div', 'kit-phase-edit');
    box.dataset.phase = p.key;
    const name = PHASE_LABELS[p.key];
    const row = el('div', 'kit-phase-edit__row');
    const date = el('input', 'qz-input');
    date.type = 'date';
    date.value = p.due_date;
    date.setAttribute('aria-label', `${name} closes on`);
    date.addEventListener('change', () => put((d) => {
      const ph = d.phases[i]!;
      ph.due_date = date.value;
      // The lesson end time is on the close day.
      if (ph.ends_at) ph.ends_at = date.value ? `${date.value}T${ph.ends_at.slice(11)}` : '';
    }, true));
    const time = el('input', 'qz-input');
    time.type = 'time';
    time.value = p.due_time;
    time.setAttribute('aria-label', `${name} closes at`);
    time.addEventListener('change', () => put((d) => { d.phases[i]!.due_time = time.value; }, true));
    row.append(
      el('b', '', name),
      selectOf([['class', 'In class'], ['home', 'At home']], p.where, (v) => put((d) => { d.phases[i]!.where = v as 'class' | 'home'; if (v === 'home') d.phases[i]!.ends_at = ''; }, true), `${name} where`),
      el('label', '', 'Closes'), date, time
    );
    box.append(row);
    if (p.where === 'class') {
      const lockRow = el('div', 'kit-phase-edit__row');
      const tick = el('input');
      tick.type = 'checkbox';
      tick.id = `kit-lock-${p.key}`;
      tick.checked = !!p.ends_at;
      const lab = el('label', '', 'Lock work when the lesson ends at');
      lab.htmlFor = tick.id;
      const at = el('input', 'qz-input');
      at.type = 'time';
      at.value = p.ends_at ? p.ends_at.slice(11) : '';
      at.disabled = !p.ends_at;
      at.setAttribute('aria-label', `${name} lesson ends at`);
      tick.addEventListener('change', () => put((d) => { d.phases[i]!.ends_at = tick.checked && d.phases[i]!.due_date ? `${d.phases[i]!.due_date}T${at.value || '12:30'}` : ''; }, true));
      at.addEventListener('change', () => put((d) => { if (d.phases[i]!.due_date && at.value) d.phases[i]!.ends_at = `${d.phases[i]!.due_date}T${at.value}`; }, true));
      lockRow.append(tick, lab, at);
      box.append(lockRow, el('p', 'kit-why', p.due_date ? `Or press End class part on the progress map. Work then locks for ${s().lock_hours} h.` : 'Set the close day first. Or press End class part on the progress map.'));
    }
    const what = el('textarea', 'qz-input');
    what.rows = 2;
    what.maxLength = 600;
    what.value = p.instruction;
    what.placeholder = 'What students do in this phase, in one or two sentences.';
    what.setAttribute('aria-label', `${name}: what students do`);
    what.addEventListener('input', () => put((d) => { d.phases[i]!.instruction = what.value; }));
    const stretch = text(p.stretch, 300, (v) => put((d) => { d.phases[i]!.stretch = v; }), `${name}: stretch`);
    stretch.placeholder = 'An extra step for students who finish early.';
    box.append(el('label', 'kit-label', 'What students do'), what, el('label', 'kit-label', 'Stretch (optional)'), stretch);
    return box;
  }

  function paint(): void {
    root.replaceChildren(noteEl('overview', openNotes, 'How a sprint runs'));
    const cur = s();

    const settings = card('Settings', 'How much scaffolding shows, who chooses the group’s idea, ideas each puts forward, the rapid ideas timer, stand-out dots and the class lock.', 'settings');
    settings.append(
      selectOf([['guided', 'Guided (Years 7–8)'], ['standard', 'Standard (Years 9–10)'], ['open', 'Open (Years 11–12)']], cur.support, (v) => put((d) => { d.support = v as SprintSettings['support']; }), 'Support level'),
      selectOf([['teacher', 'Teacher confirms'], ['top_vote', 'Top vote goes through']], cur.decider, (v) => put((d) => { d.decider = v as SprintSettings['decider']; }), 'Who decides'),
      selectOf([1, 2, 3, 4, 5].map((n) => [String(n), `Each puts forward ${n} ${n === 1 ? 'idea' : 'ideas'}`]), String(cur.phases[1]!.ideas ?? 2), (v) => put((d) => { d.phases[0]!.ideas = Number(v); d.phases[1]!.ideas = Number(v); }), 'Ideas each student puts forward'),
      selectOf([0, 3, 5, 8, 10, 15].map((n) => [String(n), n ? `Rapid ideas: ${n} minute timer` : 'Rapid ideas: no timer']), String(cur.sketch_timer ?? 8), (v) => put((d) => { d.sketch_timer = Number(v); }), 'Rapid ideas timer'),
      selectOf([0, 1, 2, 3, 4, 5].map((n) => [String(n), n ? `Decide: ${n} stand-out ${n === 1 ? 'dot' : 'dots'} each` : 'Decide: no stand-out dots']), String(cur.decide_dots ?? 3), (v) => put((d) => { d.decide_dots = Number(v); }), 'Stand-out dots'),
      selectOf([0, 1, 2, 3, 4, 6, 12, 24].map((n) => [String(n), n === 0 ? 'No class lock' : `Lock for ${n} h`]), String(cur.lock_hours), (v) => put((d) => { d.lock_hours = Number(v); }), 'Class lock')
    );

    const und = card('Understand', 'How students work out the problem: alone first, then together. Untick a step to leave it out.', 'understand');
    const u = cur.understand ?? defaultUnderstand();
    und.append(selectOf([['slides', 'One step at a time (slides)'], ['vertical', 'All steps down the page']], u.layout, (v) => put((d) => { d.understand = { ...(d.understand ?? defaultUnderstand()), layout: v as UnderstandSettings['layout'] }; }), 'Understand layout'));
    for (const [title, keys] of [['Alone, on their own computer', UNDERSTAND_ALONE], ['Together, in the group’s space', UNDERSTAND_GROUP]] as const) {
      und.append(el('p', 'kit-label', title));
      for (const k of keys) {
        const row = el('div', 'kit-phase-edit__row');
        const tick = el('input');
        tick.type = 'checkbox';
        tick.id = `kit-und-${k}`;
        tick.checked = u.steps[k] !== false;
        tick.addEventListener('change', () => put((d) => { const cu = d.understand ?? defaultUnderstand(); d.understand = { ...cu, steps: { ...cu.steps, [k]: tick.checked } }; }));
        const lab = el('label', '', UNDERSTAND_STEP_LABELS[k]);
        lab.htmlFor = tick.id;
        row.append(tick, lab);
        und.append(row);
      }
    }

    const crit = card('Criteria', 'Judged on Starting · Showing · Strong. Used for idea cards, votes and the class’s pitch feedback.', 'criteria');
    cur.criteria.forEach((c, i) => {
      const row = el('div', 'kit-row kit-criterion');
      row.append(
        text(c.text, 160, (v) => put((d) => { d.criteria[i]!.text = v; }), 'Criterion'),
        selectOf([['', 'No outcome'], ...outcomes.map((x): [string, string] => [x.id, x.label])], c.outcome ?? '', (v) => put((d) => { if (v) d.criteria[i]!.outcome = v; else delete d.criteria[i]!.outcome; }), 'Outcome'),
        button('Remove', 'ghost', () => put((d) => { d.criteria.splice(i, 1); }, true))
      );
      crit.append(row);
    });
    const addC = button('+ Criterion', 'ghost', () => put((d) => { d.criteria.push({ id: kitId(), text: 'New criterion' }); }, true));
    addC.dataset.add = 'criterion';
    addC.disabled = cur.criteria.length >= SPRINT_LIMITS.criteria;
    crit.append(addC);

    const refl = card('Reflection', 'Two prompts students answer at home after the pitch. Marking it is optional: press Mark reflections on a group’s board if you want it in your markbook.', 'reflection');
    refl.append(
      text(cur.reflection_criteria[0]?.text ?? '', 160, (v) => put((d) => { d.reflection_criteria = [{ ...(d.reflection_criteria[0] ?? { id: kitId() }), text: v }]; }), 'Reflection criterion'),
      ...[0, 1].map((i) => text(cur.reflection_prompts[i] ?? '', 200, (v) => put((d) => { d.reflection_prompts[i] = v; }), `Reflection prompt ${i + 1}`))
    );

    const req = card('Requirements', 'Must-haves, yes or no. Students tick each one and say where it is.', 'requirements');
    cur.requirements.forEach((r, i) => {
      const row = el('div', 'kit-row kit-requirement');
      row.append(text(r.text, 160, (v) => put((d) => { d.requirements[i]!.text = v; }), 'Requirement'));
      const chips = el('span', 'kit-chips');
      for (const key of SPRINT_PHASES) {
        const on = r.phases.includes(key);
        const chip = el('button', `kit-chip${on ? ' kit-chip--on' : ''}`, SHORT[key]);
        chip.type = 'button';
        chip.dataset.phase = key;
        chip.title = PHASE_LABELS[key];
        chip.setAttribute('aria-pressed', String(on));
        chip.addEventListener('click', () => put((d) => {
          const p = d.requirements[i]!.phases;
          d.requirements[i]!.phases = on ? p.filter((x) => x !== key) : [...p, key];
        }, true));
        chips.append(chip);
      }
      row.append(chips, button('Remove', 'ghost', () => put((d) => { d.requirements.splice(i, 1); }, true)));
      req.append(row);
    });
    const addR = button('+ Requirement', 'ghost', () => put((d) => { d.requirements.push({ id: kitId(), text: 'New requirement', phases: ['sketch', 'prototype'] }); }, true));
    addR.dataset.add = 'requirement';
    addR.disabled = cur.requirements.length >= SPRINT_LIMITS.requirements;
    req.append(addR, el('p', 'kit-why', 'U Understand · S Sketch · D Decide · P Prototype · T Test'));

    const guide = card('Idea guide', 'Shown in Sketch and Decide. Write the model on a different topic from the challenge, so students follow it without copying it.', 'idea_guide');
    const lines = el('textarea', 'qz-input');
    lines.rows = 5;
    lines.value = cur.idea_guide.checklist.join('\n');
    lines.setAttribute('aria-label', 'Good idea checklist, one per line');
    lines.addEventListener('input', () => put((d) => { d.idea_guide.checklist = lines.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 8); }));
    const modelText = el('textarea', 'qz-input');
    modelText.rows = 3;
    modelText.value = cur.idea_guide.model.text;
    modelText.setAttribute('aria-label', 'Model idea');
    modelText.addEventListener('input', () => put((d) => { d.idea_guide.model.text = modelText.value; }));
    const notes = el('textarea', 'qz-input');
    notes.rows = 3;
    notes.value = cur.idea_guide.model.notes.join('\n');
    notes.setAttribute('aria-label', 'What each part of the model does, one per line');
    notes.addEventListener('input', () => put((d) => { d.idea_guide.model.notes = notes.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6); }));
    guide.append(el('label', 'kit-label', 'Good idea checklist'), lines, el('label', 'kit-label', 'Model topic'), text(cur.idea_guide.model.topic, 80, (v) => put((d) => { d.idea_guide.model.topic = v; }), 'Model topic'), el('label', 'kit-label', 'Model idea'), modelText, el('label', 'kit-label', 'What each part does'), notes);

    const phases = card('Phases and deadlines', 'You set when each phase closes. Each phase opens when the one above it closes. Click a bar to edit it.', 'phases');
    phases.append(renderPhaseGantt(phaseSpans(cur.phases, cur.lock_hours), { onPick: (key) => { picked = picked === key ? null : key; paint(); }, picked }));
    const pi = cur.phases.findIndex((p) => p.key === picked);
    if (pi >= 0) phases.append(phaseEditor(cur.phases[pi]!, pi));

    const groups = card('Groups', 'Groups for this sprint only. Students join by their initials.', 'groups');
    if (!o.classes.length) groups.append(el('p', 'kit-why', 'Add this unit to a class first.'));
    else {
      groups.append(selectOf(o.classes.map((c): [string, string] => [c.id, c.name]), cur.class_id, (v) => { put((d) => { d.class_id = v; d.groups = []; }); void loadRoster(v); }, 'Class'));
      const n = el('input', 'qz-input');
      n.type = 'number';
      n.min = '1';
      n.max = String(SPRINT_LIMITS.groups);
      n.value = String(Math.max(1, cur.groups.length || Math.ceil(roster.length / 4)));
      n.setAttribute('aria-label', 'How many groups');
      groups.append(n, button('Make even groups', 'secondary', () => put((d) => { d.groups = evenGroups(roster, Number(n.value)); }, true)));
      const byStudent = new Map(cur.groups.flatMap((g) => g.students.map((st) => [st, g.id] as const)));
      for (const g of cur.groups) {
        const name = text(g.name, 40, (v) => put((d) => { const x = d.groups.find((y) => y.id === g.id); if (x) x.name = v; }), 'Group name');
        // The students' group menus show the new name once typing is done.
        name.addEventListener('change', paint);
        groups.append(name);
      }
      for (const st of roster) {
        const row = el('div', 'kit-row');
        row.append(el('span', '', `${st.initials} · ${st.name}`), selectOf([['', 'No group'], ...cur.groups.map((g): [string, string] => [g.id, g.name])], byStudent.get(st.id) ?? '', (v) => put((d) => {
          d.groups = d.groups.map((g) => ({ ...g, students: g.students.filter((x) => x !== st.id) }));
          const to = d.groups.find((g) => g.id === v);
          if (to) to.students.push(st.id);
        }), `${st.name}'s group`));
        groups.append(row);
      }
    }
  }

  async function loadRoster(classId: string): Promise<void> {
    if (!classId) return;
    try { roster = await o.loadRoster(classId); } catch { roster = []; }
    paint();
  }

  paint();
  void o.outcomes().then((list) => { outcomes = list; paint(); }).catch(() => {});
  void loadRoster(s().class_id);
  return { root, repaint: paint, dispose() {} };
}
