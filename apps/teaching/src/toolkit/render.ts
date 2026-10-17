import { withAppBase } from '@/app/base-path';
import { loadActivityState, saveActivityState, storageKey } from '@/blocks/learning-activity';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import { visitBlocks } from '@/blocks/walk-blocks';
import type { Block } from '@/schemas/block';
import type { Quadrant, StressVerdict, TkTeacherNote } from '@/schemas/toolkit';
import {
  ANALOGY_INTRO,
  ANALOGY_LEVELS,
  ANALOGY_TYPES,
  analogyType,
  type AnalogyTypesBlock,
  type FluidAnalogyBlock
} from '@/toolkit/analogy';
import { classLabel } from '@/toolkit/class-context';
import {
  CONCEPT_CRITERIA,
  QUADRANT_DEFINITION,
  QUADRANT_LABEL,
  QUADRANT_RESPOND,
  cleanNote,
  moveSentence,
  type ConceptFeaturesBlock,
  type QuestionQuadrantBlock,
  type TeacherNoteBlock,
  type ThinkingIntentionsBlock,
  type ThinkingMoveBlock,
  type ThinkingReflectionBlock,
  type ToolkitSkillBlock,
  type ToolkitToolBlock,
  type ToolkitValueBlock
} from '@/toolkit/content';
import {
  COMMUNITY_SKILL_DESCRIPTION,
  DISTINCTION_PAIR_BANK,
  TOOLKIT_VALUES,
  itemKind,
  itemLabel,
  libraryItem,
  type ToolkitKind
} from '@/toolkit/library';

export type TkRenderMode = 'teacher' | 'student' | 'print';
export type TkRenderContext = { lessonId?: string; pageBlocks?: Block[] };

type ToolkitBlock =
  | ToolkitSkillBlock
  | ToolkitToolBlock
  | ToolkitValueBlock
  | ThinkingMoveBlock
  | QuestionQuadrantBlock
  | ConceptFeaturesBlock
  | ThinkingIntentionsBlock
  | ThinkingReflectionBlock
  | FluidAnalogyBlock
  | AnalogyTypesBlock
  | TeacherNoteBlock;

// ─── Small DOM helpers ──────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Multi-line plain text as paragraphs. */
function paragraphs(text: string, className = 'tk-text'): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    fragment.append(el('p', className, line));
  }
  return fragment;
}

function lowerFirst(text: string): string {
  if (!text) return text;
  // "A worked example" → "a worked example"; keep acronyms ("QQ") as written.
  return /^[A-Z](?![A-Z])/.test(text) ? text[0]!.toLowerCase() + text.slice(1) : text;
}

let domId = 0;
function nextDomId(prefix: string): string {
  domId += 1;
  return `${prefix}-${domId}`;
}

function activityKey(ctx: TkRenderContext, blockId: string, part: string): string {
  return storageKey(ctx.lessonId ?? 'local', `${blockId}.${part}`);
}

function griffinIcon(className: string): HTMLImageElement {
  const img = el('img', className);
  img.src = withAppBase('/assets/blocks/badge-griffin.png');
  img.alt = '';
  img.width = 16;
  img.height = 16;
  img.onerror = () => img.remove();
  return img;
}

function eyebrow(kind: string): HTMLElement {
  const row = el('p', 'tk-eyebrow');
  row.append(griffinIcon('tk-eyebrow__griffin'), el('span', undefined, kind));
  return row;
}

/** The student instruction at the top of a block. */
function guideLine(text: string | undefined): HTMLElement | null {
  if (!text?.trim()) return null;
  const guide = el('p', 'tk-guide');
  guide.append(el('span', 'tk-guide__label', 'What to do'), document.createTextNode(text.trim()));
  return guide;
}

function teacherHint(mode: TkRenderMode, text: string): HTMLElement | null {
  return mode === 'teacher' ? el('p', 'tk-note__hint tk-empty', text) : null;
}

function itemCard(kind: ToolkitKind, label: string, definition: string): HTMLElement {
  const card = el('div', `block-definition tk-card tk-card--${kind}`);
  card.append(el('p', 'tk-card__title', label || 'Untitled'));
  if (definition.trim()) card.append(el('p', 'tk-card__definition', definition));
  return card;
}

/**
 * Click-to-reveal panel built from the Self check reveal. Real button with
 * aria-expanded/aria-controls; the panel uses `hidden`. Open state persists per
 * device like other learning activities.
 */
function reveal(options: {
  ctx: TkRenderContext;
  mode: TkRenderMode;
  blockId: string;
  part: string;
  label: string;
  body: string | (() => Node);
  /** Button text stays fixed (probe questions); otherwise Show … / Hide …. */
  fixedLabel?: boolean;
  onToggle?: (open: boolean) => void;
  className?: string;
}): HTMLElement | null {
  if (options.mode === 'print') return null;
  const wrap = el('div', `tk-reveal ${options.className ?? ''}`.trim());
  const key = activityKey(options.ctx, options.blockId, options.part);
  const saved = loadActivityState<{ open?: unknown }>(key);
  let open = saved?.open === true;
  const panelId = nextDomId('tk-reveal');
  const button = el('button', 'btn block-self-check__btn tk-reveal__btn');
  button.type = 'button';
  button.setAttribute('aria-controls', panelId);
  const panel = el('div', 'block-self-check__answer tk-reveal__body');
  panel.id = panelId;
  if (typeof options.body === 'string') panel.append(paragraphs(options.body));
  else panel.append(options.body());

  const label = options.label.trim() || 'answer';
  function paint(): void {
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    button.textContent = options.fixedLabel ? label : `${open ? 'Hide' : 'Show'} ${lowerFirst(label)}`;
    panel.hidden = !open;
    wrap.classList.toggle('is-open', open);
    options.onToggle?.(open);
  }
  button.addEventListener('click', () => {
    open = !open;
    saveActivityState(key, { open });
    paint();
  });
  wrap.append(button, panel);
  paint();
  return wrap;
}

function stepList(steps: Array<{ title: string; prompt: string }>): HTMLOListElement {
  const list = el('ol', 'block-question-set__list');
  for (const step of steps) {
    const li = el('li', 'block-question-set__question tk-step');
    const prompt = el('p', 'block-question-set__prompt');
    if (step.title.trim()) {
      prompt.append(el('strong', 'tk-step__title', step.title.trim()));
      if (step.prompt.trim()) prompt.append(document.createTextNode(` ${step.prompt.trim()}`));
    } else {
      prompt.textContent = step.prompt;
    }
    li.append(prompt);
    list.append(li);
  }
  return list;
}

/**
 * Panel shared by a group of link chips. Clicking a chip shows what that
 * skill, tool or value is under the chips; clicking it again closes it.
 */
type ChipDetail = { panel: HTMLElement; toggle: (id: string, button: HTMLButtonElement) => void };

