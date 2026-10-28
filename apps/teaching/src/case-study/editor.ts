import type { Lesson } from '@/schemas/lesson';
import { button, el, labelled } from '@/quiz/dom';
import { CASE_DOC_KINDS, CASE_DOC_LABELS, CASE_OUTCOMES, type CaseDoc, type CaseOutcomeKey, type CaseSettings } from './schema';
import { newDoc, newOption, newPart, publishChecklist, seedCase, type ChecklistItem } from './model';
import { createCaseTabs, type CaseTab } from './editor-tabs';
import './editor.css';

export type CaseEditorOptions = {
  getLesson: () => Lesson;
  emitLesson: (next: Lesson) => void;
  /** The classes that teach this unit; a case can belong to one. */
  classes?: Array<{ id: string; name: string }>;
  /** Called after the tab changes, so the page can show or hide the lesson canvas. */
  onTab?: (tab: CaseTab) => void;
};

export type CaseEditorHandle = {
  root: HTMLElement;
  tabs: ReturnType<typeof createCaseTabs>;
  repaint(): void;
  dispose(): void;
};

const OUTCOME_LABELS: Record<CaseOutcomeKey, string> = {
  decision: 'Deciding with incomplete information',
  causal: 'Why it happened',
  framework: 'Using a framework',
  transfer: 'Spotting the pattern elsewhere'
};
const PACE_LABELS: Array<[CaseSettings['pace'], string]> = [['teacher', 'You move the class on'], ['own', 'Their own pace']];
const SUPPORT_LABELS: Array<[CaseSettings['support'], string]> = [['guided', 'Guided (7 to 8)'], ['standard', 'Standard (9 to 10)'], ['open', 'Open (11 to 12)']];
const RELEASE_LABELS: Array<[CaseSettings['release'], string]> = [['whole', 'All at once'], ['layered', 'In parts, a question between']];

