import 'katex/dist/katex.min.css';
import { startHubMotion } from '../../design-kit/js/hub-motion.js';
import { apiGet, ApiClientError } from '@/api/client';
import { fetchSession, logout, renderSignIn, type SessionInfo } from '@/auth/gate';
import {
  renderCanvasStatus,
  renderRailStatus,
  renderTeacherShell,
  type TeacherShellRefs
} from '@/teacher/shell';
import type { CurriculumResponse } from '@/teacher/nav';
import { renderTeacherRail } from '@/teacher/rail';
import { renderTeacherHome as renderHomeCanvas } from '@/teacher/home';
import { openBlankLesson } from '@/teacher/create/blank-lesson';
import { openCreateModal } from '@/teacher/create/modal';
import type { CreateKind, CreatedRecord } from '@/teacher/create/types';
import { mountLessonEditor, type LessonEditorHandle } from '@/teacher/lesson-editor';
import type { TeacherSection } from '@/teacher/section';
import { renderResourcesIndex } from '@/teacher/sections/resources';
import { openDrivePicker } from '@/teacher/drive-picker';
import { createMedia, uploadMediaFile } from '@/teacher/media-api';
import {
  renderScopeSequencesIndex,
  renderScopeTimelineEditor
} from '@/teacher/sections/scope-sequences';
import { renderClassesIndex, renderClassPage, type ClassPageOptions } from '@/teacher/sections/classes';
import { openScheduleUnitModal } from '@/teacher/sections/schedule-unit-modal';
import { renderUnitsIndex, renderUnitPage } from '@/teacher/sections/units';
import { renderLessonsIndex } from '@/teacher/sections/lessons';
import { renderTemplatesPage } from '@/teacher/sections/templates';
import { renderTrashSection } from '@/teacher/sections/trash';
import { fetchContentSearch } from '@/teacher/search/api';
import { resolveTodayClassId } from '@/teacher/search/actions';
import { openSearchPanel } from '@/teacher/search/panel';
import { pushRecent } from '@/teacher/search/recent';
import {
  mountStudentLessonView,
  type StudentLessonViewHandle
} from '@/student/lesson-view';
import {
  mountStudentUnitView,
  type StudentUnitViewHandle
} from '@/student/unit-view';
import {
  mountStudentClassView,
  type StudentClassViewHandle
} from '@/student/class-view';
import {
  applyCreatedEntity,
  applyCreatedMedia,
  applyScheduledUnitResult,
  getCurriculum as getCachedCurriculum,
  invalidateCurriculum as invalidateCachedCurriculum,
  peekCurriculum,
  reconcileCurriculum,
  replaceCurriculum
} from './curriculum-state';
import { withCreatedEntity } from '@/curriculum/with-created-entity';
import { currentAppPath, withAppBase } from './base-path';
import { navigate, start, type RouteMatch } from './router';
import { renderPageHeader } from '@/teacher/page-header';

const root = document.querySelector('#app');
if (!(root instanceof HTMLElement)) {
  throw new Error('App root element #app not found');
}

const appRoot = root;

let session: SessionInfo = { authenticated: false };

// Guards against stale async work (e.g. a slow curriculum fetch) clobbering
// the DOM after the user has already navigated to a different route.
let renderToken = 0;

// The lesson editor mounted for the current route, if any. Torn down (with a
// best-effort save flush) whenever the route changes.
let lessonEditorHandle: LessonEditorHandle | null = null;

// Latest teacher shell refs (for search create-modal callbacks).
let teacherShellRefs: TeacherShellRefs | null = null;

// The student lesson view mounted for the current public route, if any.
let studentLessonViewHandle: StudentLessonViewHandle | null = null;

// The student unit view mounted for the current public route, if any.
let studentUnitViewHandle: StudentUnitViewHandle | null = null;

// The student class view mounted for the current public route, if any.
let studentClassViewHandle: StudentClassViewHandle | null = null;

// Home dashboard handle (clock interval + create control), if mounted.
let homeHandle: { dispose: () => void } | null = null;

// Scope sequences index handle (create control), if mounted.
let scopeIndexHandle: { dispose?: () => void } | null = null;

