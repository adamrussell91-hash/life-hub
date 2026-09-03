import { ApiClientError } from '@/api/client';
import { navigate } from '@/app/router';
import type { CollectionResolveContext } from '@/blocks/collection-resolve';
import type { Class, ScheduledLesson, Unit } from '@/schemas';
import { resolveCoverUrl } from '@/schemas';
import {
  buildClassCalendarModel,
  shiftYearMonth,
  yearMonthFromDate
} from '@/schedule/class-calendar-model';
import { resolveScheduleToday } from '@/schedule/today';
import { classDisplayTitle, classEyebrow } from '@/teacher/class-heading';
import { renderClassCalendar, type ScheduleCalendarView } from '@/teacher/class-calendar';
import { mountCreateControl } from '@/teacher/create/control';
import type { EntityCreatedHandler } from '@/teacher/create/types';
import { renderEntityBanner } from '@/teacher/entity-banner';
import { wireEntityCardExpand } from '@/teacher/entity-card-expand';
import type { CurriculumResponse } from '@/teacher/nav';
import {
  mountHomepageEditor,
  normalizeHomepage,
  renderHomepageRegionsView,
  type HomepageEditorHandle
} from '@/teacher/sections/homepage-editor';
import { patchClass, patchScheduledLesson } from '@/teacher/schedule-api';
import { openScheduleOverflow } from '@/teacher/schedule-overflow';
import { confirmAndArchive, confirmAndTrash } from '@/teacher/lifecycle-api';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';
import { renderUnitSequence } from '@/teacher/unit-sequence';
import { renderPageHeader } from '@/teacher/page-header';

export interface ClassesIndexOptions {
  onCreated?: EntityCreatedHandler;
  onMutated?: () => void | Promise<void>;
}

export interface ClassPageOptions {
  onScheduleMutated?: () => void | Promise<void>;
  /** Cover-only invalidation; must not remount the page or its editors. */
  onCoverMutated?: () => void | Promise<void>;
  onScheduleUnit?: () => void;
  onCreateLesson?: () => void;
}

