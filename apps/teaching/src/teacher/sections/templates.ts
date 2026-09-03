import { applyCreatedEntity } from '@/app/curriculum-state';
import type { CurriculumResponse } from '@/teacher/nav';
import {
  listLessonTemplates,
  listUnitTemplates,
  patchLessonTemplate,
  patchUnitTemplate,
  useLessonTemplate,
  useUnitTemplate
} from '@/teacher/template-api';
import type { LessonTemplateSummary, UnitTemplateSummary } from '@/schemas';
import { navigate } from '@/app/router';
import { confirmAndArchive, confirmAndTrash } from '@/teacher/lifecycle-api';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';
import { renderPageHeader } from '@/teacher/page-header';

type Tab = 'lessons' | 'units';

export interface TemplatesPageOptions {
  onCreated?: () => void | Promise<void>;
}

function pickUnitId(curriculum: CurriculumResponse): string | null {
  const units = [...curriculum.units].sort((a, b) => a.title.localeCompare(b.title));
  if (units.length === 0) return null;
  const labels = units.map((u, i) => `${i + 1}. ${u.title}`).join('\n');
  const answer = window.prompt(`Create lesson in which unit?\n${labels}\nEnter number:`, '1');
  if (!answer) return null;
  const index = Number.parseInt(answer, 10) - 1;
  return units[index]?.id ?? null;
}

function pickSubject(curriculum: CurriculumResponse): { yearId: string; subjectId: string } | null {
  const subjects = [...curriculum.subjects].sort((a, b) => a.title.localeCompare(b.title));
  if (subjects.length === 0) return null;
  const labels = subjects.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
  const answer = window.prompt(`Create unit under which subject?\n${labels}\nEnter number:`, '1');
  if (!answer) return null;
  const index = Number.parseInt(answer, 10) - 1;
  const subject = subjects[index];
  if (!subject) return null;

  const years = [...curriculum.years].sort(
    (a, b) => a.year_level - b.year_level || a.title.localeCompare(b.title)
  );
  if (years.length === 0) return null;
  if (years.length === 1) return { yearId: years[0]!.id, subjectId: subject.id };

  const yearLabels = years.map((y, i) => `${i + 1}. ${y.title}`).join('\n');
  const yearAnswer = window.prompt(`Year level for this unit?\n${yearLabels}\nEnter number:`, '1');
  if (!yearAnswer) return null;
  const yearIndex = Number.parseInt(yearAnswer, 10) - 1;
  const year = years[yearIndex];
  if (!year) return null;
  return { yearId: year.id, subjectId: subject.id };
}

