/**
 * Draws a personal line like the MindWorks map: time runs down a real date scale, each line keeps
 * its own names beside it, lines sit together and never cross. Used by the builder in Tasks and by
 * the public page, so both show exactly the same thing.
 *
 * Marks follow how sure a date is:
 * - a run with stated days is a pill (or a stop for one day); pills on one line at the same time
 *   split it into even parallel tracks
 * - a run known only to a part of a month or a month is a soft bracket beside the line
 * - a due date is a stop with a dot; an entries close is a short tick across the line
 * - a stop on two of the student's lines is named on the first (its home) and is a plain interchange
 *   stop on the other, so a shared stop doesn't fill two names columns
 */
import { dateWords, runWords, type DatePrecision } from '@/domain/catalogue-timing';
import { LINES, yearLineName, type LineKey } from './lines';
import type { LineItem, LineSnapshot } from './model';
import { planTracks } from './tracks';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TOP = 30;
const RAMP = 30;
const LABEL_PAD = 14;
const MIN_LABEL_W = 170;
/** Names column width on a wide screen; the line scrolls sideways rather than squeeze it. */
const WIDE_LABEL_W = 190;
const BRACKET_GAP = 7;

type MarkKind = 'pill' | 'stop' | 'due' | 'window';

export type PersonalLineHandle = { replay(): void; destroy(): void };

