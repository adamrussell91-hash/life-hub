import type { Media } from '@/schemas/media';
import { uploadMediaFile } from '@/teacher/media-api';
import { resolveMediaLibraryUrl } from '@/teacher/media-library-picker';
import { ALLOWED_MEDIA_MIME, MAX_MEDIA_BYTES } from '@/media/upload-rules';

export type UploadFileFn = (
  file: File,
  opts?: { title?: string; provider_file_id?: string }
) => Promise<Media>;

export type UploadButtonOptions = {
  /** `accept` for the file input, e.g. `image/*` or `audio/*`. Omit for any file. */
  accept?: string;
  multiple?: boolean;
  /** Button text. Defaults to "Upload from computer". */
  label?: string;
  /** Short noun for messages, e.g. "an image". Defaults to "a file". */
  noun?: string;
  /** Smaller secondary button for list items. */
  compact?: boolean;
  /** Called once per uploaded file with the media record and its usable URL. */
  onUploaded: (url: string, media: Media) => void;
  /** Defaults to `uploadMediaFile` (POST /api/media/upload), the cover picker's path. */
  uploadFile?: UploadFileFn;
  /** Element that accepts dropped files (usually the block's fields). */
  dropTarget?: HTMLElement;
};

export type UploadButtonHandle = {
  el: HTMLElement;
  button: HTMLButtonElement;
  input: HTMLInputElement;
  /** Uploads files as if picked; resolves when every file has finished. */
  uploadFiles: (files: File[]) => Promise<void>;
};

/*
 * Uploads made in this tab. Block editors get the media list once, when the
 * lesson opens, so library pickers merge these in to show what was just added.
 */
let sessionUploads: Media[] = [];

export function rememberUploadedMedia(media: Media): void {
  sessionUploads = [media, ...sessionUploads.filter((entry) => entry.id !== media.id)];
  // The Resource Library reads the curriculum cache. Load it lazily so block
  // editors do not pull app state into every module that renders a block.
  void import('@/app/curriculum-state')
    .then((state) => state.applyCreatedMedia(media))
    .catch(() => undefined);
}

/** `media` plus anything uploaded this session, newest upload first, no duplicates. */
export function withSessionUploads(media: ReadonlyArray<Media>): Media[] {
  const seen = new Set(sessionUploads.map((entry) => entry.id));
  return [...sessionUploads, ...media.filter((entry) => !seen.has(entry.id))];
}

/** Test hook. */
export function resetSessionUploads(): void {
  sessionUploads = [];
}

/** Same rules as the input's `accept`: `.ext`, `type/*` or an exact MIME type. */
export function fileMatchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept?.trim()) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return accept.split(',').some((raw) => {
    const rule = raw.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

const UNSUPPORTED_TYPE = (file: File): string =>
  `${file.name} is a type that can't be uploaded. Use an image, PDF, Word, PowerPoint, Excel, audio, ZIP or text file.`;

function uploadErrorMessage(error: unknown, file: File): string {
  const message = error instanceof Error ? error.message : '';
  if (/mime type is not allowed/i.test(message)) return UNSUPPORTED_TYPE(file);
  if (/maximum size/i.test(message)) {
    return `${file.name} is over 10 MB. Make it smaller, or add it from Drive.`;
  }
  return message ? `Couldn't upload ${file.name}: ${message}` : `Couldn't upload ${file.name}. Try again.`;
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Upload from computer: a button over a hidden file input, with a busy state,
 * an inline error and optional drop-a-file on `dropTarget`. Files go into the
 * media library, so they also show in the Resource Library and library pickers.
 */
export function createUploadButton(options: UploadButtonOptions): UploadButtonHandle {
  const uploadFile = options.uploadFile ?? uploadMediaFile;
  const noun = options.noun ?? 'a file';
  const label = options.label ?? 'Upload from computer';
  let busy = false;

  const el = document.createElement('div');
  el.className = 'block-editor__upload';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = options.compact
    ? 'btn btn--secondary block-editor__upload-btn block-editor__upload-btn--compact'
    : 'btn btn--primary block-editor__upload-btn';
  button.textContent = label;

  const input = document.createElement('input');
  input.type = 'file';
  input.hidden = true;
  input.className = 'block-editor__upload-input';
  if (options.accept) input.accept = options.accept;
  input.multiple = options.multiple === true;
  input.tabIndex = -1;

  const status = document.createElement('p');
  status.className = 'block-editor__upload-status';
  status.setAttribute('role', 'status');
  status.hidden = true;

  const error = document.createElement('p');
  error.className = 'block-editor__upload-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;

  el.append(button, input, status, error);

  const setStatus = (message: string | null) => {
    status.hidden = !message;
    status.textContent = message ?? '';
  };
  const setError = (message: string | null) => {
    error.hidden = !message;
    error.textContent = message ?? '';
  };
  const setBusy = (next: boolean) => {
    busy = next;
    button.disabled = next;
    button.setAttribute('aria-busy', String(next));
    el.classList.toggle('block-editor__upload--busy', next);
  };

  const uploadFiles = async (picked: File[]): Promise<void> => {
    if (busy || picked.length === 0) return;
    const files = options.multiple ? picked : picked.slice(0, 1);
    const wrongType = files.find((file) => !fileMatchesAccept(file, options.accept));
    if (wrongType) {
      setError(`${wrongType.name} isn't ${noun}. Choose ${noun} instead.`);
      return;
    }
    // Checked here so the teacher hears why before waiting on the upload.
    const notAllowed = files.find((file) => !file.type || !ALLOWED_MEDIA_MIME.has(file.type));
    if (notAllowed) {
      setError(UNSUPPORTED_TYPE(notAllowed));
      return;
    }
    const tooBig = files.find((file) => file.size > MAX_MEDIA_BYTES);
    if (tooBig) {
      setError(`${tooBig.name} is over 10 MB. Make it smaller, or add it from Drive.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      for (const [index, file] of files.entries()) {
        setStatus(
          files.length > 1
            ? `Uploading ${file.name} (${index + 1} of ${files.length})…`
            : `Uploading ${file.name}…`
        );
        let media: Media;
        try {
          media = await uploadFile(file, { title: file.name });
        } catch (cause) {
          setError(uploadErrorMessage(cause, file));
          return;
        }
        const url = resolveMediaLibraryUrl(media);
        if (!url) {
          setError(`${file.name} uploaded but has no usable link. Try again.`);
          return;
        }
        rememberUploadedMedia(media);
        options.onUploaded(url, media);
      }
    } finally {
      setStatus(null);
      setBusy(false);
    }
  };

  button.addEventListener('click', () => {
    if (!busy) input.click();
  });
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    void uploadFiles(files);
  });

  const target = options.dropTarget;
  if (target) {
    target.classList.add('block-editor__drop-target');
    target.addEventListener('dragover', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      target.classList.add('block-editor__drop-target--active');
    });
    target.addEventListener('dragleave', (event) => {
      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
      target.classList.remove('block-editor__drop-target--active');
    });
    target.addEventListener('drop', (event) => {
      target.classList.remove('block-editor__drop-target--active');
      if (!hasFiles(event)) return;
      // Nested blocks (Tabs, Columns, Section): the innermost block takes the file.
      event.preventDefault();
      event.stopPropagation();
      void uploadFiles(Array.from(event.dataTransfer?.files ?? []));
    });
  }

  return { el, button, input, uploadFiles };
}