// Section index handles (create controls), if mounted.
let classesIndexHandle: { dispose?: () => void } | null = null;
let classPageHandle: { dispose?: () => void } | null = null;
let unitsIndexHandle: { dispose?: () => void } | null = null;
let lessonsIndexHandle: { dispose?: () => void } | null = null;
let trashSectionHandle: { dispose?: () => void } | null = null;
let unitPageHandle: { dispose?: () => void } | null = null;
/**
 * Flushes any pending/in-flight autosave for the current lesson editor and
 * only disposes it once that flush has fully settled. Awaiting this (rather
 * than firing-and-forgetting `flush()`) matters: if a save is already in
 * flight when the user navigates away, a follow-up edit can be queued as a
 * resave behind it — disposing before that resave completes would silently
 * drop it.
 */
async function teardownLessonEditor(): Promise<void> {
  const handle = lessonEditorHandle;
  if (!handle) return;
  lessonEditorHandle = null;
  await handle.flush();
  handle.dispose();
}

function teardownStudentLessonView(): void {
  if (!studentLessonViewHandle) return;
  studentLessonViewHandle.dispose();
  studentLessonViewHandle = null;
}

function teardownStudentUnitView(): void {
  if (!studentUnitViewHandle) return;
  studentUnitViewHandle.dispose();
  studentUnitViewHandle = null;
}

function teardownStudentClassView(): void {
  if (!studentClassViewHandle) return;
  studentClassViewHandle.dispose();
  studentClassViewHandle = null;
}

function teardownTeacherHome(): void {
  if (!homeHandle) return;
  homeHandle.dispose();
  homeHandle = null;
}

function teardownScopeIndex(): void {
  if (!scopeIndexHandle) return;
  scopeIndexHandle.dispose?.();
  scopeIndexHandle = null;
}

function teardownClassesIndex(): void {
  if (!classesIndexHandle) return;
  classesIndexHandle.dispose?.();
  classesIndexHandle = null;
}

function teardownClassPage(): void {
  if (!classPageHandle) return;
  classPageHandle.dispose?.();
  classPageHandle = null;
}

function teardownUnitsIndex(): void {
  if (!unitsIndexHandle) return;
  unitsIndexHandle.dispose?.();
  unitsIndexHandle = null;
}

function teardownLessonsIndex(): void {
  if (!lessonsIndexHandle) return;
  lessonsIndexHandle.dispose?.();
  lessonsIndexHandle = null;
}

function teardownTrashSection(): void {
  if (!trashSectionHandle) return;
  trashSectionHandle.dispose?.();
  trashSectionHandle = null;
}

function teardownUnitPage(): void {
  if (!unitPageHandle) return;
  unitPageHandle.dispose?.();
  unitPageHandle = null;
}
function pathForCreatedEntity(
  kind: CreateKind,
  id: string,
  curriculum: CurriculumResponse
): string {
  switch (kind) {
    case 'class':
      return `/classes/${id}`;
    case 'subject':
      return currentAppPath() || '/';
    case 'unit':
      return `/units/${id}`;
    case 'lesson':
      return `/lessons/${id}`;
    case 'scope_sequence': {
      const subject = curriculum.subjects.find((entry) => entry.scope_id === id);
      return subject ? `/scope-sequences/${subject.id}` : '/scope-sequences';
    }
  }
}

function handleEntityCreated(
  refs: TeacherShellRefs,
  kind: CreateKind,
  id: string,
  entity?: CreatedRecord
): void {
  const seeded = entity ? applyCreatedEntity(kind, entity) : peekCurriculum();
  const snapshot = seeded ?? peekCurriculum();
  if (snapshot) {
    navigate(pathForCreatedEntity(kind, id, snapshot));
    void reconcileCurriculum().catch((error) => {
      if (error instanceof ApiClientError && error.code === 'unauthorized') {
        session = { authenticated: false };
        navigate('/sign-in', { replace: true });
      }
    });
    return;
  }

  invalidateCachedCurriculum();
  void getCachedCurriculum()
    .then((refreshed) => {
      const next = entity ? withCreatedEntity(refreshed, kind, entity) : refreshed;
      replaceCurriculum(next);
      navigate(pathForCreatedEntity(kind, id, next));
    })
    .catch((error) => {
      if (error instanceof ApiClientError && error.code === 'unauthorized') {
        session = { authenticated: false };
        navigate('/sign-in', { replace: true });
        return;
      }
      renderCanvasStatus(
        refs.canvas,
        'Created, but unable to refresh. Please reload to open the new item.'
      );
    });
}

