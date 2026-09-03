import { navigate } from '@/app/router';
import type { Class, Subject, Year } from '@/schemas';
import {
  buildClassCalendarModel,
  shiftYearMonth,
  yearMonthFromDate
} from '@/schedule/class-calendar-model';
import { resolveScheduleToday } from '@/schedule/today';
import { classDisplayTitle, classEyebrow } from '@/teacher/class-heading';
import {
  renderClassCalendar,
  type ScheduleCalendarView
} from '@/teacher/class-calendar';
import { openBlankLesson } from '@/teacher/create/blank-lesson';
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

  const classesById = new Map(curriculum.classes.map((cls) => [cls.id, cls]));
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
    title: 'Dashboard',
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

  let selectedDate = scheduleToday;
  let viewMonth = yearMonthFromDate(scheduleToday);
  let calendarView: ScheduleCalendarView = 'week';
  let monthDelta = 0;

  const lessonTitles = new Map(
    curriculum.lessons.map((lesson) => [lesson.id, lesson.title] as const)
  );

  const paintCalendar = (): void => {
    const model = buildClassCalendarModel({
      scheduled: curriculum.scheduled_lessons,
      lessonTitles,
      today: scheduleToday,
      selectedDate,
      viewMonth
    });
    renderClassCalendar(calendarHost, model, {
      view: calendarView,
      onViewChange: (next) => {
        calendarView = next;
        monthDelta = 0;
        paintCalendar();
      },
      onSelectDate: (date) => {
        selectedDate = date;
        viewMonth = yearMonthFromDate(date);
        monthDelta = 0;
        paintCalendar();
      },
      onShiftMonth: (delta) => {
        viewMonth = shiftYearMonth(viewMonth, delta);
        monthDelta = delta;
        paintCalendar();
      },
      monthDelta,
      onNavigate: navigate,
      onScheduleLesson: () => {
        openBlankLesson({
          curriculum,
          onCreated: options.onCreated ?? (() => undefined)
        });
      },
      chipMeta: (lesson) => {
        const cls = lesson.classId ? classesById.get(lesson.classId) : undefined;
        return cls ? classEyebrow(cls) : undefined;
      }
    });
  };
  paintCalendar();

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
        metaText: classTitle,
        editableTitle: false
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
