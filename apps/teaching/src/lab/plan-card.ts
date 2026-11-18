import type { Lesson } from '@/schemas/lesson';
import { button, el, select, textArea, textInput } from '@/quiz/dom';
import {
  LAB_LANGUAGE_LEVELS,
  LAB_LEVELS,
  LAB_LEVEL_LABELS,
  explainBlockCurrent,
  labDefaults,
  seedLab,
  withExplainBlock,
  type LabJudge,
  type LabLanguageLevel,
  type LabLevel,
  type LabPair,
  type LabSettings
} from './schema';
import './lab.css';

export type LabRosterStudent = { id: string; name: string; initials: string };
export type LabPlanCardOptions = {
  getLesson: () => Lesson;
  emitLesson: (next: Lesson) => void;
  classes: Array<{ id: string; name: string }>;
  /** The class list, for Make pairs. */
  loadRoster: (classId: string) => Promise<LabRosterStudent[]>;
  /** Test seam for the shuffle. */
  random?: () => number;
};
export type LabPlanCardHandle = { root: HTMLElement; sync(): void; dispose(): void };

/** The class list in twos, in a shuffled order. An odd student out joins the last pair as a three. */
export function makePairs(studentIds: readonly string[], random: () => number = Math.random): LabPair[] {
  const order = [...studentIds];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const pairs: LabPair[] = [];
  for (let i = 0; i < order.length; i += 2) pairs.push({ id: `p${pairs.length + 1}`, students: order.slice(i, i + 2) });
  const last = pairs[pairs.length - 1];
  if (pairs.length > 1 && last && last.students.length === 1) {
    pairs.pop();
    pairs[pairs.length - 1]!.students.push(last.students[0]!);
  }
  return pairs;
}

/** One student moved to another pair. A pair left empty goes. */
export function movedPair(pairs: readonly LabPair[], studentId: string, toPairId: string): LabPair[] {
  return pairs
    .map((p) => {
      const others = p.students.filter((s) => s !== studentId);
      return { ...p, students: p.id === toPairId ? [...others, studentId] : others };
    })
    .filter((p) => p.students.length > 0);
}

/** A lab moved to another level: the question, why and debrief stay; how readers judge and the level's own lines reset to its defaults. */
export function switchLevel(settings: LabSettings, level: LabLevel): LabSettings {
  if (settings.level === level) return settings;
  const d = labDefaults(level);
  const next: LabSettings = { ...settings, level, judge: d.judge, threshold: d.threshold, notes_on: d.notes_on };
  if (d.ends && !next.ends) next.ends = d.ends;
  if (level === 'pairs') {
    if (!next.features?.length) next.features = d.features;
  } else {
    if (!next.options || next.options.length < 2) next.options = ['', ''];
    if (level === 'supplied') next.texts = next.options.map((_, i) => next.texts?.[i] ?? '');
  }
  return next;
}

const LEVEL_HELP: Record<LabLevel, string> = {
  supplied: 'You set the change and paste one version per option. The class is split so each version gets the same number of readers.',
  students: 'You set the change. Each student writes one version per option, so the lab gains a Make step.',
  pairs: 'Each pair makes one change to the control: a line break, a word, or a cut.'
};

/**
 * The Lab card: these lines are the whole lab, and the steps build themselves
 * from them. Every change emits the whole lesson, as the canvas does; the page
 * autosaves it.
 */
