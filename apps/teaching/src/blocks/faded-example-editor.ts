import { editorShell, type BlockChangeHandler } from '@/blocks/editors';
import type { FadedExampleBlock } from '@/blocks/faded-example';
import { fadedContent, fadedWarnings, suggestedBlanks, type FadedContent, type FadedStep } from '@/schemas/faded';

const MAX_PARTS = 4;
const MAX_STEPS = 6;
const MAX_CHOICES = 4;
const MAX_CRITERIA = 4;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function labelled(label: string, control: HTMLElement, className = 'block-editor__label'): HTMLLabelElement {
  const wrap = el('label', className);
  wrap.append(document.createTextNode(label), control);
  return wrap;
}

function area(label: string, value: string, rows: number, on: (v: string) => void): HTMLLabelElement {
  const input = el('textarea');
  input.rows = rows;
  input.value = value;
  input.addEventListener('input', () => on(input.value));
  return labelled(label, input);
}

function button(text: string, onClick: () => void, ariaLabel?: string): HTMLButtonElement {
  const b = el('button', 'btn btn--ghost block-editor__faded-button', text);
  b.type = 'button';
  if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', onClick);
  return b;
}

const emptyQuestion = () => ({ prompt: '', choices: ['', ''], correct: 0 });

/** Worked steps carry a question; steps students write on carry none. */
function settleQuestion(step: FadedStep): void {
  if (step.blanks.length > 0) delete step.question;
  else if (!step.question) step.question = emptyQuestion();
}

/** Lines of a criteria box: blanks ignored, at most four. */
export function criteriaLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, MAX_CRITERIA);
}

