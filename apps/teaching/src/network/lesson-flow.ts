import type { LessonKind } from '@/schemas/block';
import { buildFlow, linkProblem, lessonsBefore, type FlowLesson } from './flow';
import { el, ghostButton } from './lines-editor';
import './network.css';

export type FlowPeer = { id: string; title: string; after?: readonly string[] };

export type LessonFlowOptions = {
  /** This lesson's id; its own links and type come through `update`. */
  lessonId: string;
  /** Every lesson in the unit, in unit order (this one included). */
  peers: readonly FlowPeer[];
  after: readonly string[] | undefined;
  kind: LessonKind | undefined;
  /** Saves this lesson: `null` links mean "follow the unit order" again. */
  onSelf: (patch: { after_lesson_ids?: string[] | null; lesson_kind?: LessonKind }) => void;
  /** Saves another lesson's links (for "before this lesson"). */
  onPeer: (lessonId: string, after: string[]) => Promise<void>;
};

const KIND_LABEL: Record<LessonKind, string> = { lesson: 'Lesson', workshop: 'Workshop', lecture: 'Lecture' };

/**
 * "Before and after" at the foot of a lesson: what leads here, what comes
 * next, and what kind of session this is. More than one lesson after is a
 * choice; the unit map splits there and students choose their next step.
 */
