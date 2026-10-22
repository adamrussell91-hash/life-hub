import {
  QUIZ_KIND_INFO,
  QUIZ_LIMITS,
  type MarkResult,
  type PublicQuestion,
  type QuestionKey,
  type QuizResponse,
  type Spot,
  type WordSpan
} from '@/quiz/core';
import { el, formatMarks, select, textArea, textInput, uid } from '@/quiz/dom';
import { mountWordPicker, spanText } from '@/quiz/word-picker';
import './quiz.css';

/**
 * The question player: one public question, answered with taps and short
 * boxes. With a result it turns into the marked view, showing what was right,
 * what was wrong and, when the quiz allows it, the right answer.
 *
 * Inputs are plain buttons, selects and text boxes so they work on a phone,
 * with a keyboard and with a screen reader. No drag and drop.
 */

export type PlayerOptions = {
  question: PublicQuestion;
  response?: QuizResponse | null;
  locked?: boolean;
  /** Present once marked. The key is present when the right answer may be shown. */
  result?: { mark: MarkResult; key?: QuestionKey | null; hinted?: boolean; awarded?: number | null } | null;
  /** Shuffle display order of options (not of fixed passages). */
  shuffle?: boolean;
  /** Seed so a reload shows the same shuffle. */
  seed?: string;
  onChange?: (response: QuizResponse) => void;
  number?: number;
  /** Shown big for the class board in live mode. */
  board?: boolean;
};

type Choice = { id: string; text: string };

