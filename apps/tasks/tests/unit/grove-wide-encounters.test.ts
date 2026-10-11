import { it, expect } from 'vitest';
import {annualEncounters} from '@/domain/grove/companions';
import type { AnnualGrovePlan } from '@/domain/grove/annual-plan';
const earned = ['hare', 'deer', 'fox', 'squirrel', 'robin', 'mallard', 'owl'].map(species => ({ species, earnedOn: '2026-01-08', baby: species === 'hare' || species === 'deer', reason: 'earned' }));
const plan = (view = 'year') => ({ view, from: '2026-01-01', to: '2026-12-31', today: '2026-10-11', anchor: '2026-01-01', wildlife: earned, wildlifeAt: (date: string) => date < '2026-01-08' ? [] : earned, days: [{ key: '2026-01-01', future: false }] }) as unknown as AnnualGrovePlan;
// Catches dead alternate IDs, anchor-based wide eligibility and species loss.
it('makes all twenty delivered models reachable without changing earned dates or species', () => {
    const build=annualEncounters;
    expect(build).toBeTypeOf('function');
    const seen = new Set();
    for (let day = 1; day <= 28; day++) {
        const p = plan();
        p.today = '2026-10-' + String(day).padStart(2, '0');
        const result = build(p, p.anchor);
        expect(result.length).toBeLessThanOrEqual(9);
        for (const e of result) {
            seen.add(e.id);
            expect(e.earnedOn).toBe('2026-01-08');
            expect(e.species).not.toBe('companion');
        }
        expect(result.reduce((n: number, e: any) => n + (e.baby ? 2 : 1), 0)).toBeLessThanOrEqual(11);
    }
    expect([...seen].sort()).toEqual(['animal-bird-robin', 'animal-chipmunk', 'animal-deer-doe', 'animal-deer-stag', 'animal-duck-mallard', 'animal-forest-bear', 'animal-forest-boar', 'animal-forest-deer', 'animal-forest-fox', 'animal-forest-moose', 'animal-forest-rabbit', 'animal-forest-stag', 'animal-forest-wolf', 'animal-fox', 'animal-owl', 'animal-rabbit-hare', 'animal-raccoon', 'animal-river-otter', 'animal-skunk', 'animal-squirrel'].sort());
});
it.each(['year', 'term'])('uses %s period cutoff while Day/Week use their selected date', view => { const build=annualEncounters; expect(build).toBeTypeOf('function'); expect(build(plan(view), '2026-01-01').length).toBeGreaterThan(0); expect(build(plan('day'), '2026-01-01')).toEqual([]); expect(build(plan('week'), '2026-01-01')).toEqual([]); const p = plan(view); p.to = '2026-01-07'; expect(build(p, p.anchor)).toEqual([]); });
