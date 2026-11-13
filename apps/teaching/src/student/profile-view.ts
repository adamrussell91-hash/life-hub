/**
 * Student progress page `/s/classes/:id/profile`. noindex.
 *
 * Two tabs: My progress (next steps, where each outcome and concept sits over time, skills,
 * the codes teachers keep writing, and the unit map with the student's To do panel beside it)
 * and Returned work (feedback on each piece).
 * Steps and stories come from the server already worded; the page never shows a mark or a score.
 */
import { apiPost } from '@/api/client';
import { button, deviceToken, el, errorText } from '@/quiz/dom';
import { studentOrganiserApi } from '@/organiser/api';
import { renderOrganiserPanel } from '@/organiser/student-panel';
import type { OrganiserLoad } from '@/organiser/types';
import { ensureNoIndex } from '@/student/feedback-view';
import { lessonToReturnTo } from '@/student/initials-token';
import { createStudentShell, renderStudentChrome, renderStudentStatus, studentAnchor, STUDENT_BRAND } from '@/student/shell';
import { buildCoverageMap, type CoverageMapInput } from '@/network/coverage-map/model';
import { mountProgressMap } from '@/network/coverage-map/progress';
import { scheduleFromRows, type ScheduleRow } from '@/network/schedule';
import { stepChart } from '@/progress/step-chart';
import { skillRow } from '@/progress/skill-row';
import { feedbackCard, codeChip } from '@/progress/code-grid';
import { storyText, placeName } from '@/progress/story-text';
import type { ProgressPayload, ReturnedItem, TargetRow } from '@/progress/types';
import { pieceView, returnedList, type NotePayload, type PiecePayload } from '@/student/returned-view';
import type { RedraftApi } from '@/student/redraft-editor';
import { countdownCard, renderTodoPanel, type TodoPayload } from '@/student/todo-panel';
import { renderNowStrip } from '@/student/now-strip';
import '@/progress/progress.css';
import './profile.css';

type Role = 'core' | 'support' | 'extension' | 'optional';
export type ProfileLesson = { id: string; title: string; role: Role; kind: 'lesson' | 'quiz' | 'assessment'; done: boolean };
/** What the server sends to draw the map; see netlify/functions/_shared/profile-map.mjs. */
export type ProfileUnit = {
  content: unknown;
  lines: unknown[];
  lessons: unknown[];
  schedule: ScheduleRow[];
  pre: string[];
};
type ProfileMap = { lessons: ProfileLesson[]; next: string | null; unit: ProfileUnit | null };
/** The `progress` action's payload, or the bare initials prompt. */
export type ProfilePayload = Partial<Omit<ProgressPayload, 'need' | 'map'>> & {
  need: 'initials' | null;
  map?: ProfileMap;
  todo?: TodoPayload;
  /** The student's own code for getting in on another computer. Never on the teacher's view. */
  code?: string;
  /** Whether the "Do this now" pointer may come up. False once the student turned it off. */
  pointer?: boolean;
};

export type RenderProfileOptions = {
  classId: string;
  /** Called with the typed initials when the device holds no claim. */
  onClaim?: (initials: string) => void;
  /** A server message to show under the initials box. */
  message?: string;
  /** The Returned work tab's calls; without them the tab shows an empty list. */
  loadReturned?: () => Promise<ReturnedItem[]>;
  loadPiece?: (id: string) => Promise<PiecePayload | NotePayload>;
  markSeen?: (id: string) => void;
  /** A student's calls for rewriting a piece. Without them an ask is only a note, as a teacher sees it. */
  redraft?: (item: string) => RedraftApi;
  /** The teacher viewing a student's page: their name heads it and the device line goes. */
  teacher?: { name: string };
  /** The student's organiser; the Organiser tab shows only when it has released lines. */
  organiser?: OrganiserLoad | null;
  /** Reload the organiser and redraw on its tab. */
  reloadOrganiser?: () => void;
  /** `organiser` lands on the Organiser tab; `over-time` on Over time (teacher only). */
  tab?: string;
  /** Teacher only: builds the Over time tab's panel, the first time it opens. Ignored without `teacher`. */
  overTime?: () => HTMLElement;
  /** The student's "Don't show this again" on the Do this now pointer. */
  pointerOff?: () => void;
};