function railCreateClassHandler(
  curriculum: CurriculumResponse,
  refs: TeacherShellRefs
): () => void {
  return () => {
    openCreateModal({
      kind: 'class',
      curriculum,
      onCreated: (kind, id, entity) => handleEntityCreated(refs, kind, id, entity)
    });
  };
}

import { publicStudentPath, type PublicEntityKind } from '@/teacher/public-link';

function studentPathForTeacherPath(pathname: string): string | null {
  const match = pathname.match(/^\/(lessons|units|classes)\/([^/]+)\/?$/);
  if (!match) return null;
  return publicStudentPath(match[1] as PublicEntityKind, match[2]!);
}

function createKindForSearchAction(actionId: string): CreateKind | null {
  switch (actionId) {
    case 'new-lesson':
      return 'lesson';
    case 'new-unit':
      return 'unit';
    case 'new-class':
      return 'class';
    case 'new-subject':
      return 'subject';
    case 'new-scope':
      return 'scope_sequence';
    default:
      return null;
  }
}

function openTeacherSearch(): void {
  if (!session.authenticated) return;
  if (currentAppPath().startsWith('/s/')) return;

  void getCurriculum().then(async (curriculum) => {
    let compositions: Array<{ id: string; title: string }> = [];
    try {
      const res = await apiGet<{ compositions: Array<{ id: string; title: string }> }>(
        '/api/compositions'
      );
      compositions = res.compositions;
    } catch {
      compositions = [];
    }

    const todayClassId = resolveTodayClassId(curriculum);

    openSearchPanel({
      curriculum,
      compositions,
      path: currentAppPath(),
      hasLessonEditor: Boolean(lessonEditorHandle),
      todayClassId,
      fetchContentSearch,
      onNavigate: (path) => {
        navigate(path);
      },
      onAction: (actionId) => {
        const createKind = createKindForSearchAction(actionId);
        if (createKind) {
          const refs = teacherShellRefs;
          openCreateModal({
            kind: createKind,
            curriculum,
            onCreated: (kind, id, entity) => {
              if (refs) {
                handleEntityCreated(refs, kind, id, entity);
                return;
              }
              if (entity) applyCreatedEntity(kind, entity);
              const seeded = peekCurriculum();
              if (seeded) {
                navigate(pathForCreatedEntity(kind, id, seeded));
                void reconcileCurriculum();
                return;
              }
              navigate(pathForCreatedEntity(kind, id, curriculum));
            }
          });
          return;
        }

        switch (actionId) {
          case 'open-home':
            navigate('/');
            break;
          case 'open-today-class':
            if (todayClassId) navigate(`/classes/${todayClassId}`);
            break;
          case 'open-student-view': {
            const studentPath = studentPathForTeacherPath(currentAppPath());
            if (studentPath) window.open(withAppBase(studentPath), '_blank', 'noopener,noreferrer');
            break;
          }
          case 'open-a4':
            lessonEditorHandle?.openA4Preview();
            break;
          case 'publish-lesson':
            lessonEditorHandle?.publish();
            break;
          default:
            break;
        }
      }
    });
  });
}

function mountTeacherRail(
  refs: TeacherShellRefs,
  curriculum: CurriculumResponse,
  activeSection: TeacherSection,
  activeClassId?: string
): void {
  renderTeacherRail(refs.railNav, curriculum, {
    activeSection,
    activeClassId,
    onCreateClass: railCreateClassHandler(curriculum, refs),
    onOpenSearch: openTeacherSearch
  });
}

function getCurriculum(): Promise<CurriculumResponse> {
  return getCachedCurriculum();
}

function invalidateCurriculum(): void {
  invalidateCachedCurriculum();
}

