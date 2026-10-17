import {
  createHubList,
  openHubInsertPicker,
  openHubMenu,
  type HubMenuItem
} from '../../design-kit/js/hub-list.js';
import { mountRichTextTiptap } from '@/blocks/rich-text-tiptap';
import type { Block } from '@/schemas/block';
import type { ConceptGameKind, PairLevel, Quadrant, StressVerdict, TkTeacherNote } from '@/schemas/toolkit';
import { ALL_CLASSES_KEY, classLabel } from '@/toolkit/class-context';
import {
  GUIDE,
  QUADRANT_LABEL,
  STEM_CELL_DEGREE_CARDS,
  cleanNote,
  conceptExample,
  conceptGame,
  conceptNote,
  emptyConceptGame,
  libraryNoteFor,
  moveBasis,
  moveNote,
  moveSentence,
  quadrantExample,
  quadrantNote,
  skillContent,
  syncMoveSteps,
  tkId,
  toolContent,
  toolExample,
  toolGuide,
  valueContent,
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
  COMMUNITY_SKILLS,
  COMMUNITY_SKILL_DESCRIPTION,
  DISTINCTION_PAIR_BANK,
  THINKING_MOVE_PRESETS,
  TOOLKIT_SKILLS,
  TOOLKIT_TOOLS,
  TOOLKIT_VALUES,
  itemLabel,
  libraryItem,
  libraryValue,
  type ToolkitKind
} from '@/toolkit/library';
import {
  ANALOGY_GUIDE,
  ANALOGY_LEVELS,
  analogyLadderContent,
  analogyLevel,
  analogyLevelContent,
  type AnalogyLadderBlock,
  type AnalogyLevelBlock
} from '@/toolkit/analogy';
import { createVisibilitySelect } from '@/blocks/editors';

type Change<T extends Block> = (block: T) => void;

// ─── Field helpers ──────────────────────────────────────────────────────────

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

function field(
  label: string,
  value: string,
  onInput: (value: string) => void,
  options: { multiline?: boolean; rows?: number; placeholder?: string; className?: string } = {}
): HTMLElement {
  const wrap = el('label', `tk-ed__field ${options.className ?? ''}`.trim());
  wrap.append(el('span', 'tk-ed__label', label));
  const input = options.multiline ? el('textarea', 'tk-ed__input') : el('input', 'tk-ed__input');
  if (input instanceof HTMLTextAreaElement) input.rows = options.rows ?? 3;
  else input.type = 'text';
  input.value = value;
  if (options.placeholder) input.placeholder = options.placeholder;
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(input);
  return wrap;
}

