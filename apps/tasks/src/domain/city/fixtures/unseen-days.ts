/**
 * ADAM: DO NOT OPEN THIS FILE BEFORE THE GLANCE TEST.
 *
 * Two golden days Adam has not seen, for the glance test (life-city-build-plan.md, Slice 2).
 * The prototype shows them as `?golden=unseen-1` and `?golden=unseen-2`. The answer key for
 * whoever runs the test is at the bottom of this file. Made-up records only.
 */
import type { GoldenDay } from './golden-days';
import { emptyInput, goal, project, session, task } from './golden-days';

export function unseenOne(): GoldenDay {
  return {
    name: 'Unseen 1',
    now: new Date('2026-10-22T10:00:00.000Z'), // Thu 22 Oct, 21:00 Sydney
    lastVisitAt: '2026-10-21T22:00:00.000Z', // 09:00
    input: {
      ...emptyInput(),
      sky: { state: 26 },
      projects: [
        project({ id: 'u1_fit', title: '10k training', created_at: '2026-09-01T00:00:00.000Z', current_end_date: '2026-11-15' }),
        project({ id: 'u1_exc', title: 'Year 9 excursion', created_at: '2026-10-22T03:00:00.000Z' })
      ],
      tasks: [
        task({ id: 'u1_f1', title: 'Run 5k', domain: 'fitness', parent_project_id: 'u1_fit', step_order: 0, status: 'done', completed_at: '2026-10-22T05:00:00.000Z' }),
        task({ id: 'u1_f2', title: 'Run 6k', domain: 'fitness', parent_project_id: 'u1_fit', step_order: 1, status: 'done', completed_at: '2026-10-22T06:00:00.000Z' }),
        task({ id: 'u1_f3', title: 'Hill session', domain: 'fitness', parent_project_id: 'u1_fit', step_order: 2, status: 'done', completed_at: '2026-10-22T07:00:00.000Z' }),
        task({ id: 'u1_f4', title: 'Run 8k', domain: 'fitness', parent_project_id: 'u1_fit', step_order: 3, due_date: '2026-10-29' }),
        task({ id: 'u1_f5', title: 'Race day', domain: 'fitness', parent_project_id: 'u1_fit', step_order: 4, due_date: '2026-11-15' }),
        task({ id: 'u1_e1', title: 'Book venue', parent_project_id: 'u1_exc', step_order: 0, created_at: '2026-10-22T03:00:00.000Z', due_date: '2026-10-27' }),
        task({ id: 'u1_e2', title: 'Send notes home', parent_project_id: 'u1_exc', step_order: 1, created_at: '2026-10-22T03:00:00.000Z', depends_on: ['u1_e1'], due_date: '2026-10-30' })
      ],
      workSessions: [session({ id: 'u1_s1', project_id: 'u1_fit', started_at: '2026-10-22T05:00:00.000Z' })],
      appointments: [{ id: 'u1_appt', starts_at: '2026-10-23T23:00:00.000Z', href: '#/body/appointments' }],
      pendingDecisions: [
        { id: 'u1_d1', owner: 'Clare', reason: 'Book the coach for the Year 9 excursion?', href: '#/clare', created_at: '2026-10-22T08:00:00.000Z' }
      ]
    }
  };
}

export function unseenTwo(): GoldenDay {
  return {
    name: 'Unseen 2',
    now: new Date('2026-12-26T02:00:00.000Z'), // Sat 26 Dec, 13:00 Sydney (school holidays)
    lastVisitAt: '2026-12-20T02:00:00.000Z',
    input: {
      ...emptyInput(),
      sky: { state: 29 },
      goals: [goal({ id: 'u2_home', title: 'Finish the house', created_at: '2026-12-22T01:00:00.000Z' })],
      projects: [project({ id: 'u2_deck', title: 'Build the deck', parent_goal_id: 'u2_home', created_at: '2026-12-01T00:00:00.000Z' })],
      tasks: [
        task({ id: 'u2_k1', title: 'Order timber', domain: 'home', parent_project_id: 'u2_deck', step_order: 0, status: 'done', completed_at: '2026-12-23T01:00:00.000Z' }),
        task({ id: 'u2_k2', title: 'Pour footings', domain: 'home', parent_project_id: 'u2_deck', step_order: 1, status: 'done', completed_at: '2026-12-24T01:00:00.000Z' }),
        task({ id: 'u2_k3', title: 'Council inspection', domain: 'home', parent_project_id: 'u2_deck', step_order: 2, due_date: '2026-12-21' }),
        task({ id: 'u2_k4', title: 'Lay boards', domain: 'home', parent_project_id: 'u2_deck', step_order: 3, due_date: '2027-01-10' }),
        task({ id: 'u2_w', title: 'Hear back from the builder', domain: 'home', waiting_on: 'the builder', waiting_status: 'follow_up_due' }),
        task({ id: 'u2_t', title: 'Plan Term 1 week 1', due_date: '2026-12-30' })
      ]
    }
  };
}

export const UNSEEN_DAYS = [unseenOne, unseenTwo];

/*
 * ANSWER KEY (for whoever runs the test, not for Adam)
 *
 * Unseen 1, Thursday night in term, storm building:
 *   Main change: the 10k training route moved on three stops today, and a new route
 *   (Year 9 excursion) has opened with a crane on it.
 *   Needs Adam: one decision (the halo: book the coach), and a medical appointment
 *   tomorrow (the ambulance). One school bus runs (teaching due this week): background,
 *   not a "needs you".
 *
 * Unseen 2, Saturday in the school holidays, cloud breaking:
 *   Main change: a new goal line (Finish the house) has opened, and the deck route
 *   moved on two stops.
 *   Needs Adam: a late stop on the deck route (the inspection) and a follow-up that is
 *   due (the mail van). No decision halo. No school buses, because it is the holidays.
 */
