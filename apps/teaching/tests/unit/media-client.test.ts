import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Media } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

const sampleMedia: Media = {
  id: 'media_1',
  type: 'media',
  title: 'Sample',
  slug: 'sample',
  provider: 'external',
  media_type: 'pdf',
  status: 'active',
  preview_url: 'https://example.com/a.pdf',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

function mockFetchJson(body: unknown, status = 200): Response {
  return {
    status,
    json: async () => body
  } as Response;
}

describe('teacher media-api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createMedia posts JSON to /api/media', async () => {
    fetchMock.mockResolvedValue(mockFetchJson({ ok: true, data: sampleMedia }, 201));

    const { createMedia } = await import('@/teacher/media-api');
    const result = await createMedia({
      title: 'Paste PDF',
      provider: 'external',
      media_type: 'pdf',
      preview_url: 'https://example.com/a.pdf'
    });

    expect(result).toEqual(sampleMedia);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/media',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          title: 'Paste PDF',
          provider: 'external',
          media_type: 'pdf',
          preview_url: 'https://example.com/a.pdf'
        })
      })
    );
  });

  it('patchMedia patches /api/media/:id', async () => {
    const archived = { ...sampleMedia, status: 'archived' as const };
    fetchMock.mockResolvedValue(mockFetchJson({ ok: true, data: archived }));

    const { patchMedia } = await import('@/teacher/media-api');
    const result = await patchMedia('media_1', { status: 'archived' });

    expect(result.status).toBe('archived');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/media/media_1',
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        body: JSON.stringify({ status: 'archived' })
      })
    );
  });

  it('uploadMediaFile posts FormData without Content-Type', async () => {
    const uploaded: Media = {
      ...sampleMedia,
      id: 'media_up',
      provider: 'direct',
      media_type: 'image',
      title: 'Cover'
    };
    fetchMock.mockResolvedValue(mockFetchJson({ ok: true, data: uploaded }, 201));

    const { uploadMediaFile } = await import('@/teacher/media-api');
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' });
    const result = await uploadMediaFile(file, { title: 'Cover', provider_file_id: 'drive_9' });

    expect(result).toEqual(uploaded);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/media/upload');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(init?.body).toBeInstanceOf(FormData);
    const headers = init?.headers as Record<string, string> | Headers | undefined;
    if (headers instanceof Headers) {
      expect(headers.get('Content-Type')).toBeNull();
    } else if (headers && typeof headers === 'object') {
      expect((headers as Record<string, string>)['Content-Type']).toBeUndefined();
    }
    const form = init?.body as FormData;
    expect(form.get('title')).toBe('Cover');
    expect(form.get('provider_file_id')).toBe('drive_9');
    expect(form.get('file')).toBeInstanceOf(File);
  });
});