function checkbox(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const wrap = el('label', 'tk-ed__check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input, el('span', undefined, label));
  return wrap;
}

function pills<V extends string>(
  ariaLabel: string,
  options: Array<{ value: V; label: string }>,
  value: V,
  onChange: (value: V) => void
): HTMLElement {
  const row = el('div', 'hub-pills hub-pills--loose tk-ed__pills');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', ariaLabel);
  const buttons: HTMLButtonElement[] = [];
  let current = value;
  for (const option of options) {
    const button = el('button', 'hub-pills__btn', option.label);
    button.type = 'button';
    button.dataset.value = option.value;
    button.setAttribute('aria-pressed', option.value === current ? 'true' : 'false');
    button.addEventListener('click', () => {
      current = option.value;
      for (const other of buttons) other.setAttribute('aria-pressed', other.dataset.value === current ? 'true' : 'false');
      onChange(option.value);
    });
    buttons.push(button);
    row.append(button);
  }
  return row;
}

function section(title: string, ...nodes: Array<Node | null>): HTMLElement {
  const wrap = el('section', 'tk-ed__section');
  if (title) wrap.append(el('h4', 'tk-ed__heading', title));
  for (const node of nodes) if (node) wrap.append(node);
  return wrap;
}

/** Folded section for the settings most lessons never touch. */
function more(title: string, ...nodes: Array<Node | null>): HTMLElement {
  const wrap = el('details', 'tk-ed__more');
  wrap.append(el('summary', 'tk-ed__more-title', title));
  const body = el('div', 'tk-ed__more-body');
  for (const node of nodes) if (node) body.append(node);
  wrap.append(body);
  return wrap;
}

function actionButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'btn btn--ghost tk-ed__action', label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

/** The "What to do" line students see at the top of the block. */
function guideField(content: { guide: string }, emit: () => void, fallback: string): HTMLElement {
  return field('What to do (students see this)', content.guide, (value) => {
    content.guide = value;
    emit();
  }, { multiline: true, rows: 2, placeholder: fallback });
}

function resetButton(label: string, onReset: () => void): HTMLButtonElement {
  const button = el('button', 'btn btn--ghost tk-ed__reset', label);
  button.type = 'button';
  button.addEventListener('click', onReset);
  return button;
}

type TextItem = { id: string; text: string };

/** Ordered list of one-line strings, edited with the kit list builder. */
function stringList(options: {
  label: string;
  noun: string;
  items: string[];
  max?: number;
  multiline?: boolean;
  onChange: (items: string[]) => void;
}): HTMLElement {
  let rows: TextItem[] = options.items.map((text) => ({ id: tkId('li'), text }));
  const emit = () => options.onChange(rows.map((row) => row.text));
  const list = createHubList<TextItem>({
    items: rows,
    noun: options.noun,
    label: options.label,
    variant: 'compact',
    getKey: (row) => row.id,
    describe: (row, index) => row.text.trim() || `${options.noun} ${index + 1}`,
    max: options.max,
    create: () => ({ id: tkId('li'), text: '' }),
    duplicate: (row) => ({ id: tkId('li'), text: row.text }),
    onChange: (next) => {
      rows = next;
      emit();
    },
    renderItem: (row, ctx) => {
      const input = options.multiline ? el('textarea', 'tk-ed__input') : el('input', 'tk-ed__input');
      if (input instanceof HTMLTextAreaElement) input.rows = 2;
      else input.type = 'text';
      input.value = row.text;
      input.setAttribute('aria-label', `${options.label} ${ctx.index + 1}`);
      input.addEventListener('input', () => {
        ctx.update({ ...ctx.current, text: input.value });
      });
      return input;
    }
  });
  const wrap = el('div', 'tk-ed__list');
  wrap.append(el('span', 'tk-ed__label', options.label), list.el);
  return wrap;
}

/** Searchable picker over the library (the 16 / 12 / 9 lists). */
function pickItem(anchor: HTMLElement, kind: ToolkitKind, onPick: (id: string) => void): void {
  const option = (item: { id: string; label: string; definition: string }) => ({
    value: item.id,
    label: item.label,
    description: item.definition
  });
  const groups =
    kind === 'skill'
      ? [
          { label: 'Golden Tetrad (the core four)', options: TOOLKIT_SKILLS.filter((item) => item.tetrad).map(option) },
          { label: 'Other skills', options: TOOLKIT_SKILLS.filter((item) => !item.tetrad).map(option) }
        ]
      : [{ label: kind === 'tool' ? 'Tools' : 'Values', options: (kind === 'tool' ? TOOLKIT_TOOLS : TOOLKIT_VALUES).map(option) }];
  openHubInsertPicker(anchor, { placeholder: `Find a ${kind}`, groups, onPick });
}

function itemButton(kind: ToolkitKind, current: string, onPick: (id: string) => void, ariaLabel: string): HTMLElement {
  const button = el('button', `btn tk-ed__item tk-ed__item--${kind}`);
  button.type = 'button';
  button.setAttribute('aria-label', ariaLabel);
  const paint = (id: string) => {
    button.textContent = itemLabel(id) ? `${itemLabel(id)} ▾` : `Choose a ${kind} ▾`;
  };
  paint(current);
  button.addEventListener('click', () => {
    pickItem(button, kind, (id) => {
      paint(id);
      onPick(id);
    });
  });
  return button;
}

/** List of library item ids (tools in a move, link chips). */
function itemList(options: {
  label: string;
  kind: ToolkitKind;
  ids: string[];
  min?: number;
  max: number;
  onChange: (ids: string[]) => void;
}): HTMLElement {
  type Row = { key: string; id: string };
  let rows: Row[] = options.ids.map((id) => ({ key: tkId('it'), id }));
  const list = createHubList<Row>({
    items: rows,
    noun: options.kind,
    label: options.label,
    variant: 'compact',
    getKey: (row) => row.key,
    describe: (row) => itemLabel(row.id) || options.kind,
    min: options.min,
    max: options.max,
    maxReason: `Up to ${options.max}.`,
    minReason: `Keep at least ${options.min ?? 0}.`,
    pick: (anchor, done) => pickItem(anchor, options.kind, (id) => done({ key: tkId('it'), id })),
    onChange: (next) => {
      rows = next;
      options.onChange(rows.map((row) => row.id));
    },
    renderItem: (row) => el('span', `hub-list__chip tk-chip tk-chip--${options.kind}`, itemLabel(row.id))
  });
  const wrap = el('div', 'tk-ed__list');
  wrap.append(el('span', 'tk-ed__label', options.label), list.el);
  return wrap;
}

// ─── Teacher note + my notes ────────────────────────────────────────────────

function noteEditor(
  note: TkTeacherNote,
  onChange: (note: TkTeacherNote) => void,
  onReset: (() => void) | null
): HTMLElement {
  const draft: TkTeacherNote = cleanNote(note);
  const emit = () => {
    draft.edited = true;
    onChange(structuredClone(draft));
  };
  const nodes: Array<Node | null> = [
    field('About', draft.what, (value) => {
      draft.what = value;
      emit();
    }, { multiline: true, rows: 2 }),
    stringList({ label: 'How to run it', noun: 'step', items: draft.run, multiline: true, onChange: (items) => {
      draft.run = items;
      emit();
    } }),
    stringList({ label: 'Ask', noun: 'question', items: draft.say, onChange: (items) => {
      draft.say = items;
      emit();
    } }),
    stringList({ label: 'Watch for', noun: 'point', items: draft.watch, multiline: true, onChange: (items) => {
      draft.watch = items;
      emit();
    } })
  ];
  if (draft.extra_label.trim() || draft.extra.length) {
    nodes.push(
      stringList({ label: draft.extra_label || 'More', noun: 'line', items: draft.extra, multiline: true, onChange: (items) => {
        draft.extra = items;
        emit();
      } })
    );
  }
  if (onReset) nodes.push(resetButton('Reset teacher note', onReset));
  return more('Teacher note (only you see this)', ...nodes);
}

/** One notes box per block. Older per-class notes still show, under their class. */
function jotsEditor(jots: Record<string, string>, onChange: (jots: Record<string, string>) => void): HTMLElement {
  const draft: Record<string, string> = { ...jots };
  const box = (key: string, label: string): HTMLElement =>
    field(label, draft[key] ?? '', (value) => {
      if (value.trim()) draft[key] = value;
      else delete draft[key];
      onChange({ ...draft });
    }, { multiline: true, rows: 3, className: 'tk-ed__jot', placeholder: 'Reminders, tweaks, what worked last time …' });
  const legacy = Object.keys(draft).filter((key) => key !== ALL_CLASSES_KEY);
  return section(
    '',
    box(ALL_CLASSES_KEY, 'My notes (only you see this)'),
    ...legacy.map((key) => box(key, `My notes: ${classLabel(key)}`))
  );
}

// ─── Shells ─────────────────────────────────────────────────────────────────

function shell<T extends Block>(block: T, onChange: Change<T>, getLatest: () => T, fields: HTMLElement): HTMLElement {
  const root = el('div', 'block-editor tk-ed');
  root.dataset.blockId = block.id;
  root.dataset.blockType = block.block_type;
  root.append(createVisibilitySelect(block, onChange, getLatest), fields);
  return root;
}

/**
 * Editors keep a local copy of the content and emit the whole block on each
 * change. `rebuild` redraws the fields after a structural change (new item,
 * new frame); plain typing never rebuilds, so focus is kept.
 */
function makeEditor<T extends Block>(
  block: T,
  onChange: Change<T>,
  getLatest: () => T,
  build: (api: { content: T['content']; emit: () => void; rebuild: () => void }) => Array<Node | null>
): HTMLElement {
  const fields = el('div', 'block-editor__fields tk-ed__fields');
  const nodes = (api: { content: T['content']; emit: () => void; rebuild: () => void }) =>
    build(api).filter((node): node is Node => node !== null);
  const api = {
    content: structuredClone(block.content) as T['content'],
    emit: () => {
      onChange({ ...getLatest(), content: structuredClone(api.content) });
    },
    rebuild: () => {
      fields.replaceChildren(...nodes(api));
    }
  };
  fields.append(...nodes(api));
  return shell(block, onChange, getLatest, fields);
}

function noteNodes<T extends Block>(
  api: { content: T['content']; emit: () => void; rebuild: () => void },
  getLatest: () => T
): Node[] {
  const content = api.content as unknown as {
    teacher_note?: TkTeacherNote;
    teacher_jots?: Record<string, string>;
  };
  const nodes: Node[] = [
    jotsEditor(content.teacher_jots ?? {}, (jots) => {
      content.teacher_jots = jots;
      api.emit();
    })
  ];
  const note = content.teacher_note ?? libraryNoteFor(getLatest()) ?? undefined;
  if (note) {
    nodes.push(
      noteEditor(
        note,
        (next) => {
          content.teacher_note = next;
          api.emit();
        },
        () => {
          const fresh = libraryNoteFor({ ...getLatest(), content: api.content } as T);
          if (!fresh) return;
          content.teacher_note = fresh;
          api.emit();
          api.rebuild();
        }
      )
    );
  }
  return nodes;
}

function stepsList(
  label: string,
  steps: Array<{ id: string; title: string; prompt: string }>,
  prefix: string,
  onChange: (steps: Array<{ id: string; title: string; prompt: string }>) => void
): HTMLElement {
  type Step = { id: string; title: string; prompt: string };
  let rows: Step[] = steps.map((step) => ({ ...step }));
  const list = createHubList<Step>({
    items: rows,
    noun: 'step',
    label,
    getKey: (step) => step.id,
    itemLabel: (_step, index) => `Step ${index + 1}`,
    describe: (step, index) => step.title.trim() || `Step ${index + 1}`,
    max: 8,
    create: () => ({ id: tkId(`${prefix}_s`), title: '', prompt: '' }),
    duplicate: (step) => ({ ...step, id: tkId(`${prefix}_s`) }),
    onChange: (next) => {
      rows = next;
      onChange(rows.map((row) => ({ ...row })));
    },
    renderItem: (step, ctx) => {
      const frag = document.createDocumentFragment();
      frag.append(
        field('Step name', step.title, (value) => ctx.update({ ...ctx.current, title: value })),
        field('Prompt', step.prompt, (value) => ctx.update({ ...ctx.current, prompt: value }), { multiline: true, rows: 2 })
      );
      return frag;
    }
  });
  const wrap = el('div', 'tk-ed__list');
  wrap.append(el('span', 'tk-ed__label', label), list.el);
  return wrap;
}

function revealsList(
  reveals: Array<{ id: string; label: string; body: string }>,
  prefix: string,
  onChange: (reveals: Array<{ id: string; label: string; body: string }>) => void
): HTMLElement {
  type Reveal = { id: string; label: string; body: string };
  let rows: Reveal[] = reveals.map((row) => ({ ...row }));
  const list = createHubList<Reveal>({
    items: rows,
    noun: 'reveal',
    label: 'Reveal panels',
    getKey: (row) => row.id,
    describe: (row, index) => row.label.trim() || `Reveal ${index + 1}`,
    max: 6,
    create: () => ({ id: tkId(`${prefix}_r`), label: '', body: '' }),
    duplicate: (row) => ({ ...row, id: tkId(`${prefix}_r`) }),
    onChange: (next) => {
      rows = next;
      onChange(rows.map((row) => ({ ...row })));
    },
    renderItem: (row, ctx) => {
      const frag = document.createDocumentFragment();
      frag.append(
        field('Button says “Show …”', row.label, (value) => ctx.update({ ...ctx.current, label: value }), {
          placeholder: 'a worked example'
        }),
        field('Revealed text', row.body, (value) => ctx.update({ ...ctx.current, body: value }), { multiline: true, rows: 3 })
      );
      return frag;
    }
  });
  const wrap = el('div', 'tk-ed__list');
  wrap.append(el('span', 'tk-ed__label', 'Click-to-reveal panels'), list.el);
  return wrap;
}

/** Name + description fields under the item picker. */
function cardFields(api: { content: { label: string; definition: string }; emit: () => void }): HTMLElement[] {
  return [
    field('Name', api.content.label, (value) => {
      api.content.label = value;
      api.emit();
    }),
    field('What it means (students see this)', api.content.definition, (value) => {
      api.content.definition = value;
      api.emit();
    }, { multiline: true, rows: 2 })
  ];
}

function linksEditor(
  rows: Array<{ label: string; kind: ToolkitKind; ids: string[]; max: number; onChange: (ids: string[]) => void }>,
  show: boolean,
  onShow: (show: boolean) => void
): Node[] {
  return [
    checkbox('Show the related skills, tools and values', show, onShow),
    ...rows.map((row) => itemList({ label: row.label, kind: row.kind, ids: row.ids, max: row.max, onChange: row.onChange }))
  ];
}

// ─── Skill ──────────────────────────────────────────────────────────────────

export function createToolkitSkillEditor(
  block: ToolkitSkillBlock,
  onChange: Change<ToolkitSkillBlock>,
  getLatest: () => ToolkitSkillBlock = () => block
): HTMLElement {
  return makeEditor(block, onChange, getLatest, (api) => {
    const c = api.content;
    return [
      section(
        '',
        itemButton('skill', c.item, (id) => {
          const fresh = skillContent(id, getLatest().id);
          api.content = { ...fresh, guide: c.guide, context: c.context, teacher_jots: c.teacher_jots };
          api.emit();
          api.rebuild();
        }, 'Choose a skill'),
        ...cardFields(api),
        guideField(c, api.emit, GUIDE.skill),
        field('Question or task for this lesson (optional)', c.context, (value) => {
          c.context = value;
          api.emit();
        }, { placeholder: 'e.g. Was Macbeth responsible for his downfall?' }),
        stepsList('Steps', c.steps, getLatest().id, (steps) => {
          c.steps = steps;
          api.emit();
        })
      ),
      more(
        'More options',
        checkbox('Add a partner check step', c.show_test, (checked) => {
          c.show_test = checked;
          api.emit();
        }),
        stringList({ label: 'Check questions', noun: 'check', items: c.checks, max: 8, onChange: (items) => {
          c.checks = items;
          api.emit();
        } }),
        revealsList(c.reveals, getLatest().id, (reveals) => {
          c.reveals = reveals;
          api.emit();
        }),
        ...linksEditor(
          [
            { label: 'Tools it uses', kind: 'tool', ids: c.links.tools, max: 5, onChange: (ids) => {
              c.links = { ...c.links, tools: ids };
              api.emit();
            } },
            { label: 'Check it against', kind: 'value', ids: c.links.values, max: 3, onChange: (ids) => {
              c.links = { ...c.links, values: ids };
              api.emit();
            } }
          ],
          c.show_links,
          (checked) => {
            c.show_links = checked;
            api.emit();
          }
        ),
        resetButton('Reset name, description and steps', () => {
          const fresh = skillContent(c.item, getLatest().id);
          api.content = { ...fresh, guide: c.guide, context: c.context, teacher_note: c.teacher_note, teacher_jots: c.teacher_jots };
          api.emit();
          api.rebuild();
        })
      ),
      ...noteNodes(api, getLatest)
    ];
  });
}

// ─── Tool ───────────────────────────────────────────────────────────────────

const PAIR_LEVEL_OPTIONS: Array<{ value: PairLevel; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'level1', label: 'Concrete' },
  { value: 'level2', label: 'Abstract' },
  { value: 'level3', label: 'Harder' },
  { value: 'maths', label: 'Maths' },
  { value: 'inquiry', label: 'Inquiry' }
];

