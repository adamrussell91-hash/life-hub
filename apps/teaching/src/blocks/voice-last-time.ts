import { apiPost } from '@/api/client';
import { el } from '@/blocks/peer-feedback-ui';
import { STRENGTH_COLOUR, codeInk, codeText, focusStep, type FeedbackCode } from '@/blocks/feedback-codes';
import { deviceToken } from '@/quiz/dom';
import type { SkillRow } from '@/progress/types';
import { studentAnchor } from '@/student/shell';

/**
 * Before a new viva: a folded "Last time" card with the focus from the
 * student's last returned viva, your comment, and which codes keep coming
 * back across their last few. Closed by default so it sits quietly above
 * the dot points; the student opens it when they want it.
 */

export type PatternMark = 'need' | 'strength' | null;
export type VivaHistory = {
  count: number;
  last: {
    lesson_id: string;
    title: string;
    date: string;
    comment: string;
    next_step: string | null;
    tags: Array<{ code_id: string; positive: boolean }>;
  } | null;
  pattern: Array<{ code_id: string; marks: PatternMark[] }>;
  codes?: FeedbackCode[];
};
export type VoiceStart = { rows: SkillRow[]; vivas: VivaHistory | null };

type OwnStart = { need: 'initials' | null; skills?: Array<{ rows: SkillRow[] }>; vivas?: VivaHistory };

/**
 * One call for everything a Voice block shows before recording: the Speaking
 * rows, and for a viva the student's last viva and pattern. Resolves to
 * nothing for a device with no initials, or on any error.
 */
export function voiceStartLoader(
  classId: string | undefined,
  lessonId: string,
  wants: { speaking: boolean; vivas: boolean },
  call: (classId: string, body: Record<string, unknown>) => Promise<OwnStart> = (id, body) =>
    apiPost<OwnStart>(`/api/published/profile/${encodeURIComponent(id)}`, { ...body, class_token: deviceToken(`class:${id}`) })
): Promise<VoiceStart> {
  const none: VoiceStart = { rows: [], vivas: null };
  if (!classId || (!wants.speaking && !wants.vivas)) return Promise.resolve(none);
  return call(classId, { action: 'skills', strand: 'speaking', ...(wants.vivas ? { vivas: true, lesson_id: lessonId } : {}) }).then(
    (r) => {
      if (r.need === 'initials') return none;
      return { rows: wants.speaking ? (r.skills ?? []).flatMap((g) => g.rows) : [], vivas: wants.vivas && r.vivas?.last ? r.vivas : null };
    },
    () => none
  );
}

/** The one thing to work on from the last viva: the teacher's chosen next step, else the commonest code's step. */
export function lastFocus(history: VivaHistory | null): { code: FeedbackCode | null; line: string } | null {
  const last = history?.last;
  if (!last) return null;
  if (last.next_step?.trim()) return { code: null, line: last.next_step.trim() };
  const found = focusStep(last.tags, history?.codes ?? []);
  return found ? { code: found.code, line: found.line } : null;
}

/** The newest viva this code showed up in: a need or a strength. */
export function latestMark(marks: readonly PatternMark[]): PatternMark {
  for (let i = marks.length - 1; i >= 0; i -= 1) if (marks[i]) return marks[i]!;
  return null;
}

/** A short word on how a code has gone across the vivas, oldest to newest. */
export function trendFor(marks: readonly PatternMark[]): string {
  const n = marks.length;
  const needs = marks.filter((m) => m === 'need').length;
  const strengths = marks.filter((m) => m === 'strength').length;
  if (needs === 0) return strengths > 1 ? 'a strength' : 'a strength last time';
  if (n > 1 && needs === n) return 'every time';
  if (latestMark(marks) === 'strength') return 'a strength last time';
  const lastNeed = marks.lastIndexOf('need');
  const clear = n - 1 - lastNeed;
  if (clear >= 2) return `gone the last ${clear}`;
  if (clear === 1) return 'not last time';
  return needs === 1 ? 'new last time' : `${needs} of ${n}`;
}

function chip(code: FeedbackCode, positive: boolean): HTMLElement {
  const c = el('span', 'fc-chip', codeText(code, positive));
  c.style.setProperty('--fc-ink', codeInk(positive ? STRENGTH_COLOUR : code.colour));
  if (positive) c.classList.add('fc-chip--strength');
  return c;
}

