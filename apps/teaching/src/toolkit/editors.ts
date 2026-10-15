import {
  createHubList,
  openHubInsertPicker,
  openHubMenu,
  type HubMenuItem
} from '../../design-kit/js/hub-list.js';
import { mountRichTextTiptap } from '@/blocks/rich-text-tiptap';
import type { Block } from '@/schemas/block';
import type { ConceptGameKind, PairLevel, Quadrant, StressVerdict, TkTeacherNote } from '@/schemas/toolkit';
import {
  ALL_CLASSES_KEY,
  activeToolkitClass,
  setActiveToolkitClass,
  toolkitClasses
} from '@/toolkit/class-context';
import {
  QUADRANT_LABEL,
  STEM_CELL_DEGREE_CARDS,
  conceptGame,
  conceptNote,
  libraryNoteFor,
  moveBasis,
  moveNote,
  moveSentence,
  moveWhy,
  quadrantNote,
  skillContent,
  syncMoveSteps,
  tkId,
  toolContent,
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
  wrap.append(el('h4', 'tk-ed__heading', title));
  for (const node of nodes) if (node) wrap.append(node);
  return wrap;
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
  const source = kind === 'skill' ? TOOLKIT_SKILLS : kind === 'tool' ? TOOLKIT_TOOLS : TOOLKIT_VALUES;
  const groupLabel = kind === 'skill' ? 'Skills' : kind === 'tool' ? 'Tools' : 'Values';
  openHubInsertPicker(anchor, {
    placeholder: `Find a ${kind}`,
    groups: [
      {
        label: groupLabel,
        options: source.map((item) => ({
          value: item.id,
          label: item.kind === 'skill' && item.tetrad ? `${item.label} ★` : item.label,
          description: item.definition
        }))
      }
    ],
    onPick
  });
}

