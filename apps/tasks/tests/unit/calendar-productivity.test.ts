/**
 * Step 6: classic month/week productivity chrome (horizon breadcrumb, stall banner,
 * project pulse on Month) DROPPED with the Month stop. Kit capacity lives in the
 * shared capacity-model header — covered by kit unit + browser proofs.
 *
 * Goals v2 (#481) retargeted the classic horizon breadcrumb Areas→Spheres; that
 * chrome lived only on the deleted Month paint — spheres live on #/goals.
 */
import { describe, expect, it } from 'vitest';
import { TASKS_CALENDAR_FILLS } from '@/views/hub-calendar';

describe('Tasks calendar productivity (kit)', () => {
  it('keeps After-bell work fill contract for capacity/bands', () => {
    expect(TASKS_CALENDAR_FILLS.after).toBe('work');
  });
});
