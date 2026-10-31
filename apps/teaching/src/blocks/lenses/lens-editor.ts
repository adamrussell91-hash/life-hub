import type { Block } from '@/schemas/block';
import { classroomExtras } from '@/blocks/classroom-extras';
import { canHaveDiscern } from '../discern';
import { createDiscernAuthor } from '../discern-editor';
import { discernSymbol } from '../discern-view';
import type { SleeveConfig } from '@/schemas/lens';
import type { ToolkitKind } from '@/toolkit/library';
import type { SleeveLevel } from '@/toolkit/sleeves';
import { createEditorFilter } from '../editor-filter';
import { SLEEVE_LENSES, STEPPED_LENSES, attachedSleeves, attachedSteppedLenses, canAddSleeve, lensLevel } from './registry';
import { MAX_SLEEVES } from './sleeve-lens';
import { renderSteppedLenses } from './stepped-view';
import { LEVEL_LABELS, type LensConfig, type SleeveLens, type SteppedLens } from './types';
import { CATALOGUE, SERIES, techniqueById } from '../../../../../packages/walkthrus/catalogue.mjs';
import { FIGURE_SVGS } from '../../../../../packages/walkthrus/glyphs';
import { createGlyphSet } from '../../../../../packages/design-kit/js/glyph-set.js';
import { attachedTechniques, withTechnique } from '../walkthru-note/attach';

const walkthruGlyphs = createGlyphSet({ svgs: FIGURE_SVGS, labelOf: (id: string) => techniqueById(id)?.name ?? id, className: 'wts__hex' });
/** Any block can carry a WalkThru, bar teacher notes (which carry their own). */
const canHaveWalkthru = (block: Block): boolean => block.block_type !== 'teacher_note';

type Options<T extends Block> = { getBlock: () => T; onChange: (block: T) => void };

/** Discern brings its own setup; the picker only needs to show it. */
const DISCERN_PICK = { label: 'Discern', group: 'Judgement', path: 'Initial answer → against → for → step back' };
const SLEEVE_GROUP = 'Thinking toolkit';
const SLEEVE_SUBHEADS: Array<[ToolkitKind, string]> = [['value', 'Values'], ['tool', 'Tools'], ['skill', 'Skills']];

/** A small swatch in the sleeve's colour, standing in for a lens symbol. */
function sleeveSwatch(kind: ToolkitKind): HTMLElement {
  const swatch = document.createElement('span');
  swatch.className = `sleeve-swatch sleeve-swatch--${kind}`;
  swatch.setAttribute('aria-hidden', 'true');
  return swatch;
}

/**
 * One "Add lens…" item in the block options menu, a picker grouped by
 * framework, and a chip per attached lens. The author sees one setup step at
 * a time. Removing a lens lives in its setup, not in the menu.
 */
