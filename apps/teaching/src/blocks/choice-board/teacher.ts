import { button, el, errorText, isNotPublished } from '@/blocks/peer-feedback-ui';
import { fetchThinking, resetThinking, type ThinkingResponse } from '@/blocks/thinking-client';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import {
  choicePattern, cleanChoiceData, patternText, pickCounts, pickTileIndex, ratingName, ruleApplies, tierName,
  type ChoiceData
} from './model';
import {
  boardSettings, tileFold, tileGrid, tileLabel, tileMeta, tileTier,
  type ChoiceBoardBlock, type DeckMode, type RenderChild
} from './shared';

/** The class screen refreshes this often while it is on the page. */
export const DISPLAY_REFRESH_MS = 8000;

/** The board for the teacher's editing canvas: labels, levels, types, and each task in a fold. */
export function teacherPreview(block: ChoiceBoardBlock, renderChild: RenderChild, decks: DeckMode): HTMLElement {
  const settings = boardSettings(block);
  const showColumn = settings.rule === 'each_column' && ruleApplies(settings, block.content.tabs.length);
  const grid = tileGrid(settings, 'Tasks on the board');
  block.content.tabs.forEach((tile, index) => {
    const item = el('li', 'cb-tile cb-tile--static');
    item.dataset.tier = String(tileTier(tile));
    const face = el('div', 'cb-tile__face');
    face.append(el('span', 'cb-tile__label', tileLabel(tile, index)), tileMeta(tile, index, settings, showColumn));
    item.append(face, tileFold(tile, renderChild, decks, `See the task (${tile.blocks.length} block${tile.blocks.length === 1 ? '' : 's'})`));
    grid.append(item);
  });
  return grid;
}

type Row = { initials: string; picks: Array<{ index: number; reason: string; rating?: number; learned?: string; finished: boolean; started: boolean }> };

function rowsFrom(responses: Array<ThinkingResponse<ChoiceData>>, tabIds: string[]): Row[] {
  return responses.map((r) => ({
    initials: r.initials || '–',
    picks: cleanChoiceData(r.data).picks
      .map((p) => ({ ...p, index: pickTileIndex(p, tabIds) }))
      .filter((p) => p.index >= 0)
  }));
}

