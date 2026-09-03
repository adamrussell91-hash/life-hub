import { apiGet } from '@/api/client';
import { navigate } from '@/app/router';
import type { PedagogicalMode } from '@/curriculum/pedagogical-mode';
import type { Year, Subject, Unit, Class, ScheduledLesson, ScopeSequence, Media, CurriculumOutcome } from '@/schemas';

export interface CurriculumLessonSummary {
  id: string;
  title: string;
  slug: string;
  unit_id: string;
  sequence: number;
  status: string;
  published: boolean;
  updated_at: string;
  published_at?: string;
  created_at?: string;
  tags?: string[];
  author_id?: string;
  author_name?: string;
  review_status?: 'needs_review' | 'none';
  syllabus_outcomes?: string[];
  outcome_ids?: string[];
  excerpt?: string;
  attachment_count?: number;
  pedagogical_mode?: PedagogicalMode;
}

export interface CurriculumResponse {
  years: Year[];
  subjects: Subject[];
  units: Unit[];
  lessons: CurriculumLessonSummary[];
  classes: Class[];
  scheduled_lessons: ScheduledLesson[];
  scope_sequences: ScopeSequence[];
  media: Media[];
  outcomes?: CurriculumOutcome[];
  schedule_anchor_date: string; // YYYY-MM-DD — demo override (tests / VITE_SCHEDULE_ANCHOR_DATE)
}

export function fetchCurriculum(): Promise<CurriculumResponse> {
  return apiGet<CurriculumResponse>('/api/curriculum');
}

const NAV_STORAGE_KEY = 'teaching-hub.nav';

function yearNodeId(id: string): string {
  return `year:${id}`;
}

function subjectNodeId(id: string): string {
  return `subject:${id}`;
}

function unitNodeId(id: string): string {
  return `unit:${id}`;
}

function readExpandedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(NAV_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function writeExpandedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage may be unavailable (private mode, quota); expand state is
    // a convenience, not critical, so failures are silently ignored.
  }
}

export interface ClassesNavOptions {
  activeClassId?: string;
  onCreateClass?: () => void;
}

/**
 * Renders the flat "Your classes" list into `container`.
 * Class rows navigate to `/classes/:id` without expanding a curriculum tree.
 */
export function renderClassesNav(
  container: HTMLElement,
  curriculum: CurriculumResponse,
  options: ClassesNavOptions = {}
): void {
  container.replaceChildren();

  const label = document.createElement('p');
  label.className = 'rail-classes__label';
  label.textContent = 'Your classes';
  container.append(label);

  const list = document.createElement('div');
  list.className = 'rail-classes';
  for (const cls of [...curriculum.classes]
    .filter((entry) => entry.status === 'active')
    .sort((a, b) => a.code.localeCompare(b.code))) {
    const link = document.createElement('a');
    link.className = 'nav-item rail-classes__item';
    const path = `/classes/${cls.id}`;
    link.href = path;
    link.textContent = cls.code || cls.title;
    if (cls.id === options.activeClassId) {
      link.classList.add('nav-item--selected');
    }
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(path);
    });
    list.append(link);
  }
  container.append(list);

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'icon-plus-btn rail-classes__new';
  add.setAttribute('aria-label', 'New class');
  add.textContent = '+';
  add.addEventListener('click', () => options.onCreateClass?.());
  container.append(add);
}

export interface CurriculumNavOptions {
  /** Lesson ID for the current route, used to highlight and auto-expand its ancestors. */
  activeLessonId?: string;
}

/**
 * Renders the Year → Subject → Unit → Lesson tree into `container`.
 * Expand/collapse state persists to `localStorage` under `teaching-hub.nav`.
 * Kept for tests / alternate surfaces; the teacher rail uses {@link renderClassesNav}.
 */