function itemButton(kind: ToolkitKind, current: string, onPick: (id: string) => void, ariaLabel: string): HTMLElement {
  const button = el('button', `btn btn--ghost tk-ed__item tk-ed__item--${kind}`);
  button.type = 'button';
  button.setAttribute('aria-label', ariaLabel);
  const paint = (id: string) => {
    button.textContent = itemLabel(id) || `Choose a ${kind}`;
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

// ─── Teacher note + class notes ─────────────────────────────────────────────

function noteEditor(
  note: TkTeacherNote,
  onChange: (note: TkTeacherNote) => void,
  onReset: (() => void) | null
): HTMLElement {
  const draft: TkTeacherNote = structuredClone(note);
  const emit = () => {
    draft.edited = true;
    onChange(structuredClone(draft));
  };
  const reset = onReset ? resetButton('Reset note to library version', onReset) : null;
  return section(
    'Teacher note',
    el('p', 'tk-ed__hint', 'Only you see this. It is removed before students see the page or print it.'),
    field('What it is', draft.what, (value) => {
      draft.what = value;
      emit();
    }, { multiline: true, rows: 3 }),
    stringList({ label: 'How to run it', noun: 'step', items: draft.run, multiline: true, onChange: (items) => {
      draft.run = items;
      emit();
    } }),
    stringList({ label: 'Say it', noun: 'stem', items: draft.say, onChange: (items) => {
      draft.say = items;
      emit();
    } }),
    stringList({ label: 'Watch for', noun: 'point', items: draft.watch, multiline: true, onChange: (items) => {
      draft.watch = items;
      emit();
    } }),
    field('Extra section heading', draft.extra_label, (value) => {
      draft.extra_label = value;
      emit();
    }, { placeholder: 'e.g. What good looks like' }),
    stringList({ label: 'Extra section', noun: 'line', items: draft.extra, multiline: true, onChange: (items) => {
      draft.extra = items;
      emit();
    } }),
    field('Time', draft.time, (value) => {
      draft.time = value;
      emit();
    }),
    field('Source', draft.source, (value) => {
      draft.source = value;
      emit();
    }),
    reset
  );
}

function jotsEditor(jots: Record<string, string>, onChange: (jots: Record<string, string>) => void): HTMLElement {
  const draft: Record<string, string> = { ...jots };
  const classes = toolkitClasses();
  let current = classes.some((row) => row.id === activeToolkitClass()) ? activeToolkitClass() : ALL_CLASSES_KEY;
  const textarea = el('textarea', 'tk-ed__input tk-ed__jot');
  textarea.rows = 4;
  const paint = () => {
    textarea.value = draft[current] ?? '';
    const name = current === ALL_CLASSES_KEY ? 'every class' : (classes.find((row) => row.id === current)?.label ?? 'this class');
    textarea.setAttribute('aria-label', `My notes for ${name}`);
    textarea.placeholder = `Notes for ${name}`;
  };
  textarea.addEventListener('input', () => {
    if (textarea.value.trim()) draft[current] = textarea.value;
    else delete draft[current];
    onChange({ ...draft });
  });
  const nodes: Node[] = [];
  if (classes.length > 0) {
    nodes.push(
      pills(
        'Which class these notes are for',
        [{ value: ALL_CLASSES_KEY, label: 'All classes' }, ...classes.map((row) => ({ value: row.id, label: row.label }))],
        current,
        (value) => {
          current = value;
          setActiveToolkitClass(value);
          paint();
        }
      )
    );
  }
  paint();
  nodes.push(textarea);
  return section('My notes for this class', ...nodes);
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
  build: (api: { content: T['content']; emit: () => void; rebuild: () => void }) => Node[]
): HTMLElement {
  const fields = el('div', 'block-editor__fields tk-ed__fields');
  const api = {
    content: structuredClone(block.content) as T['content'],
    emit: () => {
      onChange({ ...getLatest(), content: structuredClone(api.content) });
    },
    rebuild: () => {
      fields.replaceChildren(...build(api));
    }
  };
  fields.append(...build(api));
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
  const note = content.teacher_note ?? libraryNoteFor(getLatest()) ?? undefined;
  const nodes: Node[] = [];
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
  nodes.push(
    jotsEditor(content.teacher_jots ?? {}, (jots) => {
      content.teacher_jots = jots;
      api.emit();
    })
  );
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

function cardFields(
  api: { content: { label: string; definition: string; definition_source?: string }; emit: () => void },
  itemId: string,
  rebuild: () => void
): HTMLElement {
  const item = libraryItem(itemId);
  const source = api.content.definition_source || item?.definition_source || '';
  return section(
    'Card',
    field('Name', api.content.label, (value) => {
      api.content.label = value;
      api.emit();
    }),
    field('Definition', api.content.definition, (value) => {
      api.content.definition = value;
      api.emit();
    }, { multiline: true, rows: 2 }),
    source ? el('p', 'tk-ed__hint', `Definition source: ${source}`) : null,
    item
      ? resetButton('Reset card to library version', () => {
          api.content.label = item.label;
          api.content.definition = item.definition;
          api.content.definition_source = item.definition_source;
          api.emit();
          rebuild();
        })
      : null
  );
}

// ─── Toolkit skill ──────────────────────────────────────────────────────────

export function createToolkitSkillEditor(
  block: ToolkitSkillBlock,
  onChange: Change<ToolkitSkillBlock>,
  getLatest: () => ToolkitSkillBlock = () => block
): HTMLElement {
  return makeEditor(block, onChange, getLatest, (api) => {
    const c = api.content;
    const library = libraryItem(c.item);
    return [
      section(
        'Skill',
        itemButton('skill', c.item, (id) => {
          const fresh = skillContent(id, getLatest().id);
          api.content = { ...fresh, context: c.context, teacher_jots: c.teacher_jots };
          api.emit();
          api.rebuild();
        }, 'Choose a skill'),
        el('p', 'tk-ed__hint', '★ Golden Tetrad (Ellerton). Choosing a skill loads its library steps and note.')
      ),
      cardFields(api, c.item, api.rebuild),
      section(
        'Activity',
        field('Context question (optional)', c.context, (value) => {
          c.context = value;
          api.emit();
        }, { placeholder: 'The inquiry question for this lesson' }),
        stepsList('Steps', c.steps, getLatest().id, (steps) => {
          c.steps = steps;
          api.emit();
        }),
        checkbox('Show the partner Test step', c.show_test, (checked) => {
          c.show_test = checked;
          api.emit();
        }),
        stringList({ label: 'Test checks', noun: 'check', items: c.checks, max: 8, onChange: (items) => {
          c.checks = items;
          api.emit();
        } }),
        revealsList(c.reveals, getLatest().id, (reveals) => {
          c.reveals = reveals;
          api.emit();
        }),
        library
          ? resetButton('Reset activity to library version', () => {
              const fresh = skillContent(c.item, getLatest().id);
              c.steps = fresh.steps;
              c.checks = fresh.checks;
              c.reveals = fresh.reveals;
              c.show_test = fresh.show_test;
              api.emit();
              api.rebuild();
            })
          : null
      ),
      section(
        'Link chips',
        checkbox('Show link chips', c.show_links, (checked) => {
          c.show_links = checked;
          api.emit();
        }),
        itemList({ label: 'Tools it uses', kind: 'tool', ids: c.links.tools, max: 5, onChange: (ids) => {
          c.links = { ...c.links, tools: ids };
          api.emit();
        } }),
        itemList({ label: 'Check it against', kind: 'value', ids: c.links.values, max: 3, onChange: (ids) => {
          c.links = { ...c.links, values: ids };
          api.emit();
        } })
      ),
      ...noteNodes(api, getLatest)
    ];
  });
}

// ─── Toolkit tool ───────────────────────────────────────────────────────────

const PAIR_LEVEL_OPTIONS: Array<{ value: PairLevel; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'level1', label: 'Level 1' },
  { value: 'level2', label: 'Level 2' },
  { value: 'level3', label: 'Level 3' },
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
): Node[] {
  const c = api.content;
  const sentence = field('Sentence frame', c.sentence, (value) => {
    c.sentence = value;
    api.emit();
  }, { multiline: true, rows: 2 });
  if (c.frame === 'fork') {
    const worked = (part: 'kind' | 'marker' | 'a' | 'b', label: string) =>
      field(label, c.worked[part], (value) => {
        c.worked = { ...c.worked, [part]: value };
        api.emit();
      });
    return [
      section(
        'The fork',
        sentence,
        el('p', 'tk-ed__hint', 'Worked example: shown in the fork when students reveal it.'),
        worked('kind', 'General kind'),
        worked('marker', 'Marker of difference'),
        worked('a', 'Side A'),
        worked('b', 'Side B'),
        field('Worked example sentence', c.worked_note, (value) => {
          c.worked_note = value;
          api.emit();
        }, { multiline: true, rows: 2 }),
        el('span', 'tk-ed__label', 'Pair bank (Kate Kennedy White)'),
        pills('Pair bank level', PAIR_LEVEL_OPTIONS, c.pair_level, (value) => {
          c.pair_level = value;
          api.emit();
        }),
        el(
          'p',
          'tk-ed__hint',
          'Levels: ' +
            (Object.keys(DISTINCTION_PAIR_BANK) as Array<keyof typeof DISTINCTION_PAIR_BANK>)
              .map((key) => DISTINCTION_PAIR_BANK[key].label)
              .join(' · ')
        )
      )
    ];
  }
  if (c.frame === 'converter') {
    type Pair = { id: string; closed: string; open: string };
    let rows: Pair[] = c.converters.map((row) => ({ ...row }));
    const list = createHubList<Pair>({
      items: rows,
      noun: 'question',
      label: 'Closed to open',
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
          field('Open version (revealed)', row.open, (value) => ctx.update({ ...ctx.current, open: value }))
        );
        return frag;
      }
    });
    return [section('Closed to open', list.el)];
  }
  if (c.frame === 'stress') {
    type Statement = ToolkitToolBlock['content']['statements'][number];
    let rows: Statement[] = c.statements.map((row) => ({ ...row }));
    const list = createHubList<Statement>({
      items: rows,
      noun: 'generalisation',
      label: 'Generalisations to test',
      getKey: (row) => row.id,
      describe: (row, index) => row.text.trim() || `Generalisation ${index + 1}`,
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
          field('Generalisation', row.text, (value) => ctx.update({ ...ctx.current, text: value })),
          pills('Our verdict', VERDICT_OPTIONS, row.verdict, (value) => ctx.update({ ...ctx.current, verdict: value })),
          field('Reason or counterexample (revealed)', row.reason, (value) => ctx.update({ ...ctx.current, reason: value }), {
            multiline: true,
            rows: 2
          })
        );
        return frag;
      }
    });
    return [section('Stress test', sentence, list.el)];
  }
  return [
    section(
      'Frame',
      stepsList('Steps', c.steps, prefix, (steps) => {
        c.steps = steps;
        api.emit();
      }),
      sentence
    )
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
        'Tool',
        itemButton('tool', c.item, (id) => {
          const fresh = toolContent(id, getLatest().id);
          api.content = { ...fresh, teacher_jots: c.teacher_jots };
          api.emit();
          api.rebuild();
        }, 'Choose a tool'),
        el('p', 'tk-ed__hint', 'Choosing a tool loads its frame, reveals and note.')
      ),
      cardFields(api, c.item, api.rebuild),
      ...toolFrameNodes(api, getLatest().id),
      section(
        'Reveals',
        revealsList(c.reveals, getLatest().id, (reveals) => {
          c.reveals = reveals;
          api.emit();
        }),
        resetButton('Reset frame and reveals to library version', () => {
          const fresh = toolContent(c.item, getLatest().id);
          api.content = { ...fresh, label: c.label, definition: c.definition, teacher_note: c.teacher_note, teacher_jots: c.teacher_jots };
          api.emit();
          api.rebuild();
        })
      ),
      section(
        'Link chips',
        checkbox('Show link chips', c.show_links, (checked) => {
          c.show_links = checked;
          api.emit();
        }),
        itemList({ label: 'Skills in play', kind: 'skill', ids: c.links.skills, max: 4, onChange: (ids) => {
          c.links = { ...c.links, skills: ids };
          api.emit();
        } }),
        itemList({ label: 'Pairs well with', kind: 'tool', ids: c.links.tools, max: 4, onChange: (ids) => {
          c.links = { ...c.links, tools: ids };
          api.emit();
        } })
      ),
      ...noteNodes(api, getLatest)
    ];
  });
}