function remountFromSnapshot(
  token: number,
  refs: TeacherShellRefs,
  section: TeacherSection,
  remount: (data: CurriculumResponse) => void,
  activeClassId?: string
): void {
  const next = peekCurriculum();
  if (!next) {
    invalidateCurriculum();
    void getCurriculum().then((fresh) => {
      if (token !== renderToken) return;
      mountTeacherRail(refs, fresh, section, activeClassId);
      remount(fresh);
    });
    return;
  }
  if (token !== renderToken) return;
  mountTeacherRail(refs, next, section, activeClassId);
  remount(next);
}

async function handleLogout(): Promise<void> {
  try {
    await logout();
  } catch {
    // Still clear local session so the teacher isn't stuck signed in if the
    // network call fails (cookie may linger until it expires).
  }
  session = { authenticated: false };
  invalidateCurriculum();
  navigate('/sign-in', { replace: true });
}

function mountTeacherShell(): TeacherShellRefs {
  const refs = renderTeacherShell(appRoot, { onLogout: () => handleLogout() });
  teacherShellRefs = refs;
  return refs;
}

async function loadNavAndHandleErrors(
  refs: TeacherShellRefs,
  token: number,
  activeSection: TeacherSection,
  activeClassId: string | undefined,
  onLoaded: (curriculum: CurriculumResponse) => void
): Promise<void> {
  try {
    const curriculum = await getCurriculum();
    if (token !== renderToken) return;
    mountTeacherRail(refs, curriculum, activeSection, activeClassId);
    onLoaded(curriculum);
  } catch (error) {
    if (token !== renderToken) return;

    if (error instanceof ApiClientError && error.code === 'unauthorized') {
      session = { authenticated: false };
      navigate('/sign-in', { replace: true });
      return;
    }

    renderRailStatus(refs.railNav, 'Unable to load curriculum.');
    renderCanvasStatus(refs.canvas, 'Unable to load curriculum. Please refresh to try again.');
  }
}

function renderTeacherHomeRoute(token: number): void {
  const refs = mountTeacherShell();
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading home…');

  void loadNavAndHandleErrors(refs, token, 'home', undefined, (curriculum) => {
    teardownTeacherHome();
    homeHandle = renderHomeCanvas(refs.canvas, curriculum, {
      onCreated: (kind, id, entity) => handleEntityCreated(refs, kind, id, entity)
    });
  });
}

function renderTeacherClassesRoute(token: number): void {
  const refs = mountTeacherShell();
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'classes', undefined, (curriculum) => {
    const remount = (data: CurriculumResponse): void => {
      teardownClassesIndex();
      classesIndexHandle = renderClassesIndex(refs.canvas, data, {
        onCreated: (kind, id, entity) => handleEntityCreated(refs, kind, id, entity),
        onMutated: () => {
          remountFromSnapshot(token, refs, 'classes', remount);
        }
      });
    };
    remount(curriculum);  });
}

function renderTeacherClassRoute(classId: string, token: number): void {
  const refs = mountTeacherShell();
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  let currentCurriculum: CurriculumResponse | undefined;
  let classPageOptions: ClassPageOptions;

  const refreshAfterScheduleMutation = async (
    scheduled?: { class: CurriculumResponse['classes'][number]; scheduled_lessons: CurriculumResponse['scheduled_lessons'] }
  ): Promise<void> => {
    const seeded = scheduled ? applyScheduledUnitResult(scheduled) : peekCurriculum();
    if (seeded) {
      if (token !== renderToken) return;
      currentCurriculum = seeded;
      mountTeacherRail(refs, seeded, 'classes', classId);
      teardownClassPage();
      classPageHandle = renderClassPage(refs.canvas, seeded, classId, classPageOptions);
      void reconcileCurriculum();
      return;
    }

    invalidateCurriculum();
    try {
      const next = await getCurriculum();
      if (token !== renderToken) return;
      currentCurriculum = next;
      mountTeacherRail(refs, next, 'classes', classId);
      teardownClassPage();
      classPageHandle = renderClassPage(refs.canvas, next, classId, classPageOptions);
    } catch (error) {
      if (token !== renderToken) return;

      if (error instanceof ApiClientError && error.code === 'unauthorized') {
        session = { authenticated: false };
        navigate('/sign-in', { replace: true });
        return;
      }

      renderCanvasStatus(refs.canvas, 'Unable to refresh schedule. Please refresh to try again.');
    }
  };

  classPageOptions = {
    onScheduleMutated: refreshAfterScheduleMutation,
    // Cover changes repaint the banner in place; only drop the cache so the
    // next curriculum request is fresh.
    onCoverMutated: () => {
      invalidateCurriculum();
    },
    onScheduleUnit: () => {
      if (!currentCurriculum) return;
      openScheduleUnitModal({
        curriculum: currentCurriculum,
        classId,
        onSuccess: refreshAfterScheduleMutation
      });
    },
    onCreateLesson: () => {
      if (!currentCurriculum) return;
      const cls = currentCurriculum.classes.find((entry) => entry.id === classId);
      openBlankLesson({
        curriculum: currentCurriculum,
        unitId: cls?.current_unit_id ?? cls?.active_unit_ids[0],
        onCreated: (kind, id, entity) => handleEntityCreated(refs, kind, id, entity)
      });
    }
  };

  void loadNavAndHandleErrors(refs, token, 'classes', classId, (curriculum) => {
    currentCurriculum = curriculum;
    const cls = curriculum.classes.find((entry) => entry.id === classId);
    if (cls) {
      pushRecent({
        type: 'class',
        id: cls.id,
        title: cls.code || cls.title,
        opened_at: new Date().toISOString()
      });
    }
    teardownClassPage();
    classPageHandle = renderClassPage(refs.canvas, curriculum, classId, classPageOptions);
  });
}