export type MountOptions = {
  animate?: boolean;
  /** Small text at the right of the title bar, e.g. "Snapshot · 16 Oct 2026". */
  stamp?: string;
  /** Split each line into named branches by format (default on). */
  branches?: boolean;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function sv(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

export function roundel(line: LineKey, small = false): HTMLElement {
  const span = el('span', `pl-rd${small ? ' pl-rd--sm' : ''}`, line);
  span.style.background = LINES[line].color;
  span.style.color = LINES[line].ink;
  span.setAttribute('aria-hidden', 'true');
  return span;
}

let fontsRequested = false;
export function ensureFonts(): void {
  if (fontsRequested || typeof document === 'undefined') return;
  fontsRequested = true;
  if (document.querySelector('link[data-pl-fonts]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.plFonts = '';
  link.href =
    'https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Public+Sans:wght@400;500;600;700&display=swap';
  document.head.append(link);
}

const doy = (iso: string, year: number) =>
  (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(year, 0, 1)) / 864e5;

function kindOf(item: LineItem): MarkKind {
  if (item.run) {
    if (item.run.precision !== 'day') return 'window';
    return item.run.start === item.run.end ? 'stop' : 'pill';
  }
  return 'due';
}

/** "21–22 Nov", "Due mid May", "Jun (dates approx.)". */
export function itemWhen(item: LineItem): string {
  if (item.run) return runWords(item.run.start, item.run.end, item.run.precision);
  if (item.due) return `Due ${dateWords(item.due.on, item.due.precision)}`;
  return 'Dates TBC';
}

function approx(precision: DatePrecision | undefined): boolean {
  return Boolean(precision && precision !== 'day');
}

function weeks(item: LineItem): number {
  if (!item.run || item.run.precision !== 'day') return 0;
  const days = (Date.parse(item.run.end) - Date.parse(item.run.start)) / 864e5;
  return Math.max(1, Math.round(days / 7));
}

function kindText(item: LineItem): string {
  const w = weeks(item);
  const kind = item.format || item.type;
  return w > 1 ? `${kind} · ${w} weeks` : kind;
}

export function mountPersonalLine(host: HTMLElement, snap: LineSnapshot, options: MountOptions = {}): PersonalLineHandle {
  ensureFonts();
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const year = snap.year;
  let yearH = 2300;
  let topY = TOP;
  const yOf = (iso: string) => topY + (Math.min(365, Math.max(0, doy(iso, year))) / 365) * yearH;
  let anims: Animation[] = [];

  host.replaceChildren();
  const root = el('section', 'pl');
  root.setAttribute('aria-label', 'Personal line');
  const top = el('div', 'pl-top');
  top.append(el('strong', '', 'MindWorks Pathways'), el('span', 'pl-tee', 'M'));
  top.querySelector('.pl-tee')!.setAttribute('aria-hidden', 'true');
  const bar = el('div', 'pl-bar');
  const rds = el('span', 'pl-badges');
  snap.lines.forEach((line) => rds.append(roundel(line)));
  const who = snap.student_name ? `${snap.student_name}’s line` : 'Your line';
  const title = el('h2', '', `${who} · Year ${snap.student_year} · ${yearLineName(snap.student_year)}`);
  bar.append(rds, title, el('span', 'pl-stamp', options.stamp ?? String(year)));
  const scroller = el('div', 'pl-scroll');
  const line = el('div', 'pl-line');
  scroller.append(line);
  root.append(top, bar, scroller, buildUndated(snap), buildKey(snap, planTracks(snap.lines, snap.items, options.branches !== false).branched));
  host.append(root);
  const card = createDepartureCard({
    studentYear: snap.student_year,
    following: (it) => {
      const index = snap.items.findIndex((item) => item.id === it.id);
      return index >= 0 ? snap.items.slice(index + 1, index + 3) : [];
    }
  });
  root.append(card.scrim);

  function build(animate: boolean): void {
    anims.forEach((a) => a.cancel());
    anims = [];
    line.replaceChildren();
    line.style.height = '';
    line.style.width = '';
    const items = snap.items;
    if (!snap.lines.length || !items.length) {
      line.append(el('p', 'pl-empty', snap.lines.length ? 'Nothing dated for these subjects at this year level yet.' : 'Pick at least one subject.'));
      return;
    }
    const avail = scroller.clientWidth || 360;
    const oneCol = avail < 560;
    const monthsW = oneCol ? 32 : 40;
    const laneW = oneCol ? 15 : 30;
    const lineGap = oneCol ? 34 : 40;
    const trackGap = oneCol ? 4 : 10;
    /** A name may sit this far below its date (about two names) before it moves to a spur. */
    const DRIFT = 96;
    /** Names columns per track: its own, plus one spur. More spurs read as legs, not a network. */
    const MAX_COLS = oneCol ? 1 : 2;

    // Tracks: one per line, or one per branch when a line splits (tracks.ts). Busy branches add spurs below.
    // A phone has no room for branches: each line stays one track and names carry the format.
    const plan = planTracks(snap.lines, items, options.branches !== false && !oneCol);
    const mains = plan.tracks.map((t) => t.key);
    const trackOf = new Map(plan.tracks.map((t) => [t.key, t]));
    const mainOf = (k: string) => k.split('~')[0]!;
    const colorOf = (k: string) => LINES[trackOf.get(mainOf(k))!.line];
    const FLAG_W = 20;
    const FAN = 6 + RAMP * 2;
    const flagH = (label: string) => Math.round(label.length * 6.4 + 18);
    const flagRoom = plan.branched ? Math.max(...plan.tracks.map((t) => flagH(t.label))) + FAN + 14 : 0;
    topY = TOP + flagRoom;
    const anchorDate = (it: LineItem) => it.run?.start ?? it.due!.on;
    const endDate = (it: LineItem) => it.run?.end ?? it.due!.on;

    // One appearance per item per track it stands on. Only the first (its home line) is named; the
    // others are interchange stops, so a line that only shares stops needs no names column.
    type App = { it: LineItem; main: string; k: string; primary: boolean };
    const apps: App[] = [];
    for (const it of items) plan.tracksOf(it).forEach((k, i) => apps.push({ it, main: k, k, primary: i === 0 }));
    const appsOn = (k: string) => apps.filter((a) => a.k === k);
    const keyOf = (a: App) => `${a.it.id}:${a.k}`;

    // Parallel tracks for concurrent stated-date pills; bracket columns for concurrent soft windows.
    type Geo = { clusters: Array<{ a: number; b: number; items: LineItem[]; n: number }>; half: number; bracketW: number };
    const lane = new Map<string, number>();
    const laneN = new Map<string, number>();
    const winCol = new Map<string, number>();
    const geo: Record<string, Geo> = {};
    const measureGeo = (k: string) => {
      const on = appsOn(k).map((a) => a.it);
      const pills = on.filter((it) => kindOf(it) === 'pill');
      const clusters: Geo['clusters'] = [];
      for (const it of pills) {
        const a = doy(it.run!.start, year);
        const b = doy(it.run!.end, year);
        let c = clusters.find((cl) => a <= cl.b + 7 && b >= cl.a - 7);
        if (!c) {
          c = { a, b, items: [], n: 1 };
          clusters.push(c);
        }
        c.a = Math.min(c.a, a);
        c.b = Math.max(c.b, b);
        c.items.push(it);
      }
      for (const c of clusters) {
        const ends: number[] = [];
        for (const it of c.items) {
          let index = ends.findIndex((end) => end + 7 < doy(it.run!.start, year));
          if (index < 0) {
            index = ends.length;
            ends.push(0);
          }
          ends[index] = doy(it.run!.end, year);
          lane.set(`${it.id}:${k}`, index);
        }
        c.n = ends.length;
        c.items.forEach((it) => laneN.set(`${it.id}:${k}`, c.n));
      }
      // A soft window is bracketed only where it's named; elsewhere it's an interchange stop.
      const windows = appsOn(k)
        .filter((a) => a.primary && kindOf(a.it) === 'window')
        .map((a) => a.it);
      const colEnds: number[] = [];
      for (const it of windows) {
        let col = colEnds.findIndex((end) => end + 3 < doy(it.run!.start, year));
        if (col < 0) {
          col = colEnds.length;
          colEnds.push(0);
        }
        colEnds[col] = doy(it.run!.end, year);
        winCol.set(`${it.id}:${k}`, Math.min(col, 5));
      }
      const half = Math.max(0, ...clusters.map((c) => ((c.n - 1) / 2) * laneW)) + 12;
      const bracketW = windows.length ? BRACKET_GAP * (Math.min(colEnds.length, 6) + 1) : 0;
      geo[k] = { clusters, half, bracketW };
    };

    const groups = snap.lines.map((l) => mains.filter((k) => trackOf.get(k)!.line === l)).filter((g) => g.length);
    const nG = groups.length;
    const xs: Record<string, number> = {};
    const side: Record<string, 'left' | 'right'> = {};
    const colBox: Record<string, { side: 'left' | 'right'; x0: number; x1: number }> = {};
    const lineX: Record<string, number> = {};
    const spursOf: Record<string, string[]> = {};
    let x = monthsW;
    let labelW = WIDE_LABEL_W;

    if (oneCol) {
      // Phone: every track side by side on the left, names share one column on the right.
      mains.forEach(measureGeo);
      groups.forEach((g, i) => {
        if (i > 0) x += lineGap;
        g.forEach((k, j) => {
          if (j > 0) x += trackGap;
          side[k] = 'right';
          x += geo[k]!.half;
          xs[k] = x;
          x += geo[k]!.half + geo[k]!.bracketW;
        });
      });
      labelW = Math.max(140, avail - x - LABEL_PAD * 2 - 12);
      const box = { side: 'right' as const, x0: x + LABEL_PAD, x1: x + LABEL_PAD + labelW };
      mains.forEach((k) => (colBox[k] = box));
      x += LABEL_PAD * 2 + labelW;
    }

    // Names: one block per date per track. Same-day stops on a track share a platform: the names
    // stack and the date is written once, under the last (as on the MindWorks map).
    type Block = { apps: App[]; main: string; el: HTMLElement; h: number; col: number; top: number; y: number };
    const blocks: Block[] = [];
    for (const k of mains) {
      const mine = apps
        .filter((a) => a.main === k && a.primary)
        .sort((a, b) => anchorDate(a.it).localeCompare(anchorDate(b.it)) || a.it.name.localeCompare(b.it.name));
      const byDay = new Map<string, App[]>();
      for (const a of mine) {
        const key = `${anchorDate(a.it)}|${itemWhen(a.it)}`;
        byDay.set(key, [...(byDay.get(key) ?? []), a]);
      }
      for (const group of byDay.values()) {
        const block = el('div', `pl-block${group.length > 1 ? ' is-platform' : ''}`);
        block.style.width = `${labelW}px`;
        group.forEach((a, index) => {
          const last = index === group.length - 1;
          const b = el('button', `pl-lbl${a.it.on.length > 1 ? ' is-shared' : ''}`);
          b.type = 'button';
          b.append(el('span', 'pl-name', a.it.name));
          if (last) {
            const sub = el('span', 'pl-sub');
            const lines = [...new Set(group.flatMap((g) => g.it.on))];
            lines.forEach((l) => sub.append(roundel(l, true)));
            const kinds = [...new Set(group.map((g) => kindText(g.it)))].join(' / ');
            sub.append(el('span', '', `${itemWhen(a.it)} · ${kinds}`));
            if (approx(a.it.run?.precision ?? a.it.due?.precision)) sub.append(el('span', 'pl-approx', 'approx.'));
            b.append(sub);
            if (group.length === 1 && a.it.close) b.append(el('span', 'pl-close', `Entries close ${dateWords(a.it.close.on, a.it.close.precision)}`));
          }
          b.addEventListener('click', () => card.open(a.it, b));
          block.append(b);
        });
        line.append(block);
        blocks.push({ apps: group, main: k, el: block, h: 0, col: 0, top: 0, y: 0 });
      }
    }
    blocks.forEach((B) => (B.h = B.el.getBoundingClientRect().height + 6));

    // Columns: each block takes the first column (its track, then the spur) where it sits within
    // DRIFT of its date. If even the spur is too full, the year gets taller and we try again.
    const maxCols: Record<string, number> = {};
    const assign = () => {
      let worst = 0;
      // On a phone every track writes into the one shared names column, so they stack together.
      for (const k of oneCol ? ['all'] : mains) {
        const floors: number[] = [];
        const mine = blocks.filter((B) => oneCol || B.main === k);
        mine.forEach((B) => (B.y = yOf(anchorDate(B.apps[0]!.it))));
        mine.sort((a, b) => a.y - b.y);
        for (const B of mine) {
          let pick = 0;
          let pickTop = Infinity;
          for (let c = 0; c < (maxCols[k] ?? MAX_COLS); c += 1) {
            const t = Math.max(B.y - 12, floors[c] ?? -Infinity);
            if (t - (B.y - 12) <= DRIFT) {
              pick = c;
              pickTop = t;
              break;
            }
            if (t < pickTop) {
              pick = c;
              pickTop = t;
            }
          }
          B.col = pick;
          B.top = pickTop;
          floors[pick] = pickTop + B.h;
          worst = Math.max(worst, pickTop - (B.y - 12));
        }
      }
      return worst;
    };
    if (oneCol) {
      const load = blocks.reduce((sum, B) => sum + B.h, 0);
      yearH = Math.max(2300, Math.round(load * 1.15));
      assign();
    } else {
      yearH = 2300;
      for (let tries = 0; tries < 6 && assign() > DRIFT * 3; tries += 1) yearH = Math.round(yearH * 1.2);
      // A spur for one name is a leg, not a branch: that name stacks under its neighbours instead.
      const lone = mains.filter((k) => blocks.filter((B) => B.main === k && B.col > 0).length === 1);
      if (lone.length) {
        lone.forEach((k) => (maxCols[k] = 1));
        assign();
      }
    }

    // Spurs: a busy branch forks sideways for the months its extra names cover.
    const spurSpan: Record<string, { y0: number; y1: number; parent: string }> = {};
    for (const B of blocks) {
      if (!B.col) continue;
      const spur = `${B.main}~${B.col}`;
      for (const a of B.apps) a.k = spur;
      const ends = B.apps.map((a) => yOf(endDate(a.it)));
      const span = spurSpan[spur] ?? { y0: Infinity, y1: -Infinity, parent: B.main };
      span.y0 = Math.min(span.y0, B.y);
      span.y1 = Math.max(span.y1, ...ends, B.top + B.h);
      spurSpan[spur] = span;
    }
    for (const spur of Object.keys(spurSpan).sort()) (spursOf[mainOf(spur)] ??= []).push(spur);

    if (!oneCol) {
      [...mains, ...Object.keys(spurSpan)].forEach(measureGeo);
      // [line 1 names] line 1 | line 2 [names] spur [names] … : every branch and spur has its own names
      // column on the side away from line 1, so a busy line spreads sideways, not down the page. A
      // track with no names of its own (it only shares stops) runs close beside the one before.
      const named = new Set(blocks.map((B) => B.apps[0]!.k));
      groups.forEach((g, i) => {
        const left = i === 0 && nG > 1;
        if (i > 0) x += lineGap;
        g.forEach((k, j) => {
          if (j > 0) x += trackGap;
          const units = [k, ...(spursOf[k] ?? [])];
          for (const u of left ? [...units].reverse() : units) {
            side[u] = left ? 'left' : 'right';
            if (!named.has(u)) {
              x += geo[u]!.half + (left ? geo[u]!.bracketW : 0);
              xs[u] = x;
              x += geo[u]!.half + (left ? 0 : geo[u]!.bracketW);
            } else if (left) {
              colBox[u] = { side: 'left', x0: x + LABEL_PAD, x1: x + LABEL_PAD + labelW };
              x += LABEL_PAD * 2 + labelW + geo[u]!.bracketW + geo[u]!.half;
              xs[u] = x;
              x += geo[u]!.half;
            } else {
              x += geo[u]!.half;
              xs[u] = x;
              x += geo[u]!.half + geo[u]!.bracketW;
              colBox[u] = { side: 'right', x0: x + LABEL_PAD, x1: x + LABEL_PAD + labelW };
              x += LABEL_PAD * 2 + labelW;
            }
          }
        });
      });
    }
    for (const g of groups) {
      const centre = g.reduce((sum, k) => sum + xs[k]!, 0) / g.length;
      g.forEach((k) => (lineX[k] = centre));
    }
    const W = Math.max(avail, x + 12);
    line.style.width = `${W}px`;
    const xOf = (k: string) => xs[k]!;
    const laneOff = (it: LineItem, k: string) => {
      const key = `${it.id}:${k}`;
      const count = laneN.get(key) ?? 1;
      return ((lane.get(key) ?? 0) - (count - 1) / 2) * laneW;
    };
    const bracketX = (it: LineItem, k: string) => {
      const dir = side[k] === 'left' ? -1 : 1;
      return xOf(k) + dir * (geo[k]!.half + BRACKET_GAP * ((winCol.get(`${it.id}:${k}`) ?? 0) + 1));
    };
    const homeX = (a: App) => (kindOf(a.it) === 'window' ? bracketX(a.it, a.k) : xOf(a.k) + laneOff(a.it, a.k));
    const anchorY = (a: App) => (kindOf(a.it) === 'pill' ? yOf(a.it.run!.start) + 10 : yOf(anchorDate(a.it)) + (kindOf(a.it) === 'window' ? 2 : 0));

    for (const B of blocks) {
      const k = B.apps[0]!.k;
      const box = colBox[k]!;
      B.el.classList.toggle('is-left', box.side === 'left');
      B.el.style.left = `${box.x0}px`;
      B.el.style.top = `${B.top}px`;
    }
    const H = Math.max(topY + yearH + 40, ...blocks.map((B) => B.top + B.h + 30));
    line.style.height = `${H}px`;

    const svg = sv('svg', { class: 'pl-net', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    line.prepend(svg);
    for (const term of snap.terms) {
      const y0 = yOf(term.start);
      svg.append(sv('rect', { class: 'pl-band', x: 0, y: y0, width: W, height: Math.max(0, yOf(term.end) - y0) }));
      const t = sv('text', { class: 'pl-band-label', x: 4, y: y0 + 30 });
      t.textContent = term.id;
      svg.append(t);
    }
    MONTHS.forEach((m, i) => {
      const y = yOf(`${year}-${String(i + 1).padStart(2, '0')}-01`);
      svg.append(sv('line', { class: 'pl-month-rule', x1: 0, x2: monthsW - 8, y1: y, y2: y }));
      const t = sv('text', { class: 'pl-month', x: 4, y: y + 14 });
      t.textContent = m;
      svg.append(t);
    });
    const leaders = sv('g');
    svg.append(leaders);

    // Lines: each track runs from `from` to `to`, splitting into parallel tracks where pills overlap.
    const paths: Array<{ p: SVGPathElement; a: number; b: number }> = [];
    const y0 = topY - 10;
    const y1 = topY + yearH + 10;
    const strokeOf = (k: string, width: number) => ({ fill: 'none', stroke: colorOf(k).color, 'stroke-width': width, 'stroke-linecap': 'round' });
    const addPath = (d: string, a: number, b: number, k: string, width: number) => {
      const p = sv('path', { d, ...strokeOf(k, width) }) as SVGPathElement;
      svg.append(p);
      paths.push({ p, a, b });
    };
    const runTrack = (k: string, from: number, to: number, width: number) => {
      const cx = xOf(k);
      let cursor = from;
      const splits = geo[k]!.clusters
        .filter((c) => c.n > 1)
        .map((c) => ({
          n: c.n,
          ys: Math.min(...c.items.map((it) => yOf(it.run!.start))) - RAMP,
          ye: Math.max(...c.items.map((it) => yOf(it.run!.end))) + RAMP
        }))
        .sort((a, b) => a.ys - b.ys);
      for (const c of splits) {
        if (c.ys > cursor) addPath(`M ${cx} ${cursor} V ${c.ys}`, cursor, c.ys, k, width);
        for (let index = 0; index < c.n; index += 1) {
          const off = (index - (c.n - 1) / 2) * laneW;
          addPath(
            `M ${cx} ${c.ys} C ${cx} ${c.ys + RAMP / 2} ${cx + off} ${c.ys + RAMP / 2} ${cx + off} ${c.ys + RAMP} V ${c.ye - RAMP} C ${cx + off} ${c.ye - RAMP / 2} ${cx} ${c.ye - RAMP / 2} ${cx} ${c.ye}`,
            c.ys,
            c.ye,
            k,
            width
          );
        }
        cursor = Math.max(cursor, c.ye);
      }
      if (to > cursor) addPath(`M ${cx} ${cursor} V ${to}`, cursor, to, k, width);
    };
    for (const k of mains) {
      if (plan.branched) {
        // Branches leave their line together at the top, then fan out to their own tracks.
        const gx = lineX[k]!;
        const cx = xOf(k);
        addPath(`M ${gx} 6 C ${gx} ${6 + RAMP} ${cx} ${6 + RAMP} ${cx} ${FAN} V ${y0}`, 6, y0, k, 8);
      }
      runTrack(k, y0, y1, 8);
    }
    for (const [spur, span] of Object.entries(spurSpan)) {
      // A spur forks off its branch just before its first stop and rejoins after its last.
      const px = xOf(span.parent);
      const sx = xOf(spur);
      // The fork crosses the names columns between branch and spur, so it leaves and rejoins where
      // those columns are clear of names.
      const col = Number(spur.split('~')[1]);
      const inWay = blocks.filter((B) => B.main === span.parent && B.col < col);
      const clear = (ya: number, yb: number) => inWay.every((B) => B.top + B.h <= ya || B.top >= yb);
      let a = Math.max(y0, span.y0 - RAMP * 2 - 16);
      while (a > y0 && !clear(a, a + RAMP * 2)) a -= 6;
      let b = Math.min(y1, span.y1 + RAMP * 2);
      while (b < y1 && !clear(b - RAMP * 2, b)) b += 6;
      addPath(`M ${px} ${a} C ${px} ${a + RAMP} ${sx} ${a + RAMP} ${sx} ${a + RAMP * 2}`, a, a + RAMP * 2, spur, 6);
      runTrack(spur, a + RAMP * 2, b - RAMP * 2, 6);
      addPath(`M ${sx} ${b - RAMP * 2} C ${sx} ${b - RAMP} ${px} ${b - RAMP} ${px} ${b}`, b - RAMP * 2, b, spur, 6);
    }

    const marks: Array<{ g: SVGElement; y: number }> = [];
    const addMark = (g: SVGElement, y: number) => {
      svg.append(g);
      marks.push({ g, y });
    };
    for (const a of apps) {
      const { it, k } = a;
      const kind = !a.primary && kindOf(it) === 'window' ? 'stop' : kindOf(it);
      const lx = xOf(k) + laneOff(it, k);
      const color = colorOf(k);
      const g = sv('g');
      const ay = yOf(anchorDate(it));
      if (kind === 'pill') {
        const ys = yOf(it.run!.start);
        g.append(sv('rect', { x: lx - 10, y: ys, width: 20, height: Math.max(20, yOf(it.run!.end) - ys), rx: 10, fill: color.fill, stroke: color.color, 'stroke-width': 3 }));
      } else if (kind === 'window') {
        const bx = bracketX(it, k);
        const ys = yOf(it.run!.start);
        const ye = Math.max(ys + 10, yOf(it.run!.end));
        const dir = side[k] === 'left' ? -1 : 1;
        g.append(sv('path', { d: `M ${bx - dir * 4} ${ys} H ${bx} V ${ye} H ${bx - dir * 4}`, class: 'pl-window', stroke: color.color }));
      } else {
        // A stop shared with another of the student's lines wears an interchange ring on each.
        g.append(sv('circle', { cx: lx, cy: ay, r: 8, class: `pl-stop${it.on.length > 1 ? ' is-interchange' : ''}` }));
        if (!a.primary) {
          const title = sv('title');
          title.textContent = `${it.name} · ${itemWhen(it)}`;
          g.append(title);
        }
        if (kind === 'due') g.append(sv('circle', { cx: lx, cy: ay, r: 3, class: 'pl-due-dot' }));
      }
      if (it.close && it.run) {
        const cy = yOf(it.close.on);
        g.append(sv('line', { x1: xOf(k) - 9, x2: xOf(k) + 9, y1: cy, y2: cy, class: 'pl-close-tick' }));
      }
      addMark(g, ay);
    }

    if (plan.branched) {
      // Flags name each branch: at the top, and again at each later term start if the track is clear there.
      const busy = (k: string, ya: number, yb: number) =>
        appsOn(k).some((a) => {
          const top = yOf(anchorDate(a.it)) - 14;
          const bottom = (a.it.run ? yOf(a.it.run.end) : yOf(anchorDate(a.it))) + 14;
          return top < yb && bottom > ya;
        });
      const flag = (k: string, yTop: number) => {
        const track = trackOf.get(k)!;
        const color = colorOf(k);
        const h = flagH(track.label);
        const g = sv('g', { class: 'pl-flag' });
        const title = sv('title');
        title.textContent = track.branch ? `${color.name} · ${track.label}` : `${color.name} line`;
        g.append(title);
        g.append(sv('rect', { x: xOf(k) - FLAG_W / 2, y: yTop, width: FLAG_W, height: h, rx: 5, fill: color.color, class: 'pl-flag__box' }));
        const t = sv('text', {
          class: 'pl-flag__text',
          x: 0,
          y: 0,
          fill: color.ink,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          transform: `translate(${xOf(k)} ${yTop + h / 2}) rotate(90)`
        });
        t.textContent = track.label;
        g.append(t);
        addMark(g, yTop);
      };
      for (const k of mains) {
        flag(k, FAN + 6);
        const h = flagH(trackOf.get(k)!.label);
        for (const term of snap.terms.slice(1)) {
          const yt = yOf(term.start) + 6;
          if (!busy(k, yt - 4, yt + h + 4)) flag(k, yt);
        }
      }
    }

    // A name that sits below its date keeps a dotted leader back to its mark.
    for (const B of blocks) {
      const a = B.apps[0]!;
      const box = colBox[a.k]!;
      const ay = anchorY(a);
      const ly = B.top + 12;
      if (Math.abs(ly - ay) < 8) continue;
      const leftSide = box.side === 'left';
      const edge = leftSide ? box.x1 + 4 : box.x0 - 4;
      const bend = leftSide ? edge + 6 : edge - 6;
      const startX = homeX(a) + (leftSide ? -10 : 10);
      leaders.append(sv('path', { class: 'pl-leader', d: `M ${startX} ${ay} H ${bend} L ${edge} ${ly}` }));
    }

    if (!animate || reduce || typeof Element.prototype.animate !== 'function') return;
    const D = Math.min(5600, 1200 + items.length * 140);
    const at = (y: number) => Math.max(0, ((y - y0) / (y1 - y0)) * D);
    for (const q of paths) {
      const len = q.p.getTotalLength?.() ?? 0;
      if (!len) continue;
      q.p.style.strokeDasharray = `${len}`;
      anims.push(q.p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: Math.max(1, at(q.b) - at(q.a)), delay: at(q.a), easing: 'linear', fill: 'both' }));
    }
    anims.push(leaders.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: D, fill: 'both' }));
    for (const m of marks) {
      m.g.style.transformBox = 'fill-box';
      m.g.style.transformOrigin = 'center';
      anims.push(m.g.animate([{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 280, delay: at(m.y), fill: 'both', easing: 'cubic-bezier(.3,1.5,.5,1)' }));
    }
    for (const B of blocks) {
      anims.push(B.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: at(B.y), fill: 'both', easing: 'ease-out' }));
    }
  }

  let lastW = 0;
  let timer = 0;
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          const w = scroller.clientWidth;
          if (Math.abs(w - lastW) > 2) {
            lastW = w;
            build(false);
          }
        }, 150);
      })
    : null;
  const start = () => {
    lastW = scroller.clientWidth;
    build(options.animate !== false);
    observer?.observe(scroller);
  };
  if (document.fonts?.ready) void document.fonts.ready.then(start);
  else start();

  return {
    replay: () => build(true),
    destroy: () => {
      anims.forEach((a) => a.cancel());
      observer?.disconnect();
      card.close();
      host.replaceChildren();
    }
  };
}

