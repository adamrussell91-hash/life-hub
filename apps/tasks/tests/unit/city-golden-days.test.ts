import { describe, expect, it } from 'vitest';
import { cityCatchUp, citySnapshot } from '@/domain/city/snapshot';
import { validateCity } from '@/domain/city/rules';
import {
  GOLDEN_DAYS,
  deletedYesterday,
  noCheckInMorning,
  suspendedService,
  sundayAfternoon
} from '../fixtures/city/golden-days';
import { UNSEEN_DAYS, unseenOne, unseenTwo } from '../fixtures/city/unseen-days';
import { layoutCity, validateLayout } from '@/domain/city/layout';

function idsEverywhere(snapshot: ReturnType<typeof citySnapshot>): string[] {
  return [
    ...snapshot.stops.map((s) => s.id),
    ...snapshot.routes.map((r) => r.id),
    ...snapshot.lines.map((l) => l.id),
    ...snapshot.trams.map((t) => t.id),
    ...snapshot.services.map((s) => s.recordId),
    ...snapshot.routes.flatMap((r) => r.stopIds)
  ];
}

describe('golden days pass every city rule', () => {
  for (const build of GOLDEN_DAYS) {
    const day = build();
    it(day.name, () => {
      const snapshot = citySnapshot(day.input, day.now);
      expect(validateCity(day.input, snapshot, day.now)).toEqual([]);
    });
  }
});

describe('golden day: Sunday 16:30', () => {
  const day = sundayAfternoon();
  const snapshot = citySnapshot(day.input, day.now);
  const stop = (id: string) => snapshot.stops.find((s) => s.id === id);

  it('reads the hub clock, term and forecast sky', () => {
    expect(snapshot.clock).toMatchObject({ dateKey: '2026-10-11', hour: 16, isNight: false, inTerm: true, term: 4 });
    expect(snapshot.sky).toEqual({ state: 8, known: true, name: 'Gentle breeze', family: 'steady' });
  });

  it('keeps the Lines stop order and shows the ticked stop finished', () => {
    const route = snapshot.routes.find((r) => r.id === 'p_marking');
    expect(route?.stopIds).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(route?.lineId).toBe('g_results');
    expect(stop('m2')).toMatchObject({ state: 'done', lit: false });
    expect(stop('m3')).toMatchObject({ state: 'current', lit: true, blocked: false });
    expect(stop('m4')).toMatchObject({ state: 'blocked', lit: true, blocked: true, late: false });
  });

  it('runs buses from momentum: two sessions and two completions in seven days', () => {
    const route = snapshot.routes.find((r) => r.id === 'p_marking');
    expect(route?.momentum).toEqual({ sessions: 2, completions: 2, vehicles: 2 });
    expect(snapshot.vehicles.map((v) => v.id)).toEqual(['p_marking:bus:0', 'p_marking:bus:1']);
  });

  it('sends one school bus for two teaching stops due this week', () => {
    expect(snapshot.services.filter((s) => s.kind === 'school_bus')).toHaveLength(1);
  });

  it('shows one halo for the oldest decision and counts the other at the depot', () => {
    expect(snapshot.halo?.id).toBe('d1');
    expect(snapshot.depot.decisions).toBe(1);
  });

  it('catches up on the stop ticked since the last visit', () => {
    const catchUp = cityCatchUp(day.input, day.lastVisitAt, day.now);
    expect(catchUp.quiet).toBe(false);
    expect(catchUp.changes).toEqual([{ kind: 'stop_done', id: 'm2', at: '2026-10-11T05:20:00.000Z', district: 'teaching' }]);
    expect(catchUp.byDistrict).toEqual({ teaching: 1 });
  });
});

describe('golden day: suspended service', () => {
  it('suspends only the route with a stop inside the wall, before the wall starts', () => {
    const day = suspendedService();
    const snapshot = citySnapshot(day.input, day.now);
    expect(snapshot.suspensions).toEqual([
      { id: 'task:wedding', startsOn: '2026-10-14', endsOn: '2026-10-16', label: 'Wedding', active: false, affectedRouteIds: ['p_report'] }
    ]);
  });

  it('marks the suspension active during the wall and never changes stop order', () => {
    const before = suspendedService();
    const during = suspendedService(new Date('2026-10-15T01:00:00.000Z'));
    const a = citySnapshot(before.input, before.now);
    const b = citySnapshot(during.input, during.now);
    expect(b.suspensions[0].active).toBe(true);
    expect(b.routes.map((r) => [r.id, r.stopIds])).toEqual(a.routes.map((r) => [r.id, r.stopIds]));
  });
});

describe('golden day: deleted yesterday', () => {
  const day = deletedYesterday();
  const snapshot = citySnapshot(day.input, day.now);

  it('shows no deleted task, removed project or dream anywhere', () => {
    const ids = idsEverywhere(snapshot);
    for (const gone of ['a1', 'p_gone', 'gone1', 'dream']) expect(ids).not.toContain(gone);
  });

  it('gives the deleted completion no momentum', () => {
    expect(snapshot.routes.find((r) => r.id === 'p_alpha')?.momentum.vehicles).toBe(0);
    expect(snapshot.vehicles).toEqual([]);
  });

  it('leaves the deleted records out of the catch-up', () => {
    const catchUp = cityCatchUp(day.input, day.lastVisitAt, day.now);
    const ids = catchUp.changes.map((c) => c.id);
    for (const gone of ['a1', 'p_gone', 'gone1', 'dream']) expect(ids).not.toContain(gone);
  });
});

describe('golden day: no check-in morning', () => {
  const day = noCheckInMorning();
  const snapshot = citySnapshot(day.input, day.now);

  it('says "No data" instead of drawing a sky', () => {
    expect(snapshot.sky).toEqual({ state: null, known: false, name: 'No data', family: 'unknown' });
  });

  it('invents no services and no motion', () => {
    expect(snapshot.services).toEqual([]);
    expect(snapshot.vehicles).toEqual([]);
    expect(snapshot.halo).toBeNull();
  });

  it('is quiet when nothing changed since the last visit', () => {
    expect(cityCatchUp(day.input, day.lastVisitAt, day.now)).toEqual({
      since: day.lastVisitAt,
      quiet: true,
      changes: [],
      byDistrict: {}
    });
  });
});

describe('unseen days are valid and carry their story', () => {
  for (const build of UNSEEN_DAYS) {
    const unseen = build();
    it(`${unseen.name} passes every city and layout rule`, () => {
      const snapshot = citySnapshot(unseen.input, unseen.now);
      expect(validateCity(unseen.input, snapshot, unseen.now)).toEqual([]);
      expect(validateLayout(snapshot, layoutCity(snapshot))).toEqual([]);
      expect(cityCatchUp(unseen.input, unseen.lastVisitAt, unseen.now).quiet).toBe(false);
    });
  }

  it('unseen 1 has its signals', () => {
    const day = unseenOne();
    const snapshot = citySnapshot(day.input, day.now);
    expect(snapshot.clock.isNight).toBe(true);
    expect(snapshot.halo?.id).toBe('u1_d1');
    expect(snapshot.services.map((s) => s.kind).sort()).toEqual(['ambulance', 'crane', 'school_bus']);
  });

  it('unseen 2 has its signals', () => {
    const day = unseenTwo();
    const snapshot = citySnapshot(day.input, day.now);
    expect(snapshot.clock.inTerm).toBe(false);
    expect(snapshot.halo).toBeNull();
    expect(snapshot.stops.find((s) => s.id === 'u2_k3')?.late).toBe(true);
    expect(snapshot.services.map((s) => s.kind)).toEqual(['mail_van']);
  });
});
