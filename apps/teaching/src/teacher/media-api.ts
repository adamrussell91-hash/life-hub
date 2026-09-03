import { apiPatch, apiPost, ApiClientError } from '@/api/client';
import { getApiBaseUrl } from '@/api/config';
import type { ApiResult } from '@/api/types';
import type { Media } from '@/schemas';

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
  }>
): Promise<Media> {
  return apiPatch<Media>(`/api/media/${id}`, body);
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

export async function uploadMediaFile(
  file: File,
  opts?: { title?: string; provider_file_id?: string }
): Promise<Media> {
  const form = new FormData();
  form.append('file', file, file.name);
  if (opts?.title) form.append('title', opts.title);
  if (opts?.provider_file_id) form.append('provider_file_id', opts.provider_file_id);

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

  const result = await parseApiResponse<Media>(response);
  if (!result.ok) {
    throw new ApiClientError(result.error);
  }
  return result.data;
}