function chipDetailBody(id: string): HTMLElement[] {
  const item = libraryItem(id);
  if (!item) return [];
  const out: HTMLElement[] = [el('p', 'tk-links__detail-title', item.label)];
  if (item.definition.trim()) out.push(el('p', 'tk-links__detail-text', item.definition));
  if (item.kind === 'tool' && item.sentence.trim()) out.push(el('p', 'tk-sentence', item.sentence));
  if (item.kind === 'value' && item.instruction.trim()) out.push(el('p', 'tk-links__detail-text', item.instruction));
  if (item.kind !== 'value' && item.steps.length) {
    const list = el('ol', 'tk-links__detail-steps');
    for (const step of item.steps) {
      const li = el('li');
      if (step.title.trim()) li.append(el('strong', undefined, step.title.trim()), document.createTextNode(' '));
      li.append(document.createTextNode(step.prompt));
      list.append(li);
    }
    out.push(list);
  }
  return out;
}

function chipDetail(): ChipDetail {
  const panel = el('div', 'tk-links__detail');
  panel.id = nextDomId('tk-chip-detail');
  panel.setAttribute('role', 'region');
  panel.hidden = true;
  let current: HTMLButtonElement | null = null;
  const toggle = (id: string, button: HTMLButtonElement) => {
    current?.setAttribute('aria-expanded', 'false');
    if (current === button) {
      current = null;
      panel.hidden = true;
      panel.replaceChildren();
      return;
    }
    current = button;
    button.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-label', itemLabel(id));
    panel.replaceChildren(...chipDetailBody(id));
    panel.hidden = false;
  };
  return { panel, toggle };
}

function chip(id: string, detail: ChipDetail): HTMLElement | null {
  const label = itemLabel(id);
  const kind = itemKind(id);
  if (!label || !kind) return null;
  const button = el('button', `hub-list__chip tk-chip tk-chip--${kind}`, label);
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', detail.panel.id);
  button.addEventListener('click', () => detail.toggle(id, button));
  return button;
}

function chipRow(label: string, ids: readonly string[], detail: ChipDetail): HTMLElement | null {
  const chips = ids.map((id) => chip(id, detail)).filter((node): node is HTMLElement => node !== null);
  if (chips.length === 0) return null;
  const row = el('div', 'tk-links__row');
  row.append(el('span', 'tk-links__label', label));
  const list = el('span', 'tk-links__chips');
  list.append(...chips);
  row.append(list);
  return row;
}

function linkChips(rows: Array<[string, readonly string[]]>): HTMLElement | null {
  const detail = chipDetail();
  const built = rows
    .map(([label, ids]) => chipRow(label, ids, detail))
    .filter((row): row is HTMLElement => row !== null);
  if (built.length === 0) return null;
  const wrap = el('div', 'tk-links');
  wrap.append(...built, detail.panel);
  return wrap;
}

function noteList(items: string[], ordered: boolean): HTMLElement {
  const list = el(ordered ? 'ol' : 'ul', 'tk-note__list');
  for (const item of items) {
    if (item.trim()) list.append(el('li', undefined, item));
  }
  return list;
}

function noteSection(label: string, content: Node): HTMLElement {
  const section = el('div', 'tk-note__section');
  section.append(el('p', 'tk-note__label', label), content);
  return section;
}

const NOTE_OPEN_KEY = 'teaching-hub.tk-note-open';

function noteOpenState(blockId: string): boolean {
  const saved = loadActivityState<Record<string, boolean>>(NOTE_OPEN_KEY);
  return saved?.[blockId] === true;
}

function saveNoteOpen(blockId: string, open: boolean): void {
  const saved = loadActivityState<Record<string, boolean>>(NOTE_OPEN_KEY) ?? {};
  saved[blockId] = open;
  saveActivityState(NOTE_OPEN_KEY, saved);
}

function notePill(): HTMLElement {
  return el('span', 'tk-note__pill', 'Only you see this');
}

/**
 * Teacher view only, collapsed by default. Students never receive these
 * fields (filterBlocksForStudent).
 */
function teacherNote(
  blockId: string,
  rawNote: TkTeacherNote | undefined,
  jots: Record<string, string> | undefined
): HTMLElement {
  const note = rawNote ? cleanNote(rawNote) : undefined;
  const aside = el('aside', 'tk-note');
  aside.setAttribute('aria-label', 'Teacher note');
  const bodyId = nextDomId('tk-note');
  const toggle = el('button', 'tk-note__toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', bodyId);
  const head = el('div', 'tk-note__head');
  head.append(toggle, notePill());
  const body = el('div', 'tk-note__body');
  body.id = bodyId;

  const mine = Object.entries(jots ?? {}).filter(([, text]) => text.trim());
  if (mine.length) {
    const box = el('div', 'tk-note__jots');
    for (const [classId, text] of mine) {
      const item = el('div', 'tk-note__jot');
      if (classId) item.append(el('p', 'tk-note__jot-class', classLabel(classId)));
      item.append(paragraphs(text, 'tk-note__text'));
      box.append(item);
    }
    const section = noteSection('My notes', box);
    section.classList.add('tk-note__section--wide');
    body.append(section);
  }
  if (note) {
    if (note.what.trim()) {
      const what = noteSection('About', paragraphs(note.what, 'tk-note__text'));
      what.classList.add('tk-note__section--wide');
      body.append(what);
    }
    if (note.run.some((line) => line.trim())) {
      const run = noteSection('How to run it', noteList(note.run, true));
      run.classList.add('tk-note__section--wide');
      body.append(run);
    }
    if (note.say.some((line) => line.trim())) {
      const chips = el('div', 'tk-note__chips');
      for (const line of note.say) if (line.trim()) chips.append(el('span', 'hub-list__chip tk-note__say', line));
      body.append(noteSection('Ask', chips));
    }
    if (note.watch.some((line) => line.trim())) body.append(noteSection('Watch for', noteList(note.watch, false)));
    if (note.extra_label.trim() && note.extra.some((line) => line.trim())) {
      body.append(noteSection(note.extra_label, noteList(note.extra, false)));
    }
  }
  if (!body.childElementCount) body.append(el('p', 'tk-note__hint', 'Nothing here yet. Select the block to add your notes.'));

  let open = noteOpenState(blockId);
  function paint(): void {
    body.hidden = !open;
    toggle.textContent = 'Teacher note';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    aside.classList.toggle('is-open', open);
  }
  toggle.addEventListener('click', () => {
    open = !open;
    saveNoteOpen(blockId, open);
    paint();
  });
  paint();
  aside.append(head, body);
  return aside;
}

function root(blockType: string): HTMLElement {
  const wrap = el('div', 'tk-block');
  wrap.dataset.toolkit = blockType;
  return wrap;
}

function appendIf(parent: HTMLElement, ...nodes: Array<Node | null | undefined>): void {
  for (const node of nodes) if (node) parent.append(node);
}

// ─── Toolkit skill ──────────────────────────────────────────────────────────

