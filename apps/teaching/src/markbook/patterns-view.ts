import { el } from '@/quiz/dom';
import type { InsightContext } from '@/evidence/context';
import { markbookEvidence } from '@/evidence/markbook-evidence';
import { byTag, defaultKind, kindsPresent, trend, type TrendPoint } from '@/evidence/patterns';
import { expandTags, tagLabel } from '@/evidence/tags';
import type { Evidence, StudentBand, TagKind } from '@/evidence/types';
import { pct, sectionHead, tagSwitch } from '@/evidence/views/parts';
import { sparkline } from './grid';
import { band4 } from './insight';
import { openOverlay } from './overlay';
import type { MarkbookView, RosterStudent } from './types';

export type PatternsActions = {
  openStudent: (studentId: string) => void;
  /** Phase 7: offer Ann a follow-up for a group of students on one tag. */
  followUp?: (tag: string, students: string[], evidence: Evidence[]) => void;
};

const SVG = 'http://www.w3.org/2000/svg';

/** Median and middle half per quiz or task, oldest first. */
function trendChart(points: TrendPoint[]): SVGSVGElement {
  const root = document.createElementNS(SVG, 'svg');
  root.setAttribute('viewBox', '0 0 640 140');
  root.setAttribute('class', 'mb-trend');
  root.setAttribute('role', 'img');
  const title = document.createElementNS(SVG, 'title');
  title.textContent = points.length ? `Class median from ${pct(points[0]!.median)} to ${pct(points[points.length - 1]!.median)}` : 'No marks yet';
  root.append(title);
  const x = (i: number): number => (points.length < 2 ? 340 : 60 + (i * 540) / (points.length - 1));
  const y = (share: number): number => 110 - share * 90;
  const add = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text) n.textContent = text;
    root.append(n);
  };
  for (const share of [0, 0.5, 1]) {
    add('line', { x1: 40, x2: 620, y1: y(share), y2: y(share), class: 'mb-trend__grid' });
    add('text', { x: 4, y: y(share) + 4, class: 'mb-trend__tick' }, `${share * 100}`);
  }
  if (points.length > 1) {
    const band = [...points.map((p, i) => `${x(i)},${y(p.q3)}`), ...points.map((p, i) => `${x(i)},${y(p.q1)}`).reverse()].join(' ');
    add('polygon', { points: band, class: 'mb-trend__band' });
    add('polyline', { points: points.map((p, i) => `${x(i)},${y(p.median)}`).join(' '), class: 'mb-trend__line' });
  }
  points.forEach((p, i) => {
    add('circle', { cx: x(i), cy: y(p.median), r: 4, class: 'mb-trend__dot' });
    add('text', { x: x(i), y: 134, 'text-anchor': 'middle', class: 'mb-trend__tick' }, p.title.length > 14 ? `${p.title.slice(0, 13)}…` : p.title);
  });
  return root;
}

function evidenceSheet(title: string, items: Evidence[], sourceTitle: (source: string) => string): void {
  const body = el('div', 'mb-sheet');
  const heading = el('h3', 'mb-form__title', title);
  heading.id = `mb-ev-${Math.random().toString(36).slice(2, 8)}`;
  const close = el('button', 'btn btn--secondary mb-sheet__close', 'Close');
  close.type = 'button';
  const list = el('ul', 'mb-attempt');
  for (const e of items) list.append(el('li', undefined, `${sourceTitle(e.source)} · ${e.item.split('#')[0]} · ${pct(e.share)}`));
  body.append(close, heading, list);
  const opened = openOverlay(body, { labelledBy: heading.id });
  close.addEventListener('click', () => opened.close());
}