// ─── Toolkit value ──────────────────────────────────────────────────────────

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
      label: 'Options to judge',
      variant: 'compact',
      getKey: (row) => row.id,
      describe: (row, index) => row.text.trim() || `Option ${index + 1}`,
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
        input.setAttribute('aria-label', `Option ${ctx.index + 1}`);
        input.addEventListener('input', () => ctx.update({ ...ctx.current, text: input.value }));
        return input;
      }
    });
    type Probe = { id: string; question: string; asks: string };
    let probes: Probe[] = c.probes.map((row) => ({ ...row }));
    const probeList = createHubList<Probe>({
      items: probes,
      noun: 'probe',
      label: 'Probe questions',
      getKey: (row) => row.id,
      describe: (row, index) => row.question.trim() || `Probe ${index + 1}`,
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
          field('Question (the button)', row.question, (value) => ctx.update({ ...ctx.current, question: value })),
          field('What it asks (revealed)', row.asks, (value) => ctx.update({ ...ctx.current, asks: value }))
        );
        return frag;
      }
    });
    return [
      section(
        'Value',
        itemButton('value', c.item, (id) => {
          const fresh = valueContent(id, prefix);
          api.content = { ...fresh, teacher_jots: c.teacher_jots };
          api.emit();
          api.rebuild();
        }, 'Choose a value')
      ),
      cardFields(api, c.item, api.rebuild),
      section(
        'Practice',
        field('Claim, question or paragraph', c.claim, (value) => {
          c.claim = value;
          api.emit();
        }, { multiline: true, rows: 3 }),
        optionList.el,
        probeList.el,
        field('Instruction', c.instruction, (value) => {
          c.instruction = value;
          api.emit();
        }, { multiline: true, rows: 2 }),
        field('Model button says “Show …”', c.model.label, (value) => {
          c.model = { ...c.model, label: value };
          api.emit();
        }),
        field('Model (revealed)', c.model.body, (value) => {
          c.model = { ...c.model, body: value };
          api.emit();
        }, { multiline: true, rows: 3 }),
        field('In discussion, ask', c.discussion, (value) => {
          c.discussion = value;
          api.emit();
        }),
        resetButton('Reset practice to library version', () => {
          const fresh = valueContent(c.item, prefix);
          api.content = { ...fresh, label: c.label, definition: c.definition, teacher_note: c.teacher_note, teacher_jots: c.teacher_jots };
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

    /** Skill, tools or value changed: sync steps, checks, why, and the note unless edited. */
    const recompose = () => {
      c.steps = syncMoveSteps(c.tools, c.steps, prefix);
      const value = libraryValue(c.value);
      c.check = value ? value.probes.map((probe) => probe.question) : c.check;
      c.why = moveWhy(c.skill, c.tools);
      if (!c.teacher_note || !c.teacher_note.edited) {
        c.teacher_note = moveNote(c.skill, c.tools, c.value);
        c.note_basis = moveBasis(c.skill, c.tools, c.value);
      }
      api.emit();
      api.rebuild();
    };

    const presets = el('button', 'btn btn--ghost tk-ed__presets', 'Load a handbook pairing');
    presets.type = 'button';
    presets.setAttribute('aria-haspopup', 'menu');
    presets.addEventListener('click', () => {
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
        { label: 'Handbook pairings' }
      );
    });

    const stale =
      c.teacher_note?.edited && c.note_basis && c.note_basis !== moveBasis(c.skill, c.tools, c.value);
    const staleNotice = stale
      ? (() => {
          const box = el('div', 'tk-ed__notice');
          box.setAttribute('role', 'status');
          box.append(
            el('p', undefined, 'You changed the move after editing its teacher note. Your note is kept as you wrote it.'),
            resetButton('Rebuild note from library', () => {
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
    let steps: Step[] = c.steps.map((step) => ({ ...step }));
    const stepEditors = el('div', 'tk-ed__move-steps');
    steps.forEach((step, index) => {
      const box = el('div', 'tk-ed__move-step');
      box.append(
        el('p', 'tk-ed__label', `Step ${index + 1}: ${itemLabel(step.tool)}`),
        field('Prompt', step.prompt, (value) => {
          steps[index] = { ...steps[index]!, prompt: value };
          c.steps = steps.map((row) => ({ ...row }));
          api.emit();
        }, { multiline: true, rows: 2 }),
        field('Sentence frame', step.frame, (value) => {
          steps[index] = { ...steps[index]!, frame: value };
          c.steps = steps.map((row) => ({ ...row }));
          api.emit();
        }),
        field('Example (revealed)', step.example, (value) => {
          steps[index] = { ...steps[index]!, example: value };
          c.steps = steps.map((row) => ({ ...row }));
          api.emit();
        }, { multiline: true, rows: 2 })
      );
      stepEditors.append(box);
    });

    const communityButton = el('button', 'btn btn--ghost tk-ed__item', c.community || 'Add a community skill');
    communityButton.type = 'button';
    communityButton.addEventListener('click', () => {
      openHubInsertPicker(communityButton, {
        placeholder: 'Find a community skill',
        groups: [
          {
            label: 'Community skills',
            options: [{ value: '', label: 'None' }, ...COMMUNITY_SKILLS.map((skill) => ({ value: skill, label: skill }))]
          }
        ],
        onPick: (value) => {
          c.community = value;
          api.emit();
          api.rebuild();
        }
      });
    });

    return [
      section(
        'The move',
        el('p', 'tk-ed__sentence', moveSentence(c.skill, c.tools, c.value)),
        presets,
        el('span', 'tk-ed__label', 'Skill'),
        itemButton('skill', c.skill, (id) => {
          c.skill = id;
          recompose();
        }, 'Choose the skill'),
        itemList({ label: 'Tools, in order (1 to 5)', kind: 'tool', ids: c.tools, min: 1, max: 5, onChange: (ids) => {
          if (ids.length === 0) return;
          c.tools = ids;
          recompose();
        } }),
        el('span', 'tk-ed__label', 'Judged for'),
        itemButton('value', c.value, (id) => {
          c.value = id;
          recompose();
        }, 'Choose the value'),
        el('span', 'tk-ed__label', 'Together (optional)'),
        communityButton,
        field('Claim, question or stimulus', c.stimulus, (value) => {
          c.stimulus = value;
          api.emit();
        }, { multiline: true, rows: 2 })
      ),
      section('Steps', stepEditors, stringList({ label: 'Value check questions', noun: 'question', items: c.check, max: 8, onChange: (items) => {
        c.check = items;
        api.emit();
      } })),
      section(
        'Why this pairing',
        field('Shown in your teacher note', c.why, (value) => {
          c.why = value;
          api.emit();
        }, { multiline: true, rows: 2 })
      ),
      ...(staleNotice ? [staleNotice] : []),
      ...noteNodes(api, getLatest)
    ];
  });
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
          pills('Where it goes', QUADRANT_OPTIONS, row.quadrant, (value) => ctx.update({ ...ctx.current, quadrant: value }))
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
          field('Open version (revealed)', row.open, (value) => ctx.update({ ...ctx.current, open: value }))
        );
        return frag;
      }
    });
    return [
      section(
        'Stimulus',
        field('Stimulus', c.stimulus, (value) => {
          c.stimulus = value;
          api.emit();
        }, { multiline: true, rows: 3 })
      ),
      section(
        'Procedure',
        pills(
          'Procedure',
          [
            { value: 'sort' as const, label: 'Procedure 1: sort given questions' },
            { value: 'create' as const, label: 'Procedure 2: groups write and vote' }
          ],
          c.procedure,
          (value) => {
            c.procedure = value;
            if (!c.teacher_note || !c.teacher_note.edited) c.teacher_note = quadrantNote(value);
            api.emit();
            api.rebuild();
          }
        ),
        el('p', 'tk-ed__hint', 'The procedure sets which steps load into your teacher note.')
      ),
      section('Questions', questionList.el),
      section('Closed to open', pairList.el),
      ...noteNodes(api, getLatest)
    ];
  });
}