function buildUndated(snap: LineSnapshot): HTMLElement {
  const section = el('div', 'pl-undated');
  if (!snap.undated.length) {
    section.hidden = true;
    return section;
  }
  section.append(el('h3', '', 'Also open to you, dates to be confirmed'));
  const list = el('ul', '');
  for (const it of snap.undated) {
    const li = el('li', '');
    it.on.forEach((k) => li.append(roundel(k, true)));
    li.append(el('span', '', it.name));
    if (it.window) li.append(el('small', '', it.window));
    list.append(li);
  }
  section.append(list);
  return section;
}

function buildKey(snap: LineSnapshot, branched = false): HTMLElement {
  const key = el('div', 'pl-key');
  key.append(el('h3', '', 'Key'));
  const grid = el('div', 'pl-key__grid');
  for (const k of snap.lines) {
    const item = el('div', 'pl-key__item');
    item.append(roundel(k), el('span', '', `${LINES[k].name} line`));
    grid.append(item);
  }
  const color = snap.lines[0] ? LINES[snap.lines[0]] : LINES.J;
  const add = (inner: string, text: string) => {
    const item = el('div', 'pl-key__item');
    const svg = sv('svg', { width: 46, height: 26, viewBox: '0 0 46 26', 'aria-hidden': 'true' });
    svg.innerHTML = inner;
    item.append(svg, el('span', '', text));
    grid.append(item);
  };
  const lane = `<line x1="12" y1="0" x2="12" y2="26" stroke="${color.color}" stroke-width="6"/>`;
  add(`${lane}<circle cx="12" cy="13" r="7" class="pl-stop"/>`, 'On a stated day');
  add(`${lane}<rect x="4" y="2" width="16" height="22" rx="8" fill="${color.fill}" stroke="${color.color}" stroke-width="3"/>`, 'Runs between stated dates');
  add(`${lane}<path d="M 24 3 H 28 V 23 H 24" class="pl-window" stroke="${color.color}"/>`, 'Around this time (approx.)');
  add(`${lane}<circle cx="12" cy="13" r="7" class="pl-stop"/><circle cx="12" cy="13" r="2.5" class="pl-due-dot"/>`, 'Entries due');
  add(`${lane}<line x1="4" x2="20" y1="13" y2="13" class="pl-close-tick"/>`, 'Entries close');
  if (branched) {
    add(
      `<path d="M 12 0 C 12 8 5 8 5 14 V 26 M 12 0 C 12 8 19 8 19 14 V 26" fill="none" stroke="${color.color}" stroke-width="4"/><rect x="13" y="12" width="10" height="14" rx="3" fill="${color.color}"/>`,
      'A line splits into branches; each flag names what you do there (Exam, Speaking, Civics…). Other is the rest of that line.'
    );
  }
  if (snap.lines.length > 1) {
    const second = LINES[snap.lines[1]!];
    add(
      `<line x1="12" y1="0" x2="12" y2="26" stroke="${color.color}" stroke-width="6"/><line x1="34" y1="0" x2="34" y2="26" stroke="${second.color}" stroke-width="6"/><circle cx="12" cy="13" r="6" class="pl-stop is-interchange"/><circle cx="34" cy="13" r="6" class="pl-stop is-interchange"/>`,
      'On two of your lines (named on the first, a plain stop on the second)'
    );
  }
  key.append(grid);
  return key;
}