export function renderClassesIndex(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options: ClassesIndexOptions = {}
): { dispose: () => void } {
  canvas.replaceChildren();

  const disposers: Array<() => void> = [];

  const createHost = document.createElement('div');
  createHost.className = 'classes-index__create create-control';
  createHost.dataset.createHost = '';

  renderPageHeader(canvas, { eyebrow: 'Workspace', title: 'Classes', actions: [createHost] });

  const createControl = mountCreateControl(createHost, {
    context: 'classes',
    curriculum,
    onCreated: options.onCreated ?? (() => undefined)
  });
  disposers.push(createControl.dispose);

  const yearsById = new Map(curriculum.years.map((year) => [year.id, year]));
  const subjectsById = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
  const classes = curriculum.classes
    .filter((cls) => cls.status === 'active')
    .sort((a, b) => a.code.localeCompare(b.code));

  const grid = document.createElement('div');
  grid.className = 'home-classes classes-index__grid';

  if (classes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No classes yet.';
    grid.append(empty);
  } else {
    for (const cls of classes) {
      const path = `/classes/${cls.id}`;

      const card = document.createElement('div');
      card.className = 'classes-index__card';

      const tile = document.createElement('a');
      tile.className = 'glass-tile home-class-tile entity-cover-tile';
      tile.href = path;
      tile.dataset.classId = cls.id;

      const classTitle = classDisplayTitle(cls, yearsById, subjectsById);
      disposers.push(
        wireEntityCardExpand(
          tile,
          {
            kind: 'class',
            id: cls.id,
            title: classTitle,
            eyebrow: classEyebrow(cls),
            cover: cls.cover ?? null,
            media: curriculum.media,
            fullPagePath: path,
            metaText: classTitle,
            editableTitle: false
          },
          { onMutated: options.onMutated }
        ).dispose
      );

      const coverUrl = resolveCoverUrl(cls.cover, curriculum.media);
      if (coverUrl) {
        const media = document.createElement('div');
        media.className = 'entity-cover-tile__media';
        const img = document.createElement('img');
        img.src = coverUrl;
        img.alt = '';
        media.append(img);
        tile.append(media);
      }

      const body = document.createElement('div');
      body.className = 'entity-cover-tile__body';

      const eyebrow = document.createElement('p');
      eyebrow.className = 'home-class-tile__eyebrow';
      eyebrow.textContent = classEyebrow(cls);

      const title = document.createElement('p');
      title.className = 'home-class-tile__title';
      title.textContent = classTitle;

      body.append(eyebrow, title);
      tile.append(body);

      const menu = mountPageOptionsMenu(
        [
          {
            label: 'Archive',
            onSelect: () => {
              confirmAndArchive('class', cls.id, cls.code || cls.title, () => {
                void options.onMutated?.();
              });
            }
          },
          {
            label: 'Move to trash',
            danger: true,
            onSelect: () => {
              confirmAndTrash('class', cls.id, cls.code || cls.title, () => {
                void options.onMutated?.();
              });
            }
          }
        ],
        { label: `Options for ${cls.code || cls.title}` }
      );
      disposers.push(menu.dispose);
      card.append(tile, menu.el);
      grid.append(card);
    }
  }

  canvas.append(grid);

  return {
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}

export function renderClassPage(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  classId: string,
  options: ClassPageOptions = {}
): { dispose: () => void } {
  canvas.replaceChildren();

  const disposers: Array<() => void> = [];

  const cls = curriculum.classes.find((entry) => entry.id === classId);
  if (!cls) {
    renderPageHeader(canvas, { eyebrow: 'Classes', title: 'Class not found' });
    const status = document.createElement('p');
    status.className = 'teacher-layout__canvas-status';
    status.textContent = 'Class not found.';
    canvas.append(status);
    return { dispose: () => undefined };
  }
  const pageClass: Class = cls;

  const yearsById = new Map(curriculum.years.map((year) => [year.id, year]));
  const subjectsById = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
  const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit]));
  const classTitle = classDisplayTitle(pageClass, yearsById, subjectsById);
  const studentPath = `/s/classes/${cls.id}`;

  const optionsMenu = mountPageOptionsMenu(
    [
      {
        label: 'View as student',
        className: 'class-page__view-as-student',
        href: studentPath,
        target: '_blank',
        onSelect: () => {
          window.open(studentPath, '_blank', 'noopener,noreferrer');
        }
      },
      {
        label: 'Edit page',
        className: 'class-page__edit-homepage',
        onSelect: () => {
          showEditMode();
        }
      },
      {
        label: 'Archive',
        onSelect: () => {
          confirmAndArchive('class', pageClass.id, pageClass.code || pageClass.title, () => {
            navigate('/classes');
          });
        }
      },
      {
        label: 'Move to trash',
        danger: true,
        onSelect: () => {
          confirmAndTrash('class', pageClass.id, pageClass.code || pageClass.title, () => {
            navigate('/classes');
          });
        }
      }
    ],
    { label: `Options for ${classTitle}` }
  );
  disposers.push(optionsMenu.dispose);

  renderPageHeader(canvas, {
    actions: [optionsMenu.el]
  });

  const today = resolveScheduleToday(curriculum.schedule_anchor_date);

  const classScheduled = curriculum.scheduled_lessons
    .filter((entry) => entry.class_id === cls.id)
    .sort(compareScheduledLessons);

  const lessonTitles = new Map(
    curriculum.lessons.map((lesson) => [lesson.id, lesson.title] as const)
  );
  const unitTitles = new Map(curriculum.units.map((unit) => [unit.id, unit.title] as const));

  const activeUnits = cls.active_unit_ids
    .map((id) => unitsById.get(id))
    .filter((unit): unit is Unit => Boolean(unit));

  const root = document.createElement('div');
  root.className = 'class-page';

  // 1. Banner
  const bannerHost = document.createElement('div');
  bannerHost.className = 'class-page__banner';
  const banner = renderEntityBanner(bannerHost, {
    cover: cls.cover,
    media: curriculum.media,
    title: classTitle,
    eyebrow: classEyebrow(cls),
    entityId: cls.id,
    editable: true,
    onSave: async (cover) => {
      const saved = await patchClass(cls.id, { cover });
      if (saved.cover) pageClass.cover = saved.cover;
      else delete pageClass.cover;
      await options.onCoverMutated?.();
    }
  });
  disposers.push(banner.dispose);

  // Body
  const body = document.createElement('div');
  body.className = 'class-page__body';

  const main = document.createElement('div');
  main.className = 'class-page__main';

  // Calendar — local state, re-paint host only
  const calendarHost = document.createElement('div');
  calendarHost.className = 'class-page__calendar-host';
  main.append(calendarHost);

  let selectedDate = today;
  let viewMonth = yearMonthFromDate(today);
  let calendarView: ScheduleCalendarView = window.matchMedia('(max-width: 768px)').matches
    ? 'week'
    : 'month';
  let monthDelta = 0;

  const errorBanner = document.createElement('p');
  errorBanner.className = 'class-page__error';
  errorBanner.hidden = true;
  errorBanner.setAttribute('role', 'alert');

  const paintCalendar = (): void => {
    const model = buildClassCalendarModel({
      scheduled: classScheduled,
      lessonTitles,
      today,
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
      unitTitles,
      onNavigate: navigate,
      onScheduleLesson: () => options.onCreateLesson?.(),
      onLessonOverflow: (scheduledId, anchor) => {
        openLessonOverflow(cls, classScheduled, scheduledId, anchor, options, errorBanner);
      }
    });
  };
  paintCalendar();
  main.append(errorBanner);

  // 6. Unit sequence
  const sequenceHost = document.createElement('div');
  sequenceHost.className = 'class-page__sequence-host';
  main.append(sequenceHost);

  const sequence = renderUnitSequence(sequenceHost, {
    units: activeUnits,
    scheduled: classScheduled,
    lessonTitles,
    currentUnitId: cls.current_unit_id ?? activeUnits[0]?.id ?? '',
    classId: cls.id,
    today,
    onMoveUp: (scheduledId) => {
      void runScheduleMutation(options, errorBanner, async () => {
        await patchScheduledLesson(scheduledId, { direction: 'up' });
      });
    },
    onMoveDown: (scheduledId) => {
      void runScheduleMutation(options, errorBanner, async () => {
        await patchScheduledLesson(scheduledId, { direction: 'down' });
      });
    },
    onOverflow: (scheduledId, anchor) => {
      openLessonOverflow(cls, classScheduled, scheduledId, anchor, options, errorBanner);
    },
    onNavigate: navigate
  });
  disposers.push(sequence.dispose);

  // 7. Side column — announcements + resources + folded custom
  const side = document.createElement('aside');
  side.className = 'class-page__side';

  const sideHost = document.createElement('div');
  sideHost.className = 'class-page__homepage-regions';
  side.append(sideHost);

  const resolveContext = collectionContextForClass(cls, curriculum);
  let editorHandle: HomepageEditorHandle | null = null;

  function showViewMode(): void {
    editorHandle?.destroy();
    editorHandle = null;
    renderHomepageRegionsView(
      sideHost,
      normalizeHomepage(pageClass.homepage),
      resolveContext,
      ['announcements', 'resources', 'custom'],
      {
        emptyCopy: {
          announcements:
            'Nothing posted. Students see announcements at the top of their class page.',
          resources: 'Texts, links and files this class should have alongside every lesson.'
        },
        hideHeadingFor: ['custom'],
        omitEmpty: ['custom']
      }
    );

    const announcements = sideHost.querySelector('[data-homepage-region="announcements"]');
    if (announcements && !announcements.querySelector('.homepage-regions__blocks')) {
      const writeOne = document.createElement('button');
      writeOne.type = 'button';
      writeOne.className = 'btn btn--secondary class-page__write-announcement';
      writeOne.textContent = 'Write one';
      writeOne.addEventListener('click', () => {
        showEditMode();
      });
      announcements.append(writeOne);
    }

    const resources = sideHost.querySelector('[data-homepage-region="resources"]');
    if (resources && !resources.querySelector('.homepage-regions__blocks')) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn--secondary class-page__add-resource';
      add.textContent = 'Add';
      add.addEventListener('click', () => {
        showEditMode();
      });
      resources.append(add);
    }
  }

  function showEditMode(): void {
    editorHandle?.destroy();
    editorHandle = mountHomepageEditor(sideHost, normalizeHomepage(pageClass.homepage), {
      classId: pageClass.id,
      resolveContext,
      onSave: async (homepage) => {
        await patchClass(pageClass.id, { homepage });
        await options.onScheduleMutated?.();
      },
      onRestored: (restored) => {
        pageClass.homepage = normalizeHomepage(restored.homepage);
      },
      onCancel: () => {
        showViewMode();
      }
    });
  }

  showViewMode();
  disposers.push(() => {
    editorHandle?.destroy();
    editorHandle = null;
  });

  body.append(main, side);
  root.append(bannerHost, body);
  canvas.append(root);

  return {
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}

