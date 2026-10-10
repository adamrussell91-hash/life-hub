import type { JournalFixture, JournalMedia, JournalMoment } from '@/journal/types';
export type JournalPhotoLayout = 'single' | 'pair' | 'lead-pair' | 'lead-pair-more';

export const JOURNAL_DERIVATIVE_WIDTHS = [320, 960, 1600] as const;
export type JournalDerivativeWidth = (typeof JOURNAL_DERIVATIVE_WIDTHS)[number];

export const JOURNAL_MOMENT_PAGE_SIZE = 30;

export function isFixtureMediaUrl(url: string): boolean {
  return (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    (!url.includes('/api/travel-journal-media') && url.startsWith('/'))
  );
}

export function journalMediaDerivativeUrl(
  tripId: string,
  mediaId: string,
  width: JournalDerivativeWidth,
): string {
  const params = new URLSearchParams({
    trip: tripId,
    id: mediaId,
    variant: 'derivative',
    width: String(width),
  });
  return `/api/travel-journal-media?${params}`;
}

export function pickDerivativeWidth(
  renderedCssPx: number,
  devicePixelRatio = 1,
): JournalDerivativeWidth {
  const need = Math.max(1, renderedCssPx) * Math.max(1, devicePixelRatio);
  if (need <= 320) return 320;
  if (need <= 960) return 960;
  return 1600;
}

export function sizesForPhotoLayout(layout: JournalPhotoLayout): string {
  const column = 'min(48rem, 100vw)';
  if (layout === 'pair') return `calc(${column} / 2 - 0.5rem)`;
  return column;
}

export function buildJournalImageSrcset(tripId: string, media: JournalMedia): string | undefined {
  if (isFixtureMediaUrl(media.url)) return undefined;
  return JOURNAL_DERIVATIVE_WIDTHS
    .map((w) => `${journalMediaDerivativeUrl(tripId, media.id, w)} ${w}w`)
    .join(', ');
}

export function reserveMediaAspect(img: HTMLImageElement, media: JournalMedia): void {
  if (media.width > 0 && media.height > 0) {
    img.width = media.width;
    img.height = media.height;
    img.style.aspectRatio = `${media.width} / ${media.height}`;
  }
}

export interface ConfigureJournalImageOptions {
  tripId: string;
  media: JournalMedia;
  layout: JournalPhotoLayout;
  eager: boolean;
}

export function configureJournalImage(img: HTMLImageElement, opts: ConfigureJournalImageOptions): void {
  reserveMediaAspect(img, opts.media);
  img.alt = '';
  img.decoding = 'async';
  img.loading = opts.eager ? 'eager' : 'lazy';
  const srcset = buildJournalImageSrcset(opts.tripId, opts.media);
  if (srcset) {
    img.srcset = srcset;
    img.sizes = sizesForPhotoLayout(opts.layout);
    const width = pickDerivativeWidth(
      opts.layout === 'pair' ? 360 : 720,
      img.ownerDocument?.defaultView?.devicePixelRatio ?? 1,
    );
    img.src = journalMediaDerivativeUrl(opts.tripId, opts.media.id, width);
  } else {
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.src = opts.media.url;
  }
}

export function orderedLiveMoments(fixture: JournalFixture): JournalMoment[] {
  const legs = [...fixture.legs]
    .filter((l) => l.lifecycle === 'live')
    .sort((a, b) => a.order - b.order);
  const out: JournalMoment[] = [];
  for (const leg of legs) {
    const days = fixture.days
      .filter((d) => d.leg_id === leg.id && d.lifecycle === 'live')
      .sort((a, b) => a.local_date.localeCompare(b.local_date));
    for (const day of days) {
      const moments = fixture.moments
        .filter(
          (m) =>
            m.lifecycle === 'live' &&
            m.leg_id === leg.id &&
            m.local_date === day.local_date,
        )
        .sort((a, b) => a.display_order - b.display_order);
      out.push(...moments);
    }
  }
  return out;
}

export interface MomentWindow {
  start: number;
  end: number;
}

export function computeInitialMomentWindow(
  total: number,
  focusIndex: number | undefined,
  pageSize = JOURNAL_MOMENT_PAGE_SIZE,
): MomentWindow {
  if (total <= pageSize) return { start: 0, end: total };
  if (focusIndex === undefined || focusIndex < 0) return { start: 0, end: pageSize };
  const half = Math.floor(pageSize / 2);
  let start = Math.max(0, focusIndex - half);
  let end = start + pageSize;
  if (end > total) {
    end = total;
    start = Math.max(0, end - pageSize);
  }
  return { start, end };
}

export function expandMomentWindowEarlier(
  window: MomentWindow,
  pageSize = JOURNAL_MOMENT_PAGE_SIZE,
): MomentWindow {
  const start = Math.max(0, window.start - pageSize);
  return { start, end: window.end };
}

export function expandMomentWindowLater(
  window: MomentWindow,
  total: number,
  pageSize = JOURNAL_MOMENT_PAGE_SIZE,
): MomentWindow {
  const end = Math.min(total, window.end + pageSize);
  return { start: window.start, end };
}

export function visibleMomentIdSet(ordered: JournalMoment[], window: MomentWindow): Set<string> {
  return new Set(ordered.slice(window.start, window.end).map((m) => m.id));
}

const prefetched = new Set<string>();

export function prefetchMomentLeadImage(
  tripId: string,
  fixture: JournalFixture,
  moment: JournalMoment,
): void {
  const leadId = moment.media_ids[0];
  if (!leadId) return;
  const media = fixture.media.find((m) => m.id === leadId && m.lifecycle === 'live');
  if (!media) return;
  const key = `${tripId}:${leadId}`;
  if (prefetched.has(key)) return;
  prefetched.add(key);
  const url = isFixtureMediaUrl(media.url)
    ? media.url
    : journalMediaDerivativeUrl(
        tripId,
        media.id,
        pickDerivativeWidth(720, globalThis.devicePixelRatio ?? 1),
      );
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
}

export function attachMomentPrefetchObserver(
  root: HTMLElement,
  tripId: string,
  fixture: JournalFixture,
  ordered: JournalMoment[],
): () => void {
  const byId = new Map(ordered.map((m, i) => [m.id, i]));
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = (entry.target as HTMLElement).id;
        const index = byId.get(id);
        if (index === undefined) continue;
        for (let offset = 1; offset <= 2; offset += 1) {
          const next = ordered[index + offset];
          if (next) prefetchMomentLeadImage(tripId, fixture, next);
        }
      }
    },
    { root: null, rootMargin: '240px 0px', threshold: 0.01 },
  );
  for (const el of root.querySelectorAll<HTMLElement>('[data-journal-moment]')) {
    observer.observe(el);
  }
  return () => observer.disconnect();
}