/** Colour for an entry none of whose subjects is on a line yet. */
const OFF_LINE = { name: 'Not on a line', color: '#1d2633', fill: '#ecebe6', ink: '#ffffff' };

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** Where the entry sits in its calendar year: a pill for a run (striped when the dates are approx.), a diamond for a due date. */
function yearStrip(it: LineItem): HTMLElement | null {
  const on = it.run?.start ?? it.due?.on;
  if (!on) return null;
  const year = Number(on.slice(0, 4));
  const pct = (iso: string, endOfDay = false) =>
    Math.min(100, Math.max(0, ((doy(iso, year) + (endOfDay ? 1 : 0)) / 365) * 100));
  const wrap = el('div', 'pl-year');
  wrap.append(el('span', 'pl-cars__label', `${year}`));
  const track = el('div', 'pl-year__track');
  if (it.run) {
    const mark = el('span', `pl-year__run${approx(it.run.precision) ? ' is-approx' : ''}`);
    mark.style.left = `${pct(it.run.start)}%`;
    mark.style.width = `${Math.max(1.6, pct(it.run.end, true) - pct(it.run.start))}%`;
    mark.title = itemWhen(it);
    track.append(mark);
  } else if (it.due) {
    const mark = el('span', 'pl-year__due');
    mark.style.left = `${pct(it.due.on)}%`;
    mark.title = itemWhen(it);
    track.append(mark);
  }
  const months = el('div', 'pl-year__months');
  MONTH_LETTERS.forEach((letter) => months.append(el('span', '', letter)));
  wrap.append(track, months);
  return wrap;
}