function collectionContextForClass(
  cls: Class,
  curriculum: CurriculumResponse
): CollectionResolveContext {
  const unit = cls.current_unit_id
    ? curriculum.units.find((u) => u.id === cls.current_unit_id)
    : undefined;
  const lessonsById = new Map(curriculum.lessons.map((l) => [l.id, l]));
  const unitLessons = (unit?.lesson_ids ?? [])
    .map((id) => {
      const lesson = lessonsById.get(id);
      return lesson ? { lesson_id: lesson.id, title: lesson.title } : null;
    })
    .filter((x): x is { lesson_id: string; title: string } => x !== null);

  const schedule = curriculum.scheduled_lessons
    .filter((row) => row.class_id === cls.id)
    .map((row) => ({
      lesson_id: row.lesson_id,
      title: lessonsById.get(row.lesson_id)?.title ?? row.lesson_id,
      schedule_order: row.schedule_order,
      published: true // teacher preview treats scheduled rows as listable
    }));

  return {
    currentUnitId: cls.current_unit_id,
    unitLessons,
    schedule
  };
}

function openLessonOverflow(
  cls: Class,
  scheduled: ScheduledLesson[],
  scheduledId: string,
  anchor: HTMLElement,
  options: ClassPageOptions,
  errorBanner: HTMLElement
): void {
  const row = scheduled.find((entry) => entry.id === scheduledId);
  if (!row) return;
  openScheduleOverflow(anchor, {
    currentDate: row.date,
    isCurrent: cls.current_scheduled_lesson_id === scheduledId,
    onSetCurrent: () => {
      void runScheduleMutation(options, errorBanner, async () => {
        await patchClass(cls.id, { current_scheduled_lesson_id: scheduledId });
      });
    },
    onChangeDate: (date) => {
      void runScheduleMutation(options, errorBanner, async () => {
        await patchScheduledLesson(scheduledId, { date });
      });
    }
  });
}

async function runScheduleMutation(
  options: ClassPageOptions,
  errorBanner: HTMLElement,
  mutate: () => void | Promise<void>,
  onError?: () => void
): Promise<void> {
  errorBanner.hidden = true;
  errorBanner.textContent = '';
  try {
    await mutate();
    await options.onScheduleMutated?.();
  } catch (error) {
    const message =
      error instanceof ApiClientError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unable to update schedule.';
    errorBanner.hidden = false;
    errorBanner.textContent = message;
    onError?.();
  }
}

function compareScheduledLessons(a: ScheduledLesson, b: ScheduledLesson): number {
  const byOrder = a.schedule_order - b.schedule_order;
  if (byOrder !== 0) return byOrder;
  return a.date.localeCompare(b.date);
}
