import { describe, expect, it } from 'vitest';
import { buildMonitor } from '@/deep/monitor-view';

const pieces = [
  { id: 'kp_e1e1e1', text: 'E one', tier: 'essential' as const },
  { id: 'kp_s1s1s1', text: 'S one', tier: 'strong' as const }
];
const du = { id: 'du_ab12cd', claim: 'c', why: '', dot_points: ['a:U1'], concept_bullets: ['ARG1'], pieces, shared_piece_ids: [], steps: [] };
const ev = (student: string, date: string, piece: string, share: number) => ({ item: 'q', tags: [`kp:${piece}`], share, why: [], student, source: 'quiz:L1', date, confidence: null });

describe('monitor model', () => {
  it('places students in lanes, finds known-not-used and doesn’t-remember groups', () => {
    const m = buildMonitor({
      deep: [du],
      students: [{ id: 'st_a', initials: 'AB' }, { id: 'st_b', initials: 'CD' }, { id: 'st_c', initials: 'EF' }],
      evidence: [
        ev('st_a', '2026-11-02', 'kp_e1e1e1', 1), ev('st_a', '2026-11-09', 'kp_e1e1e1', 1),
        ev('st_a', '2026-11-02', 'kp_s1s1s1', 1), ev('st_a', '2026-11-09', 'kp_s1s1s1', 1),
        ev('st_b', '2026-11-09', 'kp_e1e1e1', 0)
      ],
      progress: { steps: { st_c: { du_ab12cd: { step: '2a', at: '2026-11-10' } } }, writing: { b1: { st_a: { used: [], missed: ['kp_s1s1s1'], at: '2026-11-12' } } } },
      introduced: new Set(['kp_e1e1e1', 'kp_s1s1s1']),
      today: '2026-11-20'
    });
    const lanes = m.byDu.get('du_ab12cd')!.lanes;
    expect(lanes['1'].map((s) => s.initials)).toEqual(['CD']);
    expect(lanes['2a'].map((s) => s.initials)).toEqual(['AB']);
    expect(lanes['2b'].map((s) => s.initials)).toEqual(['EF']);
    expect(m.byDu.get('du_ab12cd')!.knowsNotUsed).toEqual([{ student: 'st_a', piece: 'kp_s1s1s1', block: 'b1' }]);
    expect(m.byDu.get('du_ab12cd')!.doesntRemember.map((r) => r.student)).toEqual(['st_b']);
  });
});