export type DepartureCardOptions = {
  /** Lights this year's carriage green ("you"). */
  studentYear?: number | null;
  /** The next stops after this one, for "Next on your line". */
  following?: (it: LineItem) => LineItem[];
  nextTitle?: string;
  /** Hub-only extras appended under the card body (links, actions). */
  extras?: (it: LineItem, close: () => void) => HTMLElement[];
};

/** The departure-board card for one stop or catalogue entry. */
export function createDepartureCard(options: DepartureCardOptions = {}): {
  scrim: HTMLElement;
  open(it: LineItem, from?: HTMLElement): void;
  close(): void;
} {
  ensureFonts();
  const scrim = el('div', 'pl-scrim');
  scrim.hidden = true;
  const card = el('div', 'pl-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'pl-card-title');
  scrim.append(card);
  let lastFocus: HTMLElement | null = null;

  const close = () => {
    if (scrim.hidden) return;
    scrim.hidden = true;
    lastFocus?.focus();
  };
  scrim.addEventListener('click', (event) => {
    if (event.target === scrim) close();
  });
  const onKey = (event: KeyboardEvent) => {
    if (!scrim.isConnected) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    if (event.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  const open = (it: LineItem, from?: HTMLElement) => {
    lastFocus = from ?? (document.activeElement as HTMLElement | null);
    const k = it.on[0];
    const color = k ? LINES[k] : OFF_LINE;
    card.replaceChildren();
    card.style.setProperty('--pl-accent', color.color);
    card.style.setProperty('--pl-car', color.fill);

    const head = el('div', 'pl-card__head');
    head.style.background = color.color;
    head.style.color = color.ink;
    const right = el('span', 'pl-card__runs');
    const runs = el('span', '', it.due && !it.run ? 'Due' : 'Runs');
    runs.append(el('b', '', it.run ? runWords(it.run.start, it.run.end, it.run.precision) : it.due ? dateWords(it.due.on, it.due.precision) : 'TBC'));
    const closeBtn = el('button', 'pl-card__close', 'Close');
    closeBtn.type = 'button';
    closeBtn.style.color = color.ink;
    closeBtn.addEventListener('click', close);
    right.append(runs, closeBtn);
    head.append(el('span', '', it.format ? `${it.type} · ${it.format}` : it.type), right);

    const body = el('div', 'pl-card__body');
    const titleRow = el('div', 'pl-card__title');
    const badges = el('span', 'pl-card__rds');
    it.on.forEach((line) => badges.append(roundel(line)));
    const text = el('div', '');
    const h = el('h3', '', it.name);
    h.id = 'pl-card-title';
    const via = it.on.length ? `via ${it.on.map((line) => LINES[line].name).join(' + ')}` : 'Not on a line yet';
    text.append(h, el('p', '', `${via} · ${it.matched.join(', ')}${weeks(it) > 1 ? ` · ${weeks(it)} weeks` : ''}`));
    titleRow.append(badges, text);
    body.append(titleRow);

    const soft = approx(it.run?.precision) || approx(it.due?.precision) || approx(it.close?.precision);
    if (soft) body.append(el('p', 'pl-card__note', 'Dates marked approx. follow the usual timing. Check with the organiser for this year.'));

    const cars = el('div', 'pl-cars');
    cars.append(el('span', 'pl-cars__label', 'Year levels'));
    const row = el('div', 'pl-cars__row');
    for (let y = 7; y <= 12; y += 1) {
      const you = y === options.studentYear;
      const car = el('span', `pl-car${it.years.includes(y) ? ' is-in' : ''}${you ? ' is-you' : ''}`, String(y));
      car.title = you ? `Year ${y} (you)` : `Year ${y}${it.years.includes(y) ? '' : ', not eligible'}`;
      row.append(car);
    }
    cars.append(row);
    body.append(cars);

    const split = el('div', 'pl-split');
    const left = el('div', '');
    const closeText = it.close ? `Close ${dateWords(it.close.on, it.close.precision)}${approx(it.close.precision) ? ' (approx.)' : ''}` : it.window || 'See website';
    left.append(el('div', 'pl-k', 'Entries'), el('div', 'pl-v', closeText));
    const right2 = el('div', 'pl-split__big');
    right2.append(el('div', 'pl-k', 'Cost'), el('div', 'pl-v', it.basis === 'Free' ? 'Free' : it.basis || 'TBC'));
    split.append(left, right2);
    body.append(split);

    const tags = el('div', 'pl-tags');
    [
      it.format,
      it.length,
      it.level,
      it.entry,
      ...(it.settings ?? []),
      it.entry_route,
      it.provider === 'School' ? 'School run' : null,
      it.basis && it.basis !== 'Free' ? it.cost : null
    ]
      .filter((value): value is string => Boolean(value))
      .forEach((value) => tags.append(el('span', 'pl-tag', value)));
    if (tags.childNodes.length) body.append(tags);
    const strip = yearStrip(it);
    if (strip) body.append(strip);
    if (it.description) body.append(el('p', 'pl-card__desc', it.description));
    const meta = [it.organiser, it.location].filter(Boolean).join(' · ');
    if (meta) body.append(el('p', 'pl-card__meta', meta));

    const following = options.following?.(it) ?? [];
    if (following.length) {
      const next = el('div', 'pl-next');
      next.append(el('h4', '', options.nextTitle ?? 'Next on your line'));
      for (const f of following) {
        const b = el('button', '');
        b.type = 'button';
        const fb = el('span', 'pl-badges');
        f.on.forEach((line) => fb.append(roundel(line, true)));
        b.append(fb, el('span', 'pl-next__name', f.name), el('span', 'pl-next__when', itemWhen(f)));
        b.addEventListener('click', () => open(f, lastFocus ?? undefined));
        next.append(b);
      }
      body.append(next);
    }
    if (it.link) {
      const a = el('a', 'pl-btn pl-btn--go', 'Register');
      a.href = it.link;
      a.target = '_blank';
      a.rel = 'noopener';
      const foot = el('div', 'pl-card__foot');
      foot.append(a);
      body.append(foot);
    }
    for (const extra of options.extras?.(it, close) ?? []) body.append(extra);
    card.append(head, body);
    scrim.hidden = false;
    closeBtn.focus();
  };

  return { scrim, open, close };
}
