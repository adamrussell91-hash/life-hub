import type { LessonRouteRole } from '@/schemas/block';
import { buildFlow, linkProblem, lessonsBefore, type FlowLesson } from './flow';
import { el, ghostButton } from './lines-editor';
import './network.css';

export type FlowPeer = { id: string; title: string; after?: readonly string[] };

export type LessonFlowOptions = {
  /** This lesson's id; its own links and route come through `update`. */
  lessonId: string;
  /** Every lesson in the unit, in unit order (this one included). */
  peers: readonly FlowPeer[];
  after: readonly string[] | undefined;
  /** Support or extension beside the core route on the unit map; unset is core. */
  role?: LessonRouteRole | undefined;
  skipRule?: string | undefined;
  /** Saves this lesson: `null` links mean "follow the unit order" again. */
  onSelf: (patch: { after_lesson_ids?: string[] | null; route_role?: LessonRouteRole | null; skip_rule?: string | null }) => void;
  /** Saves another lesson's links (for "before this lesson"). */
  onPeer: (lessonId: string, after: string[]) => Promise<void>;
  /** The classes that teach the unit, with this lesson's date in each (YYYY-MM-DD). */
  classes?: ReadonlyArray<{ id: string; name: string; date?: string }>;
  /** Dates this lesson for a class; resolves to the unit's lessons in their new order. */
  onDate?: (classId: string, date: string) => Promise<FlowPeer[]>;
};

const ROLE_LABEL: Record<LessonRouteRole, string> = { core: 'Core', support: 'Support', extension: 'Extension', optional: 'Optional' };
const SKIP_HINT: Record<Exclude<LessonRouteRole, 'core'>, string> = {
  support: 'Who can skip it, e.g. 90%+ on the pre-test',
  extension: 'Who takes it, e.g. 80%+ on the quiz',
  optional: 'Who it suits, e.g. anyone wanting more practice'
};

/**
 * "Before and after" at the foot of a lesson: what leads here, what comes
 * next, and where it sits on the unit route. More than one lesson after is a
 * choice; the unit map splits there and students choose their next step.
 */
export function mountLessonFlow(
  host: HTMLElement,
  options: LessonFlowOptions
): { update(after: readonly string[] | undefined, role?: LessonRouteRole, skipRule?: string): void; dispose(): void } {
  let peers = options.peers.map((p) => ({ ...p }));
  let after = options.after;
  let role = options.role;
  let skipRule = options.skipRule ?? '';
  let classes = (options.classes ?? []).map((c) => ({ ...c }));
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

    // Route: core, or a support or extension lesson beside it on the unit map.
    const route = el('div', 'lesson-flow__row');
    route.append(el('span', 'lesson-flow__label', 'Route'));
    const routeBody = el('div', 'lesson-flow__chips');
    const rolePills = el('div', 'lesson-flow__pills');
    rolePills.setAttribute('role', 'radiogroup');
    rolePills.setAttribute('aria-label', 'Place on the unit route');
    for (const r of ['core', 'support', 'extension', 'optional'] as const) {
      const on = (role ?? 'core') === r;
      const b = el('button', `lesson-flow__pill${on ? ' lesson-flow__pill--on' : ''}`, ROLE_LABEL[r]);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(on));
      b.addEventListener('click', () => {
        // Core is saved too, so it beats an old support or extension stop on the unit map.
        role = r;
        options.onSelf({ route_role: r });
        paint();
      });
      rolePills.append(b);
    }
    routeBody.append(rolePills);
    route.append(routeBody);
    if (role && role !== 'core') {
      const rule = el('input', 'lesson-flow__rule');
      rule.type = 'text';
      rule.maxLength = 80;
      rule.value = skipRule;
      rule.placeholder = SKIP_HINT[role];
      rule.setAttribute('aria-label', role === 'support' ? 'Who can skip this lesson' : role === 'optional' ? 'Who this lesson suits' : 'Who takes this lesson');
      rule.addEventListener('change', () => {
        skipRule = rule.value.trim();
        options.onSelf({ skip_rule: skipRule || null });
      });
      routeBody.append(rule);
    }

    // Date: when each class has this lesson. The unit map places dated lessons by date.
    const dateRow = el('div', 'lesson-flow__row');
    dateRow.append(el('span', 'lesson-flow__label', 'Date'));
    const dateList = el('div', 'lesson-flow__chips');
    if (!classes.length || !options.onDate) dateList.append(el('span', 'lesson-flow__hint', 'Add the unit to a class to date its lessons'));
    else {
      for (const c of classes) {
        const label = el('label', 'lesson-flow__date');
        if (classes.length > 1) label.append(el('span', undefined, c.name));
        const input = el('input', 'lesson-flow__date-input');
        input.type = 'date';
        input.value = c.date ?? '';
        input.setAttribute('aria-label', `Date for ${c.name}`);
        input.addEventListener('change', () => {
          const value = input.value;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value === c.date) return;
          input.disabled = true;
          options.onDate!(c.id, value).then(
            (nextPeers) => {
              classes = classes.map((x) => (x.id === c.id ? { ...x, date: value } : x));
              peers = nextPeers.map((p) => ({ ...p }));
              paint();
            },
            () => {
              input.disabled = false;
              input.value = c.date ?? '';
              window.alert('Could not save that date. Try again.');
            }
          );
        });
        label.append(input);
        dateList.append(label);
      }
      if (classes.every((c) => !c.date)) dateList.append(el('span', 'lesson-flow__hint', 'Not on the calendar yet'));
    }
    dateRow.append(dateList);

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

    root.append(route, dateRow, beforeRow, afterRow);
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
    update(nextAfter, nextRole, nextRule) {
      after = nextAfter;
      role = nextRole;
      skipRule = nextRule ?? '';
      paint();
    },
    dispose() {
      root.remove();
    }
  };
}
