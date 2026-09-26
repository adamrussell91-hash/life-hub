import { navigate } from '@/app/router';
import { withAppBase } from '@/app/base-path';
import type { Class, Subject, Year } from '@/schemas';
import { resolveScheduleToday } from '@/schedule/today';
import { classDisplayTitle, classEyebrow } from '@/teacher/class-heading';
import {
  mountTeachingCalendar,
  TEACHING_CALENDAR_MIN_EMBED_PX,
  unmountTeachingCalendar
} from '@/teacher/hub-calendar';
import { renderPageHeader } from '@/teacher/page-header';
import { openBlankLesson } from '@/teacher/create/blank-lesson';
import { patchScheduledLesson } from '@/teacher/schedule-api';
import { mountCreateControl } from '@/teacher/create/control';
import { openCreateModal } from '@/teacher/create/modal';
import type { EntityCreatedHandler } from '@/teacher/create/types';
import {
  readDashboardCover,
  writeDashboardCover
} from '@/teacher/dashboard-cover';
import { renderEntityBanner } from '@/teacher/entity-banner';
import { wireEntityCardExpand } from '@/teacher/entity-card-expand';
import { mountHomeClock } from '@/teacher/home-clock';
import type { CurriculumResponse } from './nav';

export interface TeacherHomeOptions {
  onCreated?: EntityCreatedHandler;
}

/**
 * Dashboard: cover banner, clock, shared calendar, class tiles.
 */
export function renderTeacherHome(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options: TeacherHomeOptions = {}
): { dispose: () => void } {
  canvas.replaceChildren();

  renderPageHeader(canvas, { eyebrow: 'Workspace', title: 'Dashboard' });

  const yearsById = new Map(curriculum.years.map((year) => [year.id, year]));
  const subjectsById = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
  const scheduleToday = resolveScheduleToday(curriculum.schedule_anchor_date);

  const disposers: Array<() => void> = [];

  const root = document.createElement('div');
  root.className = 'home-dashboard';

  const createHost = document.createElement('div');
  createHost.className = 'home-dashboard__create create-control';
  createHost.dataset.createHost = '';

  const bannerHost = document.createElement('div');
  bannerHost.className = 'home-dashboard__banner';
  const banner = renderEntityBanner(bannerHost, {
    cover: readDashboardCover(),
    media: curriculum.media,
    title: '',
    entityId: 'dashboard',
    editable: true,
    onSave: (cover) => {
      writeDashboardCover(cover);
    }
  });
  disposers.push(banner.dispose);

  const toolbar = document.createElement('div');
  toolbar.className = 'home-dashboard__toolbar';

  const clockHost = document.createElement('div');
  clockHost.className = 'home-dashboard__clock';
  disposers.push(mountHomeClock(clockHost));
  toolbar.append(clockHost, createHost);

  const createControl = mountCreateControl(createHost, {
    context: 'home',
    curriculum,
    onCreated: options.onCreated ?? (() => undefined)
  });
  disposers.push(createControl.dispose);

  const calendarHost = document.createElement('div');
  calendarHost.className = 'home-dashboard__calendar';
  calendarHost.style.minWidth = '0';

  const openCalendarAdd = (): void => {
    openBlankLesson({
      curriculum,
      onCreated: options.onCreated ?? (() => undefined)
    });
  };

  const mountOpts = {
    today: scheduleToday,
    onQuickAdd: openCalendarAdd,
    quickAddLabel: 'Create lesson',
    onReschedule: (scheduledId: string, patch: { date?: string; start_time?: string | null }) => {
      void patchScheduledLesson(scheduledId, patch).then((updated) => {
        curriculum.scheduled_lessons = curriculum.scheduled_lessons.map((row) =>
          row.id === updated.id ? updated : row
        );
      });
    }
  };

  const paintCalendarHost = (): void => {
    unmountTeachingCalendar();
    calendarHost.replaceChildren();
    const width = calendarHost.clientWidth || calendarHost.getBoundingClientRect().width;
    if (width > 0 && width < TEACHING_CALENDAR_MIN_EMBED_PX) {
      const note = document.createElement('p');
      note.className = 'home-dashboard__calendar-narrow';
      note.textContent = 'Calendar needs more width — open the full page.';
      const link = document.createElement('a');
      link.className = 'home-dashboard__calendar-link btn btn--secondary';
      link.href = withAppBase('/calendar');
      link.textContent = 'Open calendar';
      link.addEventListener('click', (event) => {
        event.preventDefault();
        navigate('/calendar');
      });
      calendarHost.append(note, link);
      return;
    }
    mountTeachingCalendar(calendarHost, mountOpts);
  };

  // Defer measure so the host has a laid-out width.
  queueMicrotask(paintCalendarHost);
  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          const linked = Boolean(calendarHost.querySelector('.home-dashboard__calendar-link'));
          const width = calendarHost.clientWidth || calendarHost.getBoundingClientRect().width;
          const shouldLink = width > 0 && width < TEACHING_CALENDAR_MIN_EMBED_PX;
          const mounted = Boolean(calendarHost.querySelector('[data-part="hub-calendar-mount"]'));
          if (shouldLink === linked && (shouldLink || mounted)) return;
          paintCalendarHost();
        })
      : null;
  ro?.observe(calendarHost);
  disposers.push(() => {
    ro?.disconnect();
    unmountTeachingCalendar();
  });

  const openCreateClass = (): void => {
    openCreateModal({
      kind: 'class',
      curriculum,
      onCreated: options.onCreated ?? (() => undefined)
    });
  };

  root.append(
    bannerHost,
    toolbar,
    calendarHost,
    buildClassesPanel(
      curriculum.classes.filter((cls) => cls.status === 'active'),
      yearsById,
      subjectsById,
      curriculum.media,
      openCreateClass
    )
  );

  canvas.append(root);

  return {
    dispose: () => {
      for (const dispose of disposers) dispose();
      disposers.length = 0;
    }
  };
}