/** Teacher editor for a Case Study lesson. All state lives in `lesson.case`; every change emits the whole lesson for autosave. */
export function mountCaseEditor(o: CaseEditorOptions): CaseEditorHandle {
  const root = el('section', 'cse');
  const panels = el('div', 'cse__panels');
  const checklist = el('aside', 'cse__check');
  const tabs = createCaseTabs({ onTab: (tab) => { paint(); o.onTab?.(tab); } });
  const bar = el('div', 'cse__bar');
  bar.append(tabs.root);
  root.append(bar, el('div', 'cse__body'));
  root.lastElementChild!.append(panels, checklist);
  let marked = '';

  const current = (): CaseSettings => o.getLesson().case ?? seedCase(o.getLesson());
  const put = (change: (draft: CaseSettings) => void, repaint = false): void => {
    const draft = structuredClone(current());
    change(draft);
    o.emitLesson({ ...o.getLesson(), case: draft });
    paintChecklist();
    if (repaint) paint();
  };

  // ---- small controls
  const text = (value: string, max: number, label: string, onInput: (v: string) => void, extra = ''): HTMLInputElement => {
    const i = el('input', `qz-input ${extra}`.trim());
    i.maxLength = max;
    i.value = value;
    i.setAttribute('aria-label', label);
    i.addEventListener('input', () => onInput(i.value));
    return i;
  };
  const area = (value: string, max: number, label: string, onInput: (v: string) => void, rows = 3): HTMLTextAreaElement => {
    const t = el('textarea', 'qz-input');
    t.maxLength = max;
    t.rows = rows;
    t.value = value;
    t.setAttribute('aria-label', label);
    t.addEventListener('input', () => onInput(t.value));
    return t;
  };
  const seg = <T extends string>(items: Array<[T, string]>, value: T, label: string, onPick: (v: T) => void): HTMLElement => {
    const wrap = el('span', 'cse-seg');
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
  const card = (title: string, lead: string): HTMLElement => {
    const c = el('section', 'cse-card');
    c.append(el('h3', '', title));
    if (lead) c.append(el('p', 'cse-lead', lead));
    return c;
  };
  const note = (t: string) => el('p', 'cse-note', t);
  const tools = (...buttons: HTMLButtonElement[]) => {
    const t = el('span', 'cse-tools');
    t.append(...buttons);
    return t;
  };
  const tool = (label: string, aria: string, onClick: () => void, disabled = false) => {
    const b = button(label, 'ghost', onClick);
    b.setAttribute('aria-label', aria);
    b.disabled = disabled;
    return b;
  };
  const move = <T>(list: T[], i: number, by: number): void => {
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
  };

  // ---- a document editor, shared by the case parts and the unseen case
  function docEditor(doc: CaseDoc, i: number, count: number, apply: (change: (docs: CaseDoc[]) => void, structural: boolean) => void): HTMLElement {
    const box = el('article', 'cse-doc');
    const kinds = el('select', `qz-input cse-kind cse-kind--${doc.kind}`);
    kinds.setAttribute('aria-label', 'Document type');
    for (const k of CASE_DOC_KINDS) { const op = el('option', '', CASE_DOC_LABELS[k]); op.value = k; op.selected = k === doc.kind; kinds.append(op); }
    kinds.addEventListener('change', () => apply((docs) => { docs[i]!.kind = kinds.value as CaseDoc['kind']; }, true));
    const head = el('div', 'cse-doc__bar');
    head.append(kinds, tools(
      tool('Up', 'Move document up', () => apply((docs) => move(docs, i, -1), true), i === 0),
      tool('Down', 'Move document down', () => apply((docs) => move(docs, i, 1), true), i === count - 1),
      tool('Remove', 'Remove document', () => apply((docs) => { docs.splice(i, 1); }, true), count <= 1)
    ));
    box.append(
      head,
      text(doc.title, 120, 'Document title', (v) => apply((docs) => { docs[i]!.title = v; }, false), 'cse-doc__title'),
      text(doc.source, 160, 'Where it comes from', (v) => apply((docs) => { docs[i]!.source = v; }, false), 'cse-doc__from'),
      area(doc.text, 6000, 'Document text', (v) => apply((docs) => { docs[i]!.text = v; }, false), 6)
    );
    return box;
  }
  const addDocRow = (onAdd: (kind: CaseDoc['kind']) => void): HTMLElement => {
    const row = el('div', 'cse-add');
    row.append(el('span', 'cse-add__label', 'Add'));
    for (const k of CASE_DOC_KINDS) {
      const b = el('button', `cse-chip cse-kind--${k}`, CASE_DOC_LABELS[k]);
      b.type = 'button';
      b.addEventListener('click', () => onAdd(k));
      row.append(b);
    }
    return row;
  };

  // ---- panels
  function kitPanel(c: CaseSettings): HTMLElement {
    const wrap = el('div', 'cse-stack');
    const purpose = card('Purpose', 'Start from the end. The unseen case at the end of the lesson is written against this.');
    const field = area(c.purpose, 400, 'On a case they have not seen, students will be able to', (v) => put((d) => { d.purpose = v; }), 3);
    field.placeholder = 'spot when waiting on a slow-building risk costs more than acting early, and say what would change that.';
    field.classList.toggle('cse-need', !c.purpose.trim());
    field.addEventListener('input', () => field.classList.toggle('cse-need', !field.value.trim()));
    purpose.append(labelled('On a case they haven’t seen, students will be able to…', field));
    const ticks = el('div', 'cse-chips');
    for (const key of CASE_OUTCOMES) {
      const b = el('button', 'cse-mod', OUTCOME_LABELS[key]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(c.outcomes.includes(key)));
      b.addEventListener('click', () => put((d) => { d.outcomes = d.outcomes.includes(key) ? d.outcomes.filter((x) => x !== key) : [...d.outcomes, key]; }, true));
      ticks.append(b);
    }
    purpose.append(labelled('This lesson leans on', ticks));
    wrap.append(purpose);

    const run = card('Running it', 'A support, extension or optional lesson starts with the setting that suits it. Change any of it.');
    run.append(
      labelled('Pace', seg(PACE_LABELS, c.pace, 'Pace', (v) => put((d) => { d.pace = v; if (v === 'own' && d.objections.length === 0) d.objections = ['']; }, true))),
      labelled('Support level', seg(SUPPORT_LABELS, c.support, 'Support level', (v) => put((d) => { d.support = v; }, true)), 'Guided adds sentence frames and 2 to 4 options. Open swaps the options for a free-text decision.'),
      labelled('Release the case', seg(RELEASE_LABELS, c.release, 'Release', (v) => put((d) => { d.release = v; }, true)))
    );
    if (o.classes?.length) {
      const sel = el('select', 'qz-input');
      sel.setAttribute('aria-label', 'Class');
      const none = el('option', '', 'Any class'); none.value = ''; sel.append(none);
      for (const k of o.classes) { const op = el('option', '', k.name); op.value = k.id; op.selected = k.id === c.class_id; sel.append(op); }
      sel.addEventListener('change', () => put((d) => { if (sel.value) d.class_id = sel.value; else delete d.class_id; }));
      run.append(labelled('Class', sel, 'The class whose roster the students’ initials claim.'));
    }
    wrap.append(run);
    return wrap;
  }

  function briefPanel(c: CaseSettings): HTMLElement {
    const box = card('Decision · first take', 'Students take a first position before they read anything. Give them a role and a real choice.');
    box.append(labelled('The question, in the case’s voice', area(c.decision?.prompt ?? '', 500, 'Decision question', (v) => put((d) => { d.decision = { options: [], ...d.decision, prompt: v }; }), 3)));
    box.append(note('Students name a first take with a reason, then read the case, then lock in a decision. Blocks you add on this tab (a recording, a sample, a reading) sit above the question. Blocks on the Decide tab show when they decide.'));
    return box;
  }

  function casePanel(c: CaseSettings): HTMLElement {
    const wrap = el('div', 'cse-stack');
    const layered = c.release === 'layered';
    c.parts.forEach((part, pi) => {
      const box = card('', '');
      const head = el('div', 'cse-part__bar');
      head.append(
        text(part.title, 80, 'Part title', (v) => put((d) => { d.parts[pi]!.title = v; }), 'cse-part__title'),
        tools(
          tool('Up', 'Move part up', () => put((d) => move(d.parts, pi, -1), true), pi === 0),
          tool('Down', 'Move part down', () => put((d) => move(d.parts, pi, 1), true), pi === c.parts.length - 1),
          tool('Remove part', 'Remove part', () => put((d) => { d.parts.splice(pi, 1); }, true), c.parts.length <= 1)
        )
      );
      box.append(head);
      part.docs.forEach((doc, di) => box.append(docEditor(doc, di, part.docs.length, (change, structural) => put((d) => change(d.parts[pi]!.docs), structural))));
      if (part.docs.length < 8) box.append(addDocRow((kind) => put((d) => { d.parts[pi]!.docs.push(newDoc(d, kind)); }, true)));
      if (layered && pi < c.parts.length - 1) {
        box.append(labelled('Question before the next part opens', area(part.question ?? '', 300, 'Part question', (v) => put((d) => { d.parts[pi]!.question = v; }), 2), 'Students answer it before they see the next part.'));
      }
      wrap.append(box);
    });
    if (c.parts.length < 4) wrap.append(button('Add a part', 'secondary', () => put((d) => { d.parts.push(newPart(d)); }, true)));
    wrap.append(note(layered ? 'Parts open in turn, each with a question. Change this on the Kit tab.' : 'Students see every document at once. Several parts group them for the rail.'));
    return wrap;
  }

  function decidePanel(c: CaseSettings): HTMLElement {
    const box = card('Decide', c.support === 'open' ? 'Students write their decision in their own words.' : 'Students choose an option, give their reason and how sure they are. Then it locks.');
    if (c.support === 'open') {
      box.append(note('Support is Open, so there are no options. Add some to give the decision a menu.'));
    }
    const options = c.decision?.options ?? [];
    options.forEach((opt, i) => {
      const row = el('div', 'cse-opt');
      row.append(
        el('span', 'cse-opt__k', String.fromCharCode(65 + i)),
        text(opt.label, 120, `Option ${i + 1} label`, (v) => put((d) => { d.decision!.options[i]!.label = v; })),
        text(opt.detail ?? '', 300, `Option ${i + 1} detail`, (v) => put((d) => { d.decision!.options[i]!.detail = v; })),
        tool('✕', `Remove option ${i + 1}`, () => put((d) => { d.decision!.options.splice(i, 1); }, true))
      );
      box.append(row);
    });
    if (options.length < 4) box.append(button('Add an option', 'secondary', () => put((d) => { d.decision = { prompt: '', ...d.decision, options: [...(d.decision?.options ?? []), newOption(d)] }; }, true)));
    box.append(note(c.support === 'guided' ? 'Guided needs 2 to 4 options.' : 'Use 2 to 4 options, or none for a free-text decision.'));
    box.append(note('Once a student locks their decision they cannot change it. Their first take stays on record, so the class can see who changed their mind.'));
    return box;
  }

  function outcomePanel(c: CaseSettings): HTMLElement {
    const wrap = el('div', 'cse-stack');
    const box = card('Outcome', 'What actually happened. Students see it after their decision is locked.');
    const o2 = c.outcome ?? { text: '', source: '' };
    const set = (change: (out: NonNullable<CaseSettings['outcome']>) => void) => put((d) => { d.outcome = { text: '', source: '', ...d.outcome }; change(d.outcome); });
    box.append(
      labelled('What happened', area(o2.text, 4000, 'What happened', (v) => set((out) => { out.text = v; }), 6)),
      labelled('Where it comes from (required)', text(o2.source, 200, 'Outcome source', (v) => set((out) => { out.source = v; }), o2.source.trim() ? '' : 'cse-need'), 'Publish is blocked without a source.')
    );
    if (c.pace === 'own') {
      const date = el('input', 'qz-input');
      date.type = 'date';
      date.value = o2.hold_until ?? '';
      date.setAttribute('aria-label', 'Hold the outcome until');
      date.addEventListener('change', () => put((d) => { d.outcome = { text: '', source: '', ...d.outcome }; if (date.value) d.outcome.hold_until = date.value; else delete d.outcome.hold_until; }));
      box.append(labelled('Hold the outcome until', date, 'Optional. The class sees the outcome together on this day.'));
    }
    wrap.append(box);
    if (c.pace === 'own') {
      const obj = card('Strongest objections', 'Students answer one before the Outcome opens. Write 1 to 3.');
      c.objections.forEach((text0, i) => {
        const row = el('div', 'cse-obj');
        row.append(area(text0, 300, `Objection ${i + 1}`, (v) => put((d) => { d.objections[i] = v; }), 2), tool('✕', `Remove objection ${i + 1}`, () => put((d) => { d.objections.splice(i, 1); }, true), c.objections.length <= 1));
        obj.append(row);
      });
      if (c.objections.length < 3) obj.append(button('Add an objection', 'secondary', () => put((d) => { d.objections.push(''); }, true)));
      wrap.append(obj);
    }
    return wrap;
  }

  function rulesPanel(c: CaseSettings): HTMLElement {
    const box = card('Rules · the unseen case', 'A second short case with the same structure and a different surface. Students apply their rule of thumb to it.');
    const t = c.transfer ?? { title: '', docs: [], question: '' };
    const set = (change: (tr: NonNullable<CaseSettings['transfer']>) => void, repaint = false) => put((d) => { d.transfer = { title: '', docs: [], question: '', ...d.transfer }; change(d.transfer); }, repaint);
    box.append(labelled('Title', text(t.title, 120, 'Unseen case title', (v) => set((tr) => { tr.title = v; }))));
    t.docs.forEach((doc, i) => box.append(docEditor(doc, i, t.docs.length, (change, structural) => set((tr) => change(tr.docs), structural))));
    if (t.docs.length < 4) box.append(addDocRow((kind) => set((tr) => { tr.docs.push(newDoc(c, kind)); }, true)));
    box.append(labelled('The question', area(t.question, 500, 'Unseen case question', (v) => set((tr) => { tr.question = v; }), 2), 'For example: “What would you do, and which class rule helped you decide?”'));
    box.append(note('Students write a rule of thumb (when, then, unless) after the Outcome. The unseen case checks whether it travels.'));
    return box;
  }

  const PANELS: Record<Exclude<CaseTab, 'all'>, (c: CaseSettings) => HTMLElement> = { kit: kitPanel, brief: briefPanel, case: casePanel, decide: decidePanel, outcome: outcomePanel, rules: rulesPanel };

  function paint(): void {
    const c = current();
    const tab = tabs.current();
    panels.replaceChildren(...(tab === 'all' ? (Object.keys(PANELS) as Array<keyof typeof PANELS>).map((k) => PANELS[k](c)) : [PANELS[tab](c)]));
    paintChecklist();
  }

  function paintChecklist(): void {
    const list = publishChecklist(current());
    const todo = list.filter((i) => !i.ok);
    const head = el('h3', '', todo.length ? `${todo.length} thing${todo.length === 1 ? '' : 's'} to add` : 'Ready to publish');
    const ul = el('ul');
    for (const item of list) ul.append(checkRow(item));
    checklist.replaceChildren(head, el('p', 'cse-lead', todo.length ? 'Publish opens when these are done.' : 'Everything a case study needs is here.'), ul);
    const key = todo.map((i) => i.tab).join(',');
    if (key !== marked) {
      marked = key;
      tabs.mark(todo.map((i) => i.tab));
    }
  }

  function checkRow(item: ChecklistItem): HTMLElement {
    const li = el('li');
    li.append(el('span', `cse-tick ${item.ok ? 'cse-tick--ok' : 'cse-tick--todo'}`, item.ok ? '✓' : ''));
    if (item.ok) li.append(el('span', '', item.label));
    else {
      const b = el('button', 'cse-jump', item.label);
      b.type = 'button';
      b.addEventListener('click', () => tabs.set(item.tab));
      li.append(b);
    }
    return li;
  }

  paint();
  return { root, tabs, repaint: paint, dispose() { root.remove(); } };
}