export function mountQuestionPlayer(options: PlayerOptions): HTMLElement {
  const q = options.question;
  const locked = !!options.locked || !!options.result;
  const result = options.result ?? null;
  const key = result?.key ?? null;
  const root = el('div', `qz-player${options.board ? ' qz-player--board' : ''}`);
  root.dataset.kind = q.kind;
  const emit = (response: QuizResponse) => options.onChange?.(response);
  const order = <T extends { id: string }>(list: T[]): T[] => (options.shuffle ? seededShuffle(list, `${options.seed ?? ''}:${q.id}`) : list);

  const head = el('div', 'qz-player__head');
  const meta = el('p', 'qz-player__meta');
  meta.textContent = [options.number ? `Question ${options.number}` : '', QUIZ_KIND_INFO[q.kind].label, `${formatMarks(q.marks)} ${q.marks === 1 ? 'mark' : 'marks'}`]
    .filter(Boolean)
    .join(' · ');
  head.append(meta);
  const promptId = uid('qz-prompt');
  if (q.prompt.trim()) {
    const prompt = el('h3', 'qz-player__prompt', q.prompt);
    prompt.id = promptId;
    head.append(prompt);
  }
  root.append(head);

  if (q.image && q.kind !== 'label_image') {
    const fig = el('figure', 'qz-player__figure');
    const img = el('img');
    img.src = q.image.url;
    img.alt = q.image.alt;
    img.loading = 'lazy';
    fig.append(img);
    root.append(fig);
  }

  const body = el('div', 'qz-player__body');
  root.append(body);

  const parts = result?.mark.parts ?? {};
  const keyIds = key?.answer.type === 'choice' ? new Set(key.answer.ids) : new Set<string>();
  const keyMap = key?.answer.type === 'map' ? key.answer.map : {};

  switch (q.kind) {
    case 'multiple_choice':
    case 'odd_one_out':
    case 'quote_technique':
    case 'multi_select': {
      if (q.kind === 'quote_technique' && q.quote) body.append(quoteBox(q.quote));
      const many = q.kind === 'multi_select';
      if (many) body.append(el('p', 'qz-player__instruction', 'Tick every answer that applies.'));
      const picked = new Set(responseSelected(options.response));
      body.append(choiceList(order(q.options), picked, many, (ids) => emit({ selected: ids })));
      break;
    }
    case 'find_it': {
      body.append(el('p', 'qz-player__instruction', q.pick === 1 ? 'Tap the line that answers the question.' : `Tap the ${q.pick} lines that answer the question.`));
      const picked = new Set(responseSelected(options.response));
      body.append(choiceList(q.segments, picked, q.pick > 1, (ids) => emit({ selected: ids }), 'qz-choice--line'));
      break;
    }
    case 'spot_technique': {
      // Copied out: the closures below lose the narrowing on q.
      const { passage, pick, options: choices } = q;
      const spots: Spot[] = options.response && 'spots' in options.response ? [...options.response.spots] : [];
      const optionText = new Map(choices.map((o) => [o.id, o.text]));
      const keyTargets = key?.answer.type === 'spots' ? key.answer.targets : [];
      body.append(
        el(
          'p',
          'qz-player__instruction',
          pick === 1
            ? 'Tap the first and last word of the technique, then name it.'
            : `Find ${pick}. For each one, tap its first and last word, then name it.`
        )
      );
      const picker = mountWordPicker({ passage: passage, disabled: locked, label: 'Passage', onSelect: (span) => paintPick(span) });
      const pickHost = el('div', 'qz-spot-pick');
      pickHost.setAttribute('aria-live', 'polite');
      pickHost.hidden = true;
      const list = el('ol', 'qz-spots');
      body.append(picker.root, pickHost, list);

      const stateOf = (i: number) => (!result ? 'found' : parts[`s${i}`] ? 'right' : parts[`s${i}.found`] ? 'part' : 'wrong');
      const paintSpots = () => {
        picker.paint((n) => {
          const i = spots.findIndex((s) => n >= s.from && n <= s.to);
          if (i >= 0) return { state: stateOf(i), ...(n === spots[i]!.from ? { badge: String(i + 1) } : {}) };
          if (keyTargets.some((t) => n >= t.from && n <= t.to)) return { state: 'answer' };
          return undefined;
        });
        list.replaceChildren();
        spots.forEach((spot, i) => {
          const row = el('li', 'qz-spots__row');
          if (result) row.dataset.state = stateOf(i);
          row.append(
            el('span', 'qz-spots__num', String(i + 1)),
            el('span', 'qz-spots__quote', `“${spanText(passage, spot)}”`),
            el('span', 'qz-spots__name', optionText.get(spot.option) ?? '')
          );
          if (result && stateOf(i) === 'part') row.append(el('span', 'qz-spots__note', 'Right words, wrong technique'));
          if (!locked) {
            const remove = el('button', 'qz-icon-btn', '×');
            remove.type = 'button';
            remove.setAttribute('aria-label', `Remove “${spanText(passage, spot)}”`);
            remove.addEventListener('click', () => {
              spots.splice(i, 1);
              paintSpots();
              paintPick(null);
              emit({ spots: [...spots] });
            });
            row.append(remove);
          }
          list.append(row);
        });
      };

      function paintPick(span: WordSpan | null): void {
        pickHost.replaceChildren();
        pickHost.hidden = !span;
        if (!span) return;
        if (spots.length >= pick) {
          pickHost.append(el('p', 'qz-spot-pick__ask', `You’ve found ${pick}. Remove one to choose different words.`));
          picker.clear();
          return;
        }
        pickHost.append(el('p', 'qz-spot-pick__ask', `“${spanText(passage, span)}”: which technique is this?`));
        const chips = el('div', 'qz-spot-pick__chips');
        for (const option of order(choices)) {
          const chip = el('button', 'qz-chip', option.text);
          chip.type = 'button';
          chip.addEventListener('click', () => {
            spots.push({ ...span, option: option.id });
            picker.clear();
            paintPick(null);
            paintSpots();
            emit({ spots: [...spots] });
          });
          chips.append(chip);
        }
        const cancel = el('button', 'btn btn--ghost', 'Cancel');
        cancel.type = 'button';
        cancel.addEventListener('click', () => {
          picker.clear();
          paintPick(null);
        });
        pickHost.append(chips, cancel);
      }

      paintSpots();
      if (keyTargets.length && result?.mark.correct !== true) {
        body.append(
          rightAnswer(keyTargets.map((t) => `“${spanText(passage, t)}”: ${t.ids.map((id) => optionText.get(id)).join(' or ')}`).join(' · '))
        );
      }
      break;
    }
    case 'true_false': {
      const value = options.response && 'value' in options.response ? options.response.value : undefined;
      const row = el('div', 'qz-toggle-row');
      for (const v of [true, false]) {
        const b = el('button', 'btn btn--secondary qz-toggle', v ? 'True' : 'False');
        b.type = 'button';
        b.disabled = locked;
        b.setAttribute('aria-pressed', String(value === v));
        if (key?.answer.type === 'boolean' && key.answer.value === v) b.dataset.state = 'right';
        else if (result && value === v) b.dataset.state = !key && result.mark.correct ? 'right' : 'wrong';
        b.addEventListener('click', () => {
          row.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          emit({ value: v });
        });
        row.append(b);
      }
      body.append(row);
      break;
    }
    case 'short_answer': {
      const text = options.response && 'text' in options.response ? options.response.text : '';
      const input = textInput(text, QUIZ_LIMITS.answer, 'Your answer');
      input.setAttribute('aria-labelledby', promptId);
      input.disabled = locked;
      input.addEventListener('input', () => emit({ text: input.value }));
      body.append(input);
      if (key?.answer.type === 'text' && result?.mark.correct !== true) body.append(rightAnswer(key.answer.accepted.join(' / ')));
      break;
    }
    case 'extended_response':
    case 'explain_effect': {
      if (q.kind === 'explain_effect') {
        body.append(quoteBox(q.quote));
        if (q.technique) body.append(el('p', 'qz-player__instruction', `Technique: ${q.technique}`));
      }
      const text = options.response && 'text' in options.response ? options.response.text : '';
      const input = textArea(text, QUIZ_LIMITS.response, 6, 'Write your answer.');
      input.setAttribute('aria-labelledby', promptId);
      input.disabled = locked;
      input.addEventListener('input', () => emit({ text: input.value }));
      body.append(input);
      if (key?.answer.type === 'manual' && key.answer.model_answer) {
        const model = el('details', 'qz-model');
        model.append(el('summary', '', 'Model answer'), el('p', '', key.answer.model_answer));
        body.append(model);
      }
      break;
    }
    case 'fill_gap': {
      const given = options.response && 'gaps' in options.response ? { ...options.response.gaps } : {};
      const gapKey = key?.answer.type === 'gaps' ? key.answer.gaps : {};
      const para = el('p', 'qz-gaps');
      let gapNo = 0;
      for (const part of q.parts) {
        if (part.type === 'text') {
          para.append(document.createTextNode(part.text));
          continue;
        }
        gapNo += 1;
        const label = `Gap ${gapNo}`;
        const wrap = el('span', 'qz-gap');
        if (part.id in parts) wrap.dataset.state = parts[part.id] ? 'right' : 'wrong';
        let control: HTMLInputElement | HTMLSelectElement;
        if (q.bank?.length) {
          control = select(q.bank.map((w) => ({ value: w, label: w })), given[part.id] ?? '', '…');
        } else {
          control = textInput(given[part.id] ?? '', 200);
          control.size = 10;
        }
        control.classList.add('qz-gap__input');
        control.setAttribute('aria-label', label);
        control.disabled = locked;
        const update = () => {
          given[part.id] = control.value;
          emit({ gaps: { ...given } });
        };
        control.addEventListener(control instanceof HTMLSelectElement ? 'change' : 'input', update);
        wrap.append(control);
        if (result && parts[part.id] === false && gapKey[part.id]) wrap.append(el('span', 'qz-gap__fix', gapKey[part.id]![0] ?? ''));
        para.append(wrap);
      }
      body.append(para);
      break;
    }
    case 'matching': {
      const map = options.response && 'map' in options.response ? { ...options.response.map } : {};
      body.append(
        pairList(q.left, q.right, map, keyMap, parts, locked, 'Choose a match', (next) => emit({ map: next }))
      );
      break;
    }
    case 'label_image': {
      const map = options.response && 'map' in options.response ? { ...options.response.map } : {};
      const stage = el('div', 'qz-pins');
      const img = el('img', 'qz-pins__img');
      img.src = q.image.url;
      img.alt = q.image.alt;
      stage.append(img);
      for (const pin of q.pins) {
        const dot = el('span', 'qz-pins__dot', String(pin.n));
        dot.style.left = `${pin.x * 100}%`;
        dot.style.top = `${pin.y * 100}%`;
        if (pin.id in parts) dot.dataset.state = parts[pin.id] ? 'right' : 'wrong';
        stage.append(dot);
      }
      body.append(stage);
      body.append(
        pairList(
          q.pins.map((p) => ({ id: p.id, text: `Pin ${p.n}` })),
          q.labels,
          map,
          keyMap,
          parts,
          locked,
          'Choose a label',
          (next) => emit({ map: next })
        )
      );
      break;
    }
    case 'categorise': {
      const map = options.response && 'map' in options.response ? { ...options.response.map } : {};
      const list = el('ul', 'qz-sort');
      for (const item of order(q.items)) {
        const row = el('li', 'qz-sort__row');
        if (item.id in parts) row.dataset.state = parts[item.id] ? 'right' : 'wrong';
        row.append(el('span', 'qz-sort__text', item.text));
        const groupRow = el('div', 'qz-sort__groups');
        groupRow.setAttribute('role', 'group');
        groupRow.setAttribute('aria-label', `Group for “${item.text}”`);
        for (const g of q.groups) {
          const b = el('button', 'qz-chip', g.text);
          b.type = 'button';
          b.disabled = locked;
          b.setAttribute('aria-pressed', String(map[item.id] === g.id));
          if (result && keyMap[item.id] === g.id && parts[item.id] === false) b.dataset.state = 'right';
          b.addEventListener('click', () => {
            map[item.id] = g.id;
            groupRow.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
            emit({ map: { ...map } });
          });
          groupRow.append(b);
        }
        row.append(groupRow);
        list.append(row);
      }
      body.append(list);
      break;
    }
    case 'ordering': {
      const start = options.response && 'order' in options.response && options.response.order.length === q.items.length ? options.response.order : q.items.map((i) => i.id);
      const byId = new Map(q.items.map((i) => [i.id, i]));
      let current = start.filter((id) => byId.has(id));
      const list = el('ol', 'qz-order');
      const paint = (focusId?: string, dir?: 'up' | 'down') => {
        list.replaceChildren();
        current.forEach((id, i) => {
          const row = el('li', 'qz-order__row');
          if (id in parts) row.dataset.state = parts[id] ? 'right' : 'wrong';
          row.append(el('span', 'qz-order__num', String(i + 1)), el('span', 'qz-order__text', byId.get(id)?.text ?? ''));
          if (!locked) {
            const mv = (delta: number) => {
              const j = i + delta;
              if (j < 0 || j >= current.length) return;
              const next = [...current];
              [next[i], next[j]] = [next[j] as string, next[i] as string];
              current = next;
              paint(id, delta < 0 ? 'up' : 'down');
              emit({ order: [...current] });
            };
            const up = el('button', 'qz-icon-btn', '↑');
            up.type = 'button';
            up.dataset.dir = 'up';
            up.setAttribute('aria-label', `Move “${byId.get(id)?.text ?? ''}” up`);
            up.disabled = i === 0;
            up.addEventListener('click', () => mv(-1));
            const down = el('button', 'qz-icon-btn', '↓');
            down.type = 'button';
            down.dataset.dir = 'down';
            down.setAttribute('aria-label', `Move “${byId.get(id)?.text ?? ''}” down`);
            down.disabled = i === current.length - 1;
            down.addEventListener('click', () => mv(1));
            row.append(up, down);
            row.dataset.id = id;
          }
          list.append(row);
        });
        if (focusId && dir) {
          const btn = list.querySelector<HTMLButtonElement>(`li[data-id="${focusId}"] button[data-dir="${dir}"]`);
          (btn && !btn.disabled ? btn : list.querySelector<HTMLButtonElement>(`li[data-id="${focusId}"] button:not(:disabled)`))?.focus();
        }
      };
      paint();
      body.append(list);
      if (!options.response || !('order' in options.response)) emit({ order: [...current] });
      if (key?.answer.type === 'order' && result?.mark.correct === false) {
        body.append(rightAnswer(key.answer.ids.map((id, i) => `${i + 1}. ${byId.get(id)?.text ?? ''}`).join('  ')));
      }
      break;
    }
  }

  if (result) root.append(resultBar(result, key));
  return root;

  /* ── pieces ── */

  function choiceList(list: Choice[], picked: Set<string>, many: boolean, onPick: (ids: string[]) => void, extra = ''): HTMLElement {
    const ul = el('ul', 'qz-choices');
    ul.setAttribute('role', 'group');
    if (q.prompt.trim()) ul.setAttribute('aria-labelledby', promptId);
    for (const option of list) {
      const li = el('li');
      const b = el('button', `qz-choice ${extra}`.trim());
      b.type = 'button';
      b.disabled = locked;
      b.setAttribute('aria-pressed', String(picked.has(option.id)));
      b.append(el('span', 'qz-choice__mark', ''), el('span', 'qz-choice__text', option.text));
      if (result && key) {
        if (keyIds.has(option.id)) b.dataset.state = 'right';
        else if (picked.has(option.id)) b.dataset.state = 'wrong';
      } else if (result && picked.has(option.id)) {
        // Without the answer, only say whether each pick was right.
        const ok = option.id in parts ? parts[option.id] : result.mark.correct === true;
        b.dataset.state = ok ? 'right' : 'wrong';
      }
      b.addEventListener('click', () => {
        if (many) {
          if (picked.has(option.id)) picked.delete(option.id);
          else picked.add(option.id);
        } else {
          picked.clear();
          picked.add(option.id);
        }
        ul.querySelectorAll<HTMLButtonElement>('.qz-choice').forEach((x, i) => x.setAttribute('aria-pressed', String(picked.has(list[i]!.id))));
        onPick([...picked]);
      });
      li.append(b);
      ul.append(li);
    }
    return ul;
  }

  function pairList(
    left: Choice[],
    right: Choice[],
    map: Record<string, string>,
    answer: Record<string, string>,
    marked: Record<string, boolean>,
    isLocked: boolean,
    placeholder: string,
    onPick: (map: Record<string, string>) => void
  ): HTMLElement {
    const ul = el('ul', 'qz-pairs');
    const rightText = new Map(right.map((r) => [r.id, r.text]));
    for (const item of left) {
      const li = el('li', 'qz-pairs__row');
      if (item.id in marked) li.dataset.state = marked[item.id] ? 'right' : 'wrong';
      const label = el('span', 'qz-pairs__left', item.text);
      const pick = select(right.map((r) => ({ value: r.id, label: r.text })), map[item.id] ?? '', placeholder);
      pick.setAttribute('aria-label', `Match for “${item.text}”`);
      pick.disabled = isLocked;
      pick.addEventListener('change', () => {
        map[item.id] = pick.value;
        onPick({ ...map });
      });
      li.append(label, pick);
      if (marked[item.id] === false && answer[item.id]) li.append(el('span', 'qz-pairs__fix', `→ ${rightText.get(answer[item.id]!) ?? ''}`));
      ul.append(li);
    }
    return ul;
  }
}

