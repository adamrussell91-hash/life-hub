import type { Evidence } from '@/evidence/types';
import type { CoverageMap } from './model';
import { drawCoverageMap, fitNameWidth, isSideRow, rowTag } from './draw';
import { studentRoute, type NodeState, type StudentRoute } from './student';

/** One class's evidence for the student view. */
export type ClassEvidence = {
  students: Array<{ id: string; name: string }>;
  evidence: Evidence[];
  /** Lesson id → student id → quiz score. */
  scores: Map<string, Map<string, { score: number; max: number }>>;
  took: Record<string, string[]>;
};

export type CoverageMapOptions = {
  map: CoverageMap;
  label: string;
  print?: boolean;
  /** Classes that teach this unit; with `loadClass`, the student view. */
  classes?: Array<{ id: string; name: string }>;
  loadClass?: (classId: string) => Promise<ClassEvidence>;
  saveTook?: (classId: string, studentId: string, lessonIds: string[]) => Promise<void>;
  /** "2026-10-27": rows dated after it are still ahead. */
  today?: string;
};

const DEPTH_WORD = ['', 'introduced', 'reinforced', 'mastered'];
const STATE_WORD: Record<NodeState, string> = {
  struggling: 'struggling',
  working: 'working on it',
  secure: 'secure',
  none: 'no evidence yet',
  skipped: 'skipped',
  ahead: 'not yet'
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The unit coverage map with its controls. Groups collapse and expand, a row
 * or an item can be picked, and (given classes) one student's evidence can be
 * laid over it. Returns `update` for a new map (the syllabus loads late).
 */
export function mountCoverageMap(host: HTMLElement, options: CoverageMapOptions): { update(map: CoverageMap): void } {
  let map = options.map;
  // Phones: a smaller name column, and groups start collapsed so the map fits.
  const narrowNow = () => window.matchMedia?.('(max-width: 599px)').matches ?? window.innerWidth < 600;
  const collapsed = new Set<string>(narrowNow() && !options.print ? map.groups.map((g) => g.id) : []);
  const known = new Set(map.groups.map((g) => g.id));
  let selected: string | null = null;
  let focus: string | null = null;
  let classId = '';
  let studentId = '';
  let data: ClassEvidence | null = null;
  let route: StudentRoute | null = null;
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  const root = el('div', 'cm');
  const bar = el('div', 'cm__bar');
  const toggleAll = el('button', 'cm__btn');
  toggleAll.type = 'button';
  const classPick = el('select', 'cm__select');
  classPick.setAttribute('aria-label', 'Class');
  const studentPick = el('select', 'cm__select');
  studentPick.setAttribute('aria-label', 'Student');
  const tookBtn = el('button', 'cm__btn');
  tookBtn.type = 'button';
  tookBtn.hidden = true;
  const note = el('p', 'cm__note');
  note.setAttribute('role', 'status');
  const scroller = el('div', 'cm__scroll');
  const stage = el('div', 'cm__stage');
  stage.setAttribute('role', 'group');
  stage.setAttribute('aria-label', options.label);
  scroller.append(stage);
  const legend = el('div', 'cm__legend');
  bar.append(toggleAll);
  if (options.classes?.length && options.loadClass && !options.print) {
    classPick.append(new Option('Whole unit', ''));
    for (const c of options.classes) classPick.append(new Option(c.name, c.id));
    studentPick.hidden = true;
    bar.append(classPick, studentPick, tookBtn);
  }
  root.append(bar, note, scroller, legend);
  host.append(root);

  const allItems = () => map.groups.flatMap((g) => g.items);

  const reroute = () => {
    if (!data || !studentId) {
      route = null;
      return;
    }
    const scores = new Map<string, { score: number; max: number }>();
    for (const [lessonId, by] of data.scores) {
      const s = by.get(studentId);
      if (s) scores.set(lessonId, s);
    }
    route = studentRoute(map, {
      evidence: data.evidence.filter((x) => x.student === studentId),
      took: data.took[studentId] ?? [],
      scores,
      today
    });
  };

  function summary(): string {
    const name = data?.students.find((s) => s.id === studentId)?.name;
    if (focus) {
      const item = allItems().find((i) => i.id === focus);
      const where = map.rows.filter((r) => r.teaches.has(focus!)).map((r) => r.title);
      return item ? `${item.label}: ${item.title}. Taught in ${where.length ? where.join(', ') : 'no lesson yet'}.` : '';
    }
    if (selected) {
      const row = map.rows.find((r) => r.id === selected);
      if (!row) return '';
      const tag = rowTag(row);
      const head = [row.title, row.date ? row.date.slice(0, 10) : '', tag ?? '', row.skip ?? ''].filter(Boolean).join(' · ');
      const parts = [...row.teaches].map(([id, depth]) => {
        const item = allItems().find((i) => i.id === id);
        const label = item?.label ?? id;
        if (route) return `${label} ${STATE_WORD[route.nodes.get(`${row.id}|${id}`) ?? 'none']}`;
        return `${label} ${DEPTH_WORD[depth]}`;
      });
      const took = route && isSideRow(row) ? (route.took.has(row.id) ? ` ${name} took this.` : ` ${name} didn’t take this.`) : '';
      return `${head}${parts.length ? `: ${parts.join(', ')}` : ''}.${took}`;
    }
    if (route && name) return `${name}: done lessons and quiz scores on the left, their state on each item on the right.`;
    return 'Tap a lesson to see what it builds, or an item to follow it. Tap a group name to collapse it.';
  }

  function paintLegend(): void {
    legend.replaceChildren();
    const add = (cls: string, text: string) => {
      const item = el('span', 'cm__key');
      item.append(el('span', `cm__swatch ${cls}`), document.createTextNode(text));
      legend.append(item);
    };
    if (route) {
      add('cm__swatch--struggling', 'Struggling');
      add('cm__swatch--working', 'Working on it');
      add('cm__swatch--secure', 'Secure');
      add('cm__swatch--mastered', 'Mastered here');
      add('cm__swatch--none', 'No evidence yet');
      add('cm__swatch--took', 'Support or extension taken');
    } else {
      add('cm__swatch--bar', 'Bar: core lessons; pale: support, extension or option only');
      add('cm__swatch--thin', `Taught in few core lessons`);
      add('cm__swatch--depth', 'Bigger node: deeper (introduced, reinforced, mastered)');
      add('cm__swatch--support', 'Support');
      add('cm__swatch--side', 'Extension or option');
    }
  }

  function paint(): void {
    const nameW = fitNameWidth(map, collapsed, options.print ? 900 : scroller.clientWidth || host.clientWidth || 700);
    const drawn = drawCoverageMap(map, { collapsed, selected, focus, student: route, nameW });
    stage.innerHTML = `<svg class="cm__svg" width="${drawn.width}" height="${drawn.height}" viewBox="0 0 ${drawn.width} ${drawn.height}" aria-hidden="false">${drawn.svg}</svg>`;
    toggleAll.textContent = collapsed.size === map.groups.length ? 'Expand all' : 'Collapse all';
    const row = selected ? map.rows.find((r) => r.id === selected) : undefined;
    note.replaceChildren(summary());
    if (row?.href && !options.print) {
      const open = el('a', 'cm__open', 'Open lesson');
      open.href = row.href;
      note.append(' ', open);
    }
    tookBtn.hidden = !(route && row && isSideRow(row) && options.saveTook);
    if (!tookBtn.hidden) tookBtn.textContent = route!.took.has(row!.id) ? 'Mark as not taken' : 'Mark as taken';
    paintLegend();
  }

  stage.addEventListener('click', (event) => {
    const target = (event.target as Element).closest('[data-row],[data-group],[data-item]');
    if (!target) return;
    const { row, group, item } = (target as HTMLElement | SVGElement).dataset;
    if (group) {
      if (collapsed.has(group)) collapsed.delete(group);
      else collapsed.add(group);
    } else if (item) {
      focus = focus === item ? null : item;
      selected = null;
    } else if (row) {
      selected = selected === row ? null : row;
      focus = null;
    }
    paint();
  });
  stage.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!(event.target as Element).closest('[data-row],[data-group],[data-item]')) return;
    event.preventDefault();
    (event.target as Element).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  toggleAll.addEventListener('click', () => {
    if (collapsed.size === map.groups.length) collapsed.clear();
    else for (const g of map.groups) collapsed.add(g.id);
    paint();
  });
  classPick.addEventListener('change', async () => {
    classId = classPick.value;
    studentId = '';
    data = null;
    route = null;
    studentPick.hidden = true;
    if (!classId || !options.loadClass) {
      paint();
      return;
    }
    note.textContent = 'Loading the class…';
    try {
      data = await options.loadClass(classId);
    } catch {
      note.textContent = 'Couldn’t load that class. Try again.';
      return;
    }
    studentPick.replaceChildren(new Option('Pick a student', ''));
    for (const s of data.students) studentPick.append(new Option(s.name, s.id));
    studentPick.hidden = false;
    paint();
  });
  studentPick.addEventListener('change', () => {
    studentId = studentPick.value;
    reroute();
    paint();
  });
  tookBtn.addEventListener('click', async () => {
    if (!data || !studentId || !selected || !options.saveTook) return;
    const list = new Set(data.took[studentId] ?? []);
    if (route?.took.has(selected) && list.has(selected)) list.delete(selected);
    else list.add(selected);
    const before = data.took[studentId];
    data.took[studentId] = [...list];
    reroute();
    paint();
    try {
      await options.saveTook(classId, studentId, [...list]);
    } catch {
      if (before) data.took[studentId] = before;
      else delete data.took[studentId];
      reroute();
      paint();
      note.textContent = 'Couldn’t save that. Try again.';
    }
  });

  paint();
  // Once on the page the real width is known; paint again when it changes.
  if (typeof ResizeObserver !== 'undefined' && !options.print) {
    let last = 0;
    new ResizeObserver(() => {
      const w = scroller.clientWidth;
      if (w && Math.abs(w - last) > 8) {
        last = w;
        paint();
      }
    }).observe(scroller);
  }
  return {
    update(next) {
      map = next;
      // New groups (the syllabus loads late) start collapsed on a phone; ones already opened stay open.
      for (const g of map.groups) {
        if (!known.has(g.id) && narrowNow() && !options.print) collapsed.add(g.id);
        known.add(g.id);
      }
      reroute();
      paint();
    }
  };
}