// ─── Features of a Concept ──────────────────────────────────────────────────

const GAME_OPTIONS: Array<{ value: ConceptGameKind; label: string }> = [
  { value: 'kind_sort', label: 'Differences of kind (sort)' },
  { value: 'degree_line', label: 'Differences of degree (line)' },
  { value: 'word_sort', label: 'Word sort' }
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
      label: 'Concept grid',
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
        frag.append(field('Card', row.text, (value) => ctx.update({ ...ctx.current, text: value }), { multiline: true, rows: 2 }));
        if (c.game.kind !== 'word_sort') {
          frag.append(field('Question to ask (revealed, optional)', row.prompt, (value) => ctx.update({ ...ctx.current, prompt: value })));
        }
        return frag;
      }
    });
    const scienceSet =
      c.game.kind === 'degree_line'
        ? resetButton('Use the science set (Cam 2012)', () => {
            c.game = {
              ...c.game,
              left: 'Less acceptable',
              right: 'More acceptable',
              cards: STEM_CELL_DEGREE_CARDS.map((text) => ({ id: tkId(`${prefix}_k`), text, prompt: '' }))
            };
            api.emit();
            api.rebuild();
          })
        : null;
    return [
      section('Concepts', conceptList.el),
      section(
        'Analogy warm-up',
        field('Frame', c.analogy.stem, (value) => {
          c.analogy = { ...c.analogy, stem: value };
          api.emit();
        }),
        field('Example (revealed)', c.analogy.example, (value) => {
          c.analogy = { ...c.analogy, example: value };
          api.emit();
        }, { multiline: true, rows: 2 })
      ),
      section(
        'Concept game',
        pills('Concept game', GAME_OPTIONS, c.game.kind, (value) => {
          c.game = conceptGame(value, prefix);
          if (!c.teacher_note || !c.teacher_note.edited) c.teacher_note = conceptNote(value);
          api.emit();
          api.rebuild();
        }),
        field(c.game.kind === 'degree_line' ? 'Left end' : 'Left column', c.game.left, (value) => {
          c.game = { ...c.game, left: value };
          api.emit();
        }),
        c.game.kind === 'degree_line'
          ? null
          : field('Middle column', c.game.middle, (value) => {
              c.game = { ...c.game, middle: value };
              api.emit();
            }),
        field(c.game.kind === 'degree_line' ? 'Right end' : 'Right column', c.game.right, (value) => {
          c.game = { ...c.game, right: value };
          api.emit();
        }),
        scienceSet,
        cardList.el
      ),
      section(
        'Criteria we found',
        stringList({ label: 'Criteria (revealed)', noun: 'criterion', items: c.criteria, max: 8, multiline: true, onChange: (items) => {
          c.criteria = items;
          api.emit();
        } }),
        el('p', 'tk-ed__hint', "After the lesson, replace these with your class's own criteria.")
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
      label: 'Together: community skills (1 or 2)',
      variant: 'compact',
      getKey: (row) => row.key,
      describe: (row) => row.value,
      max: 2,
      maxReason: 'Teach one or two community skills per lesson (handbook p13).',
      pick: (anchor, done) =>
        openHubInsertPicker(anchor, {
          placeholder: 'Find a community skill',
          groups: [{ label: 'Community skills', options: COMMUNITY_SKILLS.map((skill) => ({ value: skill, label: skill })) }],
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
    communityWrap.append(el('span', 'tk-ed__label', 'Together: community skills (1 or 2)'), communityList.el);
    return [
      section(
        'Learning intention',
        field('Content intention', c.content, (value) => {
          c.content = value;
          api.emit();
        }, { multiline: true, rows: 2 })
      ),
      section(
        'Thinking intention',
        itemList({ label: 'Skills (1 or 2)', kind: 'skill', ids: c.skills, max: 2, onChange: (ids) => {
          c.skills = ids;
          api.emit();
        } }),
        itemList({ label: 'Tools', kind: 'tool', ids: c.tools, max: 6, onChange: (ids) => {
          c.tools = ids;
          api.emit();
        } }),
        itemList({ label: 'Judged for (values)', kind: 'value', ids: c.values, max: 4, onChange: (ids) => {
          c.values = ids;
          api.emit();
        } })
      ),
      section('Collaborative intention', communityWrap),
      section(
        'Success criteria',
        stringList({ label: 'Success criteria', noun: 'criterion', items: c.success, max: 6, onChange: (items) => {
          c.success = items;
          api.emit();
        } })
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
        'Reflection',
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
        field('Concept (optional)', c.concept, (value) => {
          c.concept = value;
          api.emit();
        }, { placeholder: 'e.g. responsibility' }),
        el(
          'p',
          'tk-ed__hint',
          "Tool, value and community chips fill in from this page's toolkit blocks and Thinking intentions."
        )
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
