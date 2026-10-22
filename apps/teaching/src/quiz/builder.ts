import {
  QUIZ_KIND_INFO,
  QUIZ_LIMITS,
  blankQuestion,
  checkQuestion,
  locateQuote,
  parseGapPassage,
  segmentPassage,
  writeGapPassage,
  type QuizImage,
  type QuizQuestion,
  type QuizQuestionKind,
  type QuizQuestionOf
} from '@/quiz/core';
import { loadLiteraryElements, type LiteraryTechnique } from '@/blocks/literary-elements';
import { formatOutcomeCodes, parseOutcomeCodes } from '@/markbook/parse';
import type { OutcomeLabel } from '@/markbook/types';
import { button, checkbox, el, iconButton, labelled, select, textArea, textInput, uid } from '@/quiz/dom';
import { mountWordPicker, spanText } from '@/quiz/word-picker';
import './quiz.css';

/**
 * The question builder: one form for every question kind. Students use it in
 * the Question drop block on a phone, so every kind is built from taps and
 * short boxes, never markup. The teacher uses the same form to edit a quiz
 * question or a student's submission.
 */

export type BuilderOptions = {
  question: QuizQuestion;
  /** Kinds on offer. Empty means every kind. */
  kinds?: readonly QuizQuestionKind[];
  marks?: { min: number; max: number };
  /**
   * Images the writer may use. Students only get the lesson's own images;
   * the teacher may also paste a link.
   */
  images?: QuizImage[];
  allowImageUrl?: boolean;
  /** Who is writing, for wording. */
  audience: 'student' | 'teacher';
  /** Outcome catalogue for the teacher's outcome codes field. Students never get it. */
  outcomes?: OutcomeLabel[];
  onChange: (question: QuizQuestion) => void;
};

export type QuestionBuilder = {
  root: HTMLElement;
  get(): QuizQuestion;
  /** The first thing to fix, or null when the question is ready. */
  problem(): string | null;
};

const newId = () => Math.random().toString(36).slice(2, 10);

