import { describe, expect, it } from 'vitest';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { lightFor } from '@/journal/map/light';
import { buildTripStops, stopSpokenLabel, stopsBounds, unplacedLine } from '@/journal/map/stops';
import { orderedLiveMoments } from '@/journal/media-loading';
import { dayNumber } from '@/journal/trip-days';

const fixture = lisbonPortoJournal('trp_map_test');
const moments = orderedLiveMoments(fixture);
const built = buildTripStops(fixture, moments, (d) => dayNumber('2027-03-03', d));

describe('buildTripStops', () => {
  it('numbers the placed moments across the whole trip, in story order', () => {
    const placed = moments.filter((m) => m.coordinates);
    expect(built.stops.map((s) => s.momentId)).toEqual(placed.map((m) => m.id));
    expect(built.stops.map((s) => s.index)).toEqual(placed.map((_, i) => i));
    expect(built.unplaced).toBe(moments.length - placed.length);
    const first = built.stops[0]!;
    expect(first).toMatchObject({ dayNumber: 1, legId: 'leg_lplisbon01', localDate: '2027-03-03' });
    expect(first.placeName.length).toBeGreaterThan(0);
    expect(first.mediaId).toBeTruthy();
  });

  it('joins stops in a city with a solid line and one city to the next with a journey', () => {
    expect(built.segments).toHaveLength(built.stops.length - 1);
    const journeys = built.segments.filter((s) => s.kind === 'journey');
    expect(journeys).toHaveLength(1);
    const arrival = built.stops[journeys[0]!.toIndex]!;
    expect(arrival.legId).toBe('leg_lpporto001');
    expect(built.stops[arrival.index - 1]!.legId).toBe('leg_lplisbon01');
    for (const seg of built.segments) expect(seg.coordinates).toHaveLength(2);
  });

  it('treats a missing or zero position as no place, and counts it', () => {
    const odd = moments.map((m, i) => (i === 0 ? { ...m, coordinates: { lat: 0, lon: 0 } } : i === 1 ? { ...m, coordinates: undefined } : m));
    const out = buildTripStops(fixture, odd, () => 1);
    expect(out.unplaced).toBe(built.unplaced + (moments[0]!.coordinates ? 1 : 0) + (moments[1]!.coordinates ? 1 : 0));
    expect(buildTripStops(fixture, [], () => 1)).toEqual({ stops: [], segments: [], unplaced: 0 });
  });

  it('gives the corners that hold every stop', () => {
    const [[west, south], [east, north]] = stopsBounds(built.stops)!;
    for (const s of built.stops) {
      expect(s.lon).toBeGreaterThanOrEqual(west);
      expect(s.lon).toBeLessThanOrEqual(east);
      expect(s.lat).toBeGreaterThanOrEqual(south);
      expect(s.lat).toBeLessThanOrEqual(north);
    }
    expect(stopsBounds([])).toBeNull();
  });

  it('words the slider position and the moments left off the map', () => {
    expect(stopSpokenLabel({ ...built.stops[3]!, dayNumber: 2, placeName: 'Rua do Exemplo' }, 23)).toBe('Stop 4 of 23, Day 2, Rua do Exemplo');
    expect(unplacedLine(0)).toBe('');
    expect(unplacedLine(1)).toBe('1 moment has no place and is not on the map');
    expect(unplacedLine(3)).toBe('3 moments have no place and are not on the map');
  });
});

describe('lightFor', () => {
  it('follows the day: night, dawn, day, golden hour, dusk, night', () => {
    const names = (times: string[], sunset = '18:30') => times.map((t) => lightFor(t, sunset).name);
    expect(names(['02:10', '06:00', '09:40', '13:00', '17:10', '17:20', '18:35', '18:45', '19:25', '19:35', '23:50'])).toEqual([
      'night', 'dawn', 'day', 'day', 'day', 'golden', 'golden', 'dusk', 'dusk', 'night', 'night',
    ]);
  });

  it('moves with the sunset, and reads an unknown time as day', () => {
    expect(lightFor('20:30', '21:45').name).toBe('golden'); // a northern summer evening
    expect(lightFor('16:30', '16:40').name).toBe('golden'); // a winter afternoon
    expect(lightFor(undefined).name).toBe('day');
    expect(lightFor('half past nine').name).toBe('day');
    expect(lightFor('12:00').tint).toBe('rgba(255, 255, 255, 0)');
    expect(lightFor('23:00').tint).toMatch(/^rgba\(/);
  });
});
