import { button, el, isNotPublished, notLivePanel } from '@/blocks/peer-feedback-ui';
import { fetchThinking, resetThinking, type ThinkingResponse, type ThinkingSet } from '@/blocks/thinking-client';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import {
  WILD_ID, cleanSlots, consensus, consensusSlots, contested, criterionShift, isComplete, outliers, rowName,
  type CardStat, type RankedStudent, type Slots
} from './model';
import {
  cardChip, diamondGrid, dotStrip, endLabels, letterMap, readOnlyDiamond, readyCards, rowsPhrase,
  type DiamondCard, type DiamondNineBlock
} from './shared';

type RoundData = { slots?: unknown; reasons?: unknown; why?: unknown };
export type DiamondData = { rounds?: { first?: RoundData; rerank?: RoundData; second?: RoundData }; wildcard?: { replaces?: unknown; text?: unknown } };
type Parsed = { initials: string; slots: Slots; reasons: Record<string, string> };

const REFRESH_MS = 8000;

function texts(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  return out;
}

/** One round from every response that has a full diamond for it. */
export function roundOf(responses: ReadonlyArray<ThinkingResponse<DiamondData>>, name: 'first' | 'rerank' | 'second'): Parsed[] {
  const out: Parsed[] = [];
  for (const r of responses) {
    const round = r.data?.rounds?.[name];
    if (!round) continue;
    const slots = cleanSlots(round.slots);
    if (!isComplete(slots)) continue;
    out.push({ initials: r.initials ?? '', slots, reasons: texts(round.reasons) });
  }
  return out;
}

/** Teacher's canvas before publishing: the criterion, the cards and the empty diamond. */
export function renderPreview(block: DiamondNineBlock): HTMLElement {
  const wrap = el('div', 'd9-preview');
  const cards = block.content.cards.slice(0, 9);
  const list = el('ol', 'd9-preview__cards');
  const letters = letterMap(cards);
  for (const c of cards) {
    const item = el('li', '');
    item.append(cardChip(c, letters.get(c.id) ?? '?'));
    list.append(item);
  }
  if (cards.length) wrap.append(list);
  wrap.append(diamondGrid(endLabels(block.content.criterion), () => el('div', 'd9-slot d9-slot--still d9-slot--empty'), 'Empty diamond'));
  const ready = readyCards(block).length;
  if (ready < 9) wrap.append(el('p', 'pf-alert', `${ready} of 9 cards ready. Students can start once all nine are ready.`));
  wrap.append(el('p', 'pf-note block-secondary', 'Students rank from the published lesson.'));
  return wrap;
}

