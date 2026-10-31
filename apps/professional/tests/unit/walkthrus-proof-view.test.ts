import { describe, expect, it, vi } from 'vitest';
import type { Proof, ProofRow } from '@/api/walkthrus-proof';
import { formatPoints, proofMark, renderProofStrip, renderWhatsWorking } from '@/views/walkthrus-proof';

// Invented classes and scores only.
const row = (over: Partial<ProofRow> & Pick<ProofRow, 'tile_id' | 'class_id'>): ProofRow => ({
  ran: { n: 0, mean: null, lessons: [] }, partly: { n: 0, lessons: [] }, none: { n: 0, mean: null }, diff: null, enough: false, ...over
});
const lessons = (scores: number[]) => scores.map((score, i) => ({ lesson_id: `l${i}`, score, date: `2026-10-0${i + 1}` }));
const PROOF: Proof = {
  rows: [
    row({ tile_id: 'w1-cold-calling', class_id: 'c1', ran: { n: 6, mean: 0.72, lessons: lessons([0.7, 0.8, 0.6, 0.75, 0.7, 0.77]) }, partly: { n: 1, lessons: lessons([0.4]) }, none: { n: 9, mean: 0.6 }, diff: 0.12, enough: true }),
    row({ tile_id: 'w1-quizzing', class_id: 'c2', ran: { n: 4, mean: 0.5, lessons: lessons([0.5, 0.5, 0.5, 0.5]) }, none: { n: 4, mean: 0.53 }, diff: -0.03, enough: true }),
    row({ tile_id: 'fu_abc12345', class_id: 'c1', ran: { n: 1, mean: 0.9, lessons: lessons([0.9]) }, none: { n: 9, mean: 0.6 }, diff: 0.3, enough: false })
  ],
  classes: { c1: 'Year 9 Blue', c2: 'Year 10 Green' },
  lessons_scored: 20,
  generated_at: '2026-10-31T00:00:00.000Z'
};
const BANNED = /\b(works|worked|better|effective)\b/i;
const names: Record<string, string> = { 'w1-cold-calling': 'Cold calling', 'w1-quizzing': 'Quizzing', fu_abc12345: 'Call and check' };

describe('Proof marks', () => {
  it('+ and − with enough lessons, few without, null with no data', () => {
    expect(proofMark('w1-cold-calling', PROOF)).toBe('+');
    expect(proofMark('w1-quizzing', PROOF)).toBe('−');
    expect(proofMark('fu_abc12345', PROOF)).toBe('few');
    expect(proofMark('w1-dual-coding', PROOF)).toBeNull();
    expect(proofMark('w1-cold-calling', null)).toBeNull();
  });

  it('points are whole percentage points with a sign', () => {
    expect(formatPoints(0.12)).toBe('+12 points');
    expect(formatPoints(-0.034)).toBe('−3 points');
    expect(formatPoints(0.01)).toBe('+1 point');
    expect(formatPoints(0)).toBe('0 points');
    expect(formatPoints(null)).toBe('–');
  });
});

describe('What’s working', () => {
  it('ranks rows with enough lessons, then the rest under a line', () => {
    const host = document.createElement('div');
    const onOpen = vi.fn();
    renderWhatsWorking(host, PROOF, { titleOf: (id) => names[id] ?? id, codeOf: (id) => (id.startsWith('w1') ? '90' : null), onOpen });
    const rows = [...host.querySelectorAll('.wtp-row')];
    expect(rows.map((r) => r.querySelector('.wtp-row__name')!.textContent)).toEqual(['Cold calling', 'Quizzing', 'Call and check']);
    expect(rows[0]!.textContent).toContain('Year 9 Blue');
    expect(rows[0]!.textContent).toContain('+12 points');
    expect(rows[0]!.textContent).toContain('(6 lessons with it, 9 without)');
    expect(rows[1]!.textContent).toContain('−3 points');
    const divider = host.querySelector('.wtp__divider')!;
    expect(divider.textContent).toBe('Not enough lessons yet');
    expect(divider.compareDocumentPosition(rows[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(divider.compareDocumentPosition(rows[1]!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    (rows[2]!.querySelector('button') as HTMLButtonElement).click();
    expect(onOpen).toHaveBeenCalledWith('fu_abc12345');
    expect(host.textContent).not.toMatch(BANNED);
  });

  it('says so plainly when nothing is scored', () => {
    const host = document.createElement('div');
    renderWhatsWorking(host, { ...PROOF, rows: [] }, { titleOf: (id) => id });
    expect(host.querySelector('.wtp__empty')).not.toBeNull();
    expect(host.textContent).not.toMatch(BANNED);
  });
});

describe('Proof strip', () => {
  it('a dot per lesson by score, partly runs hollow, both averages and the counts', () => {
    const host = document.createElement('div');
    renderProofStrip(host, 'w1-cold-calling', PROOF);
    const dots = [...host.querySelectorAll<HTMLElement>('.wtp-dot')];
    expect(dots).toHaveLength(7);
    expect(dots.filter((d) => d.classList.contains('is-hollow'))).toHaveLength(1);
    expect(dots[0]!.style.left).toBe('70%');
    expect(host.querySelectorAll('.wtp-avg')).toHaveLength(2);
    expect(host.textContent).toContain('Year 9 Blue');
    expect(host.textContent).toContain('72% average · 6 lessons');
    expect(host.textContent).toContain('60% average · 9 lessons');
    expect(host.textContent).toContain('1 lesson, not averaged');
    expect(host.textContent).toContain('+12 points');
    expect(host.textContent).not.toMatch(BANNED);
  });

  it('marks a class with too few lessons, and an empty tile says so', () => {
    const host = document.createElement('div');
    renderProofStrip(host, 'fu_abc12345', PROOF);
    expect(host.textContent).toContain('Not enough lessons yet');
    const empty = document.createElement('div');
    renderProofStrip(empty, 'w1-dual-coding', PROOF);
    expect(empty.querySelector('.wtp__empty')).not.toBeNull();
    expect(host.textContent + empty.textContent).not.toMatch(BANNED);
  });
});