function buildClassesPanel(
  classes: Class[],
  yearsById: Map<string, Year>,
  subjectsById: Map<string, Subject>,
  media: CurriculumResponse['media'],
  onCreate: () => void
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'home-dashboard__classes';
  panel.dataset.homePanel = 'classes';

  const headingRow = document.createElement('div');
  headingRow.className = 'home-dashboard__heading-row';

  const heading = document.createElement('h2');
  heading.className = 'home-dashboard__heading';
  heading.textContent = 'Your classes';

  const addClass = document.createElement('button');
  addClass.type = 'button';
  addClass.className = 'icon-plus-btn';
  addClass.setAttribute('aria-label', 'New class');
  addClass.textContent = '+';
  addClass.addEventListener('click', onCreate);

  headingRow.append(heading, addClass);
  panel.append(headingRow);

  const grid = document.createElement('div');
  grid.className = 'home-classes';

  const sorted = [...classes].sort((a, b) => a.code.localeCompare(b.code));

  if (sorted.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'home-dashboard__empty';
    empty.textContent = 'No classes yet. Create one to get started.';
    grid.append(empty);
  } else {
    for (const cls of sorted) {
      const path = `/classes/${cls.id}`;
      const classTitle = classDisplayTitle(cls, yearsById, subjectsById);
      const tile = document.createElement('a');
      tile.className = 'glass-panel glass-tile home-class-tile';
      tile.href = path;
      tile.dataset.homeClassId = cls.id;
      wireEntityCardExpand(tile, {
        kind: 'class',
        id: cls.id,
        title: classTitle,
        eyebrow: classEyebrow(cls),
        cover: cls.cover ?? null,
        media,
        fullPagePath: path,
        metaText: classTitle
      });

      const eyebrow = document.createElement('p');
      eyebrow.className = 'home-class-tile__eyebrow';
      eyebrow.textContent = classEyebrow(cls);

      const name = document.createElement('p');
      name.className = 'home-class-tile__title';
      name.textContent = classTitle;

      tile.append(eyebrow, name);
      grid.append(tile);
    }
  }

  panel.append(grid);
  return panel;
}
