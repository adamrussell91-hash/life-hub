import { describe, expect, it } from 'vitest';
import { placeLabels, wrapLabel, type LabelCandidate } from '@/components/miniworld/labels';

const measure = (s: string) => s.length * 7;

function label(id: string, x: number, y: number, priority: number, extra: Partial<LabelCandidate> = {}): LabelCandidate {
  return { id, lines: [id], priority, anchors: [{ x, y }], width: 120, lineHeight: 14, ...extra };
}

describe('placeLabels', () => {
  const viewport = { width: 800, height: 600 };

  it('drops the lower-priority label when two would overlap', () => {
    const placed = placeLabels([label('small', 100, 100, 1), label('big', 130, 104, 9)], viewport);
    expect(placed.map((p) => p.candidate.id)).toEqual(['big']);
  });

  it('tries the next anchor before giving up', () => {
    const placed = placeLabels(
      [label('big', 100, 100, 9), label('small', 100, 100, 1, { anchors: [{ x: 100, y: 100 }, { x: 100, y: 160 }] })],
      viewport
    );
    expect(placed.find((p) => p.candidate.id === 'small')?.y).toBe(160);
  });

  it('always places a forced (hovered) label', () => {
    const placed = placeLabels([label('big', 100, 100, 9), label('hovered', 100, 100, 1, { force: true })], viewport);
    expect(placed.map((p) => p.candidate.id)).toContain('hovered');
  });

  it('keeps labels that do not touch', () => {
    const placed = placeLabels([label('a', 100, 100, 1), label('b', 400, 100, 1)], viewport);
    expect(placed).toHaveLength(2);
  });
});

describe('wrapLabel', () => {
  it('leaves short names on one line', () => {
    expect(wrapLabel('Northside College', 200, measure)).toEqual(['Northside College']);
  });

  it('wraps long names onto two lines and ends with an ellipsis if still too long', () => {
    const lines = wrapLabel('Institute for Teaching and Learning in Coastal Regional Schools', 150, measure);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(150);
  });
});
