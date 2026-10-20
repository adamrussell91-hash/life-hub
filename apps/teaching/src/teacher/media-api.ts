import { apiPatch, apiPost, apiPut, ApiClientError } from '@/api/client';
import { getApiBaseUrl } from '@/api/config';
import type { ApiResult } from '@/api/types';
import type { Media, MediaFolder } from '@/schemas';

export async function createMedia(body: {
  title: string;
  provider: 'external' | 'google_drive';
  media_type: Media['media_type'];
  preview_url?: string;
  download_url?: string;
  thumbnail_url?: string;
  provider_file_id?: string;
  sharing?: Media['sharing'];
  mime_type?: string;
  file_name?: string;
}): Promise<Media> {
  return apiPost<Media>('/api/media', body);
}

export async function patchMedia(
  id: string,
  body: Partial<{
    title: string;
    status: Media['status'];
    preview_url: string;
    download_url: string;
    thumbnail_url: string;
    sharing: Media['sharing'];
    mime_type: string;
    file_name: string;
    folder_id: string | null;
  }>
): Promise<Media> {
  return apiPatch<Media>(`/api/media/${id}`, body);
}

/** Replaces the whole Resource Library folder tree. */
export async function saveMediaFolders(folders: MediaFolder[]): Promise<MediaFolder[]> {
  const result = await apiPut<{ folders: MediaFolder[] }>('/api/media-folders', { folders });
  return result.folders;
}

function isApiResult<T>(value: unknown): value is ApiResult<T> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) {
    return false;
  }
  return typeof (value as ApiResult<T>).ok === 'boolean';
}

async function parseApiResponse<T>(response: Response): Promise<ApiResult<T>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError({
      code: 'invalid_response',
      message: 'Response is not valid JSON'
    });
  }

  if (!isApiResult<T>(body)) {
    throw new ApiClientError({
      code: 'invalid_response',
      message: `Unexpected response shape (HTTP ${response.status})`
    });
  }

  return body;
}

/**
 * Netlify drops request bodies over 6 MB before the function runs, so files
 * larger than this go up in parts that the server joins on the last one.
 */
export const UPLOAD_PART_BYTES = 3 * 1024 * 1024;

function newUploadId(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `up_${random.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

async function postMediaForm(form: FormData): Promise<unknown> {
  const url = `${getApiBaseUrl()}/api/media/upload`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      body: form
    });
  } catch (cause) {
    throw new ApiClientError({
      code: 'network_error',
      message: cause instanceof Error ? cause.message : 'Network request failed'
    });
  }

  const result = await parseApiResponse<unknown>(response);
  if (!result.ok) {
    throw new ApiClientError(result.error);
  }
  return result.data;
}

export async function uploadMediaFile(
  file: File,
  opts?: { title?: string; provider_file_id?: string }
): Promise<Media> {
  const partCount = Math.max(1, Math.ceil(file.size / UPLOAD_PART_BYTES));
  const uploadId = partCount > 1 ? newUploadId() : '';
  let data: unknown;
  for (let index = 0; index < partCount; index += 1) {
    const form = new FormData();
    const part =
      partCount > 1
        ? new File([file.slice(index * UPLOAD_PART_BYTES, (index + 1) * UPLOAD_PART_BYTES)], file.name, {
            type: file.type
          })
        : file;
    form.append('file', part, file.name);
    if (opts?.title) form.append('title', opts.title);
    if (opts?.provider_file_id) form.append('provider_file_id', opts.provider_file_id);
    if (partCount > 1) {
      form.append('upload_id', uploadId);
      form.append('part_index', String(index));
      form.append('part_count', String(partCount));
    }
    data = await postMediaForm(form);
  }
  return data as Media;
}
