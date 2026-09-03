import { describe, it, expect } from 'vitest';
import { parseVideoInput } from '@/blocks/video-url';

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
});