function renderSkill(block: ToolkitSkillBlock, mode: TkRenderMode, ctx: TkRenderContext): HTMLElement {
  const c = block.content;
  const wrap = root(block.block_type);
  wrap.append(eyebrow('Skill'), itemCard('skill', c.label, c.definition));
  if (c.context.trim()) {
    const question = el('div', 'tk-question');
    const text = el('div', 'tk-question__body');
    text.append(el('span', 'tk-question__label', 'Question'), el('p', 'tk-question__text', c.context));
    question.append(el('span', 'tk-question__mark', '?'), text);
    wrap.append(question);
  }
  appendIf(wrap, guideLine(c.guide));
  const steps = c.steps.map((step) => ({ title: step.title, prompt: step.prompt }));
  const list = stepList(steps);
  if (c.show_test && c.checks.some((line) => line.trim())) {
    const li = el('li', 'block-question-set__question tk-step');
    const prompt = el('p', 'block-question-set__prompt');
    prompt.append(el('strong', 'tk-step__title', 'Check'));
    li.append(prompt);
    const checks = c.checks.filter((line) => line.trim());
    if (checks.length) {
      const ul = el('ul', 'tk-checks');
      for (const check of checks) ul.append(el('li', undefined, check));
      li.append(ul);
    }
    list.append(li);
  }
  if (list.childElementCount) wrap.append(list);
  else appendIf(wrap, teacherHint(mode, 'No steps yet. Select the block to add some.'));
  for (const item of c.reveals) {
    appendIf(wrap, reveal({ ctx, mode, blockId: block.id, part: item.id, label: item.label, body: item.body }));
  }
  if (c.show_links) {
    appendIf(
      wrap,
      linkChips([
        ['Tools it uses', c.links.tools],
        ['Check it against', c.links.values]
      ])
    );
  }
  if (mode === 'teacher') wrap.append(teacherNote(block.id, c.teacher_note, c.teacher_jots));
  return wrap;
}

// ─── Toolkit tool ───────────────────────────────────────────────────────────

const FORK_PLACEHOLDER = { kind: 'General kind', marker: 'Marker of difference', a: 'Side A', b: 'Side B' };

function forkSlot(part: keyof typeof FORK_PLACEHOLDER): HTMLElement {
  const slot = el('div', part === 'marker' ? 'tk-fork__slot tk-fork__slot--marker' : 'tk-fork__slot');
  slot.dataset.part = part;
  slot.append(el('span', 'tk-fork__slot-label', FORK_PLACEHOLDER[part]), el('span', 'tk-fork__slot-value'));
  return slot;
}

function renderFork(block: ToolkitToolBlock, mode: TkRenderMode, ctx: TkRenderContext): HTMLElement {
  const c = block.content;
  const frag = el('div', 'tk-frame');
  const fork = el('div', 'tk-fork');
  fork.setAttribute('role', 'group');
  fork.setAttribute('aria-label', 'Distinction fork');
  const slots = {
    kind: forkSlot('kind'),
    marker: forkSlot('marker'),
    a: forkSlot('a'),
    b: forkSlot('b')
  };
  const sides = el('div', 'tk-fork__sides');
  sides.append(slots.a, slots.b);
  fork.append(slots.kind, el('span', 'tk-fork__stem'), slots.marker, el('span', 'tk-fork__stem'), sides);
  frag.append(fork);
  if (c.sentence.trim()) frag.append(el('p', 'tk-sentence', c.sentence));

  const fill = (open: boolean) => {
    for (const part of ['kind', 'marker', 'a', 'b'] as const) {
      const value = slots[part].querySelector<HTMLElement>('.tk-fork__slot-value')!;
      value.textContent = open ? c.worked[part] : '';
      slots[part].classList.toggle('is-filled', open && Boolean(c.worked[part].trim()));
    }
  };
  if (Object.values(c.worked).some((value) => value.trim())) {
    appendIf(
      frag,
      reveal({
        ctx,
        mode,
        blockId: block.id,
        part: 'worked',
        label: 'A worked example',
        body: c.worked_note || 'The fork above now shows the example.',
        onToggle: fill
      })
    );
  }
  if (c.pair_level !== 'none') {
    const bank = DISTINCTION_PAIR_BANK[c.pair_level];
    appendIf(
      frag,
      reveal({
        ctx,
        mode,
        blockId: block.id,
        part: `pairs-${c.pair_level}`,
        label: `Pairs to try (${bank.label})`,
        body: () => {
          const list = el('div', 'tk-pairs');
          for (const pair of bank.pairs) list.append(el('span', 'hub-list__chip tk-pair', pair));
          return list;
        }
      })
    );
  }
  return frag;
}

const VERDICT_LABEL: Record<StressVerdict, string> = {
  survives: 'Survives',
  fails: 'Fails',
  qualifies: 'Qualifies'
};

function renderStress(block: ToolkitToolBlock, mode: TkRenderMode, ctx: TkRenderContext): HTMLElement {
  const c = block.content;
  const frag = el('div', 'tk-frame');
  if (c.sentence.trim()) frag.append(el('p', 'tk-sentence', c.sentence));
  if (!c.statements.length) {
    appendIf(frag, teacherHint(mode, 'No statements yet. Select the block to add some or load an example.'));
    return frag;
  }
  const list = el('ol', 'block-question-set__list');
  for (const statement of c.statements) {
    const li = el('li', 'block-question-set__question tk-stress__item');
    li.append(el('p', 'block-question-set__prompt', statement.text));
    if (mode !== 'print') {
      const key = activityKey(ctx, block.id, `${statement.id}.verdict`);
      const saved = loadActivityState<{ verdict?: unknown }>(key);
      let picked = typeof saved?.verdict === 'string' ? saved.verdict : '';
      const pills = el('div', 'hub-pills hub-pills--loose tk-stress__pills');
      pills.setAttribute('role', 'group');
      pills.setAttribute('aria-label', `Your verdict on: ${statement.text}`);
      const buttons: HTMLButtonElement[] = [];
      for (const verdict of ['survives', 'fails', 'qualifies'] as const) {
        const button = el('button', 'hub-pills__btn', VERDICT_LABEL[verdict]);
        button.type = 'button';
        button.dataset.verdict = verdict;
        buttons.push(button);
        button.addEventListener('click', () => {
          picked = picked === verdict ? '' : verdict;
          saveActivityState(key, { verdict: picked });
          for (const other of buttons) {
            other.setAttribute('aria-pressed', other.dataset.verdict === picked ? 'true' : 'false');
          }
        });
        button.setAttribute('aria-pressed', picked === verdict ? 'true' : 'false');
        pills.append(button);
      }
      li.append(pills);
      appendIf(
        li,
        reveal({
          ctx,
          mode,
          blockId: block.id,
          part: `${statement.id}.reason`,
          label: 'Our verdict',
          body: `${VERDICT_LABEL[statement.verdict]}. ${statement.reason}`.trim()
        })
      );
    }
    list.append(li);
  }
  frag.append(list);
  return frag;
}