function renderTeacherResourcesRoute(token: number): void {
  const refs = mountTeacherShell();
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'resources', undefined, (curriculum) => {
    const mount = (data: CurriculumResponse): void => {
      renderResourcesIndex(refs.canvas, data, {
        refresh: async () => {
          remountFromSnapshot(token, refs, 'resources', mount);
        },
        onDrivePick: async () => {
          const pick = await openDrivePicker();
          if (!pick) return;
          const created =
            pick.kind === 'mirror'
              ? await uploadMediaFile(pick.file, {
                  title: pick.title,
                  provider_file_id: pick.provider_file_id
                })
              : await createMedia({
                  title: pick.title,
                  provider: 'google_drive',
                  media_type: pick.media_type,
                  provider_file_id: pick.provider_file_id,
                  preview_url: pick.preview_url,
                  sharing: pick.sharing
                });
          applyCreatedMedia(created);
        }
      });
    };
    mount(curriculum);
  });
}

function renderTeacherTemplatesRoute(token: number): void {
  const refs = mountTeacherShell();
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'templates', undefined, (curriculum) => {
    renderTemplatesPage(refs.canvas, curriculum, {
      onCreated: () => {
        void reconcileCurriculum();
      }
    });
  });
}

function renderTeacherTrashRoute(token: number): void {
  const refs = mountTeacherShell();
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'trash', undefined, () => {
    teardownTrashSection();
    trashSectionHandle = renderTrashSection(refs.canvas);
  });
}

function renderTeacherScopeSequencesRoute(token: number): void {
  const refs = mountTeacherShell();
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'scope-sequences', undefined, (curriculum) => {
    teardownScopeIndex();
    scopeIndexHandle = renderScopeSequencesIndex(refs.canvas, curriculum, {
      onCreated: (kind, id, entity) => handleEntityCreated(refs, kind, id, entity)
    });
  });
}

function renderTeacherScopeSequenceRoute(subjectId: string, token: number): void {
  const refs = mountTeacherShell();
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  const selectedNoteId =
    new URLSearchParams(window.location.search).get('selectNote') ?? undefined;

  void loadNavAndHandleErrors(refs, token, 'scope-sequences', undefined, (curriculum) => {
    renderScopeTimelineEditor(refs.canvas, curriculum, subjectId, {
      selectedNoteId
    });
  });
}

function renderTeacherUnitsRoute(token: number): void {
  const refs = mountTeacherShell();
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'units', undefined, (curriculum) => {
    const remount = (data: CurriculumResponse): void => {
      teardownUnitsIndex();
      unitsIndexHandle = renderUnitsIndex(refs.canvas, data, {
        onCreated: (kind, id, entity) => handleEntityCreated(refs, kind, id, entity),
        onMutated: () => {
          remountFromSnapshot(token, refs, 'units', remount);
        }
      });
    };
    remount(curriculum);  });
}

