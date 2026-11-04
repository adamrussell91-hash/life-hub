// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { answerTallyView } from '@/quiz/answer-tally-view';

const meter = () => document.createElement('span');

describe('answerTallyView', () => {
  it('draws nothing when nobody answered', () => {
    expect(answerTallyView({ groups: [], written: [] }, meter)).toBeNull();
    expect(answerTallyView(undefined, meter)).toBeNull();
  });
  it('shows counts with the right answer marked, and written work by initials', () => {
    const view = answerTallyView({
      groups: [{ label: 'Gap 1', rows: [{ text: 'hot', n: 3, right: true }, { text: 'warm', n: 1, right: false }] }],
      written: [{ initials: 'AA', name: 'Ada Ash', text: 'Because.', awarded: null, max: 2 }]
    }, meter)!;
    expect(view.textContent).toContain('Gap 1');
    expect(view.querySelector('[data-state="right"]')!.textContent).toContain('hot');
    expect(view.querySelector('.qz-tally__who')!.textContent).toBe('AA');
    expect(view.querySelector('.qz-tally__mark')!.textContent).toBe('To mark');
  });
});
