import { describe, it, expect } from 'vitest';
import type { Media } from '@/schemas/media';
import {
  collectRestrictedDriveMediaWarnings,
  formatPublishMediaWarnings
} from '@/teacher/publish-media-warnings';

const ISO = '2026-01-01T00:00:00.000Z';

function makeMedia(overrides: Partial<Media> & Pick<Media, 'id' | 'title'>): Media {
  return {
    type: 'media',
    slug: overrides.id,
    provider: 'google_drive',
    media_type: 'link',
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    ...overrides
  };
}

describe('collectRestrictedDriveMediaWarnings', () => {
  it('warns when lesson blocks reference urls belonging to restricted google_drive media', () => {
    const previewUrl = 'https://docs.google.com/document/d/restricted-doc';
    const media = [
      makeMedia({
        id: 'media_doc',
        title: 'Restricted Doc',
        sharing: 'restricted',
        preview_url: previewUrl
      })
    ];
    const blocks = [
      {
        id: 'block_1',
        type: 'embed',
        url: previewUrl
      }
    ];

    const warnings = collectRestrictedDriveMediaWarnings({ blocks, media });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Restricted Doc');
    expect(warnings[0]).toContain('restricted');
  });

  it('warns when blocks reference download_url, thumbnail_url, or provider_file_id', () => {
    const media = [
      makeMedia({
        id: 'media_download',
        title: 'Download Ref',
        sharing: 'unavailable',
        download_url: 'https://drive.google.com/uc?id=dl1'
      }),
      makeMedia({
        id: 'media_thumb',
        title: 'Thumb Ref',
        sharing: 'unknown',
        thumbnail_url: 'https://lh3.googleusercontent.com/thumb1'
      }),
      makeMedia({
        id: 'media_file',
        title: 'File Id Ref',
        sharing: 'restricted',
        provider_file_id: 'drive_file_abc'
      })
    ];

    expect(
      collectRestrictedDriveMediaWarnings({
        blocks: [{ url: 'https://drive.google.com/uc?id=dl1' }],
        media: [media[0]!]
      })
    ).toHaveLength(1);

    expect(
      collectRestrictedDriveMediaWarnings({
        blocks: [{ src: 'https://lh3.googleusercontent.com/thumb1' }],
        media: [media[1]!]
      })
    ).toHaveLength(1);

    expect(
      collectRestrictedDriveMediaWarnings({
        blocks: [{ provider_file_id: 'drive_file_abc' }],
        media: [media[2]!]
      })
    ).toHaveLength(1);
  });

  it('treats missing sharing as unknown and warns when referenced', () => {
    const previewUrl = 'https://docs.google.com/document/d/unknown-share';
    const warnings = collectRestrictedDriveMediaWarnings({
      blocks: [{ url: previewUrl }],
      media: [
        makeMedia({
          id: 'media_unknown',
          title: 'Unknown Share',
          preview_url: previewUrl
          // sharing omitted
        })
      ]
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('unknown');
  });

  it('does not warn for direct mirrored media', () => {
    expect(
      collectRestrictedDriveMediaWarnings({
        blocks: [{ url: 'https://example.com/api/media/media_direct/file' }],
        media: [
          makeMedia({
            id: 'media_direct',
            title: 'Mirrored PDF',
            provider: 'direct',
            media_type: 'pdf',
            sharing: 'public_link',
            preview_url: 'https://example.com/api/media/media_direct/file'
          })
        ]
      })
    ).toEqual([]);
  });

  it('does not warn for public_link google_drive media', () => {
    const previewUrl = 'https://docs.google.com/document/d/public-doc';
    expect(
      collectRestrictedDriveMediaWarnings({
        blocks: [{ url: previewUrl }],
        media: [
          makeMedia({
            id: 'media_public',
            title: 'Public Doc',
            sharing: 'public_link',
            preview_url: previewUrl
          })
        ]
      })
    ).toEqual([]);
  });

  it('does not warn when restricted Drive media is not referenced by blocks', () => {
    expect(
      collectRestrictedDriveMediaWarnings({
        blocks: [{ url: 'https://example.com/unrelated' }],
        media: [
          makeMedia({
            id: 'media_unused',
            title: 'Unused Restricted',
            sharing: 'restricted',
            preview_url: 'https://docs.google.com/document/d/unused'
          })
        ]
      })
    ).toEqual([]);
  });

  it('does not warn for archived google_drive media even if referenced', () => {
    const previewUrl = 'https://docs.google.com/document/d/archived';
    expect(
      collectRestrictedDriveMediaWarnings({
        blocks: [{ url: previewUrl }],
        media: [
          makeMedia({
            id: 'media_archived',
            title: 'Archived Doc',
            status: 'archived',
            sharing: 'restricted',
            preview_url: previewUrl
          })
        ]
      })
    ).toEqual([]);
  });

  it('ignores empty needle strings when matching references', () => {
    expect(
      collectRestrictedDriveMediaWarnings({
        blocks: [{ url: '' }],
        media: [
          makeMedia({
            id: 'media_empty',
            title: 'Empty Needles',
            sharing: 'restricted',
            preview_url: '',
            download_url: '',
            thumbnail_url: '',
            provider_file_id: ''
          })
        ]
      })
    ).toEqual([]);
  });

  it('dedupes one warning per media item even if multiple urls match', () => {
    const previewUrl = 'https://docs.google.com/document/d/multi';
    const fileId = 'multi_file_id';
    const warnings = collectRestrictedDriveMediaWarnings({
      blocks: [{ preview_url: previewUrl, provider_file_id: fileId }],
      media: [
        makeMedia({
          id: 'media_multi',
          title: 'Multi Match',
          sharing: 'restricted',
          preview_url: previewUrl,
          provider_file_id: fileId
        })
      ]
    });

    expect(warnings).toHaveLength(1);
  });
});

describe('formatPublishMediaWarnings', () => {
  it('joins warning lines for confirm dialogs', () => {
    expect(formatPublishMediaWarnings(['a', 'b'])).toBe('a\nb');
  });
});
