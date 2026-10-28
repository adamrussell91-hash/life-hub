// The coaching sheet: pick one technique, see only its five steps, write what you saw and the next
// step against each, then end the cycle with keep or move on. Adam drives; nothing is kept until Save.
// Step text is fetched from the private endpoint when the sheet opens and is never stored on the sheet.
import { CATALOGUE, SERIES, techniqueById } from '../../../../packages/walkthrus/catalogue.mjs';
import { newSheet, STEP_KEYS } from '../../../../packages/walkthrus/coaching.mjs';
import { loadWalkthruText, type WalkthruText } from '@/api/walkthrus';

export interface CoachingSheet {
  id: string;
  person_ref: string;
  person_name: string;
  technique_id: string;
  steps: Record<string, { seen: string; next: string }>;
  decision: 'keep' | 'move_on' | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachingPanelOptions {
  /** People the sheet can be about. */
  about: Array<{ ref: string; name: string }>;
  onSave: (sheet: CoachingSheet) => Promise<void>;
  edit?: CoachingSheet;
  loadText?: () => Promise<WalkthruText>;
  now?: () => string;
  newId?: () => string;
}

const techniques = (CATALOGUE as unknown as Array<{ id: string; kind: string; series: string; name: string }>).filter((e) => e.kind === 'technique');

export function decisionLabel(decision: CoachingSheet['decision']): string {
  return decision === 'keep' ? 'Keep working on this' : decision === 'move_on' ? 'Move to a new technique' : 'Open';
}

export function openCoachingPanel(doc: Document, options: CoachingPanelOptions): { el: HTMLElement; close(): void } {
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? (() => `coach_${crypto.randomUUID()}`);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label: string, className: string, part?: string) => {
    const b = el('button', className, label);
    b.type = 'button';
    if (part) b.dataset.part = part;
    return b;
  };

  const panel = el('aside', 'guide-panel guide coaching');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Coaching sheet');
  const head = el('div', 'guide-panel__head');
  const closeBtn = button('✕', 'btn btn--ghost', 'coaching-close');
  closeBtn.setAttribute('aria-label', 'Close the coaching sheet');
  head.append(el('b', undefined, 'Coaching sheet'), closeBtn);
  const body = el('div', 'guide-panel__body');
  panel.append(head, body);
  doc.body.append(panel);

  let sheet: CoachingSheet | null = options.edit ? structuredClone(options.edit) : null;
  let who: { ref: string; name: string } | null = options.edit ? { ref: options.edit.person_ref, name: options.edit.person_name } : null;
  let text: WalkthruText | null = null;
  let textError = '';
  let closed = false;
  const opener = doc.activeElement as HTMLElement | null;

