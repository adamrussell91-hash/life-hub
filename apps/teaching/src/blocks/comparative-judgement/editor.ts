import { apiGet } from '@/api/client';
import { button, el, field } from '@/blocks/peer-feedback-ui';
import { visitBlocks } from '@/blocks/walk-blocks';
import type { Block } from '@/schemas/block';
import { getLesson } from '@/teacher/lessons-library/api';
import type { CjBlock, CjContent } from './shared';

/**
 * Comparative judgement settings: which written question the pool comes from,
 * the criterion and chips, practice pairs, anchors and the run's numbers.
 * Practice picks and reasons, anchors and weights stay with the teacher.
 */
export type CjEditorContext = {
  lessonId?: string;
  getLessonBlocks?: () => Block[];
  unitLessons?: Array<{ id: string; title: string }>;
  /** Test and preview seam: another lesson's blocks, and the unit's lessons. */
  loadLessonBlocks?: (lessonId: string) => Promise<Block[]>;
  loadUnitLessons?: (lessonId: string) => Promise<Array<{ id: string; title: string }>>;
};

const MAX_CHIPS = 8;
const MAX_CALIBRATION = 3;
const MAX_ANCHORS = 6;

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

type QuestionChoice = { value: string; label: string };

/** Short-answer questions inside written questions blocks, labelled for a select. */
export function shortAnswerChoices(blocks: Block[]): QuestionChoice[] {
  const out: QuestionChoice[] = [];
  let setN = 0;
  visitBlocks(blocks, (block) => {
    if (block.block_type !== 'question_set') return;
    setN += 1;
    const setLabel = block.content.title?.trim() || `Written questions ${setN}`;
    block.content.questions.forEach((q, i) => {
      if (q.kind !== 'short_answer') return;
      const prompt = q.prompt.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      out.push({ value: `${block.id}::${q.id}`, label: `${setLabel} · Q${i + 1}${prompt ? `: ${prompt.length > 70 ? `${prompt.slice(0, 69)}…` : prompt}` : ''}` });
    });
  });
  return out;
}

async function defaultUnitLessons(lessonId: string): Promise<Array<{ id: string; title: string }>> {
  const lesson = await getLesson(lessonId);
  const unit = await apiGet<{ lesson_ids?: string[] }>(`/api/units/${encodeURIComponent(lesson.unit_id)}`);
  const ids = (unit.lesson_ids ?? []).filter((id) => id !== lessonId).slice(0, 60);
  const lessons = await Promise.all(ids.map((id) => getLesson(id).then((l) => ({ id, title: (l as { title?: string }).title ?? '' }), () => null)));
  return lessons.filter((l): l is { id: string; title: string } => !!l);
}

