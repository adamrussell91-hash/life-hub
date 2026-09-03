import { FAILURE } from '@/app/failure';
import { ApiClientError } from '@/api/client';
import { navigate } from '@/app/router';
import {
  emptyMessageForCollection,
  resolveCollection
} from '@/blocks/collection-resolve';
import { renderBlock, renderCollectionBlock } from '@/blocks/render';
import { localTodayYmd } from '@/schedule/today';
import {
  continueLabel,
  pickStudentContinue,
  publishedSchedule
} from '@/student/continue';
import { formatStudentDate } from '@/student/format';
import { renderStudentHero } from '@/student/hero';
import {
  fetchPublishedClass,
  type PublishedClass,
  type PublishedClassScheduleRow
} from '@/student/published-class';
import {
  createStudentShell,
  renderStudentChrome,
  renderStudentStatus,
  studentAnchor
} from '@/student/shell';

export interface MountStudentClassViewOptions {
  root: HTMLElement;
  classId: string;
  /** Returns true if this mount has been superseded by a newer route render. */
  isStale?: () => boolean;
}

export interface StudentClassViewHandle {
  dispose(): void;
}

const HOMEPAGE_REGIONS = [
  { key: 'announcements' as const, title: 'Announcements' },
  { key: 'resources' as const, title: 'Resources' },
  { key: 'custom' as const, title: 'Custom' }
];

function studentLessonHref(cls: PublishedClass, lessonId: string): string | null {
  const row = cls.schedule.find((entry) => entry.lesson_id === lessonId);
  if (!row?.published) return null;
  return `/s/classes/${cls.id}/lessons/${lessonId}`;
}

function renderPublishedClass(content: HTMLElement, cls: PublishedClass): void {
  content.replaceChildren();

  const page = document.createElement('div');
  page.className = 'student-class';

  const today = localTodayYmd();
  const continueRow = pickStudentContinue(cls.schedule, today);
  const published = publishedSchedule(cls.schedule);

  page.append(
    renderStudentHero({
      title: cls.title || cls.code,
      eyebrow: cls.title ? cls.code : undefined,
      entityId: cls.id,
      cover: cls.cover
    })
  );

  const layout = document.createElement('div');
  layout.className = 'student-class__layout';

  const main = document.createElement('div');
  main.className = 'student-class__main';

  if (continueRow) {
    const href = studentLessonHref(cls, continueRow.lesson_id);
    if (href) {
      const card = document.createElement('section');
      card.className = 'student-continue';
      card.dataset.classSection = 'continue';

      const kicker = document.createElement('p');
      kicker.className = 'student-continue__kicker';
      kicker.textContent = continueLabel(continueRow.date, today);

      const title = document.createElement('h2');
      title.className = 'student-continue__title';
      title.textContent = continueRow.title;

      const meta = document.createElement('p');
      meta.className = 'student-continue__meta';
      meta.textContent = formatStudentDate(continueRow.date);

      const open = studentAnchor(href, 'student-continue__open', 'Open lesson');

      card.append(kicker, title, meta, open);
      main.append(card);
    }
  }

  if (published.length > 0) {
    const section = document.createElement('section');
    section.className = 'student-schedule';
    section.dataset.classSection = 'schedule';

    const heading = document.createElement('h2');
    heading.className = 'student-section-title';
    heading.textContent = 'Schedule';
    section.append(heading);

    const list = document.createElement('ol');
    list.className = 'student-schedule__list';

    for (const row of published) {
      const href = studentLessonHref(cls, row.lesson_id);
      if (!href) continue;
      const item = document.createElement('li');
      item.className = 'student-schedule__item';
      const link = studentAnchor(href, 'student-schedule__link', row.title);
      const date = document.createElement('time');
      date.className = 'student-schedule__date';
      date.dateTime = row.date;
      date.textContent = formatStudentDate(row.date);
      item.append(date, link);
      list.append(item);
    }
    section.append(list);
    main.append(section);
  }

  if (cls.active_units.length > 0) {
    const section = document.createElement('section');
    section.className = 'student-units';
    section.dataset.classSection = 'units';

    const heading = document.createElement('h2');
    heading.className = 'student-section-title';
    heading.textContent = 'Units';
    section.append(heading);

    const grid = document.createElement('div');
    grid.className = 'student-units__grid';
    for (const unit of cls.active_units) {
      const card = studentAnchor(`/s/units/${unit.id}`, 'student-unit-card');

      const name = document.createElement('span');
      name.className = 'student-unit-card__title';
      name.textContent = unit.title;
      card.append(name);

      const count = published.filter((row) => row.unit_id === unit.id).length;
      const meta = document.createElement('span');
      meta.className = 'student-unit-card__meta';
      meta.textContent =
        count === 1 ? '1 published lesson' : `${count} published lessons`;
      card.append(meta);

      grid.append(card);
    }
    section.append(grid);
    main.append(section);
  }

  const side = document.createElement('aside');
  side.className = 'student-class__side';

  const announcementBlocks = cls.homepage.announcements ?? [];
  if (announcementBlocks.length > 0) {
    side.append(renderHomepageRegion(cls, 'announcements', 'Announcements'));
  }

  for (const region of HOMEPAGE_REGIONS) {
    if (region.key === 'announcements') continue;
    const blocks = cls.homepage[region.key] ?? [];
    if (blocks.length === 0) continue;
    side.append(renderHomepageRegion(cls, region.key, region.title));
  }

  layout.append(main);
  if (side.childElementCount > 0) layout.append(side);
  page.append(layout);
  content.append(page);
}

