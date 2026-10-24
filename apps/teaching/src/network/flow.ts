/**
 * A unit's lesson flow: which lessons come after which. Each lesson may list
 * the lessons after it; a lesson that lists none follows the map's order, and
 * an empty list ends the unit there. More than one lesson after is a choice:
 * the map splits, Camden Town style, and the branches rejoin at the first
 * lesson they all reach. Pure: no DOM, unit tested directly.
 *
 * The rules, from the design:
 * - An option must say where it goes next when following the order would run
 *   it into another option of the same choice. Until then the map keeps the
 *   order (the option becomes a detour before the other one, which never
 *   tangles the branches) and the editor asks, with a suggestion.
 * - A link from one branch into the middle of another is refused: the
 *   branches would no longer be separate.
 * - Splits nest two deep at most.
 * - A link back to an earlier lesson (a loop) and a link to a lesson that is
 *   not in the unit are dropped.
 * - A lesson left off the map passes its links through: A → hidden → C is A → C.
 */

export type FlowLesson = { id: string; after?: readonly string[] };
export type FlowItem = { row: string } | { split: FlowSeq[] };
export type FlowSeq = FlowItem[];
export type FlowProblemKind = 'needs_next' | 'cross_link' | 'too_deep' | 'loop' | 'missing';
export type FlowProblem = { lessonId: string; kind: FlowProblemKind; message: string; suggestion?: string; target?: string; candidates?: string[] };
export type Flow = {
  seq: FlowSeq;
  /** What comes after each lesson, as drawn (suggestions filled in). */
  next: Map<string, string[]>;
  problems: FlowProblem[];
  /** Lessons in the order the map walks them: a branch at a time. */
  order: string[];
};

export const FLOW_MAX_DEPTH = 2;

/** The lessons that explicitly offer `id` as one option among several. */
function optionSiblings(lessons: readonly FlowLesson[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const lesson of lessons) {
    if (!lesson.after || lesson.after.length < 2) continue;
    for (const x of lesson.after) {
      const set = out.get(x) ?? new Set<string>();
      for (const y of lesson.after) if (y !== x) set.add(y);
      out.set(x, set);
    }
  }
  return out;
}

type Graph = { ids: string[]; out: Map<string, string[]>; inn: Map<string, string[]> };

function edges(lessons: readonly FlowLesson[], problems: FlowProblem[], titles?: (id: string) => string): Graph {
  const name = (id: string) => titles?.(id) ?? id;
  const ids = lessons.map((l) => l.id);
  const known = new Set(ids);
  const siblings = optionSiblings(lessons);
  const out = new Map<string, string[]>();
  lessons.forEach((lesson, i) => {
    if (lesson.after) {
      const missing = lesson.after.filter((x) => !known.has(x));
      if (missing.length) problems.push({ lessonId: lesson.id, kind: 'missing', message: `${name(lesson.id)} linked to a lesson that is no longer in this unit` });
      out.set(lesson.id, [...new Set(lesson.after.filter((x) => known.has(x) && x !== lesson.id))]);
      return;
    }
    const next = ids[i + 1];
    const sib = siblings.get(lesson.id);
    if (!next || !sib?.has(next)) {
      out.set(lesson.id, next ? [next] : []);
      return;
    }
    // Following the order runs one option into another. Keep the order for now and ask, suggesting
    // the first lesson past the options (or, with none, the other option: a detour that rejoins it).
    let j = i + 1;
    while (ids[j] && sib.has(ids[j]!)) j++;
    const candidates = [...new Set([ids[j], next].filter((x): x is string => Boolean(x)))];
    problems.push({ lessonId: lesson.id, kind: 'needs_next', suggestion: candidates[0]!, candidates, message: '' });
    out.set(lesson.id, [next]);
  });
  // Loops: a link back to a lesson still being walked is dropped.
  const state = new Map<string, 1 | 2>();
  const visit = (n: string) => {
    state.set(n, 1);
    out.set(n, out.get(n)!.filter((m) => {
      if (state.get(m) === 1) {
        problems.push({ lessonId: n, kind: 'loop', target: m, message: `${name(n)} can’t lead back to ${name(m)}, which comes before it` });
        return false;
      }
      if (!state.has(m)) visit(m);
      return true;
    }));
    state.set(n, 2);
  };
  ids.forEach((id) => { if (!state.has(id)) visit(id); });
  stitchStrays(ids, out, new Set(lessons.filter((l) => l.after?.length === 0).map((l) => l.id)));
  return { ids, out, inn: inbound(ids, out) };
}

/**
 * A lesson nothing leads into, past the first, is not a second start to the unit:
 * it slots in after the nearest earlier lesson in the order, ahead of whatever that
 * lesson led to. Without this one stray link splits the whole unit in two. A lesson
 * the teacher ended the unit on stays an end.
 */
