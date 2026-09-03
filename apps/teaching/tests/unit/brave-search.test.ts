// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  buildLessonSearchQuery,
  searchPublicWeb
} from '../../netlify/functions/_shared/brave-search.mts';

const API_KEY = 'brave-secret-key-value';
const SEARCHED_AT = '2026-08-16T10:00:00.000Z';
const now = () => SEARCHED_AT;

const WEB_PAYLOAD = {
  web: {
    results: [
      {
        title: 'Cheese',
        url: 'https://www.britannica.com/topic/cheese',
        description: 'Britannica on cheese.'
      },
      {
        title: 'Cheese deals',
        url: 'https://cheese-deals.example/listicle',
        description: 'Buy cheese.'
      }
    ]
  }
};

const IMAGE_PAYLOAD = {
  results: [
    {
      title: 'Cheese wheel',
      url: 'https://www.britannica.com/topic/cheese',
      properties: { url: 'https://images.example/cheese.jpg', width: 1200, height: 800 }
    }
  ]
};

const VIDEO_PAYLOAD = {
  results: [{ title: 'How cheese is made', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }]
};

type EndpointName = 'web' | 'images' | 'videos';
type EndpointHandler = (init: RequestInit | undefined) => Response | Promise<Response>;

const ENDPOINT_PATHS: Record<EndpointName, string> = {
  web: '/res/v1/web/search',
  images: '/res/v1/images/search',
  videos: '/res/v1/videos/search'
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function requestUrl(input: string | URL | Request): URL {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

/** Routes each Brave endpoint to its own handler so tests can fail one lane at a time. */
function mockFetch(handlers: Record<EndpointName, EndpointHandler>) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = requestUrl(input);
    const name = (Object.keys(ENDPOINT_PATHS) as EndpointName[]).find(
      (endpoint) => ENDPOINT_PATHS[endpoint] === url.pathname
    );
    if (!name) throw new Error(`Unexpected request path: ${url.pathname}`);
    return handlers[name](init);
  });
}

function successFetch() {
  return mockFetch({
    web: () => jsonResponse(WEB_PAYLOAD),
    images: () => jsonResponse(IMAGE_PAYLOAD),
    videos: () => jsonResponse(VIDEO_PAYLOAD)
  });
}

function callFor(
  fetchImpl: ReturnType<typeof mockFetch>,
  endpoint: EndpointName
): { url: URL; init: RequestInit | undefined } {
  const call = fetchImpl.mock.calls.find(
    ([input]) => requestUrl(input as string | URL | Request).pathname === ENDPOINT_PATHS[endpoint]
  );
  if (!call) throw new Error(`No request made to ${endpoint}`);
  return { url: requestUrl(call[0] as string | URL | Request), init: call[1] };
}

const UNAVAILABLE_PACK = {
  searched_at: SEARCHED_AT,
  available: false,
  sources: [],
  images: [],
  videos: []
};

describe('buildLessonSearchQuery', () => {
  it('keeps long lesson prompts within Brave’s 50-word limit', () => {
    const message = `Keep the existing starter heading. Insert additional blocks below it for a Year 12 psychology mini-lesson on dual coding. Australian English.

You MUST propose at least four different Teaching Hub block types in one proposal. Include ALL of the following:
- rich_text or callout that contains this exact phrase: durable jobs outlive the request
- image (real https URL from the search pack, with meaningful alt text)
- video (YouTube or Vimeo from the search pack)`;

    const query = buildLessonSearchQuery(message, 'Job check durable');

    expect(query.trim().split(/\s+/)).toHaveLength(50);
    expect(query).toContain('dual coding');
    expect(query.endsWith('Lesson: Job check durable')).toBe(true);
  });
});