function renderHomepageRegion(
  cls: PublishedClass,
  key: 'announcements' | 'resources' | 'custom',
  title: string
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'student-panel student-class__section';
  section.dataset.classSection = `homepage-${key}`;
  section.dataset.homepageRegion = key;

  const heading = document.createElement('h2');
  heading.className = 'student-section-title student-class__heading';
  heading.textContent = title;
  section.append(heading);

  const list = document.createElement('div');
  list.className = 'student-class__blocks';
  for (const block of cls.homepage[key] ?? []) {
    if (block.block_type === 'collection') {
      const ctx = {
        currentUnitId: cls.current_unit?.id,
        unitLessons: (cls.current_unit?.lessons ?? []).map((l) => ({
          lesson_id: l.id,
          title: l.title
        })),
        schedule: cls.schedule.map((row: PublishedClassScheduleRow) => ({
          lesson_id: row.lesson_id,
          title: row.title,
          schedule_order: row.schedule_order,
          published: row.published
        }))
      };
      const links = resolveCollection(block.content, ctx, { publishedOnly: true });
      const emptyMessage = emptyMessageForCollection(block.content.source, {
        hasCurrentUnit: Boolean(cls.current_unit?.id),
        linkCount: links.length
      });
      const collectionEl = renderCollectionBlock(block, 'student', { links, emptyMessage });
      for (const anchor of collectionEl.querySelectorAll<HTMLAnchorElement>('a.student-class__link')) {
        const href = anchor.getAttribute('href');
        if (!href) continue;
        anchor.addEventListener('click', (event) => {
          event.preventDefault();
          navigate(href);
        });
      }
      list.append(collectionEl);
    } else {
      list.append(renderBlock(block, 'student'));
    }
  }
  section.append(list);
  return section;
}

/**
 * Loads a published class and renders the public student class surface:
 * hero, continue card, published schedule, units, and homepage regions.
 */
export function mountStudentClassView(
  options: MountStudentClassViewOptions
): StudentClassViewHandle {
  const { root, classId, isStale = () => false } = options;
  let disposed = false;

  root.replaceChildren();
  const { surface, header, content } = createStudentShell(
    'student-surface__content--class'
  );
  root.append(surface);
  renderStudentChrome(header, { brand: 'Teaching Hub' });
  renderStudentStatus(content, 'Loading class…');

  void fetchPublishedClass(classId)
    .then((cls) => {
      if (disposed || isStale()) return;
      renderStudentChrome(header, { brand: cls.code || 'Teaching Hub' });
      renderPublishedClass(content, cls);
    })
    .catch((error: unknown) => {
      if (disposed || isStale()) return;
      const message =
        error instanceof ApiClientError && error.code === 'not_found'
          ? 'Class not found.'
          : FAILURE.network;
      renderStudentStatus(content, message);
    });

  return {
    dispose() {
      disposed = true;
    }
  };
}