export function mountTeacher(
  block: DiamondNineBlock,
  lessonId: string,
  display: boolean,
  deps: { fetch?: typeof fetchThinking; reset?: typeof resetThinking } = {}
): HTMLElement {
  const load = deps.fetch ?? fetchThinking;
  const clear = deps.reset ?? resetThinking;
  const root = el('div', `d9-teacher${display ? ' d9-teacher--display' : ''}`);
  const body = el('div', 'd9-teacher__body');
  const status = el('p', 'd9-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  root.append(body, status);
  body.append(el('p', 'block-secondary', 'Loading the class diamonds…'));

  const base = readyCards(block);
  const letters = letterMap(base);
  const labels = endLabels(block.content.criterion);
  const second = block.content.second_criterion.trim();
  let responses: Array<ThinkingResponse<DiamondData>> = [];
  let loading = false;
  /** Display: the class sees this screen, so results wait for the teacher's reveal. Kept across refreshes. */
  let revealed = !display;

  const cardMap = (): Map<string, DiamondCard> => new Map(base.map((c) => [c.id, c]));
  const letterOf = (id: string) => letters.get(id) ?? '?';

  async function refresh(): Promise<void> {
    if (loading) return;
    loading = true;
    try {
      const set = await load<DiamondData>(lessonId, block.id);
      responses = set.responses ?? [];
      paint();
    } catch (error) {
      if (isNotPublished(error)) body.replaceChildren(notLivePanel());
      else if (!responses.length) body.replaceChildren(el('p', 'block-secondary', 'The class diamonds could not load. Try again in a moment.'));
      else status.textContent = 'Could not refresh just now.';
    } finally {
      loading = false;
    }
  }

  function consensusPanel(title: string, rounds: Parsed[]): { panel: HTMLElement; stats: CardStat[] } {
    const stats = consensus(rounds.map((r) => r.slots), base.map((c) => c.id));
    const panel = el('div', 'd9-panel');
    panel.append(el('p', 'pf-field__label', `${title} · ${rounds.length}`), readOnlyDiamond(consensusSlots(stats), cardMap(), letters, labels, { name: title }));
    return { panel, stats };
  }

  function shiftList(title: string, from: CardStat[], to: CardStat[], empty: string): HTMLElement {
    const sec = el('section', 'd9-shift');
    sec.append(el('h4', 'd9-round__title block-subtitle', title));
    const moves = criterionShift(from, to).filter((m) => Math.abs(m.shift) >= 0.5).slice(0, 4);
    if (!moves.length) {
      sec.append(el('p', 'block-secondary', empty));
      return sec;
    }
    const list = el('ul', 'd9-shift__list');
    const map = cardMap();
    for (const m of moves) {
      const card = map.get(m.id);
      if (!card) continue;
      const item = el('li', 'd9-shift__item');
      item.append(cardChip(card, letterOf(m.id)), el('span', 'd9-shift__text', `Moved ${rowsPhrase(Math.round(m.shift * 10) / 10)} on average`));
      list.append(item);
    }
    sec.append(list);
    return sec;
  }

  function paint(): void {
    const first = roundOf(responses, 'first');
    const rerank = roundOf(responses, 'rerank');
    const secondRounds = roundOf(responses, 'second');
    body.replaceChildren();

    const head = el('div', 'd9-teacher__head');
    const counts = [`${first.length} diamond${first.length === 1 ? '' : 's'} in`];
    if (block.content.rerank) counts.push(`${rerank.length} ranked again`);
    if (second) counts.push(`${secondRounds.length} by the second criterion`);
    head.append(el('p', 'd9-count', counts.join(' · ')));
    const tools = el('div', 'pf-actions');
    tools.append(button('Refresh', 'ghost', () => void refresh()));
    if (!display) {
      tools.append(button('Clear responses', 'ghost', async () => {
        const ok = await askConfirmCard({
          title: 'Clear every diamond for this block?',
          supporting: 'Use this before teaching the lesson to another class. Students keep their own diamonds on their devices.',
          confirmLabel: 'Clear diamonds'
        });
        if (!ok) return;
        try {
          const set: ThinkingSet<DiamondData> = await clear<DiamondData>(lessonId, block.id);
          responses = set.responses ?? [];
          paint();
          status.textContent = 'Responses cleared.';
        } catch {
          status.textContent = 'Could not clear just now. Try again.';
        }
      }));
    }
    head.append(tools);
    body.append(head);

    if (!first.length) {
      body.append(el('p', 'block-secondary', 'No diamonds yet. They arrive as students send theirs.'));
      return;
    }

    if (display) {
      const toggle = button(revealed ? 'Hide the class diamond' : 'Reveal the class diamond', revealed ? 'ghost' : 'primary', () => {
        revealed = !revealed;
        paint();
        status.textContent = revealed ? 'Class diamond shown.' : 'Class diamond hidden.';
      });
      toggle.classList.add('d9-reveal');
      toggle.setAttribute('aria-pressed', String(revealed));
      body.append(toggle);
      if (!revealed) return;
    }

    // Consensus diamonds side by side
    const boards = el('div', 'd9-boards');
    const firstPanel = consensusPanel('Class diamond', first);
    boards.append(firstPanel.panel);
    const rerankPanel = rerank.length ? consensusPanel('After the discussion', rerank) : null;
    if (rerankPanel) boards.append(rerankPanel.panel);
    const secondPanel = secondRounds.length ? consensusPanel(`Rank by: ${second}`, secondRounds) : null;
    if (secondPanel) boards.append(secondPanel.panel);
    body.append(boards);

    // Most contested, with outliers to call on
    const hot = el('section', 'd9-hot');
    hot.append(el('h4', 'd9-round__title block-subtitle', 'Most contested'));
    const top3 = contested(firstPanel.stats);
    if (!top3.length) {
      hot.append(el('p', 'block-secondary', 'This fills in once three or more diamonds place a card in different rows.'));
    } else {
      const list = el('ol', 'd9-contested');
      const map = cardMap();
      const students: RankedStudent[] = first;
      for (const s of top3) {
        const card = map.get(s.id);
        if (!card) continue;
        const item = el('li', 'd9-contested__item');
        item.append(cardChip(card, letterOf(s.id)), dotStrip(s.rows));
        const odd = outliers(students, s);
        if (odd.length) {
          const who = el('ul', 'd9-outliers');
          for (const o of odd.slice(0, display ? 3 : 6)) {
            const line = el('li', 'd9-outlier');
            if (!display && o.initials) line.append(el('b', 'd9-outlier__who', o.initials));
            line.append(el('span', 'd9-outlier__row', rowName(o.row)));
            line.append(el('span', `d9-outlier__reason${o.reason ? '' : ' block-secondary'}`, o.reason ? `“${o.reason}”` : 'No reason written for this card'));
            who.append(line);
          }
          item.append(who);
        }
        list.append(item);
      }
      hot.append(list);
    }
    body.append(hot);

    if (rerankPanel) body.append(shiftList('What moved after the discussion', firstPanel.stats, rerankPanel.stats, 'The class diamond held steady after the discussion.'));
    if (secondPanel) body.append(shiftList('What shifted with the criterion', firstPanel.stats, secondPanel.stats, 'The class ranked the cards much the same under both criteria.'));

    // Students' own cards
    const wild = responses
      .map((r) => ({ initials: r.initials ?? '', text: typeof r.data?.wildcard?.text === 'string' ? r.data.wildcard.text.trim() : '', replaces: typeof r.data?.wildcard?.replaces === 'string' ? r.data.wildcard.replaces : '' }))
      .filter((w) => w.text);
    if (wild.length) {
      const sec = el('section', 'd9-wildcards');
      sec.append(el('h4', 'd9-round__title block-subtitle', 'Cards students wrote'));
      const list = el('ul', 'd9-wildcards__list');
      for (const w of wild) {
        const item = el('li', '');
        if (!display && w.initials) item.append(el('b', 'd9-outlier__who', w.initials));
        item.append(el('span', '', w.text));
        if (letters.has(w.replaces) && w.replaces !== WILD_ID) item.append(el('span', 'block-secondary', ` in place of ${letterOf(w.replaces)}`));
        list.append(item);
      }
      sec.append(list);
      body.append(sec);
    }
  }

  void refresh();
  if (display) {
    const timer = setInterval(() => {
      if (!root.isConnected) {
        clearInterval(timer);
        return;
      }
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
  }
  return root;
}
