import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadMediaQueue } from '@/teacher/media-uppy';
import type { Media } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

function media(id: string, title: string): Media {
  return {
    type: 'media',
    id,
    title,
    slug: id,
    provider: 'external',
    media_type: 'pdf',
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1
  } as Media;
}

describe('uploadMediaQueue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads every file through the provided uploadFile adapter', async () => {
    const uploadFile = vi
      .fn()
      .mockResolvedValueOnce(media('media_a', 'a.pdf'))
      .mockResolvedValueOnce(media('media_b', 'b.pdf'));

    const progress: string[] = [];
    const result = await uploadMediaQueue(
      [
        new File(['a'], 'a.pdf', { type: 'application/pdf' }),
        new File(['b'], 'b.pdf', { type: 'application/pdf' })
      ],
      {
        uploadFile,
        onProgress: (done, total, name) => {
          progress.push(`${done}/${total}:${name}`);
        }
      }
    );

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(result.successful.map((item) => item.id)).toEqual(['media_a', 'media_b']);
    expect(result.failed).toEqual([]);
    expect(progress.at(-1)).toMatch(/2\/2/);
  });

  it('keeps sibling uploads when one file fails', async () => {
    const uploadFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(media('media_b', 'b.pdf'));

    const result = await uploadMediaQueue(
      [
        new File(['a'], 'a.pdf', { type: 'application/pdf' }),
        new File(['b'], 'b.pdf', { type: 'application/pdf' })
      ],
      { uploadFile }
    );

    expect(result.successful.map((item) => item.id)).toEqual(['media_b']);
    expect(result.failed).toEqual([{ name: 'a.pdf', error: 'boom' }]);
  });
});
