/**
 * "How you're going" under the timeline, in time order: where the student started, where they
 * are now, and the one thing to focus on next. Read from what the page already holds.
 */
import { el } from '@/quiz/dom';
import { placeName, RUNG_ORDER, STEP_ORDER } from '@/progress/story-text';
import { pickPatterns } from '@/student/feedback-timeline';
import { nextStepBox, type Practise } from '@/student/feedback-card';
import type { Place, ProgressPayload, Rung } from '@/progress/types';

type Subject = { name: string; first: Place; now: Place; was: string | null; is: string | null };

const rank = (p: Place): number => (STEP_ORDER.includes(p) ? STEP_ORDER : RUNG_ORDER).indexOf(p);

/** The skill, outcome or concept that has risen furthest; the first one placed when nothing has. */
export function trendSubject(p: Partial<Omit<ProgressPayload, 'need' | 'map'>>): Subject | null {
  const all: Subject[] = [];
  for (const group of p.skills ?? []) {
    for (const r of group.rows) {
      const first = r.first ?? null;
      if (!first) continue;
      const iCan = (rung: Rung): string | null => (rung === 'below' ? null : r.rungs?.[rung] ?? null);
      all.push({ name: r.name, first, now: r.now, was: iCan(first), is: iCan(r.now) });
    }
  }
  for (const r of [...(p.outcomes ?? []), ...(p.concepts ?? [])]) {
    const first = r.cells.find(Boolean) ?? null;
    if (first && r.now) all.push({ name: r.name, first, now: r.now, was: null, is: null });
  }
  let best: Subject | null = null;
  for (const s of all) if (!best || rank(s.now) - rank(s.first) > rank(best.now) - rank(best.first)) best = s;
  return best;
}

/** The one next step: what the writing boxes show, else the code that comes up most. */
export function focusLine(p: Partial<Omit<ProgressPayload, 'need' | 'map'>>): string {
  return p.focus?.line?.trim() || p.next?.find((n) => !n.positive)?.action?.trim() || '';
}

function column(title: string, cls = ''): HTMLElement {
  const col = el('div', `ftr__col${cls}`);
  col.append(el('h3', 'pg-box__title', title));
  return col;
}

/** Null when there is nothing to say yet. */
export function feedbackTrends(p: Partial<Omit<ProgressPayload, 'need' | 'map'>>, practise?: Practise | null): HTMLElement | null {
  const subject = trendSubject(p);
  const patterns = pickPatterns(p.feedback?.rows);
  const next = focusLine(p);
  if (!subject && !patterns.length && !next) return null;
  const sec = el('section', 'ftr');
  sec.dataset.tour = 'trends';
  const row = el('div', 'ftr__row');
  if (subject) {
    const before = column('Before');
    before.append(el('p', 'ftr__say', `${subject.name}. You started here: ${placeName(subject.first)}.`));
    if (subject.was) before.append(el('p', 'ftr__ican', subject.was));
    row.append(before);
  }
  if (subject || patterns.length) {
    const now = column('Now');
    if (subject) {
      now.append(el('p', 'ftr__say', `${subject.name}. You are here now: ${placeName(subject.now)}.`));
      if (subject.is) now.append(el('p', 'ftr__ican', subject.is));
    }
    const of = (n: number, of: number): string => `on ${n} of your last ${of}`;
    const good = patterns.find((r) => r.positive);
    const work = patterns.find((r) => !r.positive);
    if (good) now.append(el('span', 'fb-chip fb-chip--up', `${good.label}: ${of(good.hit, good.of)}`));
    if (work) now.append(el('span', 'fb-chip fb-chip--work', `${work.label}: ${of(work.hit, work.of)}`));
    row.append(now);
  }
  if (next) {
    const focus = column('Focus on next', ' ftr__col--next');
    focus.append(nextStepBox(next, practise));
    row.append(focus);
  }
  sec.append(el('h2', 'pm-map__title', 'How you’re going'), row);
  return sec;
}