function stitchStrays(ids: readonly string[], out: Map<string, string[]>, ends: ReadonlySet<string>): void {
  const reaches = (from: string, to: string): boolean => {
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length) {
      const n = stack.pop()!;
      if (n === to) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...(out.get(n) ?? []));
    }
    return false;
  };
  // Where the stray rejoins what came after `prev`, it takes that link's place; otherwise it goes
  // in between, and what `prev` led to is stitched in on the next pass. A choice is never undone.
  const place = (stray: string): boolean => {
    const at = ids.indexOf(stray);
    for (const prev of ids.slice(0, at).reverse()) {
      if (ends.has(prev) || reaches(stray, prev)) continue;
      const was = out.get(prev) ?? [];
      const rejoin = was.find((x) => reaches(stray, x));
      if (rejoin) out.set(prev, was.map((x) => (x === rejoin ? stray : x)));
      else if (was.length <= 1) {
        out.set(prev, [stray]);
        if (!(out.get(stray) ?? []).length) out.set(stray, was);
      } else continue;
      return true;
    }
    return false;
  };
  const left = new Set<string>();
  for (let guard = 0; guard < ids.length * 2; guard++) {
    const inn = inbound(ids, out);
    const stray = ids.slice(1).find((id) => !inn.get(id)!.length && !left.has(id));
    if (!stray) return;
    if (!place(stray)) left.add(stray);
  }
}

function inbound(ids: readonly string[], out: ReadonlyMap<string, string[]>): Map<string, string[]> {
  const inn = new Map(ids.map((id) => [id, [] as string[]]));
  for (const [from, list] of out) for (const to of list) inn.get(to)?.push(from);
  return inn;
}

/** A hidden lesson hands its links through to what it leads to. */
function passThrough(g: Graph, hidden: ReadonlySet<string>): Graph {
  const out = new Map(g.out);
  for (const h of g.ids.filter((id) => hidden.has(id))) {
    const ins = [...out.entries()].filter(([, v]) => v.includes(h)).map(([k]) => k);
    const outs = out.get(h) ?? [];
    for (const a of ins) out.set(a, [...new Set(out.get(a)!.flatMap((x) => (x === h ? outs : [x])))]);
    out.delete(h);
  }
  const ids = g.ids.filter((id) => !hidden.has(id));
  return { ids, out, inn: inbound(ids, out) };
}

function reachFrom(g: Graph): (n: string) => Set<string> {
  const memo = new Map<string, Set<string>>();
  const reach = (n: string): Set<string> => {
    const hit = memo.get(n);
    if (hit) return hit;
    const set = new Set([n]);
    memo.set(n, set);
    for (const m of g.out.get(n) ?? []) for (const x of reach(m)) set.add(x);
    return set;
  };
  return reach;
}

/** The first lesson every branch reaches, where a split rejoins; null when they never do. */
function joinOf(g: Graph, starts: readonly string[], reach: (n: string) => Set<string>): string | null {
  const sets = starts.map(reach);
  const common = g.ids.filter((id) => sets.every((s) => s.has(id)));
  return common.find((c) => common.every((d) => reach(c).has(d))) ?? null;
}

type Fault = { from: string; to: string; kind: 'cross_link' | 'too_deep' };

function walk(g: Graph, roots: readonly string[]): { seq: FlowSeq; order: string[]; fault?: Fault } {
  const reach = reachFrom(g);
  const order: string[] = [];
  const seen = new Set<string>();
  let fault: Fault | undefined;
  const run = (start: string, stop: string | null, depth: number, from: string | null): FlowSeq => {
    const seq: FlowSeq = [];
    let cur: string | null = start;
    let prev = from;
    while (cur && cur !== stop && !fault) {
      if (seen.has(cur)) {
        fault = { from: prev ?? cur, to: cur, kind: 'cross_link' };
        break;
      }
      seen.add(cur);
      order.push(cur);
      seq.push({ row: cur });
      const next: string[] = g.out.get(cur) ?? [];
      if (next.length === 0) break;
      if (next.length === 1) { prev = cur; cur = next[0]!; continue; }
      if (depth >= FLOW_MAX_DEPTH) {
        fault = { from: cur, to: next[1]!, kind: 'too_deep' };
        break;
      }
      const join = joinOf(g, next, reach);
      const here: string = cur;
      seq.push({ split: next.map((n) => (n === join ? [] : run(n, join, depth + 1, here))) });
      prev = cur;
      cur = join;
    }
    return seq;
  };
  let seq: FlowSeq;
  if (roots.length <= 1) seq = roots[0] ? run(roots[0], null, 0, null) : [];
  else {
    const join = joinOf(g, roots, reach);
    seq = [{ split: roots.map((r) => (r === join ? [] : run(r, join, 1, null))) }];
    if (join && !fault) seq.push(...run(join, null, 0, null));
  }
  return { seq, order, ...(fault ? { fault } : {}) };
}