export function renderPatterns(view: MarkbookView, students: RosterStudent[], ctx: InsightContext, actions: PatternsActions): HTMLElement {
  const root = el('div', 'mb-patterns');
  const { evidence: raw, sources } = markbookEvidence(view, ctx.outcomes);
  const evidence = expandTags(raw, ctx.table);
  const label = (tag: string): string => tagLabel(tag, ctx);
  const titleOf = new Map(sources.map((s) => [s.source, s.title]));
  const names = new Map(students.map((s) => [s.id, s]));
  let kind: TagKind = defaultKind(evidence);
  const kinds = kindsPresent(evidence);

  root.append(sectionHead('Class over time'), trendChart(trend(evidence, sources)));
  const tagsHost = el('div', 'mb-patterns__tags');
  const heatHost = el('div', 'mb-patterns__heat');
  root.append(tagsHost, heatHost);

  const paint = (): void => {
    const rows = byTag(evidence, kind);
    const table = el('table', 'mb-grid__table mb-patterns__table');
    const head = el('tr');
    for (const h of ['Tag', 'Now', 'Change', 'Trend', 'Evidence', 'Groups']) head.append(el('th', undefined, h));
    table.append(head);
    for (const r of rows) {
      const points = trend(evidence, sources, r.tag);
      const change = points.length > 1 ? points[points.length - 1]!.median - points[0]!.median : null;
      const tr = el('tr');
      const groups = el('td', 'mb-patterns__groups');
      for (const band of ['weak', 'developing', 'secure'] as StudentBand[]) {
        const ids = r.groups[band];
        if (!ids.length) continue;
        const b = el('button', `mb-patterns__group mb-band--${band === 'weak' ? 'low' : band === 'developing' ? 'mid' : 'high'}`, String(ids.length));
        b.type = 'button';
        b.dataset.group = band;
        b.setAttribute('aria-label', `${ids.length} ${band}`);
        b.addEventListener('click', () => {
          table.querySelector('.mb-patterns__expand')?.remove();
          const holder = el('tr', 'mb-patterns__expand');
          const cell = el('td');
          cell.colSpan = 6;
          const list = el('div', 'mb-patterns__list');
          list.append(el('p', undefined, `${label(r.tag)}, ${band}: ${ids.map((id) => names.get(id)?.name ?? 'Removed student').join(', ')}`));
          if (actions.followUp) {
            const ann = el('button', 'btn btn--secondary', 'Ann drafts follow-up quiz');
            ann.type = 'button';
            ann.addEventListener('click', () => actions.followUp?.(r.tag, ids, evidence));
            list.append(ann);
          }
          cell.append(list);
          holder.append(cell);
          tr.after(holder);
        });
        groups.append(b);
      }
      const spark = el('td');
      if (points.length > 1) spark.append(sparkline(points.map((p) => p.median * 100)));
      tr.append(
        el('th', undefined, label(r.tag)),
        el('td', undefined, pct(r.mean)),
        el('td', undefined, change === null ? '–' : `${change >= 0 ? '+' : '−'}${Math.abs(Math.round(change * 100))}`),
        spark,
        el('td', undefined, `${r.questions} Qs`),
        groups
      );
      table.append(tr);
    }
    const wrap = el('div', 'mb-grid');
    wrap.append(table);
    tagsHost.replaceChildren(sectionHead('Tags', kinds.length > 1 ? tagSwitch(kinds, kind, (k) => { kind = k; paint(); }) : undefined), rows.length ? wrap : el('p', 'mb__empty', 'No tagged marks yet.'));

    const heat = el('table', 'mb-grid__table mb-patterns__heatmap');
    const hr = el('tr');
    const corner = el('th', 'mb-grid__student', 'Student');
    corner.scope = 'col';
    hr.append(corner);
    for (const r of rows) {
      const th = el('th', undefined, label(r.tag));
      th.scope = 'col';
      hr.append(th);
    }
    heat.append(hr);
    for (const s of students) {
      const tr = el('tr');
      const name = el('th', 'mb-grid__student');
      name.scope = 'row';
      const nb = el('button', 'mb-patterns__name', `${s.initials} · ${s.name}`);
      nb.type = 'button';
      nb.dataset.student = s.id;
      nb.addEventListener('click', () => actions.openStudent(s.id));
      name.append(nb);
      tr.append(name);
      for (const r of rows) {
        const mine = evidence.filter((e) => e.student === s.id && e.tags.includes(r.tag) && e.share !== null);
        const td = el('td');
        if (mine.length) {
          const mean = mine.reduce((a, e) => a + (e.share as number), 0) / mine.length;
          const b = el('button', `mb-patterns__cell mb-band--${band4(mean * 100)}`, String(Math.round(mean * 100)));
          b.type = 'button';
          b.dataset.student = s.id;
          b.setAttribute('aria-label', `${s.name}, ${label(r.tag)}: ${Math.round(mean * 100)}% from ${mine.length}`);
          b.addEventListener('click', () => evidenceSheet(`${s.name} · ${label(r.tag)}`, mine, (src) => titleOf.get(src) ?? src));
          td.append(b);
        } else td.append(el('span', 'mb-heat--none', '–'));
        tr.append(td);
      }
      heat.append(tr);
    }
    const heatWrap = el('div', 'mb-grid');
    heatWrap.append(heat);
    heatHost.replaceChildren(sectionHead('Students × tags'), heatWrap);
  };
  paint();
  return root;
}
