export type VideoProvider = 'youtube' | 'vimeo';

export interface ParsedVideo {
  provider: VideoProvider;
  external_id: string;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;

export function parseVideoInput(raw: string): ParsedVideo | null {
  const input = raw.trim();
  if (!input) return null;

  if (YOUTUBE_ID.test(input)) {
    return { provider: 'youtube', external_id: input };
  }

  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
      if (YOUTUBE_ID.test(id)) return { provider: 'youtube', external_id: id };
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const v = url.searchParams.get('v');
      if (v && YOUTUBE_ID.test(v)) return { provider: 'youtube', external_id: v };
      const embed = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})/);
      if (embed) return { provider: 'youtube', external_id: embed[1] };
    }

    if (host === 'vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
      if (VIMEO_ID.test(id)) return { provider: 'vimeo', external_id: id };
    }
  } catch {
    // not a URL
  }

  return null;
}

export function videoEmbedSrc(provider: VideoProvider, externalId: string): string {
  if (provider === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(externalId)}`;
  }
  return `https://player.vimeo.com/video/${encodeURIComponent(externalId)}`;
}