describe('searchPublicWeb', () => {
  it('queries web, image, and video endpoints once each and returns a normalized pack', async () => {
    const fetchImpl = successFetch();

    const pack = await searchPublicWeb({
      query: 'cheese types',
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(
      fetchImpl.mock.calls
        .map(([input]) => requestUrl(input as string | URL | Request).pathname)
        .sort()
    ).toEqual([
      '/res/v1/images/search',
      '/res/v1/videos/search',
      '/res/v1/web/search'
    ]);

    for (const endpoint of ['web', 'images', 'videos'] as EndpointName[]) {
      const { url, init } = callFor(fetchImpl, endpoint);
      expect(url.origin).toBe('https://api.search.brave.com');
      expect(url.searchParams.get('q')).toBe('cheese types');
      expect(url.searchParams.get('search_lang')).toBe('en');
      expect(url.searchParams.get('safesearch')).toBe('strict');
      expect(url.searchParams.get('count')).toBe(endpoint === 'web' ? '8' : '6');

      const headers = new Headers(init?.headers);
      expect(headers.get('accept')).toBe('application/json');
      expect(headers.get('accept-encoding')).toBe('gzip');
      expect(headers.get('x-subscription-token')).toBe(API_KEY);
    }

    expect(pack.query).toBe('cheese types');
    expect(pack.searched_at).toBe(SEARCHED_AT);
    expect(pack.available).toBe(true);
    expect(pack.sources[0]).toMatchObject({
      title: 'Cheese',
      url: 'https://www.britannica.com/topic/cheese',
      snippet: 'Britannica on cheese.',
      domain: 'www.britannica.com'
    });
    expect(pack.sources[0]?.education_score).toBeGreaterThan(0);
    expect(pack.images).toEqual([
      {
        image_url: 'https://images.example/cheese.jpg',
        source_page_url: 'https://www.britannica.com/topic/cheese',
        title: 'Cheese wheel',
        width: 1200,
        height: 800
      }
    ]);
    expect(pack.videos).toEqual([
      {
        provider: 'youtube',
        external_id: 'dQw4w9WgXcQ',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'How cheese is made'
      }
    ]);
    expect(JSON.stringify(pack)).not.toContain(API_KEY);
  });

  it('never calls the provider when the API key is missing or blank', async () => {
    const fetchImpl = successFetch();

    const withoutKey = await searchPublicWeb({
      query: 'cheese types',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now
    });
    const withBlankKey = await searchPublicWeb({
      query: 'cheese types',
      apiKey: '   ',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(withoutKey).toEqual({ query: 'cheese types', ...UNAVAILABLE_PACK });
    expect(withBlankKey).toEqual({ query: 'cheese types', ...UNAVAILABLE_PACK });
  });

  it('never calls the provider for a blank query', async () => {
    const fetchImpl = successFetch();

    const pack = await searchPublicWeb({
      query: '   \n ',
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(pack).toEqual({ query: '', ...UNAVAILABLE_PACK });
  });

  it('returns an unavailable pack without throwing when every endpoint fails', async () => {
    const fetchImpl = mockFetch({
      web: () => new Response('provider blew up', { status: 500 }),
      images: () => new Response('provider blew up', { status: 500 }),
      videos: () => new Response('provider blew up', { status: 500 })
    });

    const pack = await searchPublicWeb({
      query: 'cheese types',
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(pack).toEqual({ query: 'cheese types', ...UNAVAILABLE_PACK });
    expect(JSON.stringify(pack)).not.toContain('provider blew up');
  });

  it('keeps the results of endpoints that succeed when the web lane fails', async () => {
    const fetchImpl = mockFetch({
      web: () => new Response('nope', { status: 429 }),
      images: () => jsonResponse(IMAGE_PAYLOAD),
      videos: () => jsonResponse(VIDEO_PAYLOAD)
    });

    const pack = await searchPublicWeb({
      query: 'cheese types',
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now
    });

    expect(pack.available).toBe(true);
    expect(pack.sources).toEqual([]);
    expect(pack.images).toHaveLength(1);
    expect(pack.videos).toHaveLength(1);
  });

  it('keeps web results when the image and video lanes fail', async () => {
    const fetchImpl = mockFetch({
      web: () => jsonResponse(WEB_PAYLOAD),
      images: () => Promise.reject(new TypeError('network down')),
      videos: () => new Response('not json', { status: 200 })
    });

    const pack = await searchPublicWeb({
      query: 'cheese types',
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now
    });

    expect(pack.available).toBe(true);
    expect(pack.sources).toHaveLength(2);
    expect(pack.images).toEqual([]);
    expect(pack.videos).toEqual([]);
  });

  it('returns an unavailable pack when every endpoint returns invalid JSON', async () => {
    const invalid = () => new Response('<html>error</html>', { status: 200 });
    const fetchImpl = mockFetch({ web: invalid, images: invalid, videos: invalid });

    const pack = await searchPublicWeb({
      query: 'cheese types',
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now
    });

    expect(pack).toEqual({ query: 'cheese types', ...UNAVAILABLE_PACK });
  });

  it('aborts slow requests on its own timeout and returns an unavailable pack', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);

    // Resolving successfully without a signal makes this test fail loudly if the
    // client ever stops wiring its own abort timeout into the request.
    const pending: EndpointHandler = (init) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          resolve(jsonResponse(WEB_PAYLOAD));
          return;
        }
        signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    const fetchImpl = mockFetch({ web: pending, images: pending, videos: pending });

    try {
      const startedAt = Date.now();
      const pack = await searchPublicWeb({
        query: 'cheese types',
        apiKey: API_KEY,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now,
        timeoutMs: 10
      });

      expect(Date.now() - startedAt).toBeLessThan(1500);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(pack).toEqual({ query: 'cheese types', ...UNAVAILABLE_PACK });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('stamps searched_at from the injected clock', async () => {
    const stamps = ['2026-01-01T00:00:00.000Z', '2026-02-02T00:00:00.000Z'];
    let index = 0;

    const available = await searchPublicWeb({
      query: 'cheese types',
      apiKey: API_KEY,
      fetchImpl: successFetch() as unknown as typeof fetch,
      now: () => stamps[index++] ?? ''
    });
    const unavailable = await searchPublicWeb({
      query: 'cheese types',
      fetchImpl: successFetch() as unknown as typeof fetch,
      now: () => stamps[index++] ?? ''
    });

    expect(available.searched_at).toBe(stamps[0]);
    expect(unavailable.searched_at).toBe(stamps[1]);
  });
});