function seeHow(r?: { url: string; title?: string; kind: string; start?: number }): HTMLElement | null {
  if (!r) return null;
  const a = el('a', 'pg-seehow', 'See how →');
  a.href = r.kind === 'video' && r.start ? `${r.url}${r.url.includes('?') ? '&' : '?'}t=${r.start}` : r.url;
  a.target = '_blank';
  a.rel = 'noopener';
  if (r.title) a.title = r.title;
  return a;
}

function renderNext(p: ProfilePayload): HTMLElement {
  const sec = el('section', 'pg-next');
  sec.append(el('h2', 'pm-map__title', 'Your next steps'), el('p', 'pm-key', 'Built from what your teacher keeps writing on your work.'));
  const next = p.next ?? [];
  if (!next.length) {
    sec.append(el('p', 'pm-empty', 'Your next steps appear once your teacher has returned a few pieces.'));
    return sec;
  }
  const list = el('div', 'pg-next__list');
  for (const n of next) {
    const card = el('div', `pg-next__card${n.positive ? ' is-strength' : ''}`);
    card.append(el('p', 'pg-next__do', n.positive ? `${n.action} It’s working.` : n.action));
    const why = el('p', 'pg-next__why');
    why.append(codeChip(n.code, n.colour), document.createTextNode(` on ${n.hit} of your last ${n.of} pieces`));
    card.append(why);
    const link = seeHow(n.resource);
    if (link) card.append(link);
    list.append(card);
  }
  sec.append(list);
  return sec;
}

function renderTargetRows(title: string, rows: TargetRow[], p: ProfilePayload): HTMLElement[] {
  if (!rows.length) return [];
  const pieces = p.pieces ?? [];
  const out: HTMLElement[] = [el('h3', 'pg-group', title)];
  const codeOf = (id: string | null) => (id ? (p.codes ?? []).find((c) => c.code_id === id)?.code ?? null : null);
  for (const r of rows) {
    const holding = r.story.kind === 'holding';
    const row = el('article', `pg-row${holding ? ' is-holding' : ''}`);
    const left = el('div', 'pg-row__text');
    left.append(el('h4', 'pg-row__name', r.name), el('p', 'pg-row__sub', r.sub));
    if (r.now) left.append(el('span', `pg-row__now is-${r.now}`, `Now: ${placeName(r.now)}`));
    left.append(el('p', 'pg-row__story', storyText(r.story, codeOf(r.story.kind === 'holding' ? r.story.code_id : null), false, pieces)));
    if (r.looks) left.append(el('p', 'pg-row__looks', r.looks));
    if (holding) left.append(el('p', 'pg-row__flag', 'Your next step is here'));
    row.append(left, stepChart(r.cells, pieces));
    out.push(row);
  }
  return out;
}

function renderSkills(p: ProfilePayload): HTMLElement | null {
  const skills = p.skills ?? [];
  if (!skills.length) return null;
  const sec = el('section', 'pg-skills');
  sec.append(el('h2', 'pm-map__title', 'Your skills'), el('p', 'pm-key', 'The filled dot is where you are. Tap any dot to see what that step looks like.'));
  const card = el('div', 'pg-skills__card');
  for (const s of skills) {
    const strand = el('div', 'pg-skills__group');
    strand.append(el('h3', 'pg-skills__strand', s.strand));
    for (const r of s.rows) strand.append(skillRow(r));
    card.append(strand);
  }
  sec.append(card);
  return sec;
}

