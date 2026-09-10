import Uppy, { BasePlugin, type UppyFile } from '@uppy/core';
import { uploadMediaFile } from '@/teacher/media-api';
import type { Media } from '@/schemas';

type UploadFn = (file: File, opts?: { title?: string }) => Promise<Media>;

type HubMediaUploaderOpts = {
  id?: string;
  uploadFile?: UploadFn;
};

/** Headless Uppy uploader that posts through Teaching's existing Blobs upload API. */
class HubMediaUploader extends BasePlugin<HubMediaUploaderOpts, Record<string, unknown>> {
  id: string;
  type = 'uploader';
  #uploadFile: UploadFn;

  constructor(uppy: Uppy, opts: HubMediaUploaderOpts = {}) {
    super(uppy, opts);
    this.id = opts.id ?? 'HubMediaUploader';
    this.#uploadFile = opts.uploadFile ?? uploadMediaFile;
  }

  install(): void {
    this.uppy.addUploader(this.#run);
  }

  uninstall(): void {
    this.uppy.removeUploader(this.#run);
  }

  #run = async (fileIDs: string[]): Promise<void> => {
    for (const id of fileIDs) {
      const file = this.uppy.getFile(id) as UppyFile<Record<string, unknown>, Record<string, unknown>> | undefined;
      if (!file) continue;
      this.uppy.emit('upload-progress', file, {
        uploadStarted: Date.now(),
        bytesUploaded: 0,
        bytesTotal: file.size || 0
      });
      try {
        const data = file.data;
        const blob =
          data instanceof File
            ? data
            : new File([data as Blob], file.name || 'upload', { type: file.type || 'application/octet-stream' });
        const created = await this.#uploadFile(blob, { title: file.name || blob.name });
        this.uppy.setFileState(id, {
          progress: { uploadComplete: true, uploadStarted: Date.now(), percentage: 100, bytesUploaded: file.size || 0, bytesTotal: file.size || 0 },
          response: { status: 200, body: created }
        });
        this.uppy.emit('upload-success', this.uppy.getFile(id)!, { status: 200, body: created });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.uppy.emit('upload-error', file, err);
        // Continue the queue — one failure must not abort sibling files.
      }
    }
  };
}

export type MediaQueueResult = {
  successful: Media[];
  failed: { name: string; error: string }[];
};

/**
 * Queue one or more files through headless Uppy → Teaching media upload.
 * Custom chrome only — no Uppy Dashboard.
 */
export async function uploadMediaQueue(
  files: File[],
  opts?: {
    uploadFile?: UploadFn;
    onProgress?: (done: number, total: number, currentName: string) => void;
  }
): Promise<MediaQueueResult> {
  const list = [...files].filter(Boolean);
  if (!list.length) return { successful: [], failed: [] };

  const uppy = new Uppy({
    autoProceed: false,
    allowMultipleUploadBatches: true,
    restrictions: { maxNumberOfFiles: 40 }
  });
  uppy.use(HubMediaUploader, { uploadFile: opts?.uploadFile });

  let completed = 0;
  const successful: Media[] = [];
  const failed: { name: string; error: string }[] = [];

  uppy.on('upload-success', (file, response) => {
    completed += 1;
    const body = response?.body as Media | undefined;
    if (body) successful.push(body);
    opts?.onProgress?.(completed, list.length, file?.name || '');
  });
  uppy.on('upload-error', (file, error) => {
    completed += 1;
    failed.push({ name: file?.name || 'file', error: error?.message || 'Upload failed' });
    opts?.onProgress?.(completed, list.length, file?.name || '');
  });

  for (const file of list) {
    try {
      uppy.addFile({
        name: file.name,
        type: file.type,
        data: file,
        source: 'resources-file-input'
      });
    } catch (error) {
      failed.push({
        name: file.name,
        error: error instanceof Error ? error.message : 'Could not queue file'
      });
    }
  }

  if (uppy.getFiles().length) {
    await uppy.upload();
  }
  uppy.destroy();
  return { successful, failed };
}