/** Teacher view of a published board: counts per tile, and (off the Display) who picked what and why. */
export function mountTeacher(
  block: ChoiceBoardBlock,
  opts: { lessonId: string; display: boolean; renderChild: RenderChild; decks: DeckMode }
): HTMLElement {
  const tiles = block.content.tabs;
  const tabIds = tiles.map((t) => t.id);
  const settings = boardSettings(block);
  const showColumn = settings.rule === 'each_column' && ruleApplies(settings, tiles.length);
  const offered = tiles.map((t) => tileTier(t));

  const root = el('div', 'cb-teacher');
  if (opts.display) root.classList.add('cb-teacher--display');
  const tools = el('div', 'pf-actions cb-tools');
  const summary = el('p', 'cb-summary block-secondary');
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  const grid = tileGrid(settings, 'Tasks and how many picked each');
  const table = el('div', 'cb-table-wrap');
  root.append(tools, summary, grid, table);

  const countTags: HTMLElement[] = [];
  tiles.forEach((tile, index) => {
    const item = el('li', 'cb-tile cb-tile--static');
    item.dataset.tier = String(tileTier(tile));
    const face = el('div', 'cb-tile__face');
    const count = el('span', 'cb-count', 'Picked by 0');
    countTags.push(count);
    face.append(el('span', 'cb-tile__label', tileLabel(tile, index)), tileMeta(tile, index, settings, showColumn), count);
    item.append(face);
    if (!opts.display) item.append(tileFold(tile, opts.renderChild, opts.decks));
    grid.append(item);
  });

  let rows: Row[] = [];
  let loading = false;

  function draw(): void {
    const counts = pickCounts(rows.map((r) => r.picks.map((p) => p.index)), tiles.length);
    counts.forEach((n, i) => {
      countTags[i]!.textContent = `Picked by ${n}`;
      countTags[i]!.dataset.count = String(n);
    });
    summary.textContent = rows.length
      ? `${rows.length} student${rows.length === 1 ? '' : 's'} have picked.`
      : 'No picks yet. They arrive as students choose their tasks.';
    if (opts.display) return;
    table.replaceChildren();
    if (!rows.length) return;
    const t = el('table', 'cb-table');
    const caption = el('caption', 'cb-table__caption block-secondary', 'Who picked what. Initials show on this screen only; the Display shows counts.');
    const head = el('thead');
    const hr = el('tr');
    for (const h of ['Student', 'Task', 'Level', 'Why', 'How hard', 'Learned', 'Finished']) {
      const th = el('th', '', h);
      th.scope = 'col';
      hr.append(th);
    }
    head.append(hr);
    const body = el('tbody');
    for (const row of rows) {
      const pattern = patternText(choicePattern(row.picks.map((p) => tileTier(tiles[p.index]!)), offered), offered);
      const span = Math.max(1, row.picks.length);
      const first = el('tr', 'cb-table__first');
      const who = el('th', 'cb-table__who');
      who.scope = 'row';
      who.rowSpan = span;
      who.append(el('span', 'cb-table__initials', row.initials));
      if (pattern) who.append(el('span', 'pf-chip pf-chip--flag cb-pattern', pattern));
      first.append(who);
      body.append(first);
      if (!row.picks.length) {
        const empty = el('td', 'block-secondary', 'No picks yet');
        empty.colSpan = 6;
        first.append(empty);
        continue;
      }
      row.picks.forEach((p, i) => {
        const tr = i === 0 ? first : el('tr');
        const tile = tiles[p.index]!;
        tr.append(
          el('td', '', tileLabel(tile, p.index)),
          el('td', '', tierName(tile.tier)),
          el('td', 'cb-table__text', p.reason),
          el('td', '', ratingName(p.rating)),
          el('td', 'cb-table__text', p.learned ?? ''),
          el('td', '', p.finished ? 'Yes' : p.started ? 'Working' : 'Picked')
        );
        if (i > 0) body.append(tr);
      });
    }
    t.append(caption, head, body);
    table.append(t);
  }

  async function refresh(): Promise<void> {
    if (loading) return;
    loading = true;
    try {
      const set = await fetchThinking<ChoiceData>(opts.lessonId, block.id);
      rows = rowsFrom(set.responses ?? [], tabIds);
      draw();
    } catch (error) {
      summary.textContent = isNotPublished(error) ? 'Publish this lesson and block, then picks arrive here.' : errorText(error);
    } finally {
      loading = false;
    }
  }

  tools.append(button('Refresh', 'ghost', () => void refresh()));
  if (!opts.display) {
    tools.append(button('Clear responses', 'ghost', async () => {
      const ok = await askConfirmCard({
        title: 'Clear every pick for this board?',
        supporting: 'Use this before teaching the board to another class. This cannot be undone from here.',
        confirmLabel: 'Clear responses'
      });
      if (!ok) return;
      try {
        const set = await resetThinking<ChoiceData>(opts.lessonId, block.id);
        rows = rowsFrom(set.responses ?? [], tabIds);
        draw();
      } catch (error) {
        summary.textContent = errorText(error);
      }
    }));
  }

  draw();
  void refresh();
  if (opts.display) {
    // Refresh while the board is on the page; stop once it has been taken off (or never arrives).
    let seen = false;
    let misses = 0;
    const timer = setInterval(() => {
      if (root.isConnected) {
        seen = true;
        void refresh();
        return;
      }
      misses += 1;
      if (seen || misses > 3) clearInterval(timer);
    }, DISPLAY_REFRESH_MS);
  }
  return root;
}
