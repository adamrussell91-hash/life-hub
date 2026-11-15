import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalMedia } from '@/journal/types';
import {
  configureJournalImage,
  journalAudioSrc,
  journalMediaDerivativeUrl,
  prefetchMomentLeadImage,
  rememberLocalJournalMedia,
} from '@/journal/media-loading';
import { renderSoundPlayer } from '@/journal/story/sound-player';
import { buildJournalPrintHtml } from '@/journal/print-edition';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';
import type { JournalDocument } from '@/api/journal';

const API = 'https://api.adam-russell.com';

/** The live site is GitHub Pages; the API is another origin. */
function onLiveSite(): void {
  vi.stubGlobal('location', { hostname: 'life-hub.adam-russell.com' });
}

/** Records what crossOrigin was when each URL property was set. */
function watchImage(img: HTMLImageElement): Record<string, string | null> {
  const seen: Record<string, string | null> = {};
  for (const prop of ['src', 'srcset'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, prop);
    Object.defineProperty(img, prop, {
      configurable: true,
      get() {
        return descriptor?.get?.call(img);
      },
      set(value: string) {
        seen[prop] = img.crossOrigin;
        descriptor?.set?.call(img, value);
      },
    });
  }
  return seen;
}

const backedUp = (id: string): JournalMedia => ({
  id,
  lifecycle: 'live',
  upload_state: 'backed_up',
  content_type: 'image/jpeg',
  width: 4000,
  height: 3000,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('journal media on the live site', () => {
  it('asks the API origin for photo copies and voice notes, not the page origin', () => {
    onLiveSite();
    expect(journalMediaDerivativeUrl('trp_x', 'med_a', 320)).toBe(
      `${API}/api/travel-journal-media?trip=trp_x&id=med_a&variant=derivative&width=320`,
    );
    expect(journalAudioSrc('trp_x', { id: 'med_s', lifecycle: 'live', content_type: 'audio/mp4' })).toBe(
      `${API}/api/travel-journal-media?trip=trp_x&id=med_s&variant=original`,
    );
  });

  it('loads a backed-up photo as a credentialed CORS request, set before the URLs', () => {
    onLiveSite();
    const img = document.createElement('img');
    const seen = watchImage(img);
    configureJournalImage(img, { tripId: 'trp_x', media: backedUp('med_b'), layout: 'single', eager: true });
    expect(seen.srcset).toBe('use-credentials');
    expect(seen.src).toBe('use-credentials');
    expect(img.getAttribute('src')).toContain(`${API}/api/travel-journal-media?`);
  });

  it('loads a photo still on this device plainly', () => {
    const img = document.createElement('img');
    img.crossOrigin = 'use-credentials';
    rememberLocalJournalMedia('med_local_plain', new Blob(['x'], { type: 'image/jpeg' }));
    configureJournalImage(img, {
      tripId: 'trp_x',
      media: { id: 'med_local_plain', lifecycle: 'live', upload_state: 'pending' },
      layout: 'single',
      eager: true,
    });
    expect(img.getAttribute('src')).toMatch(/^blob:/);
    expect(img.hasAttribute('crossorigin')).toBe(false);
  });

  it('prefetches the next photo the same way the page will load it', () => {
    onLiveSite();
    const made: { crossOrigin: string | null; src: string }[] = [];
    vi.stubGlobal(
      'Image',
      class {
        crossOrigin: string | null = null;
        decoding = 'auto';
        set src(value: string) {
          made.push({ crossOrigin: this.crossOrigin, src: value });
        }
      },
    );
    const fixture = klIstanbulFixture();
    const media = backedUp('med_prefetch_api');
    const moment = { ...fixture.moments[0]!, id: 'mom_prefetch_api', media_ids: [media.id] };
    prefetchMomentLeadImage('trp_prefetch', { ...fixture, media: [media], moments: [moment] }, moment);
    expect(made).toHaveLength(1);
    expect(made[0]!.crossOrigin).toBe('use-credentials');
    expect(made[0]!.src).toContain(`${API}/api/travel-journal-media?`);
  });

  it('plays a voice note from the API as a credentialed CORS request', () => {
    onLiveSite();
    const src = journalAudioSrc('trp_x', { id: 'med_play', lifecycle: 'live', content_type: 'audio/mp4' });
    const audio = renderSoundPlayer({ src, durationS: 12 }).querySelector('audio')!;
    expect(audio.crossOrigin).toBe('use-credentials');
    expect(audio.getAttribute('src')).toBe(src);
  });

  it('plays a voice note still on this device plainly', () => {
    const audio = renderSoundPlayer({ src: 'blob:https://life-hub.example/abc' }).querySelector('audio')!;
    expect(audio.hasAttribute('crossorigin')).toBe(false);
  });

  it('prints API photos with the credentialed CORS attribute', () => {
    onLiveSite();
    const fixture = klIstanbulFixture();
    const media: JournalMedia = { id: 'med_print_api', lifecycle: 'live', width: 1200, height: 800 };
    const journal: JournalDocument = {
      ...fixture,
      leg_ids: fixture.legs.map((l) => l.id),
      preferences: {},
      operations: [],
      media: [media],
      moments: [
        {
          id: 'mom_print_api',
          leg_id: 'leg_kul',
          local_date: '2026-03-01',
          media_ids: [media.id],
          display_order: 1,
          lifecycle: 'live',
        },
      ],
    };
    const html = buildJournalPrintHtml(journal, { tripId: journal.trip_id });
    expect(html).toMatch(/<img crossorigin="use-credentials" src="https:\/\/api\.adam-russell\.com\/api\/travel-journal-media\?/);
  });
});