/** "What your feedback keeps saying": the newest pieces' codes, each row opening to where it was marked. */
function renderFeedback(p: ProfilePayload, onOpen: (pieceId: string) => void): HTMLElement | null {
  const feedback = p.feedback;
  if (!feedback?.pieces.length || !feedback.rows.length) return null;
  const sec = el('section', 'pg-codes-sec');
  sec.append(
    el('h2', 'pm-map__title', 'What your feedback keeps saying'),
    el('p', 'pm-key', `Your last ${feedback.pieces.length} marked ${feedback.pieces.length === 1 ? 'piece' : 'pieces'}, newest on the right. Tap a row to see where your teacher marked it.`),
    feedbackCard(feedback, { onOpen })
  );
  return sec;
}

/** The soonest assessment's countdown, big, at the top of My progress. Other countdowns stay in To do. */
function topCountdown(payload: ProfilePayload, options: RenderProfileOptions): HTMLElement | null {
  const first = payload.todo?.countdowns.find((c) => c.assessment);
  return first ? countdownCard(first, { classId: options.classId, size: 'big' }) : null;
}

function renderLearning(p: ProfilePayload): HTMLElement {
  const sec = el('section', 'pg-learning');
  sec.append(el('h2', 'pm-map__title', 'Where your learning is'), el('p', 'pm-key', 'Each column is one piece your teacher marked, oldest to newest. The taller the column, the higher the step.'));
  const list = el('div', 'pg-learning__list');
  list.append(...renderTargetRows('Outcomes', p.outcomes ?? [], p), ...renderTargetRows('Concepts', p.concepts ?? [], p));
  sec.append(list.childElementCount ? list : el('p', 'pm-empty', 'This fills in once your teacher marks a piece against an outcome or concept.'));
  return sec;
}

/** The unit map: the teacher's coverage map as the student's own, grey until done. */
function renderMap(map: NonNullable<ProfilePayload['map']>, classId: string, payload: ProfilePayload): HTMLElement {
  const section = el('section', 'pm-map');
  section.append(el('h2', 'pm-map__title', 'Your unit'));
  const unit = map.unit;
  if (!unit || !map.lessons.length) {
    section.append(el('p', 'pm-empty', 'Your unit will appear here once your teacher sets it up.'));
    return section;
  }
  const schedule = scheduleFromRows(unit.schedule, new Set(unit.pre));
  const built = buildCoverageMap({
    content: unit.content as CoverageMapInput['content'],
    lines: unit.lines as CoverageMapInput['lines'],
    lessons: unit.lessons as CoverageMapInput['lessons'],
    ...(schedule ? { bands: schedule.bands, dates: schedule.dates } : {})
  });
  const host = el('div', 'pm-map__host');
  section.append(host);
  mountProgressMap(host, {
    map: built,
    classId,
    label: 'Your unit map',
    done: new Set(map.lessons.filter((l) => l.done).map((l) => l.id)),
    faded: new Set(),
    next: map.next,
    lineStatus: (columnId) => {
      // Where the student is on a line, from their own marked work: skills by strand, concepts by name.
      const item = built.groups.flatMap((g) => g.items).find((it) => it.id === columnId);
      if (!item) return null;
      const name = item.name.trim().toLowerCase();
      if (item.kind === 'skill') {
        const strand = (payload.skills ?? []).find((s) => s.strand.trim().toLowerCase() === name);
        const rungs = (strand?.rows ?? []).filter((r) => r.now).map((r) => `${r.name} ${placeName(r.now)}`);
        return rungs.length ? `Your ${item.name} skills: ${rungs.join(', ')}` : null;
      }
      if (item.kind === 'concept') {
        const row = (payload.concepts ?? []).find((c) => c.name.trim().toLowerCase() === name && c.now);
        return row ? `Now: ${placeName(row.now)}` : null;
      }
      // Syllabus lines reach students without their syllabus link, so there is no outcome to match.
      return null;
    }
  });
  return section;
}

