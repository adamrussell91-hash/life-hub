import type { Block } from '@/schemas/block';
import { renderBlock } from '@/blocks/render';
import type { studentUnitAnthology } from '@/blocks/anthology-load';
import { el } from '@/quiz/dom';
import type { SprintStatus } from './api';
import type { LimitBox, PublicSprint, SprintPhaseKey } from './schema';

/** What each row means, behind its small "i". */
export const SHEET_INFO = {
  challenge: 'The problem your teacher set for the whole class.',
  must: 'Things every prototype has to have. Your teacher checks for these at the pitch.',
  stretch: 'An extra push if your group wants one. It’s optional.',
  problem: 'The exact problem your group chose to solve in Understand.',
  audience: 'Who your prototype is for, and why it matters to them.',
  limits: 'What boxes your group in. Have: tools and things you can use. Work around: facts you can’t change. Find out: things you still need to learn. Ask the expert: questions you sent your teacher.',
  idea: 'The idea your group chose in Decide. Everything you build from here is part of it.',
  parts: 'The pieces of your prototype and who is making each one.',
  assembler: 'One person collects everyone’s parts in Prototype and uploads the finished prototype for the pitch. They still do their own part.',
  pitch: 'The finished prototype your group shows at the pitch.'
} as const;

/** The four limits boxes, in the sheet's plain words. */
export const SHEET_LIMITS: Array<[LimitBox, string]> = [['can_known', 'Have'], ['cant_known', 'Work around'], ['can_unknown', 'Find out'], ['cant_unknown', 'Ask the expert']];

export type GroupSheetOptions = {
  sprint: PublicSprint;
  /** The teacher's brief blocks: they become the Challenge row. */
  challenge: Block[];
  lessonId?: string;
  pageBlocks?: Block[];
  /** Lets an Anthology block in the challenge read the unit's published notes. */
  loadAnthology?: () => ReturnType<typeof studentUnitAnthology>;
  /** Where the fold state is kept between visits. */
  storeKey?: string;
};

const readOpen = (key: string | undefined): boolean => {
  if (!key) return true;
  try { return window.localStorage.getItem(key) !== 'closed'; } catch { return true; }
};
const writeOpen = (key: string | undefined, open: boolean): void => {
  if (!key) return;
  try { window.localStorage.setItem(key, open ? 'open' : 'closed'); } catch { /* Private windows: the fold just isn't remembered. */ }
};

/** A heading that only says "The challenge" or "The brief" adds nothing under a Challenge label. */
const isLabelHeading = (b: Block): boolean => {
  if (b.block_type !== 'heading') return false;
  const text = String((b.content as { text?: unknown }).text ?? '').replace(/<[^>]*>/g, '').trim();
  return /^(the\s+)?(design\s+)?(challenge|brief)[:.]?$/i.test(text);
};

/**
 * The one group sheet at the top of every phase: what the class was set and
 * what the group has decided so far, as plain label and value rows. A row is
 * there only once it has something in it. It folds away, and remembers that.
 * `update` repaints only when what the sheet shows has changed, so polling
 * never closes a fold the student has opened.
 */