const VERDICT_OPTIONS: Array<{ value: StressVerdict; label: string }> = [
  { value: 'survives', label: 'Survives' },
  { value: 'fails', label: 'Fails' },
  { value: 'qualifies', label: 'Qualifies' }
];

function toolFrameNodes(
  api: { content: ToolkitToolBlock['content']; emit: () => void; rebuild: () => void },
  prefix: string
): Array<Node | null> {
  const c = api.content;
  const sentence = field('Sentence frame', c.sentence, (value) => {
    c.sentence = value;
    api.emit();
  }, { placeholder: 'e.g. I think ___ because ___.' });
  const loadExample = (label: string, empty: boolean) =>
    empty
      ? actionButton(label, () => {
          Object.assign(c, toolExample(c.frame, prefix));
          api.emit();
          api.rebuild();
        })
      : null;
  if (c.frame === 'fork') {
    const worked = (part: 'kind' | 'marker' | 'a' | 'b', label: string) =>
      field(label, c.worked[part], (value) => {
        c.worked = { ...c.worked, [part]: value };
        api.emit();
      });
    return [
      sentence,
      el('span', 'tk-ed__label', 'Word pairs for students to try'),
      pills('Word pairs', PAIR_LEVEL_OPTIONS, c.pair_level, (value) => {
        c.pair_level = value;
        api.emit();
      }),
      more(
        'Worked example (students reveal it)',
        loadExample('Load an example', !Object.values(c.worked).some((value) => value.trim())),
        worked('a', 'First word'),
        worked('b', 'Second word'),
        worked('kind', 'Kind both belong to'),
        worked('marker', 'What makes them differ'),
        field('Sentence', c.worked_note, (value) => {
          c.worked_note = value;
          api.emit();
        }, { multiline: true, rows: 2 })
      )
    ];
  }
  if (c.frame === 'converter') {
    type Pair = { id: string; closed: string; open: string };
    let rows: Pair[] = c.converters.map((row) => ({ ...row }));
    const list = createHubList<Pair>({
      items: rows,
      noun: 'question',
      label: 'Closed questions to open up',
      getKey: (row) => row.id,
      describe: (row, index) => row.closed.trim() || `Question ${index + 1}`,
      max: 10,
      create: () => ({ id: tkId(`${prefix}_c`), closed: '', open: '' }),
      onChange: (next) => {
        rows = next;
        c.converters = rows.map((row) => ({ ...row }));
        api.emit();
      },
      renderItem: (row, ctx) => {
        const frag = document.createDocumentFragment();
        frag.append(
          field('Closed question', row.closed, (value) => ctx.update({ ...ctx.current, closed: value })),
          field('Open version (students reveal it)', row.open, (value) => ctx.update({ ...ctx.current, open: value }))
        );
        return frag;
      }
    });
    return [sentence, el('span', 'tk-ed__label', 'Closed questions to open up'), list.el, loadExample('Load an example', rows.length === 0)];
  }
  if (c.frame === 'stress') {
    type Statement = ToolkitToolBlock['content']['statements'][number];
    let rows: Statement[] = c.statements.map((row) => ({ ...row }));
    const list = createHubList<Statement>({
      items: rows,
      noun: 'statement',
      label: 'Statements to test',
      getKey: (row) => row.id,
      describe: (row, index) => row.text.trim() || `Statement ${index + 1}`,
      max: 10,
      create: () => ({ id: tkId(`${prefix}_g`), text: '', verdict: 'qualifies', reason: '' }),
      onChange: (next) => {
        rows = next;
        c.statements = rows.map((row) => ({ ...row }));
        api.emit();
      },
      renderItem: (row, ctx) => {
        const frag = document.createDocumentFragment();
        frag.append(
          field('Statement', row.text, (value) => ctx.update({ ...ctx.current, text: value })),
          pills('Answer', VERDICT_OPTIONS, row.verdict, (value) => ctx.update({ ...ctx.current, verdict: value })),
          field('Reason or counterexample (students reveal it)', row.reason, (value) => ctx.update({ ...ctx.current, reason: value }), {
            multiline: true,
            rows: 2
          })
        );
        return frag;
      }
    });
    return [sentence, el('span', 'tk-ed__label', 'Statements to test'), list.el, loadExample('Load an example', rows.length === 0)];
  }
  return [
    stepsList('Steps', c.steps, prefix, (steps) => {
      c.steps = steps;
      api.emit();
    }),
    sentence
  ];
}

