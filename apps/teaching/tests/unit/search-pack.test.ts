import { describe, expect, it } from 'vitest';
import {
  educationScore,
  emptySearchPack,
  httpsUrl,
  normalizeBraveSearchResults
} from '@/ai/search-pack';

const SEARCHED_AT = '2026-08-16T10:00:00.000Z';

describe('educationScore', () => {
  it('ranks an educational reference above a commercial listicle', () => {
    expect(educationScore('https://www.britannica.com/topic/cheese')).toBeGreaterThan(
      educationScore('https://best-cheese-deals.example/listicle')
    );
  });

  it('scores US and UK academic domains positively', () => {
    expect(educationScore('https://www.si.edu/spotlight/cheese')).toBeGreaterThan(0);
    expect(educationScore('https://www.cam.ac.uk/research')).toBeGreaterThan(0);
  });

  it('gives international .edu.<cc> hosts the same academic boost as .ac.<cc>', () => {
    expect(educationScore('https://www.sydney.edu.au/research')).toBe(
      educationScore('https://www.cam.ac.uk/research')
    );
    expect(educationScore('https://www.sydney.edu.au/research')).toBe(100);
    expect(educationScore('https://notanedu.au/')).toBe(0);
  });

  it('rejects invalid and insecure URLs', () => {
    expect(educationScore('not a URL')).toBe(-1000);
    expect(educationScore('http://www.si.edu/')).toBe(-1000);
  });
});

describe('httpsUrl', () => {
  it('returns canonical absolute HTTPS URLs only', () => {
    expect(httpsUrl('https://example.com/a path?q=one two')).toBe(
      'https://example.com/a%20path?q=one%20two'
    );
    expect(httpsUrl('http://example.com')).toBeNull();
    expect(httpsUrl('/relative')).toBeNull();
    expect(httpsUrl(42)).toBeNull();
  });
});

describe('normalizeBraveSearchResults', () => {
  it('defensively maps HTTPS web, image, and supported video results and applies caps', () => {
    const webResults: unknown[] = [
      {
        title: 'Museum cheese guide',
        url: 'https://museum.example/cheese',
        description: 'A guide to cheese.'
      },
      {
        title: 'Unsafe source',
        url: 'http://unsafe.example',
        description: 'Not encrypted.'
      },
      ...Array.from({ length: 9 }, (_, index) => ({
        title: `Source ${index}`,
        url: `https://source-${index}.example/cheese`,
        description: `Description ${index}`
      }))
    ];
    const imageResults: unknown[] = [
      {
        title: 'Cheese',
        url: 'https://museum.example/cheese',
        properties: {
          url: 'https://images.example/cheese.jpg',
          width: 1200,
          height: 800
        }
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        title: `Cheese ${index}`,
        url: `https://source-${index}.example/cheese`,
        properties: { url: `https://images.example/cheese-${index}.jpg` }
      })),
      {
        title: 'Unsafe image',
        url: 'https://museum.example/cheese',
        properties: { url: 'http://images.example/unsafe.jpg' }
      }
    ];
    const videoResults: unknown[] = [
      {
        title: 'Cheese video',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      },
      {
        title: 'Unsupported video',
        url: 'https://video.example/watch/1'
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        title: `Vimeo ${index}`,
        url: `https://vimeo.com/${123456789 + index}`
      }))
    ];

    const pack = normalizeBraveSearchResults({
      query: 'cheese types',
      searchedAt: SEARCHED_AT,
      web: { web: { results: webResults } },
      images: { results: imageResults },
      videos: { results: videoResults }
    });

    expect(pack.query).toBe('cheese types');
    expect(pack.searched_at).toBe(SEARCHED_AT);
    expect(pack.available).toBe(true);
    expect(pack.sources).toHaveLength(8);
    expect(pack.sources[0]).toMatchObject({
      title: 'Museum cheese guide',
      url: 'https://museum.example/cheese',
      snippet: 'A guide to cheese.',
      domain: 'museum.example'
    });
    expect(pack.sources.every((source) => source.url.startsWith('https://'))).toBe(true);
    expect(pack.images).toHaveLength(6);
    expect(pack.images[0]).toEqual({
      image_url: 'https://images.example/cheese.jpg',
      source_page_url: 'https://museum.example/cheese',
      title: 'Cheese',
      width: 1200,
      height: 800
    });
    expect(pack.videos).toHaveLength(6);
    expect(pack.videos[0]).toEqual({
      provider: 'youtube',
      external_id: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Cheese video'
    });
    expect(pack.videos.some((video) => video.url.includes('video.example'))).toBe(false);
  });

  it('sorts sources by descending education score and preserves provider order for ties', () => {
    const pack = normalizeBraveSearchResults({
      query: 'cheese',
      searchedAt: SEARCHED_AT,
      web: {
        web: {
          results: [
            { title: 'First tie', url: 'https://alpha.example/a', description: 'A' },
            { title: 'Britannica', url: 'https://britannica.com/b', description: 'B' },
            { title: 'Second tie', url: 'https://beta.example/c', description: 'C' },
            { title: 'University', url: 'https://cheese-university.example/d', description: 'D' }
          ]
        }
      }
    });

    expect(pack.sources.map((source) => source.title)).toEqual([
      'Britannica',
      'University',
      'First tie',
      'Second tie'
    ]);
  });

  it('is available when an endpoint payload is parseable even with no results', () => {
    expect(
      normalizeBraveSearchResults({
        query: 'cheese',
        searchedAt: SEARCHED_AT,
        web: { web: { results: [] } },
        images: null,
        videos: 'unavailable'
      })
    ).toEqual({
      query: 'cheese',
      searched_at: SEARCHED_AT,
      available: true,
      sources: [],
      images: [],
      videos: []
    });
  });
});

describe('emptySearchPack', () => {
  it('returns an unavailable pack with the supplied timestamp', () => {
    expect(emptySearchPack('cheese types', SEARCHED_AT)).toEqual({
      query: 'cheese types',
      searched_at: SEARCHED_AT,
      available: false,
      sources: [],
      images: [],
      videos: []
    });
  });
});