export function createGroupSheet(opts: GroupSheetOptions): { el: HTMLElement; update(s: SprintStatus, phase: SprintPhaseKey): void } {
  const card = el('details', 'sprint-sheet');
  card.open = readOpen(opts.storeKey);
  const summary = el('summary', 'sprint-sheet__summary');
  summary.append(el('span', 'sprint-sheet__name', 'Our group sheet'), el('span', 'sprint-sheet__hint', 'Fills in as you go'));
  const list = el('dl', 'sprint-sheet__rows');
  card.append(summary, list);
  card.addEventListener('toggle', () => writeOpen(opts.storeKey, card.open));

  // The teacher's brief is rendered once; repaints move the same nodes.
  const blocks = opts.challenge.filter((b, i) => !(i === 0 && opts.challenge.length > 1 && isLabelHeading(b)));
  const challenge = el('div', 'sprint-sheet__challenge');
  for (const b of blocks) challenge.append(renderBlock(b, 'student', { lessonId: opts.lessonId, pageBlocks: opts.pageBlocks ?? opts.challenge, loadAnthology: opts.loadAnthology }));
  let expertOpen = false;
  let sig = '';

  const row = (key: keyof typeof SHEET_INFO, label: string, value: Node | string): HTMLElement => {
    const r = el('div', `sprint-sheet__row sprint-sheet__row--${key}`);
    const dt = el('dt', 'sprint-sheet__label');
    dt.append(el('span', '', label));
    const meaning = el('p', 'sprint-sheet__meaning', SHEET_INFO[key]);
    meaning.id = `sheet-${key}-${Math.random().toString(36).slice(2, 8)}`;
    meaning.hidden = true;
    const info = el('button', 'sprint-info', 'i');
    info.type = 'button';
    info.setAttribute('aria-label', `What ${label} means`);
    info.setAttribute('aria-expanded', 'false');
    info.setAttribute('aria-controls', meaning.id);
    info.addEventListener('click', (e) => {
      e.preventDefault();
      meaning.hidden = !meaning.hidden;
      info.setAttribute('aria-expanded', String(!meaning.hidden));
    });
    dt.append(info);
    const dd = el('dd', 'sprint-sheet__value');
    dd.append(meaning, value);
    r.append(dt, dd);
    return r;
  };
  const plain = (text: string) => el('span', '', text);

  function paint(s: SprintStatus, phase: SprintPhaseKey): void {
    const rows: HTMLElement[] = [];
    if (blocks.length) rows.push(row('challenge', 'Challenge', challenge));
    const reqs = opts.sprint.requirements.filter((r) => r.phases.includes(phase));
    if (reqs.length) {
      const ul = el('ul', 'sprint-sheet__list');
      for (const r of reqs) ul.append(el('li', '', r.text));
      rows.push(row('must', 'Must include', ul));
    }
    const stretch = opts.sprint.phases.find((p) => p.key === phase)?.stretch?.trim();
    if (stretch) rows.push(row('stretch', 'Stretch', plain(`${stretch} (optional)`)));
    const b = s.brief;
    const problem = b?.problem ?? s.question?.text ?? '';
    if (problem) rows.push(row('problem', 'Problem', plain(problem)));
    if (b?.audience?.who) rows.push(row('audience', 'Audience', plain(`${b.audience.who}${b.audience.why ? `. ${b.audience.why}` : ''}`)));
    const lim = b?.limits ?? {};
    const lines = SHEET_LIMITS.map(([k, name]) => [name, (lim[k] ?? []).map((c) => c.text)] as const).filter(([, l]) => l.length);
    const answers = b?.answers ?? [];
    if (lines.length || answers.length) {
      const wrap = el('div');
      if (lines.length) {
        const grid = el('div', 'sprint-sheet__limits');
        for (const [name, l] of lines) { const d = el('div'); d.append(el('b', '', `${name}:`), ` ${l.join(', ')}`); grid.append(d); }
        wrap.append(grid);
      }
      if (answers.length) {
        const fold = el('details', 'sprint-sheet__expert');
        fold.open = expertOpen;
        fold.addEventListener('toggle', () => { expertOpen = fold.open; });
        fold.append(el('summary', '', `What the expert said (${answers.length})`));
        for (const a of answers) { const qa = el('div', 'sprint-sheet__qa'); qa.append(el('b', '', a.question), el('span', '', a.answer)); fold.append(qa); }
        wrap.append(fold);
      }
      rows.push(row('limits', 'Limits', wrap));
    }
    if (s.chosen) {
      const v = el('span');
      v.append(el('strong', '', s.chosen.title), s.chosen.idea ? ` ${s.chosen.idea}` : '');
      rows.push(row('idea', 'Our idea', v));
    }
    // Parts join the sheet once the group has planned them; in Decide that is once the plan is in.
    const planned = phase !== 'decide' || s.phases?.find((p) => p.key === 'decide')?.state === 'in';
    const parts = s.parts ?? [];
    if (planned && parts.length) {
      const names = new Map((s.members ?? []).map((m) => [m.key, m.me && !/^you$/i.test(m.initials) ? `${m.initials} (you)` : m.initials]));
      const ul = el('ul', 'sprint-sheet__list');
      for (const p of parts) {
        const who = (p.assigned ?? []).map((k) => names.get(k) ?? '').filter(Boolean);
        const li = el('li', p.mine ? 'is-mine' : '');
        li.append(el('b', '', p.text), ` · ${who.length ? who.join(', ') : 'no one yet'}`);
        ul.append(li);
      }
      rows.push(row('parts', 'Parts and who', ul));
    }
    if (planned && s.assembler) rows.push(row('assembler', 'Puts it together', plain(s.assembler.me ? `${s.assembler.initials} (you)` : s.assembler.initials)));
    if (s.pitch) {
      if (s.pitch.kind === 'link' && s.pitch.link) {
        const a = el('a', '', s.pitch.link);
        a.href = s.pitch.link;
        a.target = '_blank';
        a.rel = 'noopener';
        rows.push(row('pitch', 'Prototype', a));
      } else rows.push(row('pitch', 'Prototype', plain(s.pitch.name || 'The finished file is in.')));
    }
    list.replaceChildren(...rows);
    card.hidden = !rows.length;
  }

  return {
    el: card,
    update(s, phase) {
      const next = JSON.stringify([phase, s.brief ?? null, s.question?.text ?? '', s.chosen ?? null, s.parts ?? [], s.members ?? [], s.assembler ?? null, s.pitch ?? null, s.phases?.find((p) => p.key === 'decide')?.state ?? '']);
      if (next === sig) return;
      sig = next;
      paint(s, phase);
    }
  };
}
