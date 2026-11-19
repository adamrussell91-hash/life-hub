import { el } from '@/quiz/dom';
import { ApiClientError } from '@/api/client';
import type { Game } from '../../core/schema';
import { GRID, squareLabel } from './rules';
import type { FleetCampaignSummary, FleetControlApi, FleetInsight } from './control-api';
import './insight.css';

/**
 * Fleet week's own block in the Results tab (spec §4): a 5 × 5 heat map of
 * the grid by accuracy (shade plus the number, so it reads without colour),
 * first try against returning accuracy per square, calibration per student
 * (how often Sure was right) and the confident errors (Sure and wrong), which
 * are for the teacher only and never reach a board.
 */

type Rate = { answered: number; right: number; accuracy: number | null };

/** The ramp's step for an accuracy: 1 (0–19 %) to 5 (80–100 %); 0 when nobody answered. */
export function heatStep(accuracy: number | null, answered: number): number {
  if (!answered || accuracy === null) return 0;
  return Math.min(5, Math.floor(Math.max(0, accuracy) * 5) + 1);
}
const pct = (a: number | null): string => (a === null ? '—' : `${Math.round(a * 100)}%`);
const rate = (r: Rate): string => (r.answered ? `${pct(r.accuracy ?? r.right / r.answered)} (${r.right}/${r.answered})` : '—');
const STEP_TEXT = ['Not answered', '0–19%', '20–39%', '40–59%', '60–79%', '80–100%'];

function table(head: string[], rows: Array<Array<string | Node>>, caption: string, cls = ''): HTMLElement {
  const scroll = el('div', 'gm-table-scroll');
  const t = el('table', `gm-table ${cls}`.trim());
  const thead = el('thead');
  const tr = el('tr');
  for (const h of head) {
    const th = el('th', '', h);
    th.scope = 'col';
    tr.append(th);
  }
  thead.append(tr);
  const tbody = el('tbody');
  for (const r of rows) {
    const row = el('tr');
    r.forEach((c, i) => {
      const td = i === 0 ? el('th') : el('td');
      if (i === 0) (td as HTMLTableCellElement).scope = 'row';
      if (typeof c === 'string') td.textContent = c;
      else td.append(c);
      row.append(td);
    });
    tbody.append(row);
  }
  t.append(el('caption', '', caption), thead, tbody);
  scroll.append(t);
  return scroll;
}

