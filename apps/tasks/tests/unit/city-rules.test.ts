import { describe, expect, it } from 'vitest';
import { citySnapshot, MAX_TRAMS } from '@/domain/city/snapshot';
import { validateCity, type CityNoticeCode } from '@/domain/city/rules';
import type { CityInput, CitySnapshot } from '@/domain/city/types';
import {
  deletedYesterday,
  emptyInput,
  project,
  suspendedService,
  sundayAfternoon,
  task
} from '../fixtures/city/golden-days';

/** Build a valid snapshot, break it on purpose, and expect exactly this rule to fire. */
function breaks(
  code: CityNoticeCode,
  mutate: (snapshot: CitySnapshot, input: CityInput) => void,
  build = sundayAfternoon
): void {
  const day = build();
  const snapshot = structuredClone(citySnapshot(day.input, day.now));
  expect(validateCity(day.input, snapshot, day.now)).toEqual([]);
  mutate(snapshot, day.input);
  const codes = validateCity(day.input, snapshot, day.now).map((n) => n.code);
  expect(codes).toContain(code);
}

describe('every city rule fails when broken on purpose', () => {
  it('deleted_record_visible', () =>
    breaks(
      'deleted_record_visible',
      (s) => {
        s.stops.push({ ...s.stops[0], id: 'a1' });
      },
      deletedYesterday
    ));

  it('stop_order_changed', () =>
    breaks('stop_order_changed', (s) => {
      s.routes[0].stopIds.reverse();
    }));

  it('lens_disagreement', () =>
    breaks('lens_disagreement', (s) => {
      const stop = s.stops.find((x) => x.id === 'm4');
      if (stop) stop.state = 'open';
    }));

  it('weather_not_from_forecast', () =>
    breaks('weather_not_from_forecast', (s) => {
      s.sky.state = 27;
    }));

  it('unknown_shown_as_value', () =>
    breaks('unknown_shown_as_value', (s, input) => {
      input.sky.state = null;
      s.sky = { state: null, known: true, name: 'Clear skies', family: 'clear' };
    }));

  it('finance_in_city', () =>
    breaks('finance_in_city', (s) => {
      (s.routes[0] as unknown as Record<string, unknown>).fare = 4.5;
    }));

  it('single_halo', () =>
    breaks('single_halo', (s, input) => {
      s.halo = input.pendingDecisions[1];
    }));

  it('late_from_due_only', () =>
    breaks('late_from_due_only', (s) => {
      const stop = s.stops.find((x) => x.id === 'm3');
      if (stop) stop.late = true;
    }));

  it('dream_on_network', () =>
    breaks(
      'dream_on_network',
      (s) => {
        s.trams.push({ id: 'dream', title: 'Sail', district: 'personal', dueToday: false, href: '#/task/dream' });
      },
      deletedYesterday
    ));

  it('suspension_not_detour', () =>
    breaks(
      'suspension_not_detour',
      (s) => {
        (s.suspensions[0] as unknown as Record<string, unknown>).detour = [[0, 0], [1, 1]];
      },
      suspendedService
    ));

  it('service_without_record', () =>
    breaks('service_without_record', (s) => {
      s.services.push({ id: 'ambulance:x', kind: 'ambulance', recordId: 'x', owner: 'Body', reason: 'Check-up', href: '#/body' });
    }));

  it('signal_without_destination', () =>
    breaks('signal_without_destination', (s) => {
      s.services[0].href = '';
    }));

  it('vehicle_without_momentum', () =>
    breaks('vehicle_without_momentum', (s) => {
      s.vehicles.push({ id: 'p_marking:bus:9', routeId: 'p_marking', kind: 'bus' });
    }));
});