export function mountLessonFlow(host: HTMLElement, options: LessonFlowOptions): { update(after: readonly string[] | undefined, kind: LessonKind | undefined): void; dispose(): void } {
  let peers = options.peers.map((p) => ({ ...p }));
  let after = options.after;
  let kind = options.kind;
  const self = options.lessonId;
  const root = el('section', 'lesson-flow');
  root.setAttribute('aria-label', 'Before and after this lesson');
  host.append(root);

  const lessons = (): FlowLesson[] => peers.map((p) => (p.id === self ? { id: p.id, ...(after ? { after } : {}) } : { id: p.id, ...(p.after ? { after: p.after } : {}) }));
  const title = (id: string) => peers.find((p) => p.id === id)?.title || 'Untitled lesson';
  const flow = () => buildFlow(lessons(), { title });

  const saveSelf = (next: string[] | null) => {
    after = next ?? undefined;
    options.onSelf({ after_lesson_ids: next });
    paint();
  };
  const savePeer = async (id: string, next: string[]) => {
    const before = peers;
    peers = peers.map((p) => (p.id === id ? { ...p, after: next } : p));
    paint();
    try {
      await options.onPeer(id, next);
    } catch {
      peers = before;
      paint();
      window.alert('Could not save that link. Try again.');
    }
  };

  /** A lesson picker; links that would break the map are listed but can't be picked. */
  const picker = (label: string, candidates: string[], problemFor: (id: string) => string | undefined, onPick: (id: string) => void) => {
    const select = el('select', 'lesson-flow__add');
    select.setAttribute('aria-label', label);
    const head = el('option', undefined, label);
    head.value = '';
    select.append(head);
    for (const id of candidates) {
      const problem = problemFor(id);
      const opt = el('option', undefined, problem ? `${title(id)} (${problem})` : title(id));
      opt.value = id;
      opt.disabled = Boolean(problem);
      select.append(opt);
    }
    select.disabled = !candidates.length;
    select.addEventListener('change', () => { if (select.value) onPick(select.value); });
    return select;
  };

  const chip = (id: string, onRemove: () => void, quiet = false) => {
    const wrap = el('span', `lesson-flow__chip${quiet ? ' lesson-flow__chip--quiet' : ''}`);
    wrap.append(el('span', undefined, title(id)));
    if (!quiet) {
      const x = el('button', 'lesson-flow__remove', '×');
      x.type = 'button';
      x.setAttribute('aria-label', `Remove ${title(id)}`);
      x.addEventListener('click', onRemove);
      wrap.append(x);
    }
    return wrap;
  };

  /** Why a link can't be made; a loop reads from this lesson's side of the link. */
  const shortReason = (kindOf: string, side: 'before' | 'after') =>
    kindOf === 'cross_link' ? 'another branch' : kindOf === 'too_deep' ? 'splits go two deep' : side === 'after' ? 'comes before' : 'comes after';

  function paint(): void {
    const f = flow();
    const next = f.next.get(self) ?? [];
    const into = lessonsBefore(f, self);
    root.replaceChildren(el('h3', 'lesson-flow__heading', 'Before and after'));

    // Type: pills, not a select.
    const kinds = el('div', 'lesson-flow__row');
    kinds.append(el('span', 'lesson-flow__label', 'This is a'));
    const pills = el('div', 'lesson-flow__pills');
    pills.setAttribute('role', 'radiogroup');
    pills.setAttribute('aria-label', 'Session type');
    for (const k of ['lesson', 'workshop', 'lecture'] as LessonKind[]) {
      const b = el('button', `lesson-flow__pill${(kind ?? 'lesson') === k ? ' lesson-flow__pill--on' : ''}`, KIND_LABEL[k]);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String((kind ?? 'lesson') === k));
      b.addEventListener('click', () => {
        kind = k;
        options.onSelf({ lesson_kind: k });
        paint();
      });
      pills.append(b);
    }
    kinds.append(pills);

    // Before: lessons that lead here. Adding one adds this lesson to its "after".
    const beforeRow = el('div', 'lesson-flow__row');
    beforeRow.append(el('span', 'lesson-flow__label', 'Before'));
    const beforeList = el('div', 'lesson-flow__chips');
    if (!into.length) beforeList.append(el('span', 'lesson-flow__hint', 'Nothing: the unit can start here'));
    for (const id of into) {
      beforeList.append(chip(id, () => void savePeer(id, (f.next.get(id) ?? []).filter((x) => x !== self))));
    }
    const beforeCandidates = peers.map((p) => p.id).filter((id) => id !== self && !into.includes(id));
    beforeList.append(picker('Add a lesson before…', beforeCandidates, (id) => {
      const p = linkProblem(lessons(), id, [...(f.next.get(id) ?? []), self]);
      return p ? shortReason(p.kind, 'before') : undefined;
    }, (id) => {
      if ((f.next.get(id) ?? []).length >= 6) return;
      void savePeer(id, [...(f.next.get(id) ?? []), self]);
    }));
    beforeRow.append(beforeList);

    // After: what comes next. More than one is a choice for students.
    const afterRow = el('div', 'lesson-flow__row');
    afterRow.append(el('span', 'lesson-flow__label', 'After'));
    const afterList = el('div', 'lesson-flow__chips');
    if (after === undefined) {
      for (const id of next) afterList.append(chip(id, () => {}, true));
      afterList.append(el('span', 'lesson-flow__hint', next.length ? 'Follows the unit order' : 'End of the unit'));
    } else {
      if (!after.length) afterList.append(el('span', 'lesson-flow__hint', 'The unit ends here'));
      for (const id of next) afterList.append(chip(id, () => saveSelf(next.filter((x) => x !== id))));
    }
    const afterCandidates = peers.map((p) => p.id).filter((id) => id !== self && !next.includes(id));
    if (next.length < 6) {
      afterList.append(picker(next.length ? 'Add another option…' : 'Add a lesson after…', afterCandidates, (id) => {
        const p = linkProblem(lessons(), self, [...next, id]);
        return p ? shortReason(p.kind, 'after') : undefined;
      }, (id) => saveSelf([...next, id])));
    }
    if (after !== undefined) afterList.append(ghostButton('Follow unit order', () => saveSelf(null)));
    afterRow.append(afterList);

    root.append(kinds, beforeRow, afterRow);
    if (next.length > 1) root.append(el('p', 'lesson-flow__note', `Students choose: ${next.map(title).join(', ')}. The unit map splits here.`));

    // This lesson's own problems, with a fix where there is one.
    for (const problem of f.problems.filter((p) => p.lessonId === self)) {
      const line = el('p', 'lesson-flow__problem', problem.message);
      line.setAttribute('role', 'status');
      if (problem.kind === 'needs_next' && problem.suggestion) {
        const use = ghostButton(`Use ${title(problem.suggestion)}`, () => saveSelf([problem.suggestion!]));
        line.append(' ', use);
      }
      root.append(line);
    }
  }

  paint();
  return {
    update(nextAfter, nextKind) {
      after = nextAfter;
      kind = nextKind;
      paint();
    },
    dispose() {
      root.remove();
    }
  };
}
