import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cityCatchUp, citySnapshot } from '@/domain/city/snapshot';
import { layoutCity } from '@/domain/city/layout';
import { deletedYesterday, noCheckInMorning, sundayAfternoon, suspendedService } from '@/domain/city/fixtures/golden-days';
import { cityCameraState, resetCityCameraForTests, updateCityCamera } from '@/views/city/camera';
import { cityNeedsWideScreen, goldenRequest, KNOWN_GOLDEN_DAYS } from '@/views/city/days';
import { cityModelUrl } from '@/views/city/model-url';
import { vehicleText } from '@/views/city/copy';
import { movingIds, parkedRouteIds, planCity, replayMask, replayProgress, roadPiece } from '@/views/city/plan';

const viewDir = join(dirname(fileURLToPath(import.meta.url)), '../../src/views/city');

function textsOf(day: ReturnType<typeof sundayAfternoon>): string {
  const snapshot = citySnapshot(day.input, day.now);
  const layout = layoutCity(snapshot);
  const catchUp = cityCatchUp(day.input, day.lastVisitAt, day.now);
  const plan = planCity(snapshot, layout, catchUp, 1, false);
  return [
    plan.skyLabel,
    plan.depot.text,
    plan.halo?.text ?? '',
    ...plan.stops.map((stop) => stop.text),
    ...plan.vehicles.map((vehicle) => vehicle.text),
    ...plan.services.map((service) => service.text),
    ...plan.trams.map((tram) => tram.text),
    ...plan.signs.map((sign) => sign.text),
    ...plan.landmarks.map((mark) => mark.text)
  ].join('\n');
}

describe('glance copy', () => {
  it('describes Sunday’s bus from the route, the stops and the week’s work', () => {
    const day = sundayAfternoon();
    const snapshot = citySnapshot(day.input, day.now);
    const bus = snapshot.vehicles[0];
    expect(bus).toBeTruthy();
    expect(vehicleText(snapshot, bus.routeId, false)).toBe(
      'Year 10 marking · 2 of 4 stops done · moving this week (2 sessions, 2 done)'
    );
  });

  it('says No due date when a stop has none', () => {
    const day = sundayAfternoon();
    const snapshot = citySnapshot(day.input, day.now);
    const layout = layoutCity(snapshot);
    const plan = planCity(snapshot, layout, cityCatchUp(day.input, day.lastVisitAt, day.now), 1, false);
    const undated = snapshot.stops.find((stop) => stop.dueDate == null);
    expect(undated).toBeTruthy();
    expect(plan.stops.find((stop) => stop.id === undated?.id)?.text).toContain('No due date');
    expect(plan.stops.find((stop) => stop.id === undated?.id)?.text).not.toContain('2026-10-11');
  });

  it('keeps deleted names out of the picture', () => {
    const text = textsOf(deletedYesterday());
    expect(text).not.toContain('Draft outline');
    expect(text).not.toContain('Old club');
    expect(text).not.toContain('Sail the Whitsundays');
    expect(text).not.toContain('Club notice');
  });

  it('says No data when the morning has no check-in', () => {
    const day = noCheckInMorning();
    const snapshot = citySnapshot(day.input, day.now);
    expect(snapshot.sky.known).toBe(false);
    expect(textsOf(day)).toContain('No data');
  });
});

describe('glance motion and replay', () => {
  it('parks an active suspension and leaves the other route running', () => {
    const day = suspendedService(new Date('2026-10-15T01:00:00.000Z'));
    const snapshot = citySnapshot(day.input, day.now);
    const parked = parkedRouteIds(snapshot);
    expect(parked.has('p_report')).toBe(true);
    expect(parked.has('p_garden')).toBe(false);
    const before = suspendedService(new Date('2026-10-13T01:00:00.000Z'));
    expect(parkedRouteIds(citySnapshot(before.input, before.now)).size).toBe(0);
  });

  it('lists only running vehicles and tram loops as moving', () => {
    const day = sundayAfternoon();
    const snapshot = citySnapshot(day.input, day.now);
    const layout = layoutCity(snapshot);
    expect(movingIds(snapshot, layout, false)).toEqual([
      ...snapshot.vehicles.map((vehicle) => vehicle.id),
      ...layout.trams.map((tram) => `tram:${tram.district}`)
    ]);
    expect(movingIds(snapshot, layout, true)).toEqual([]);
  });

  it('holds a finished stop lit until its catch-up change, then lets it go dark', () => {
    const day = sundayAfternoon();
    const snapshot = citySnapshot(day.input, day.now);
    const catchUp = cityCatchUp(day.input, day.lastVisitAt, day.now);
    const done = catchUp.changes.find((change) => change.kind === 'stop_done');
    expect(done?.id).toBe('m2');
    expect(replayMask(catchUp, 0).forceLitStopIds.has('m2')).toBe(true);
    expect(replayMask(catchUp, 1).forceLitStopIds.has('m2')).toBe(false);
  });

  it('clamps a negative replay clock to zero and a long gap to now', () => {
    expect(replayProgress(1000, 5000, false)).toBe(0);
    expect(replayProgress(1000 + 10_000, 1000, false)).toBe(1);
    expect(replayProgress(1000, 1000, true)).toBe(1);
  });
});

describe('glance roads and URL', () => {
  it('uses a straight piece for an east-west run and a bend for a corner', () => {
    expect(roadPiece(['e', 'w'])).toEqual({ kind: 'straight', quarter: 0 });
    expect(roadPiece(['n', 's'])).toEqual({ kind: 'straight', quarter: 1 });
    expect(roadPiece(['e', 'n'])).toEqual({ kind: 'bend', quarter: 0 });
  });

  it('lists the four known days and refuses an unknown one', () => {
    expect(goldenRequest(new URLSearchParams())).toEqual({ kind: 'list' });
    expect(goldenRequest(new URLSearchParams('golden=sunday'))).toEqual({ kind: 'day', key: 'sunday' });
    expect(goldenRequest(new URLSearchParams('golden=nope'))).toEqual({ kind: 'unknown', value: 'nope' });
    expect(KNOWN_GOLDEN_DAYS.map((day) => day.key)).not.toContain('unseen-1');
    expect(cityNeedsWideScreen(390)).toBe(true);
    expect(cityNeedsWideScreen(1440)).toBe(false);
  });

  it('builds model URLs from the app base', () => {
    const url = cityModelUrl('van.glb');
    expect(url.endsWith('city/models/van.glb')).toBe(true);
    expect(url.startsWith('/')).toBe(true);
  });

  it('keeps the camera after a later update', () => {
    resetCityCameraForTests();
    updateCityCamera({ quarter: 2, zoom: 1.4, panX: 3, panZ: -2, touched: true });
    expect(cityCameraState()).toMatchObject({ quarter: 2, zoom: 1.4, panX: 3, panZ: -2, touched: true });
    resetCityCameraForTests();
  });

  it('does not hard-code a root city path in the view', () => {
    const hits: string[] = [];
    for (const file of readdirSync(viewDir)) {
      if (!file.endsWith('.ts')) continue;
      const source = readFileSync(join(viewDir, file), 'utf8');
      if (source.includes("'/city/") || source.includes('"/city/')) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