export function mountQuestionBuilder(options: BuilderOptions): QuestionBuilder {
  let q: QuizQuestion = structuredClone(options.question);
  if (options.audience === 'student') delete q.outcomes;
  const marks = options.marks ?? { min: 1, max: QUIZ_LIMITS.marksMax };
  const kinds = (options.kinds?.length ? options.kinds : (Object.keys(QUIZ_KIND_INFO) as QuizQuestionKind[])).filter(
    (k) => k !== 'label_image' || options.allowImageUrl || (options.images?.length ?? 0) > 0
  );
  const student = options.audience === 'student';

  const root = el('div', 'qz-builder');
  const kindHost = el('div', 'qz-builder__kind');
  const promptHost = el('div', 'qz-builder__prompt');
  const bodyHost = el('div', 'qz-builder__body');
  const extrasHost = el('div', 'qz-builder__extras');
  root.append(kindHost, promptHost, bodyHost, extrasHost);

  const emit = () => options.onChange(structuredClone(q));

  /* ── Kind ── */
  const kindSelect = select(
    kinds.map((k) => ({ value: k, label: QUIZ_KIND_INFO[k].label })),
    kinds.includes(q.kind) ? q.kind : (kinds[0] as string)
  );
  const kindBlurb = el('p', 'qz-field__hint', QUIZ_KIND_INFO[q.kind].blurb);
  kindSelect.addEventListener('change', () => {
    const next = kindSelect.value as QuizQuestionKind;
    const fresh = blankQuestion(next, q.id, q.marks, newId);
    q = { ...fresh, prompt: q.prompt, hint: q.hint, explanation: q.explanation, ...(next === 'label_image' ? {} : q.image ? { image: q.image } : {}) } as QuizQuestion;
    kindBlurb.textContent = QUIZ_KIND_INFO[next].blurb;
    paintPrompt();
    paintBody();
    paintExtras();
    emit();
  });
  const kindField = labelled('Question type', kindSelect);
  kindField.append(kindBlurb);
  kindHost.append(kindField);
  if (!kinds.includes(q.kind)) {
    // The block's allowed kinds changed since this was written: start the writer on an allowed one.
    kindSelect.dispatchEvent(new Event('change'));
  }

  /* ── Prompt ── */
  function paintPrompt(): void {
    promptHost.replaceChildren();
    if (q.kind === 'fill_gap') {
      const input = textInput(q.prompt, QUIZ_LIMITS.prompt, 'Fill the gaps.');
      input.addEventListener('input', () => {
        q.prompt = input.value;
        emit();
      });
      promptHost.append(labelled('Instruction (optional)', input));
      return;
    }
    const placeholder: Partial<Record<QuizQuestionKind, string>> = {
      true_false: 'Write a statement, e.g. “Juliet is a Montague.”',
      odd_one_out: 'Which one doesn’t belong?',
      matching: 'Match each technique to its definition.',
      ordering: 'Put these plot events in order.',
      categorise: 'Sort each quote into the right group.',
      quote_technique: 'Which technique is used in this quote?',
      find_it: 'Which line shows the speaker’s anger?',
      spot_technique: 'Find two techniques the poet uses and name them.',
      label_image: 'Label the parts of the diagram.',
      explain_effect: 'Explain the effect of this technique on the reader.'
    };
    const input = textArea(q.prompt, QUIZ_LIMITS.prompt, 2, placeholder[q.kind] ?? 'Write your question.');
    input.addEventListener('input', () => {
      q.prompt = input.value;
      emit();
    });
    promptHost.append(labelled(q.kind === 'true_false' ? 'Statement' : 'Question', input));
  }

  /* ── Body, per kind ── */
  function paintBody(): void {
    bodyHost.replaceChildren(bodyFor());
  }

  function bodyFor(): HTMLElement {
    switch (q.kind) {
      case 'multiple_choice':
      case 'odd_one_out':
        return choiceEditor(q, false);
      case 'multi_select':
        return choiceEditor(q, true);
      case 'quote_technique':
        return quoteTechniqueEditor(q);
      case 'true_false':
        return trueFalseEditor(q);
      case 'short_answer':
        return shortAnswerEditor(q);
      case 'fill_gap':
        return gapEditor(q);
      case 'matching':
        return matchingEditor(q);
      case 'ordering':
        return orderingEditor(q);
      case 'categorise':
        return categoriseEditor(q);
      case 'find_it':
        return findItEditor(q);
      case 'spot_technique':
        return spotEditor(q);
      case 'label_image':
        return labelImageEditor(q);
      case 'extended_response':
        return writtenEditor(q);
      case 'explain_effect':
        return explainEditor(q);
    }
  }

  function choiceEditor(question: QuizQuestionOf<'multiple_choice' | 'odd_one_out' | 'multi_select'>, many: boolean): HTMLElement {
    const wrap = el('div', 'qz-group');
    const title = question.kind === 'odd_one_out' ? 'Items, tick the odd one out' : many ? 'Options, tick every right one' : 'Options, tick the right one';
    wrap.append(el('p', 'qz-group__title', title));
    const list = el('ul', 'qz-rows');
    const name = uid('qz-correct');
    question.options.forEach((option, i) => {
      const row = el('li', 'qz-row');
      const mark = el('input', 'qz-row__mark');
      mark.type = many ? 'checkbox' : 'radio';
      mark.name = name;
      mark.checked = question.correct.includes(option.id);
      mark.setAttribute('aria-label', `Option ${i + 1} is right`);
      mark.addEventListener('change', () => {
        if (many) question.correct = mark.checked ? [...new Set([...question.correct, option.id])] : question.correct.filter((id) => id !== option.id);
        else question.correct = [option.id];
        emit();
      });
      const text = textInput(option.text, QUIZ_LIMITS.option, `Option ${i + 1}`);
      text.setAttribute('aria-label', `Option ${i + 1}`);
      text.addEventListener('input', () => {
        option.text = text.value;
        emit();
      });
      row.append(mark, text);
      if (question.options.length > (question.kind === 'odd_one_out' ? 3 : 2)) {
        row.append(
          iconButton('×', `Remove option ${i + 1}`, () => {
            question.options.splice(i, 1);
            question.correct = question.correct.filter((id) => id !== option.id);
            paintBody();
            emit();
          })
        );
      }
      list.append(row);
    });
    wrap.append(list);
    const cap = question.kind === 'multi_select' ? 8 : 6;
    if (question.options.length < cap) {
      wrap.append(
        button('Add option', 'ghost', () => {
          question.options.push({ id: newId(), text: '' });
          paintBody();
          focusLast(bodyHost, '.qz-row .qz-input');
          emit();
        })
      );
    }
    return wrap;
  }

  function quoteTechniqueEditor(question: QuizQuestionOf<'quote_technique'>): HTMLElement {
    const wrap = el('div', 'qz-group');
    const quote = textArea(question.quote, QUIZ_LIMITS.passage, 3, 'Paste the quote.');
    quote.addEventListener('input', () => {
      question.quote = quote.value;
      emit();
    });
    wrap.append(labelled('Quote', quote));

    const listId = uid('qz-techniques');
    const datalist = el('datalist');
    datalist.id = listId;
    wrap.append(datalist);
    let techniques: LiteraryTechnique[] = [];
    void loadLiteraryElements().then((table) => {
      techniques = table.techniques;
      for (const t of techniques) {
        const option = el('option');
        option.value = t.name;
        datalist.append(option);
      }
      fill.disabled = false;
    });
    const findTechnique = (name: string) => techniques.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());

    wrap.append(el('p', 'qz-group__title', 'Techniques, tick the right one'));
    const list = el('ul', 'qz-rows');
    const group = uid('qz-correct');
    question.options.forEach((option, i) => {
      const row = el('li', 'qz-row');
      const mark = el('input', 'qz-row__mark');
      mark.type = 'radio';
      mark.name = group;
      mark.checked = question.correct.includes(option.id);
      mark.setAttribute('aria-label', `Technique ${i + 1} is right`);
      mark.addEventListener('change', () => {
        question.correct = [option.id];
        emit();
      });
      const text = textInput(option.text, QUIZ_LIMITS.option, i === 0 ? 'Start typing, e.g. Metaphor' : `Technique ${i + 1}`);
      text.setAttribute('list', listId);
      text.setAttribute('aria-label', `Technique ${i + 1}`);
      text.addEventListener('input', () => {
        option.text = text.value;
        const hit = findTechnique(text.value);
        if (hit) option.technique_id = hit.id;
        else delete option.technique_id;
        emit();
      });
      row.append(mark, text);
      if (question.options.length > 2) {
        row.append(
          iconButton('×', `Remove technique ${i + 1}`, () => {
            question.options.splice(i, 1);
            question.correct = question.correct.filter((id) => id !== option.id);
            paintBody();
            emit();
          })
        );
      }
      list.append(row);
    });
    wrap.append(list);

    const actions = el('div', 'qz-actions');
    if (question.options.length < 6) {
      actions.append(
        button('Add technique', 'ghost', () => {
          question.options.push({ id: newId(), text: '' });
          paintBody();
          emit();
        })
      );
    }
    // Wrong answers from the same family as the right one make a fair question.
    const fill = button('Fill wrong answers for me', 'ghost', () => {
      const right = question.options.find((o) => question.correct.includes(o.id));
      const anchor = right ? findTechnique(right.text) : undefined;
      if (!right || !anchor) {
        alertIn(wrap, 'Type the right technique and tick it first.');
        return;
      }
      const used = new Set(question.options.map((o) => o.text.trim().toLowerCase()));
      const near = techniques.filter((t) => t.subgroup === anchor.subgroup && !used.has(t.name.toLowerCase()));
      const far = techniques.filter((t) => t.subgroup !== anchor.subgroup && !used.has(t.name.toLowerCase()));
      const pool = [...shuffle(near), ...shuffle(far)];
      question.options = [right, ...pool.slice(0, 3).map((t) => ({ id: newId(), text: t.name, technique_id: t.id }))];
      question.correct = [right.id];
      paintBody();
      emit();
    });
    fill.disabled = techniques.length === 0;
    actions.append(fill);
    wrap.append(actions);
    return wrap;
  }

  function trueFalseEditor(question: QuizQuestionOf<'true_false'>): HTMLElement {
    const wrap = el('div', 'qz-group');
    wrap.append(el('p', 'qz-group__title', 'The statement is'));
    const row = el('div', 'qz-toggle-row');
    for (const value of [true, false]) {
      const b = button(value ? 'True' : 'False', 'secondary', () => {
        question.answer = value;
        paintBody();
        emit();
      });
      b.classList.add('qz-toggle');
      b.setAttribute('aria-pressed', String(question.answer === value));
      row.append(b);
    }
    wrap.append(row);
    return wrap;
  }

  function shortAnswerEditor(question: QuizQuestionOf<'short_answer'>): HTMLElement {
    const wrap = el('div', 'qz-group');
    wrap.append(
      el('p', 'qz-group__title', 'Answers that count as right'),
      el('p', 'qz-field__hint', 'Capitals, spaces and full stops don’t matter. Add other spellings or wordings if they’re right too.')
    );
    const list = el('ul', 'qz-rows');
    question.accepted.forEach((answer, i) => {
      const row = el('li', 'qz-row');
      const input = textInput(answer, QUIZ_LIMITS.answer, i === 0 ? 'The answer' : 'Another right answer');
      input.setAttribute('aria-label', i === 0 ? 'Answer' : `Other right answer ${i}`);
      input.addEventListener('input', () => {
        question.accepted[i] = input.value;
        emit();
      });
      row.append(input);
      if (question.accepted.length > 1) {
        row.append(
          iconButton('×', `Remove answer ${i + 1}`, () => {
            question.accepted.splice(i, 1);
            paintBody();
            emit();
          })
        );
      }
      list.append(row);
    });
    wrap.append(list);
    if (question.accepted.length < 10) {
      wrap.append(
        button('Add another right answer', 'ghost', () => {
          question.accepted.push('');
          paintBody();
          focusLast(bodyHost, '.qz-row .qz-input');
          emit();
        })
      );
    }
    if (!student) {
      wrap.append(
        checkbox('Capitals must match', !!question.case_sensitive, (checked) => {
          question.case_sensitive = checked || undefined;
          emit();
        })
      );
    }
    return wrap;
  }

  /**
   * Fill the gap: write the sentence, then tap words to blank them. Adjacent
   * blanked words join into one gap. The markup is written for the writer.
   */
  function gapEditor(question: QuizQuestionOf<'fill_gap'>): HTMLElement {
    type Token = { text: string; gap: boolean; space: boolean };
    const fromPassage = (passage: string): { tokens: Token[]; alternates: Map<number, string[]> } => {
      const tokens: Token[] = [];
      const alternates = new Map<number, string[]>();
      for (const part of parseGapPassage(passage)) {
        const text = part.type === 'text' ? part.text : (part.answers[0] as string);
        const start = tokens.length;
        for (const piece of text.split(/(\s+)/).filter(Boolean)) {
          tokens.push({ text: piece, gap: part.type === 'gap' && !/^\s+$/.test(piece), space: /^\s+$/.test(piece) });
        }
        if (part.type === 'gap' && part.answers.length > 1) alternates.set(start, part.answers.slice(1));
      }
      return { tokens, alternates };
    };
    let { tokens, alternates } = fromPassage(question.passage);

    const write = () => {
      const parts: Array<{ type: 'text'; text: string } | { type: 'gap'; answers: string[] }> = [];
      let i = 0;
      while (i < tokens.length) {
        const t = tokens[i] as Token;
        if (t.gap) {
          const start = i;
          let words = t.text;
          i++;
          // A run of gapped words, with the spaces between them, is one gap.
          while (i + 1 < tokens.length && tokens[i]?.space && tokens[i + 1]?.gap) {
            words += (tokens[i] as Token).text + (tokens[i + 1] as Token).text;
            i += 2;
          }
          parts.push({ type: 'gap', answers: [words, ...(alternates.get(start) ?? [])] });
        } else {
          parts.push({ type: 'text', text: t.text });
          i++;
        }
      }
      question.passage = writeGapPassage(parts);
      emit();
    };

    const wrap = el('div', 'qz-group');
    const plain = tokens.map((t) => t.text).join('');
    const text = textArea(plain, QUIZ_LIMITS.passage, 3, 'Write or paste the sentence or quote.');
    const chips = el('div', 'qz-gap-chips');
    const altHost = el('div', 'qz-gap-alts');
    text.addEventListener('input', () => {
      // Keep blanks, and their other accepted answers, on words that are still there.
      const gapped = new Set(tokens.filter((t) => t.gap).map((t) => t.text));
      const altsByWord = new Map([...alternates].map(([i, alts]) => [tokens[i]?.text ?? '', alts]));
      tokens = text.value.split(/(\s+)/).filter(Boolean).map((piece) => ({
        text: piece,
        space: /^\s+$/.test(piece),
        gap: !/^\s+$/.test(piece) && gapped.has(piece)
      }));
      alternates = new Map();
      tokens.forEach((t, i) => {
        const runStart = t.gap && !(tokens[i - 2]?.gap && tokens[i - 1]?.space);
        if (runStart && altsByWord.has(t.text)) alternates.set(i, altsByWord.get(t.text) as string[]);
      });
      paintChips();
      write();
    });
    function paintChips(): void {
      chips.replaceChildren();
      tokens.forEach((t) => {
        if (t.space) {
          chips.append(document.createTextNode(' '));
          return;
        }
        const chip = button(t.text, 'ghost', () => {
          t.gap = !t.gap;
          paintChips();
          write();
        });
        chip.className = 'qz-gap-chip';
        chip.setAttribute('aria-pressed', String(t.gap));
        chips.append(chip);
      });
      if (!tokens.some((t) => !t.space)) chips.append(el('span', 'qz-field__hint', 'Your words appear here.'));
      paintAlternates();
    }
    function paintAlternates(): void {
      altHost.replaceChildren();
      if (student) return;
      tokens.forEach((t, i) => {
        if (!t.gap || (tokens[i - 2]?.gap && tokens[i - 1]?.space)) return;
        const input = textInput((alternates.get(i) ?? []).join(', '), 200, 'Other right answers, comma separated');
        input.addEventListener('input', () => {
          alternates.set(i, input.value.split(',').map((s) => s.trim()).filter(Boolean));
          write();
        });
        altHost.append(labelled(`Gap “${t.text}…” also accepts`, input));
      });
    }
    wrap.append(
      labelled('Sentence or quote', text),
      el('p', 'qz-group__title', 'Tap the words to blank out'),
      chips,
      altHost,
      checkbox('Show a word bank', !!question.word_bank, (checked) => {
        question.word_bank = checked || undefined;
        emit();
      })
    );
    paintChips();
    return wrap;
  }

  function matchingEditor(question: QuizQuestionOf<'matching'>): HTMLElement {
    const wrap = el('div', 'qz-group');
    wrap.append(el('p', 'qz-group__title', 'Pairs'), el('p', 'qz-field__hint', 'The right-hand side is shuffled in the quiz.'));
    const list = el('ul', 'qz-rows');
    question.pairs.forEach((pair, i) => {
      const row = el('li', 'qz-row qz-row--pair');
      const left = textInput(pair.left, QUIZ_LIMITS.option, 'Item');
      left.setAttribute('aria-label', `Pair ${i + 1} item`);
      left.addEventListener('input', () => {
        pair.left = left.value;
        emit();
      });
      const right = textInput(pair.right, QUIZ_LIMITS.option, 'Its match');
      right.setAttribute('aria-label', `Pair ${i + 1} match`);
      right.addEventListener('input', () => {
        pair.right = right.value;
        emit();
      });
      row.append(left, el('span', 'qz-row__link', '↔'), right);
      if (question.pairs.length > 2) {
        row.append(
          iconButton('×', `Remove pair ${i + 1}`, () => {
            question.pairs.splice(i, 1);
            paintBody();
            emit();
          })
        );
      }
      list.append(row);
    });
    wrap.append(list);
    if (question.pairs.length < 8) {
      wrap.append(
        button('Add pair', 'ghost', () => {
          question.pairs.push({ id: newId(), left: '', right: '' });
          paintBody();
          emit();
        })
      );
    }
    return wrap;
  }

  function orderingEditor(question: QuizQuestionOf<'ordering'>): HTMLElement {
    const wrap = el('div', 'qz-group');
    wrap.append(el('p', 'qz-group__title', 'Items, in the right order'), el('p', 'qz-field__hint', 'They’re shuffled in the quiz.'));
    const list = el('ol', 'qz-rows qz-rows--numbered');
    question.items.forEach((item, i) => {
      const row = el('li', 'qz-row');
      const text = textInput(item.text, QUIZ_LIMITS.option, `Item ${i + 1}`);
      text.setAttribute('aria-label', `Item ${i + 1}`);
      text.addEventListener('input', () => {
        item.text = text.value;
        emit();
      });
      const move = (delta: number) => {
        const j = i + delta;
        if (j < 0 || j >= question.items.length) return;
        [question.items[i], question.items[j]] = [question.items[j]!, question.items[i]!];
        paintBody();
        emit();
      };
      const up = iconButton('↑', `Move item ${i + 1} up`, () => move(-1));
      up.disabled = i === 0;
      const down = iconButton('↓', `Move item ${i + 1} down`, () => move(1));
      down.disabled = i === question.items.length - 1;
      row.append(el('span', 'qz-row__num', String(i + 1)), text, up, down);
      if (question.items.length > 3) {
        row.append(
          iconButton('×', `Remove item ${i + 1}`, () => {
            question.items.splice(i, 1);
            paintBody();
            emit();
          })
        );
      }
      list.append(row);
    });
    wrap.append(list);
    if (question.items.length < 8) {
      wrap.append(
        button('Add item', 'ghost', () => {
          question.items.push({ id: newId(), text: '' });
          paintBody();
          emit();
        })
      );
    }
    return wrap;
  }

  function categoriseEditor(question: QuizQuestionOf<'categorise'>): HTMLElement {
    const wrap = el('div', 'qz-group');
    wrap.append(el('p', 'qz-group__title', 'Groups'));
    const groups = el('ul', 'qz-rows');
    question.groups.forEach((g, i) => {
      const row = el('li', 'qz-row');
      const name = textInput(g.name, 120, `Group ${i + 1}, e.g. Simile`);
      name.setAttribute('aria-label', `Group ${i + 1} name`);
      name.addEventListener('input', () => {
        g.name = name.value;
        emit();
      });
      name.addEventListener('change', () => paintBody());
      row.append(name);
      if (question.groups.length > 2) {
        row.append(
          iconButton('×', `Remove group ${i + 1}`, () => {
            question.groups.splice(i, 1);
            const fallback = question.groups[0]?.id ?? '';
            for (const item of question.items) if (item.group === g.id) item.group = fallback;
            paintBody();
            emit();
          })
        );
      }
      groups.append(row);
    });
    wrap.append(groups);
    if (question.groups.length < 4) {
      wrap.append(
        button('Add group', 'ghost', () => {
          question.groups.push({ id: newId(), name: '' });
          paintBody();
          emit();
        })
      );
    }
    wrap.append(el('p', 'qz-group__title', 'Items and the group each belongs in'));
    const items = el('ul', 'qz-rows');
    question.items.forEach((item, i) => {
      const row = el('li', 'qz-row qz-row--pair');
      const text = textInput(item.text, QUIZ_LIMITS.option, `Item ${i + 1}`);
      text.setAttribute('aria-label', `Item ${i + 1}`);
      text.addEventListener('input', () => {
        item.text = text.value;
        emit();
      });
      const pick = select(
        question.groups.map((g, gi) => ({ value: g.id, label: g.name.trim() || `Group ${gi + 1}` })),
        item.group
      );
      pick.setAttribute('aria-label', `Group for item ${i + 1}`);
      pick.addEventListener('change', () => {
        item.group = pick.value;
        emit();
      });
      row.append(text, pick);
      if (question.items.length > 2) {
        row.append(
          iconButton('×', `Remove item ${i + 1}`, () => {
            question.items.splice(i, 1);
            paintBody();
            emit();
          })
        );
      }
      items.append(row);
    });
    wrap.append(items);
    if (question.items.length < 16) {
      wrap.append(
        button('Add item', 'ghost', () => {
          question.items.push({ id: newId(), text: '', group: question.groups[question.items.length % question.groups.length]?.id ?? '' });
          paintBody();
          emit();
        })
      );
    }
    return wrap;
  }

  function findItEditor(question: QuizQuestionOf<'find_it'>): HTMLElement {
    const wrap = el('div', 'qz-group');
    const passage = textArea(question.segments.map((s) => s.text).join('\n'), QUIZ_LIMITS.passage, 5, 'Paste a short passage or a few lines of a poem.');
    const lines = el('div', 'qz-find');
    const resegment = () => {
      const keep = new Set(question.segments.filter((s) => question.correct.includes(s.id)).map((s) => s.text));
      question.segments = segmentPassage(passage.value).slice(0, 40).map((text) => ({ id: newId(), text: text.slice(0, QUIZ_LIMITS.passage) }));
      question.correct = question.segments.filter((s) => keep.has(s.text)).map((s) => s.id);
      paintLines();
      emit();
    };
    passage.addEventListener('change', resegment);
    passage.addEventListener('blur', resegment);
    function paintLines(): void {
      lines.replaceChildren();
      if (!question.segments.length) {
        lines.append(el('p', 'qz-field__hint', 'Lines appear here once you paste the passage.'));
        return;
      }
      for (const seg of question.segments) {
        const b = button(seg.text, 'ghost', () => {
          question.correct = question.correct.includes(seg.id) ? question.correct.filter((id) => id !== seg.id) : [...question.correct, seg.id];
          paintLines();
          emit();
        });
        b.className = 'qz-find__line';
        b.setAttribute('aria-pressed', String(question.correct.includes(seg.id)));
        lines.append(b);
      }
    }
    wrap.append(
      labelled('Passage', passage, 'Each line of a poem, or each sentence of prose, becomes something to tap.'),
      el('p', 'qz-group__title', 'Tap the line or lines that answer the question'),
      lines
    );
    paintLines();
    return wrap;
  }

  function spotEditor(question: QuizQuestionOf<'spot_technique'>): HTMLElement {
    const wrap = el('div', 'qz-group');
    const passage = textArea(question.passage, QUIZ_LIMITS.passage, 5, 'Paste a passage or a few lines of a poem.');
    const refresh = () => {
      if (passage.value === question.passage) return;
      question.passage = passage.value;
      paintBody();
      emit();
    };
    passage.addEventListener('change', refresh);
    passage.addEventListener('blur', refresh);
    wrap.append(labelled('Passage', passage));

    // Techniques students choose from: the right ones and some that aren't.
    const listId = uid('qz-techniques');
    const datalist = el('datalist');
    datalist.id = listId;
    wrap.append(datalist);
    let techniques: LiteraryTechnique[] = [];
    void loadLiteraryElements().then((table) => {
      techniques = table.techniques;
      for (const t of techniques) {
        const option = el('option');
        option.value = t.name;
        datalist.append(option);
      }
    });
    wrap.append(
      el('p', 'qz-group__title', 'Techniques students choose from'),
      el('p', 'qz-field__hint', 'Each one leaves the list once used. Set ×2 when the passage has two, e.g. two similes.')
    );
    let paintAnswers = () => {};
    const rows = el('ul', 'qz-rows');
    question.options.forEach((option, i) => {
      const row = el('li', 'qz-row');
      const text = textInput(option.text, QUIZ_LIMITS.option, i === 0 ? 'Start typing, e.g. Simile' : `Technique ${i + 1}`);
      text.setAttribute('list', listId);
      text.setAttribute('aria-label', `Technique ${i + 1}`);
      text.addEventListener('input', () => {
        option.text = text.value;
        const hit = techniques.find((t) => t.name.toLowerCase() === text.value.trim().toLowerCase());
        if (hit) option.technique_id = hit.id;
        else delete option.technique_id;
        paintAnswers();
        emit();
      });
      const uses = el('input', 'qz-input qz-input--count');
      uses.type = 'number';
      uses.min = '1';
      uses.max = '12';
      uses.value = String(option.uses ?? 1);
      uses.title = 'How many times students can name it';
      uses.setAttribute('aria-label', `Times technique ${i + 1} is used`);
      uses.addEventListener('input', () => {
        const n = Math.round(Number(uses.value));
        if (n > 1 && n <= 12) option.uses = n;
        else delete option.uses;
        emit();
      });
      const times = el('label', 'qz-times');
      times.append(el('span', 'qz-times__x', '×'), uses);
      row.append(text, times);
      if (question.options.length > 2) {
        row.append(
          iconButton('×', `Remove technique ${i + 1}`, () => {
            question.options.splice(i, 1);
            for (const target of question.targets) target.correct = target.correct.filter((id) => id !== option.id);
            paintBody();
            emit();
          })
        );
      }
      rows.append(row);
    });
    wrap.append(rows);
    if (question.options.length < 10) {
      wrap.append(
        button('Add technique', 'ghost', () => {
          question.options.push({ id: newId(), text: '' });
          paintBody();
          focusLast(bodyHost, '.qz-row .qz-input');
          emit();
        })
      );
    }

    if (!question.passage.trim()) {
      wrap.append(el('p', 'qz-field__hint', 'Once the passage is in, select the words of each answer here.'));
      return wrap;
    }

    wrap.append(
      el('p', 'qz-group__title', 'Answers'),
      el('p', 'qz-field__hint', 'Tap the first and last word of a technique, then tick every name you’d accept. Students who select a few words more or less still get it.')
    );
    const picker = mountWordPicker({ passage: question.passage, label: 'Passage: select an answer', onSelect: (span) => paintPick(span) });
    const pickHost = el('div', 'qz-spot-pick');
    wrap.append(picker.root);
    const spans = question.targets.map((t) => locateQuote(question.passage, t.quote));
    picker.paint((n) => {
      const i = spans.findIndex((s) => !!s && n >= s.from && n <= s.to);
      return i < 0 ? undefined : { state: 'answer', ...(n === spans[i]!.from ? { badge: String(i + 1) } : {}) };
    });

    function paintPick(span: { from: number; to: number } | null): void {
      pickHost.replaceChildren();
      picker.placeAfter(pickHost, span);
      if (!span) return;
      const named = question.options.filter((o) => o.text.trim());
      if (!named.length) {
        pickHost.append(el('p', 'qz-spot-pick__ask', 'Fill in the techniques first.'));
        return;
      }
      const ticked = new Set<string>();
      pickHost.append(el('p', 'qz-spot-pick__ask', `“${spanText(question.passage, span)}”: which technique is it?`));
      const chips = el('div', 'qz-spot-pick__chips');
      const add = button('Add this answer', 'primary', () => {
        question.targets.push({ id: newId(), quote: spanText(question.passage, span), correct: [...ticked] });
        // A second simile makes Simile ×2, so students can name it twice.
        for (const option of question.options) {
          const needed = question.targets.filter((t) => t.correct.includes(option.id)).length;
          if (needed > (option.uses ?? 1)) option.uses = needed;
        }
        paintBody();
        emit();
      });
      add.disabled = true;
      for (const option of named) {
        const chip = el('button', 'qz-chip', option.text.trim());
        chip.type = 'button';
        chip.setAttribute('aria-pressed', 'false');
        chip.addEventListener('click', () => {
          if (ticked.has(option.id)) ticked.delete(option.id);
          else ticked.add(option.id);
          chip.setAttribute('aria-pressed', String(ticked.has(option.id)));
          add.disabled = !ticked.size;
        });
        chips.append(chip);
      }
      const actions = el('div', 'qz-actions');
      actions.append(
        add,
        button('Cancel', 'ghost', () => {
          picker.clear();
          paintPick(null);
        })
      );
      pickHost.append(chips, actions);
    }

    const list = el('ol', 'qz-spots');
    paintAnswers = () => {
      const names = new Map(question.options.map((o) => [o.id, o.text.trim()]));
      list.replaceChildren();
      question.targets.forEach((target, i) => {
        const row = el('li', 'qz-spots__row');
        row.append(
          el('span', 'qz-spots__num', String(i + 1)),
          el('span', 'qz-spots__quote', `“${target.quote}”`),
          el('span', 'qz-spots__name', target.correct.map((id) => names.get(id)).filter(Boolean).join(' or ') || 'No technique')
        );
        if (!spans[i]) {
          row.dataset.state = 'wrong';
          row.append(el('span', 'qz-spots__note', 'Not in the passage any more'));
        }
        row.append(
          iconButton('×', `Remove answer ${i + 1}`, () => {
            question.targets.splice(i, 1);
            if (question.find && question.find > question.targets.length) delete question.find;
            paintBody();
            emit();
          })
        );
        list.append(row);
      });
    };
    paintAnswers();
    wrap.append(list);

    if (question.targets.length > 1) {
      const n = question.targets.length;
      const find = select(
        [{ value: '', label: `All ${n}` }, ...Array.from({ length: n - 1 }, (_, i) => ({ value: String(i + 1), label: `Any ${i + 1}` }))],
        question.find && question.find < n ? String(question.find) : ''
      );
      find.addEventListener('change', () => {
        if (find.value) question.find = Number(find.value);
        else delete question.find;
        emit();
      });
      wrap.append(labelled('Students must find', find, 'Choose “Any 1” to accept whichever answer they spot.'));
    }
    return wrap;
  }

  function imagePicker(current: QuizImage | undefined, onPick: (image: QuizImage | undefined) => void, required: boolean): HTMLElement {
    const wrap = el('div', 'qz-image-pick');
    const images = options.images ?? [];
    if (images.length) {
      const grid = el('div', 'qz-image-pick__grid');
      for (const image of images) {
        const b = el('button', 'qz-image-pick__item');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(current?.url === image.url));
        b.setAttribute('aria-label', image.alt ? `Use image: ${image.alt}` : 'Use this image');
        const img = el('img');
        img.src = image.url;
        img.alt = '';
        img.loading = 'lazy';
        b.append(img);
        b.addEventListener('click', () => onPick(current?.url === image.url && !required ? undefined : image));
        grid.append(b);
      }
      wrap.append(grid);
    }
    if (options.allowImageUrl) {
      const url = textInput(current?.url ?? '', 2000, 'https://…');
      const alt = textInput(current?.alt ?? '', 300, 'What the image shows');
      const apply = () => onPick(url.value.trim() ? { url: url.value.trim(), alt: alt.value.trim() } : undefined);
      url.addEventListener('change', apply);
      alt.addEventListener('change', apply);
      wrap.append(labelled('Image link', url), labelled('Image description', alt));
    }
    if (!images.length && !options.allowImageUrl) wrap.append(el('p', 'qz-field__hint', 'This lesson has no images to use.'));
    return wrap;
  }

  function labelImageEditor(question: QuizQuestionOf<'label_image'>): HTMLElement {
    const wrap = el('div', 'qz-group');
    wrap.append(
      el('p', 'qz-group__title', 'Image'),
      imagePicker(
        question.image.url ? question.image : undefined,
        (image) => {
          question.image = image ?? { url: '', alt: '' };
          paintBody();
          emit();
        },
        true
      )
    );
    if (!question.image.url) return wrap;
    wrap.append(el('p', 'qz-group__title', 'Tap the image to drop a pin, then name it'));
    const stage = el('div', 'qz-pins');
    const img = el('img', 'qz-pins__img');
    img.src = question.image.url;
    img.alt = question.image.alt;
    stage.append(img);
    question.pins.forEach((pin, i) => {
      const dot = el('span', 'qz-pins__dot', String(i + 1));
      dot.style.left = `${pin.x * 100}%`;
      dot.style.top = `${pin.y * 100}%`;
      stage.append(dot);
    });
    stage.addEventListener('click', (event) => {
      if (event.target !== img || question.pins.length >= 8) return;
      const box = img.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
      const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
      question.pins.push({ id: newId(), x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, label: '' });
      paintBody();
      focusLast(bodyHost, '.qz-row .qz-input');
      emit();
    });
    wrap.append(stage);
    const list = el('ol', 'qz-rows qz-rows--numbered');
    question.pins.forEach((pin, i) => {
      const row = el('li', 'qz-row');
      const label = textInput(pin.label, 120, `Label for pin ${i + 1}`);
      label.setAttribute('aria-label', `Label for pin ${i + 1}`);
      label.addEventListener('input', () => {
        pin.label = label.value;
        emit();
      });
      row.append(
        el('span', 'qz-row__num', String(i + 1)),
        label,
        iconButton('×', `Remove pin ${i + 1}`, () => {
          question.pins.splice(i, 1);
          paintBody();
          emit();
        })
      );
      list.append(row);
    });
    wrap.append(list);
    return wrap;
  }

  function writtenEditor(question: QuizQuestionOf<'extended_response'>): HTMLElement {
    const wrap = el('div', 'qz-group');
    const model = textArea(question.model_answer ?? '', QUIZ_LIMITS.model, 4, 'What a strong answer would say.');
    model.addEventListener('input', () => {
      question.model_answer = model.value || undefined;
      emit();
    });
    const guide = textArea(question.guide ?? '', QUIZ_LIMITS.model, 3, 'e.g. 1 mark for the technique, 1 for evidence, 1 for the effect.');
    guide.addEventListener('input', () => {
      question.guide = guide.value || undefined;
      emit();
    });
    wrap.append(
      el('p', 'qz-field__hint', 'Your teacher marks this one.'),
      labelled('Model answer', model),
      labelled('How to mark it', guide)
    );
    return wrap;
  }

  function explainEditor(question: QuizQuestionOf<'explain_effect'>): HTMLElement {
    const wrap = el('div', 'qz-group');
    const quote = textArea(question.quote, QUIZ_LIMITS.passage, 3, 'Paste the quote.');
    quote.addEventListener('input', () => {
      question.quote = quote.value;
      emit();
    });
    const technique = textInput(question.technique ?? '', 120, 'e.g. Personification');
    technique.addEventListener('input', () => {
      question.technique = technique.value || undefined;
      emit();
    });
    wrap.append(labelled('Quote', quote), labelled('Technique (optional)', technique));
    wrap.append(writtenEditor(question as unknown as QuizQuestionOf<'extended_response'>));
    return wrap;
  }

  /* ── Marks, hint, explanation, picture ── */
  function paintExtras(): void {
    extrasHost.replaceChildren();
    const row = el('div', 'qz-extras-row');
    const marksInput = el('input', 'qz-input qz-input--marks');
    marksInput.type = 'number';
    marksInput.inputMode = 'numeric';
    marksInput.min = String(marks.min);
    marksInput.max = String(marks.max);
    marksInput.value = String(Math.min(marks.max, Math.max(marks.min, q.marks)));
    if (q.marks !== Number(marksInput.value)) {
      q.marks = Number(marksInput.value);
      emit();
    }
    marksInput.addEventListener('input', () => {
      const n = Math.round(Number(marksInput.value));
      if (Number.isFinite(n) && n >= marks.min && n <= marks.max) {
        q.marks = n;
        emit();
      }
    });
    marksInput.addEventListener('blur', () => {
      marksInput.value = String(q.marks);
    });
    row.append(labelled(marks.min === marks.max ? `Marks (${marks.min})` : `Marks (${marks.min} to ${marks.max})`, marksInput));
    marksInput.disabled = marks.min === marks.max;
    extrasHost.append(row);

    const more = el('details', 'qz-more');
    more.open = !!(q.hint || q.explanation || q.outcomes?.length || (q.image && q.kind !== 'label_image'));
    more.append(el('summary', 'qz-more__summary', 'Hint, explanation and picture (optional)'));
    const hint = textInput(q.hint ?? '', QUIZ_LIMITS.hint, 'A nudge, not the answer.');
    hint.addEventListener('input', () => {
      q.hint = hint.value || undefined;
      emit();
    });
    const why = textArea(q.explanation ?? '', QUIZ_LIMITS.explanation, 2, 'Shown after answering.');
    why.addEventListener('input', () => {
      q.explanation = why.value || undefined;
      emit();
    });
    more.append(labelled('Hint', hint, 'Students can open it during the quiz. It costs some of the marks.'), labelled('Why this is the answer', why));
    if (!student && options.outcomes?.length) {
      const labels = options.outcomes;
      const codes = textInput(formatOutcomeCodes(q.outcomes ?? [], labels), 200, 'EN12-1, EN12-3');
      codes.classList.add('qz-outcomes');
      const note = el('p', 'qz-note qz-outcomes__unknown');
      note.id = uid('qz-outcomes-note');
      note.setAttribute('aria-live', 'polite');
      const field = labelled('Outcomes (optional)', codes, 'For the markbook. Leave empty to use the lesson’s outcomes. Republish for changes to count.');
      const hintEl = field.querySelector<HTMLElement>('.qz-field__hint');
      if (hintEl) hintEl.id = uid('qz-outcomes-hint');
      codes.setAttribute('aria-describedby', [hintEl?.id, note.id].filter(Boolean).join(' '));
      codes.addEventListener('input', () => {
        const parsed = parseOutcomeCodes(codes.value, labels);
        if (parsed.ids.length) q.outcomes = parsed.ids.slice(0, 6);
        else delete q.outcomes;
        const lines: string[] = [];
        if (parsed.unknown.length) lines.push(`Not an outcome code: ${parsed.unknown.join(', ')}`);
        if (parsed.ids.length > 6) lines.push('Only the first 6 outcomes are kept.');
        note.textContent = lines.join('. ');
        emit();
      });
      more.append(field, note);
    }
    if (q.kind !== 'label_image' && ((options.images?.length ?? 0) > 0 || options.allowImageUrl)) {
      const pictureHost = el('div', 'qz-field');
      const paintPicture = () => {
        pictureHost.replaceChildren(
          el('p', 'qz-field__label', 'Picture with the question'),
          imagePicker(
            q.image,
            (image) => {
              if (image) q.image = image;
              else delete q.image;
              paintPicture();
              emit();
            },
            false
          )
        );
      };
      paintPicture();
      more.append(pictureHost);
    }
    extrasHost.append(more);
  }

  paintPrompt();
  paintBody();
  paintExtras();

  return {
    root,
    get: () => structuredClone(q),
    problem: () => {
      const checked = checkQuestion(q);
      if (checked.ok) {
        if (q.marks < marks.min || q.marks > marks.max) return `Marks must be between ${marks.min} and ${marks.max}.`;
        return null;
      }
      return checked.message;
    }
  };
}

function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

function focusLast(host: HTMLElement, selector: string): void {
  const all = host.querySelectorAll<HTMLElement>(selector);
  all[all.length - 1]?.focus();
}

function alertIn(host: HTMLElement, text: string): void {
  host.querySelector('.qz-inline-alert')?.remove();
  const note = el('p', 'qz-inline-alert', text);
  note.setAttribute('role', 'alert');
  host.append(note);
  window.setTimeout(() => note.remove(), 4000);
}