function renderTeacherUnitRoute(unitId: string, token: number): void {
  const refs = mountTeacherShell();
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  const refreshUnit = (): void => {
    const snapshot = peekCurriculum();
    if (snapshot) {
      if (token !== renderToken) return;
      teardownUnitPage();
      unitPageHandle = renderUnitPage(refs.canvas, snapshot, unitId, {
        onMutated: refreshUnit,
        onCoverMutated: () => {
          invalidateCurriculum();
        }
      });
      mountTeacherRail(refs, snapshot, 'units');
      return;
    }
    invalidateCurriculum();
    void getCurriculum()
      .then((curriculum) => {
        if (token !== renderToken) return;
        teardownUnitPage();
        unitPageHandle = renderUnitPage(refs.canvas, curriculum, unitId, {
          onMutated: refreshUnit,
          onCoverMutated: () => {
            invalidateCurriculum();
          }
        });
        mountTeacherRail(refs, curriculum, 'units');
      })
      .catch((error) => {
        if (token !== renderToken) return;
        if (error instanceof ApiClientError && error.code === 'unauthorized') {
          session = { authenticated: false };
          navigate('/sign-in', { replace: true });
          return;
        }
        renderCanvasStatus(refs.canvas, 'Unable to refresh unit. Please refresh to try again.');
      });
  };

  void loadNavAndHandleErrors(refs, token, 'units', undefined, (curriculum) => {
    const unit = curriculum.units.find((entry) => entry.id === unitId);
    if (unit) {
      pushRecent({
        type: 'unit',
        id: unit.id,
        title: unit.title,
        opened_at: new Date().toISOString()
      });
    }
    teardownUnitPage();
    unitPageHandle = renderUnitPage(refs.canvas, curriculum, unitId, {
      onMutated: refreshUnit,
      onCoverMutated: () => {
        invalidateCurriculum();
      }
    });
  });
}

function renderTeacherLessonsRoute(token: number): void {
  const refs = mountTeacherShell();
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'lessons', undefined, (curriculum) => {
    const remount = (data: CurriculumResponse): void => {
      teardownLessonsIndex();
      lessonsIndexHandle = renderLessonsIndex(refs.canvas, data, {
        onCreated: (kind, id, entity) => handleEntityCreated(refs, kind, id, entity),
        onMutated: () => {
          remountFromSnapshot(token, refs, 'lessons', remount);
        }
      });
    };
    remount(curriculum);  });
}

function renderTeacherLessonRoute(lessonId: string, token: number): void {
  const refs = mountTeacherShell();
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading lesson…');

  void loadNavAndHandleErrors(refs, token, 'lessons', undefined, (curriculum) => {
    if (token !== renderToken) return;
    const lesson = curriculum.lessons.find((entry) => entry.id === lessonId);
    if (lesson) {
      pushRecent({
        type: 'lesson',
        id: lesson.id,
        title: lesson.title || 'Untitled lesson',
        opened_at: new Date().toISOString()
      });
    }
    void teardownLessonEditor().then(() => {
      if (token !== renderToken) return;
      lessonEditorHandle = mountLessonEditor({
        refs,
        lessonId,
        media: curriculum.media,
        isStale: () => token !== renderToken
      });
    });
  });
}

function renderStudentLessonRoute(
  lessonId: string,
  token: number,
  classId?: string
): void {
  studentLessonViewHandle = mountStudentLessonView({
    root: appRoot,
    lessonId,
    classId,
    isStale: () => token !== renderToken
  });
}

function renderStudentUnitRoute(unitId: string, token: number): void {
  studentUnitViewHandle = mountStudentUnitView({
    root: appRoot,
    unitId,
    isStale: () => token !== renderToken
  });
}

function renderStudentClassRoute(classId: string, token: number): void {
  studentClassViewHandle = mountStudentClassView({
    root: appRoot,
    classId,
    isStale: () => token !== renderToken
  });
}

