import { describe, expect, it } from 'vitest';
import { isCaptureSaveEnabled } from '@/journal/capture-sheet';

describe('capture sheet Save enablement', () => {
  it('is disabled when text, photos, and voice are all empty', () => {
    expect(
      isCaptureSaveEnabled({ text: '   ', photoCount: 0, hasVoiceAttachment: false })
    ).toBe(false);
  });

  it('enables when text is non-empty', () => {
    expect(
      isCaptureSaveEnabled({ text: 'Sunset at the mosque', photoCount: 0, hasVoiceAttachment: false })
    ).toBe(true);
  });

  it('enables when at least one photo is selected', () => {
    expect(
      isCaptureSaveEnabled({ text: '', photoCount: 1, hasVoiceAttachment: false })
    ).toBe(true);
  });

  it('enables when a voice note is attached', () => {
    expect(
      isCaptureSaveEnabled({ text: '', photoCount: 0, hasVoiceAttachment: true })
    ).toBe(true);
  });
});