export function createComparativeJudgementEditor(block: CjBlock, onChange: (b: CjBlock) => void, context: CjEditorContext = {}): HTMLElement {
  const root = el('div', 'peer-feedback peer-feedback--editor cj-editor');
  let current = block;
  const set = (patch: Partial<CjContent>) => {
    current = { ...current, content: { ...current.content, ...patch } };
    onChange(current);
  };
  const newId = (prefix: string) => `${current.id}_${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 60);

  /* ── Source ─────────────────────────────────────────────────────── */
  const source = el('fieldset', 'cj-editor__group');
  source.append(el('legend', 'pf-field__label', 'Answers to judge'), el('p', 'pf-field__hint block-secondary', 'Pick a short-answer question. The class’s answers to it become the pool when you press Start judging.'));
  const lessonId = nextId('cj-lesson');
  const lessonLabel = el('label', 'cj-editor__label block-secondary', 'Lesson');
  lessonLabel.htmlFor = lessonId;
  const lessonSelect = el('select', 'bs-select');
  lessonSelect.id = lessonId;
  const questionId = nextId('cj-question');
  const questionLabel = el('label', 'cj-editor__label block-secondary', 'Question');
  questionLabel.htmlFor = questionId;
  const questionSelect = el('select', 'bs-select');
  questionSelect.id = questionId;
  const sourceNote = el('p', 'pf-field__hint block-secondary');
  const lessonRow = el('div', 'cj-editor__row');
  lessonRow.append(lessonLabel, lessonSelect);
  const questionRow = el('div', 'cj-editor__row');
  questionRow.append(questionLabel, questionSelect);
  source.append(lessonRow, questionRow, sourceNote);

  const blocksCache = new Map<string, Block[]>();
  const loadBlocks = async (id: string): Promise<Block[]> => {
    if (!id || id === context.lessonId) return context.getLessonBlocks?.() ?? [];
    const hit = blocksCache.get(id);
    if (hit) return hit;
    const blocks = await (context.loadLessonBlocks ?? ((x: string) => getLesson(x).then((l) => l.blocks as Block[])))(id);
    blocksCache.set(id, blocks);
    return blocks;
  };

  function paintLessons(lessons: Array<{ id: string; title: string }>): void {
    const chosen = current.content.source.lesson_id;
    lessonSelect.replaceChildren();
    const here = el('option', undefined, 'This lesson');
    here.value = '';
    lessonSelect.append(here);
    const list = [...lessons];
    if (chosen && chosen !== context.lessonId && !list.some((l) => l.id === chosen)) list.push({ id: chosen, title: 'Another lesson' });
    for (const l of list) {
      if (l.id === context.lessonId) continue;
      const o = el('option', undefined, l.title || 'Untitled lesson');
      o.value = l.id;
      lessonSelect.append(o);
    }
    lessonSelect.value = chosen === context.lessonId ? '' : chosen;
  }

  async function paintQuestions(): Promise<void> {
    const src = current.content.source;
    questionSelect.replaceChildren(Object.assign(el('option', undefined, 'Loading…'), { value: '' }));
    let choices: QuestionChoice[] = [];
    try {
      choices = shortAnswerChoices(await loadBlocks(src.lesson_id));
    } catch {
      sourceNote.textContent = 'Couldn’t load that lesson. Try again in a moment.';
    }
    questionSelect.replaceChildren();
    const none = el('option', undefined, choices.length ? 'Choose a question' : 'No short-answer questions');
    none.value = '';
    questionSelect.append(none);
    for (const c of choices) {
      const o = el('option', undefined, c.label);
      o.value = c.value;
      questionSelect.append(o);
    }
    const value = src.block_id && src.question_id ? `${src.block_id}::${src.question_id}` : '';
    questionSelect.value = choices.some((c) => c.value === value) ? value : '';
    if (!choices.length) sourceNote.textContent = src.lesson_id ? 'That lesson has no short-answer questions yet.' : 'Add a written questions block with a short-answer question to this lesson, then pick it here.';
    else if (value && !questionSelect.value) sourceNote.textContent = 'The question picked before has gone. Choose another.';
    else sourceNote.textContent = '';
  }

  lessonSelect.addEventListener('change', () => {
    set({ source: { lesson_id: lessonSelect.value, block_id: '', question_id: '' } });
    void paintQuestions();
  });
  questionSelect.addEventListener('change', () => {
    const [blockId = '', qId = ''] = questionSelect.value.split('::');
    set({ source: { lesson_id: current.content.source.lesson_id, block_id: blockId, question_id: qId } });
    sourceNote.textContent = '';
  });
  paintLessons(context.unitLessons ?? []);
  void paintQuestions();
  if (!context.unitLessons?.length && context.lessonId) {
    const lessonFor = context.lessonId;
    void (context.loadUnitLessons ?? defaultUnitLessons)(lessonFor).then(
      (lessons) => paintLessons(lessons),
      () => undefined
    );
  }

  /* ── Criterion and chips ───────────────────────────────────────── */
  const criterion = field('What students judge', 'One holistic question. Students pick the answer that does this better.');
  criterion.input.rows = 2;
  criterion.input.maxLength = 300;
  criterion.input.value = current.content.criterion;
  criterion.input.addEventListener('input', () => set({ criterion: criterion.input.value }));

  const chipsBox = el('fieldset', 'cj-editor__group');
  function paintChips(): void {
    chipsBox.replaceChildren(
      el('legend', 'pf-field__label', 'Chips'),
      el('p', 'pf-field__hint block-secondary', `Features students can tick under each answer. Up to ${MAX_CHIPS}. You see which ones winners share.`)
    );
    const list = el('div', 'cj-editor__chips');
    current.content.chips.forEach((chip, i) => {
      const row = el('div', 'cj-editor__chip');
      const input = el('input', 'cj-input');
      input.type = 'text';
      input.maxLength = 40;
      input.value = chip;
      input.setAttribute('aria-label', `Chip ${i + 1}`);
      input.addEventListener('input', () => set({ chips: current.content.chips.map((c, j) => (j === i ? input.value : c)) }));
      const remove = button('Remove', 'ghost', () => {
        set({ chips: current.content.chips.filter((_, j) => j !== i) });
        paintChips();
      });
      remove.setAttribute('aria-label', `Remove chip ${i + 1}`);
      row.append(input, remove);
      list.append(row);
    });
    chipsBox.append(list);
    if (current.content.chips.length < MAX_CHIPS) {
      chipsBox.append(
        button('Add a chip', 'secondary', () => {
          set({ chips: [...current.content.chips, ''] });
          paintChips();
          chipsBox.querySelector<HTMLInputElement>('.cj-editor__chip:last-child input')?.focus();
        })
      );
    }
  }
  paintChips();

  /* ── Practice pairs ─────────────────────────────────────────────── */
  const calBox = el('fieldset', 'cj-editor__group');
  function paintCalibration(): void {
    calBox.replaceChildren(
      el('legend', 'pf-field__label', 'Practice pairs'),
      el('p', 'pf-field__hint block-secondary', `Up to ${MAX_CALIBRATION} pairs you write. Students pick one, then see your pick and reason before they judge the class’s answers.`)
    );
    current.content.calibration.forEach((pair, i) => {
      const card = el('div', 'cj-editor__pair');
      const update = (patch: Partial<typeof pair>) => set({ calibration: current.content.calibration.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
      card.append(el('p', 'cj-editor__pairtitle block-subtitle', `Pair ${i + 1}`));
      const texts = el('div', 'cj-pair');
      for (const side of ['left', 'right'] as const) {
        const f = field(`Answer ${side === 'left' ? 'A' : 'B'}`);
        f.input.rows = 4;
        f.input.maxLength = 4000;
        f.input.value = pair[side];
        f.input.addEventListener('input', () => update({ [side]: f.input.value }));
        texts.append(f.wrap);
      }
      card.append(texts);
      const better = el('div', 'cj-editor__better');
      better.setAttribute('role', 'radiogroup');
      better.setAttribute('aria-label', `Pair ${i + 1}: the stronger answer`);
      const name = nextId('cj-better');
      better.append(el('span', 'block-secondary', 'Stronger:'));
      for (const side of ['left', 'right'] as const) {
        const lab = el('label', 'cj-editor__radio');
        const radio = el('input');
        radio.type = 'radio';
        radio.name = name;
        radio.checked = pair.better === side;
        radio.addEventListener('change', () => update({ better: side }));
        lab.append(radio, el('span', '', `Answer ${side === 'left' ? 'A' : 'B'}`));
        better.append(lab);
      }
      card.append(better);
      const reasonId = nextId('cj-reason');
      const reasonWrap = el('div', 'pf-field');
      const reasonLabel = el('label', 'pf-field__label', 'Why (one line, shown to students after they choose)');
      reasonLabel.htmlFor = reasonId;
      const reason = el('input', 'cj-input');
      reason.id = reasonId;
      reason.type = 'text';
      reason.maxLength = 300;
      reason.value = pair.reason;
      reason.placeholder = 'it explains how the image builds tension';
      reason.addEventListener('input', () => update({ reason: reason.value }));
      reasonWrap.append(reasonLabel, reason);
      card.append(reasonWrap);
      card.append(
        button('Remove this pair', 'ghost', () => {
          set({ calibration: current.content.calibration.filter((_, j) => j !== i) });
          paintCalibration();
        })
      );
      calBox.append(card);
    });
    if (current.content.calibration.length < MAX_CALIBRATION) {
      calBox.append(
        button('Add a practice pair', 'secondary', () => {
          set({ calibration: [...current.content.calibration, { id: newId('cal'), left: '', right: '', better: 'left', reason: '' }] });
          paintCalibration();
        })
      );
    }
  }
  paintCalibration();

  /* ── Anchors ────────────────────────────────────────────────────── */
  const anchorBox = el('fieldset', 'cj-editor__group');
  function paintAnchors(): void {
    anchorBox.replaceChildren(
      el('legend', 'pf-field__label', 'Anchors (optional)'),
      el('p', 'pf-field__hint block-secondary', `Up to ${MAX_ANCHORS} answers you already know the standard of. They join the pool and are judged like any answer; only you see which they are. Two or more with different marks turn the order into marks.`)
    );
    current.content.anchors.forEach((anchor, i) => {
      const card = el('div', 'cj-editor__anchor');
      const update = (patch: Partial<typeof anchor>) => set({ anchors: current.content.anchors.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
      const f = field(`Anchor ${i + 1}`);
      f.input.rows = 3;
      f.input.maxLength = 4000;
      f.input.value = anchor.text;
      f.input.addEventListener('input', () => update({ text: f.input.value }));
      const markId = nextId('cj-mark');
      const markWrap = el('div', 'cj-editor__mark');
      const markLabel = el('label', 'block-secondary', 'Mark (optional)');
      markLabel.htmlFor = markId;
      const mark = el('input', 'cj-input cj-input--num');
      mark.id = markId;
      mark.type = 'number';
      mark.min = '0';
      mark.max = String(current.content.out_of);
      mark.step = '0.5';
      mark.value = anchor.mark === null ? '' : String(anchor.mark);
      mark.addEventListener('input', () => {
        const n = Number(mark.value);
        update({ mark: mark.value.trim() === '' || !Number.isFinite(n) ? null : Math.max(0, Math.min(100, n)) });
      });
      markWrap.append(markLabel, mark);
      const remove = button('Remove', 'ghost', () => {
        set({ anchors: current.content.anchors.filter((_, j) => j !== i) });
        paintAnchors();
      });
      remove.setAttribute('aria-label', `Remove anchor ${i + 1}`);
      const foot = el('div', 'cj-editor__anchorfoot');
      foot.append(markWrap, remove);
      card.append(f.wrap, foot);
      anchorBox.append(card);
    });
    if (current.content.anchors.length < MAX_ANCHORS) {
      anchorBox.append(
        button('Add an anchor', 'secondary', () => {
          set({ anchors: [...current.content.anchors, { id: newId('anc'), text: '', mark: null }] });
          paintAnchors();
        })
      );
    }
  }
  paintAnchors();

  /* ── Numbers and switches ───────────────────────────────────────── */
  const settings = el('div', 'cj-editor__settings');
  settings.append(
    numberField('Pairs each student judges', current.content.per_student, 4, 20, 1, (n) => set({ per_student: n })),
    numberField('Marks out of', current.content.out_of, 1, 100, 1, (n) => set({ out_of: n }))
  );
  const weightId = nextId('cj-weight');
  const weightWrap = el('div', 'pf-field');
  const weightLabel = el('label', 'pf-field__label', 'Your judgements count');
  weightLabel.htmlFor = weightId;
  const weight = el('select', 'bs-select');
  weight.id = weightId;
  for (const w of [1, 2, 3] as const) {
    const o = el('option', undefined, w === 1 ? 'Same as a student' : `${w}× a student`);
    o.value = String(w);
    o.selected = current.content.teacher_weight === w;
    weight.append(o);
  }
  weight.addEventListener('change', () => set({ teacher_weight: Number(weight.value) as 1 | 2 | 3 }));
  weightWrap.append(weightLabel, weight);
  settings.append(weightWrap);

  const misfits = toggle(
    'Count judges who often go against the class at half weight',
    'You see who they are under Results. The order is worked out again once with their choices at half weight.',
    current.content.downweight_misfits,
    (on) => set({ downweight_misfits: on })
  );
  const third = toggle(
    'Show students their third',
    'Lets each student see whether their own answer is in the top, middle or bottom third of the class. Shown only once the order is reliable enough for feedback. Students never see a rank or anyone’s name.',
    current.content.show_third,
    (on) => set({ show_third: on })
  );

  const runNote = el('p', 'pf-note block-secondary', 'To run it, publish the lesson, close this editor, choose the class on the block and press Start judging.');
  root.append(source, criterion.wrap, chipsBox, calBox, anchorBox, settings, misfits, third, runNote);
  return root;
}

function numberField(label: string, value: number, min: number, max: number, step: number, onInput: (n: number) => void): HTMLElement {
  const id = nextId('cj-num');
  const wrap = el('div', 'pf-field');
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const input = el('input', 'cj-input cj-input--num');
  input.id = id;
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => {
    const n = Math.round(Number(input.value));
    if (Number.isFinite(n) && n >= min && n <= max) onInput(n);
  });
  wrap.append(lab, input);
  return wrap;
}

function toggle(label: string, hint: string, value: boolean, onToggle: (on: boolean) => void): HTMLElement {
  const wrap = el('div', 'cj-editor__toggle');
  const id = nextId('cj-toggle');
  const box = el('input');
  box.type = 'checkbox';
  box.id = id;
  box.checked = value;
  box.addEventListener('change', () => onToggle(box.checked));
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const row = el('div', 'cj-editor__togglerow');
  row.append(box, lab);
  wrap.append(row, el('p', 'pf-field__hint block-secondary', hint));
  return wrap;
}
