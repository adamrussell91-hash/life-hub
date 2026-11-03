import type { Block } from '@/schemas/block';
import type { RenderMode } from '@/blocks/render';
import { loadActivityState, saveActivityState, storageKey } from '@/blocks/learning-activity';
import { emitAnswered } from '@/lecture/answered';
import { fadedContent, fadedStepKey, fadedWritingSteps, type FadedContent, type FadedStep } from '@/schemas/faded';
import { checkAttempt } from '@/blocks/faded-attempt';

export type FadedExampleBlock = Extract<Block, { block_type: 'faded_example' }>;

/** Fired when a student reaches the model on a writing step; the tutorial player sends it to the live board. */
export const FADED_EVENT = 'tutorial:faded';
export type FadedDetail = { blockId: string; stepKey: string; parts: Record<number, string>; rating: 'right' | 'wrong' };

type Stage = 'write' | 'tick' | 'model';
type StepWork = { stage: Stage; texts: Record<number, string>; ticks: string[]; picked: number | null };
type Opts = { unlocked?: boolean };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const tickId = (part: number, n: number): string => `${part}:${n}`;

/** What the student does in this step, from its blanks. */
export function fadedModeText(step: FadedStep, labels: string[]): string {
  const blanks = step.blanks.filter((i) => i < labels.length);
  if (blanks.length === 0) return 'Worked example';
  if (blanks.length === labels.length) return labels.length === 1 ? `You write the ${labels[0]!.toLowerCase()}` : `You write all ${labels.length} parts`;
  const names = blanks.map((i) => labels[i]!.toLowerCase());
  return `You write the ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}`;
}

function chip(step: FadedStep, c: FadedContent, index: number): HTMLElement {
  const mode = el('p', 'block-faded__mode');
  if (c.steps.length > 1) mode.append(el('span', 'block-faded__num', `Step ${index + 1} of ${c.steps.length} · `));
  mode.append(document.createTextNode(fadedModeText(step, c.part_labels)));
  return mode;
}

function promptLine(step: FadedStep, c: FadedContent): HTMLElement | null {
  const text = step.prompt?.trim() ? step.prompt : c.prompt;
  return text ? el('p', 'block-faded__prompt', text) : null;
}

function extractQuote(step: FadedStep): HTMLElement {
  return el('blockquote', 'block-faded__extract', step.extract);
}

/** Teacher and print: every step in order with all answers. */
function renderAll(root: HTMLElement, c: FadedContent, mode: RenderMode): void {
  c.steps.forEach((step, index) => {
    const section = el('section', 'block-faded__step');
    section.append(chip(step, c, index));
    const prompt = promptLine(step, c);
    if (prompt) section.append(prompt);
    section.append(extractQuote(step));
    const list = el('dl', 'block-faded__parts');
    c.part_labels.forEach((label, p) => {
      const term = el('dt', undefined, label);
      const value = el('dd');
      const blank = step.blanks.includes(p);
      if (blank && mode === 'print') {
        value.classList.add('block-faded__space');
      } else {
        value.textContent = step.answers[p] ?? '';
        if (blank) {
          value.classList.add('block-faded__model');
          value.prepend(el('span', 'block-faded__tag', 'Student writes'));
        }
      }
      list.append(term, value);
    });
    section.append(list);
    if (step.question?.prompt) {
      const q = el('div', 'block-faded__question');
      q.append(el('p', 'block-faded__qprompt', step.question.prompt));
      const choices = el('ul', 'block-faded__choices');
      step.question.choices.forEach((choice, i) => {
        const li = el('li', undefined, choice);
        if (mode === 'teacher' && i === step.question!.correct) li.classList.add('block-faded__model');
        choices.append(li);
      });
      q.append(choices);
      section.append(q);
    }
    if (mode === 'teacher') {
      const blanks = step.blanks.filter((p) => (c.criteria[c.part_labels[p] ?? ''] ?? []).length > 0);
      for (const p of blanks) {
        const label = c.part_labels[p]!;
        const box = el('div', 'block-faded__criteria');
        box.append(el('p', 'block-faded__criteria-head', `A strong ${label.toLowerCase()}`));
        const ul = el('ul');
        for (const text of c.criteria[label]!) ul.append(el('li', undefined, text));
        box.append(ul);
        section.append(box);
      }
    }
    root.append(section);
  });
}