export function createFadedExampleEditor(
  block: FadedExampleBlock,
  onChange: BlockChangeHandler<FadedExampleBlock>,
  getLatest: () => FadedExampleBlock = () => block
): HTMLElement {
  const fields = el('div', 'block-editor__fields block-editor__faded');
  const read = (): FadedContent => clone(fadedContent(getLatest()));
  /** Which step panels are open; kept across rebuilds. */
  const open: boolean[] = [];

  const partsHost = el('div', 'block-editor__faded-parts');
  const warnings = el('ul', 'block-editor__faded-warnings');
  warnings.setAttribute('aria-live', 'polite');
  const stepsHost = el('div', 'block-editor__faded-steps');
  const criteriaHost = el('div', 'block-editor__faded-criteria');

  const setWarnings = (c: FadedContent) => {
    warnings.replaceChildren(...fadedWarnings(c).map((w) => el('li', undefined, w)));
  };
  const emit = (next: FadedContent) => {
    const latest = getLatest();
    onChange({ ...latest, content: next } as FadedExampleBlock);
    setWarnings(next);
  };
  const rebuild = (c: FadedContent, withParts = true) => {
    if (withParts) buildParts(c);
    buildSteps(c);
    buildCriteria(c);
    setWarnings(c);
  };
  const change = (mutate: (c: FadedContent) => void, withParts = true) => {
    const c = read();
    mutate(c);
    emit(c);
    rebuild(c, withParts);
  };

  const question = area('Question', fadedContent(block).prompt, 2, (prompt) => {
    const c = read();
    c.prompt = prompt;
    emit(c);
  });

  // Parts
  function buildParts(c: FadedContent) {
    const rows = c.part_labels.map((label, i) => {
      const row = el('div', 'block-editor__faded-part');
      const input = el('input');
      input.type = 'text';
      input.maxLength = 40;
      input.value = label;
      const error = el('p', 'block-editor__faded-error', '');
      error.hidden = true;
      error.id = `${block.id}-part-${i}-error`;
      input.addEventListener('input', () => {
        const now = read();
        const name = input.value.trim();
        const clash = !name || now.part_labels.some((l, j) => j !== i && l === name);
        if (clash) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
        error.hidden = !clash;
        error.textContent = clash ? (name ? 'Each part needs its own name.' : 'Name this part.') : '';
        if (clash) input.setAttribute('aria-describedby', error.id);
        else input.removeAttribute('aria-describedby');
        if (clash) return;
        const old = now.part_labels[i]!;
        if (old === name) return;
        now.part_labels[i] = name;
        if (old in now.criteria) {
          now.criteria[name] = now.criteria[old]!;
          delete now.criteria[old];
        }
        emit(now);
        rebuild(now, false);
      });
      row.append(labelled(`Part ${i + 1} name`, input));
      if (c.part_labels.length > 1) {
        row.append(
          button('Remove', () => change((n) => removePart(n, i)), `Remove part ${i + 1}`)
        );
      }
      row.append(error);
      return row;
    });
    const add = button('Add part', () => change(addPart));
    add.hidden = c.part_labels.length >= MAX_PARTS;
    partsHost.replaceChildren(el('h4', 'block-editor__faded-heading', 'Parts'), ...rows, add);
  }

  function addPart(c: FadedContent) {
    if (c.part_labels.length >= MAX_PARTS) return;
    let n = c.part_labels.length + 1;
    while (c.part_labels.includes(`Part ${n}`)) n += 1;
    c.part_labels.push(`Part ${n}`);
    c.steps.forEach((s) => s.answers.push(''));
  }

  function removePart(c: FadedContent, index: number) {
    if (c.part_labels.length <= 1) return;
    const [label] = c.part_labels.splice(index, 1);
    delete c.criteria[label!];
    c.steps.forEach((s) => {
      s.answers.splice(index, 1);
      s.blanks = s.blanks.filter((b) => b !== index).map((b) => (b > index ? b - 1 : b));
      settleQuestion(s);
    });
  }

  // Steps
  function buildSteps(c: FadedContent) {
    const panels = c.steps.map((step, i) => buildStep(c, step, i));
    const add = button('Add step', () => change(addStep));
    add.hidden = c.steps.length >= MAX_STEPS;
    stepsHost.replaceChildren(el('h4', 'block-editor__faded-heading', 'Steps'), ...panels, add);
  }

  function newStepId(c: FadedContent): string {
    const taken = new Set(c.steps.map((s) => s.id));
    for (;;) {
      const id = `${block.id}_s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      if (!taken.has(id)) return id;
    }
  }

  function addStep(c: FadedContent) {
    if (c.steps.length >= MAX_STEPS) return;
    if (c.steps[0] && !c.steps[0].id) c.steps[0].id = block.id;
    const blanks = suggestedBlanks(c.steps.length, c.part_labels.length);
    const step: FadedStep = { id: newStepId(c), extract: '', answers: c.part_labels.map(() => ''), blanks };
    settleQuestion(step);
    c.steps.push(step);
    open.push(true);
  }

  function buildStep(c: FadedContent, step: FadedStep, i: number): HTMLElement {
    const details = el('details', 'block-editor__faded-step');
    details.open = open[i] ?? i === 0;
    details.addEventListener('toggle', () => {
      open[i] = details.open;
    });
    const summary = el('summary', 'block-editor__faded-summary');
    summary.append(el('span', 'block-editor__faded-step-name', `Step ${i + 1}`));
    c.part_labels.forEach((label, p) => {
      const writes = step.blanks.includes(p);
      summary.append(el('span', `block-editor__faded-pill${writes ? ' block-editor__faded-pill--writes' : ''}`, `${label}: ${writes ? 'student writes' : 'shown'}`));
    });
    details.append(summary);

    const body = el('div', 'block-editor__faded-step-body');
    body.append(
      area('Extract', step.extract, 3, (extract) => {
        const n = read();
        if (n.steps[i]) n.steps[i]!.extract = extract;
        emit(n);
      })
    );
    c.part_labels.forEach((label, p) => {
      const writes = step.blanks.includes(p);
      const row = el('div', 'block-editor__faded-answer');
      row.append(
        area(`${label}: ${writes ? 'model, hidden until after checking' : 'shown to students'}`, step.answers[p] ?? '', 2, (answer) => {
          const n = read();
          if (n.steps[i]) n.steps[i]!.answers[p] = answer;
          emit(n);
        })
      );
      const box = el('input');
      box.type = 'checkbox';
      box.checked = writes;
      box.addEventListener('change', () => {
        change((n) => {
          const s = n.steps[i];
          if (!s) return;
          const rest = s.blanks.filter((b) => b !== p);
          s.blanks = box.checked ? [...rest, p].sort((a, b) => a - b) : rest;
          settleQuestion(s);
        }, false);
      });
      const check = el('label', 'block-editor__check block-editor__faded-check');
      check.append(box, document.createTextNode(` Students write this: ${label}`));
      row.append(check);
      body.append(row);
    });
    if (step.blanks.length === 0) body.append(buildQuestion(step, i));
    if (c.steps.length > 1) {
      body.append(
        button('Remove step', () => {
          open.splice(i, 1);
          change((n) => {
            n.steps.splice(i, 1);
          }, false);
        }, `Remove step ${i + 1}`)
      );
    }
    details.append(body);
    return details;
  }

  function buildQuestion(step: FadedStep, i: number): HTMLElement {
    const q = step.question ?? emptyQuestion();
    const group = el('fieldset', 'block-editor__faded-question');
    group.append(el('legend', undefined, 'Question about this step'));
    const edit = (mutate: (qq: NonNullable<FadedStep['question']>) => void, rebuildAfter: boolean) => {
      const n = read();
      const s = n.steps[i];
      if (!s) return;
      s.question ??= emptyQuestion();
      mutate(s.question);
      emit(n);
      if (rebuildAfter) rebuild(n, false);
    };
    const prompt = el('input');
    prompt.type = 'text';
    prompt.maxLength = 300;
    prompt.value = q.prompt;
    prompt.addEventListener('input', () => edit((qq) => (qq.prompt = prompt.value), false));
    group.append(labelled('Question', prompt));
    q.choices.forEach((choice, c) => {
      const row = el('div', 'block-editor__faded-choice');
      const text = el('input');
      text.type = 'text';
      text.maxLength = 200;
      text.value = choice;
      text.addEventListener('input', () => edit((qq) => (qq.choices[c] = text.value), false));
      const radio = el('input');
      radio.type = 'radio';
      radio.name = `${block.id}-s${i}-correct`;
      radio.checked = q.correct === c;
      radio.addEventListener('change', () => {
        if (radio.checked) edit((qq) => (qq.correct = c), false);
      });
      const right = el('label', 'block-editor__check block-editor__faded-check');
      right.append(radio, document.createTextNode(' Correct'));
      row.append(labelled(`Choice ${c + 1}`, text), right);
      if (q.choices.length > 2) {
        row.append(
          button('Remove', () =>
            edit((qq) => {
              qq.choices.splice(c, 1);
              if (c < qq.correct) qq.correct -= 1;
              else if (c === qq.correct) qq.correct = 0;
            }, true), `Remove choice ${c + 1}`)
        );
      }
      group.append(row);
    });
    if (q.choices.length < MAX_CHOICES) {
      group.append(button('Add choice', () => edit((qq) => qq.choices.push(''), true)));
    }
    return group;
  }

  // Criteria
  function buildCriteria(c: FadedContent) {
    const boxes = c.part_labels.map((label) =>
      area(`${label}: what a strong answer does (one per line, up to ${MAX_CRITERIA})`, (c.criteria[label] ?? []).join('\n'), 3, (text) => {
        const n = read();
        const key = n.part_labels.find((l) => l === label) ?? label;
        const lines = criteriaLines(text);
        if (lines.length) n.criteria[key] = lines;
        else delete n.criteria[key];
        emit(n);
      })
    );
    criteriaHost.replaceChildren(el('h4', 'block-editor__faded-heading', 'Criteria'), ...boxes);
  }

  const initial = read();
  rebuild(initial);
  fields.append(question, partsHost, warnings, stepsHost, criteriaHost);
  return editorShell(block, onChange, fields, getLatest);
}
