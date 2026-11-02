/**
 * Returned work on the student progress page: the list of what the teacher has sent back,
 * and one piece opened with the teacher's highlights, comment and where it sits on each criterion.
 */
import { el } from '@/quiz/dom';
import { paper, type Mark } from '@/blocks/peer-annotate';
import { placeName, STEP_ORDER, RUNG_ORDER } from '@/progress/story-text';
import { codeChip } from '@/progress/code-grid';
import { focusBox, renderVoiceFeedback } from '@/blocks/voice-feedback-view';
import '@/blocks/voice.css';
import type { FeedbackCode } from '@/blocks/feedback-codes';
import type { MineState } from '@/blocks/voice-client';
import type { Place, ReturnedItem } from '@/progress/types';

const TAG: Record<ReturnedItem['kind'], string> = { written: 'Writing', viva: 'Viva', quiz: 'Quiz', answer: 'Answer', note: 'Note' };

export function returnedList(items: ReturnedItem[], onOpen: (id: string, wasNew: boolean) => void): HTMLElement {
  const box = el('section', 'pg-returned');
  if (!items.length) {
    box.append(el('p', 'pm-empty', 'Feedback from your teacher appears here once it is returned.'));
    return box;
  }
  for (const item of items) {
    const card = el('button', `pg-returned__card${item.new ? ' is-new' : ''}`);
    card.type = 'button';
    card.append(el('span', `pg-returned__tag is-${item.kind}`, TAG[item.kind]));
    const t = el('span', 'pg-returned__title', item.title);
    if (item.new) t.append(el('span', 'pg-returned__new', 'New'));
    card.append(t, el('span', 'pg-returned__meta', `Returned ${item.date}`), el('span', 'pg-returned__chev', '›'));
    card.addEventListener('click', () => onOpen(item.id, Boolean(item.new)));
    box.append(card);
  }
  return box;
}

type Resource = { url: string; kind: string; title?: string; start?: number };
export type PieceTag = { code_id: string; part: string; field: string; start: number; end: number; positive: boolean; code: string; label: string; colour: string; action: string; note?: string; quote?: string; resource?: Resource };
export type PiecePayload = {
  id: string; kind: string; title: string; date: string; comment: string;
  text: Record<string, Record<string, string>> | null;
  tags: PieceTag[];
  criteria: { label: string; step: Place | null; was: Place | null }[];
  /** A viva's takes, each as the lesson's feedback view reads it. */
  takes?: Extract<MineState, { submitted: true }>[];
  /** The codes this piece used, and the student's rung on each skill, for its one focus. */
  codes?: FeedbackCode[];
  rungs?: Record<string, string | null>;
};

const ladderOf = (p: Place | null): Place[] => (p && RUNG_ORDER.includes(p) ? RUNG_ORDER.slice(1) : STEP_ORDER);
const rank = (p: Place): number => ladderOf(p).indexOf(p);

function ladder(step: Place | null, was: Place | null): HTMLElement {
  const row = el('div', 'pg-ladder');
  for (const s of ladderOf(step)) row.append(el('span', `pg-ladder__step${s === step ? ' is-on' : ''}${s === was && was !== step ? ' is-was' : ''}`, placeName(s)));
  return row;
}

function seeHow(r: Resource): HTMLElement {
  const a = el('a', 'pg-seehow', 'See how →');
  a.href = r.kind === 'video' && r.start ? `${r.url}${r.url.includes('?') ? '&' : '?'}t=${r.start}` : r.url;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

function explain(tag: PieceTag): HTMLElement[] {
  const out: HTMLElement[] = [el('p', 'pg-pop__head')];
  out[0]!.append(codeChip(tag.code, tag.colour), el('b', 'pg-pop__label', ` ${tag.label}`));
  out.push(el('p', 'pg-pop__action', tag.action));
  if (tag.note) out.push(el('p', 'pg-pop__note', tag.note));
  if (tag.resource) out.push(seeHow(tag.resource));
  return out;
}

function sideBoxes(p: PiecePayload): HTMLElement {
  const side = el('div', 'pg-piece__side');
  if (p.comment) {
    const c = el('div', 'pg-box');
    c.append(el('h3', 'pg-box__title', 'Your teacher’s comment'), el('p', 'pg-box__comment', p.comment));
    side.append(c);
  }
  if (p.criteria.length) {
    const c = el('div', 'pg-box');
    c.append(el('h3', 'pg-box__title', 'Where this piece sits'));
    for (const cr of p.criteria) {
      // Only a rise gets words; a step lower than last time says nothing.
      const delta = !cr.was || !cr.step ? '' : cr.was === cr.step ? 'same as last time' : rank(cr.was) < rank(cr.step) ? `up from ${placeName(cr.was)}` : '';
      const head = el('div', 'pg-box__row');
      head.append(el('b', undefined, cr.label), el('span', 'pg-box__delta', delta));
      c.append(head, ladder(cr.step, cr.was));
    }
    side.append(c);
  }
  return side;
}

export function pieceView(p: PiecePayload, onBack: () => void): HTMLElement {
  const root = el('section', 'pg-piece');
  const back = el('button', 'pg-back', '← Your progress');
  back.type = 'button';
  back.addEventListener('click', onBack);
  root.append(back, el('h2', 'pg-piece__title', p.title), el('p', 'pm-key', `Returned ${p.date}`));
  const takes = p.takes ?? [];
  const focus = focusBox(takes.length ? takes.flatMap((t) => t.tags ?? []) : p.tags, p.codes ?? [], p.rungs);
  if (focus) root.append(focus);
  if (takes.length) {
    takes.forEach((take, i) => root.append(renderVoiceFeedback(take, { focus: false, title: take.prompt?.trim() || `Take ${i + 1}` })));
    root.append(sideBoxes(p));
    return root;
  }
  const cols = el('div', 'pg-piece__cols');
  const left = el('div');
  const pop = el('div', 'pg-pop');
  pop.hidden = true;
  if (p.text) {
    for (const [part, fields] of Object.entries(p.text)) {
      for (const [field, text] of Object.entries(fields)) {
        const tags = p.tags.filter((t) => t.part === part && t.field === field);
        const marks: Mark[] = tags.map((t, i) => ({ start: t.start, end: t.end, layer: i, colour: `var(--pastel-${t.colour}-ink)` }));
        const sheet = paper(text, marks, null);
        sheet.addEventListener('click', (e) => {
          const run = (e.target as HTMLElement).closest<HTMLElement>('.pa-run--mark');
          if (!run) return;
          const at = Number(run.dataset.start);
          const tag = tags.find((t) => t.start <= at && t.end > at);
          if (!tag) return;
          pop.replaceChildren(...explain(tag));
          pop.hidden = false;
        });
        left.append(sheet);
      }
    }
    left.append(pop, el('p', 'pg-hint', 'Tap a highlight to see what it means.'));
  } else {
    // A note has no typed text: each tag is a line of its own.
    const list = el('ul', 'pg-viva');
    for (const tag of p.tags) {
      const item = el('li', 'pg-box');
      if (tag.quote) item.append(el('p', 'pg-pop__note', `“${tag.quote}”`));
      item.append(...explain(tag));
      list.append(item);
    }
    if (p.tags.length) left.append(list);
    else left.append(el('p', 'pm-empty', p.comment ? 'Your teacher left a comment on this one.' : 'Your teacher has marked this. There are no notes on it yet.'));
  }
  cols.append(left, sideBoxes(p));
  root.append(cols);
  return root;
}
