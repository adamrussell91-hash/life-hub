import { renderSkillsLibrary, selectSkill } from '@/skills/view';
import type { Media, MediaFolder } from '@/schemas';
import type { CurriculumResponse } from '@/teacher/nav';
import { isHttpUrl } from '@/blocks/url-safety';
import { applyCreatedMedia, applyMediaFolders, applyPatchedMedia, reconcileCurriculum } from '@/app/curriculum-state';
import { navigate } from '@/app/router';
import { askConfirmCard, askSelectCard, askTextCard } from '@/teacher/confirm-dialog';
import { createMedia, patchMedia, saveMediaFolders } from '@/teacher/media-api';
import {
  effectiveFolderId,
  folderAndDescendantIds,
  folderChildren,
  folderChoices,
  folderItemCount,
  folderPath,
  groupMediaByUnit,
  mediaForView,
  newFolderId,
  planFolderDelete,
  sameView,
  usedInLinks,
  type LibraryView,
  type UsedInLink
} from '@/teacher/resources-library';
import { uploadMediaQueue } from '@/teacher/media-uppy';
import { ApiClientError } from '@/api/client';
import { confirmAndArchive, confirmAndTrash } from '@/teacher/lifecycle-api';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';
import { renderPageHeader } from '@/teacher/page-header';
import { libraryOutcomeCount, renderOutcomesLibrary } from '@/teacher/sections/outcomes-library';

export function openUrlForMedia(media: Media): string | undefined {
  const url = media.preview_url ?? media.download_url;
  if (!url || url.trim() === '') return undefined;
  const trimmed = url.trim();
  return isHttpUrl(trimmed) ? trimmed : undefined;
}

export interface ResourcesIndexOptions {
  /** Called after successful create/upload/archive/trash to reload curriculum and remount. */
  refresh?: () => Promise<void>;
  /** Optional Drive picker hook (Task 5). */
  onDrivePick?: () => void | Promise<void>;
}

const VIEW_STORAGE_KEY = 'teaching-hub.resources-view';

function readStoredView(): LibraryView {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as LibraryView) : null;
    if (parsed && ['all', 'unfiled', 'unused', 'by-unit', 'outcomes', 'skills'].includes(parsed.kind)) return { kind: parsed.kind } as LibraryView;
    if (parsed?.kind === 'folder' && typeof parsed.id === 'string') return { kind: 'folder', id: parsed.id };
  } catch {
    // Storage blocked: start on All resources.
  }
  return { kind: 'all' };
}

/** Survives the remount after each upload or move, so the teacher stays where they were. */
let currentView: LibraryView = readStoredView();

const NAV_COLLAPSED_KEY = 'teaching-hub.resources-nav-collapsed';

function readNavCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeNavCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // Private mode: the panel still toggles for this visit.
  }
}

const PANEL_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M9.5 4.5v15" />
  </svg>