function renderConverter(block: ToolkitToolBlock, mode: TkRenderMode, ctx: TkRenderContext): HTMLElement {
  const c = block.content;
  const frag = el('div', 'tk-frame');
  if (c.sentence.trim()) frag.append(el('p', 'tk-sentence', c.sentence));
  if (!c.converters.length) {
    appendIf(frag, teacherHint(mode, 'No questions yet. Select the block to add some or load an example.'));
    return frag;
  }
  const list = el('ol', 'block-question-set__list');
  for (const pair of c.converters) {
    const li = el('li', 'block-question-set__question');
    const prompt = el('p', 'block-question-set__prompt');
    prompt.append(el('span', 'tk-tag', 'Closed'), document.createTextNode(` ${pair.closed}`));
    li.append(prompt);
    appendIf(
      li,
      reveal({
        ctx,
        mode,
        blockId: block.id,
        part: `${pair.id}.open`,
        label: 'An open version',
        body: pair.open
      })
    );
    list.append(li);
  }
  frag.append(list);
  return frag;
}

function renderToolSteps(block: ToolkitToolBlock): HTMLElement {
  const c = block.content;
  const frag = el('div', 'tk-frame');
  if (c.steps.length) frag.append(stepList(c.steps));
  if (c.sentence.trim()) {
    const sentence = el('p', 'tk-sentence');
    sentence.append(el('span', 'tk-sentence__label', 'Frame'), document.createTextNode(c.sentence));
    frag.append(sentence);
  }
  return frag;
}

function renderTool(block: ToolkitToolBlock, mode: TkRenderMode, ctx: TkRenderContext): HTMLElement {
  const c = block.content;
  const wrap = root(block.block_type);
  wrap.append(eyebrow('Tool'), itemCard('tool', c.label, c.definition));
  appendIf(wrap, guideLine(c.guide));
  if (c.frame === 'fork') wrap.append(renderFork(block, mode, ctx));
  else if (c.frame === 'stress') wrap.append(renderStress(block, mode, ctx));
  else if (c.frame === 'converter') wrap.append(renderConverter(block, mode, ctx));
  else wrap.append(renderToolSteps(block));
  for (const item of c.reveals) {
    appendIf(wrap, reveal({ ctx, mode, blockId: block.id, part: item.id, label: item.label, body: item.body }));
  }
  if (c.show_links) {
    appendIf(
      wrap,
      linkChips([
        ['Skills in play', c.links.skills],
        ['Pairs well with', c.links.tools]
      ])
    );
  }
  if (mode === 'teacher') wrap.append(teacherNote(block.id, c.teacher_note, c.teacher_jots));
  return wrap;
}

// ─── Toolkit value ──────────────────────────────────────────────────────────

function valueRow(current: string): HTMLElement {
  const row = el('ul', 'tk-values');
  row.setAttribute('aria-label', 'The nine thinking values');
  for (const value of TOOLKIT_VALUES) {
    const li = el('li', 'tk-values__item', value.label);
    if (value.id === current) {
      li.classList.add('is-current');
      li.setAttribute('aria-current', 'true');
    }
    row.append(li);
  }
  return row;
}

function renderValue(block: ToolkitValueBlock, mode: TkRenderMode, ctx: TkRenderContext): HTMLElement {
  const c = block.content;
  const wrap = root(block.block_type);
  wrap.append(eyebrow('Value'), itemCard('value', c.label, c.definition), valueRow(c.item));
  appendIf(wrap, guideLine(c.guide));
  if (c.claim.trim() || c.options.length) {
    const claim = el('aside', 'callout callout--sand');
    claim.setAttribute('role', 'note');
    if (c.claim.trim()) claim.append(el('p', 'callout__body tk-claim__text', c.claim));
    if (c.options.length) {
      const list = el('ol', 'tk-options');
      for (const option of c.options) list.append(el('li', undefined, option.text));
      claim.append(list);
    }
    wrap.append(claim);
  }
  if (c.probes.length) {
    const probes = el('div', 'tk-probes');
    probes.setAttribute('role', 'group');
    probes.setAttribute('aria-label', 'Probe questions');
    for (const probe of c.probes) {
      if (mode === 'print') {
        probes.append(el('p', 'tk-probe__question', probe.question));
        continue;
      }
      appendIf(
        probes,
        reveal({
          ctx,
          mode,
          blockId: block.id,
          part: probe.id,
          label: probe.question,
          body: probe.asks,
          fixedLabel: true,
          className: 'tk-probe'
        })
      );
    }
    wrap.append(probes);
  }
  if (c.instruction.trim()) wrap.append(el('p', 'tk-instruction', c.instruction));
  if (c.model.body.trim()) {
    appendIf(
      wrap,
      reveal({ ctx, mode, blockId: block.id, part: 'model', label: c.model.label || 'A model', body: c.model.body })
    );
  }
  if (c.discussion.trim()) {
    const ask = el('aside', 'callout callout--wave');
    ask.setAttribute('role', 'note');
    ask.append(el('p', 'callout__title', 'In discussion, ask'), el('p', 'callout__body', c.discussion));
    wrap.append(ask);
  }
  if (mode === 'teacher') wrap.append(teacherNote(block.id, c.teacher_note, c.teacher_jots));
  return wrap;
}

// ─── Thinking move ──────────────────────────────────────────────────────────

function miniCard(id: string): HTMLElement | null {
  const label = itemLabel(id);
  const kind = itemKind(id);
  if (!label || !kind) return null;
  return el('li', `tk-mini tk-mini--${kind}`, label);
}

function renderMove(block: ThinkingMoveBlock, mode: TkRenderMode, ctx: TkRenderContext): HTMLElement {
  const c = block.content;
  const wrap = root(block.block_type);
  wrap.append(eyebrow('Thinking move'));
  wrap.append(el('p', 'tk-move__sentence', moveSentence(c.skill, c.tools, c.value)));
  const cards = el('ol', 'tk-minis');
  cards.setAttribute('aria-label', 'Skill, tools and value in order');
  for (const id of [c.skill, ...c.tools, c.value]) appendIf(cards, miniCard(id));
  wrap.append(cards);
  appendIf(wrap, guideLine(c.guide));
  if (c.stimulus.trim()) {
    const stimulus = el('p', 'tk-context');
    stimulus.append(el('span', 'tk-context__label', 'Working on'), document.createTextNode(c.stimulus));
    wrap.append(stimulus);
  }
  const list = el('ol', 'block-question-set__list');
  for (const step of c.steps) {
    const li = el('li', 'block-question-set__question tk-step');
    const prompt = el('p', 'block-question-set__prompt');
    const tool = itemLabel(step.tool);
    if (tool) prompt.append(el('span', `hub-list__chip tk-chip tk-chip--tool tk-step__chip`, tool));
    prompt.append(document.createTextNode(` ${step.prompt}`));
    li.append(prompt);
    if (step.frame.trim()) li.append(el('p', 'tk-sentence tk-sentence--compact', step.frame));
    if (step.example.trim()) {
      appendIf(li, reveal({ ctx, mode, blockId: block.id, part: step.id, label: 'An example', body: step.example }));
    }
    list.append(li);
  }
  const checks = c.check.filter((line) => line.trim());
  if (checks.length) {
    const li = el('li', 'block-question-set__question tk-step');
    const prompt = el('p', 'block-question-set__prompt');
    const value = itemLabel(c.value);
    prompt.append(el('strong', 'tk-step__title', value ? `Check for ${value.toLowerCase()}` : 'Check'));
    li.append(prompt);
    const ul = el('ul', 'tk-checks');
    for (const check of checks) ul.append(el('li', undefined, check));
    li.append(ul);
    list.append(li);
  }
  wrap.append(list);
  if (c.community.trim()) {
    const together = el('aside', 'callout callout--shore');
    together.setAttribute('role', 'note');
    together.append(el('p', 'callout__title', 'Together'), el('p', 'callout__body', c.community));
    wrap.append(together);
  }
  if (mode === 'teacher') wrap.append(teacherNote(block.id, c.teacher_note, c.teacher_jots));
  return wrap;
}

