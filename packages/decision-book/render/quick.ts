// packages/decision-book/render/quick.ts
// The quick decision's chart: the Yes/No flow top to bottom in Decision Book style (the decision,
// the three tests with your path inked, then Proceed or Do not proceed), the Stop Rule as an
// if/then band underneath, the check date and the closing answers. With `onAnswer`, the test
// being asked carries Yes and No buttons. Earlier rounds are summed up in a line.
import { QUICK_NODES, TEST_IDS, answersOf, currentEntry, decisionOf, isTest, outcomeOf, stopRuleOf, testLabel, testsOf } from '../quick.mjs';
import type { DmQuickState } from '../../problem-solver/types';
import { el, setAttr, setText } from './core';

export type QuickAnswer = 'yes' | 'no';
export type QuickView = { el: HTMLElement; update(state: DmQuickState): void; destroy(): void };

const ROUND_WORDS = { proceed: 'went ahead', stop: 'did not go ahead' } as const;

/** 2027-01-21 as 21 Jan 2027. */
export function checkDateText(due: string): string {
  const date = new Date(`${due}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? due : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function createQuickView(doc: Document = document, opts: { onAnswer?(node: string, answer: QuickAnswer): void } = {}): QuickView {
  const root = el(doc, 'section', 'dm-qk');
  root.setAttribute('aria-label', 'The Yes/No flow');
  const rounds = el(doc, 'p', 'dm-qk__rounds');
  rounds.hidden = true;
  const flow = el(doc, 'ol', 'dm-qk__flow');

  function row(box: string, kind: string): { row: HTMLLIElement; label: HTMLSpanElement; chip: HTMLSpanElement; text: HTMLParagraphElement } {
    const item = el(doc, 'li', 'dm-qk__row');
    item.dataset.box = box;
    item.dataset.kind = kind;
    const disc = el(doc, 'span', 'dm-qk__disc');
    disc.setAttribute('aria-hidden', 'true');
    const label = el(doc, 'span', 'dm-qk__label');
    const chip = el(doc, 'span', 'dm-qk__chip');
    chip.hidden = true;
    const text = el(doc, 'p', 'dm-qk__text');
    text.hidden = true;
    item.append(disc, label, chip, text);
    flow.append(item);
    return { row: item, label, chip, text };
  }

  const decision = row('decision', 'note');
  setText(decision.label, 'The decision');
  const tests = TEST_IDS.map((id) => ({ id, ...row(id, 'test') }));
  const end = row('end', 'end');

  const ask = el(doc, 'div', 'dm-qk__ask');
  ask.hidden = true;
  const buttons = (['yes', 'no'] as const).map((answer) => {
    const button = el(doc, 'button', 'dm-qk__answer', answer === 'yes' ? 'Yes' : 'No') as HTMLButtonElement;
    button.type = 'button';
    button.dataset.answer = answer;
    button.addEventListener('click', () => {
      const node = ask.dataset.node;
      if (!node || button.getAttribute('aria-disabled') === 'true') return;
      for (const b of buttons) b.setAttribute('aria-disabled', 'true');
      opts.onAnswer?.(node, answer);
    });
    ask.append(button);
    return button;
  });

  const band = el(doc, 'div', 'dm-qk__band');
  band.setAttribute('role', 'group');
  band.setAttribute('aria-label', 'The Stop Rule');
  const ifText = el(doc, 'span', 'dm-qk__band-text');
  const thenText = el(doc, 'span', 'dm-qk__band-text');
  band.append(el(doc, 'span', 'dm-qk__band-word', 'If'), ifText, el(doc, 'span', 'dm-qk__band-word', 'then'), thenText);
  band.hidden = true;

  const check = el(doc, 'p', 'dm-qk__check');
  check.hidden = true;
  const close = el(doc, 'dl', 'dm-qk__close');
  close.hidden = true;

  root.append(rounds, flow, band, check, close);

  return {
    el: root,
    update(state) {
      const now = currentEntry(state);
      const set = testsOf(state);
      const answers = answersOf(state);
      const outcome = outcomeOf(state);
      setAttr(root, 'data-outcome', outcome);

      setText(decision.text, decisionOf(state));
      decision.text.hidden = !decisionOf(state);
      setAttr(decision.row, 'data-now', null);

      tests.forEach(({ id, row: item, label, chip, text }, i) => {
        setText(label, testLabel(state, id));
        const answer = answers[i];
        chip.hidden = !answer;
        setText(chip, answer === 'yes' ? 'Yes' : answer === 'no' ? 'No' : '');
        setAttr(item, 'data-answer', answer);
        const note = state.path.find((entry) => entry.node === id && entry.round === state.rounds)?.note ?? '';
        setText(text, note);
        text.hidden = !note;
        // A test after a no, or before the tests are set, is not on the path.
        setAttr(item, 'data-off', !set || answers.slice(0, i).includes('no') ? 'true' : null);
        setAttr(item, 'data-now', now?.node === id ? 'true' : null);
      });

      setText(end.label, outcome === 'proceed' ? 'Proceed' : outcome === 'stop' ? 'Do not proceed' : 'Three yeses to proceed');
      setAttr(end.row, 'data-end', outcome);

      const asking = now && isTest(now.node) && opts.onAnswer ? now.node : null;
      if (asking) {
        const host = tests.find((t) => t.id === asking)!.row;
        if (ask.parentElement !== host) host.append(ask);
        if (ask.dataset.node !== asking) {
          ask.dataset.node = asking;
          for (const b of buttons) b.removeAttribute('aria-disabled');
        }
        ask.hidden = false;
        for (const b of buttons) b.setAttribute('aria-label', `${b.dataset.answer === 'yes' ? 'Yes' : 'No'}: ${testLabel(state, asking)}`);
      } else {
        ask.hidden = true;
        delete ask.dataset.node;
      }

      const rule = stopRuleOf(state);
      band.hidden = outcome !== 'proceed';
      setText(ifText, rule?.trigger ?? 'what would make you stop');
      setText(thenText, rule?.action ?? 'what you will do, agreed now');
      setAttr(band, 'data-set', rule?.action ? 'true' : null);

      check.hidden = !state.check;
      setText(check, state.check ? `Check on ${checkDateText(state.check.due)}` : '');

      const closing = (['learn', 'next'] as const).flatMap((id) => {
        const note = state.path.filter((entry) => entry.node === id && entry.round === state.rounds && entry.note).at(-1)?.note;
        return note ? [[QUICK_NODES[id].label, note] as const] : [];
      });
      const sig = JSON.stringify(closing);
      if (close.dataset.sig !== sig) {
        close.dataset.sig = sig;
        close.replaceChildren(...closing.flatMap(([term, note]) => [el(doc, 'dt', 'dm-qk__term', term), el(doc, 'dd', 'dm-qk__note', note)]));
      }
      close.hidden = !closing.length;

      const earlier = Array.from({ length: state.rounds - 1 }, (_, i) => outcomeOf(state, i + 1)).map((o, i) => `Round ${i + 1} ${o ? ROUND_WORDS[o] : 'was left open'}.`);
      rounds.hidden = !earlier.length;
      setText(rounds, earlier.length ? `Round ${state.rounds}. ${earlier.join(' ')}` : '');
    },
    destroy() {
      root.remove();
    }
  };
}
