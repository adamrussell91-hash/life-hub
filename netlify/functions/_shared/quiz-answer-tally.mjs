/**
 * What the class answered on one question, for the teacher's Results: counts per
 * gap, pair, position or spot, and written answers beside the student's initials.
 * Everything is stored as words, because publishing gives options new ids and
 * one question can hold attempts from several publishes.
 *
 * Choice questions with an option list are left out: `picks` already counts them.
 */
import { passageWords } from './quiz-core.mjs';

export const emptyTally = () => ({ groups: [], written: [] });

function bump(tally, label, text, right) {
  const shown = String(text ?? '').trim();
  if (!shown) return;
  let group = tally.groups.find((g) => g.label === label);
  if (!group) tally.groups.push((group = { label, rows: [] }));
  const same = shown.toLowerCase();
  const row = group.rows.find((r) => r.text.toLowerCase() === same);
  if (row) {
    row.n += 1;
    row.right = row.right || right;
  } else group.rows.push({ text: shown, n: 1, right });
}

/** The few words before a gap, so "Gap 2" can be told apart without the passage. */
function gapLabel(parts, index, n) {
  const before = parts[index - 1];
  const words = before?.type === 'text' ? String(before.text ?? '').trim().split(/\s+/).filter(Boolean).slice(-6).join(' ') : '';
  return words ? `Gap ${n}: …${words} ___` : `Gap ${n}`;
}

const textOf = (list, id) => list?.find((x) => x.id === id)?.text ?? '';

export function tallyAnswer(tally, entry, row, who) {
  const { question, key } = entry;
  const r = row.response;
  if (!question || !r) return;
  const parts = row.mark?.parts ?? {};
  switch (question.kind) {
    case 'true_false':
      if (typeof r.value === 'boolean') bump(tally, '', r.value ? 'True' : 'False', r.value === key.answer.value);
      return;
    case 'short_answer':
    case 'extended_response':
    case 'explain_effect':
      if (typeof r.text === 'string' && r.text.trim()) {
        tally.written.push({ initials: who?.initials ?? null, name: who?.name ?? null, text: r.text, awarded: row.awarded, max: row.mark?.max ?? null });
      }
      return;
    case 'find_it':
      for (const id of r.selected ?? []) bump(tally, '', textOf(question.segments, id), key.answer.ids.includes(id));
      return;
    case 'fill_gap': {
      let n = 0;
      (question.parts ?? []).forEach((part, i) => {
        if (part.type !== 'gap') return;
        n += 1;
        bump(tally, gapLabel(question.parts, i, n), r.gaps?.[part.id], parts[part.id] === true);
      });
      return;
    }
    case 'matching':
      for (const item of question.left ?? []) bump(tally, item.text, textOf(question.right, r.map?.[item.id]), parts[item.id] === true);
      return;
    case 'categorise':
      for (const item of question.items ?? []) bump(tally, item.text, textOf(question.groups, r.map?.[item.id]), parts[item.id] === true);
      return;
    case 'label_image':
      for (const pin of question.pins ?? []) bump(tally, `Pin ${pin.n}`, textOf(question.labels, r.map?.[pin.id]), parts[pin.id] === true);
      return;
    case 'ordering':
      (r.order ?? []).forEach((id, i) => bump(tally, `Position ${i + 1}`, textOf(question.items, id), key.answer.ids[i] === id));
      return;
    case 'spot_technique': {
      const words = passageWords(question.passage ?? '');
      (r.spots ?? []).forEach((spot, i) => {
        const quote = words.slice(spot.from, spot.to + 1).map((w) => w.text).join(' ');
        const technique = textOf(question.options, spot.option);
        if (quote) bump(tally, '', technique ? `“${quote}”: ${technique}` : `“${quote}”`, parts[`s${i}`] === true);
      });
      return;
    }
    default:
  }
}

/** Most chosen first within each group, ready to send. */
export function finishTally(tally) {
  for (const g of tally.groups) g.rows.sort((a, b) => b.n - a.n || a.text.localeCompare(b.text));
  return tally;
}