export function createToolkitToolEditor(
  block: ToolkitToolBlock,
  onChange: Change<ToolkitToolBlock>,
  getLatest: () => ToolkitToolBlock = () => block
): HTMLElement {
  return makeEditor(block, onChange, getLatest, (api) => {
    const c = api.content;
    return [
      section(
        '',
        itemButton('tool', c.item, (id) => {
          const fresh = toolContent(id, getLatest().id);
          const keepGuide = c.guide.trim() && c.guide !== toolGuide(c.frame);
          api.content = { ...fresh, guide: keepGuide ? c.guide : fresh.guide, teacher_jots: c.teacher_jots };
          api.emit();
          api.rebuild();
        }, 'Choose a tool'),
        ...cardFields(api),
        guideField(c, api.emit, toolGuide(c.frame)),
        ...toolFrameNodes(api, getLatest().id)
      ),
      more(
        'More options',
        revealsList(c.reveals, getLatest().id, (reveals) => {
          c.reveals = reveals;
          api.emit();
        }),
        ...linksEditor(
          [
            { label: 'Skills it helps with', kind: 'skill', ids: c.links.skills, max: 4, onChange: (ids) => {
              c.links = { ...c.links, skills: ids };
              api.emit();
            } },
            { label: 'Pairs well with', kind: 'tool', ids: c.links.tools, max: 4, onChange: (ids) => {
              c.links = { ...c.links, tools: ids };
              api.emit();
            } }
          ],
          c.show_links,
          (checked) => {
            c.show_links = checked;
            api.emit();
          }
        ),
        resetButton('Reset name, description and frame', () => {
          const fresh = toolContent(c.item, getLatest().id);
          api.content = { ...fresh, guide: c.guide, teacher_note: c.teacher_note, teacher_jots: c.teacher_jots };
          api.emit();
          api.rebuild();
        })
      ),
      ...noteNodes(api, getLatest)
    ];
  });
}

// ─── Value ──────────────────────────────────────────────────────────────────