export function renderTemplatesPage(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options: TemplatesPageOptions = {}
): { dispose: () => void } {
  canvas.replaceChildren();
  let tab: Tab = 'lessons';
  let lessonRows: LessonTemplateSummary[] = [];
  let unitRows: UnitTemplateSummary[] = [];
  let statusText = '';
  const rowDisposers: Array<() => void> = [];

  const root = document.createElement('div');
  root.className = 'templates-page';

  renderPageHeader(canvas, { eyebrow: 'Workspace', title: 'Templates' });

  const tabs = document.createElement('div');
  tabs.className = 'hub-pills templates-page__tabs';
  tabs.setAttribute('role', 'tablist');

  const lessonTab = document.createElement('button');
  lessonTab.type = 'button';
  lessonTab.className = 'hub-pills__btn templates-page__tab';
  lessonTab.textContent = 'Lessons';
  const unitTab = document.createElement('button');
  unitTab.type = 'button';
  unitTab.className = 'hub-pills__btn templates-page__tab';
  unitTab.textContent = 'Units';

  const status = document.createElement('p');
  status.className = 'templates-page__status';
  status.hidden = true;

  const list = document.createElement('div');
  list.className = 'templates-page__list';

  tabs.append(lessonTab, unitTab);
  root.append(tabs, status, list);
  canvas.append(root);

  function setStatus(message: string): void {
    statusText = message;
    status.hidden = !message;
    status.textContent = message;
  }

  function paintTabs(): void {
    lessonTab.setAttribute('aria-selected', tab === 'lessons' ? 'true' : 'false');
    unitTab.setAttribute('aria-selected', tab === 'units' ? 'true' : 'false');
    lessonTab.classList.toggle('templates-page__tab--active', tab === 'lessons');
    unitTab.classList.toggle('templates-page__tab--active', tab === 'units');
    lessonTab.classList.toggle('is-active', tab === 'lessons');
    unitTab.classList.toggle('is-active', tab === 'units');
  }

  function renderList(): void {
    for (const dispose of rowDisposers.splice(0)) dispose();
    list.replaceChildren();
    const rows = tab === 'lessons' ? lessonRows : unitRows;
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'teacher-layout__canvas-status';
      empty.textContent =
        tab === 'lessons' ? 'No lesson templates yet.' : 'No unit templates yet.';
      list.append(empty);
      return;
    }

    for (const row of rows) {
      const item = document.createElement('div');
      item.className = 'templates-page__row';

      const info = document.createElement('div');
      const title = document.createElement('p');
      title.className = 'templates-page__title';
      title.textContent = row.title;
      const meta = document.createElement('p');
      meta.className = 'templates-page__meta';
      meta.textContent = `Updated ${new Date(row.updated_at).toLocaleString()}`;
      info.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'templates-page__actions';

      const menu = mountPageOptionsMenu(
        [
          {
            label: 'Use',
            className: 'templates-page__use',
            onSelect: () => {
              void (async () => {
                try {
                  setStatus('Creating…');
                  if (tab === 'lessons') {
                    const unitId = pickUnitId(curriculum);
                    if (!unitId) {
                      setStatus('');
                      return;
                    }
                    const lesson = await useLessonTemplate({ templateId: row.id, unitId });
                    applyCreatedEntity('lesson', lesson);
                    navigate(`/lessons/${lesson.id}`);
                    void options.onCreated?.();
                  } else {
                    const parent = pickSubject(curriculum);
                    if (!parent) {
                      setStatus('');
                      return;
                    }
                    const unit = await useUnitTemplate({
                      templateId: row.id,
                      yearId: parent.yearId,
                      subjectId: parent.subjectId
                    });
                    applyCreatedEntity('unit', unit);
                    navigate(`/units/${unit.id}`);
                    void options.onCreated?.();
                  }
                } catch {
                  setStatus('Unable to create from template.');
                }
              })();
            }
          },
          {
            label: 'Rename',
            onSelect: () => {
              void (async () => {
                const next = window.prompt('New title', row.title);
                if (!next?.trim()) return;
                try {
                  if (tab === 'lessons') await patchLessonTemplate(row.id, { title: next.trim() });
                  else await patchUnitTemplate(row.id, { title: next.trim() });
                  await reload();
                  setStatus('Renamed.');
                } catch {
                  setStatus('Unable to rename.');
                }
              })();
            }
          },
          {
            label: 'Archive',
            onSelect: () => {
              const type = tab === 'lessons' ? 'lesson_template' : 'unit_template';
              confirmAndArchive(type, row.id, row.title, () => {
                if (tab === 'lessons') {
                  lessonRows = lessonRows.filter((entry) => entry.id !== row.id);
                } else {
                  unitRows = unitRows.filter((entry) => entry.id !== row.id);
                }
                renderList();
                setStatus('Archived.');
              });
            }
          },
          {
            label: 'Move to trash',
            danger: true,
            onSelect: () => {
              const type = tab === 'lessons' ? 'lesson_template' : 'unit_template';
              confirmAndTrash(type, row.id, row.title, () => {
                if (tab === 'lessons') {
                  lessonRows = lessonRows.filter((entry) => entry.id !== row.id);
                } else {
                  unitRows = unitRows.filter((entry) => entry.id !== row.id);
                }
                renderList();
                setStatus('Moved to trash.');
              });
            }
          }
        ],
        { label: `Options for ${row.title}` }
      );
      rowDisposers.push(menu.dispose);

      actions.append(menu.el);
      item.append(info, actions);
      list.append(item);
    }
  }

  async function reload(): Promise<void> {
    try {
      const [lessons, units] = await Promise.all([listLessonTemplates(), listUnitTemplates()]);
      lessonRows = lessons.templates;
      unitRows = units.templates;
      paintTabs();
      renderList();
    } catch {
      setStatus('Unable to load templates.');
    }
  }

  lessonTab.addEventListener('click', () => {
    tab = 'lessons';
    paintTabs();
    renderList();
  });
  unitTab.addEventListener('click', () => {
    tab = 'units';
    paintTabs();
    renderList();
  });

  paintTabs();
  void reload();
  if (statusText) setStatus(statusText);

  return {
    dispose: () => {
      for (const dispose of rowDisposers.splice(0)) dispose();
    }
  };
}
