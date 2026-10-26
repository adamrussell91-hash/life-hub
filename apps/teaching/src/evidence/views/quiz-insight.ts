import { button, el } from '@/quiz/dom';
import { BANDS, ITEM } from '../constants';
import { codeLabel, type InsightContext } from '../context';
import { byTag, compare, confidenceQuadrants, defaultKind, findFlags, kindsPresent, mixUps } from '../patterns';
import { cronbachAlpha, itemStats, questionFacility, summary } from '../stats';
import { expandTags, payloadEvidence, tagLabel } from '../tags';
import type { Evidence, Flag, InsightPayload, TagKind } from '../types';
import { comparePanel, flagCards, mixUpList, quadrantGrid, sectionHead, summaryCards, tagRows, tagSwitch } from './parts';
import { newResultsUi, questionRows, scoreHistogram, scoreRing, type ResultsTab, type ResultsUi } from './results';

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
  /** What is open; the panel keeps it between repaints. */
  ui?: ResultsUi;
  /** Sits beside the status: the class picker, release. */
  extras?: HTMLElement[];
  /** The Students tab body. Without it the tab is left out. */
  students?: HTMLElement | null;
  /** The answer breakdown shown when a question row is opened. */
  questionDetail?: (questionId: string) => HTMLElement | null;
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
  const ui = o.ui ?? newResultsUi();
  const evidence = expandTags(payloadEvidence(p), o.ctx.table);
  const kinds = kindsPresent(evidence);
  let kind: TagKind = defaultKind(evidence);
  const label = (tag: string): string => tagLabel(tag, o.ctx);
  const initials = new Map(p.students.map((s) => [s.id, s.initials]));
  const who = (ids: string[]): string => ids.map((id) => initials.get(id) ?? '?').join(', ');

  const head = el('div', 'ev__head');
  head.append(...(o.extras ?? []));
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

  // The one picture of the class: average ring beside the score spread, numbers underneath.
  const hero = el('div', 'ev-hero');
  const picture = el('div', 'ev-hero__picture');
  picture.append(scoreRing(s ? s.mean : null), shares.length ? scoreHistogram(shares, s) : el('p', 'ev__empty', 'No marked attempts yet.'));
  hero.append(picture, summaryCards(s, p.attempts.length, p.students.length, alpha, `Needs ${ITEM.alphaMinAttempts} fully marked attempts and ${ITEM.alphaMinItems} questions.`));
  root.append(hero);
  if (waiting) root.append(el('p', 'ev__note', `${waiting} ${waiting === 1 ? 'answer is' : 'answers are'} still to mark and left out of the numbers.`));

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

  const tabs: Array<[ResultsTab, string]> = [['overview', 'Overview'], ['questions', `Questions · ${p.questions.length}`]];
  if (o.students) tabs.push(['students', `Students · ${p.attempts.length}`]);
  if (!tabs.some(([t]) => t === ui.tab)) ui.tab = 'overview';
  const bar = el('div', 'ev-tabs');
  bar.setAttribute('role', 'tablist');
  const panel = el('div', 'ev-tabpanel');
  panel.setAttribute('role', 'tabpanel');
  const buttons = new Map<ResultsTab, HTMLButtonElement>();
  const show = (tab: ResultsTab): void => {
    ui.tab = tab;
    for (const [t, b] of buttons) {
      b.setAttribute('aria-selected', String(t === tab));
      b.tabIndex = t === tab ? 0 : -1;
    }
    panel.replaceChildren(tab === 'overview' ? overview() : tab === 'questions' ? questions() : (o.students as HTMLElement));
  };
  for (const [tab, text] of tabs) {
    const b = el('button', 'ev-tab', text);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => show(tab));
    b.addEventListener('keydown', (e) => {
      const at = tabs.findIndex(([t]) => t === tab);
      const next = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : -1;
      if (next < 0) return;
      const target = tabs[(next + tabs.length) % tabs.length]![0];
      show(target);
      buttons.get(target)?.focus();
    });
    buttons.set(tab, b);
    bar.append(b);
  }
  root.append(bar, panel);

  function questions(): HTMLElement {
    return questionRows(p.questions, items, marked.length >= ITEM.discriminationMinAttempts, ui, o.questionDetail);
  }

  function overview(): HTMLElement {
    const grid = el('div', 'ev-grid');
    const tagHost = el('div', 'ev-block');
    const flagHost = el('div', 'ev-block');
    const mixHost = el('div', 'ev-block');
    const confHost = el('div', 'ev-block');
    const compareHost = el('div', 'ev-block ev-block--wide');
    grid.append(tagHost, flagHost, mixHost, confHost);
    const paint = (): void => {
      const rows = byTag(evidence, kind);
      const shown = ui.allTags ? rows : rows.slice(0, TAGS_SHOWN);
      const more = rows.length > TAGS_SHOWN ? button(ui.allTags ? 'Show fewer' : `Show all ${rows.length}`, 'ghost', () => { ui.allTags = !ui.allTags; paint(); }) : null;
      tagHost.replaceChildren(
        sectionHead('Weakest first', kinds.length > 1 ? tagSwitch(kinds, kind, (k) => { kind = k; paint(); }) : undefined),
        tagRows(shown, label),
        ...(more ? [more] : []),
        el('p', 'ev__note', 'Dark: full marks. Light: part marks.')
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
      mixHost.replaceChildren(sectionHead('Shared mix-ups'), mixUpList(mixUps(evidence, kind), label, (id) => codeLabel(id, o.ctx.codes)));
      if (o.compare) {
        const before = expandTags(payloadEvidence(o.compare), o.ctx.table);
        compareHost.replaceChildren(sectionHead('Compared with'), comparePanel(compare(before, evidence, kind), label, o.compare.title));
      }
    };
    paint();
    confHost.append(sectionHead('How sure they were'), quadrantGrid(confidenceQuadrants(evidence), who));
    if (o.compare) grid.append(compareHost);
    return grid;
  }

  show(ui.tab);
  return root;
}

/** Topic rows shown before "Show all". */
const TAGS_SHOWN = 6;