function renderNotFoundRoute(token: number): void {
  const home = document.createElement('a');
  home.className = 'btn btn--primary';
  home.href = session.authenticated ? '/' : '/sign-in';
  home.textContent = session.authenticated ? 'Back to dashboard' : 'Sign in';
  home.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(session.authenticated ? '/' : '/sign-in');
  });

  if (session.authenticated) {
    const refs = mountTeacherShell();
    void loadNavAndHandleErrors(refs, token, 'home', undefined, () => {
      refs.canvas.replaceChildren();
      renderPageHeader(refs.canvas, {
        eyebrow: 'Teaching Hub',
        title: 'Page not found',
        supporting: 'That address is not a Teaching Hub page.',
        actions: [home]
      });
    });
    return;
  }

  appRoot.replaceChildren();
  renderPageHeader(appRoot, {
    eyebrow: 'Teaching Hub',
    title: 'Page not found',
    supporting: 'That address is not a Teaching Hub page.',
    actions: [home]
  });
}

function renderRoute(match: RouteMatch, token: number): void {
  switch (match.name) {
    case 'teacher-home':
      renderTeacherHomeRoute(token);
      break;
    case 'teacher-classes':
      renderTeacherClassesRoute(token);
      break;
    case 'teacher-class':
      renderTeacherClassRoute(match.params.classId, token);
      break;
    case 'teacher-resources':
      renderTeacherResourcesRoute(token);
      break;
    case 'teacher-templates':
      renderTeacherTemplatesRoute(token);
      break;
    case 'teacher-trash':
      renderTeacherTrashRoute(token);
      break;
    case 'teacher-scope-sequences':
      renderTeacherScopeSequencesRoute(token);
      break;
    case 'teacher-scope-sequence':
      renderTeacherScopeSequenceRoute(match.params.subjectId, token);
      break;
    case 'teacher-units':
      renderTeacherUnitsRoute(token);
      break;
    case 'teacher-unit':
      renderTeacherUnitRoute(match.params.unitId, token);
      break;
    case 'teacher-lessons':
      renderTeacherLessonsRoute(token);
      break;
    case 'teacher-lesson':
      renderTeacherLessonRoute(match.params.lessonId, token);
      break;
    case 'student-lesson':
      renderStudentLessonRoute(match.params.lessonId, token);
      break;
    case 'student-class-lesson':
      renderStudentLessonRoute(match.params.lessonId, token, match.params.classId);
      break;
    case 'student-unit':
      renderStudentUnitRoute(match.params.unitId, token);
      break;
    case 'student-class':
      renderStudentClassRoute(match.params.classId, token);
      break;
    case 'not-found':
      renderNotFoundRoute(token);
      break;
    default:
      break;
  }
}

async function handleRoute(match: RouteMatch): Promise<void> {
  renderToken += 1;
  const token = renderToken;

  // Every route change navigates away from whatever was previously mounted,
  // so flush any pending lesson edits — and wait for that flush to settle —
  // before tearing the editor down.
  await teardownLessonEditor();
  teardownTeacherHome();
  teardownScopeIndex();
  teardownClassesIndex();
  teardownClassPage();
  teardownUnitsIndex();
  teardownLessonsIndex();
  teardownTrashSection();
  teardownUnitPage();
  teardownStudentLessonView();
  teardownStudentUnitView();
  teardownStudentClassView();

  if (match.requiresAuth && !session.authenticated) {
    navigate('/sign-in', { replace: true });
    return;
  }

  if (match.name === 'sign-in') {
    if (session.authenticated) {
      navigate('/', { replace: true });
      return;
    }

    renderSignIn(appRoot, {
      onSuccess: (nextSession) => {
        session = nextSession;
        navigate('/');
      }
    });
    return;
  }

  renderRoute(match, token);
}

async function init(): Promise<void> {
  try {
    session = await fetchSession();
  } catch {
    session = { authenticated: false };
  }

  window.addEventListener('beforeunload', () => {
    // Browsers don't support awaiting async work in `beforeunload`, so this
    // remains a best-effort attempt for an actual tab close/reload; the
    // awaited flush in `teardownLessonEditor` covers in-app navigation.
    void lessonEditorHandle?.flush();
  });

  window.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
    if (!session.authenticated) return;
    if (currentAppPath().startsWith('/s/')) return;
    event.preventDefault();
    openTeacherSearch();
  });

  startHubMotion(document);

  start((match) => {
    void handleRoute(match);
  });
}

void init();
