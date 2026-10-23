import { button, el } from '@/quiz/dom';
import { BANDS, ITEM } from '../constants';
import { codeLabel, type InsightContext } from '../context';
import { byTag, compare, confidenceQuadrants, defaultKind, findFlags, kindsPresent, mixUps } from '../patterns';
import { cronbachAlpha, itemStats, questionFacility, summary } from '../stats';
import { expandTags, payloadEvidence, tagLabel } from '../tags';
import type { Evidence, Flag, InsightPayload, TagKind } from '../types';
import { comparePanel, dotPlot, flagCards, mixUpList, quadrantGrid, questionTable, sectionHead, summaryCards, tagRows, tagSwitch } from './parts';

export type QuizInsightOptions = {
  ctx: InsightContext;
  /** The quiz picked in Compare with, for the same class. */
  compare?: InsightPayload | null;
  /** Insight of each follow-up made from this quiz, by lesson id. */
  followUps?: Map<string, InsightPayload>;
  onClose?: () => void;
  onReopen?: () => void;
  onDismiss: (flag: Flag) => void;
  onFollowUp?: (flag: Flag, kind: TagKind, evidence: Evidence[]) => void;
  openLesson: (lessonId: string) => void;
};

/** Of the flagged students, how many are now secure on the flag's tag in the follow-up. */
export function followUpOutcome(flag: Flag, follow: Evidence[]): string | null {
  const students = flag.students.length ? flag.students : [...new Set(follow.map((e) => e.student))];
  const sat = students.filter((s) => follow.some((e) => e.student === s && e.tags.includes(flag.tag) && e.share !== null));
  if (!sat.length) return null;
  const secure = sat.filter((s) => {
    const shares = follow.filter((e) => e.student === s && e.tags.includes(flag.tag) && e.share !== null).map((e) => e.share as number);
    return shares.reduce((a, b) => a + b, 0) / shares.length >= BANDS.secure;
  });
  return `${secure.length} of ${sat.length} now secure`;
}

export function renderQuizInsight(p: InsightPayload, o: QuizInsightOptions): HTMLElement {
  const root = el('section', 'ev');
  root.setAttribute('aria-label', 'Quiz insights');
  const evidence = expandTags(payloadEvidence(p), o.ctx.table);
  const kinds = kindsPresent(evidence);
  let kind: TagKind = defaultKind(evidence);
  const label = (tag: string): string => tagLabel(tag, o.ctx);
  const initials = new Map(p.students.map((s) => [s.id, s.initials]));
  const who = (ids: string[]): string => ids.map((id) => initials.get(id) ?? '?').join(', ');

  const head = el('div', 'ev__head');
  head.append(el('span', 'ev__status', p.closed ? (p.saved ? 'Closed · saved' : 'Closed') : 'Open · updates as students hand in'));
  if (!p.closed && o.onClose) head.append(button('Close now', 'secondary', () => o.onClose?.()));
  if (p.closed && p.closed_by === 'button' && o.onReopen) head.append(button('Reopen', 'ghost', () => o.onReopen?.()));
  if (p.follow_up_of) {
    const original = p.siblings.find((x) => x.lesson_id === p.follow_up_of);
    head.append(button(`Following up: ${original?.title ?? 'an earlier quiz'}`, 'ghost', () => o.openLesson(p.follow_up_of as string)));
  }
  root.append(head);

  const marked = p.attempts.filter((a) => a.pending === 0);
  const waiting = p.attempts.reduce((s, a) => s + a.pending, 0);
  const shares = marked.map((a) => (a.max ? a.score / a.max : 0));
  const s = summary(shares);
  const matrix = marked.map((a) => p.questions.map((q) => a.rows.find((r) => r.id === q.id)?.awarded ?? 0));
  const alpha = marked.length >= ITEM.alphaMinAttempts && p.questions.length >= ITEM.alphaMinItems ? cronbachAlpha(matrix) : null;
  root.append(summaryCards(s, p.attempts.length, p.students.length, alpha, `Needs ${ITEM.alphaMinAttempts} fully marked attempts and ${ITEM.alphaMinItems} questions.`));
  if (waiting) root.append(el('p', 'ev__note', `${waiting} ${waiting === 1 ? 'answer is' : 'answers are'} still to mark and left out of the numbers.`));
  if (shares.length) root.append(dotPlot(shares, s));

  const tagHost = el('div');
  const flagHost = el('div');
  const mixHost = el('div');
  const compareHost = el('div');
  root.append(tagHost, flagHost, mixHost);

  const paint = (): void => {
    const rows = byTag(evidence, kind);
    tagHost.replaceChildren(
      sectionHead('By tag · weakest first', kinds.length > 1 ? tagSwitch(kinds, kind, (k) => { kind = k; paint(); }) : undefined),
      tagRows(rows, label),
      el('p', 'ev__note', 'Dark: full marks. Light: part marks, such as the right words with the wrong name.')
    );
    const flags = findFlags(evidence, rows).filter((f) => !p.dismissed.includes(f.id));
    flagHost.replaceChildren(
      sectionHead('Follow up'),
      flagCards(flags, {
        label,
        who,
        onDismiss: o.onDismiss,
        onFollowUp: o.onFollowUp ? (f) => o.onFollowUp?.(f, kind, evidence) : undefined,
        followed: (f) => {
          const made = p.follow_ups.find((x) => x.flag === f.id);
          if (!made) return null;
          const follow = o.followUps?.get(made.lesson_id);
          return { title: made.title, open: () => o.openLesson(made.lesson_id), outcome: follow ? followUpOutcome(f, expandTags(payloadEvidence(follow), o.ctx.table)) : null };
        }
      })
    );
    mixHost.replaceChildren(sectionHead('Mix-ups'), mixUpList(mixUps(evidence, kind), label, (id) => codeLabel(id, o.ctx.codes)));
    if (o.compare) {
      const before = expandTags(payloadEvidence(o.compare), o.ctx.table);
      compareHost.replaceChildren(sectionHead('Compared with'), comparePanel(compare(before, evidence, kind), label, o.compare.title));
    }
  };
  paint();

  root.append(sectionHead('Confidence'), quadrantGrid(confidenceQuadrants(evidence), who));
  // Facility counts every marked answer, so a question is not held back by others still waiting in the same attempt.
  // Discrimination needs whole totals, so it stays on fully marked attempts.
  const maxes = p.questions.map((q) => q.marks);
  const answers = p.attempts.map((a) =>
    p.questions.map((q) => {
      const row = a.rows.find((r) => r.id === q.id);
      return row ? row.awarded : a.pending === 0 ? 0 : null;
    })
  );
  const facility = questionFacility(answers, maxes);
  const items = itemStats(matrix, maxes).map((st, j) => ({ facility: facility[j] ?? null, discrimination: st.discrimination }));
  root.append(sectionHead('Questions'), questionTable(p.questions, items, marked.length >= ITEM.discriminationMinAttempts));
  if (o.compare) root.append(compareHost);
  return root;
}