export function buildFlow(
  lessons: readonly FlowLesson[],
  options: { hidden?: ReadonlySet<string>; title?: (id: string) => string; checkSuggestions?: boolean } = {}
): Flow {
  const flow = shapeFlow(lessons, options);
  const name = (id: string) => options.title?.(id) ?? id;
  // A suggestion must not break the map: try each candidate, falling back to the next.
  const breaks = (lessonId: string, to: string) => shapeFlow(lessons.map((l) => (l.id === lessonId ? { ...l, after: [to] } : l)), options).problems
    .some((p) => p.kind === 'cross_link' || p.kind === 'too_deep' || p.kind === 'loop');
  for (const p of flow.problems) {
    if (p.kind !== 'needs_next') continue;
    const pick = options.checkSuggestions === false ? p.candidates?.[0] : p.candidates?.find((c) => !breaks(p.lessonId, c)) ?? p.candidates?.at(-1);
    if (pick) p.suggestion = pick;
    delete p.candidates;
    p.message = `Choose what comes after ${name(p.lessonId)}${p.suggestion ? ` (suggested: ${name(p.suggestion)})` : ''}`;
  }
  return flow;
}

function shapeFlow(
  lessons: readonly FlowLesson[],
  options: { hidden?: ReadonlySet<string>; title?: (id: string) => string } = {}
): Flow {
  const name = (id: string) => options.title?.(id) ?? id;
  const problems: FlowProblem[] = [];
  let g = passThrough(edges(lessons, problems, options.title), options.hidden ?? new Set());
  // A link that breaks the shape is dropped and the walk runs again.
  for (let guard = 0; guard < 24; guard++) {
    const roots = g.ids.filter((id) => !g.inn.get(id)!.length);
    const { seq, order, fault } = walk(g, roots);
    if (!fault) {
      // Anything not reached (only possible after dropped links) follows on at the end.
      const rest = g.ids.filter((id) => !order.includes(id));
      for (const id of rest) { seq.push({ row: id }); order.push(id); }
      return { seq, next: g.out, problems, order };
    }
    problems.push(fault.kind === 'cross_link'
      ? { lessonId: fault.from, kind: 'cross_link', target: fault.to, message: `${name(fault.from)} can’t lead into ${name(fault.to)}: it is in another branch` }
      : { lessonId: fault.from, kind: 'too_deep', target: fault.to, message: `${name(fault.from)} can’t split again: splits go two deep at most` });
    const out = new Map(g.out);
    out.set(fault.from, out.get(fault.from)!.filter((x) => x !== fault.to));
    if (fault.kind === 'cross_link' && out.get(fault.from)!.length === g.out.get(fault.from)!.length) out.set(fault.from, []);
    g = { ids: g.ids, out, inn: inbound(g.ids, out) };
  }
  return { seq: g.ids.map((id) => ({ row: id })), next: g.out, problems, order: [...g.ids] };
}

/** Would giving `lessonId` these lessons after it break the flow? Returns the problem it would cause. */
export function linkProblem(lessons: readonly FlowLesson[], lessonId: string, after: readonly string[], hidden?: ReadonlySet<string>): FlowProblem | undefined {
  const before = shapeFlow(lessons, { ...(hidden ? { hidden } : {}) }).problems;
  const next = shapeFlow(lessons.map((l) => (l.id === lessonId ? { ...l, after } : l)), { ...(hidden ? { hidden } : {}) }).problems;
  const key = (p: FlowProblem) => `${p.kind}:${p.lessonId}:${p.target ?? ''}`;
  const had = new Set(before.map(key));
  return next.find((p) => (p.kind === 'cross_link' || p.kind === 'too_deep' || p.kind === 'loop') && !had.has(key(p)));
}

/** The lessons that come before `id`, as drawn. */
export function lessonsBefore(flow: Flow, id: string): string[] {
  return [...flow.next.entries()].filter(([, v]) => v.includes(id)).map(([k]) => k);
}

/**
 * Support, extension and optional lessons hang off a core lesson: the one the
 * teacher picked, else the nearest core lesson before them in the order. Each
 * sits straight after its core lesson (after any others hanging there), so the
 * map loops it out of that lesson and back to the next core one.
 */
export function hangSides(
  order: readonly string[],
  isSide: (id: string) => boolean,
  branchFrom: (id: string) => string | undefined
): { order: string[]; anchor: Map<string, string> } {
  const core = order.filter((id) => !isSide(id));
  const coreSet = new Set(core);
  const anchor = new Map<string, string>();
  const lead: string[] = [];
  let last: string | undefined;
  for (const id of order) {
    if (!isSide(id)) { last = id; continue; }
    const picked = branchFrom(id);
    const at = picked && coreSet.has(picked) ? picked : last;
    if (at) anchor.set(id, at);
    else lead.push(id);
  }
  const hung = new Map<string, string[]>();
  for (const id of order) {
    const at = anchor.get(id);
    if (at) hung.set(at, [...(hung.get(at) ?? []), id]);
  }
  return { order: [...lead, ...core.flatMap((id) => [id, ...(hung.get(id) ?? [])])], anchor };
}