/** The To do panel beside the map: on the student's own page and on the teacher's view of it. */
function withTodo(map: HTMLElement, payload: ProfilePayload, options: RenderProfileOptions): HTMLElement {
  if (!payload.todo) return map;
  const area = el('div', 'pm-unit');
  area.append(map, renderTodoPanel(payload.todo, { classId: options.classId, teacher: !!options.teacher }));
  return area;
}

function renderInitials(options: RenderProfileOptions): HTMLElement {
  const card = el('section', 'pm-claim');
  card.append(el('h2', 'pm-claim__title', 'Who are you?'));
  card.append(el('p', 'pm-claim__hint', 'Type your initials to see your progress. This browser will remember them.'));
  const input = el('input', 'pm-claim__input');
  input.type = 'text';
  input.maxLength = 6;
  input.autocomplete = 'off';
  input.autocapitalize = 'characters';
  input.setAttribute('aria-label', 'Your initials');
  const go = button('Show my progress', 'primary', () => options.onClaim?.(input.value));
  const message = el('p', 'pm-claim__message', options.message ?? '');
  message.setAttribute('role', 'alert');
  message.hidden = !options.message;
  card.append(input, go, message);
  return card;
}

type TabId = 'progress' | 'returned' | 'organiser' | 'over-time';
type Panels = { progress: HTMLElement; returned?: HTMLElement; organiser?: HTMLElement; 'over-time'?: HTMLElement };
/** `onSelect` runs on every pick after the first, so a teacher's URL can follow the tab. */
function tabs(unseen: number, start: TabId, panels: Panels, onReturned: () => void, extra: { onOverTime?: () => void; onSelect?: (id: TabId) => void } = {}): HTMLElement {
  const bar = el('div', 'pg-tabs');
  bar.setAttribute('role', 'tablist');
  const make = (id: TabId, label: string, badge = 0): HTMLButtonElement => {
    const tab = el('button', 'pg-tab');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.dataset.tab = id;
    tab.append(label);
    if (badge > 0) tab.append(el('span', 'pg-tab__badge', String(badge)));
    if (id === 'over-time') tab.append(el('span', 'pg-tab__lock', 'Only you'));
    return tab;
  };
  const all: Array<[TabId, HTMLButtonElement]> = [['progress', make('progress', 'My progress')]];
  if (panels.returned) all.push(['returned', make('returned', 'Returned work', unseen)]);
  if (panels.organiser) all.push(['organiser', make('organiser', 'Organiser')]);
  if (panels['over-time']) all.push(['over-time', make('over-time', 'Over time')]);
  let first = true;
  const select = (id: TabId): void => {
    for (const [tid, t] of all) {
      const on = tid === id;
      t.setAttribute('aria-selected', String(on));
      t.classList.toggle('is-on', on);
      const panel = panels[tid];
      if (panel) panel.hidden = !on;
    }
    if (id === 'returned') onReturned();
    if (id === 'over-time') {
      extra.onOverTime?.();
      // On a phone the fourth tab sits past the edge: bring it into the bar's view.
      const tab = all.find(([tid]) => tid === id)?.[1];
      if (tab && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => (bar.scrollLeft = Math.max(0, tab.offsetLeft - 16)));
    }
    if (!first) extra.onSelect?.(id);
    first = false;
  };
  for (const [tid, t] of all) {
    t.addEventListener('click', () => select(tid));
    bar.append(t);
  }
  select(all.some(([tid]) => tid === start) ? start : 'progress');
  return bar;
}

// The Returned work count goes down as soon as a new piece is opened.
function dropBadge(root: Element | null): void {
  const badge = root?.querySelector('.pg-tab__badge');
  if (!badge) return;
  const left = Number(badge.textContent) - 1;
  if (left > 0) badge.textContent = String(left);
  else badge.remove();
}