export function createToolkitValueEditor(
  block: ToolkitValueBlock,
  onChange: Change<ToolkitValueBlock>,
  getLatest: () => ToolkitValueBlock = () => block
): HTMLElement {
  return makeEditor(block, onChange, getLatest, (api) => {
    const c = api.content;
    const prefix = getLatest().id;
    type Option = { id: string; text: string };
    let options: Option[] = c.options.map((row) => ({ ...row }));
    const optionList = createHubList<Option>({
      items: options,
      noun: 'option',
      label: 'Answers to compare',
      variant: 'compact',
      getKey: (row) => row.id,
      describe: (row, index) => row.text.trim() || `Answer ${index + 1}`,
      max: 8,
      create: () => ({ id: tkId(`${prefix}_o`), text: '' }),
      onChange: (next) => {
        options = next;
        c.options = options.map((row) => ({ ...row }));
        api.emit();
      },
      renderItem: (row, ctx) => {
        const input = el('textarea', 'tk-ed__input');
        input.rows = 2;
        input.value = row.text;
        input.setAttribute('aria-label', `Answer ${ctx.index + 1}`);
        input.addEventListener('input', () => ctx.update({ ...ctx.current, text: input.value }));
        return input;
      }
    });
    type Probe = { id: string; question: string; asks: string };
    let probes: Probe[] = c.probes.map((row) => ({ ...row }));
    const probeList = createHubList<Probe>({
      items: probes,
      noun: 'question',
      label: 'Check questions',
      getKey: (row) => row.id,
      describe: (row, index) => row.question.trim() || `Question ${index + 1}`,
      max: 8,
      create: () => ({ id: tkId(`${prefix}_p`), question: '', asks: '' }),
      onChange: (next) => {
        probes = next;
        c.probes = probes.map((row) => ({ ...row }));
        api.emit();
      },
      renderItem: (row, ctx) => {
        const frag = document.createDocumentFragment();
        frag.append(
          field('Question', row.question, (value) => ctx.update({ ...ctx.current, question: value })),
          field('Hint (students reveal it)', row.asks, (value) => ctx.update({ ...ctx.current, asks: value }))
        );
        return frag;
      }
    });
    const optionWrap = el('div', 'tk-ed__list');
    optionWrap.append(el('span', 'tk-ed__label', 'Answers to compare (optional)'), optionList.el);
    const probeWrap = el('div', 'tk-ed__list');
    probeWrap.append(el('span', 'tk-ed__label', 'Check questions'), probeList.el);
    return [
      section(
        '',
        itemButton('value', c.item, (id) => {
          const fresh = valueContent(id, prefix);
          api.content = { ...fresh, guide: c.guide, claim: c.claim, options: c.options, teacher_jots: c.teacher_jots };
          api.emit();
          api.rebuild();
        }, 'Choose a value'),
        ...cardFields(api),
        guideField(c, api.emit, GUIDE.value),
        field('Claim, question or paragraph to judge (optional)', c.claim, (value) => {
          c.claim = value;
          api.emit();
        }, { multiline: true, rows: 3 }),
        probeWrap
      ),
      more(
        'More options',
        optionWrap,
        field('Model answer button', c.model.label, (value) => {
          c.model = { ...c.model, label: value };
          api.emit();
        }, { placeholder: 'A model answer' }),
        field('Model answer (students reveal it)', c.model.body, (value) => {
          c.model = { ...c.model, body: value };
          api.emit();
        }, { multiline: true, rows: 3 }),
        field('In discussion, ask', c.discussion, (value) => {
          c.discussion = value;
          api.emit();
        }),
        resetButton('Reset name, description and questions', () => {
          const fresh = valueContent(c.item, prefix);
          api.content = { ...fresh, guide: c.guide, claim: c.claim, options: c.options, teacher_note: c.teacher_note, teacher_jots: c.teacher_jots };
          api.emit();
          api.rebuild();
        })
      ),
      ...noteNodes(api, getLatest)
    ];
  });
}

// ─── Thinking move ──────────────────────────────────────────────────────────

export function createThinkingMoveEditor(
  block: ThinkingMoveBlock,
  onChange: Change<ThinkingMoveBlock>,
  getLatest: () => ThinkingMoveBlock = () => block
): HTMLElement {
  return makeEditor(block, onChange, getLatest, (api) => {
    const c = api.content;
    const prefix = getLatest().id;

    /** Skill, tools or value changed: sync steps and checks, and the note unless edited. */
    const recompose = () => {
      c.steps = syncMoveSteps(c.tools, c.steps, prefix);
      const value = libraryValue(c.value);
      c.check = value ? value.probes.map((probe) => probe.question) : c.check;
      if (!c.teacher_note || !c.teacher_note.edited) {
        c.teacher_note = moveNote(c.skill, c.tools, c.value);
        c.note_basis = moveBasis(c.skill, c.tools, c.value);
      }
      api.emit();
      api.rebuild();
    };

    const presets = actionButton('Use a standard pairing', () => {
      openHubMenu(
        presets,
        THINKING_MOVE_PRESETS.map(
          (preset): HubMenuItem => ({
            label: preset.label,
            hint: moveSentence(preset.skill, preset.tools, c.value),
            onSelect: () => {
              c.skill = preset.skill;
              c.tools = [...preset.tools];
              recompose();
            }
          })
        ),
        { label: 'Standard pairings' }
      );
    });
    presets.setAttribute('aria-haspopup', 'menu');

    const stale =
      c.teacher_note?.edited && c.note_basis && c.note_basis !== moveBasis(c.skill, c.tools, c.value);
    const staleNotice = stale
      ? (() => {
          const box = el('div', 'tk-ed__notice');
          box.setAttribute('role', 'status');
          box.append(
            el('p', undefined, 'You changed the move after editing its teacher note. Your note is kept as you wrote it.'),
            resetButton('Rebuild the note for this move', () => {
              c.teacher_note = moveNote(c.skill, c.tools, c.value);
              c.note_basis = moveBasis(c.skill, c.tools, c.value);
              api.emit();
              api.rebuild();
            })
          );
          return box;
        })()
      : null;

    type Step = ThinkingMoveBlock['content']['steps'][number];
    const steps: Step[] = c.steps.map((step) => ({ ...step }));
    const stepEditors = el('div', 'tk-ed__move-steps');
    const setStep = (index: number, patch: Partial<Step>) => {
      steps[index] = { ...steps[index]!, ...patch };
      c.steps = steps.map((row) => ({ ...row }));
      api.emit();
    };
    steps.forEach((step, index) => {
      const box = el('div', 'tk-ed__move-step');
      box.append(
        el('p', 'tk-ed__label', `Step ${index + 1}: ${itemLabel(step.tool)}`),
        field('Instruction', step.prompt, (value) => setStep(index, { prompt: value }), { multiline: true, rows: 2 }),
        field('Sentence frame', step.frame, (value) => setStep(index, { frame: value })),
        field('Example (students reveal it, optional)', step.example, (value) => setStep(index, { example: value }), {
          multiline: true,
          rows: 2
        })
      );
      stepEditors.append(box);
    });

    const communityButton = el('button', 'btn tk-ed__item', c.community ? `${c.community} ▾` : 'Add a community skill ▾');
    communityButton.type = 'button';
    communityButton.addEventListener('click', () => {
      openHubInsertPicker(communityButton, {
        placeholder: 'Find a community skill',
        groups: [{ label: 'Community skills', options: [{ value: '', label: 'None' }, ...communityOptions()] }],
        onPick: (value) => {
          c.community = value;
          api.emit();
          api.rebuild();
        }
      });
    });

    const row = (label: string, control: HTMLElement) => {
      const wrap = el('div', 'tk-ed__row');
      wrap.append(el('span', 'tk-ed__label', label), control);
      return wrap;
    };

    return [
      section(
        '',
        el('p', 'tk-ed__sentence', moveSentence(c.skill, c.tools, c.value)),
        presets,
        row('Skill', itemButton('skill', c.skill, (id) => {
          c.skill = id;
          recompose();
        }, 'Choose the skill')),
        itemList({ label: 'Tools, in order', kind: 'tool', ids: c.tools, min: 1, max: 5, onChange: (ids) => {
          if (ids.length === 0) return;
          c.tools = ids;
          recompose();
        } }),
        row('Judged for', itemButton('value', c.value, (id) => {
          c.value = id;
          recompose();
        }, 'Choose the value')),
        guideField(c, api.emit, GUIDE.move),
        field('Claim, question or text to work on (optional)', c.stimulus, (value) => {
          c.stimulus = value;
          api.emit();
        }, { multiline: true, rows: 2 })
      ),
      section('Steps', stepEditors, stringList({ label: 'Final check questions', noun: 'question', items: c.check, max: 8, onChange: (items) => {
        c.check = items;
        api.emit();
      } })),
      more('More options', row('Working together (optional)', communityButton)),
      staleNotice,
      ...noteNodes(api, getLatest)
    ];
  });
}

