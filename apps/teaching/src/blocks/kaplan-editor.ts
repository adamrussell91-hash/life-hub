import type { Block } from '@/schemas/block';
import type { KaplanLens, KaplanQualifier } from '@/schemas/kaplan';
import {
  KAPLAN_LABELS, KAPLAN_LENSES, KAPLAN_PATHS, canHaveKaplanQualifier,
  kaplanSteps, kaplanSymbol, suggestKaplanFocus, withKaplanQualifier, withoutKaplanQualifier
} from './kaplan';
import { renderKaplanQualifiers } from './kaplan-view';

type Options<T extends Block> = { getBlock: () => T; onChange: (block: T) => void };

/** Compact block attachment controls; the author only sees one setup step at a time. */
export function createKaplanEditor<T extends Block>(options: Options<T>): HTMLElement {
  const root = document.createElement('div');
  root.className = 'kaplan-author';
  if (!canHaveKaplanQualifier(options.getBlock())) return root;
  const bar = document.createElement('div');
  bar.className = 'kaplan-author__bar';
  const attached = document.createElement('div');
  attached.className = 'kaplan-author__attached';
  const menu = document.createElement('details');
  menu.className = 'page-options kaplan-author__options';
  const summary = document.createElement('summary');
  summary.className = 'hub-icon-btn page-options__trigger';
  summary.setAttribute('aria-label', 'Block options');
  summary.title = 'Block options';
  summary.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/></svg>';
  const entries = document.createElement('div');
  entries.className = 'page-options__menu';
  menu.append(summary, entries);
  bar.append(attached, menu);
  const panel = document.createElement('section');
  panel.className = 'kaplan-setup';
  panel.hidden = true;
  const status = document.createElement('p');
  status.className = 'kaplan-caption';
  status.setAttribute('role', 'status');
  root.append(bar, panel, status);
  root.addEventListener('click', (event) => event.stopPropagation());
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { menu.open = false; summary.focus(); }
  });
  // Native disclosure needs no document listeners and survives nested-editor teardown.
  const button = (text: string, onClick: () => void, primary = false): HTMLButtonElement => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btn btn--${primary ? 'secondary' : 'ghost'}`;
    el.textContent = text;
    el.addEventListener('click', onClick);
    return el;
  };
  let draft: KaplanQualifier | null = null;
  let editing = false;
  let currentStep = 0;

  function setupVisibility(open: boolean): void {
    root.dataset.editing = String(open);
    root.dispatchEvent(new CustomEvent('kaplan-setup-toggle', { bubbles: true, detail: { open } }));
  }

  function close(): void {
    draft = null;
    panel.hidden = true;
    panel.replaceChildren();
    setupVisibility(false);
    summary.focus();
  }
  function save(): void {
    if (!draft) return;
    const label = KAPLAN_LABELS[draft.lens];
    options.onChange(withKaplanQualifier(options.getBlock(), draft));
    close();
    renderBar();
    status.textContent = `${label} qualifier saved. The original block is unchanged.`;
  }
  function remove(lens: KaplanLens): void {
    options.onChange(withoutKaplanQualifier(options.getBlock(), lens));
    if (draft?.lens === lens) close();
    renderBar();
    status.textContent = `${KAPLAN_LABELS[lens]} qualifier removed. The original block is unchanged.`;
    summary.focus();
  }
  function item(text: string, action: () => void, lens?: KaplanLens): void {
    const entry = button(text, () => { menu.open = false; status.textContent = ''; action(); });
    entry.className = 'page-options__item';
    if (lens) entry.prepend(kaplanSymbol(lens));
    entries.append(entry);
  }
  function renderBar(): void {
    attached.replaceChildren();
    entries.replaceChildren();
    const qualifiers = options.getBlock().qualifiers ?? [];
    if (qualifiers.length < 3) item('Add Kaplan qualifier', chooseLens);
    for (const qualifier of qualifiers) {
      const chip = button(KAPLAN_LABELS[qualifier.lens], () => edit(qualifier));
      chip.className = 'kaplan-chip';
      chip.prepend(kaplanSymbol(qualifier.lens));
      chip.setAttribute('aria-label', `Edit ${KAPLAN_LABELS[qualifier.lens]} qualifier`);
      attached.append(chip);
      item(`Edit ${KAPLAN_LABELS[qualifier.lens]} qualifier`, () => edit(qualifier), qualifier.lens);
      item(`Remove ${KAPLAN_LABELS[qualifier.lens]} qualifier`, () => remove(qualifier.lens));
    }
  }
  function title(text: string, lens?: KaplanLens): void {
    panel.replaceChildren();
    panel.hidden = false;
    setupVisibility(true);
    const heading = document.createElement('h3');
    heading.className = 'kaplan-workspace__title';
    heading.tabIndex = -1;
    if (lens) heading.append(kaplanSymbol(lens));
    heading.append(document.createTextNode(text));
    panel.append(heading);
    heading.focus();
  }
  function actions(...buttons: HTMLButtonElement[]): void {
    const row = document.createElement('div');
    row.className = 'kaplan-actions';
    row.append(...buttons);
    panel.append(row);
  }
  function chooseLens(): void {
    editing = false;
    title('Add a Kaplan qualifier');
    const caption = document.createElement('p');
    caption.className = 'kaplan-caption';
    caption.textContent = 'Choose the thinking process to add to this activity.';
    const choices = document.createElement('div');
    choices.className = 'kaplan-lens-choices';
    for (const lens of KAPLAN_LENSES) {
      if (options.getBlock().qualifiers?.some((q) => q.lens === lens)) continue;
      const choice = button('', () => {
        draft = { lens, focus: suggestKaplanFocus(options.getBlock()), mode: 'notes' };
        setup();
      });
      choice.className = 'kaplan-lens-choice';
      const text = document.createElement('span');
      const label = document.createElement('strong');
      label.textContent = KAPLAN_LABELS[lens];
      const path = document.createElement('span');
      path.className = 'kaplan-caption';
      path.textContent = KAPLAN_PATHS[lens];
      text.append(label, path);
      choice.append(kaplanSymbol(lens), text);
      choices.append(choice);
    }
    panel.append(caption, choices);
    actions(button('Cancel', close));
  }
  function edit(qualifier: KaplanQualifier): void {
    editing = true;
    draft = structuredClone(qualifier);
    menu.open = false;
    status.textContent = '';
    setup();
  }
  function field(labelText: string, input: HTMLElement): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'kaplan-field';
    label.append(document.createTextNode(labelText), input);
    return label;
  }
  function setup(): void {
    if (!draft) return;
    title(KAPLAN_LABELS[draft.lens], draft.lens);
    const caption = document.createElement('p');
    caption.className = 'kaplan-caption';
    caption.textContent = 'Three steps are ready to use. Add a focus, or review the steps to tailor the support.';
    const focus = document.createElement('input');
    focus.type = 'text';
    focus.maxLength = 200;
    focus.value = draft.focus;
    focus.placeholder = 'For example, reconciliation';
    focus.addEventListener('input', () => { if (draft) draft.focus = focus.value; });
    const mode = document.createElement('select');
    for (const [value, label] of [['notes', 'Thinking notes'], ['discussion', 'Discussion · no typing']]) {
      const option = document.createElement('option');
      option.value = value!;
      option.textContent = label!;
      mode.append(option);
    }
    mode.value = draft.mode;
    mode.addEventListener('change', () => { if (draft) draft.mode = mode.value as KaplanQualifier['mode']; });
    const path = document.createElement('p');
    path.className = 'kaplan-setup__path';
    path.textContent = KAPLAN_PATHS[draft.lens];
    panel.append(caption, field('What should students think about?', focus), field('How will students work?', mode), path);
    actions(button(editing ? 'Save qualifier' : 'Add qualifier', save, true),
      button('Review the three steps', () => { currentStep = 0; reviewStep(); }), button('Cancel', close));
    if (editing) {
      const removeButton = button('Remove qualifier', () => { if (draft) remove(draft.lens); });
      removeButton.classList.add('kaplan-remove');
      panel.append(removeButton);
    }
  }
  function reviewStep(): void {
    if (!draft) return;
    const steps = kaplanSteps(draft);
    title(`${KAPLAN_LABELS[draft.lens]} · Step ${currentStep + 1} of 3`, draft.lens);
    const heading = document.createElement('h4');
    heading.className = 'kaplan-workspace__step-title';
    heading.textContent = steps[currentStep]!.title;
    const prompt = document.createElement('textarea');
    prompt.rows = 3;
    prompt.maxLength = 1200;
    prompt.value = steps[currentStep]!.prompt;
    prompt.addEventListener('input', () => {
      if (!draft) return;
      const values = [...(draft.prompts ?? ['', '', ''])] as [string, string, string];
      values[currentStep] = prompt.value;
      draft.prompts = values;
    });
    const details = document.createElement('details');
    details.className = 'kaplan-support';
    const summary = document.createElement('summary');
    summary.textContent = 'Optional support for this step';
    const support = document.createElement('textarea');
    support.rows = 3;
    support.maxLength = 1200;
    support.value = steps[currentStep]!.support;
    support.addEventListener('input', () => {
      if (!draft) return;
      const values = [...(draft.supports ?? [null, null, null])] as [string | null, string | null, string | null];
      values[currentStep] = support.value;
      draft.supports = values;
    });
    details.append(summary, field('Hint or sentence starter · clear to hide', support));
    const preview = document.createElement('details');
    preview.className = 'kaplan-support';
    const previewLabel = document.createElement('summary');
    previewLabel.textContent = 'Preview student view';
    preview.append(previewLabel);
    preview.addEventListener('toggle', () => {
      if (!preview.open || !draft) return;
      preview.querySelector('.kaplan-qualifiers')?.remove();
      const view = renderKaplanQualifiers([draft], { mode: 'teacher', blockId: options.getBlock().id });
      preview.append(view);
      view.querySelector<HTMLButtonElement>('.kaplan-chip')?.click();
    });
    panel.append(heading, field('Student instruction', prompt), details, preview);
    actions(button('Setup', setup), button('Back', () => { currentStep--; reviewStep(); }),
      button(currentStep < 2 ? 'Next step' : editing ? 'Save qualifier' : 'Add qualifier', () => {
        if (currentStep < 2) { currentStep++; reviewStep(); } else save();
      }, true), button('Cancel', close));
    const back = panel.querySelectorAll<HTMLButtonElement>('.kaplan-actions button')[1];
    if (back) back.disabled = currentStep === 0;
  }
  renderBar();
  return root;
}
