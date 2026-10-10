import { describe, expect, it } from 'vitest';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';
import {
  applyTransitionDisplayOverride,
  isVerifiedItineraryTicket,
  resolveTransitionLabels,
  transitionForFromLeg,
} from '@/journal/transitions';
import type { TicketItem, Trip } from '@/types';

function ticket(partial: Partial<TicketItem>): TicketItem {
  return {
    id: 'itm_flight',
    city_id: 'kul',
    date: '2026-03-03',
    time: null,
    title: 'KUL → IST',
    note: '',
    status: 'booked',
    kind: 'flight',
    carrier: 'MH',
    number: '123',
    from_code: 'KUL',
    to_code: 'IST',
    from_name: 'Kuala Lumpur',
    to_name: 'Istanbul',
    depart_time: '08:00',
    arrive_time: '14:00',
    arrive_date: '2026-03-03',
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

describe('transitions', () => {
  it('renders at most one live transition per from-leg', () => {
    const journal = klIstanbulFixture();
    expect(transitionForFromLeg(journal, 'leg_kul')?.id).toBe('trn_kul_ist');
    expect(transitionForFromLeg(journal, 'leg_ist')).toBeUndefined();
  });

  it('uses airport codes only when the linked ticket is verified', () => {
    const journal = klIstanbulFixture();
    const trn = { ...journal.transitions[0]!, itinerary_item_id: 'itm_flight' };
    const legsById = new Map(journal.legs.map((l) => [l.id, l]));
    const trip: Trip = {
      id: journal.trip_id,
      schema_version: 1,
      title: 'Trip',
      start_date: '2026-03-01',
      end_date: '2026-03-10',
      home_tz: 'UTC',
      followers_label: '',
      cities: [],
      items: [ticket({})],
      days: [],
      checkins: [],
      share: { enabled: false, created_at: null },
      created_at: '',
      updated_at: '',
    };
    const verified = resolveTransitionLabels(trn, { legsById, trip });
    expect(verified.departure).toContain('(KUL)');
    expect(verified.arrival).toContain('(IST)');

    const unverifiedTrip: Trip = {
      ...trip,
      items: [ticket({ number: '' })],
    };
    const plain = resolveTransitionLabels(trn, { legsById, trip: unverifiedTrip });
    expect(plain.departure).not.toContain('(KUL)');
    expect(plain.departure).toBe('Kuala Lumpur');
  });

  it('prefers journal display_override over itinerary labels', () => {
    const journal = klIstanbulFixture();
    const trn = applyTransitionDisplayOverride(journal.transitions[0]!, {
      departure_label: 'My departure',
      arrival_label: 'My arrival',
    });
    const legsById = new Map(journal.legs.map((l) => [l.id, l]));
    const labels = resolveTransitionLabels(trn, { legsById });
    expect(labels.departure).toBe('My departure');
    expect(labels.arrival).toBe('My arrival');
  });

  it('detects verified itinerary tickets', () => {
    expect(isVerifiedItineraryTicket(ticket({}))).toBe(true);
    expect(isVerifiedItineraryTicket(ticket({ carrier: '' }))).toBe(false);
  });
});