function communityOptions(): Array<{ value: string; label: string; description: string }> {
  return COMMUNITY_SKILLS.map((skill) => ({ value: skill, label: skill, description: COMMUNITY_SKILL_DESCRIPTION[skill] ?? '' }));
}

// ─── Question Quadrant ──────────────────────────────────────────────────────

const QUADRANT_OPTIONS = (Object.keys(QUADRANT_LABEL) as Quadrant[]).map((value) => ({
  value,
  label: QUADRANT_LABEL[value]
}));

export function createQuestionQuadrantEditor(
  block: QuestionQuadrantBlock,
  onChange: Change<QuestionQuadrantBlock>,
  getLatest: () => QuestionQuadrantBlock = () => block
): HTMLElement {
  return makeEditor(block, onChange, getLatest, (api) => {
    const c = api.content;
    const prefix = getLatest().id;
    type Question = QuestionQuadrantBlock['content']['questions'][number];
    let questions: Question[] = c.questions.map((row) => ({ ...row }));
    const questionList = createHubList<Question>({
      items: questions,
      noun: 'question',
      label: 'Questions to sort',
      getKey: (row) => row.id,
      describe: (row, index) => row.text.trim() || `Question ${index + 1}`,
      max: 16,
      create: () => ({ id: tkId(`${prefix}_q`), text: '', quadrant: 'inquiry' }),
      onChange: (next) => {
        questions = next;
        c.questions = questions.map((row) => ({ ...row }));
        api.emit();
      },
      renderItem: (row, ctx) => {
        const frag = document.createDocumentFragment();
        frag.append(
          field('Question', row.text, (value) => ctx.update({ ...ctx.current, text: value })),
          pills('Answer', QUADRANT_OPTIONS, row.quadrant, (value) => ctx.update({ ...ctx.current, quadrant: value }))
        );
        return frag;
      }
    });
    type Pair = { id: string; closed: string; open: string };
    let pairs: Pair[] = c.converters.map((row) => ({ ...row }));
    const pairList = createHubList<Pair>({
      items: pairs,
      noun: 'pair',
      label: 'Closed to open',
      getKey: (row) => row.id,
      describe: (row, index) => row.closed.trim() || `Pair ${index + 1}`,
      max: 8,
      create: () => ({ id: tkId(`${prefix}_c`), closed: '', open: '' }),
      onChange: (next) => {
        pairs = next;
        c.converters = pairs.map((row) => ({ ...row }));
        api.emit();
      },
      renderItem: (row, ctx) => {
        const frag = document.createDocumentFragment();
        frag.append(
          field('Closed question', row.closed, (value) => ctx.update({ ...ctx.current, closed: value })),
          field('Open version (students reveal it)', row.open, (value) => ctx.update({ ...ctx.current, open: value }))
        );
        return frag;
      }
    });
    const empty = !c.stimulus.trim() && questions.length === 0 && pairs.length === 0;
    return [
      section(
        '',
        guideField(c, api.emit, GUIDE.quadrant),
        field('Stimulus (text, scenario or image description)', c.stimulus, (value) => {
          c.stimulus = value;
          api.emit();
        }, { multiline: true, rows: 3 }),
        el('span', 'tk-ed__label', 'Questions to sort'),
        questionList.el,
        empty
          ? actionButton('Load the Pooh and Piglet example', () => {
              Object.assign(c, quadrantExample(prefix));
              api.emit();
              api.rebuild();
            })
          : null
      ),
      more(
        'More options',
        el('span', 'tk-ed__label', 'Closed questions to open up'),
        pairList.el,
        el('span', 'tk-ed__label', 'How you will run it (sets the teacher note)'),
        pills(
          'How you will run it',
          [
            { value: 'sort' as const, label: 'Students sort my questions' },
            { value: 'create' as const, label: 'Groups write their own' }
          ],
          c.procedure,
          (value) => {
            c.procedure = value;
            if (!c.teacher_note || !c.teacher_note.edited) c.teacher_note = quadrantNote(value);
            api.emit();
            api.rebuild();
          }
        )
      ),
      ...noteNodes(api, getLatest)
    ];
  });
}

// ─── Features of a Concept ──────────────────────────────────────────────────

const GAME_OPTIONS: Array<{ value: ConceptGameKind; label: string }> = [
  { value: 'kind_sort', label: 'Sort into columns' },
  { value: 'degree_line', label: 'Place along a line' },
  { value: 'word_sort', label: 'Sort words' }
];