// ─── Question Quadrant ──────────────────────────────────────────────────────

const QUADRANT_ORDER: Quadrant[] = ['comprehension', 'speculation', 'research', 'inquiry'];
const QUADRANT_AXES: Record<Quadrant, string> = {
  comprehension: 'Textual · Closed',
  speculation: 'Textual · Open',
  research: 'Intellectual · Closed',
  inquiry: 'Intellectual · Open'
};

function quadrantGrid(): HTMLElement {
  const wrap = el('div', 'tk-quadrant');
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Question Quadrant');
  wrap.append(
    el('span', 'tk-quadrant__axis tk-quadrant__axis--top', 'Textual questions'),
    el('span', 'tk-quadrant__axis tk-quadrant__axis--left', 'Closed'),
    el('span', 'tk-quadrant__axis tk-quadrant__axis--right', 'Open'),
    el('span', 'tk-quadrant__axis tk-quadrant__axis--bottom', 'Intellectual questions')
  );
  const grid = el('div', 'tk-quadrant__grid');
  for (const quadrant of QUADRANT_ORDER) {
    const tile = el('div', `tk-quadrant__tile tk-quadrant__tile--${quadrant}`);
    tile.append(
      el('p', 'tk-quadrant__where', QUADRANT_AXES[quadrant]),
      el('p', 'tk-quadrant__name', QUADRANT_LABEL[quadrant]),
      el('p', 'tk-quadrant__def', QUADRANT_DEFINITION[quadrant])
    );
    grid.append(tile);
  }
  wrap.append(grid);
  return wrap;
}

function renderQuadrant(block: QuestionQuadrantBlock, mode: TkRenderMode, ctx: TkRenderContext): HTMLElement {
  const c = block.content;
  const wrap = root(block.block_type);
  wrap.append(eyebrow('Question Quadrant'));
  appendIf(wrap, guideLine(c.guide));
  if (c.stimulus.trim()) {
    const quote = el('blockquote', 'block-quote tk-stimulus');
    quote.append(paragraphs(c.stimulus));
    wrap.append(quote);
  }
  const scroll = el('div', 'tk-scroll');
  scroll.append(quadrantGrid());
  wrap.append(scroll);

  const test = el('div', 'tk-respond');
  test.append(el('p', 'tk-respond__question', 'What do I need to do to respond to this question?'));
  const answers = el('div', 'tk-probes');
  for (const quadrant of ['comprehension', 'research', 'speculation', 'inquiry'] as const) {
    if (mode === 'print') {
      answers.append(el('p', 'tk-probe__question', `${QUADRANT_RESPOND[quadrant]} → ${QUADRANT_LABEL[quadrant]}`));
      continue;
    }
    appendIf(
      answers,
      reveal({
        ctx,
        mode,
        blockId: block.id,
        part: `respond-${quadrant}`,
        label: QUADRANT_RESPOND[quadrant],
        body: QUADRANT_LABEL[quadrant],
        fixedLabel: true,
        className: 'tk-probe'
      })
    );
  }
  test.append(answers);
  wrap.append(test);

  if (c.questions.length) {
    wrap.append(el('p', 'tk-subhead', 'Where does each question go?'));
    const list = el('ol', 'block-question-set__list');
    for (const question of c.questions) {
      const li = el('li', 'block-question-set__question');
      li.append(el('p', 'block-question-set__prompt', question.text));
      appendIf(
        li,
        reveal({
          ctx,
          mode,
          blockId: block.id,
          part: `${question.id}.where`,
          label: 'Where it goes',
          body: QUADRANT_LABEL[question.quadrant]
        })
      );
      list.append(li);
    }
    wrap.append(list);
  }

  if (c.converters.length) {
    wrap.append(el('p', 'tk-subhead', 'Closed to open'));
    const list = el('ol', 'block-question-set__list');
    for (const pair of c.converters) {
      const li = el('li', 'block-question-set__question');
      const prompt = el('p', 'block-question-set__prompt');
      prompt.append(el('span', 'tk-tag', 'Closed'), document.createTextNode(` ${pair.closed}`));
      li.append(prompt);
      appendIf(li, reveal({ ctx, mode, blockId: block.id, part: `${pair.id}.open`, label: 'An open version', body: pair.open }));
      list.append(li);
    }
    wrap.append(list);
  }
  if (mode === 'teacher') wrap.append(teacherNote(block.id, c.teacher_note, c.teacher_jots));
  return wrap;
}

// ─── Features of a Concept ──────────────────────────────────────────────────

const CRITERIA_KEYS = ['central', 'contestable', 'common'] as const;
const CRITERIA_LABEL = { central: 'Central', contestable: 'Contestable', common: 'Common' } as const;

