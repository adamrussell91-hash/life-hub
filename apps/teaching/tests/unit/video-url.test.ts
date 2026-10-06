import { describe, it, expect } from 'vitest';
import {
  parseStartTime,
  parseVideoInput,
  resolveVideoContent,
  videoEmbedSrc
} from '@/blocks/video-url';

describe('parseVideoInput', () => {
  it('parses YouTube watch and youtu.be URLs', () => {
    expect(parseVideoInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      external_id: 'dQw4w9WgXcQ'
    });
    expect(parseVideoInput('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      external_id: 'dQw4w9WgXcQ'
    });
  });

  it('parses Vimeo URLs', () => {
    expect(parseVideoInput('https://vimeo.com/123456789')).toEqual({
      provider: 'vimeo',
      external_id: '123456789'
    });
  });

  it('parses bare YouTube id', () => {
    expect(parseVideoInput('dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      external_id: 'dQw4w9WgXcQ'
    });
  });

  it('returns null for empty or unrecognised input', () => {
    expect(parseVideoInput('')).toBeNull();
    expect(parseVideoInput('https://example.com/video')).toBeNull();
  });

  it('keeps YouTube start times in every URL form', () => {
    expect(parseVideoInput('https://youtu.be/aircAruvnKk?t=90')).toEqual({
      provider: 'youtube',
      external_id: 'aircAruvnKk',
      start_seconds: 90
    });
    expect(parseVideoInput('https://www.youtube.com/watch?v=aircAruvnKk&t=1m30s')?.start_seconds).toBe(90);
    expect(parseVideoInput('https://www.youtube.com/shorts/aircAruvnKk')?.external_id).toBe('aircAruvnKk');
    expect(videoEmbedSrc('youtube', 'aircAruvnKk', 90)).toBe(
      'https://www.youtube-nocookie.com/embed/aircAruvnKk?start=90'
    );
  });

  it('parses direct https video files', () => {
    const url = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
    expect(parseVideoInput(url)).toEqual({ provider: 'file', external_id: url });
    expect(parseVideoInput('http://example.com/clip.mp4')).toBeNull();
  });

  it('recovers blocks saved before files and start times were understood', () => {
    const mp4 = 'https://example.com/a.mp4';
    expect(resolveVideoContent({ provider: 'youtube', external_id: '', url: mp4 })).toEqual({
      provider: 'file',
      external_id: mp4
    });
    expect(
      resolveVideoContent({
        provider: 'youtube',
        external_id: 'aircAruvnKk',
        url: 'https://youtu.be/aircAruvnKk?t=90'
      })?.start_seconds
    ).toBe(90);
  });

  it('reads start-time formats', () => {
    expect(parseStartTime('90')).toBe(90);
    expect(parseStartTime('1h2m3s')).toBe(3723);
    expect(parseStartTime('abc')).toBeUndefined();
  });
});