export function createConceptFeaturesEditor(
  block: ConceptFeaturesBlock,
  onChange: Change<ConceptFeaturesBlock>,
  getLatest: () => ConceptFeaturesBlock = () => block
): HTMLElement {
  return makeEditor(block, onChange, getLatest, (api) => {
    const c = api.content;
    const prefix = getLatest().id;
    type Concept = ConceptFeaturesBlock['content']['concepts'][number];
    let concepts: Concept[] = c.concepts.map((row) => ({ ...row }));
    const conceptList = createHubList<Concept>({
      items: concepts,
      noun: 'concept',
      label: 'Concepts',
      getKey: (row) => row.id,
      describe: (row, index) => row.label.trim() || `Concept ${index + 1}`,
      max: 8,
      create: () => ({ id: tkId(`${prefix}_n`), label: '', central: false, contestable: false, common: false }),
      onChange: (next) => {
        concepts = next;
        c.concepts = concepts.map((row) => ({ ...row }));
        api.emit();
      },
      renderItem: (row, ctx) => {
        const frag = document.createDocumentFragment();
        const checks = el('div', 'tk-ed__inline');
        checks.append(
          checkbox('Central', row.central, (checked) => ctx.update({ ...ctx.current, central: checked })),
          checkbox('Contestable', row.contestable, (checked) => ctx.update({ ...ctx.current, contestable: checked })),
          checkbox('Common', row.common, (checked) => ctx.update({ ...ctx.current, common: checked }))
        );
        frag.append(field('Concept', row.label, (value) => ctx.update({ ...ctx.current, label: value })), checks);
        return frag;
      }
    });
    type Card = ConceptFeaturesBlock['content']['game']['cards'][number];
    let cards: Card[] = c.game.cards.map((row) => ({ ...row }));
    const cardList = createHubList<Card>({
      items: cards,
      noun: 'card',
      label: 'Cards',
      getKey: (row) => row.id,
      describe: (row, index) => row.text.trim() || `Card ${index + 1}`,
      max: 16,
      create: () => ({ id: tkId(`${prefix}_k`), text: '', prompt: '' }),
      onChange: (next) => {
        cards = next;
        c.game = { ...c.game, cards: cards.map((row) => ({ ...row })) };
        api.emit();
      },
      renderItem: (row, ctx) => {
        const frag = document.createDocumentFragment();
        frag.append(field(c.game.kind === 'word_sort' ? 'Word' : 'Scenario', row.text, (value) => ctx.update({ ...ctx.current, text: value }), { multiline: c.game.kind !== 'word_sort', rows: 2 }));
        if (c.game.kind !== 'word_sort') {
          frag.append(field('Question to ask (students reveal it, optional)', row.prompt, (value) => ctx.update({ ...ctx.current, prompt: value })));
        }
        return frag;
      }
    });
    const line = c.game.kind === 'degree_line';
    const empty = concepts.length === 0 && cards.length === 0 && !c.analogy.stem.trim() && c.criteria.length === 0;
    const gameExample = cards.length === 0
      ? actionButton(line ? 'Load example cards (stem cells)' : 'Load example cards', () => {
          c.game = line
            ? {
                ...c.game,
                left: 'Less acceptable',
                right: 'More acceptable',
                cards: STEM_CELL_DEGREE_CARDS.map((text) => ({ id: tkId(`${prefix}_k`), text, prompt: '' }))
              }
            : conceptGame(c.game.kind, prefix);
          api.emit();
          api.rebuild();
        })
      : null;
    return [
      section(
        '',
        empty
          ? actionButton('Load the worked example (responsibility)', () => {
              Object.assign(c, conceptExample(prefix));
              api.emit();
              api.rebuild();
            })
          : null,
        guideField(c, api.emit, GUIDE.concept),
        el('span', 'tk-ed__label', 'Concepts for the grid (tick the answers students reveal)'),
        conceptList.el
      ),
      section(
        'Concept game (optional)',
        pills('Concept game', GAME_OPTIONS, c.game.kind, (value) => {
          const kept = c.game.cards;
          c.game = { ...emptyConceptGame(value), cards: kept };
          if (!c.teacher_note || !c.teacher_note.edited) c.teacher_note = conceptNote(value);
          api.emit();
          api.rebuild();
        }),
        (() => {
          const ends = el('div', 'tk-ed__inline tk-ed__ends');
          ends.append(
            field(line ? 'Left end' : 'Left column', c.game.left, (value) => {
              c.game = { ...c.game, left: value };
              api.emit();
            }),
            line
              ? el('span')
              : field('Middle', c.game.middle, (value) => {
                  c.game = { ...c.game, middle: value };
                  api.emit();
                }),
            field(line ? 'Right end' : 'Right column', c.game.right, (value) => {
              c.game = { ...c.game, right: value };
              api.emit();
            })
          );
          return ends;
        })(),
        cardList.el,
        gameExample
      ),
      more(
        'More options',
        field('Analogy warm-up frame', c.analogy.stem, (value) => {
          c.analogy = { ...c.analogy, stem: value };
          api.emit();
        }, { placeholder: 'e.g. Responsibility is like ___ because they both ___.' }),
        field('Analogy example (students reveal it)', c.analogy.example, (value) => {
          c.analogy = { ...c.analogy, example: value };
          api.emit();
        }, { multiline: true, rows: 2 }),
        stringList({ label: 'Criteria (students reveal them at the end)', noun: 'criterion', items: c.criteria, max: 8, multiline: true, onChange: (items) => {
          c.criteria = items;
          api.emit();
        } })
      ),
      ...noteNodes(api, getLatest)
    ];
  });
}

// ─── Thinking intentions ────────────────────────────────────────────────────

export function createThinkingIntentionsEditor(
  block: ThinkingIntentionsBlock,
  onChange: Change<ThinkingIntentionsBlock>,
  getLatest: () => ThinkingIntentionsBlock = () => block
): HTMLElement {
  return makeEditor(block, onChange, getLatest, (api) => {
    const c = api.content;
    type Row = { key: string; value: string };
    let community: Row[] = c.community.map((value) => ({ key: tkId('cm'), value }));
    const communityList = createHubList<Row>({
      items: community,
      noun: 'community skill',
      label: 'Working together',
      variant: 'compact',
      getKey: (row) => row.key,
      describe: (row) => row.value,
      max: 2,
      maxReason: 'Pick one or two per lesson.',
      pick: (anchor, done) =>
        openHubInsertPicker(anchor, {
          placeholder: 'Find a community skill',
          groups: [{ label: 'Community skills', options: communityOptions() }],
          onPick: (value) => done({ key: tkId('cm'), value })
        }),
      onChange: (next) => {
        community = next;
        c.community = community.map((row) => row.value);
        api.emit();
      },
      renderItem: (row) => el('span', 'hub-list__chip tk-chip tk-chip--community', row.value)
    });
    const communityWrap = el('div', 'tk-ed__list');
    communityWrap.append(el('span', 'tk-ed__label', 'Working together (1 or 2 community skills)'), communityList.el);
    return [
      section(
        '',
        field('We are learning …', c.content, (value) => {
          c.content = value;
          api.emit();
        }, { multiline: true, rows: 2, placeholder: 'e.g. how Shakespeare presents ambition in Macbeth' }),
        itemList({ label: 'We will think by (1 or 2 skills)', kind: 'skill', ids: c.skills, max: 2, onChange: (ids) => {
          c.skills = ids;
          api.emit();
        } }),
        itemList({ label: 'Using (tools)', kind: 'tool', ids: c.tools, max: 6, onChange: (ids) => {
          c.tools = ids;
          api.emit();
        } }),
        itemList({ label: 'Judged for (values)', kind: 'value', ids: c.values, max: 4, onChange: (ids) => {
          c.values = ids;
          api.emit();
        } }),
        communityWrap,
        stringList({ label: 'Success criteria: I can …', noun: 'criterion', items: c.success, max: 6, onChange: (items) => {
          c.success = items;
          api.emit();
        } }),
        el('p', 'tk-ed__hint', 'Students see each skill, tool, value and community skill with a one-line description.')
      )
    ];
  });
}

// ─── Thinking reflection ────────────────────────────────────────────────────

export function createThinkingReflectionEditor(
  block: ThinkingReflectionBlock,
  onChange: Change<ThinkingReflectionBlock>,
  getLatest: () => ThinkingReflectionBlock = () => block
): HTMLElement {
  return makeEditor(block, onChange, getLatest, (api) => {
    const c = api.content;
    return [
      section(
        '',
        pills(
          'Reflection type',
          [
            { value: 'lesson' as const, label: 'End of lesson' },
            { value: 'unit' as const, label: 'End of unit' }
          ],
          c.variant,
          (value) => {
            c.variant = value;
            api.emit();
          }
        ),
        guideField(c, api.emit, GUIDE.reflection),
        field('Concept (optional)', c.concept, (value) => {
          c.concept = value;
          api.emit();
        }, { placeholder: 'e.g. responsibility' }),
        el('p', 'tk-ed__hint', 'The tools, values and community skills used on this page fill in by themselves.')
      ),
      ...noteNodes(api, getLatest)
    ];
  });
}

// ─── Analogous Thinking ─────────────────────────────────────────────────────

/** The seven levels as one row of buttons, lowest first. */
function levelPicker(current: string, onPick: (id: string) => void): HTMLElement {
  const row = el('div', 'hub-pills hub-pills--loose tk-ed__pills an-ed__levels');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Level');
  for (const level of ANALOGY_LEVELS) {
    const button = el('button', 'hub-pills__btn', `${level.level}. ${level.label}`);
    button.type = 'button';
    button.dataset.level = level.id;
    button.title = level.definition;
    button.setAttribute('aria-pressed', level.id === current ? 'true' : 'false');
    button.addEventListener('click', () => onPick(level.id));
    row.append(button);
  }
  return row;
}

