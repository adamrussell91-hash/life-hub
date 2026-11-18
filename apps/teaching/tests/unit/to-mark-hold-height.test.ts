import { describe, expect, it } from 'vitest';
import { holdHeightOnPress } from '@/marking/to-mark-flow';

/** A work area whose card redraws itself on a press, as the quiz ticks and rubric rungs do. */
function setup(height: number) {
  const work = document.createElement('main');
  const card = document.createElement('div');
  card.style.minHeight = '10px';
  Object.defineProperty(card, 'offsetHeight', { configurable: true, get: () => height });
  const seen: string[] = [];
  const paint = (): void => {
    const b = document.createElement('button');
    b.addEventListener('click', () => { seen.push(card.style.minHeight); paint(); });
    card.replaceChildren(b);
  };
  paint();
  work.append(card);
  document.body.append(work);
  holdHeightOnPress(work);
  const press = (): void => (card.querySelector('button') as HTMLButtonElement).click();
  return { card, seen, press, setHeight: (h: number) => { height = h; } };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('To mark: a press keeps the work area its height', () => {
  it('holds the card at its height while the press redraws it, then lets go', async () => {
    const { card, seen, press } = setup(480);
    press();
    expect(seen).toEqual(['480px']);
    await tick();
    expect(card.style.minHeight).toBe('10px');
  });

  it('a second press before the first lets go measures afresh and still ends where it began', async () => {
    const { card, seen, press, setHeight } = setup(480);
    press();
    setHeight(520);
    press();
    expect(seen).toEqual(['480px', '520px']);
    await tick();
    expect(card.style.minHeight).toBe('10px');
  });
});