`.trim();

function setView(view: LibraryView): void {
  currentView = view;
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
  } catch {
    // Storage blocked: the view still holds for this session.
  }
}

/** Opens the Resource Library on the Skills continuum at one sub-strand, `strand.sub`. */
export function showSkillInLibrary(ref?: string): void {
  if (ref) selectSkill(ref);
  setView({ kind: 'skills' });
  navigate('/resources');
}

/** Opens the Resource Library on its Outcomes view (from the outcome picker). */
export function showOutcomesInLibrary(): void {
  setView({ kind: 'outcomes' });
  navigate('/resources');
}

/** Test hook: start each render from a known view. */
export function resetResourcesViewForTests(view: LibraryView = { kind: 'all' }): void {
  currentView = view;
}

function inferMediaTypeFromUrl(url: string): Media['media_type'] {
  const path = url.split('?')[0]?.toLowerCase() ?? '';
  if (/\.(jpe?g|png|webp|gif)$/.test(path)) return 'image';
  if (path.endsWith('.pdf')) return 'pdf';
  return 'link';
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export function renderResourcesIndex(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options?: ResourcesIndexOptions
): void {
  canvas.replaceChildren();
  renderPageHeader(canvas, { eyebrow: 'Library', title: 'Resource Library' });

  const status = document.createElement('p');
  status.className = 'resources-status';
  status.hidden = true;
  canvas.append(status);

  const setStatus = (message: string | null, isError = false): void => {
    if (!message) {
      status.hidden = true;
      status.textContent = '';
      status.removeAttribute('role');
      status.classList.remove('resources-status--error');
      return;
    }
    status.hidden = false;
    status.textContent = message;
    if (isError) {
      status.setAttribute('role', 'alert');
      status.classList.add('resources-status--error');
    } else {
      status.removeAttribute('role');
      status.classList.remove('resources-status--error');
    }
  };

  const toolbar = document.createElement('div');
  toolbar.className = 'resources-toolbar';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.hidden = true;
  fileInput.setAttribute('aria-hidden', 'true');

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'btn btn--secondary';
  uploadBtn.dataset.resourcesUpload = '';
  uploadBtn.textContent = 'Upload';

  const addUrlBtn = document.createElement('button');
  addUrlBtn.type = 'button';
  addUrlBtn.className = 'btn btn--secondary';
  addUrlBtn.dataset.resourcesAddUrl = '';
  addUrlBtn.textContent = 'Add URL';

  const driveBtn = document.createElement('button');
  driveBtn.type = 'button';
  driveBtn.className = 'btn btn--secondary';
  driveBtn.dataset.drivePick = '';
  driveBtn.textContent = 'Add from Drive';

  toolbar.append(uploadBtn, addUrlBtn, driveBtn, fileInput);
  canvas.append(toolbar);

  const urlForm = document.createElement('div');
  urlForm.className = 'resources-url-form';
  urlForm.hidden = true;

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'resources-url-form__input';
  titleInput.placeholder = 'Title';
  titleInput.setAttribute('aria-label', 'Resource title');

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.className = 'resources-url-form__input';
  urlInput.placeholder = 'https://…';
  urlInput.setAttribute('aria-label', 'Resource URL');

  const saveUrlBtn = document.createElement('button');
  saveUrlBtn.type = 'button';
  saveUrlBtn.className = 'btn btn--primary';
  saveUrlBtn.textContent = 'Save URL';

  urlForm.append(titleInput, urlInput, saveUrlBtn);
  canvas.append(urlForm);

  const actionButtons: HTMLButtonElement[] = [uploadBtn, addUrlBtn, driveBtn, saveUrlBtn];

  const setBusy = (busy: boolean): void => {
    for (const btn of actionButtons) {
      btn.disabled = busy;
    }
    for (const btn of canvas.querySelectorAll<HTMLButtonElement>('[data-resources-archive]')) {
      btn.disabled = busy;
    }
    for (const btn of canvas.querySelectorAll<HTMLButtonElement>('[data-resources-trash]')) {
      btn.disabled = busy;
    }
    fileInput.disabled = busy;
  };

  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const files = [...(fileInput.files ?? [])];
    fileInput.value = '';
    if (!files.length) return;

    void (async () => {
      setBusy(true);
      setStatus(files.length === 1 ? `Uploading ${files[0]!.name}…` : `Uploading 0 of ${files.length}…`);
      try {
        const result = await uploadMediaQueue(files, {
          onProgress: (done, total, currentName) => {
            setStatus(
              total === 1
                ? `Uploading ${currentName || files[0]!.name}…`
                : `Uploading ${done} of ${total}${currentName ? ` · ${currentName}` : ''}…`
            );
          }
        });
        for (const created of result.successful) {
          applyCreatedMedia(created);
        }
        if (result.successful.length) {
          await options?.refresh?.();
        }
        if (result.failed.length && result.successful.length) {
          setStatus(
            `Uploaded ${result.successful.length}; ${result.failed.length} failed (${result.failed
              .map((entry) => entry.name)
              .join(', ')}).`,
            true
          );
        } else if (result.failed.length) {
          setStatus(
            result.failed.map((entry) => `${entry.name}: ${entry.error}`).join(' · ') || 'Upload failed.',
            true
          );
        } else {
          setStatus(null);
        }
      } catch (error) {
        setStatus(errorMessage(error), true);
      } finally {
        setBusy(false);
      }
    })();
  });

  addUrlBtn.addEventListener('click', () => {
    urlForm.hidden = !urlForm.hidden;
    if (!urlForm.hidden) titleInput.focus();
  });

  saveUrlBtn.addEventListener('click', () => {
    const title = titleInput.value.trim();
    const preview_url = urlInput.value.trim();
    if (!title || !preview_url) {
      setStatus('Title and URL are required.', true);
      return;
    }
    if (!isHttpUrl(preview_url)) {
      setStatus('URL must start with http:// or https://.', true);
      return;
    }

    void (async () => {
      setBusy(true);
      setStatus(null);
      try {
        const created = await createMedia({
          title,
          provider: 'external',
          media_type: inferMediaTypeFromUrl(preview_url),
          preview_url
        });
        applyCreatedMedia(created);
        await options?.refresh?.();
      } catch (error) {
        setStatus(errorMessage(error), true);
      } finally {
        setBusy(false);
      }
    })();
  });

  driveBtn.addEventListener('click', () => {
    void (async () => {
      if (options?.onDrivePick) {
        setBusy(true);
        setStatus(null);
        try {
          await options.onDrivePick();
          await options.refresh?.();
        } catch (error) {
          setStatus(errorMessage(error), true);
        } finally {
          setBusy(false);
        }
        return;
      }
      setStatus('Google Drive is not configured yet. Upload the file or paste its link instead.', true);
    })();
  });

  const media = curriculum.media
    .filter((entry) => entry.status === 'active')
    .sort((a, b) => a.title.localeCompare(b.title));
  let folders = [...(curriculum.media_folders ?? [])];
  const startView = currentView;
  if (startView.kind === 'folder' && !folders.some((folder) => folder.id === startView.id)) {
    setView({ kind: 'all' });
  }

  const run = (task: () => Promise<void>): void => {
    void (async () => {
      setBusy(true);
      setStatus(null);
      try {
        await task();
        await options?.refresh?.();
      } catch (error) {
        setStatus(errorMessage(error), true);
      } finally {
        setBusy(false);
      }
    })();
  };

  const persistFolders = async (next: MediaFolder[]): Promise<void> => {
    folders = await saveMediaFolders(next);
    applyMediaFolders(folders);
  };

  const moveMedia = async (entry: Media, folderId: string | null): Promise<void> => {
    applyPatchedMedia(await patchMedia(entry.id, { folder_id: folderId }));
  };

  const createFolder = (parentId: string | null): void => {
    void askTextCard({
      eyebrow: 'Resource Library',
      title: parentId ? 'New subfolder' : 'New folder',
      placeholder: 'Folder name',
      confirmLabel: 'Create'
    }).then((name) => {
      if (!name) return;
      const folder: MediaFolder = { id: newFolderId(), name, parent_id: parentId };
      run(async () => {
        await persistFolders([...folders, folder]);
        setView({ kind: 'folder', id: folder.id });
      });
    });
  };

  const newFolderBtn = document.createElement('button');
  newFolderBtn.type = 'button';
  newFolderBtn.className = 'btn btn--secondary';
  newFolderBtn.dataset.resourcesNewFolder = '';
  newFolderBtn.textContent = 'New folder';
  newFolderBtn.addEventListener('click', () => {
    createFolder(currentView.kind === 'folder' ? currentView.id : null);
  });
  toolbar.insertBefore(newFolderBtn, fileInput);
  actionButtons.push(newFolderBtn);

  if (media.length === 0 && folders.length === 0 && curriculum.subjects.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No resources yet.';
    canvas.append(empty);
    return;
  }

  const layout = document.createElement('div');
  layout.className = 'resources-layout';
  const nav = document.createElement('nav');
  nav.className = 'resources-nav';
  nav.setAttribute('aria-label', 'Library views');
  const main = document.createElement('section');
  main.className = 'resources-main';
  layout.append(nav, main);
  canvas.append(layout);

  let navCollapsed = readNavCollapsed();
  const navToggle = document.createElement('button');
  navToggle.type = 'button';
  navToggle.className = 'hub-icon-btn resources-nav__toggle';
  navToggle.innerHTML = PANEL_ICON;
  const syncNavCollapsed = (): void => {
    layout.classList.toggle('resources-layout--collapsed', navCollapsed);
    const label = navCollapsed ? 'Show library panel' : 'Hide library panel';
    navToggle.setAttribute('aria-label', label);
    navToggle.setAttribute('aria-expanded', navCollapsed ? 'false' : 'true');
    navToggle.title = label;
  };
  navToggle.addEventListener('click', () => {
    navCollapsed = !navCollapsed;
    writeNavCollapsed(navCollapsed);
    syncNavCollapsed();
  });
  syncNavCollapsed();

  const go = (view: LibraryView): void => {
    setView(view);
    renderNav();
    renderMain();
  };

  const navButton = (label: string, view: LibraryView, count?: number): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'resources-nav__item';
    button.dataset.resourcesView = view.kind === 'folder' ? `folder:${view.id}` : view.kind;
    const text = document.createElement('span');
    text.className = 'resources-nav__label';
    text.textContent = label;
    button.append(text);
    if (count !== undefined) {
      const badge = document.createElement('span');
      badge.className = 'resources-nav__count';
      badge.textContent = String(count);
      button.append(badge);
    }
    if (sameView(view, currentView)) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => go(view));
    return button;
  };

  function renderNav(): void {
    nav.replaceChildren(navToggle);
    const views = document.createElement('div');
    views.className = 'resources-nav__views';
    views.append(
      navButton('All resources', { kind: 'all' }, media.length),
      navButton('Unfiled', { kind: 'unfiled' }, mediaForView(media, { kind: 'unfiled' }, curriculumView()).length),
      navButton('Not used anywhere', { kind: 'unused' }, mediaForView(media, { kind: 'unused' }, curriculumView()).length),
      navButton('By class and unit', { kind: 'by-unit' })
    );

    const heading = document.createElement('p');
    heading.className = 'resources-nav__heading';
    heading.textContent = 'Folders';

    const tree = document.createElement('div');
    tree.className = 'resources-nav__tree';
    const walk = (parentId: string | null): HTMLUListElement | null => {
      const children = folderChildren(folders, parentId);
      if (!children.length) return null;
      const list = document.createElement('ul');
      list.className = 'resources-tree';
      for (const folder of children) {
        const item = document.createElement('li');
        item.append(navButton(folder.name, { kind: 'folder', id: folder.id }, folderItemCount(media, folders, folder.id)));
        const nested = walk(folder.id);
        if (nested) item.append(nested);
        list.append(item);
      }
      return list;
    };
    const rootList = walk(null);
    if (rootList) {
      tree.append(rootList);
    } else {
      const none = document.createElement('p');
      none.className = 'resources-nav__empty';
      none.textContent = 'No folders yet. Use New folder to make one.';
      tree.append(none);
    }
    const curriculumHeading = document.createElement('p');
    curriculumHeading.className = 'resources-nav__heading';
    curriculumHeading.textContent = 'Curriculum';
    const curriculumViews = document.createElement('div');
    curriculumViews.className = 'resources-nav__views';
    curriculumViews.append(navButton('Outcomes', { kind: 'outcomes' }, libraryOutcomeCount(curriculum)), navButton('Skills continuum', { kind: 'skills' }));
    nav.append(views, heading, tree, curriculumHeading, curriculumViews);
  }

  /** Folder list changes in place; views read through this so counts stay current. */
  const curriculumView = (): CurriculumResponse => ({ ...curriculum, media_folders: folders });

  function renderMain(): void {
    main.replaceChildren();
    const data = curriculumView();
    // Upload, link and folder tools act on files, not outcomes.
    toolbar.hidden = currentView.kind === 'outcomes' || currentView.kind === 'skills';
    if (toolbar.hidden) urlForm.hidden = true;
    if (currentView.kind === 'skills') {
      renderSkillsLibrary(main);
      return;
    }
    if (currentView.kind === 'outcomes') {
      // Outcome writes touch subjects, lessons and units, so refetch before the remount.
      renderOutcomesLibrary(main, curriculum, {
        run: (task) =>
          run(async () => {
            await task();
            await reconcileCurriculum();
          })
      });
      return;
    }
    if (currentView.kind === 'folder') {
      renderFolderHeader(currentView.id);
    } else {
      const title = document.createElement('h2');
      title.className = 'resources-main__title';
      title.textContent = VIEW_TITLES[currentView.kind];
      main.append(title);
    }

    if (currentView.kind === 'by-unit') {
      const groups = groupMediaByUnit(media, data);
      if (!groups.length) {
        main.append(emptyNote('No resource is used in a lesson, unit or class page yet.'));
        return;
      }
      for (const group of groups) {
        const section = document.createElement('section');
        section.className = 'resources-group';
        const heading = document.createElement('h3');
        heading.className = 'resources-group__title';
        if (group.unitId) {
          heading.append(appLink(group.title, `/units/${group.unitId}`));
        } else {
          heading.textContent = group.title;
        }
        section.append(heading);
        if (group.classTitles.length) {
          const classes = document.createElement('p');
          classes.className = 'resources-group__meta';
          classes.textContent = `Taught in ${group.classTitles.join(', ')}`;
          section.append(classes);
        }
        section.append(renderList(group.media, data));
        main.append(section);
      }
      return;
    }

    const items = mediaForView(media, currentView, data);
    if (items.length) {
      main.append(renderList(items, data));
    } else if (currentView.kind === 'folder') {
      if (!folderChildren(folders, currentView.id).length) {
        main.append(emptyNote('This folder is empty. Use a resource’s options menu to move it here.'));
      }
    } else {
      main.append(emptyNote(VIEW_EMPTY[currentView.kind]));
    }
  }

  function renderFolderHeader(folderId: string): void {
    const path = folderPath(folders, folderId);
    const folder = path[path.length - 1]!;

    const crumbs = document.createElement('nav');
    crumbs.className = 'resources-crumbs';
    crumbs.setAttribute('aria-label', 'Folder path');
    const crumbButton = (label: string, view: LibraryView): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'resources-crumbs__item';
      button.textContent = label;
      button.addEventListener('click', () => go(view));
      return button;
    };
    crumbs.append(crumbButton('All resources', { kind: 'all' }));
    for (const ancestor of path.slice(0, -1)) {
      crumbs.append(separator(), crumbButton(ancestor.name, { kind: 'folder', id: ancestor.id }));
    }
    main.append(crumbs);

    const header = document.createElement('div');
    header.className = 'resources-main__header';
    const title = document.createElement('h2');
    title.className = 'resources-main__title';
    title.textContent = folder.name;
    const blocked = folderAndDescendantIds(folders, folder.id);
    const menu = mountPageOptionsMenu(
      [
        { label: 'New subfolder', onSelect: () => createFolder(folder.id) },
        {
          label: 'Rename',
          onSelect: () => {
            void askTextCard({
              eyebrow: 'Resource Library',
              title: 'Rename folder',
              value: folder.name,
              confirmLabel: 'Rename'
            }).then((name) => {
              if (!name || name === folder.name) return;
              run(() =>
                persistFolders(folders.map((row) => (row.id === folder.id ? { ...row, name } : row)))
              );
            });
          }
        },
        {
          label: 'Move folder',
          onSelect: () => {
            void askSelectCard({
              eyebrow: 'Resource Library',
              title: `Move ${folder.name}`,
              supporting: 'Its subfolders and resources move with it.',
              choices: folderChoices(folders)
                .filter((choice) => !blocked.has(choice.value))
                .map((choice) => (choice.value === '__unfiled' ? { ...choice, label: 'Top level' } : choice)),
              value: folder.parent_id ?? '__unfiled',
              confirmLabel: 'Move'
            }).then((choice) => {
              if (choice === null) return;
              const parent_id = choice === '__unfiled' ? null : choice;
              if (parent_id === folder.parent_id) return;
              run(() =>
                persistFolders(folders.map((row) => (row.id === folder.id ? { ...row, parent_id } : row)))
              );
            });
          }
        },
        {
          label: 'Delete folder',
          danger: true,
          onSelect: () => {
            const count = folderItemCount(media, folders, folder.id);
            const destination = path.length > 1 ? path[path.length - 2]!.name : 'Unfiled';
            void askConfirmCard({
              eyebrow: 'Resource Library',
              title: `Delete ${folder.name}?`,
              supporting:
                count > 0 || folderChildren(folders, folder.id).length
                  ? `No resources are deleted. What is inside moves to ${destination}.`
                  : 'The folder is empty.',
              confirmLabel: 'Delete folder'
            }).then((ok) => {
              if (!ok) return;
              const plan = planFolderDelete(folders, media, folder.id);
              run(async () => {
                for (const move of plan.moves) {
                  const entry = media.find((row) => row.id === move.mediaId);
                  if (entry) await moveMedia(entry, move.folderId);
                }
                await persistFolders(plan.folders);
                setView(folder.parent_id ? { kind: 'folder', id: folder.parent_id } : { kind: 'all' });
              });
            });
          }
        }
      ],
      { label: `Options for folder ${folder.name}` }
    );
    header.append(title, menu.el);
    main.append(header);

    const subfolders = folderChildren(folders, folder.id);
    if (subfolders.length) {
      const grid = document.createElement('div');
      grid.className = 'resources-subfolders';
      for (const child of subfolders) {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'resources-subfolders__tile';
        tile.dataset.resourcesView = `folder:${child.id}`;
        const name = document.createElement('span');
        name.className = 'resources-subfolders__name';
        name.textContent = child.name;
        const count = document.createElement('span');
        count.className = 'resources-subfolders__count';
        const n = folderItemCount(media, folders, child.id);
        count.textContent = `${n} ${n === 1 ? 'resource' : 'resources'}`;
        tile.append(name, count);
        tile.addEventListener('click', () => go({ kind: 'folder', id: child.id }));
        grid.append(tile);
      }
      main.append(grid);
    }
  }

  function renderList(items: Media[], data: CurriculumResponse): HTMLUListElement {
    const list = document.createElement('ul');
    list.className = 'lesson-list hub-grid-disclose';
    for (const entry of items) list.append(renderRow(entry, data));
    return list;
  }

  function renderRow(entry: Media, data: CurriculumResponse): HTMLLIElement {
    const item = document.createElement('li');
    item.className = 'lesson-list__item';
    item.dataset.resourceId = entry.id;

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = entry.title;

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    const metaParts: string[] = [entry.media_type, entry.provider];
    const folderId = effectiveFolderId(entry, folders);
    if (folderId && !(currentView.kind === 'folder' && currentView.id === folderId)) {
      metaParts.push(folderPath(folders, folderId).map((row) => row.name).join(' / '));
    }
    meta.textContent = metaParts.join(' · ');

    info.append(title, meta, renderUsedIn(entry, data));
    item.append(info);

    const actions = document.createElement('div');
    actions.className = 'resources-row-actions';

    const url = openUrlForMedia(entry);
    const menu = mountPageOptionsMenu(
      [
        ...(url
          ? [
              {
                label: 'Open',
                className: 'lesson-list__open',
                href: url,
                target: '_blank',
                rel: 'noopener noreferrer'
              }
            ]
          : []),
        {
          label: 'Move to folder',
          onSelect: () => {
            void askSelectCard({
              eyebrow: 'Resource Library',
              title: `Move ${entry.title}`,
              choices: folderChoices(folders),
              value: folderId ?? '__unfiled',
              confirmLabel: 'Move'
            }).then((choice) => {
              if (choice === null) return;
              const next = choice === '__unfiled' ? null : choice;
              if (next === folderId) return;
              run(() => moveMedia(entry, next));
            });
          }
        },
        {
          label: 'Archive',
          onSelect: () => {
            setStatus(null);
            void confirmAndArchive('media', entry.id, entry.title, () => {
              void options?.refresh?.();
            });
          }
        },
        {
          label: 'Move to trash',
          danger: true,
          onSelect: () => {
            setStatus(null);
            void confirmAndTrash('media', entry.id, entry.title, () => {
              void options?.refresh?.();
            });
          }
        }
      ],
      { label: `Options for ${entry.title}` }
    );
    const menuItems = [...menu.el.querySelectorAll<HTMLButtonElement>('.page-options__item')];
    const moveItem = menuItems.find((row) => row.textContent === 'Move to folder');
    const archiveItem = menuItems.find((row) => row.textContent === 'Archive');
    const trashItem = menuItems.find((row) => row.textContent === 'Move to trash');
    if (moveItem) moveItem.dataset.resourcesMove = entry.id;
    if (archiveItem) archiveItem.dataset.resourcesArchive = entry.id;
    if (trashItem) trashItem.dataset.resourcesTrash = entry.id;

    actions.append(menu.el);
    item.append(actions);
    return item;
  }

  renderNav();
  renderMain();
}

const VIEW_TITLES: Record<Exclude<LibraryView['kind'], 'folder'>, string> = {
  all: 'All resources',
  unfiled: 'Unfiled',
  unused: 'Not used anywhere',
  'by-unit': 'By class and unit',
  outcomes: 'Outcomes',
  skills: 'Skills continuum'
};

const VIEW_EMPTY: Record<'all' | 'unfiled' | 'unused', string> = {
  all: 'No resources yet.',
  unfiled: 'Every resource is in a folder.',
  unused: 'Every resource is used in at least one lesson, unit or class page.'
};

const KIND_LABELS: Record<UsedInLink['kind'], string> = {
  lesson: 'Lesson',
  unit: 'Unit',
  class: 'Class'
};

function emptyNote(text: string): HTMLParagraphElement {
  const note = document.createElement('p');
  note.className = 'resources-main__empty';
  note.textContent = text;
  return note;
}

function separator(): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'resources-crumbs__sep';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = '/';
  return span;
}

function appLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  link.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  });
  return link;
}

function renderUsedIn(entry: Media, data: CurriculumResponse): HTMLElement {
  const row = document.createElement('p');
  row.className = 'resources-used-in';
  const links = usedInLinks(entry, data);
  if (!links.length) {
    row.classList.add('resources-used-in--none');
    row.textContent = 'Not used anywhere';
    return row;
  }
  const label = document.createElement('span');
  label.className = 'resources-used-in__label';
  label.textContent = 'Used in';
  row.append(label);
  for (const link of links) {
    const anchor = appLink(link.label, link.href);
    anchor.className = 'resources-used-in__link';
    anchor.dataset.usedIn = `${link.kind}:${link.id}`;
    anchor.title = `${KIND_LABELS[link.kind]}: ${link.label}`;
    const kind = document.createElement('span');
    kind.className = 'resources-used-in__kind';
    kind.textContent = KIND_LABELS[link.kind];
    anchor.prepend(kind);
    row.append(anchor);
  }
  return row;
}
