import { parseVideoInput, type VideoProvider } from '@/blocks/video-url';

export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  education_score: number;
}

export interface SearchImage {
  image_url: string;
  source_page_url: string;
  title: string;
  width?: number;
  height?: number;
}

export interface SearchVideo {
  provider: VideoProvider;
  external_id: string;
  url: string;
  title: string;
}

export interface SearchPack {
  query: string;
  searched_at: string;
  available: boolean;
  sources: SearchSource[];
  images: SearchImage[];
  videos: SearchVideo[];
}

type UnknownRecord = Record<string, unknown>;

const EDUCATIONAL_HOSTS = [
  'britannica.com',
  'si.edu',
  'smithsonianmag.com',
  'nationalgeographic.com',
  'khanacademy.org',
  'unesco.org',
  'australian.museum',
  'nma.gov.au'
];

function objectValue(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function resultsFrom(value: unknown, path: string[]): unknown[] {
  let current: unknown = value;
  for (const segment of path) {
    current = objectValue(current)?.[segment];
  }
  return Array.isArray(current) ? current : [];
}

export function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function educationScore(value: string): number {
  const canonicalUrl = httpsUrl(value);
  if (!canonicalUrl) return -1000;

  const host = new URL(canonicalUrl).hostname.toLowerCase();
  let score = 0;

  if (host.endsWith('.edu') || /(?:^|\.)(?:edu|ac)\.[a-z]{2}$/.test(host)) score += 100;
  if (host.endsWith('.gov') || /(?:^|\.)gov\.[a-z]{2}$/.test(host)) score += 90;
  if (EDUCATIONAL_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    score += 80;
  }
  if (['museum', 'university', 'encyclop'].some((term) => host.includes(term))) score += 50;
  if (['pinterest', 'facebook', 'instagram', 'tiktok'].some((term) => host.includes(term))) {
    score -= 80;
  }

  return score;
}

export function emptySearchPack(query: string, searchedAt = new Date().toISOString()): SearchPack {
  return {
    query,
    searched_at: searchedAt,
    available: false,
    sources: [],
    images: [],
    videos: []
  };
}

export function normalizeBraveSearchResults(input: unknown): SearchPack {
  const payload = objectValue(input) ?? {};
  const query = typeof payload.query === 'string' ? payload.query : '';
  const searchedAt =
    typeof payload.searchedAt === 'string' ? payload.searchedAt : new Date().toISOString();
  const webPayload = payload.web;
  const imagePayload = payload.images;
  const videoPayload = payload.videos;

  const sources = resultsFrom(webPayload, ['web', 'results'])
    .map((value, index) => {
      const result = objectValue(value);
      const title = requiredString(result?.title);
      const url = httpsUrl(result?.url);
      const snippet = requiredString(result?.description);
      if (!title || !url || !snippet) return null;

      return {
        index,
        source: {
          title,
          url,
          snippet,
          domain: new URL(url).hostname,
          education_score: educationScore(url)
        } satisfies SearchSource
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort(
      (left, right) =>
        right.source.education_score - left.source.education_score || left.index - right.index
    )
    .slice(0, 8)
    .map(({ source }) => source);

  const images = resultsFrom(imagePayload, ['results'])
    .map((value): SearchImage | null => {
      const result = objectValue(value);
      const properties = objectValue(result?.properties);
      const title = requiredString(result?.title);
      const sourcePageUrl = httpsUrl(result?.url);
      const imageUrl = httpsUrl(properties?.url);
      if (!title || !sourcePageUrl || !imageUrl) return null;

      const image: SearchImage = {
        image_url: imageUrl,
        source_page_url: sourcePageUrl,
        title
      };
      if (typeof properties?.width === 'number' && Number.isFinite(properties.width)) {
        image.width = properties.width;
      }
      if (typeof properties?.height === 'number' && Number.isFinite(properties.height)) {
        image.height = properties.height;
      }
      return image;
    })
    .filter((image): image is SearchImage => image !== null)
    .slice(0, 6);

  const videos = resultsFrom(videoPayload, ['results'])
    .map((value): SearchVideo | null => {
      const result = objectValue(value);
      const title = requiredString(result?.title);
      const url = httpsUrl(result?.url);
      if (!title || !url) return null;

      const parsed = parseVideoInput(url);
      if (!parsed) return null;

      return {
        provider: parsed.provider,
        external_id: parsed.external_id,
        url,
        title
      };
    })
    .filter((video): video is SearchVideo => video !== null)
    .slice(0, 6);

  return {
    query,
    searched_at: searchedAt,
    available: [webPayload, imagePayload, videoPayload].some(
      (value) => objectValue(value) !== null
    ),
    sources,
    images,
    videos
  };
}