function returnedPanel(panel: HTMLElement, options: RenderProfileOptions): { showList: () => void; open: (id: string) => void } {
  const showList = (): void => {
    panel.replaceChildren(el('p', 'pm-empty', 'Loading…'));
    void (options.loadReturned?.() ?? Promise.resolve([] as ReturnedItem[])).then(
      (items) => panel.replaceChildren(returnedList(items, open)),
      (error: unknown) => panel.replaceChildren(el('p', 'pm-empty', errorText(error, 'Couldn’t load your returned work. Try again.')))
    );
  };
  const open = (id: string, wasNew = false): void => {
    void options.loadPiece?.(id).then(
      (piece) => {
        const redraft = /^[wq]:/.test(id) && 'redraft' in piece && piece.redraft ? options.redraft?.(id) : undefined;
        panel.replaceChildren(pieceView(piece, showList, redraft ? { redraft, onSent: () => open(id) } : {}));
        options.markSeen?.(id);
        if (wasNew) dropBadge(panel.closest('.pm-profile'));
      },
      (error: unknown) => panel.replaceChildren(el('p', 'pm-empty', errorText(error, 'Couldn’t open that piece. Try again.')))
    );
  };
  return { showList, open: (id) => open(id) };
}

function organizerPanelFor(organiser: OrganiserLoad, options: RenderProfileOptions): HTMLElement {
  // With no list to claim against, there is nothing to practise either.
  const load = organiser.need === 'no_list' ? { ...organiser, practice: null } : organiser;
  const panel = renderOrganiserPanel(load, { classId: options.classId, reload: options.reloadOrganiser });
  panel.setAttribute('role', 'tabpanel');
  return panel;
}

export function renderProfile(payload: ProfilePayload, options: RenderProfileOptions): HTMLElement {
  const root = el('article', 'pm-profile');
  const organiser = !options.teacher && options.organiser?.sheets.length ? options.organiser : null;
  if (payload.need === 'initials' || !payload.map) {
    root.append(el('h1', 'pm-title', 'Your progress'));
    // A class with no list still has a sheet to read; there is nobody to ask for initials.
    if (organiser && organiser.need === 'no_list') {
      root.append(organizerPanelFor(organiser, options));
      return root;
    }
    root.append(renderInitials(options));
    return root;
  }
  if (options.teacher) root.append(el('h1', 'pm-title', options.teacher.name));
  else {
    root.append(el('h1', 'pm-title', 'Your progress'));
    if (payload.initials) root.append(el('p', 'pm-who', `${payload.initials} on this device.`));
    if (payload.code) {
      const code = el('p', 'pm-who pm-code');
      code.append('Your code for another computer: ', el('strong', 'pm-code__value', payload.code), '. Write it in your book.');
      root.append(code);
    }
  }
  // "Do this now" sits above the tabs, so it stays on every one. The teacher sees it as the
  // student does, without the pointer.
  const strip = renderNowStrip(payload.todo, { classId: options.classId, pointer: !options.teacher && payload.pointer !== false, pointerOff: options.pointerOff });
  if (strip) root.append(strip);
  const map = withTodo(renderMap(payload.map, options.classId, payload), payload, options);
  const hasReturned = !!(payload.pieces?.length || payload.has_returned);
  const organiserPanel = organiser ? organizerPanelFor(organiser, options) : null;
  const wantOrganiser = options.tab === 'organiser' && !!organiserPanel;
  const over = overTimeTab(options);
  // The soonest assessment's countdown leads every view of the page that has the student's own data.
  const countdown = topCountdown(payload, options);
  if (!hasReturned && !organiserPanel && !over) {
    if (countdown) root.append(countdown);
    // The teacher knows nothing is returned yet; only the student needs telling.
    if (!options.teacher) root.append(el('p', 'pm-empty', 'Your progress appears here once your teacher returns your first piece of work.'));
    root.append(map);
    return root;
  }
  const progress = el('div', 'pg-panel');
  progress.setAttribute('role', 'tabpanel');
  if (countdown) progress.append(countdown);
  if (!hasReturned) {
    if (over) {
      // Only a teacher gets here with nothing returned: the overview is the map, then Over time.
      progress.append(map);
      root.append(tabs(0, over.start ?? 'progress', { progress, 'over-time': over.panel }, () => undefined, over.hooks), progress, over.panel);
      return root;
    }
    progress.append(el('p', 'pm-empty', 'Your progress appears here once your teacher returns your first piece of work.'), map);
    root.append(tabs(0, wantOrganiser ? 'organiser' : 'progress', { progress, organiser: organiserPanel! }, () => undefined), progress, organiserPanel!);
    return root;
  }
  const returned = el('div', 'pg-panel');
  returned.setAttribute('role', 'tabpanel');
  let loaded = false;
  const returnedApi = returnedPanel(returned, options);
  // "Open this piece" in the feedback rows: over to Returned work, straight to that piece.
  const openPiece = (id: string): void => {
    loaded = true;
    const tab = root.querySelector<HTMLButtonElement>('.pg-tab[data-tab="returned"]');
    tab?.click();
    returnedApi.open(id);
    tab?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  };
  progress.append(renderNext(payload), renderLearning(payload));
  const skills = renderSkills(payload);
  if (skills) progress.append(skills);
  const feedback = renderFeedback(payload, openPiece);
  if (feedback) progress.append(feedback);
  progress.append(map);
  root.append(
    // A student with new feedback lands on it; a teacher looking in starts on the overview.
    tabs(
      payload.unseen ?? 0,
      over?.start ?? (wantOrganiser ? 'organiser' : (payload.unseen && !options.teacher) || options.tab === 'returned' ? 'returned' : 'progress'),
      { progress, returned, ...(organiserPanel ? { organiser: organiserPanel } : {}), ...(over ? { 'over-time': over.panel } : {}) },
      () => {
        if (loaded) return;
        loaded = true;
        returnedApi.showList();
      },
      over?.hooks
    ),
    progress,
    returned,
    ...(organiserPanel ? [organiserPanel] : []),
    ...(over ? [over.panel] : [])
  );
  return root;
}

