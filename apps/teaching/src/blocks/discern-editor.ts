import type { Block } from '@/schemas/block';
import type { DiscernInitialType, DiscernQualifier, DiscernScalePreset } from '@/schemas/discern';
import {
  DISCERN_SCALES, defaultDiscern, discernQuestionText, discernSteps, suggestDiscernInitial,
  withDiscern, withoutDiscern
} from './discern';
import { button, discernSymbol, el } from './discern-view';

type Options<T extends Block> = {
  getBlock: () => T;
  onChange: (block: T) => void;
  /** Hide the block's own fields while setup is open (same event Kaplan uses). */
  setupVisibility: (open: boolean) => void;
  status: HTMLElement;
  /** Redraw the attached chips and menu after a save or removal. */
  refresh: () => void;
};

/** The canvas listens for these to add or remove the linked Confirm card. */
export const DISCERN_ATTACH_EVENT = 'discern-attach';
export const DISCERN_DETACH_EVENT = 'discern-detach';

const TYPE_LABEL: Record<DiscernInitialType, string> = { scale: 'Scale', choose: 'Choose', write: 'Write' };

export type DiscernAuthor = {
  panel: HTMLElement;
  /** Opens setup: the saved Discern to edit, or a new one. */
  open: () => void;
  /** The attached chip, or null when Discern is not on this block. */
  chip: () => HTMLButtonElement | null;
};

