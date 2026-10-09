import { describe, expect, it } from 'vitest';
import { upsertDayMeta } from '@/lib/day-meta';
import { dayBarCaption, travelDayCue } from '@/model/day';
import { joinGuideText, splitGuideText } from '@/components/arrival-guide-sheet';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Trip } from '@/types';

const trip = fixtureTrip as unknown as Trip;

describe('upsertDayMeta', () => {
  it('adds a subtitle for a day that had no meta', () => {
    const days = upsertDayMeta([], 'lis', '2027-03-04', { subtitle: 'Hills and tiles' });
    expect(days).toEqual([{ city_id: 'lis', date: '2027-03-04', subtitle: 'Hills and tiles' }]);
  });

  it('updates an existing subtitle and clears it when blank', () => {
    const start = [{ city_id: 'lis', date: '2027-03-04', subtitle: 'Old', penelope_prompt: 'Keep me' }];
    const updated = upsertDayMeta(start, 'lis', '2027-03-04', { subtitle: 'New' });
    expect(updated[0]?.subtitle).toBe('New');
    expect(updated[0]?.penelope_prompt).toBe('Keep me');
    const cleared = upsertDayMeta(updated, 'lis', '2027-03-04', { subtitle: null });
    expect(cleared[0]?.subtitle).toBeUndefined();
    expect(cleared[0]?.penelope_prompt).toBe('Keep me');
  });

  it('removes the day row when both fields are empty', () => {
    const start = [{ city_id: 'lis', date: '2027-03-04', subtitle: 'Only' }];
    expect(upsertDayMeta(start, 'lis', '2027-03-04', { subtitle: '' })).toEqual([]);
  });
});

describe('dayBarCaption', () => {
  it('uses a custom subtitle alone instead of appending the auto cue', () => {
    const withCustom: Trip = {
      ...trip,
      days: [{ city_id: 'lis', date: '2027-03-03', subtitle: 'Leave Sydney' }]
    };
    expect(dayBarCaption(withCustom, 'lis', '2027-03-03')).toBe('Leave Sydney');
    // Auto cue still exists for the blank case
    expect(travelDayCue(trip, 'lis', '2027-03-03') || dayBarCaption(trip, 'lis', '2027-03-04')).toBeTruthy();
  });

  it('falls back to the automatic travel cue when no subtitle is set', () => {
    const blank: Trip = { ...trip, days: [] };
    expect(dayBarCaption(blank, 'lis', '2027-03-03')).toBe(travelDayCue(blank, 'lis', '2027-03-03'));
  });
});

describe('splitGuideText / joinGuideText', () => {
  it('round-trips Soft Landing tip rows', () => {
    const html = joinGuideText('Phone', 'Install an eSIM before you fly.');
    expect(html).toBe('<b>Phone.</b> Install an eSIM before you fly.');
    expect(splitGuideText(html)).toEqual({
      label: 'Phone',
      detail: 'Install an eSIM before you fly.'
    });
  });

  it('strips tags from freeform HTML tips', () => {
    expect(splitGuideText('<b>Money.</b> Cards work almost everywhere.')).toEqual({
      label: 'Money',
      detail: 'Cards work almost everywhere.'
    });
  });
});