function loadWork(block: FadedExampleBlock, c: FadedContent, step: FadedStep): StepWork {
  const fresh: StepWork = { stage: 'write', texts: {}, ticks: [], picked: null };
  const saved = loadActivityState<Record<string, unknown>>(storageKey('local', fadedStepKey(block, step)));
  if (!saved || typeof saved !== 'object') return fresh;
  if (saved.stage === 'write' || saved.stage === 'tick' || saved.stage === 'model') {
    return {
      stage: saved.stage,
      texts: saved.texts && typeof saved.texts === 'object' ? (saved.texts as Record<number, string>) : {},
      ticks: Array.isArray(saved.ticks) ? (saved.ticks as string[]) : [],
      picked: typeof saved.picked === 'number' ? saved.picked : null
    };
  }
  // Old shape: { parts, rating } from before steps existed.
  if (saved.parts && typeof saved.parts === 'object' && (saved.rating === 'right' || saved.rating === 'wrong')) {
    const ticks =
      saved.rating === 'right' ? step.blanks.flatMap((p) => (c.criteria[c.part_labels[p] ?? ''] ?? []).map((_, n) => tickId(p, n))) : [];
    return { stage: 'model', texts: saved.parts as Record<number, string>, ticks, picked: null };
  }
  return fresh;
}