export function createLensEditor<T extends Block>(options: Options<T>): HTMLElement {
  const root = document.createElement('div');
  root.className = 'kaplan-author';
  if (!classroomExtras()) return root;
  const available = () => STEPPED_LENSES.filter((lens) => lens.canAttach(options.getBlock()));
  const sleevable = () => SLEEVE_LENSES.some((item) => item.canAttach(options.getBlock()));
  if (!available().length && !sleevable() && !canHaveDiscern(options.getBlock()) && !canHaveWalkthru(options.getBlock())) return root;
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
  // Discern shares the menu and attached strip; its setup is its own panel.
  const discern = createDiscernAuthor({
    getBlock: options.getBlock,
    onChange: options.onChange,
    setupVisibility: (open) => setupVisibility(open),
    status,
    refresh: () => renderBar()
  });
  root.append(bar, panel, discern.panel, status);
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
  let lens: SteppedLens | null = null;
  let draft: LensConfig | null = null;
  let sleeve: SleeveLens | null = null;
  let sleeveDraft: SleeveConfig | null = null;
  let editing = false;
  let currentStep = 0;

  function setupVisibility(open: boolean): void {
    root.dataset.editing = String(open);
    root.dispatchEvent(new CustomEvent('kaplan-setup-toggle', { bubbles: true, detail: { open } }));
  }
  function close(): void {
    lens = null;
    draft = null;
    sleeve = null;
    sleeveDraft = null;
    panel.hidden = true;
    panel.replaceChildren();
    setupVisibility(false);
    summary.focus();
  }
  function save(): void {
    if (!lens || !draft) return;
    options.onChange(lens.write(options.getBlock(), draft));
    const label = lens.label;
    close();
    renderBar();
    status.textContent = `${label} lens saved. The original block is unchanged.`;
  }
  function remove(target: SteppedLens): void {
    options.onChange(target.remove(options.getBlock()));
    if (lens?.id === target.id) close();
    renderBar();
    status.textContent = `${target.label} lens removed. The original block is unchanged.`;
    summary.focus();
  }
  function unusedLenses(): SteppedLens[] {
    return available().filter((item) => !item.read(options.getBlock()));
  }
  function unusedSleeves(): SleeveLens[] {
    const block = options.getBlock();
    return canAddSleeve(block) ? SLEEVE_LENSES.filter((item) => item.canAttach(block) && !item.read(block)) : [];
  }
  function saveSleeve(): void {
    if (!sleeve || !sleeveDraft) return;
    options.onChange(sleeve.write(options.getBlock(), sleeveDraft));
    const label = sleeve.label;
    close();
    renderBar();
    status.textContent = `${label} sleeve saved. The original block is unchanged.`;
  }
  function removeSleeve(target: SleeveLens): void {
    options.onChange(target.remove(options.getBlock()));
    close();
    renderBar();
    status.textContent = `${target.label} sleeve removed. The original block is unchanged.`;
    summary.focus();
  }
  function discernFree(): boolean {
    return canHaveDiscern(options.getBlock()) && !options.getBlock().discern;
  }
  function renderBar(): void {
    attached.replaceChildren();
    entries.replaceChildren();
    if (unusedLenses().length || unusedSleeves().length || discernFree()) {
      const entry = button('Add lens…', () => { menu.open = false; status.textContent = ''; choose(); });
      entry.className = 'page-options__item';
      entries.append(entry);
    }
    for (const item of attachedSteppedLenses(options.getBlock())) {
      const chip = button(item.lens.label, () => edit(item.lens, item.config));
      chip.className = 'kaplan-chip';
      chip.prepend(item.lens.symbol());
      chip.setAttribute('aria-label', `Edit ${item.lens.label} lens`);
      attached.append(chip);
    }
    for (const item of attachedSleeves(options.getBlock())) {
      const chip = button(item.lens.label, () => editSleeve(item.lens, item.config));
      chip.className = 'kaplan-chip';
      chip.prepend(sleeveSwatch(item.lens.toolkitKind));
      chip.setAttribute('aria-label', `Edit ${item.lens.label} sleeve`);
      attached.append(chip);
    }
    const discernChip = discern.chip();
    if (discernChip) attached.append(discernChip);
    if (canHaveWalkthru(options.getBlock())) {
      const [chosen] = attachedTechniques(options.getBlock());
      const entry = button(chosen ? 'Change WalkThru…' : 'Add WalkThru…', () => { menu.open = false; status.textContent = ''; chooseWalkthru(); });
      entry.className = 'page-options__item';
      entries.append(entry);
      const technique = chosen ? techniqueById(chosen) : null;
      if (technique) {
        const chip = button(technique.name, () => chooseWalkthru());
        chip.className = 'kaplan-chip wts-chip';
        chip.prepend(walkthruGlyphs.element(technique.id));
        chip.setAttribute('aria-label', `Change the ${technique.name} WalkThru (only you see it)`);
        attached.append(chip);
      }
    }
    menu.hidden = !entries.childElementCount;
  }
  function title(text: string, symbol?: Element): void {
    panel.replaceChildren();
    panel.hidden = false;
    setupVisibility(true);
    const heading = document.createElement('h3');
    heading.className = 'kaplan-workspace__title';
    heading.tabIndex = -1;
    if (symbol) heading.append(symbol);
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
  function choice(label: string, path: string, symbol: Element, onClick: () => void): HTMLButtonElement {
    const pick = button('', onClick);
    pick.className = 'kaplan-lens-choice';
    const text = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = label;
    const caption = document.createElement('span');
    caption.className = 'kaplan-caption';
    caption.textContent = path;
    text.append(strong, caption);
    pick.append(symbol, text);
    return pick;
  }
  function choose(): void {
    editing = false;
    title('Add a lens');
    const caption = document.createElement('p');
    caption.className = 'kaplan-caption';
    caption.textContent = 'Choose the thinking process to add to this activity.';
    panel.append(caption);
    const groups = new Map<string, HTMLButtonElement[]>();
    const add = (group: string, pick: HTMLButtonElement) => groups.set(group, [...(groups.get(group) ?? []), pick]);
    for (const item of unusedLenses()) {
      add(item.group, choice(item.label, item.path, item.symbol(), () => {
        lens = item;
        draft = item.create(options.getBlock());
        setup();
      }));
    }
    if (discernFree()) {
      add(DISCERN_PICK.group, choice(DISCERN_PICK.label, DISCERN_PICK.path, discernSymbol(), () => {
        panel.hidden = true;
        panel.replaceChildren();
        discern.open();
      }));
    }
    for (const [group, picks] of groups) {
      const heading = document.createElement('h4');
      heading.className = 'kaplan-lens-group';
      heading.textContent = group;
      const list = document.createElement('div');
      list.className = 'kaplan-lens-choices';
      list.append(...picks);
      panel.append(heading, list);
    }
    sleeveChoices();
    actions(button('Cancel', close));
  }
  /** One WalkThru per block: the teacher's step strip under it in the lesson, never on Display. */
  function chooseWalkthru(): void {
    const [chosen] = attachedTechniques(options.getBlock());
    title(chosen ? 'Change the WalkThru' : 'Add a WalkThru');
    const caption = document.createElement('p');
    caption.className = 'kaplan-caption';
    caption.textContent = 'Its five steps sit under this block in your lesson view. Students and Display never see it.';
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'input wts-pick__search';
    search.placeholder = 'Find a technique';
    search.setAttribute('aria-label', 'Find a technique');
    panel.append(caption, search);
    const lists: Array<{ heading: HTMLElement; list: HTMLElement; picks: Array<[string, HTMLButtonElement]> }> = [];
    for (const series of SERIES) {
      const items = CATALOGUE.filter((e) => e.kind === 'technique' && e.series === series.key);
      if (!items.length) continue;
      const heading = document.createElement('h4');
      heading.className = 'kaplan-lens-group';
      heading.textContent = series.name;
      const list = document.createElement('div');
      list.className = 'kaplan-lens-choices';
      const picks: Array<[string, HTMLButtonElement]> = items.map((item) => {
        const pick = choice(item.name, item.id === chosen ? 'On this block now' : `${item.code} | ${item.page}`, walkthruGlyphs.element(item.id), () => {
          options.onChange(withTechnique(options.getBlock(), item.id));
          close();
          renderBar();
          status.textContent = `${item.name} WalkThru added. Only you see it, under this block.`;
        });
        if (item.id === chosen) pick.setAttribute('aria-current', 'true');
        list.append(pick);
        return [item.name.toLowerCase(), pick];
      });
      lists.push({ heading, list, picks });
      panel.append(heading, list);
    }
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const group of lists) {
        let shown = 0;
        // The choice styles set display, which would win over `hidden`.
        for (const [name, pick] of group.picks) {
          const match = !q || name.includes(q);
          pick.style.display = match ? '' : 'none';
          if (match) shown += 1;
        }
        group.heading.style.display = group.list.style.display = shown ? '' : 'none';
      }
    });
    const buttons = [button('Cancel', close)];
    if (chosen) {
      buttons.unshift(button('Take the WalkThru off', () => {
        const name = techniqueById(chosen)?.name ?? 'The';
        options.onChange(withTechnique(options.getBlock(), null));
        close();
        renderBar();
        status.textContent = `${name} WalkThru taken off this block.`;
      }));
    }
    actions(...buttons);
  }
  /** Thinking toolkit sleeves, under Values, Tools and Skills, in library order. */
  function sleeveChoices(): void {
    const block = options.getBlock();
    if (!SLEEVE_LENSES.some((item) => item.canAttach(block))) return;
    const heading = document.createElement('h4');
    heading.className = 'kaplan-lens-group';
    heading.textContent = SLEEVE_GROUP;
    panel.append(heading);
    if (!canAddSleeve(block)) {
      const full = document.createElement('p');
      full.className = 'kaplan-caption';
      full.textContent = `This block has ${MAX_SLEEVES} sleeves, the most one block can hold. Remove one to add another.`;
      panel.append(full);
      return;
    }
    const unused = unusedSleeves();
    for (const [kind, subhead] of SLEEVE_SUBHEADS) {
      const items = unused.filter((item) => item.toolkitKind === kind);
      if (!items.length) continue;
      const sub = document.createElement('h5');
      sub.className = 'kaplan-lens-subgroup';
      sub.textContent = subhead;
      const list = document.createElement('div');
      list.className = 'kaplan-lens-choices';
      list.append(...items.map((item) => choice(item.label, item.goal, sleeveSwatch(item.toolkitKind), () => {
        editing = false;
        sleeve = item;
        sleeveDraft = item.create();
        sleeveSetup();
      })));
      panel.append(sub, list);
    }
  }
  function editSleeve(target: SleeveLens, config: SleeveConfig): void {
    editing = true;
    sleeve = target;
    sleeveDraft = structuredClone(config);
    menu.open = false;
    status.textContent = '';
    sleeveSetup();
  }
  /** Start level, the student switch, and Do it and the checks at that level. Blank keeps the sleeve's text. */
  function sleeveSetup(): void {
    if (!sleeve || !sleeveDraft) return;
    const target = sleeve;
    const config = sleeveDraft;
    title(`${target.label} sleeve`, sleeveSwatch(target.toolkitKind));
    const caption = document.createElement('p');
    caption.className = 'kaplan-caption';
    caption.textContent = `${target.goal} Students see it above the question: See it, Do it, Check it.`;
    panel.append(caption);
    const base = target.content(config.level, { ...config, do: undefined, checks: undefined });
    const levelGroup = document.createElement('div');
    levelGroup.className = 'kaplan-field';
    levelGroup.append(document.createTextNode('Start level'));
    const level = createEditorFilter({
      key: 'Start level',
      ariaLabel: 'Start level',
      value: config.level,
      defaultValue: 'support',
      options: target.levels.map((value) => ({ value, label: LEVEL_LABELS[value] })),
      onChange: (value) => {
        if (value === config.level) return;
        // Overrides belong to one level, so a new level starts from its own text.
        config.level = value as SleeveLevel;
        delete config.do;
        delete config.checks;
        sleeveSetup();
      }
    });
    levelGroup.append(level.el);
    const toggle = document.createElement('label');
    toggle.className = 'lens-toggle';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = config.student_level !== false;
    box.addEventListener('change', () => { config.student_level = box.checked; });
    toggle.append(box, document.createTextNode(' Students can switch level'));
    const move = document.createElement('textarea');
    move.rows = 2;
    move.maxLength = 600;
    move.placeholder = base.do;
    move.value = config.do ?? '';
    move.addEventListener('input', () => { config.do = move.value; });
    panel.append(levelGroup, toggle, field('Do it · blank uses the sleeve’s own move', move));
    base.checks.forEach((check, i) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 300;
      input.placeholder = check;
      input.value = config.checks?.[i] ?? '';
      input.addEventListener('input', () => {
        const checks = [0, 1, 2].map((n) => config.checks?.[n] ?? '');
        checks[i] = input.value;
        config.checks = checks;
      });
      panel.append(field(`Check ${i + 1} · blank uses the sleeve’s own`, input));
    });
    actions(button(editing ? 'Save sleeve' : 'Add sleeve', saveSleeve, true), button('Cancel', close));
    if (editing) {
      const removeButton = button('Remove sleeve', () => removeSleeve(target));
      removeButton.classList.add('kaplan-remove');
      panel.append(removeButton);
    }
  }
  function edit(target: SteppedLens, config: LensConfig): void {
    editing = true;
    lens = target;
    draft = structuredClone(config);
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
  function levelControls(target: SteppedLens, config: LensConfig): HTMLElement[] {
    if (target.levels.length < 2) return [];
    const group = document.createElement('div');
    group.className = 'kaplan-field';
    const heading = document.createElement('span');
    heading.textContent = 'Starting level';
    const pills = document.createElement('div');
    pills.className = 'lens-levels';
    pills.setAttribute('role', 'group');
    pills.setAttribute('aria-label', 'Starting level');
    pills.append(...target.levels.map((level) => {
      const pill = button(LEVEL_LABELS[level], () => { if (draft) draft.level = level; setup(); });
      pill.className = 'lens-levels__option';
      pill.setAttribute('aria-pressed', String(lensLevel(target, config) === level));
      return pill;
    }));
    group.append(heading, pills);
    const toggle = document.createElement('label');
    toggle.className = 'lens-toggle';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = config.student_level !== false;
    box.addEventListener('change', () => { if (draft) draft.student_level = box.checked; });
    toggle.append(box, document.createTextNode(' Let students change level'));
    return [group, toggle];
  }
  function setup(): void {
    if (!lens || !draft) return;
    const target = lens;
    const config = draft;
    title(target.label, target.symbol());
    const caption = document.createElement('p');
    caption.className = 'kaplan-caption';
    caption.textContent = 'The steps are ready to use. Add a focus, or review the steps to tailor the support.';
    const focus = document.createElement('input');
    focus.type = 'text';
    focus.maxLength = 200;
    focus.value = config.focus;
    focus.placeholder = 'A word, phrase or statement, such as reconciliation';
    focus.addEventListener('input', () => { config.focus = focus.value; });
    const mode = document.createElement('select');
    for (const [value, label] of [['notes', 'Thinking notes'], ['discussion', 'Discussion · no typing']]) {
      const option = document.createElement('option');
      option.value = value!;
      option.textContent = label!;
      mode.append(option);
    }
    mode.value = config.mode;
    mode.addEventListener('change', () => { config.mode = mode.value as LensConfig['mode']; });
    const path = document.createElement('p');
    path.className = 'kaplan-setup__path';
    path.textContent = target.path;
    panel.append(caption, field('What should students think about?', focus));
    panel.append(...(target.setupFields?.(config, (next) => { draft = next; setup(); }) ?? []));
    panel.append(...levelControls(target, config), field('How will students work?', mode), path);
    actions(button(editing ? 'Save lens' : 'Add lens', save, true),
      button('Review the steps', () => { currentStep = 0; reviewStep(); }), button('Cancel', close));
    if (editing) {
      const removeButton = button('Remove lens', () => remove(target));
      removeButton.classList.add('kaplan-remove');
      panel.append(removeButton);
    }
  }
  function reviewStep(): void {
    if (!lens || !draft) return;
    const target = lens;
    const ctx = { level: lensLevel(target, draft), choice: target.printChoice, block: options.getBlock() };
    const steps = target.steps(draft, ctx).filter((step) => !step.choices);
    const step = steps[currentStep]!;
    title(`${target.label} · Step ${currentStep + 1} of ${steps.length}`, target.symbol());
    const heading = document.createElement('h4');
    heading.className = 'kaplan-workspace__step-title';
    heading.textContent = step.title;
    const prompt = document.createElement('textarea');
    prompt.rows = 3;
    prompt.maxLength = 1200;
    prompt.value = step.prompt;
    prompt.addEventListener('input', () => { if (draft) draft = target.setStepText(draft, ctx, step.id, 'prompt', prompt.value); });
    const details = document.createElement('details');
    details.className = 'kaplan-support';
    const summary = document.createElement('summary');
    summary.textContent = 'Optional support for this step';
    const support = document.createElement('textarea');
    support.rows = 3;
    support.maxLength = 1200;
    support.value = step.support;
    support.addEventListener('input', () => { if (draft) draft = target.setStepText(draft, ctx, step.id, 'support', support.value); });
    details.append(summary, field('Hint or sentence starter · clear to hide', support));
    const preview = document.createElement('details');
    preview.className = 'kaplan-support';
    const previewLabel = document.createElement('summary');
    previewLabel.textContent = 'Preview student view';
    preview.append(previewLabel);
    preview.addEventListener('toggle', () => {
      if (!preview.open || !draft) return;
      preview.querySelector('.kaplan-qualifiers')?.remove();
      const view = renderSteppedLenses([{ lens: target, config: draft }], options.getBlock(), { mode: 'teacher', blockId: options.getBlock().id });
      preview.append(view);
      view.querySelector<HTMLButtonElement>('.kaplan-chip')?.click();
    });
    panel.append(heading, field('Student instruction', prompt), details, preview);
    const last = currentStep >= steps.length - 1;
    actions(button('Setup', setup), button('Back', () => { currentStep--; reviewStep(); }),
      button(!last ? 'Next step' : editing ? 'Save lens' : 'Add lens', () => {
        if (!last) { currentStep++; reviewStep(); } else save();
      }, true), button('Cancel', close));
    const back = panel.querySelectorAll<HTMLButtonElement>('.kaplan-actions button')[1];
    if (back) back.disabled = currentStep === 0;
  }
  renderBar();
  return root;
}