/** The 5 × 5 heat map as a table: rows A–E, columns 1–5, each cell's shade and its accuracy in words. */
function heatMap(data: FleetInsight, game: Game | null): HTMLElement {
  const cols = (game as { columns?: string[] } | null)?.columns ?? [];
  const rows = (game as { rows?: string[] } | null)?.rows ?? [];
  const bySquare = new Map(data.grid.map((g) => [g.square, g]));
  const hardest = new Set(data.hardest.map((h) => h.square));
  const wrap = el('div', 'fwi-heat-wrap');
  const t = el('table', 'fwi-heat');
  t.append(el('caption', '', 'Accuracy by square'));
  const thead = el('thead');
  const hr = el('tr');
  hr.append(el('td', 'fwi-heat__corner'));
  for (let c = 0; c < GRID; c += 1) {
    const topic = cols[c] || bySquare.get(c)?.column || '';
    const th = el('th', 'fwi-heat__col');
    th.scope = 'col';
    th.append(el('span', 'fwi-heat__key', String(c + 1)));
    if (topic) th.append(el('span', 'fwi-heat__topic', topic));
    hr.append(th);
  }
  thead.append(hr);
  const tbody = el('tbody');
  for (let r = 0; r < GRID; r += 1) {
    const tr = el('tr');
    const topic = rows[r] || bySquare.get(r * GRID)?.row || '';
    const th = el('th', 'fwi-heat__row');
    th.scope = 'row';
    th.append(el('span', 'fwi-heat__key', 'ABCDE'[r]!));
    if (topic) th.append(el('span', 'fwi-heat__topic', topic));
    tr.append(th);
    for (let c = 0; c < GRID; c += 1) {
      const sq = r * GRID + c;
      const g = bySquare.get(sq);
      const answered = g?.answered ?? 0;
      const step = heatStep(g?.accuracy ?? null, answered);
      const td = el('td', `fwi-heat__cell fwi-heat__cell--${step}${hardest.has(sq) ? ' is-hard' : ''}`);
      td.dataset.square = String(sq);
      if (answered) td.append(el('span', 'fwi-heat__pct', pct(g!.accuracy ?? g!.right / answered)), el('span', 'fwi-heat__n', `${g!.right}/${answered}`));
      else td.append(el('span', 'fwi-heat__pct', '—'));
      if (hardest.has(sq)) td.append(el('span', 'fwi-sr', ' (one of the hardest)'));
      const label = g?.label || squareLabel(sq);
      td.title = `${label}: ${answered ? `${g!.right} of ${answered} right` : 'not answered'}${hardest.has(sq) ? ' · one of the hardest' : ''}`;
      tr.append(td);
    }
    tbody.append(tr);
  }
  t.append(thead, tbody);
  wrap.append(t);

  const legend = el('div', 'fwi-legend');
  legend.append(el('span', 'fwi-legend__label', 'Right first time or returning:'));
  for (let s = 0; s <= 5; s += 1) {
    const item = el('span', 'fwi-legend__item');
    item.append(el('span', `fwi-legend__swatch fwi-heat__cell--${s}`), el('span', '', STEP_TEXT[s]!));
    legend.append(item);
  }
  const hardItem = el('span', 'fwi-legend__item');
  hardItem.append(el('span', 'fwi-legend__swatch fwi-legend__swatch--hard'), el('span', '', 'Hardest'));
  legend.append(hardItem);
  wrap.append(legend);
  return wrap;
}

/** A small bar under a percentage (the number carries the value; the bar is a glance). */
function meter(r: Rate): Node {
  const box = el('span', 'fwi-meter');
  box.append(el('span', 'fwi-meter__text', rate(r)));
  if (r.answered) {
    const bar = el('span', 'fwi-meter__bar');
    bar.setAttribute('aria-hidden', 'true');
    const fill = el('span', 'fwi-meter__fill');
    fill.style.width = `${Math.min(100, Math.max(0, Math.round(((r.accuracy ?? r.right / r.answered) || 0) * 100)))}%`;
    bar.append(fill);
    box.append(bar);
  }
  return box;
}

/** The insight block for loaded data. */
export function renderFleetInsight(data: FleetInsight, game: Game | null = null): HTMLElement {
  const box = el('div', 'fwi');
  const answered = data.grid.reduce((n, g) => n + g.answered, 0);
  if (!answered) {
    box.append(el('p', 'gm-note', 'No shots answered yet. The heat map fills in as rounds close.'));
    return box;
  }
  box.append(heatMap(data, game));

  const asked = data.grid.filter((g) => g.answered > 0);
  box.append(
    table(
      ['Square', 'Topic', 'First try', 'Returning'],
      asked.map((g) => [g.label || squareLabel(g.square), [g.row, g.column].filter(Boolean).join(' · ') || '—', meter(g.first), meter(g.returning)]),
      'First try against returning, per square',
      'fwi-split'
    )
  );

  box.append(
    table(
      ['Student', 'Sure and right', 'Unsure and right', 'Sure was right'],
      data.calibration.map((c) => [
        c.name,
        c.sure_total ? `${c.sure_right} of ${c.sure_total}` : '—',
        c.unsure_total ? `${c.unsure_right} of ${c.unsure_total}` : '—',
        c.calibration === null ? 'No Sure shots' : pct(c.calibration)
      ]),
      'Calibration: how often Sure was right',
      'fwi-cal'
    )
  );

  const errors = el('section', 'fwi-errors');
  errors.append(el('h4', 'fwi-h4', `Confident errors (${data.confident_errors.length}) · teacher only`));
  if (!data.confident_errors.length) errors.append(el('p', 'gm-note', 'Nobody was sure and wrong.'));
  else {
    errors.append(el('p', 'gm-note', 'Shots marked Sure that were wrong. Never shown on a board.'));
    const ul = el('ul', 'fwi-errors__list');
    for (const e of data.confident_errors) {
      const li = el('li', 'fwi-error');
      const topic = [e.row, e.column].filter(Boolean).join(' · ');
      li.append(el('p', 'fwi-error__head', `${e.name} · ${e.label || squareLabel(e.square)}${topic ? ` (${topic})` : ''} · round ${e.round}${e.returning ? ' · returning' : ''}`));
      if (e.prompt) li.append(el('p', 'fwi-error__prompt', e.prompt));
      li.append(el('p', 'fwi-error__answer', e.answer ? `Answered: ${e.answer}` : 'No answer typed.'));
      ul.append(li);
    }
    errors.append(ul);
  }
  box.append(errors);
  return box;
}

