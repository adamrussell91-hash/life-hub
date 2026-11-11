import { el } from '@/quiz/dom';
import type { CodeTrend, FeedbackPayload, FeedbackRow } from './types';

export function codeChip(code: string, colour: string): HTMLElement {
  return el('span', `pg-code pg-code--${colour}`, code);
}

const TREND: Record<CodeTrend, string> = { new: 'new', more: 'more often', less: 'less often', steady: 'steady' };

/** Good news is fewer next-step codes and more strength codes. */
function trendTone(trend: CodeTrend, positive: boolean): 'good' | 'watch' | '' {
  if (trend === 'steady') return '';
  const rising = trend === 'new' || trend === 'more';
  return rising === positive ? 'good' : 'watch';
}

/** The strip: one square per piece, oldest left, filled where the code was marked. */
function strip(row: FeedbackRow, pieces: FeedbackPayload['pieces']): HTMLElement {
  const out = el('span', 'pg-fb__strip');
  row.cells.forEach((c, i) => {
    const p = pieces[i];
    const name = p ? `${p.label} (${p.date})` : 'Piece';
    const cell = el('i', c === null ? 'is-na' : c > 0 ? (row.positive ? 'is-good' : 'is-work') : undefined);
    cell.title = `${name}${c === null ? ': for a different kind of piece' : c > 0 ? ': marked here' : ''}`;
    out.append(cell);
  });
  return out;
}

/** A piece the Returned work tab can open (an assessment mark has no page of its own). */
const openable = (id: string): boolean => /^[wvnqrt]:/.test(id);

function detail(row: FeedbackRow, onOpen?: (pieceId: string) => void): HTMLElement {
  const box = el('div', 'pg-fb__detail');
  for (const h of row.hits) {
    const hit = el('div', 'pg-fb__hit');
    hit.append(el('span', 'pg-fb__src', `${h.title} · ${h.date}`));
    if (h.words) hit.append(el('q', 'pg-fb__words', h.words));
    if (h.note) hit.append(el('span', 'pg-fb__note', `Your teacher: ${h.note}`));
    if (onOpen && openable(h.piece_id)) {
      const go = el('button', 'pg-fb__open', 'Open this piece →');
      go.type = 'button';
      go.addEventListener('click', () => onOpen(h.piece_id));
      hit.append(go);
    }
    box.append(hit);
  }
  if (row.do) box.append(el('p', 'pg-fb__do', `${row.positive ? 'Keep doing' : 'Do this next'}: ${row.do}`));
  return box;
}

/**
 * What the student's feedback keeps saying over their newest pieces: one row per code, grouped
 * Working on and Doing well. A row opens to where the code was marked and what to do about it.
 */
export function feedbackCard(feedback: FeedbackPayload, options: { onOpen?: (pieceId: string) => void } = {}): HTMLElement {
  const card = el('div', 'pg-fb');
  const { pieces, rows } = feedback;
  for (const [title, positive] of [['Working on', false], ['Doing well', true]] as const) {
    const list = rows.filter((r) => r.positive === positive);
    if (!list.length) continue;
    card.append(el('h3', 'pg-fb__group', title));
    for (const r of list) {
      const wrap = el('div', 'pg-fb__row');
      const btn = el('button', 'pg-fb__head');
      btn.type = 'button';
      btn.setAttribute('aria-expanded', 'false');
      const name = el('span', 'pg-fb__name');
      name.append(codeChip(r.code, r.colour), document.createTextNode(` ${r.label}`));
      const count = el('span', 'pg-fb__count', `${r.hit} of last ${pieces.length} · `);
      const tone = trendTone(r.trend, positive);
      count.append(el('em', tone ? `is-${tone}` : undefined, TREND[r.trend]));
      const chev = el('span', 'pg-fb__chev', '›');
      chev.setAttribute('aria-hidden', 'true');
      btn.append(name, strip(r, pieces), count, chev);
      const more = detail(r, options.onOpen);
      more.hidden = true;
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(open));
        wrap.classList.toggle('is-open', open);
        more.hidden = !open;
      });
      wrap.append(btn, more);
      card.append(wrap);
    }
  }
  card.append(el('p', 'pg-fb__foot', 'Older pieces are under Returned work.'));
  if (rows.some((r) => r.cells.some((c) => c === null))) card.append(el('p', 'pg-hint pg-fb__hint', 'An outlined square is a piece this code doesn’t apply to.'));
  return card;
}