function patternList(history: VivaHistory): HTMLElement | null {
  const n = history.pattern[0]?.marks.length ?? 0;
  if (n < 2 || !history.pattern.length) return null;
  const byId = new Map((history.codes ?? []).map((c) => [c.id, c]));
  const box = el('div', 'voice-last__pattern');
  box.append(el('p', 'voice-last__sub', `Across your last ${n} vivas, oldest to newest`));
  const list = el('ul', 'voice-last__rows');
  for (const row of history.pattern) {
    const code = byId.get(row.code_id);
    if (!code) continue;
    const strength = latestMark(row.marks) === 'strength';
    const item = el('li', 'voice-last__row');
    const dots = el('span', 'voice-last__dots');
    const hits = row.marks.filter(Boolean).length;
    dots.setAttribute('aria-label', `In ${hits} of ${n}`);
    for (const m of row.marks) dots.append(el('span', m ? `voice-last__dot voice-last__dot--${m}` : 'voice-last__dot'));
    const trend = trendFor(row.marks);
    item.append(chip(code, strength), el('span', 'voice-last__label', code.label), dots, el('span', `voice-last__trend${trend.startsWith('gone') || trend.startsWith('a strength') ? ' voice-last__trend--good' : ''}`, trend));
    list.append(item);
  }
  if (!list.childElementCount) return null;
  box.append(list);
  return box;
}

const OPEN_KEY = 'voice:last-time:open';
const readOpen = (): boolean => {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
};
const writeOpen = (open: boolean): void => {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    /* private window: the fold just starts closed */
  }
};

/** The folded card. Null when the student has no returned viva yet. */
export function lastTimeCard(history: VivaHistory | null, classId: string | undefined, id: string): HTMLElement | null {
  const last = history?.last;
  if (!history || !last) return null;
  const focus = lastFocus(history);
  const box = el('section', 'voice-last');
  const panelId = `voice-last-${id}`;
  const toggle = el('button', 'voice-last__toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', panelId);
  const head = el('span', 'voice-last__head');
  head.append(el('span', 'voice-last__title', 'Last time'));
  if (focus?.code) head.append(chip(focus.code, false));
  const peek = el('span', 'voice-last__peek', focus?.line ?? 'Your teacher’s feedback on your last viva');
  const word = el('span', 'voice-last__word');
  toggle.append(head, peek, word);

  const panel = el('div', 'voice-last__panel');
  panel.id = panelId;
  panel.append(el('p', 'voice-last__when', `From your viva on ${last.date} · ${last.title}`));
  if (focus) {
    const line = el('p', 'voice-last__focus');
    if (focus.code) line.append(chip(focus.code, false));
    line.append(el('span', undefined, focus.line));
    panel.append(line);
  }
  if (last.comment) {
    const say = el('p', 'voice-last__comment');
    say.append(el('b', undefined, 'Your teacher: '), `“${last.comment}”`);
    panel.append(say);
  }
  const pattern = patternList(history);
  if (pattern) panel.append(pattern);
  if (classId) panel.append(studentAnchor(`/s/classes/${encodeURIComponent(classId)}/profile`, 'voice-last__link', history.count > 1 ? `See all ${history.count} returned vivas` : 'See it in Returned work'));

  const set = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    peek.hidden = open;
    word.textContent = open ? 'Hide' : 'Show';
    box.classList.toggle('voice-last--open', open);
  };
  set(readOpen());
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    set(open);
    writeOpen(open);
  });
  box.append(toggle, panel);
  return box;
}

/** "This time I'll work on…" under the dot points: a tick the student owns, sent with their take. */
export function goalTick(line: string, ticked: boolean, onChange: (ticked: boolean) => void, id: string): HTMLElement {
  const wrap = el('label', 'voice-goal');
  const box = el('input', 'voice-goal__box');
  box.type = 'checkbox';
  box.id = `voice-goal-${id}`;
  box.checked = ticked;
  box.addEventListener('change', () => onChange(box.checked));
  const text = el('span', 'voice-goal__text');
  text.append(el('b', undefined, 'This time I’ll work on: '), line, el('span', 'voice-goal__hint block-secondary', ' Tick it and your teacher sees it when marking.'));
  wrap.append(box, text);
  return wrap;
}