/**
 * The teacher-only Over time tab: built only with both `teacher` and `overTime`, mounted the
 * first time it opens. Its tab follows the URL (`?tab=over-time`), and every pick after the first
 * rewrites `tab` in place so a refresh keeps the teacher where they were.
 */
function overTimeTab(options: RenderProfileOptions): { panel: HTMLElement; start: TabId | null; hooks: { onOverTime: () => void; onSelect: (id: TabId) => void } } | null {
  if (!options.teacher || !options.overTime) return null;
  const build = options.overTime;
  const panel = el('div', 'pg-panel pg-panel--over-time');
  panel.setAttribute('role', 'tabpanel');
  let mounted = false;
  return {
    panel,
    start: options.tab === 'over-time' ? 'over-time' : null,
    hooks: {
      onOverTime: () => {
        if (mounted) return;
        mounted = true;
        panel.replaceChildren(build());
      },
      onSelect: (id) => {
        const url = new URL(window.location.href);
        if (id === 'progress') url.searchParams.delete('tab');
        else url.searchParams.set('tab', id);
        window.history.replaceState(window.history.state, '', url.toString());
      }
    }
  };
}

export type MountStudentProfileViewOptions = { root: HTMLElement; classId: string; isStale?: () => boolean };
export type StudentProfileViewHandle = { dispose(): void };

/**
 * The To do panel's practice row after the organiser reloads (a practice round just ended). The
 * profile payload was read before the round, so its count is stale; the organiser load counts the
 * same cards the same way, so its numbers replace it and a finished round ticks the row off.
 */
export function withPracticeFrom(payload: ProfilePayload, organiser: OrganiserLoad | null): ProfilePayload {
  if (!payload.todo || !organiser) return payload;
  const p = organiser.practice;
  const today = p ? p.today : 0;
  const answered = p?.answered ?? 0;
  const practice = today > 0 || answered > 0 ? { today, answered } : null;
  return { ...payload, todo: { ...payload.todo, practice } };
}

