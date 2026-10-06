export type VideoProvider = 'youtube' | 'vimeo' | 'file';

export interface ParsedVideo {
  provider: VideoProvider;
  /** YouTube/Vimeo id, or the full https URL for a direct video file. */
  external_id: string;
  start_seconds?: number;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;
const VIDEO_FILE = /\.(mp4|m4v|webm|ogv|ogg|mov)$/i;

/** `90`, `90s`, `1m30s`, `1h2m3s` → seconds. */
export function parseStartTime(raw: string | null | undefined): number | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value) || undefined;
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match[0]) return undefined;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return seconds || undefined;
}

function withStart(parsed: ParsedVideo, start: number | undefined): ParsedVideo {
  return start ? { ...parsed, start_seconds: start } : parsed;
}

export function parseVideoInput(raw: string): ParsedVideo | null {
  const input = raw.trim();
  if (!input) return null;

  if (YOUTUBE_ID.test(input)) {
    return { provider: 'youtube', external_id: input };
  }

  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, '');
    const youtubeStart = parseStartTime(url.searchParams.get('t') ?? url.searchParams.get('start'));

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
      if (YOUTUBE_ID.test(id)) return withStart({ provider: 'youtube', external_id: id }, youtubeStart);
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const v = url.searchParams.get('v');
      if (v && YOUTUBE_ID.test(v)) return withStart({ provider: 'youtube', external_id: v }, youtubeStart);
      const path = url.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
      if (path) return withStart({ provider: 'youtube', external_id: path[1] }, youtubeStart);
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean).find((part) => VIMEO_ID.test(part)) ?? '';
      const hashStart = parseStartTime(url.hash.match(/t=([0-9hms]+)/i)?.[1]);
      if (id) return withStart({ provider: 'vimeo', external_id: id }, hashStart);
    }

    if (url.protocol === 'https:' && VIDEO_FILE.test(url.pathname)) {
      return { provider: 'file', external_id: url.toString() };
    }
  } catch {
    // not a URL
  }

  return null;
}

/**
 * The video a block should play. Falls back to re-parsing the pasted URL so
 * blocks saved before direct files and start times were understood still play.
 */
export function resolveVideoContent(content: {
  provider: VideoProvider;
  external_id: string;
  url?: string;
  start_seconds?: number;
}): ParsedVideo | null {
  const fromUrl = content.url ? parseVideoInput(content.url) : null;
  if (!content.external_id.trim()) return fromUrl;
  const start =
    content.start_seconds ??
    (fromUrl && fromUrl.external_id === content.external_id ? fromUrl.start_seconds : undefined);
  return withStart({ provider: content.provider, external_id: content.external_id }, start);
}

export function videoEmbedSrc(
  provider: Exclude<VideoProvider, 'file'>,
  externalId: string,
  startSeconds?: number
): string {
  if (provider === 'youtube') {
    const start = startSeconds ? `?start=${startSeconds}` : '';
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(externalId)}${start}`;
  }
  const start = startSeconds ? `#t=${startSeconds}s` : '';
  return `https://player.vimeo.com/video/${encodeURIComponent(externalId)}${start}`;
}
