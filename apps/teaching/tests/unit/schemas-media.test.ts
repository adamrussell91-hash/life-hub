import { describe, it, expect } from 'vitest';
import { MediaSchema } from '@/schemas/media';
import { mediaFileKey } from '@/storage/keys';

const sample = {
  id: 'media_ono_extract',
  type: 'media' as const,
  title: 'Ono Extract',
  slug: 'ono_extract',
  provider: 'external' as const,
  media_type: 'pdf' as const,
  mime_type: 'application/pdf',
  file_name: 'ono-extract.pdf',
  preview_url: 'https://example.com/ono-extract.pdf',
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schema_version: 1 as const
};

const base = {
  id: 'media_ono_extract',
  type: 'media' as const,
  title: 'Ono Extract',
  slug: 'ono_extract',
  provider: 'external' as const,
  media_type: 'pdf' as const,
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schema_version: 1 as const
};

describe('MediaSchema', () => {
  it('accepts a valid media record', () => {
    expect(MediaSchema.parse(sample).id).toBe('media_ono_extract');
  });

  it('rejects invalid provider', () => {
    expect(() => MediaSchema.parse({ ...sample, provider: 'dropbox' })).toThrow();
  });

  it('rejects invalid media_type', () => {
    expect(() => MediaSchema.parse({ ...sample, media_type: 'audio' })).toThrow();
  });
});

describe('MediaSchema extensions', () => {
  it('accepts direct provider with provider_file_id and sharing', () => {
    const parsed = MediaSchema.parse({
      ...base,
      provider: 'direct',
      provider_file_id: 'drive_abc',
      sharing: 'public_link',
      preview_url: 'https://example.com/api/media/media_ono_extract/file',
      mime_type: 'application/pdf'
    });
    expect(parsed.provider).toBe('direct');
    expect(parsed.provider_file_id).toBe('drive_abc');
    expect(parsed.sharing).toBe('public_link');
  });

  it('rejects invalid sharing', () => {
    expect(() => MediaSchema.parse({ ...base, sharing: 'open' })).toThrow();
  });
});

describe('mediaFileKey', () => {
  it('stores binaries under media_files/', () => {
    expect(mediaFileKey('media_1')).toBe('media_files/media_1');
  });
});