export function renderFadedExample(block: FadedExampleBlock, mode: RenderMode, opts: Opts = {}): HTMLElement {
  const root = el('div', 'block-faded');
  root.dataset.blockId = block.id;
  const c = fadedContent(block);
  if (mode !== 'student') {
    renderAll(root, c, mode);
    return root;
  }
  root.dataset.fadedStudent = '1';
  if (c.steps.length === 0) return root;

  const works = c.steps.map((step) => loadWork(block, c, step));
  const last = c.steps.length - 1;
  const writing = fadedWritingSteps(c);
  const lastWriting = writing.length ? c.steps.indexOf(writing[writing.length - 1]!) : -1;
  const isDone = (i: number): boolean => works[i]!.stage === 'model';
  const isOpenable = (i: number): boolean => !!opts.unlocked || works.slice(0, i).every((_, j) => isDone(j));
  const save = (i: number): void => saveActivityState(storageKey('local', fadedStepKey(block, c.steps[i]!)), works[i]);
  const criteriaFor = (step: FadedStep, p: number): string[] => c.criteria[c.part_labels[p] ?? ''] ?? [];
  const allTicked = (i: number): boolean =>
    c.steps[i]!.blanks.every((p) => criteriaFor(c.steps[i]!, p).every((_, n) => works[i]!.ticks.includes(tickId(p, n))));

  let open = Math.max(0, works.findIndex((_, i) => !isDone(i)));
  if (works.every((_, i) => isDone(i))) open = last;

  const panel = el('section', 'block-faded__step');
  panel.tabIndex = -1;
  const rail = c.steps.length > 1 ? el('div', 'block-faded-rail') : null;
  const marks: Array<{ button: HTMLButtonElement; num: HTMLElement }> = [];
  if (rail) {
    rail.setAttribute('role', 'group');
    rail.setAttribute('aria-label', 'Steps');
    c.steps.forEach((step, i) => {
      const button = el('button', 'block-faded-rail__mark');
      button.type = 'button';
      const num = el('b');
      button.append(num, el('span', undefined, fadedModeText(step, c.part_labels)));
      button.addEventListener('click', () => {
        open = i;
        repaint(true);
      });
      rail.append(button);
      marks.push({ button, num });
    });
    root.append(rail);
  }
  root.append(panel);

  const syncRail = (): void => {
    marks.forEach((m, i) => {
      const done = isDone(i) && i !== open;
      m.button.disabled = !isOpenable(i);
      m.button.classList.toggle('block-faded-rail__mark--on', i === open);
      m.button.classList.toggle('block-faded-rail__mark--done', done);
      if (i === open) m.button.setAttribute('aria-current', 'step');
      else m.button.removeAttribute('aria-current');
      m.num.textContent = done ? '✓' : String(i + 1);
    });
  };

  const reveal = (i: number): void => {
    const work = works[i]!;
    const step = c.steps[i]!;
    work.stage = 'model';
    save(i);
    const rating: 'right' | 'wrong' = allTicked(i) ? 'right' : 'wrong';
    const parts: Record<number, string> = Object.fromEntries(step.blanks.map((p) => [p, (work.texts[p] ?? '').trim()]));
    root.dispatchEvent(new CustomEvent<FadedDetail>(FADED_EVENT, { bubbles: true, detail: { blockId: block.id, stepKey: fadedStepKey(block, step), parts, rating } }));
    if (i === lastWriting) emitAnswered(root, block.id, rating);
  };

  const goNext = (i: number): void => {
    if (works[i]!.stage !== 'model') {
      works[i]!.stage = 'model';
      save(i);
    }
    open = Math.min(i + 1, last);
    repaint(true);
  };

  const nextButton = (i: number): HTMLButtonElement => {
    const go = el('button', 'btn btn--secondary block-faded__next', i === last ? 'Done' : `On to step ${i + 2}`);
    go.type = 'button';
    go.addEventListener('click', () => goNext(i));
    return go;
  };

  const paintStep = (i: number): void => {
    const step = c.steps[i]!;
    const work = works[i]!;
    const writing = step.blanks.length > 0;
    panel.replaceChildren();
    panel.append(chip(step, c, i));
    const prompt = promptLine(step, c);
    if (prompt) panel.append(prompt);
    panel.append(extractQuote(step));

    const nudge = el('p', 'block-faded__nudge');
    nudge.setAttribute('aria-live', 'polite');
    const actions = el('div', 'block-faded__actions');

    const list = el('dl', 'block-faded__parts');
    c.part_labels.forEach((label, p) => {
      const term = el('dt', undefined, label);
      const value = el('dd');
      if (step.blanks.includes(p)) {
        const input = el('textarea', 'block-faded__input');
        input.rows = 2;
        input.value = work.texts[p] ?? '';
        input.readOnly = work.stage !== 'write';
        input.setAttribute('aria-label', `Your ${label.toLowerCase()}`);
        input.addEventListener('input', () => {
          work.texts[p] = input.value;
          save(i);
        });
        value.append(input);
        if (work.stage === 'model') value.append(el('p', 'block-faded__model', `Model: ${step.answers[p] ?? ''}`));
      } else {
        value.textContent = step.answers[p] ?? '';
      }
      list.append(term, value);
    });
    panel.append(list);

    if (!writing) {
      const q = step.question;
      if (q && q.prompt) {
        const box = el('div', 'block-faded__question');
        box.append(el('p', 'block-faded__qprompt', q.prompt));
        const group = el('div', 'block-faded__choices');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', q.prompt);
        const solved = work.picked === q.correct;
        q.choices.forEach((choice, n) => {
          const button = el('button', 'btn btn--secondary block-faded__choice', choice);
          button.type = 'button';
          button.disabled = solved;
          if (solved && n === q.correct) {
            button.setAttribute('aria-pressed', 'true');
            button.classList.add('block-faded__choice--right');
          }
          button.addEventListener('click', () => {
            if (n === q.correct) {
              work.picked = n;
              save(i);
              paintStep(i);
              panel.querySelector<HTMLButtonElement>('.block-faded__next')?.focus();
            } else {
              nudge.textContent = 'Look again and choose another.';
            }
          });
          group.append(button);
        });
        box.append(group);
        panel.append(box);
        if (solved) nudge.textContent = 'Yes.';
        panel.append(nudge);
        if (solved && !(i === last && isDone(i))) actions.append(nextButton(i));
      } else {
        panel.append(nudge);
        if (!(i === last && isDone(i))) actions.append(nextButton(i));
      }
    } else {
      if (work.stage === 'tick' || work.stage === 'model') {
        const locked = work.stage === 'model';
        for (const p of step.blanks) {
          const items = criteriaFor(step, p);
          if (!items.length) continue;
          const set = el('fieldset', 'block-faded__ticks');
          set.append(el('legend', 'block-faded__ticks-head', `Does your ${c.part_labels[p]!.toLowerCase()} do these?`));
          items.forEach((text, n) => {
            const label = el('label', 'block-faded__tick');
            const box = el('input');
            box.type = 'checkbox';
            box.disabled = locked;
            box.checked = work.ticks.includes(tickId(p, n));
            box.addEventListener('change', () => {
              const id = tickId(p, n);
              work.ticks = box.checked ? [...work.ticks.filter((t) => t !== id), id] : work.ticks.filter((t) => t !== id);
              save(i);
              syncButtons();
            });
            label.append(box, el('span', undefined, text));
            set.append(label);
          });
          panel.append(set);
        }
      }
      panel.append(nudge);
      if (work.stage === 'write') {
        const check = el('button', 'btn btn--primary block-faded__check', 'Check');
        check.type = 'button';
        let lastOdd = '';
        check.addEventListener('click', () => {
          const fields = [...panel.querySelectorAll<HTMLTextAreaElement>('.block-faded__input')];
          const texts = fields.map((f) => f.value);
          const verdict = checkAttempt(texts);
          const joined = texts.join('\n');
          if (verdict === 'short') {
            nudge.textContent = 'Write a full sentence in each box, then check it.';
            return;
          }
          if (verdict === 'odd' && joined !== lastOdd) {
            lastOdd = joined;
            nudge.textContent = 'Is that what you meant to write?';
            return;
          }
          step.blanks.forEach((p, n) => (work.texts[p] = texts[n] ?? ''));
          work.ticks = [];
          work.stage = 'tick';
          save(i);
          paintStep(i);
        });
        actions.append(check);
      } else if (work.stage === 'tick') {
        const improve = el('button', 'btn block-faded__improve', 'Improve mine');
        improve.type = 'button';
        improve.addEventListener('click', () => {
          work.stage = 'write';
          save(i);
          paintStep(i);
          panel.querySelector<HTMLTextAreaElement>('.block-faded__input')?.focus();
        });
        const see = el('button', 'btn block-faded__model-btn', 'See the model');
        see.type = 'button';
        see.addEventListener('click', () => {
          reveal(i);
          paintStep(i);
          syncRail();
          panel.querySelector<HTMLButtonElement>('.block-faded__next')?.focus();
        });
        actions.append(improve, see);
        syncButtons = () => {
          const ready = allTicked(i);
          improve.className = `btn ${ready ? 'btn--secondary' : 'btn--primary'} block-faded__improve`;
          see.className = `btn ${ready ? 'btn--primary' : 'btn--secondary'} block-faded__model-btn`;
        };
        syncButtons();
      } else if (i < last) {
        actions.append(nextButton(i));
      }
    }
    panel.append(actions);
    if (i === last && isDone(i) && c.steps.length > 1) panel.append(finishView());
  };
  let syncButtons = (): void => {};

  const finishView = (): HTMLElement => {
    const box = el('div', 'block-faded__finish');
    const w = lastWriting;
    if (w < 0) return box;
    const step = c.steps[w]!;
    const allBlank = c.part_labels.every((_, p) => step.blanks.includes(p));
    box.append(el('p', 'block-faded__finish-head', allBlank ? 'You wrote the whole answer yourself' : "That's the last step"));
    const list = el('dl', 'block-faded__parts');
    c.part_labels.forEach((label, p) => {
      list.append(el('dt', undefined, label), el('dd', undefined, step.blanks.includes(p) ? (works[w]!.texts[p] ?? '').trim() : (step.answers[p] ?? '')));
    });
    box.append(list);
    return box;
  };

  const repaint = (moveFocus = false): void => {
    paintStep(open);
    syncRail();
    if (moveFocus) panel.focus();
  };
  repaint();
  return root;
}