function conceptGrid(block: ConceptFeaturesBlock, mode: TkRenderMode, ctx: TkRenderContext): HTMLElement {
  const c = block.content;
  const table = el('table', 'tk-grid');
  const caption = el('caption', 'tk-visually-hidden', 'Which concepts are central, contestable and common?');
  const thead = el('thead');
  const headRow = el('tr');
  headRow.append(el('td'));
  for (const concept of c.concepts) {
    const th = el('th', undefined, concept.label);
    th.scope = 'col';
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = el('tbody');
  for (const key of CRITERIA_KEYS) {
    const row = el('tr');
    const th = el('th', undefined, CRITERIA_LABEL[key]);
    th.scope = 'row';
    row.append(th);
    for (const concept of c.concepts) {
      const td = el('td');
      const yes = concept[key];
      if (mode === 'print') {
        row.append(td);
        continue;
      }
      const stateKey = activityKey(ctx, block.id, `${concept.id}.${key}`);
      let shown = loadActivityState<{ open?: unknown }>(stateKey)?.open === true;
      const button = el('button', 'tk-grid__cell');
      button.type = 'button';
      const paint = () => {
        button.textContent = shown ? (yes ? '✓' : '–') : '?';
        button.classList.toggle('is-yes', shown && yes);
        button.setAttribute('aria-pressed', shown ? 'true' : 'false');
        button.setAttribute(
          'aria-label',
          shown
            ? `${concept.label}: ${yes ? 'is' : 'is not'} ${CRITERIA_LABEL[key].toLowerCase()}`
            : `Is ${concept.label} ${CRITERIA_LABEL[key].toLowerCase()}? Show the answer`
        );
      };
      button.addEventListener('click', () => {
        shown = !shown;
        saveActivityState(stateKey, { open: shown });
        paint();
      });
      paint();
      td.append(button);
      row.append(td);
    }
    tbody.append(row);
  }
  table.append(caption, thead, tbody);
  const scroll = el('div', 'tk-scroll');
  scroll.append(table);
  return scroll;
}

function renderConcept(block: ConceptFeaturesBlock, mode: TkRenderMode, ctx: TkRenderContext): HTMLElement {
  const c = block.content;
  const wrap = root(block.block_type);
  wrap.append(eyebrow('Features of a Concept'));
  appendIf(wrap, guideLine(c.guide));
  const criteria = el('dl', 'tk-criteria');
  for (const key of CRITERIA_KEYS) {
    const row = el('div', 'tk-criteria__row');
    row.append(el('dt', undefined, CRITERIA_LABEL[key]), el('dd', undefined, CONCEPT_CRITERIA[key]));
    criteria.append(row);
  }
  wrap.append(criteria);
  if (c.concepts.length) wrap.append(conceptGrid(block, mode, ctx));
  const empty = !c.concepts.length && !c.analogy.stem.trim() && !c.game.cards.length && !c.criteria.some((line) => line.trim());
  if (empty) appendIf(wrap, teacherHint(mode, 'Select the block to add your concepts, or load the worked example.'));

  if (c.analogy.stem.trim()) {
    const warm = el('div', 'tk-analogy');
    warm.append(el('p', 'tk-subhead', 'Warm-up: analogy'), el('p', 'tk-sentence', c.analogy.stem));
    if (c.analogy.example.trim()) {
      appendIf(warm, reveal({ ctx, mode, blockId: block.id, part: 'analogy', label: 'An example', body: c.analogy.example }));
    }
    wrap.append(warm);
  }

  const game = c.game;
  if (game.cards.length) {
    const board = el('div', 'tk-game');
    board.dataset.game = game.kind;
    const title =
      game.kind === 'degree_line'
        ? 'Place each card along the line'
        : game.kind === 'word_sort'
          ? 'Sort the words'
          : 'Sort the scenarios';
    board.append(el('p', 'tk-subhead', title));
    if (game.kind === 'degree_line') {
      const line = el('div', 'tk-game__line');
      line.append(el('span', 'tk-game__end', game.left), el('span', 'tk-game__rule'), el('span', 'tk-game__end', game.right));
      board.append(line);
    } else {
      const columns = el('div', 'tk-game__columns');
      for (const label of [game.left, game.middle || '?', game.right]) columns.append(el('div', 'tk-game__column', label));
      board.append(columns);
    }
    if (game.kind === 'word_sort') {
      const words = el('div', 'tk-pairs');
      for (const card of game.cards) words.append(el('span', 'hub-list__chip tk-pair', card.text));
      board.append(words);
    } else {
      const list = el('ol', 'block-question-set__list');
      for (const card of game.cards) {
        const li = el('li', 'block-question-set__question');
        li.append(el('p', 'block-question-set__prompt', card.text));
        if (card.prompt.trim()) {
          appendIf(li, reveal({ ctx, mode, blockId: block.id, part: `${card.id}.prompt`, label: 'A question to ask', body: card.prompt }));
        }
        list.append(li);
      }
      board.append(list);
    }
    wrap.append(board);
  }

  const criteriaFound = c.criteria.filter((line) => line.trim());
  if (criteriaFound.length) {
    appendIf(
      wrap,
      reveal({
        ctx,
        mode,
        blockId: block.id,
        part: 'criteria',
        label: 'Criteria',
        body: () => {
          const list = el('ol', 'tk-note__list');
          for (const line of criteriaFound) list.append(el('li', undefined, line));
          return list;
        }
      })
    );
  }
  if (mode === 'teacher') wrap.append(teacherNote(block.id, c.teacher_note, c.teacher_jots));
  return wrap;
}

// ─── Thinking intentions ────────────────────────────────────────────────────

function intentionRow(label: string, content: Node): HTMLElement {
  const row = el('div', 'tk-intent__row');
  row.append(el('p', 'tk-intent__label', label), content);
  return row;
}

/** Items with their one-line description, so students know what each one means. */
function describedList(rows: Array<{ label: string; kind: string; text: string }>): HTMLElement | null {
  if (!rows.length) return null;
  const list = el('ul', 'tk-described');
  for (const row of rows) {
    const li = el('li', 'tk-described__item');
    li.append(el('span', `hub-list__chip tk-chip tk-chip--${row.kind}`, row.label));
    if (row.text.trim()) li.append(el('span', 'tk-described__text', row.text));
    list.append(li);
  }
  return list;
}

function libraryRows(ids: readonly string[]): Array<{ label: string; kind: string; text: string }> {
  return ids.flatMap((id) => {
    const item = libraryItem(id);
    return item ? [{ label: item.label, kind: item.kind, text: item.definition }] : [];
  });
}

function renderIntentions(block: ThinkingIntentionsBlock, mode: TkRenderMode): HTMLElement {
  const c = block.content;
  const wrap = root(block.block_type);
  wrap.append(eyebrow('Thinking intentions'));
  let filled = 0;
  if (c.content.trim()) {
    wrap.append(intentionRow('We are learning', paragraphs(c.content)));
    filled += 1;
  }
  const thinking = [
    ['We will think by', libraryRows(c.skills)],
    ['Using', libraryRows(c.tools)],
    ['Judged for', libraryRows(c.values)]
  ] as const;
  for (const [label, rows] of thinking) {
    const list = describedList([...rows]);
    if (!list) continue;
    wrap.append(intentionRow(label, list));
    filled += 1;
  }
  const community = describedList(
    c.community
      .filter((line) => line.trim())
      .map((skill) => ({ label: skill, kind: 'community', text: COMMUNITY_SKILL_DESCRIPTION[skill] ?? '' }))
  );
  if (community) {
    wrap.append(intentionRow('Working together by', community));
    filled += 1;
  }
  const success = c.success.filter((line) => line.trim());
  if (success.length) {
    const list = el('ul', 'tk-checks');
    for (const line of success) list.append(el('li', undefined, line));
    wrap.append(intentionRow('I can', list));
    filled += 1;
  }
  if (filled === 0 && mode === 'teacher') {
    wrap.append(el('p', 'tk-note__hint', "Select the block to set today's intentions."));
  }
  return wrap;
}

// ─── Thinking reflection ────────────────────────────────────────────────────

/** Tools, values and community skills used across the page's toolkit blocks. */
export function collectLessonThinking(blocks: Block[] | undefined): {
  tools: string[];
  values: string[];
  community: string[];
} {
  const tools = new Set<string>();
  const values = new Set<string>();
  const community = new Set<string>();
  if (!blocks) return { tools: [], values: [], community: [] };
  visitBlocks(blocks, (block) => {
    switch (block.block_type) {
      case 'toolkit_skill':
        block.content.links.tools.forEach((id) => tools.add(id));
        block.content.links.values.forEach((id) => values.add(id));
        break;
      case 'toolkit_tool':
        tools.add(block.content.item);
        break;
      case 'toolkit_value':
        values.add(block.content.item);
        break;
      case 'thinking_move':
        block.content.tools.forEach((id) => tools.add(id));
        values.add(block.content.value);
        if (block.content.community.trim()) community.add(block.content.community.trim());
        break;
      case 'thinking_intentions':
        block.content.tools.forEach((id) => tools.add(id));
        block.content.values.forEach((id) => values.add(id));
        block.content.community.forEach((skill) => community.add(skill));
        break;
      default:
        break;
    }
  });
  const known = (ids: Set<string>) => [...ids].filter((id) => itemLabel(id));
  return { tools: known(tools), values: known(values), community: [...community] };
}

function reflectionBox(title: string, tone: 'wave' | 'shore' | 'sand'): HTMLElement {
  const box = el('section', `callout callout--${tone} tk-reflect__box`);
  box.append(el('p', 'callout__title', title));
  return box;
}

function renderReflection(block: ThinkingReflectionBlock, mode: TkRenderMode, ctx: TkRenderContext): HTMLElement {
  const c = block.content;
  const wrap = root(block.block_type);
  wrap.append(eyebrow('Thinking reflection'));
  appendIf(wrap, guideLine(c.guide));
  const used = collectLessonThinking(ctx.pageBlocks);
  const concept = c.concept.trim() || 'the chosen concept';

  const progress = reflectionBox('Reflect on progress', 'wave');
  progress.append(el('p', 'tk-reflect__q', `How well did we go in building / expanding our understanding of ${concept}?`));
  progress.append(el('p', 'tk-reflect__q', 'What kinds of thinking / thinking tools did we use today?'));
  const detail = chipDetail();
  appendIf(progress, chipRow('Tools', used.tools, detail));
  if (used.values.length) {
    progress.append(el('p', 'tk-reflect__q', 'Were our contributions …?'));
    appendIf(progress, chipRow('Values', used.values, detail));
  } else {
    progress.append(el('p', 'tk-reflect__q', 'Were our contributions clear, relevant, precise, significant, coherent …?'));
  }
  if (used.tools.length || used.values.length) progress.append(detail.panel);
  wrap.append(progress);

  const process = reflectionBox('Reflect on process', 'shore');
  process.append(
    el('p', 'tk-reflect__q', 'How well did we work together collaboratively? (Listening, turn-taking, tolerating differences of opinion …)')
  );
  if (used.community.length) {
    const chips = el('div', 'tk-note__chips');
    for (const skill of used.community) chips.append(el('span', 'hub-list__chip tk-chip tk-chip--community', skill));
    process.append(chips);
  }
  wrap.append(process);

  if (c.variant === 'unit') {
    const unit = reflectionBox('End of unit', 'sand');
    unit.append(
      el('p', 'tk-reflect__q', "Think back to one's original view (original \"… is\" or analogy task)."),
      el(
        'p',
        'tk-reflect__q',
        `Choose one thing to elaborate on which helped you refine your understanding of ${c.concept.trim() || 'the concept'}.`
      )
    );
    wrap.append(unit);
  }
  if (mode === 'teacher') wrap.append(teacherNote(block.id, c.teacher_note, c.teacher_jots));
  return wrap;
}

// ─── Fluid analogy ──────────────────────────────────────────────────────────

/** Same eyebrow as the toolkit, without the griffin: not a Newington framework block. */
function analogyEyebrow(text: string): HTMLElement {
  return el('p', 'tk-eyebrow an-eyebrow', text);
}

function analogyCheckList(checks: string[]): HTMLElement {
  const list = el('ul', 'tk-checks an-checks');
  for (const line of checks) if (line.trim()) list.append(el('li', undefined, line));
  return list;
}

function analogyFocus(text: string): HTMLElement | null {
  if (!text.trim()) return null;
  const box = el('div', 'an-focus');
  box.append(el('span', 'an-focus__label', 'Working with'), el('p', 'an-focus__text', text.trim()));
  return box;
}

function analogyCard(title: string, tag: string | undefined, definition: string, cardName: string | null): HTMLElement {
  const card = el('div', 'block-definition tk-card tk-card--analogy');
  const heading = el('p', 'tk-card__title', title || 'Untitled');
  if (tag) heading.append(el('span', 'an-tag', tag));
  card.append(heading);
  if (definition.trim()) card.append(el('p', 'tk-card__definition', definition));
  if (cardName) card.append(el('p', 'an-card-name', cardName));
  return card;
}

function levelName(level: number): string {
  return ANALOGY_LEVELS[level - 1]?.name ?? '';
}

/** One level: the task, the framed steps, the example behind a reveal. */
function tierPanel(
  block: FluidAnalogyBlock,
  tier: FluidAnalogyBlock['content']['tiers'][number],
  level: number,
  mode: TkRenderMode,
  ctx: TkRenderContext
): HTMLElement {
  const panel = el('div', 'an-tier');
  panel.dataset.level = String(level);
  appendIf(panel, guideLine(tier.task));
  const steps = tier.steps.filter((step) => step.title.trim() || step.prompt.trim());
  if (steps.length) {
    const list = el('ol', 'an-steps');
    for (const step of steps) {
      const item = el('li', 'an-step');
      if (step.title.trim()) item.append(el('span', 'an-step__title', step.title.trim()));
      if (step.prompt.trim()) item.append(el('span', 'an-step__frame', step.prompt.trim()));
      list.append(item);
    }
    panel.append(list);
  }
  if (tier.example.trim()) {
    appendIf(panel, reveal({ ctx, mode, blockId: block.id, part: `example-${level}`, label: 'An example', body: tier.example }));
  }
  return panel;
}

function renderFluidAnalogy(block: FluidAnalogyBlock, mode: TkRenderMode, ctx: TkRenderContext): HTMLElement {
  const c = block.content;
  const type = analogyType(c.kind);
  const wrap = root(block.block_type);
  wrap.append(
    analogyEyebrow(type ? `Fluid analogy · Type ${type.order} of ${ANALOGY_TYPES.length}` : 'Fluid analogy'),
    analogyCard(
      c.label.trim() || type?.label || '',
      type?.tag,
      c.definition,
      c.show_card && type ? `Card ${type.order} · ${type.card}` : null
    )
  );
  appendIf(wrap, analogyFocus(c.focus));

  const choose = c.student_choice && mode !== 'print';
  const key = activityKey(ctx, block.id, 'level');
  const saved = choose ? loadActivityState<{ level?: unknown }>(key)?.level : undefined;
  let current = typeof saved === 'number' && saved >= 1 && saved <= 3 ? saved : c.level;

  if (!choose) {
    wrap.append(el('p', 'an-level-badge', `Level ${c.level} · ${levelName(c.level)}`));
    wrap.append(tierPanel(block, c.tiers[c.level - 1]!, c.level, mode, ctx));
  } else {
    const switcher = el('div', 'an-levels');
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', 'Level');
    const buttons: HTMLButtonElement[] = [];
    const panels = c.tiers.map((tier, index) => tierPanel(block, tier, index + 1, mode, ctx));
    const paint = () => {
      buttons.forEach((button, index) => button.setAttribute('aria-pressed', index + 1 === current ? 'true' : 'false'));
      panels.forEach((panel, index) => {
        panel.hidden = index + 1 !== current;
      });
    };
    ANALOGY_LEVELS.forEach(({ level, name }) => {
      const button = el('button', 'an-levels__btn');
      button.type = 'button';
      button.append(el('span', 'an-levels__num', `Level ${level}`), el('span', 'an-levels__name', name));
      button.addEventListener('click', () => {
        current = level;
        saveActivityState(key, { level });
        paint();
      });
      buttons.push(button);
      switcher.append(button);
    });
    wrap.append(switcher, ...panels);
    paint();
  }

  const checks = c.checks.filter((line) => line.trim());
  if (c.show_check && checks.length) {
    if (mode === 'print') {
      const box = el('div', 'an-check');
      box.append(el('p', 'tk-subhead', 'Check your analogy'), analogyCheckList(checks));
      wrap.append(box);
    } else {
      appendIf(
        wrap,
        reveal({ ctx, mode, blockId: block.id, part: 'check', label: 'Check your analogy', fixedLabel: true, body: () => analogyCheckList(checks) })
      );
    }
  }
  if (mode === 'teacher') wrap.append(teacherNote(block.id, c.teacher_note, c.teacher_jots));
  return wrap;
}

function renderAnalogyTypes(block: AnalogyTypesBlock, mode: TkRenderMode): HTMLElement {
  const c = block.content;
  const wrap = root(block.block_type);
  wrap.append(analogyEyebrow('Fluid analogy · Seven types'), analogyCard(ANALOGY_INTRO.title, undefined, ANALOGY_INTRO.body, null));
  appendIf(wrap, analogyFocus(c.focus), guideLine(c.guide));

  if (c.show_contrast && (c.weak.trim() || c.strong.trim())) {
    const contrast = el('div', 'an-contrast');
    for (const [label, text, tone] of [
      ['A weak analogy', c.weak, 'weak'],
      ['A strong analogy', c.strong, 'strong']
    ] as const) {
      if (!text.trim()) continue;
      const side = el('div', `an-contrast__side an-contrast__side--${tone}`);
      side.append(el('p', 'an-contrast__label', label), el('p', 'an-contrast__text', text));
      contrast.append(side);
    }
    wrap.append(contrast);
    if (c.why.trim()) wrap.append(el('p', 'an-contrast__why', c.why));
  }

  const chosen = new Set(c.types);
  const list = el('ol', 'an-types');
  list.setAttribute('aria-label', 'The seven types of analogy');
  for (const type of ANALOGY_TYPES) {
    const item = el('li', 'an-types__item');
    if (chosen.has(type.id)) item.classList.add('is-chosen');
    const head = el('p', 'an-types__head');
    head.append(el('span', 'an-types__num', String(type.order)), el('span', 'an-types__name', type.label), el('span', 'an-tag', type.tag));
    if (chosen.has(type.id)) head.append(el('span', 'an-types__chosen', 'This lesson'));
    item.append(head, el('p', 'an-types__text', type.definition));
    list.append(item);
  }
  wrap.append(list);

  const levels = el('div', 'an-tiers-box');
  levels.append(el('p', 'tk-subhead', 'Every type has three levels'));
  const tiers = el('ol', 'an-tiers');
  for (const { level, name, summary } of ANALOGY_LEVELS) {
    const item = el('li', 'an-tiers__item');
    item.append(el('span', 'an-tiers__num', `Level ${level}`), el('strong', 'an-tiers__name', name), el('span', 'an-tiers__text', summary));
    tiers.append(item);
  }
  levels.append(tiers);
  wrap.append(levels);

  const steps = c.process.filter((line) => line.trim());
  if (steps.length) {
    const box = el('div', 'an-process-box');
    box.append(el('p', 'tk-subhead', 'A simple process you can use'));
    const process = el('ol', 'an-process');
    for (const line of steps) process.append(el('li', undefined, line));
    box.append(process);
    wrap.append(box);
  }
  const checks = c.checks.filter((line) => line.trim());
  if (c.show_check && checks.length) {
    const box = el('div', 'an-check');
    box.append(el('p', 'tk-subhead', 'How to check your analogy'), analogyCheckList(checks));
    wrap.append(box);
  }
  if (mode === 'teacher') wrap.append(teacherNote(block.id, c.teacher_note, c.teacher_jots));
  return wrap;
}

// ─── Standalone Teacher note ────────────────────────────────────────────────

function renderTeacherNoteBlock(block: TeacherNoteBlock, mode: TkRenderMode): HTMLElement {
  const aside = el('aside', 'tk-note tk-note--standalone');
  if (mode !== 'teacher') {
    // Never reaches students (filtered before publish); render nothing if it does.
    aside.hidden = true;
    return aside;
  }
  aside.setAttribute('aria-label', block.content.title || 'Teacher note');
  const head = el('div', 'tk-note__head');
  head.append(el('p', 'tk-note__title', block.content.title.trim() || 'Teacher note'), notePill());
  const body = el('div', 'tk-note__body block-rich-text');
  body.innerHTML = sanitizeRichTextHtml(block.content.html);
  if (!body.textContent?.trim()) body.append(el('p', 'tk-note__hint', 'Select the block to write your note.'));
  aside.append(head, body);
  return aside;
}

export function renderToolkitContent(block: Block, mode: TkRenderMode, ctx: TkRenderContext = {}): HTMLElement | null {
  const b = block as ToolkitBlock;
  switch (b.block_type) {
    case 'toolkit_skill':
      return renderSkill(b, mode, ctx);
    case 'toolkit_tool':
      return renderTool(b, mode, ctx);
    case 'toolkit_value':
      return renderValue(b, mode, ctx);
    case 'thinking_move':
      return renderMove(b, mode, ctx);
    case 'question_quadrant':
      return renderQuadrant(b, mode, ctx);
    case 'concept_features':
      return renderConcept(b, mode, ctx);
    case 'thinking_intentions':
      return renderIntentions(b, mode);
    case 'thinking_reflection':
      return renderReflection(b, mode, ctx);
    case 'fluid_analogy':
      return renderFluidAnalogy(b, mode, ctx);
    case 'analogy_types':
      return renderAnalogyTypes(b, mode);
    case 'teacher_note':
      return renderTeacherNoteBlock(b, mode);
    default:
      return null;
  }
}