function quoteBox(text: string): HTMLElement {
  return el('blockquote', 'qz-quote', text);
}

function rightAnswer(text: string): HTMLElement {
  const p = el('p', 'qz-right-answer');
  p.append(el('span', 'qz-right-answer__label', 'Answer: '), document.createTextNode(text));
  return p;
}

function responseSelected(response: QuizResponse | null | undefined): string[] {
  return response && 'selected' in response ? response.selected : [];
}

function resultBar(result: NonNullable<PlayerOptions['result']>, key: QuestionKey | null): HTMLElement {
  const bar = el('div', 'qz-result');
  const { mark } = result;
  const awarded = result.awarded ?? mark.score;
  let state: string;
  let text: string;
  if (awarded === null || awarded === undefined) {
    state = 'pending';
    text = mark.pending === 'near_miss' ? 'Nearly: your teacher will check this one.' : 'Your teacher will mark this one.';
  } else {
    state = awarded >= mark.max ? 'right' : awarded > 0 ? 'part' : 'wrong';
    text = `${state === 'right' ? 'Right' : state === 'part' ? 'Partly right' : 'Not this time'} · ${formatMarks(awarded)} / ${formatMarks(mark.max)}`;
    if (result.hinted && awarded < (mark.score ?? 0)) text += ' (hint used)';
  }
  bar.dataset.state = state;
  bar.append(el('p', 'qz-result__text', text));
  if (key?.explanation) bar.append(el('p', 'qz-result__why', key.explanation));
  return bar;
}

/** A shuffle that gives the same order for the same seed. */
export function seededShuffle<T>(list: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const random = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