export function mountLabPlanCard(o: LabPlanCardOptions): LabPlanCardHandle {
  const root = el('section', 'lab-plan lab-card');
  let roster: LabRosterStudent[] = [];
  let rosterFor = '';
  let picked: string | null = null;
  let seen = '';
  let disposed = false;
  const error = el('p', 'lab-err');
  error.setAttribute('role', 'alert');

  const s = (): LabSettings => o.getLesson().lab ?? seedLab(o.classes[0]?.id ?? '');
  const put = (change: (draft: LabSettings) => LabSettings | void, repaint = false): void => {
    const draft = structuredClone(s());
    const next = change(draft) ?? draft;
    seen = JSON.stringify(next);
    const lesson = o.getLesson();
    const blocks = explainBlockCurrent(lesson.blocks, next) ? lesson.blocks : (withExplainBlock(lesson.blocks, next) as Lesson['blocks']);
    o.emitLesson({ ...lesson, lab: next, blocks });
    if (repaint) paint();
  };

  const row = (label: string, ...children: Array<HTMLElement | string>): HTMLElement => {
    const r = el('div', 'lab-row');
    const dd = el('dd');
    for (const child of children) dd.append(typeof child === 'string' ? el('small', '', child) : child);
    r.append(el('dt', '', label), dd);
    return r;
  };
  const line = (value: string, max: number, label: string, onInput: (v: string) => void, placeholder = ''): HTMLInputElement => {
    const input = textInput(value, max, placeholder);
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => onInput(input.value));
    return input;
  };
  const area = (value: string, max: number, rows: number, label: string, onInput: (v: string) => void, placeholder = ''): HTMLTextAreaElement => {
    const input = textArea(value, max, rows, placeholder);
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => onInput(input.value));
    return input;
  };
  const chip = (label: string, on: boolean, onClick: () => void, key?: string): HTMLButtonElement => {
    const b = el('button', `lab-chip lab-chip--plain${on ? ' is-on' : ''}`, label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(on));
    if (key) b.dataset.key = key;
    b.addEventListener('click', onClick);
    return b;
  };

  function optionsEditor(lab: LabSettings): HTMLElement {
    const box = el('div', 'lab-plan__options');
    box.style.display = 'grid';
    box.style.gap = 'var(--space-2)';
    const options = lab.options ?? [];
    options.forEach((option, i) => {
      const r = el('div', 'lab-plan__option');
      const input = line(option, 40, `Option ${i + 1}`, (v) => put((d) => { (d.options ??= [])[i] = v; }), `Option ${i + 1}`);
      // The option names label the texts below, so they are redrawn once the name is typed.
      input.addEventListener('change', () => paint());
      r.append(input);
      if (options.length > 2) {
        r.append(button('Remove', 'ghost', () => put((d) => {
          d.options = (d.options ?? []).filter((_, k) => k !== i);
          if (d.texts) d.texts = d.texts.filter((_, k) => k !== i);
        }, true)));
      }
      box.append(r);
    });
    if (options.length < 5) {
      const add = button('Add an option', 'secondary', () => put((d) => {
        d.options = [...(d.options ?? []), ''];
        if (d.level === 'supplied') d.texts = [...(d.texts ?? []), ''];
      }, true));
      add.dataset.act = 'add-option';
      box.append(add);
    }
    return box;
  }

  function featuresEditor(lab: LabSettings): HTMLElement {
    const box = el('div');
    box.style.display = 'grid';
    box.style.gap = 'var(--space-2)';
    (lab.features ?? []).forEach((feature, i) => {
      const r = el('div', 'lab-plan__feature');
      const level = select(LAB_LANGUAGE_LEVELS.map((l) => ({ value: l, label: l })), feature.level);
      level.setAttribute('aria-label', `Level of language for ${feature.name || `feature ${i + 1}`}`);
      level.addEventListener('change', () => put((d) => { d.features![i]!.level = level.value as LabLanguageLevel; }));
      r.append(
        line(feature.name, 60, `Feature ${i + 1}`, (v) => put((d) => { d.features![i]!.name = v; })),
        level,
        button('Remove', 'ghost', () => put((d) => { d.features = d.features!.filter((_, k) => k !== i); }, true))
      );
      box.append(r);
    });
    if ((lab.features ?? []).length < 12) box.append(button('Add a feature', 'secondary', () => put((d) => { d.features = [...(d.features ?? []), { name: 'New feature', level: 'Sentence' }]; }, true)));
    return box;
  }

  function pairsEditor(lab: LabSettings): HTMLElement {
    const box = el('div');
    box.style.display = 'grid';
    box.style.gap = 'var(--space-2)';
    const make = button(lab.pairs?.length ? 'Shuffle the pairs again' : 'Make pairs', 'secondary', () => void makeNow());
    make.dataset.act = 'make-pairs';
    make.disabled = !lab.class_id;
    box.append(make);
    const byId = new Map(roster.map((r) => [r.id, r]));
    const grid = el('div', 'lab-pairs');
    (lab.pairs ?? []).forEach((pair, i) => {
      const cell = el('div', 'lab-pair');
      cell.dataset.pair = pair.id;
      cell.append(el('p', 'lab-pair__name', `Pair ${i + 1}`));
      const move = (studentId: string) => {
        picked = null;
        put((d) => { d.pairs = movedPair(d.pairs ?? [], studentId, pair.id); }, true);
      };
      cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('is-target'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('is-target'));
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        const id = e.dataTransfer?.getData('text/plain');
        if (id) move(id);
      });
      for (const studentId of pair.students) {
        const who = byId.get(studentId);
        const c = chip(who?.initials ?? '–', picked === studentId, () => {
          picked = picked === studentId ? null : studentId;
          paint();
        });
        c.title = who?.name ?? 'Removed student';
        c.draggable = true;
        c.dataset.student = studentId;
        c.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', studentId));
        cell.append(c);
      }
      if (picked && !pair.students.includes(picked)) {
        const here = button('Move here', 'ghost', () => move(picked!));
        here.dataset.act = 'move-here';
        cell.append(here);
      }
      grid.append(cell);
    });
    if (lab.pairs?.length) box.append(grid, el('small', '', 'Drag a student to another pair, or select them and choose Move here. A student left over joins a group of three.'));
    else box.append(el('small', '', lab.class_id ? 'Make pairs shuffles the class list into twos. You can move students afterwards.' : 'Choose the class first.'));
    return box;
  }

  async function makeNow(): Promise<void> {
    const lab = s();
    error.textContent = '';
    try {
      roster = await o.loadRoster(lab.class_id);
      rosterFor = lab.class_id;
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : 'The class list didn’t load.';
      return;
    }
    if (disposed) return;
    if (!roster.length) {
      error.textContent = 'This class has no students on its list yet.';
      return;
    }
    put((d) => { d.pairs = makePairs(roster.map((r) => r.id), o.random); }, true);
  }

  function ensureRoster(lab: LabSettings): void {
    if (lab.level !== 'pairs' || !lab.class_id || rosterFor === lab.class_id) return;
    rosterFor = lab.class_id;
    void o.loadRoster(lab.class_id).then(
      (list) => {
        if (disposed || s().class_id !== rosterFor) return;
        roster = list;
        paint();
      },
      () => undefined
    );
  }

  function paint(): void {
    if (disposed) return;
    const lab = s();
    seen = JSON.stringify(lab);
    ensureRoster(lab);
    const pairsLevel = lab.level === 'pairs';
    const rows = el('dl', 'lab-rows');

    const classPick = select(o.classes.map((c) => ({ value: c.id, label: c.name })), lab.class_id, 'Choose a class');
    classPick.setAttribute('aria-label', 'Class');
    classPick.addEventListener('change', () => put((d) => {
      d.class_id = classPick.value;
      // Pairs are students of one class: a new class starts with none.
      delete d.pairs;
    }, true));
    rows.append(row('Class', classPick, 'The class whose list students claim their initials from.'));

    rows.append(row('Question', line(lab.question, 200, 'Question', (v) => put((d) => { d.question = v; }), 'Does the passive voice shrink the blame?'), 'One sentence. It heads every screen.'));
    if (pairsLevel) rows.append(row('Claim to test', line(lab.claim ?? '', 200, 'Claim to test', (v) => put((d) => { d.claim = v; }), 'The line breaks create the hesitation.')));
    rows.append(row('Why we are doing this', area(lab.why, 400, 2, 'Why we are doing this', (v) => put((d) => { d.why = v; })), 'Students see this with the question, and again when they write.'));

    if (!pairsLevel) {
      rows.append(row('Kept the same', line(lab.same ?? '', 300, 'Kept the same', (v) => put((d) => { d.same = v; }), 'The events, their order and the length of the paragraph.')));
      rows.append(row('Changed', optionsEditor(lab), 'Two to five options.'));
    }
    if (lab.level === 'students') rows.append(row('What students write', line(lab.task ?? '', 300, 'What students write', (v) => put((d) => { d.task = v; }), 'The moment the storm hits the house. Two or three sentences.')));
    if (lab.level === 'supplied') {
      const texts = el('div');
      texts.style.display = 'grid';
      texts.style.gap = 'var(--space-2)';
      (lab.options ?? []).forEach((option, i) => {
        const wrap = el('label');
        wrap.style.display = 'grid';
        wrap.style.gap = '2px';
        const input = area(lab.texts?.[i] ?? '', 4000, 4, `Text for ${option || `option ${i + 1}`}`, (v) => put((d) => {
          const list = (d.options ?? []).map((_, k) => d.texts?.[k] ?? '');
          list[i] = v;
          d.texts = list;
        }));
        input.classList.add('lab-plan__text');
        wrap.append(el('span', 'lab-label', option || `Option ${i + 1}`), input);
        texts.append(wrap);
      });
      rows.append(row('One text per option', texts, 'Paste the same passage once for each option, changing only what the option names.'));
    }
    if (pairsLevel) {
      const control = area(lab.control ?? '', 4000, 7, 'Control text', (v) => put((d) => { d.control = v; }));
      control.classList.add('lab-plan__text');
      rows.append(row('Control text', control, 'Any length. Line breaks are kept.'));
    }

    const levels = el('div', 'lab-chips');
    for (const level of LAB_LEVELS) levels.append(chip(LAB_LEVEL_LABELS[level], lab.level === level, () => put((d) => switchLevel(d, level), true), `level-${level}`));
    rows.append(row('Who decides the change', levels, LEVEL_HELP[lab.level]));

    const judges = el('div', 'lab-chips');
    const judgeChip = (judge: LabJudge, label: string) => {
      const c = chip(label, lab.judge === judge, () => put((d) => {
        d.judge = judge;
        d.threshold = judge === 'pick' ? 8 : 1;
        if (judge === 'rate' && !d.ends) d.ends = ['A little', 'Completely'];
      }, true), `judge-${judge}`);
      // Students write it is always picked from; a pair's version is always rated against the control.
      c.disabled = lab.level !== 'supplied' && lab.judge !== judge;
      return c;
    };
    judges.append(judgeChip('pick', 'Pick one'), judgeChip('rate', 'Rate on a line'));
    const judgeBits: Array<HTMLElement | string> = [
      judges,
      line(lab.judge_question, 200, 'The question readers answer', (v) => put((d) => { d.judge_question = v; }), lab.judge === 'pick' ? 'Which one feels most real?' : 'How much is the company to blame?')
    ];
    if (lab.judge === 'rate') {
      const ends = el('div', 'lab-plan__ends');
      ends.append(
        line(lab.ends?.[0] ?? '', 40, 'Label for the low end of the line', (v) => put((d) => { d.ends = [v, d.ends?.[1] ?? '']; }), 'A little'),
        line(lab.ends?.[1] ?? '', 40, 'Label for the high end of the line', (v) => put((d) => { d.ends = [d.ends?.[0] ?? '', v]; }), 'Completely')
      );
      judgeBits.push(ends);
    }
    judgeBits.push(
      lab.judge === 'pick'
        ? lab.level === 'students' ? 'Each student reads 6 writers. Writers are anonymous and the options are hidden.' : 'Each student reads every version with the labels hidden, and picks one.'
        : pairsLevel ? 'Each student rates 6 versions with the changes unmarked. The control is mixed in.' : 'Each student reads one version and places it on the line.'
    );
    rows.append(row(pairsLevel ? 'What readers rate' : 'How readers judge', ...judgeBits));

    const notes = el('div', 'lab-chips');
    notes.append(
      chip('Required at each step', lab.notes_on, () => put((d) => { d.notes_on = true; }, true), 'notes-on'),
      chip('Off', !lab.notes_on, () => put((d) => { d.notes_on = false; }, true), 'notes-off')
    );
    rows.append(row('Lab notes', notes, 'One short note per step: what they noticed, why this change, what the result shows. The notes sit beside the answer when they write.'));

    if (pairsLevel) {
      rows.append(row('Features to name', featuresEditor(lab), 'After the result, each pair names the feature they changed. The board then compares form, sentence and word.'));
      rows.append(row('Pairs', pairsEditor(lab)));
    }

    const threshold = el('input', 'qz-input');
    threshold.type = 'number';
    threshold.min = '0';
    threshold.max = '100';
    threshold.step = lab.judge === 'pick' ? '1' : '0.5';
    threshold.value = String(lab.threshold);
    threshold.setAttribute('aria-label', lab.judge === 'pick' ? 'Choices ahead that count as a win' : 'Points that count as a change');
    threshold.addEventListener('input', () => {
      const n = Number(threshold.value);
      if (threshold.value !== '' && Number.isFinite(n) && n >= 0 && n <= 100) put((d) => { d.threshold = n; });
    });
    const thresholdLine = el('div', 'lab-plan__threshold');
    thresholdLine.append(
      el('span', '', lab.judge === 'pick' ? 'Ahead by' : pairsLevel ? 'A shift of' : 'Ahead by'),
      threshold,
      el('span', '', lab.judge === 'pick' ? 'choices or more.' : 'points or more out of 10.')
    );
    rows.append(row(pairsLevel ? 'Counts as a change' : 'Counts as a win', thresholdLine, pairsLevel ? 'Smaller than that is no clear change. Set it before any data comes in.' : 'Closer than that is too close to call. Set it before any data comes in.'));

    rows.append(row('Explain prompt', line(lab.explain_prompt, 400, 'Explain prompt', (v) => put((d) => { d.explain_prompt = v; }), pairsLevel ? 'Does the evidence support the claim?' : 'Why did the result come out this way?'), 'The one written answer at the end. It is handed in and marked like any written question. Leave it blank to ask about the result.'));
    rows.append(row('My debrief notes', area(lab.debrief, 1200, 3, 'My debrief notes', (v) => put((d) => { d.debrief = v; })), 'Only you see these.'));

    root.replaceChildren(el('h2', '', 'Lab'), el('p', 'lab-muted', 'These lines are the whole lab. The steps build themselves from them.'), error, rows);
  }

  paint();
  return {
    root,
    sync() {
      // A change made elsewhere (undo, another tab's save, Ann) redraws the card; the card's own edits don't.
      if (JSON.stringify(s()) !== seen) paint();
    },
    dispose() {
      disposed = true;
    }
  };
}
