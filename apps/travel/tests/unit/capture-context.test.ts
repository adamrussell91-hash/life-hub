import { describe, expect, it } from 'vitest';
import { emptyJournalDocument } from '@/api/journal';
import {
  bootstrapJournalForFirstMoment,
  bootstrapLegId,
  isJournalStoryEmpty,
  resolveCaptureContext,
} from '@/journal/capture-context';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';

describe('isJournalStoryEmpty', () => {
  it('is true for a fresh API journal shell', () => {
    const doc = emptyJournalDocument('trp_test');
    expect(isJournalStoryEmpty(doc)).toBe(true);
  });

  it('is false when the fixture has live moments', () => {
    expect(isJournalStoryEmpty(klIstanbulFixture())).toBe(false);
  });
});

describe('resolveCaptureContext', () => {
  it('returns bootstrap leg + today for an empty journal', () => {
    const doc = emptyJournalDocument('trp_alpha');
    const ctx = resolveCaptureContext(doc);
    expect(ctx).toEqual({
      legId: bootstrapLegId('trp_alpha'),
      localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });
});

describe('bootstrapJournalForFirstMoment', () => {
  it('adds leg and day once for the first save', () => {
    const doc = emptyJournalDocument('trp_test');
    const legId = bootstrapLegId('trp_test');
    const next = bootstrapJournalForFirstMoment(doc, legId, '2026-04-06', 'KL holiday');
    expect(next.legs).toHaveLength(1);
    expect(next.legs[0]!.destination).toBe('KL holiday');
    expect(next.days[0]!.leg_id).toBe(legId);
    expect(bootstrapJournalForFirstMoment(next, legId, '2026-04-06')).toBe(next);
  });
});
