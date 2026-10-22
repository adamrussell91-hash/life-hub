import { QUIZ_KIND_INFO, type PublicQuestion, type QuestionKey } from '@/quiz/core';
import { el } from '@/quiz/dom';
import { spanText } from '@/quiz/word-picker';

/**
 * The live quiz round as the class sees it: the question, the answer count,
 * the spread once revealed and the right answer. Shared by the quiz panel's
 * Live tab and the Display view's focus mode.
 */

/** The teacher's view of a live round, from `POST /api/lessons/:id/quiz` live actions. */
export type LiveQuiz = {
  session: string;
  code: string;
  phase: 'lobby' | 'question' | 'reveal' | 'done';
  index: number;
  total: number;
  joined: number;
  /** The teacher's move-on mark (% right) for focus view's checkpoint. */
  move_on?: number;
  question?: PublicQuestion;
  key?: QuestionKey;
  answered?: number;
  right?: number;
  marked?: number;
  picks?: Record<string, number>;
  written?: string[];
};

export function renderLiveStage(l: LiveQuiz, big: boolean): HTMLElement {
  const stage = el('div', `qz-live__stage${big ? ' qz-live__stage--board' : ''}`);
  if (l.phase === 'lobby' || !l.question) {
    stage.append(el('p', 'qz-note block-secondary', 'Waiting for students to join. Start the first question when everyone’s in.'));
    return stage;
  }
  const q = l.question;
  const revealed = l.phase === 'reveal';
  stage.append(el('p', 'qz-player__meta', `Question ${l.index + 1} of ${l.total} · ${QUIZ_KIND_INFO[q.kind].label}`));
  if (q.prompt) stage.append(el('h3', `qz-player__prompt${big ? ' qz-player__prompt--board' : ''}`, q.prompt));
  if (q.kind === 'quote_technique' && q.quote) stage.append(el('blockquote', 'qz-quote', q.quote));
  if (q.kind === 'explain_effect' || q.kind === 'spot_technique') stage.append(el('blockquote', 'qz-quote', q.kind === 'spot_technique' ? q.passage : q.quote));
  if (q.image && q.kind !== 'label_image') {
    const img = el('img', 'qz-live__img');
    img.src = q.image.url;
    img.alt = q.image.alt;
    stage.append(img);
  }
  const answered = l.answered ?? 0;
  stage.append(el('p', 'qz-live__count', `${answered} of ${l.joined} answered`));
  const picks = l.picks ?? {};
  const picksTotal = Object.values(picks).reduce((a, b) => a + b, 0);
  const right = l.key?.answer.type === 'choice' ? new Set(l.key.answer.ids) : new Set<string>();
  const optionsList =
    'options' in q ? q.options : q.kind === 'find_it' ? q.segments : q.kind === 'true_false' ? [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }] : null;
  if (optionsList) {
    const bars = el('ul', 'qz-bars qz-bars--live');
    for (const o of optionsList) {
      const n = picks[o.id] ?? 0;
      const row = el('li', 'qz-bars__row');
      const isRight = right.has(o.id) || (l.key?.answer.type === 'boolean' && String(l.key.answer.value) === o.id);
      if (revealed && isRight) row.dataset.state = 'right';
      row.append(el('span', 'qz-bars__label', o.text), meter(revealed && picksTotal ? Math.round((n / picksTotal) * 100) : 0), el('span', 'qz-bars__n', revealed ? String(n) : ''));
      bars.append(row);
    }
    stage.append(bars);
  } else if (revealed && l.key) {
    stage.append(el('p', 'qz-live__count', `${l.right ?? 0} of ${l.marked ?? answered} got full marks`));
  }
  if (revealed && l.key) {
    const shown = keySummary(q, l.key);
    if (shown) stage.append(el('p', 'qz-right-answer', shown));
    if (l.key.explanation) stage.append(el('p', 'qz-result__why', l.key.explanation));
    if (l.written?.length) {
      const list = el('ul', 'qz-written');
      for (const text of l.written.slice(0, big ? 12 : 30)) list.append(el('li', '', text));
      stage.append(list);
    }
  }
  return stage;
}

export function meter(pct: number): HTMLElement {
  const track = el('span', 'qz-meter');
  track.setAttribute('aria-hidden', 'true');
  const fill = el('span', 'qz-meter__fill');
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  track.append(fill);
  return track;
}

/** The right answer as one line, in the question's own words. */
export function keySummary(q: PublicQuestion, key: QuestionKey): string {
  const a = key.answer;
  const text = (list: Array<{ id: string; text: string }>, ids: string[]) => ids.map((id) => list.find((x) => x.id === id)?.text ?? '').filter(Boolean).join(', ');
  switch (a.type) {
    case 'choice':
      return `Answer: ${'options' in q ? text(q.options, a.ids) : q.kind === 'find_it' ? text(q.segments, a.ids) : ''}`;
    case 'boolean':
      return `Answer: ${a.value ? 'True' : 'False'}`;
    case 'text':
      return `Answer: ${a.accepted.join(' / ')}`;
    case 'gaps':
      return `Answer: ${Object.values(a.gaps).map((g) => g[0]).join(', ')}`;
    case 'spots': {
      const names = 'options' in q ? new Map(q.options.map((o) => [o.id, o.text])) : new Map<string, string>();
      return `Answer: ${a.targets.map((t) => `“${spanText(a.passage, t)}” ${t.ids.map((id) => names.get(id)).join(' or ')}`).join(' · ')}`;
    }
    case 'order':
      return q.kind === 'ordering' ? `Order: ${a.ids.map((id, i) => `${i + 1}. ${q.items.find((x) => x.id === id)?.text ?? ''}`).join('  ')}` : '';
    case 'map': {
      if (q.kind === 'matching') return Object.entries(a.map).map(([l, r]) => `${q.left.find((x) => x.id === l)?.text} → ${q.right.find((x) => x.id === r)?.text}`).join(' · ');
      if (q.kind === 'categorise') return q.groups.map((g) => `${g.text}: ${q.items.filter((i) => a.map[i.id] === g.id).map((i) => i.text).join(', ')}`).join(' · ');
      if (q.kind === 'label_image') return q.pins.map((p) => `${p.n}. ${q.labels.find((x) => x.id === a.map[p.id])?.text ?? ''}`).join(' · ');
      return '';
    }
    case 'manual':
      return a.model_answer ? `Model answer: ${a.model_answer}` : '';
  }
}

export function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
