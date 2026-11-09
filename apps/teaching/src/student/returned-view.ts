/**
 * Returned work on the student progress page: the list of what the teacher has sent back,
 * and one piece opened with the teacher's highlights, comment and where it sits on each criterion.
 */
import { el } from '@/quiz/dom';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import { audioUrl } from '@/blocks/voice-client';
import { paper, type Mark } from '@/blocks/peer-annotate';
import { placeName, STEP_ORDER, RUNG_ORDER } from '@/progress/story-text';
import { codeChip } from '@/progress/code-grid';
import { focusBox, renderVoiceFeedback } from '@/blocks/voice-feedback-view';
import '@/blocks/voice.css';
import type { FeedbackCode } from '@/blocks/feedback-codes';
import type { MineState } from '@/blocks/voice-client';
import type { Place, ReturnedItem } from '@/progress/types';
import { returnedRubric, type ReturnedRubric } from './returned-rubric';
import { redraftEditor, type RedraftApi, type RedraftScope } from '@/student/redraft-editor';

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
    if (item.redraft) t.append(el('span', 'pg-returned__ask', item.redraft === 'asked' ? 'Redraft asked' : 'Sent to your teacher'));
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
  criteria: { label: string; step: Place | null; was: Place | null; first?: Place }[];
  /** This draft's number, and the earlier ones. Absent means there's only the first. */
  draft?: number;
  drafts?: { n: number; text: Record<string, Record<string, string>>; tags: PieceTag[]; comment: string; date: string }[];
  /** The teacher has asked for a rewrite of this much of it. */
  redraft?: { scope: RedraftScope };
  /** The student's redraft is with the teacher; this is the draft before it. */
  sent?: boolean;
  /** A viva's takes, each as the lesson's feedback view reads it. */
  takes?: Extract<MineState, { submitted: true }>[];
  /** The codes this piece used, and the student's rung on each skill, for its one focus. */
  codes?: FeedbackCode[];
  rungs?: Record<string, string | null>;
  /** Their skill rungs, the pieces they used and their next step, if the teacher marked with a rubric. */
  rubric?: ReturnedRubric;
};
/** A note the teacher wrote and returned: its own document, with no tags or criteria. */
export type NotePayload = { id: string; kind: 'note'; title: string; date: string; body_html: string; audio_url?: string | null; audio_deleted?: boolean };

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

/** A strength reads as one everywhere: sage, a "+" and the word. */
function tagCodeChip(tag: PieceTag): HTMLElement {
  return tag.positive ? codeChip(`Strength ${tag.code}+`, 'sage') : codeChip(tag.code, tag.colour);
}

function explain(tag: PieceTag): HTMLElement[] {
  const out: HTMLElement[] = [el('p', 'pg-pop__head')];
  out[0]!.append(tagCodeChip(tag), el('b', 'pg-pop__label', ` ${tag.label}`));
  out.push(el('p', 'pg-pop__action', tag.action));
  if (tag.note) out.push(el('p', 'pg-pop__note', tag.note));
  if (tag.resource) out.push(seeHow(tag.resource));
  return out;
}

function sideBoxes(p: PiecePayload, comment = p.comment): HTMLElement {
  const side = el('div', 'pg-piece__side');
  const rubric = returnedRubric(p.rubric);
  if (rubric) side.append(rubric);
  if (comment) {
    const c = el('div', 'pg-box');
    c.append(el('h3', 'pg-box__title', 'Your teacher’s comment'), el('p', 'pg-box__comment', comment));
    side.append(c);
  }
  if (p.criteria.length) {
    const c = el('div', 'pg-box');
    c.append(el('h3', 'pg-box__title', 'Where this piece sits'));
    for (const cr of p.criteria) {
      // Only a rise gets words; a step lower than last time says nothing.
      const moved = cr.first && cr.step && cr.first !== cr.step ? `${placeName(cr.first)}, then ${placeName(cr.step)} after redraft` : '';
      const delta = moved || (!cr.was || !cr.step ? '' : cr.was === cr.step ? 'same as last time' : rank(cr.was) < rank(cr.step) ? `up from ${placeName(cr.was)}` : '');
      const head = el('div', 'pg-box__row');
      head.append(el('b', undefined, cr.label), el('span', 'pg-box__delta', delta));
      c.append(head, ladder(cr.step, cr.was));
    }
    side.append(c);
  }
  return side;
}

/** A student's page passes these so an ask can be acted on; without them it's only a note, as a teacher sees it. */
export type PieceViewOptions = {
  redraft?: RedraftApi; onSent?: () => void;
  /** Inside the lesson block it came from: no way back, and the block already names it. */
  inline?: boolean;
};