export function createAnalogyLevelEditor(
  block: AnalogyLevelBlock,
  onChange: Change<AnalogyLevelBlock>,
  getLatest: () => AnalogyLevelBlock = () => block
): HTMLElement {
  return makeEditor(block, onChange, getLatest, (api) => {
    const c = api.content;
    const level = analogyLevel(c.level);
    return [
      section(
        '',
        el('span', 'tk-ed__label', 'Level'),
        levelPicker(c.level, (id) => {
          if (id === c.level) return;
          const fresh = analogyLevelContent(id);
          const libraryGuides = [level?.guide, level?.card_prompt];
          const keepGuide = c.guide.trim() && !libraryGuides.includes(c.guide);
          api.content = {
            ...fresh,
            guide: keepGuide ? c.guide : fresh.guide,
            focus: c.focus,
            show_check: c.show_check,
            checks: c.checks,
            show_next: c.show_next,
            show_card: c.show_card,
            teacher_note: c.teacher_note?.edited ? c.teacher_note : fresh.teacher_note,
            teacher_jots: c.teacher_jots
          };
          api.emit();
          api.rebuild();
        }),
        ...cardFields(api),
        field('Working with (optional)', c.focus, (value) => {
          c.focus = value;
          api.emit();
        }, { multiline: true, rows: 2, placeholder: 'e.g. Macbeth’s ambition, or a line from the text' }),
        guideField(c, api.emit, level?.guide ?? ''),
        level
          ? actionButton('Use the short card wording', () => {
              c.guide = level.card_prompt;
              api.emit();
              api.rebuild();
            })
          : null,
        field('Sentence starter', c.frame, (value) => {
          c.frame = value;
          api.emit();
        }, { multiline: true, rows: 2 }),
        field('Example (students reveal it)', c.example, (value) => {
          c.example = value;
          api.emit();
        }, { multiline: true, rows: 4 })
      ),
      more(
        'More options',
        field('This helps you …', c.helps, (value) => {
          c.helps = value;
          api.emit();
        }),
        checkbox('Show “Check your analogy”', c.show_check, (checked) => {
          c.show_check = checked;
          api.emit();
        }),
        stringList({ label: 'Check questions', noun: 'question', items: c.checks, max: 8, onChange: (items) => {
          c.checks = items;
          api.emit();
        } }),
        checkbox('Point to the next level', c.show_next, (checked) => {
          c.show_next = checked;
          api.emit();
        }),
        checkbox('Show the prompt-card name (for the printed deck)', c.show_card, (checked) => {
          c.show_card = checked;
          api.emit();
        }),
        resetButton('Reset to the library wording', () => {
          const fresh = analogyLevelContent(c.level);
          api.content = { ...fresh, focus: c.focus, teacher_note: c.teacher_note, teacher_jots: c.teacher_jots };
          api.emit();
          api.rebuild();
        })
      ),
      ...noteNodes(api, getLatest)
    ];
  });
}

export function createAnalogyLadderEditor(
  block: AnalogyLadderBlock,
  onChange: Change<AnalogyLadderBlock>,
  getLatest: () => AnalogyLadderBlock = () => block
): HTMLElement {
  return makeEditor(block, onChange, getLatest, (api) => {
    const c = api.content;
    const marks = el('div', 'an-ed__marks');
    for (const level of ANALOGY_LEVELS) {
      marks.append(
        checkbox(`${level.level}. ${level.label}`, c.levels.includes(level.id), (checked) => {
          const next = new Set(c.levels);
          if (checked) next.add(level.id);
          else next.delete(level.id);
          c.levels = ANALOGY_LEVELS.filter((item) => next.has(item.id)).map((item) => item.id);
          api.emit();
        })
      );
    }
    return [
      section(
        '',
        guideField(c, api.emit, ANALOGY_GUIDE.ladder),
        field('Working with (optional)', c.focus, (value) => {
          c.focus = value;
          api.emit();
        }, { multiline: true, rows: 2, placeholder: 'e.g. the text the class is reading' }),
        el('span', 'tk-ed__label', 'Mark the levels for this lesson'),
        marks
      ),
      more(
        'More options',
        checkbox('Show a weak and a strong analogy', c.show_contrast, (checked) => {
          c.show_contrast = checked;
          api.emit();
        }),
        field('A weak analogy', c.weak, (value) => {
          c.weak = value;
          api.emit();
        }, { multiline: true, rows: 2 }),
        field('A strong analogy', c.strong, (value) => {
          c.strong = value;
          api.emit();
        }, { multiline: true, rows: 2 }),
        field('Why the second is stronger', c.why, (value) => {
          c.why = value;
          api.emit();
        }, { multiline: true, rows: 2 }),
        stringList({ label: 'Process steps', noun: 'step', items: c.process, max: 8, multiline: true, onChange: (items) => {
          c.process = items;
          api.emit();
        } }),
        checkbox('Show “How to check your analogy”', c.show_check, (checked) => {
          c.show_check = checked;
          api.emit();
        }),
        stringList({ label: 'Check questions', noun: 'question', items: c.checks, max: 8, onChange: (items) => {
          c.checks = items;
          api.emit();
        } }),
        resetButton('Reset to the library wording', () => {
          const fresh = analogyLadderContent();
          api.content = {
            ...fresh,
            focus: c.focus,
            levels: c.levels,
            teacher_note: c.teacher_note,
            teacher_jots: c.teacher_jots
          };
          api.emit();
          api.rebuild();
        })
      ),
      ...noteNodes(api, getLatest)
    ];
  });
}

// ─── Standalone Teacher note ────────────────────────────────────────────────

export function createTeacherNoteBlockEditor(
  block: TeacherNoteBlock,
  onChange: Change<TeacherNoteBlock>,
  getLatest: () => TeacherNoteBlock = () => block
): HTMLElement {
  const root = el('div', 'block-editor tk-ed');
  root.dataset.blockId = block.id;
  root.dataset.blockType = block.block_type;
  const fields = el('div', 'block-editor__fields tk-ed__fields');
  let title = block.content.title;
  let html = block.content.html;
  const emit = () => {
    onChange({ ...getLatest(), visibility: 'teacher_only', content: { title, html } });
  };
  const tiptap = mountRichTextTiptap({
    html,
    onHtml: (next) => {
      html = next;
      emit();
    }
  });
  const pill = el('p', 'tk-ed__hint');
  pill.append(el('span', 'tk-note__pill', 'Only you see this'), document.createTextNode(' Always teacher-only. Never published or printed.'));
  fields.append(
    pill,
    field('Title', title, (value) => {
      title = value;
      emit();
    }),
    el('span', 'tk-ed__label', 'Note'),
    tiptap.host
  );
  root.append(fields);
  root.addEventListener('remove', () => tiptap.destroy(), { once: true });
  return root;
}