describe('services appear only when a real record calls for them', () => {
  const now = new Date('2026-10-12T02:00:00.000Z'); // Mon 12 Oct, 13:00 Sydney

  it('sends an ambulance for an appointment in the next seven days, not later or earlier', () => {
    const input: CityInput = {
      ...emptyInput(),
      appointments: [
        { id: 'soon', starts_at: '2026-10-14T23:00:00.000Z', href: '#/body/soon' },
        { id: 'later', starts_at: '2026-10-30T23:00:00.000Z', href: '#/body/later' },
        { id: 'past', starts_at: '2026-10-10T23:00:00.000Z', href: '#/body/past' }
      ]
    };
    const services = citySnapshot(input, now).services;
    expect(services.map((s) => s.recordId)).toEqual(['soon']);
    expect(services[0].reason).toBe('Medical appointment on 2026-10-15.');
  });

  it('parks the food truck once the meal is logged', () => {
    const open = { ...emptyInput(), mealWindow: { id: 'lunch', open: true, logged: false, href: '#/body/meals' } };
    const logged = { ...open, mealWindow: { ...open.mealWindow, logged: true } };
    expect(citySnapshot(open, now).services.map((s) => s.kind)).toEqual(['food_truck']);
    expect(citySnapshot(logged, now).services).toEqual([]);
  });

  it('sends a mail van only for a follow-up that is due', () => {
    const input = {
      ...emptyInput(),
      tasks: [
        task({ id: 'w1', title: 'Hear back from the principal', waiting_on: 'Principal', waiting_status: 'follow_up_due' }),
        task({ id: 'w2', title: 'Hear back from IT', waiting_on: 'IT', waiting_status: 'waiting' })
      ]
    };
    const services = citySnapshot(input, now).services;
    expect(services).toEqual([
      expect.objectContaining({ kind: 'mail_van', recordId: 'w1', reason: 'Follow up due with Principal.' })
    ]);
  });

  it('puts a crane on a new route until its first stop is done', () => {
    const fresh = project({ id: 'p_new', title: 'Debating club', created_at: '2026-10-08T00:00:00.000Z' });
    const input = { ...emptyInput(), projects: [fresh], tasks: [task({ id: 'n1', title: 'Book a room', parent_project_id: 'p_new' })] };
    expect(citySnapshot(input, now).routes[0].lifecycle).toBe('under_construction');
    expect(citySnapshot(input, now).services.map((s) => s.id)).toEqual(['crane:p_new']);

    input.tasks = [task({ id: 'n1', title: 'Book a room', parent_project_id: 'p_new', status: 'done', completed_at: '2026-10-09T00:00:00.000Z' })];
    expect(citySnapshot(input, now).routes[0].lifecycle).toBe('open');
    expect(citySnapshot(input, now).services).toEqual([]);
  });

  it('sends no school bus in the holidays', () => {
    const holidays = new Date('2026-12-28T02:00:00.000Z');
    const input = { ...emptyInput(), tasks: [task({ id: 't1', title: 'Plan term 1', due_date: '2026-12-30' })] };
    expect(citySnapshot(input, holidays).clock.inTerm).toBe(false);
    expect(citySnapshot(input, holidays).services).toEqual([]);
  });
});

describe('network shape', () => {
  const now = new Date('2026-10-12T02:00:00.000Z');

  it('caps trams and counts the rest', () => {
    const rule = JSON.stringify({ v: 1, frequency: 'daily', interval: 1 });
    const tasks = Array.from({ length: MAX_TRAMS + 3 }, (_, i) =>
      task({ id: `r${i}`, title: `Routine ${i}`, domain: 'health', recurrence_rule: rule, due_date: '2026-10-12' })
    );
    const snapshot = citySnapshot({ ...emptyInput(), tasks }, now);
    expect(snapshot.trams).toHaveLength(MAX_TRAMS);
    expect(snapshot.tramsHidden).toBe(3);
    expect(snapshot.trams.every((t) => t.dueToday)).toBe(true);
  });

  it('counts loose tasks at the depot instead of pinning each one', () => {
    const tasks = [task({ id: 'l1', title: 'Loose 1' }), task({ id: 'l2', title: 'Loose 2' })];
    expect(citySnapshot({ ...emptyInput(), tasks }, now).depot.unrouted).toBe(2);
  });

  it('retires a finished project with no stops and no buses', () => {
    const input = {
      ...emptyInput(),
      projects: [project({ id: 'p_done', title: 'Old unit', status: 'completed' })],
      tasks: [task({ id: 'd1', title: 'Teach it', parent_project_id: 'p_done', status: 'done', completed_at: '2026-10-11T00:00:00.000Z' })]
    };
    const snapshot = citySnapshot(input, now);
    expect(snapshot.routes[0]).toMatchObject({ lifecycle: 'retired', stopIds: [], momentum: { vehicles: 0 } });
    expect(snapshot.stops).toEqual([]);
    expect(validateCity(input, snapshot, now)).toEqual([]);
  });

  it('marks a stop as an interchange when it depends on another route', () => {
    const input = {
      ...emptyInput(),
      projects: [project({ id: 'p1', title: 'Excursion' }), project({ id: 'p2', title: 'Bus booking' })],
      tasks: [
        task({ id: 'b1', title: 'Book bus', parent_project_id: 'p2' }),
        task({ id: 'e1', title: 'Send notes home', parent_project_id: 'p1', depends_on: ['b1'] })
      ]
    };
    const stop = citySnapshot(input, now).stops.find((s) => s.id === 'e1');
    expect(stop?.interchangeRouteIds).toEqual(['p2']);
  });

  it('gives the same snapshot for the same input', () => {
    const day = sundayAfternoon();
    expect(citySnapshot(day.input, day.now)).toEqual(citySnapshot(day.input, day.now));
  });
});