export function pieceView(p: PiecePayload | NotePayload, onBack: () => void, o: PieceViewOptions = {}): HTMLElement {
  const root = el('section', `pg-piece${o.inline ? ' pg-piece--inline' : ''}`);
  if (!o.inline) {
    const back = el('button', 'pg-back', '← Returned work');
    back.type = 'button';
    back.addEventListener('click', onBack);
    root.append(back, el('h2', 'pg-piece__title', p.title), el('p', 'pm-key', `Returned ${p.date}`));
  }
  if ('body_html' in p) {
    const body = el('div', 'student-feedback__body');
    body.innerHTML = sanitizeRichTextHtml(p.body_html);
    root.append(body);
    if (p.audio_url) {
      const audio = el('audio', 'student-feedback__audio');
      audio.controls = true;
      audio.src = audioUrl(p.audio_url);
      root.append(audio);
    }
    if (p.audio_deleted) root.append(el('p', 'pm-key', 'Recordings are kept for 28 days, so this one has gone. The written note stays here.'));
    return root;
  }
  const takes = p.takes ?? [];
  // A next step the teacher chose stands alone, with no second one worked out from the codes.
  const chosen = p.rubric?.next_step || takes.some((t) => t.rubric?.next_step);
  const focus = chosen ? null : focusBox(takes.length ? takes.flatMap((t) => t.tags ?? []) : p.tags, p.codes ?? [], p.rungs);
  if (focus) root.append(focus);
  if (takes.length) {
    takes.forEach((take, i) => root.append(renderVoiceFeedback(take, { focus: false, title: take.prompt?.trim() || `Take ${i + 1}` })));
    root.append(sideBoxes(p));
    return root;
  }
  if (p.sent) root.append(el('p', 'pg-ask', 'Sent. Your teacher has it.'));
  else if (p.redraft) root.append(el('p', 'pg-ask', p.redraft.scope === 'whole' ? 'Your teacher asked for a redraft of this piece.' : 'Your teacher asked for a redraft of one section.'));
  const canRewrite = Boolean(p.redraft && o.redraft);
  const cols = el('div', 'pg-piece__cols');
  const left = el('div');
  const side = el('div');
  type View = 'write' | 'latest' | number;
  let view: View = canRewrite ? 'write' : 'latest';
  const earlier = [...(p.drafts ?? [])].reverse();
  const tabs: Array<[View, string]> = [
    ...(canRewrite ? [['write', 'Your redraft'] as [View, string]] : []),
    ...(earlier.length || canRewrite ? [['latest', `Draft ${p.draft ?? 1}`] as [View, string]] : []),
    ...earlier.map((d) => [d.n, `Draft ${d.n}`] as [View, string])
  ];
  // The editor keeps its words when the student flips to read their feedback.
  const editor = canRewrite ? redraftEditor(o.redraft!, () => o.onSent?.()) : null;
  const paint = (): void => {
    left.replaceChildren();
    if (tabs.length > 1) {
      const row = el('div', 'pg-drafts');
      for (const [to, label] of tabs) {
        const b = el('button', `pg-draft-pill${view === to ? ' is-on' : ''}`, label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(view === to));
        b.addEventListener('click', () => { view = to; paint(); });
        row.append(b);
      }
      left.append(row);
    }
    const past = typeof view === 'number' ? p.drafts?.find((d) => d.n === view) : null;
    side.replaceChildren(sideBoxes(p, past ? past.comment : p.comment));
    if (view === 'write' && editor) left.append(editor);
    else writingInto(left, past?.text ?? p.text, past?.tags ?? p.tags, past?.comment ?? p.comment);
  };
  paint();
  cols.append(left, side);
  root.append(cols);
  return root;
}

/** A draft's words with its highlights; tapping one explains it. A note has no typed text, so each tag is its own line. */
function writingInto(left: HTMLElement, text: PiecePayload['text'], tagged: PieceTag[], comment: string): void {
  const pop = el('div', 'pg-pop');
  pop.hidden = true;
  if (text) {
    for (const [part, fields] of Object.entries(text)) {
      for (const [field, words] of Object.entries(fields)) {
        const tags = tagged.filter((t) => t.part === part && t.field === field);
        const marks: Mark[] = tags.map((t, i) => ({ start: t.start, end: t.end, layer: i, colour: `var(--pastel-${t.positive ? 'sage' : t.colour}-ink)` }));
        const sheet = paper(words, marks, null);
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
    left.append(pop, el('p', 'pg-hint', tagged.some((t) => t.positive) ? 'Tap a highlight to see what it means. Green marks a strength.' : 'Tap a highlight to see what it means.'));
    return;
  }
  const list = el('ul', 'pg-viva');
  for (const tag of tagged) {
    const item = el('li', 'pg-box');
    if (tag.quote) item.append(el('p', 'pg-pop__note', `“${tag.quote}”`));
    item.append(...explain(tag));
    list.append(item);
  }
  if (tagged.length) left.append(list);
  else left.append(el('p', 'pm-empty', comment ? 'Your teacher left a comment on this one.' : 'Your teacher has marked this. There are no notes on it yet.'));
}
