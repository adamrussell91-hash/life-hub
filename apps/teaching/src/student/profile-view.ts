/**
 * Student progress page `/s/classes/:id/profile`. noindex.
 *
 * Two tabs: My progress (next steps, where each outcome and concept sits over time, skills,
 * the codes teachers keep writing, and the unit map) and Returned work (feedback on each piece).
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
import { skillPath } from '@/progress/skill-path';
import { codeGrid, codeChip } from '@/progress/code-grid';
import { storyText, placeName } from '@/progress/story-text';
import type { ProgressPayload, ReturnedItem, TargetRow } from '@/progress/types';
import { pieceView, returnedList, type NotePayload, type PiecePayload } from '@/student/returned-view';
import type { RedraftApi } from '@/student/redraft-editor';
import '@/progress/progress.css';
import './profile.css';

type Role = 'core' | 'support' | 'extension' | 'optional';
export type ProfileLesson = { id: string; title: string; role: Role; kind: 'lesson' | 'quiz' | 'assessment'; done: boolean; assigned: boolean };
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
export type ProfilePayload = Partial<Omit<ProgressPayload, 'need' | 'map'>> & { need: 'initials' | null; map?: ProfileMap };

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
  /** `organiser` lands on the Organiser tab. */
  tab?: string;
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
  sec.append(el('h2', 'pm-map__title', 'Your skills'), el('p', 'pm-key', 'Skills use the HSC skills continuum, a different scale from your outcomes. The dot shows where you are now. Under each rung is how many of your pieces landed there.'));
  for (const s of skills) {
    const card = el('div', 'pg-skills__card');
    card.append(el('p', 'pg-skills__strand', s.strand));
    for (const r of s.rows) {
      const row = el('div', `pg-skills__row${r.story.kind === 'holding' ? ' is-holding' : ''}`);
      row.append(el('h4', 'pg-row__name', r.name), skillPath(r));
      if (r.i_can) row.append(el('p', 'pg-skills__ican', `“${r.i_can}”`));
      if (r.next_move && r.next_rung) row.append(el('p', 'pg-skills__next', `To reach ${placeName(r.next_rung)}: ${r.next_move}`));
      if (r.story.kind === 'holding') row.append(el('p', 'pg-row__flag', storyText(r.story, null, true)));
      card.append(row);
    }
    sec.append(card);
  }
  return sec;
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
function renderMap(map: NonNullable<ProfilePayload['map']>, classId: string): HTMLElement {
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
    faded: new Set(map.lessons.filter((l) => !l.assigned).map((l) => l.id)),
    next: map.next
  });
  return section;
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

type TabId = 'progress' | 'returned' | 'organiser';
function tabs(unseen: number, start: TabId, panels: { progress: HTMLElement; returned?: HTMLElement; organiser?: HTMLElement }, onReturned: () => void): HTMLElement {
  const bar = el('div', 'pg-tabs');
  bar.setAttribute('role', 'tablist');
  const make = (id: TabId, label: string, badge = 0): HTMLButtonElement => {
    const tab = el('button', 'pg-tab');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.dataset.tab = id;
    tab.append(label);
    if (badge > 0) tab.append(el('span', 'pg-tab__badge', String(badge)));
    return tab;
  };
  const all: Array<[TabId, HTMLButtonElement]> = [['progress', make('progress', 'My progress')]];
  if (panels.returned) all.push(['returned', make('returned', 'Returned work', unseen)]);
  if (panels.organiser) all.push(['organiser', make('organiser', 'Organiser')]);
  const select = (id: TabId): void => {
    for (const [tid, t] of all) {
      const on = tid === id;
      t.setAttribute('aria-selected', String(on));
      t.classList.toggle('is-on', on);
      const panel = panels[tid];
      if (panel) panel.hidden = !on;
    }
    if (id === 'returned') onReturned();
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

function returnedPanel(panel: HTMLElement, options: RenderProfileOptions): () => void {
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
        const redraft = id.startsWith('w:') && 'redraft' in piece && piece.redraft ? options.redraft?.(id) : undefined;
        panel.replaceChildren(pieceView(piece, showList, redraft ? { redraft, onSent: () => open(id) } : {}));
        options.markSeen?.(id);
        if (wasNew) dropBadge(panel.closest('.pm-profile'));
      },
      (error: unknown) => panel.replaceChildren(el('p', 'pm-empty', errorText(error, 'Couldn’t open that piece. Try again.')))
    );
  };
  return showList;
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
  }
  const map = renderMap(payload.map, options.classId);
  const hasReturned = !!(payload.pieces?.length || payload.has_returned);
  const organiserPanel = organiser ? organizerPanelFor(organiser, options) : null;
  const wantOrganiser = options.tab === 'organiser' && !!organiserPanel;
  if (!hasReturned && !organiserPanel) {
    // The teacher knows nothing is returned yet; only the student needs telling.
    if (!options.teacher) root.append(el('p', 'pm-empty', 'Your progress appears here once your teacher returns your first piece of work.'));
    root.append(map);
    return root;
  }
  const progress = el('div', 'pg-panel');
  progress.setAttribute('role', 'tabpanel');
  if (!hasReturned) {
    progress.append(el('p', 'pm-empty', 'Your progress appears here once your teacher returns your first piece of work.'), map);
    root.append(tabs(0, wantOrganiser ? 'organiser' : 'progress', { progress, organiser: organiserPanel! }, () => undefined), progress, organiserPanel!);
    return root;
  }
  progress.append(renderNext(payload), renderLearning(payload));
  const skills = renderSkills(payload);
  if (skills) progress.append(skills);
  if (payload.pieces?.length) {
    const codes = el('section', 'pg-codes-sec');
    codes.append(el('h2', 'pm-map__title', 'What your feedback keeps saying'), codeGrid(payload.codes ?? [], payload.pieces));
    progress.append(codes);
  }
  progress.append(map);
  const returned = el('div', 'pg-panel');
  returned.setAttribute('role', 'tabpanel');
  let loaded = false;
  const load = returnedPanel(returned, options);
  root.append(
    // A student with new feedback lands on it; a teacher looking in starts on the overview.
    tabs(payload.unseen ?? 0, wantOrganiser ? 'organiser' : payload.unseen && !options.teacher ? 'returned' : 'progress', { progress, returned, ...(organiserPanel ? { organiser: organiserPanel } : {}) }, () => {
      if (loaded) return;
      loaded = true;
      load();
    }),
    progress,
    returned,
    ...(organiserPanel ? [organiserPanel] : [])
  );
  return root;
}

export type MountStudentProfileViewOptions = { root: HTMLElement; classId: string; isStale?: () => boolean };
export type StudentProfileViewHandle = { dispose(): void };

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

  const call = <T = ProfilePayload>(action: 'progress' | 'claim' | 'returned' | 'piece' | 'seen', extra: Record<string, unknown> = {}): Promise<T> =>
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
            show(latest);
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
        redraft: (item) => {
          const [, lessonId = '', blockId = ''] = item.split(':');
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