export function mountStudentProfileView(options: MountStudentProfileViewOptions): StudentProfileViewHandle {
  const { root, classId, isStale = () => false } = options;
  const clearNoIndex = ensureNoIndex();
  let disposed = false;

  root.replaceChildren();
  const { surface, header, content } = createStudentShell('student-surface__content--profile');
  root.append(surface);
  const lesson = lessonToReturnTo(window.location.search);
  renderStudentChrome(header, { brand: STUDENT_BRAND, links: lesson ? [{ href: lesson, label: 'Back to lesson' }] : [] });
  renderStudentStatus(content, 'Loading your progress…');

  const call = <T = ProfilePayload>(action: 'progress' | 'claim' | 'returned' | 'piece' | 'seen' | 'pointer_off', extra: Record<string, unknown> = {}): Promise<T> =>
    apiPost<T>(`/api/published/profile/${encodeURIComponent(classId)}`, { action, class_token: deviceToken(`class:${classId}`), ...extra });

  let organiser: OrganiserLoad | null = null;
  let latest: ProfilePayload | null = null;
  let startTab = new URLSearchParams(window.location.search).get('tab') ?? undefined;
  // A failed organiser load leaves the rest of the page as it was.
  const loadOrganiser = (): Promise<OrganiserLoad | null> => studentOrganiserApi.load(classId).catch(() => null);

  const show = (payload: ProfilePayload, message?: string): void => {
    if (disposed || isStale()) return;
    latest = payload;
    content.replaceChildren(
      renderProfile(payload, {
        classId,
        message,
        organiser,
        tab: startTab,
        reloadOrganiser: () => {
          void loadOrganiser().then((o) => {
            if (disposed || isStale() || !latest) return;
            organiser = o;
            startTab = 'organiser';
            show(withPracticeFrom(latest, o));
          });
        },
        onClaim: (initials) => {
          // A claim only binds the device; the page itself is always the progress payload.
          void call('claim', { initials })
            .then(() => Promise.all([call('progress'), loadOrganiser()]))
            .then(
              ([next, org]) => {
                organiser = org;
                show(next);
              },
              (error: unknown) => show({ need: 'initials' }, errorText(error))
            );
        },
        loadReturned: () => call<{ items: ReturnedItem[] }>('returned').then((r) => r.items),
        loadPiece: (id) => call<PiecePayload | NotePayload>('piece', { item: id }),
        markSeen: (id) => void call('seen', { item: id }).catch(() => undefined),
        pointerOff: () => void call('pointer_off').catch(() => undefined),
        redraft: (item) => {
          const [kind, lessonId = '', blockId = ''] = item.split(':');
          // A quiz answer asked again: its question, through the quiz.
          if (kind === 'q') {
            const quiz = <T>(action: string, extra: Record<string, unknown> = {}): Promise<T> =>
              apiPost<T>(`/api/published/quiz/${encodeURIComponent(lessonId)}`, { action, question_id: blockId, class_id: classId, class_token: deviceToken(`class:${classId}`), ...extra });
            return {
              load: () => quiz('again_load'),
              save: (part, field, text) => quiz('again_save', { part, field, text }),
              send: () => quiz('again_send')
            };
          }
          const work = <T>(action: string, extra: Record<string, unknown> = {}): Promise<T> =>
            apiPost<T>(`/api/published/work/${encodeURIComponent(lessonId)}`, { action, block_id: blockId, class_id: classId, class_token: deviceToken(`class:${classId}`), ...extra });
          return {
            load: () => work('redraft_load'),
            save: (part, field, text) => work('redraft_save', { part, field, text }),
            send: () => work('redraft_send')
          };
        }
      })
    );
  };

  void Promise.all([call('progress'), loadOrganiser()]).then(
    ([payload, org]) => {
      organiser = org;
      show(payload);
    },
    (error: unknown) => {
      if (disposed || isStale()) return;
      renderStudentStatus(content, errorText(error, 'Couldn’t load your progress. Try again.'));
    }
  );

  return {
    dispose() {
      disposed = true;
      clearNoIndex();
    }
  };
}
