import type { Media } from '@/schemas';
import type { CurriculumResponse } from '@/teacher/nav';
import { isHttpUrl } from '@/blocks/url-safety';
import { applyCreatedMedia } from '@/app/curriculum-state';
import { createMedia, uploadMediaFile } from '@/teacher/media-api';
import { ApiClientError } from '@/api/client';
import { confirmAndArchive, confirmAndTrash } from '@/teacher/lifecycle-api';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';
import { renderPageHeader } from '@/teacher/page-header';

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
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    void (async () => {
      setBusy(true);
      setStatus(null);
      try {
        const created = await uploadMediaFile(file, { title: file.name });
        applyCreatedMedia(created);
        await options?.refresh?.();
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
      setStatus('Google Drive is not configured.', true);
    })();
  });

  const media = curriculum.media
    .filter((entry) => entry.status === 'active')
    .sort((a, b) => a.title.localeCompare(b.title));

  if (media.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No resources yet.';
    canvas.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'lesson-list';

  for (const entry of media) {
    const item = document.createElement('li');
    item.className = 'lesson-list__item';

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = entry.title;

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    meta.textContent = `${entry.media_type} · ${entry.provider}`;

    info.append(title, meta);
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
          label: 'Archive',
          onSelect: () => {
            setStatus(null);
            confirmAndArchive('media', entry.id, entry.title, () => {
              void options?.refresh?.();
            });
          }
        },
        {
          label: 'Move to trash',
          danger: true,
          onSelect: () => {
            setStatus(null);
            confirmAndTrash('media', entry.id, entry.title, () => {
              void options?.refresh?.();
            });
          }
        }
      ],
      { label: `Options for ${entry.title}` }
    );
    const items = [...menu.el.querySelectorAll<HTMLButtonElement>('.page-options__item')];
    const archiveItem = items.find((item) => item.textContent === 'Archive');
    const trashItem = items.find((item) => item.textContent === 'Move to trash');
    if (archiveItem) archiveItem.dataset.resourcesArchive = entry.id;
    if (trashItem) trashItem.dataset.resourcesTrash = entry.id;

    actions.append(menu.el);

    item.append(actions);
    list.append(item);
  }

  canvas.append(list);
}