export function createDiscernAuthor<T extends Block>(options: Options<T>): DiscernAuthor {
  const panel = el('section', 'discern-setup');
  panel.hidden = true;
  let draft: DiscernQualifier | null = null;
  let attached = false;

  function close(): void {
    draft = null;
    panel.hidden = true;
    panel.replaceChildren();
    options.setupVisibility(false);
  }

  function save(): void {
    if (!draft) return;
    const clean = structuredClone(draft);
    if (clean.prompts?.every((p) => !p.trim())) delete clean.prompts;
    if (clean.initial.type === 'choose') clean.initial.options = clean.initial.options.map((o) => o.trim()).filter(Boolean);
    if (clean.character_tail) clean.character_tail.moments = clean.character_tail.moments.map((m) => m.trim()).filter(Boolean);
    const wasAttached = !!options.getBlock().discern;
    options.onChange(withDiscern(options.getBlock(), clean));
    if (!wasAttached) panel.dispatchEvent(new CustomEvent(DISCERN_ATTACH_EVENT, { bubbles: true, detail: { blockId: options.getBlock().id } }));
    close();
    options.refresh();
    options.status.textContent = wasAttached
      ? 'Discern saved.'
      : 'Discern added. A Confirm card now sits after this block: drag it later in the lesson.';
  }

  function remove(): void {
    const id = options.getBlock().id;
    options.onChange(withoutDiscern(options.getBlock()));
    panel.dispatchEvent(new CustomEvent(DISCERN_DETACH_EVENT, { bubbles: true, detail: { blockId: id } }));
    close();
    options.refresh();
    options.status.textContent = 'Discern removed, with its Confirm card. The original block is unchanged.';
  }

  function open(existing: DiscernQualifier | null): void {
    attached = !!existing;
    draft = existing ? structuredClone(existing) : defaultDiscern(options.getBlock());
    draw();
    panel.querySelector<HTMLElement>('h3')?.focus();
  }

  function seg<V extends string>(label: string, values: Array<[V, string]>, current: V, onPick: (v: V) => void): HTMLElement {
    const wrap = el('div', 'discern-setup__group');
    wrap.append(el('span', 'discern-setup__label', label));
    const row = el('div', 'discern-segs');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', label);
    for (const [value, text] of values) {
      const b = button(text, 'discern-seg', () => { onPick(value); draw(); });
      b.setAttribute('aria-pressed', String(current === value));
      row.append(b);
    }
    wrap.append(row);
    return wrap;
  }

  function text(label: string, hint: string, value: string, max: number, onInput: (v: string) => void, placeholder = ''): HTMLLabelElement {
    const field = el('label', 'discern-field');
    field.append(document.createTextNode(label));
    if (hint) field.append(el('small', undefined, hint));
    const input = el('input');
    input.type = 'text';
    input.maxLength = max;
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener('input', () => { onInput(input.value); refreshPromptHints(); });
    field.append(input);
    return field;
  }

  function list(values: string[], min: number, max: number, placeholder: (i: number) => string, itemMax: number, addLabel: string): HTMLElement {
    const wrap = el('div');
    const grid = el('div', 'discern-setup__list');
    values.forEach((value, i) => {
      const input = el('input');
      input.type = 'text';
      input.maxLength = itemMax;
      input.value = value;
      input.placeholder = placeholder(i);
      input.setAttribute('aria-label', placeholder(i));
      input.addEventListener('input', () => { values[i] = input.value; });
      grid.append(input);
    });
    wrap.append(grid);
    const row = el('div', 'discern-actions');
    if (values.length < max) row.append(button(addLabel, 'btn btn--ghost', () => { values.push(''); draw(); }));
    if (values.length > min) row.append(button('Remove last', 'btn btn--ghost', () => { values.pop(); draw(); }));
    wrap.append(row);
    return wrap;
  }

  let promptBoxes: HTMLTextAreaElement[] = [];
  function refreshPromptHints(): void {
    if (!draft) return;
    const steps = discernSteps({ ...draft, prompts: undefined });
    promptBoxes.forEach((box, i) => { box.placeholder = steps[i]!.defaultPrompt; });
  }

  function draw(): void {
    if (!draft) return;
    const d = draft;
    panel.replaceChildren();
    panel.hidden = false;
    options.setupVisibility(true);
    const heading = el('h3', 'discern__title');
    heading.tabIndex = -1;
    heading.append(discernSymbol(), document.createTextNode(attached ? 'Edit Discern' : 'Add Discern'));
    panel.append(heading, el('p', 'discern-caption', 'Students test their initial position in four steps, then finish on a linked Confirm card later in the lesson.'));

    panel.append(seg('Whose position is being tested?', [['own', 'The student’s own answer'], ['theirs', 'Someone else’s choice']], d.mode, (v) => {
      d.mode = v;
      if (v === 'theirs' && d.initial.type === 'scale') { d.initial.preset = 'verdict'; d.initial.options = []; }
    }));
    if (d.mode === 'theirs') panel.append(text('Whose choice?', '', d.who, 80, (v) => { d.who = v; }, 'e.g. Macbeth, Chamberlain'));

    const about = el('div', 'discern-setup__group');
    about.append(
      text('Focus', 'What is being judged. It fills every prompt.', d.focus, 200, (v) => { d.focus = v; }, 'e.g. whether there is hope for reconciliation'),
      text('Evidence source', 'Optional. Against and For ask for “one moment from …”.', d.source, 120, (v) => { d.source = v; }, 'e.g. the poems, Source B')
    );
    panel.append(about);

    const suggestion = suggestDiscernInitial(discernQuestionText(options.getBlock()), d.mode);
    const initial = seg('Initial answer', (['scale', 'choose', 'write'] as DiscernInitialType[]).map((t) => [t, TYPE_LABEL[t]]), d.initial.type, (v) => {
      d.initial.type = v;
      d.initial.options = v === 'choose' ? (d.initial.options.length >= 2 ? d.initial.options : ['', '']) : [];
    });
    const sugName = suggestion.type === 'scale' ? `${DISCERN_SCALES[suggestion.preset].name} scale` : TYPE_LABEL[suggestion.type];
    const matches = suggestion.type === d.initial.type && (suggestion.type !== 'scale' || suggestion.preset === d.initial.preset);
    const note = el('p', 'discern-suggest');
    if (matches) note.textContent = `Matches the question: ${sugName}.`;
    else {
      note.append(document.createTextNode(`Suggested from the question: ${sugName}. `),
        button('Use it', 'discern-suggest__use', () => {
          d.initial.type = suggestion.type;
          d.initial.preset = suggestion.preset;
          d.initial.options = suggestion.type === 'choose' ? ['', ''] : [];
          draw();
        }));
    }
    initial.insertBefore(note, initial.children[1]!);
    if (d.initial.type === 'scale') {
      const select = el('select', 'discern-select');
      select.setAttribute('aria-label', 'Scale');
      for (const [k, v] of Object.entries(DISCERN_SCALES)) {
        const opt = el('option', undefined, `${v.name}: ${v.options.join(' / ')}`);
        opt.value = k;
        select.append(opt);
      }
      select.value = d.initial.preset;
      select.addEventListener('change', () => { d.initial.preset = select.value as DiscernScalePreset; d.initial.options = []; draw(); });
      const points = DISCERN_SCALES[d.initial.preset].options.map((fallback, i) => d.initial.options[i] || fallback);
      d.initial.options = points;
      initial.append(select, list(points, 4, 4, (i) => `Scale point ${i + 1}`, 60, ''), el('p', 'discern-caption', 'Edit any wording. Students tap one.'));
    } else if (d.initial.type === 'choose') {
      initial.append(list(d.initial.options, 2, 5, (i) => `Option ${i + 1}`, 60, 'Add option'), el('p', 'discern-caption', 'Students pick one. Two to five options.'));
    } else {
      initial.append(el('p', 'discern-caption', 'Students write their initial answer in a few words. Written answers can’t be grouped in the class spread.'));
    }
    panel.append(initial);

    if (d.mode === 'theirs') {
      const tail = el('div', 'discern-setup__group');
      const toggle = el('label', 'discern-toggle');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = !!d.character_tail?.enabled;
      box.addEventListener('change', () => {
        d.character_tail = { enabled: box.checked, moments: d.character_tail?.moments?.length ? d.character_tail.moments : ['', '', ''] };
        draw();
      });
      toggle.append(box, document.createTextNode(` ${d.who.trim() || 'The character'}’s own tail`));
      tail.append(toggle, el('p', 'discern-caption', 'Students also plot how settled the character is at key moments in the text, with a few words of evidence for each dot.'));
      if (d.character_tail?.enabled) {
        tail.append(list(d.character_tail.moments, 2, 6, (i) => `Moment ${i + 1}, e.g. Act 1 Scene 3`, 80, 'Add moment'));
      }
      panel.append(tail);
    }

    const prompts = el('details', 'discern-setup__prompts');
    prompts.append(el('summary', undefined, 'Edit step prompts'));
    const values = d.prompts ? [...d.prompts] : ['', '', '', '', ''];
    d.prompts = values;
    promptBoxes = discernSteps({ ...d, prompts: undefined }).map((step, i) => {
      const field = el('label', 'discern-field', `${i + 1}. ${step.name}`);
      const area = el('textarea');
      area.rows = 3;
      area.maxLength = 1200;
      area.value = values[i]!;
      area.placeholder = step.defaultPrompt;
      area.addEventListener('input', () => { values[i] = area.value; });
      field.append(area);
      prompts.append(field);
      return area;
    });
    prompts.append(el('p', 'discern-caption', 'Leave a box empty to use the default, which updates with the focus and source.'));
    panel.append(prompts);

    const actions = el('div', 'discern-actions');
    actions.append(button(attached ? 'Save Discern' : 'Add Discern', 'btn btn--secondary', save), button('Cancel', 'btn btn--ghost', close));
    if (attached) actions.append(button('Remove Discern', 'btn btn--ghost discern-remove', remove));
    panel.append(actions);
  }

  return {
    panel,
    open: () => open(options.getBlock().discern ?? null),
    chip: () => {
      const existing = options.getBlock().discern;
      if (!existing) return null;
      const chip = button('Discern', 'discern-chip', () => open(existing));
      chip.prepend(discernSymbol());
      chip.setAttribute('aria-label', 'Edit Discern');
      return chip;
    }
  };
}