export function renderCurriculumNav(
  container: HTMLElement,
  curriculum: CurriculumResponse,
  options: CurriculumNavOptions = {}
): void {
  container.replaceChildren();

  const subjectsById = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
  const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit]));

  const lessonsByUnit = new Map<string, CurriculumLessonSummary[]>();
  for (const lesson of curriculum.lessons) {
    const list = lessonsByUnit.get(lesson.unit_id) ?? [];
    list.push(lesson);
    lessonsByUnit.set(lesson.unit_id, list);
  }
  for (const list of lessonsByUnit.values()) {
    list.sort((a, b) => a.sequence - b.sequence);
  }

  const activeAncestorIds = new Set<string>();
  if (options.activeLessonId) {
    const lesson = curriculum.lessons.find((candidate) => candidate.id === options.activeLessonId);
    const unit = lesson ? unitsById.get(lesson.unit_id) : undefined;
    const subject = unit ? subjectsById.get(unit.subject_id) : undefined;
    if (unit) activeAncestorIds.add(unitNodeId(unit.id));
    if (subject) {
      activeAncestorIds.add(subjectNodeId(subject.id));
    }
    if (unit) {
      activeAncestorIds.add(yearNodeId(unit.year_id));
    }
  }

  const expanded = readExpandedIds();

  function isExpanded(nodeId: string): boolean {
    return expanded.has(nodeId) || activeAncestorIds.has(nodeId);
  }

  function toggle(nodeId: string): void {
    if (expanded.has(nodeId)) {
      expanded.delete(nodeId);
    } else {
      expanded.add(nodeId);
    }
    writeExpandedIds(expanded);
    renderCurriculumNav(container, curriculum, options);
  }

  function createToggleButton(
    label: string,
    nodeId: string,
    nestedModifier: '' | 'nested' | 'nested-2'
  ): HTMLButtonElement {
    const expandedNow = isExpanded(nodeId);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-item nav-item--toggle';
    if (nestedModifier) button.classList.add(`nav-item--${nestedModifier}`);
    button.setAttribute('aria-expanded', String(expandedNow));

    const caret = document.createElement('span');
    caret.className = 'nav-item__caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = expandedNow ? '▾' : '▸';

    const text = document.createElement('span');
    text.className = 'nav-item__label';
    text.textContent = label;

    button.append(caret, text);
    button.addEventListener('click', () => toggle(nodeId));
    return button;
  }

  function renderLessonLeaf(lesson: CurriculumLessonSummary): HTMLAnchorElement {
    const link = document.createElement('a');
    link.className = 'nav-item nav-item--nested-3';
    if (lesson.id === options.activeLessonId) {
      link.classList.add('nav-item--selected');
    }
    const path = `/lessons/${lesson.id}`;
    link.href = path;
    link.textContent = lesson.title;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(path);
    });
    return link;
  }

  function renderUnitNode(unit: Unit): HTMLElement {
    const nodeId = unitNodeId(unit.id);
    const wrapper = document.createElement('div');
    wrapper.className = 'curriculum-nav__node';
    wrapper.append(createToggleButton(unit.title, nodeId, 'nested-2'));

    if (isExpanded(nodeId)) {
      const lessons = (lessonsByUnit.get(unit.id) ?? []).filter(
        (lesson) => lesson.status === 'active'
      );
      const children = document.createElement('div');
      children.className = 'curriculum-nav__children';
      for (const lesson of lessons) {
        children.append(renderLessonLeaf(lesson));
      }
      wrapper.append(children);
    }

    return wrapper;
  }

  function renderSubjectNode(subject: Subject): HTMLElement {
    const nodeId = subjectNodeId(subject.id);
    const wrapper = document.createElement('div');
    wrapper.className = 'curriculum-nav__node';
    wrapper.append(createToggleButton(subject.title, nodeId, 'nested'));

    if (isExpanded(nodeId)) {
      const children = document.createElement('div');
      children.className = 'curriculum-nav__children';
      for (const unitId of subject.unit_ids) {
        const unit = unitsById.get(unitId);
        if (unit && unit.status === 'active') children.append(renderUnitNode(unit));
      }
      wrapper.append(children);
    }

    return wrapper;
  }

  function renderYearNode(year: Year): HTMLElement {
    const nodeId = yearNodeId(year.id);
    const wrapper = document.createElement('div');
    wrapper.className = 'curriculum-nav__node';
    wrapper.append(createToggleButton(year.title, nodeId, ''));

    if (isExpanded(nodeId)) {
      const children = document.createElement('div');
      children.className = 'curriculum-nav__children';
      for (const subjectId of year.subject_ids) {
        const subject = subjectsById.get(subjectId);
        if (subject) children.append(renderSubjectNode(subject));
      }
      wrapper.append(children);
    }

    return wrapper;
  }

  if (curriculum.years.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__rail-status';
    empty.textContent = 'No curriculum yet.';
    container.append(empty);
    return;
  }

  const tree = document.createElement('div');
  tree.className = 'curriculum-nav';
  for (const year of curriculum.years) {
    tree.append(renderYearNode(year));
  }
  container.append(tree);
}
