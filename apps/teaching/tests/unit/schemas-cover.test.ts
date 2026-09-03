import { describe, expect, it } from 'vitest';
import { CoverSchema, resolveCoverUrl, type Media } from '@/schemas';

describe('CoverSchema', () => {
  it('accepts url covers', () => {
    const cover = CoverSchema.parse({
      url: 'https://example.com/cover.jpg',
      alt_text: 'School of Athens'
    });
    expect(cover.url).toContain('example.com');
  });

  it('accepts media_id covers', () => {
    expect(CoverSchema.parse({ media_id: 'media_1' }).media_id).toBe('media_1');
  });

  it('rejects empty cover', () => {
    expect(CoverSchema.safeParse({}).success).toBe(false);
  });

  it('rejects non-http urls', () => {
    expect(CoverSchema.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false);
  });
});

describe('resolveCoverUrl', () => {
  const media: Media[] = [
    {
      id: 'media_img',
      type: 'media',
      title: 'Banner',
      slug: 'banner',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1,
      provider: 'external',
      media_type: 'image',
      preview_url: 'https://cdn.example.com/preview.jpg',
      thumbnail_url: 'https://cdn.example.com/thumb.jpg'
    }
  ];

  it('prefers media preview when media_id is set', () => {
    expect(
      resolveCoverUrl({ media_id: 'media_img', url: 'https://other.example.com/x.jpg' }, media)
    ).toBe('https://cdn.example.com/preview.jpg');
  });

  it('falls back to url', () => {
    expect(resolveCoverUrl({ url: 'https://example.com/a.jpg' }, media)).toBe(
      'https://example.com/a.jpg'
    );
  });
});