const NO_GAMES = 'No Fleet week games yet for this class.';

/** "Mon 17 Nov · Week · ended", for the past-games picker. */
export function campaignLabel(c: FleetCampaignSummary): string {
  const date = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).format(c.opened_at).replace(/,/g, '');
  const status = c.closed_at ? 'ended' : c.revealed_at ? 'revealed' : 'running';
  return `${date} · ${c.mode === 'week' ? 'Week' : 'Lesson'} · ${status}`;
}

/**
 * The Fleet week insight panel for one game and the Results tab's class. It
 * lists the class's campaigns (`campaign_list`, newest first), offers a
 * picker of past games when there's more than one, and loads
 * `campaign_insight` for the one picked. It says plainly when there's none.
 */
export function fleetInsightPanel(o: { game: Game; classId: string | null; api: FleetControlApi | null | undefined }): HTMLElement {
  const panel = el('section', 'fwi-panel');
  const head = el('div', 'fwi-panel__head');
  head.append(el('h4', 'fwi-h4 fwi-panel__title', 'Fleet week insight'));
  panel.append(head);
  const body = el('div', 'fwi-panel__body');
  body.setAttribute('aria-live', 'polite');
  panel.append(body);
  const classId = o.classId;
  const api = o.api;
  if (!classId) {
    body.append(el('p', 'gm-note', 'Pick a class to see the Fleet week insight.'));
    return panel;
  }
  if (!api?.insight) {
    body.append(el('p', 'gm-note', 'The insight needs the server.'));
    return panel;
  }
  const insight = api.insight;
  const fail = (e: unknown) => {
    const text =
      e instanceof ApiClientError && e.code === 'no_campaign'
        ? NO_GAMES
        : e instanceof Error && e.message
          ? e.message
          : 'The insight didn’t load. Try Refresh.';
    body.replaceChildren(el('p', 'gm-note', text));
  };
  let asked = 0;
  const load = (campaignId?: string) => {
    const ticket = ++asked;
    body.replaceChildren(el('p', 'gm-note', 'Loading the insight…'));
    insight(o.game.id, classId, campaignId)
      .then((data) => ticket === asked && body.replaceChildren(renderFleetInsight(data, o.game)))
      .catch((e: unknown) => ticket === asked && fail(e));
  };
  if (!api.list) {
    load();
    return panel;
  }
  body.append(el('p', 'gm-note', 'Loading the insight…'));
  api
    .list(o.game.id, classId)
    .then(({ campaigns }) => {
      const list = Array.isArray(campaigns) ? campaigns : [];
      if (!list.length) {
        body.replaceChildren(el('p', 'gm-note', NO_GAMES));
        return;
      }
      const field = el('label', 'gm-field fwi-pick');
      const pick = el('select', 'gm-select');
      pick.name = 'campaign';
      for (const c of list) {
        const opt = el('option', '', campaignLabel(c));
        opt.value = c.id;
        pick.append(opt);
      }
      pick.value = list[0]!.id;
      pick.addEventListener('change', () => load(pick.value));
      field.append(el('span', 'gm-field__label', 'Game'), pick);
      pick.disabled = list.length < 2;
      head.append(field);
      load(list[0]!.id);
    })
    .catch(fail);
  return panel;
}
