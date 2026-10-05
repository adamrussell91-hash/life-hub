import { applyCreatedEntity } from '@/app/curriculum-state';
import type { CurriculumResponse } from '@/teacher/nav';
import {
  listLessonTemplates,
  listUnitTemplates,
  patchLessonTemplate,
  patchUnitTemplate,
  useUnitTemplate
} from '@/teacher/template-api';
import type { LessonTemplateSummary, UnitTemplateSummary } from '@/schemas';
import { navigate } from '@/app/router';
import { askSelectCard, askTextCard } from '@/teacher/confirm-dialog';
import { promptLessonFromTemplate } from '@/teacher/lessons-library/from-template';
import { confirmAndArchive, confirmAndTrash } from '@/teacher/lifecycle-api';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';
import { renderPageHeader } from '@/teacher/page-header';

type Tab = 'lessons' | 'units';

export interface TemplatesPageOptions {
  onCreated?: () => void | Promise<void>;
}

async function pickSubject(
  curriculum: CurriculumResponse
): Promise<{ yearId: string; subjectId: string } | null> {
  const subjects = curriculum.subjects
    .filter((subject) => subject.status !== 'trashed')
    .sort((a, b) => a.title.localeCompare(b.title));
  if (subjects.length === 0) return null;
  const subjectId = await askSelectCard({
    title: 'Create unit under which subject?',
    choices: subjects.map((subject) => ({ value: subject.id, label: subject.title }))
  });
  if (!subjectId) return null;

  const years = [...curriculum.years].sort(
    (a, b) => a.year_level - b.year_level || a.title.localeCompare(b.title)
  );
  if (years.length === 0) return null;
  if (years.length === 1) return { yearId: years[0]!.id, subjectId };

  const yearId = await askSelectCard({
    title: 'Year level for this unit?',
    choices: years.map((year) => ({ value: year.id, label: year.title }))
  });
  return yearId ? { yearId, subjectId } : null;
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

  renderPageHeader(canvas, { eyebrow: 'Teaching Hub', title: 'Templates' });

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
      if (statusText) return;
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
                    // The kit dialog picks an active unit; a typed-number prompt listed trashed
                    // units and fails outright in browsers that block window.prompt.
                    setStatus('');
                    const lesson = await promptLessonFromTemplate(curriculum, row.id);
                    if (!lesson) return;
                    applyCreatedEntity('lesson', lesson);
                    navigate(`/lessons/${lesson.id}`);
                    void options.onCreated?.();
                  } else {
                    const parent = await pickSubject(curriculum);
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
                const next = await askTextCard({ title: 'Rename template', value: row.title });
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
              void confirmAndArchive(type, row.id, row.title, () => {
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
              void confirmAndTrash(type, row.id, row.title, () => {
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
      setStatus('');
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
