import { describe, expect, it } from 'vitest';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';
import { buildMomentMenuItems } from '@/journal/moment-menu';

describe('buildMomentMenuItems', () => {
  it('enables Edit on live moments', () => {
    const fixture = klIstanbulFixture();
    const moment = fixture.moments[0]!;
    const edit = buildMomentMenuItems(fixture, moment).find((i) => i.action === 'edit');
    expect(edit?.disabled).toBe(false);
  });

  it('disables Split when fewer than two photos', () => {
    const fixture = klIstanbulFixture();
    const moment = fixture.moments.find((m) => m.id === 'mom_kul_single')!;
    const split = buildMomentMenuItems(fixture, moment).find((i) => i.action === 'split');
    expect(split?.disabled).toBe(true);
    expect(split?.title).toMatch(/two photos/i);
  });

  it('lists all six actions', () => {
    const fixture = klIstanbulFixture();
    const items = buildMomentMenuItems(fixture, fixture.moments[0]!);
    expect(items.map((i) => i.action)).toEqual([
      'edit',
      'reorder',
      'split',
      'merge',
      'move',
      'delete',
    ]);
  });
});
