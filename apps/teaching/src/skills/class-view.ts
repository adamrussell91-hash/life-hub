import { ApiClientError } from '@/api/client';
import { loadSkills } from './api';
import { loadClassRungs, type ClassSkillRungs } from './rungs-api';
import { RUNG_IDS, type SkillStrand, type SkillsContinuum } from './schema';
import './skills.css';

/**
 * The markbook's Skills view: for one sub-strand, which students sit on which
 * rung of the continuum, from the latest rung on their returned work. Speaking
 * opens first, since a Viva is where most of these rungs come from.
 */

type Student = { id: string; name: string; initials: string; removed?: boolean };
type Loaded = { continuum: SkillsContinuum; rungs: ClassSkillRungs };
export type ClassSkillsDeps = { continuum?: () => Promise<SkillsContinuum>; rungs?: (classId: string) => Promise<ClassSkillRungs> };
export type ClassSkills = { render: (students: readonly Student[], openStudent: (id: string) => void) => HTMLElement; reload: () => void };

const LADDER = ['excellent', 'accomplished', 'skilled', 'capable', 'below'] as const;
const NAMES: Record<(typeof LADDER)[number], string> = { excellent: 'Excellent', accomplished: 'Accomplished', skilled: 'Skilled', capable: 'Capable', below: 'Below Capable' };

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...children: Array<Node | string | null | false>): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const child of children) if (child) node.append(child);
  return node;
}

function button(cls: string, label: Node | string, onClick: () => void): HTMLButtonElement {
  const b = h('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** How many of the class sit on each rung of one skill, and who has nothing placed yet. */
export function classLadder(ref: string, students: readonly Student[], rungs: ClassSkillRungs): { by: Record<(typeof LADDER)[number], Student[]>; none: Student[] } {
  const byId = new Map(rungs.students.map((s) => [s.id, s.rungs]));
  const by = Object.fromEntries(LADDER.map((r) => [r, [] as Student[]])) as Record<(typeof LADDER)[number], Student[]>;
  const none: Student[] = [];
  for (const s of students) {
    if (s.removed) continue;
    const rung = byId.get(s.id)?.[ref];
    if (rung && (LADDER as readonly string[]).includes(rung)) by[rung as (typeof LADDER)[number]].push(s);
    else none.push(s);
  }
  return { by, none };
}

export function createClassSkills(classId: string, deps: ClassSkillsDeps = {}): ClassSkills {
  const state = { strand: 'speaking', sub: '' };
  let loaded: Loaded | null = null;
  let failed: string | null = null;
  let pending: Promise<void> | null = null;
  let host: HTMLElement | null = null;
  let last: { students: readonly Student[]; open: (id: string) => void } | null = null;

  const load = (): Promise<void> => {
    pending ??= Promise.all([(deps.continuum ?? loadSkills)(), (deps.rungs ?? loadClassRungs)(classId)]).then(
      ([continuum, rungs]) => { loaded = { continuum, rungs }; failed = null; },
      (e: unknown) => { failed = e instanceof ApiClientError ? e.message : 'The class’s skills didn’t load. Try again in a moment.'; pending = null; }
    ).then(() => { if (host?.isConnected && last) host.replaceChildren(...body(last.students, last.open)); });
    return pending;
  };

  function body(students: readonly Student[], open: (id: string) => void): Node[] {
    if (failed) return [h('p', 'skc__status', failed), button('btn btn--secondary', 'Try again', () => { failed = null; void load(); })];
    if (!loaded) return [h('p', 'skc__status', 'Loading where the class sits on the skills continuum…')];
    const { continuum, rungs } = loaded;
    const strand: SkillStrand = continuum.strands.find((s) => s.strand === state.strand) ?? continuum.strands[0]!;
    const sub = strand.sub_strands.find((s) => s.id === state.sub) ?? strand.sub_strands[0]!;
    state.strand = strand.strand;
    state.sub = sub.id;
    const repaint = (): void => { host?.replaceChildren(...body(students, open)); };

    const tabs = h('div', 'skl__strands');
    tabs.setAttribute('role', 'tablist');
    for (const s of continuum.strands) {
      const b = button('skl__strand', s.name, () => { state.strand = s.strand; state.sub = ''; repaint(); });
      b.setAttribute('role', 'tab');
      b.dataset.skillStrand = s.strand;
      b.setAttribute('aria-selected', String(s === strand));
      tabs.append(b);
    }
    const pills = h('div', 'hub-pills hub-pills--loose skl__subs');
    pills.setAttribute('role', 'group');
    pills.setAttribute('aria-label', 'Sub-strand');
    for (const s of strand.sub_strands) {
      const placed = classLadder(`${strand.strand}.${s.id}`, students, rungs);
      const count = students.filter((x) => !x.removed).length - placed.none.length;
      const b = button('hub-pills__btn', `${s.name} · ${count}`, () => { state.sub = s.id; repaint(); });
      b.dataset.skillSub = s.id;
      b.setAttribute('aria-pressed', String(s === sub));
      pills.append(b);
    }

    const ref = `${strand.strand}.${sub.id}`;
    const { by, none } = classLadder(ref, students, rungs);
    const total = students.filter((s) => !s.removed).length;
    const ladder = h('div', 'skc__ladder');
    ladder.setAttribute('aria-label', `${sub.name}: where the class sits`);
    LADDER.forEach((id, i) => {
      const who = by[id];
      const ican = id === 'below' ? 'Not yet at Capable.' : sub.rungs[id].i_can;
      const row = h('section', `skc__rung${who.length ? '' : ' is-empty'}`);
      row.dataset.rung = id;
      row.style.setProperty('--c', id === 'below' ? 'var(--line)' : `var(--skl-step${RUNG_IDS.length - i})`);
      const bar = h('span', 'skc__bar');
      bar.style.setProperty('--share', total ? String(who.length / total) : '0');
      row.append(...[
        h('div', 'skc__head', h('h4', 'skc__name', NAMES[id]), h('span', 'skc__count', `${who.length} ${who.length === 1 ? 'student' : 'students'}`), bar),
        h('p', 'skc__ican', ican),
        who.length ? h('ul', 'skc__who', ...who.map((s) => h('li', '', button('skc__student', h('span', '', h('b', '', s.initials), ` ${s.name}`), () => open(s.id))))) : null
      ].filter((n): n is HTMLElement => n !== null));
      ladder.append(row);
    });
    const unplaced = none.length
      ? h('details', 'skc__none', h('summary', '', `Not placed yet: ${none.length}`), h('p', 'skc__hint', 'No returned work tagged with this skill has a rung for them. Tag a task with it and pick a rung when you mark.'),
        h('ul', 'skc__who', ...none.map((s) => h('li', '', button('skc__student', h('span', '', h('b', '', s.initials), ` ${s.name}`), () => open(s.id))))))
      : null;
    return [
      tabs,
      h('p', 'skl__summary', 'Each student sits on the rung of their latest returned piece tagged with this skill. Open a student for their full path.'),
      pills,
      ladder,
      unplaced
    ].filter((n): n is HTMLElement => n !== null);
  }

  return {
    render(students, open) {
      last = { students, open };
      host = h('div', 'skl skc');
      host.dataset.view = 'class-skills';
      host.append(...body(students, open));
      if (!loaded && !failed) void load();
      return host;
    },
    reload() {
      loaded = null;
      pending = null;
      void load();
    }
  };
}