  function close(): void {
    if (closed) return;
    closed = true;
    panel.remove();
    doc.removeEventListener('keydown', onKey);
    doc.defaultView?.removeEventListener('hashchange', close);
    if (opener && doc.contains(opener)) opener.focus();
  }
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    const active = doc.activeElement;
    if (active instanceof HTMLTextAreaElement && active.value) return;
    close();
  };
  doc.addEventListener('keydown', onKey);
  doc.defaultView?.addEventListener('hashchange', close);
  closeBtn.addEventListener('click', close);

  async function ensureText(): Promise<void> {
    if (text) return;
    try {
      text = await (options.loadText ?? loadWalkthruText)();
      textError = '';
    } catch {
      textError = 'The steps couldn’t be loaded. You can still write your feedback against step numbers.';
    }
    if (!closed && sheet) paintSheet();
  }

  function paintWho(): void {
    body.replaceChildren(el('p', 'guide-panel__about', 'Who is the coachee, and which technique have they chosen?'));
    if (!options.about.length) body.append(el('p', 'guide-panel__empty', 'Add the coachee to the meeting first.'));
    const person = el('select', 'input');
    person.setAttribute('aria-label', 'Coachee');
    for (const a of options.about) person.append(Object.assign(el('option'), { value: a.ref, textContent: a.name }));
    const technique = el('select', 'input');
    technique.setAttribute('aria-label', 'Technique');
    for (const series of SERIES as unknown as Array<{ key: string; name: string }>) {
      const group = el('optgroup');
      group.label = series.name;
      for (const t of techniques.filter((x) => x.series === series.key)) group.append(Object.assign(el('option'), { value: t.id, textContent: t.name }));
      if (group.children.length) technique.append(group);
    }
    const start = button('Start the sheet', 'btn btn--primary', 'coaching-start');
    start.disabled = !options.about.length;
    start.addEventListener('click', () => {
      const chosen = options.about.find((a) => a.ref === person.value);
      if (!chosen) return;
      who = chosen;
      const stamp = now();
      sheet = newSheet({ id: newId(), personRef: chosen.ref, personName: chosen.name, techniqueId: technique.value, now: stamp }) as CoachingSheet;
      paintSheet();
      void ensureText();
    });
    body.append(person, technique, start);
  }

  function paintSheet(): void {
    if (!sheet || !who) return;
    const current = sheet;
    const entry = techniqueById(current.technique_id);
    const master = text?.sets.flatMap((s) => s.techniques).find((t) => t.id === current.technique_id);
    body.replaceChildren();
    body.append(el('h2', 'guide-step__title', entry?.name ?? 'Technique'), el('p', 'guide-panel__about', `With ${who.name}. Write against each step, not at the person.`));
    if (textError) body.append(el('p', 'guide-panel__error', textError));
    for (const key of STEP_KEYS as string[]) {
      const step = master?.steps.find((s) => String(s.n) === key);
      const row = el('section', 'coaching__step');
      row.dataset.step = key;
      row.append(el('h3', 'coaching__label', `${key}. ${step?.label ?? `Step ${key}`}`));
      if (step?.text) row.append(el('p', 'coaching__text', step.text));
      const field = (name: 'seen' | 'next', label: string): HTMLElement => {
        const wrap = el('label', 'coaching__field');
        wrap.append(el('span', undefined, label));
        const area = el('textarea', 'input');
        area.rows = 2;
        area.maxLength = 600;
        area.value = current.steps[key]?.[name] ?? '';
        area.addEventListener('input', () => {
          current.steps[key] = { seen: current.steps[key]?.seen ?? '', next: current.steps[key]?.next ?? '', [name]: area.value };
        });
        wrap.append(area);
        return wrap;
      };
      row.append(field('seen', 'What we saw'), field('next', 'Next step'));
      body.append(row);
    }
    const decide = el('div', 'coaching__decide');
    decide.setAttribute('role', 'group');
    decide.setAttribute('aria-label', 'End of cycle');
    for (const [value, label] of [['keep', 'Keep working on this'], ['move_on', 'Move to a new technique']] as const) {
      const b = button(label, 'btn btn--secondary', `coaching-${value}`);
      b.setAttribute('aria-pressed', String(current.decision === value));
      b.addEventListener('click', () => {
        current.decision = current.decision === value ? null : value;
        current.decided_at = current.decision ? now() : null;
        paintSheet();
      });
      decide.append(b);
    }
    const error = el('p', 'guide-panel__error');
    const save = button('Save the sheet', 'btn btn--primary', 'coaching-save');
    save.addEventListener('click', async () => {
      save.disabled = true;
      current.updated_at = now();
      try {
        await options.onSave(current);
        close();
      } catch {
        error.textContent = 'That didn’t save. Try again.';
        save.disabled = false;
      }
    });
    body.append(decide, error, save);
  }

  if (sheet) {
    paintSheet();
    void ensureText();
  } else paintWho();
  return { el: panel, close };
}

/** A saved sheet on the meeting page: who, which technique, how many steps have notes, and where it ended. */
export function renderCoachingCard(doc: Document, sheet: CoachingSheet, onEdit: () => void): HTMLElement {
  const card = doc.createElement('article');
  card.className = 'card coaching-card';
  card.dataset.part = 'coaching-card';
  const entry = techniqueById(sheet.technique_id);
  const noted = Object.keys(sheet.steps).length;
  const title = doc.createElement('b');
  title.textContent = `${entry?.name ?? 'Technique'} · ${sheet.person_name}`;
  const meta = doc.createElement('p');
  meta.className = 'muted';
  meta.textContent = `${noted} of 5 steps with notes · ${decisionLabel(sheet.decision)}`;
  const edit = doc.createElement('button');
  edit.type = 'button';
  edit.className = 'btn btn--ghost';
  edit.textContent = 'Open';
  edit.addEventListener('click', onEdit);
  card.append(title, meta, edit);
  return card;
}
