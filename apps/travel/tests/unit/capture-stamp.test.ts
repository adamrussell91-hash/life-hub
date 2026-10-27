import { describe, expect, it } from 'vitest';
import {
  chronologicalDisplayOrder,
  formatClipLength,
  formatStampDate,
  formatStampTime,
  localPartsInZone,
  resolveCaptureStamp,
} from '@/journal/capture-stamp';
import type { JournalMoment } from '@/journal/types';

const here = { lat: 41.0086, lon: 28.9802 };
// 06:41 UTC is 09:41 in Istanbul.
const openedAt = new Date('2026-11-30T06:41:00Z');

function moment(id: string, order: number, date: string, time?: string): JournalMoment {
  return {
    id,
    leg_id: 'leg_ist',
    local_date: date,
    local_time: time,
    media_ids: [],
    display_order: order,
    lifecycle: 'live',
  };
}

describe('localPartsInZone', () => {
  it('writes the leg-local date and 24-hour time', () => {
    expect(localPartsInZone(openedAt, 'Europe/Istanbul')).toEqual({
      local_date: '2026-11-30',
      local_time: '09:41',
    });
  });

  it('falls back to UTC for an unknown zone', () => {
    expect(localPartsInZone(openedAt, 'Not/AZone').local_time).toBe('06:41');
  });
});

describe('resolveCaptureStamp', () => {
  it('stamps live captures with now and the phone location', () => {
    const s = resolveCaptureStamp({
      openedAt,
      timeZone: 'Europe/Istanbul',
      deviceCoordinates: here,
      hasLiveCapture: true,
      libraryPhotos: [{ wall: '2026:11:29 18:00:00', coordinates: { lat: 1, lon: 2 } }],
    });
    expect(s).toMatchObject({
      local_date: '2026-11-30',
      local_time: '09:41',
      coordinates: here,
      location_source: 'device',
      time_source: 'now',
    });
  });

  it('uses the earliest library photo time and its GPS when nothing was live', () => {
    const s = resolveCaptureStamp({
      openedAt,
      timeZone: 'Europe/Istanbul',
      deviceCoordinates: here,
      hasLiveCapture: false,
      libraryPhotos: [
        { wall: '2026:11:29 18:30:00' },
        { instant: '2026-11-29T12:05:00Z', coordinates: { lat: 41.02, lon: 28.97 } },
      ],
    });
    expect(s).toMatchObject({
      local_date: '2026-11-29',
      local_time: '15:05',
      coordinates: { lat: 41.02, lon: 28.97 },
      location_source: 'exif',
      time_source: 'photo',
    });
  });

  it('does not give an old photo without GPS the phone current location', () => {
    const s = resolveCaptureStamp({
      openedAt,
      timeZone: 'Europe/Istanbul',
      deviceCoordinates: here,
      hasLiveCapture: false,
      libraryPhotos: [{ wall: '2026:11:28 08:00:00' }],
    });
    expect(s.coordinates).toBeUndefined();
    expect(s.local_date).toBe('2026-11-28');
  });

  it('a text-only moment is now, here', () => {
    const s = resolveCaptureStamp({
      openedAt,
      timeZone: 'Europe/Istanbul',
      deviceCoordinates: here,
      hasLiveCapture: false,
      libraryPhotos: [],
    });
    expect(s.location_source).toBe('device');
    expect(s.local_time).toBe('09:41');
  });
});

describe('chronologicalDisplayOrder', () => {
  const day = [
    moment('a', 1, '2026-11-30', '08:00'),
    moment('b', 2, '2026-11-30', '13:00'),
    moment('c', 3, '2026-12-01', '09:00'),
  ];

  it('slots between earlier and later moments on the same day', () => {
    const order = chronologicalDisplayOrder(day, 'leg_ist', '2026-11-30', '10:15');
    expect(order).toBeGreaterThan(1);
    expect(order).toBeLessThan(2);
  });

  it('goes first when earlier than everything', () => {
    expect(chronologicalDisplayOrder(day, 'leg_ist', '2026-11-30', '07:00')).toBeLessThan(1);
  });

  it('goes last when it is the newest', () => {
    expect(chronologicalDisplayOrder(day, 'leg_ist', '2026-12-01', '21:00')).toBe(4);
  });

  it('starts at 1 on an empty leg', () => {
    expect(chronologicalDisplayOrder([], 'leg_ist', '2026-11-30', '09:00')).toBe(1);
  });
});

describe('formatting', () => {
  it('formats stamp time and clip length', () => {
    expect(formatStampTime('09:41')).toBe('9:41 am');
    expect(formatStampTime('00:05')).toBe('12:05 am');
    expect(formatStampTime('13:00')).toBe('1:00 pm');
    expect(formatClipLength(42.7)).toBe('0:42');
    expect(formatClipLength(125)).toBe('2:05');
    expect(formatStampDate('2026-10-27')).toBe('Tue 27 Oct');
  });
});
