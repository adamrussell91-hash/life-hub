import { isHttpUrl } from '@/blocks/url-safety';
import type { EmbedProvider } from '@/schemas/block';

export interface ParsedEmbed {
  provider: EmbedProvider;
  embed_url?: string;
}

function slidesEmbedFromPath(pathname: string): string | undefined {
  const published = pathname.match(/\/presentation\/d\/e\/([^/]+)/);
  if (published) {
    return `https://docs.google.com/presentation/d/e/${published[1]}/embed`;
  }
  const match = pathname.match(/\/presentation\/d\/([^/]+)/);
  if (!match || match[1] === 'e') return undefined;
  return `https://docs.google.com/presentation/d/${match[1]}/embed`;
}

function docsPreviewFromPath(pathname: string): string | undefined {
  const published = pathname.match(/\/document\/d\/e\/([^/]+)/);
  if (published) {
    return `https://docs.google.com/document/d/e/${published[1]}/pub?embedded=true`;
  }
  const match = pathname.match(/\/document\/d\/([^/]+)/);
  if (!match || match[1] === 'e') return undefined;
  return `https://docs.google.com/document/d/${match[1]}/preview`;
}

function sheetsPreviewFromPath(pathname: string): string | undefined {
  const published = pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/);
  if (published) {
    return `https://docs.google.com/spreadsheets/d/e/${published[1]}/pubhtml?widget=true&headers=false`;
  }
  const match = pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match || match[1] === 'e') return undefined;
  return `https://docs.google.com/spreadsheets/d/${match[1]}/preview`;
}

function driveFileId(url: URL): string | undefined {
  const fromPath = url.pathname.match(/\/file\/d\/([^/]+)/);
  if (fromPath) return fromPath[1];
  const fromQuery = url.searchParams.get('id')?.trim();
  return fromQuery || undefined;
}

function isGoogleMapsUrl(host: string, pathname: string): boolean {
  if (host === 'maps.google.com') return true;
  if (host === 'goo.gl' && pathname.startsWith('/maps')) return true;
  if ((host === 'google.com' || host.endsWith('.google.com')) && pathname.startsWith('/maps')) {
    return true;
  }
  return false;
}

export function parseEmbedInput(raw: string): ParsedEmbed | null {
  const input = raw.trim();
  if (!input || !isHttpUrl(input)) return null;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'docs.google.com' && url.pathname.includes('/presentation/')) {
    if (url.pathname.includes('/embed')) {
      return { provider: 'google_slides', embed_url: url.toString() };
    }
    const embed_url = slidesEmbedFromPath(url.pathname);
    return { provider: 'google_slides', ...(embed_url ? { embed_url } : {}) };
  }

  if (host === 'docs.google.com' && url.pathname.includes('/document/')) {
    const embed_url = docsPreviewFromPath(url.pathname);
    return { provider: 'google_docs', ...(embed_url ? { embed_url } : {}) };
  }

  if (host === 'docs.google.com' && url.pathname.includes('/spreadsheets/')) {
    const embed_url = sheetsPreviewFromPath(url.pathname);
    return { provider: 'generic', ...(embed_url ? { embed_url } : {}) };
  }

  if (host === 'drive.google.com') {
    const fileId = driveFileId(url);
    if (fileId) {
      return {
        provider: 'pdf',
        embed_url: `https://drive.google.com/file/d/${fileId}/preview`
      };
    }
  }

  if (url.pathname.toLowerCase().endsWith('.pdf')) {
    return { provider: 'pdf' };
  }

  if (isGoogleMapsUrl(host, url.pathname)) {
    if (url.pathname.includes('/embed') || url.searchParams.get('output') === 'embed') {
      return { provider: 'google_maps', embed_url: url.toString() };
    }
    const at = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (at) {
      return {
        provider: 'google_maps',
        embed_url: `https://maps.google.com/maps?q=${at[1]},${at[2]}&z=15&output=embed`
      };
    }
    return {
      provider: 'google_maps',
      embed_url: `https://maps.google.com/maps?q=${encodeURIComponent(url.href)}&output=embed`
    };
  }

  return { provider: 'generic' };
}

export function embedFrameSrc(content: {
  url: string;
  provider?: EmbedProvider;
  embed_url?: string;
}): string | null {
  const provider = content.provider ?? 'generic';
  if (content.embed_url && isHttpUrl(content.embed_url)) {
    return content.embed_url.trim();
  }

  const parsed = parseEmbedInput(content.url);
  if (parsed?.embed_url && isHttpUrl(parsed.embed_url)) return parsed.embed_url;

  if (provider === 'google_docs' || provider === 'pdf') return null;

  if (isHttpUrl(content.url)) return content.url.trim();
  return null;
}

export function embedUsesIframe(provider?: EmbedProvider): boolean {
  const p = provider ?? 'generic';
  return (
    p === 'google_slides' ||
    p === 'google_maps' ||
    p === 'google_docs' ||
    p === 'pdf' ||
    p === 'generic'
  );
}
