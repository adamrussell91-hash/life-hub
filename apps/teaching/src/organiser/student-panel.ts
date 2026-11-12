/** The Organiser tab on the student's progress page. */
import { el } from '@/quiz/dom';
import { printOrganiser } from './print';
import { mountPractice, nextCardsLine, type PracticeApi } from './practice';
import { mountTestMyself, type TestMyselfHandle } from './test-myself';
import { conceptColourAt, isIdeas, lineWords } from './editor-model';
import type { OrganiserLoad, PracticeWeek, Sheet, SheetLine, SheetSection } from './types';
import './organiser-student.css';

export type OrganiserPanelOptions = {
  classId: string;
  /** Reload the organiser and redraw; called when a practice session ends. */
  reload?: () => void;
  /** Test seam. */
  api?: PracticeApi;
};

function weekday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' });
}

/** Rough minutes for a practice set: about 40 seconds a card. */
export const minutesFor = (n: number): number => Math.max(1, Math.round((n * 2) / 3));
/** How often each box comes round, as the server's GAPS. */
const BOX_GAPS = ['every day', 'every 3 days', 'every week', 'every 2 weeks', 'every 4 weeks'];

const SVG = 'http://www.w3.org/2000/svg';
const svgEl = (name: string, attrs: Record<string, string>): SVGElement => {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const shortDay = (date: string): string => {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' });
};
const BAR_MAX = 60;

/** "Your week": three numbers, the cards known for good, and a bar a day (green when every ready card was done). */
export function weekBlock(week: PracticeWeek): HTMLElement {
  const block = el('section', 'kos-week');
  block.setAttribute('aria-label', 'Your week');
  block.append(el('h3', 'kos-week__title', 'Your week'));

  const stats = el('div', 'kos-stats');
  const stat = (value: string, label: string): HTMLElement => {
    const tile = el('div', 'kos-stat');
    tile.append(el('span', 'kos-stat__v', value), el('span', 'kos-stat__k', label));
    return tile;
  };
  stats.append(
    stat(String(week.streak), week.streak === 1 ? 'day in a row' : 'days in a row'),
    stat(String(week.cards), week.cards === 1 ? 'card this week' : 'cards this week'),
    stat(week.first_go === null ? '–' : `${week.first_go}%`, 'right first go')
  );
  const share = week.total ? week.known / week.total : 0;
  const ring = el('div', 'kos-stat kos-stat--ring');
  const svg = svgEl('svg', { class: 'kos-ring', viewBox: '0 0 52 52', role: 'img', 'aria-label': `${week.known} of ${plural(week.total, 'card', 'cards')} known for good` });
  const round = 2 * Math.PI * 21;
  svg.append(
    svgEl('circle', { cx: '26', cy: '26', r: '21', fill: 'none', class: 'kos-ring__track', 'stroke-width': '7' }),
    ...(share > 0 ? [svgEl('circle', { cx: '26', cy: '26', r: '21', fill: 'none', class: 'kos-ring__fill', 'stroke-width': '7', 'stroke-linecap': 'round', 'stroke-dasharray': `${(share * round).toFixed(1)} ${round.toFixed(1)}`, transform: 'rotate(-90 26 26)' })] : [])
  );
  const pct = svgEl('text', { x: '26', y: '30', 'text-anchor': 'middle', class: 'kos-ring__pct' });
  pct.textContent = `${Math.round(share * 100)}%`;
  svg.append(pct);
  const words = el('div', 'kos-stat__words');
  words.append(el('span', 'kos-stat__v', `${week.known}/${week.total}`), el('span', 'kos-stat__k', 'known for good'));
  ring.append(svg, words);
  stats.append(ring);
  block.append(stats);

  const top = Math.max(1, ...week.days.map((d) => Math.max(d.answered, d.ready ?? 0)));
  const bars = el('div', 'kos-days');
  bars.setAttribute('role', 'img');
  bars.setAttribute(
    'aria-label',
    `Cards you did each day this week: ${week.days.map((d) => `${shortDay(d.d)} ${d.ready === null ? d.answered : `${d.answered} of ${d.ready}`}${d.done ? ', all done' : ''}`).join('; ')}`
  );
  for (const d of week.days) {
    const day = el('div', 'kos-day');
    day.setAttribute('aria-hidden', 'true');
    const bar = el('div', `kos-day__bar${d.done ? ' is-done' : ''}${d.answered ? '' : ' is-zero'}`);
    if (d.answered) bar.style.height = `${Math.max(4, Math.round((d.answered / top) * BAR_MAX))}px`;
    day.append(el('small', 'kos-day__n', d.ready === null ? String(d.answered) : `${d.answered}/${d.ready}`), bar, el('span', 'kos-day__name', shortDay(d.d)));
    bars.append(day);
  }
  block.append(bars);
  const foot = el('div', 'kos-week__foot');
  foot.append(el('span', undefined, 'Green means you did every card that was ready that day'), el('span', 'kos-week__count', `${week.done_days} of ${week.days.length} days`));
  block.append(foot);
  return block;
}

export function renderOrganiserPanel(load: OrganiserLoad, options: OrganiserPanelOptions): HTMLElement {
  const root = el('div', 'kos-root');
  const sheets = [...load.sheets].sort((a, b) => Number(b.current) - Number(a.current));
  if (!sheets.length) return root;
  let sheet: Sheet = sheets[0]!;
  const open = new Set<string>();
  const live = new Map<string, TestMyselfHandle>();

  const stopAll = (): void => {
    for (const h of live.values()) h.dispose();
    live.clear();
  };

  /** Test myself under a card, opened from its button. */
  function testToggle(sec: SheetSection, host: HTMLElement): HTMLElement {
    const go = el('button', 'kos-quiet', 'Test myself');
    go.type = 'button';
    let body: HTMLElement | null = null;
    const sync = (): void => {
      const on = open.has(sec.id);
      go.setAttribute('aria-expanded', String(on));
      if (on && !body) {
        body = el('section', 'kos-sec');
        body.dataset.sec = sec.id;
        live.set(sec.id, mountTestMyself(body, sec));
        host.append(body);
      } else if (!on && body) {
        live.get(sec.id)?.dispose();
        live.delete(sec.id);
        body.remove();
        body = null;
      }
    };
    go.addEventListener('click', () => {
      if (open.has(sec.id)) open.delete(sec.id);
      else open.add(sec.id);
      sync();
    });
    sync();
    return go;
  }

  const newMark = (line: SheetLine): HTMLElement[] => (line.fresh ? [el('span', 'kos-new', 'New')] : []);

  /** What a closed fold says: how many lines, and how many are new. */
  function foldCount(sec: SheetSection): HTMLElement {
    const fresh = sec.lines.filter((l) => l.fresh).length;
    return el('span', 'kos-fold__count', `${sec.lines.length} ${sec.lines.length === 1 ? 'line' : 'lines'}${fresh ? `, ${fresh} new` : ''}`);
  }

  function conceptCard(sec: SheetSection, at: number): HTMLElement {
    const card = el('details', 'kos-concept kos-fold');
    card.style.setProperty('--c', conceptColourAt(at));
    card.dataset.sec = sec.id;
    const head = el('summary', 'kos-fold__head');
    const name = el('span', 'kos-fold__name');
    name.append(el('span', 'kos-capsule', sec.name), foldCount(sec));
    head.append(name);
    if (sec.sentence) head.append(el('span', 'kos-concept__line', sec.sentence));
    const stops = el('div', 'kos-stops');
    for (const line of sec.lines) {
      const stop = el('div', `kos-stop${line.fresh ? ' is-new' : ''}`, lineWords(sec, line).body);
      stop.append(...newMark(line));
      stops.append(stop);
    }
    const foot = el('div', 'kos-foot');
    foot.append(testToggle(sec, card));
    card.append(head, stops, foot);
    return card;
  }

  function sidePanel(sec: SheetSection): HTMLElement {
    const box = el('details', 'kos-panel kos-fold');
    box.dataset.sec = sec.id;
    const head = el('summary', 'kos-fold__head');
    const name = el('span', 'kos-fold__name');
    name.append(el('span', 'kos-panel__name', sec.name), foldCount(sec));
    head.append(name);
    box.append(head);
    const row = (line: SheetLine): HTMLElement => {
      const { head: word, body } = lineWords(sec, line);
      if (!word) {
        const plain = el('div', 'kos-pair');
        plain.append(document.createTextNode(body), ...newMark(line));
        return plain;
      }
      // A long list reads as short rows; the meaning opens under the word.
      const pair = el('details', 'kos-pair');
      const name = el('summary');
      name.append(el('b', undefined, word), ...newMark(line));
      pair.append(name, el('div', 'kos-pair__body', body));
      return pair;
    };
    if (sec.role === 'vocab') {
      for (const tier of [1, 2, 3, undefined] as const) {
        const words = sec.lines.filter((l) => l.tier === tier);
        if (!words.length) continue;
        if (tier) box.append(el('p', 'kos-tier', `Tier ${tier}`));
        for (const line of words) box.append(row(line));
      }
    } else {
      for (const line of sec.lines) box.append(row(line));
    }
    const foot = el('div', 'kos-foot');
    foot.append(testToggle(sec, box));
    box.append(foot);
    return box;
  }

  /** Today's set and how many cards sit in each Leitner box. */
  function practiceBlock(prac: NonNullable<OrganiserLoad['practice']>): HTMLElement {
    const block = el('section', 'kos-leitner');
    block.setAttribute('aria-label', 'Practice');
    const ready = prac.today > 0 && prac.cards.length > 0;
    const bar = el('div', `kos-prac${ready ? '' : ' kos-prac--calm'}`);
    const text = el('div');
    text.append(
      el('b', undefined, `Practise today: ${ready ? prac.today : 0}`),
      el('span', undefined, ready ? `About ${minutesFor(prac.today)} ${minutesFor(prac.today) === 1 ? 'minute' : 'minutes'}. Ticking off a lesson adds its cards.` : nextCardsLine(prac.next))
    );
    bar.append(text);
    if (ready) {
      const start = el('button', 'kos-btn', 'Start');
      start.type = 'button';
      start.addEventListener('click', showPractice);
      bar.append(start);
    }
    block.append(bar);
    if (prac.boxes?.some((n) => n > 0)) {
      const boxes = el('ol', 'kos-boxes');
      prac.boxes.forEach((n, at) => {
        const box = el('li', 'kos-box');
        box.append(el('b', 'kos-box__n', String(n)), el('span', 'kos-box__name', `Box ${at + 1}`), el('span', 'kos-box__gap', BOX_GAPS[at] ?? ''));
        box.setAttribute('aria-label', `Box ${at + 1}: ${n} ${n === 1 ? 'card' : 'cards'}, ${BOX_GAPS[at] ?? ''}`);
        boxes.append(box);
      });
      block.append(boxes);
    }
    return block;
  }

  function showOverview(): void {
    stopAll();
    const parts: HTMLElement[] = [];
    const week = load.need !== 'no_list' ? load.practice?.week : undefined;
    if (week && (week.total > 0 || week.cards > 0)) parts.push(weekBlock(week));
    const head = el('div');
    head.append(el('h2', 'kos-title', sheet.title), el('p', 'kos-sub', 'Grows as your lessons come out.'));
    parts.push(head);

    if (sheets.length > 1) {
      const sw = el('div', 'kos-switch');
      sw.setAttribute('role', 'group');
      sw.setAttribute('aria-label', 'Unit');
      for (const s of sheets) {
        const p = el('button', 'kos-pill', s.title);
        p.type = 'button';
        p.setAttribute('aria-pressed', String(s === sheet));
        p.addEventListener('click', () => {
          sheet = s;
          open.clear();
          showOverview();
        });
        sw.append(p);
      }
      parts.push(sw);
    }

    const w = sheet.week;
    if (w) {
      const banner = el('div', 'kos-set');
      banner.append(el('b', undefined, 'This week:'), document.createTextNode(` ${w.section_name}, by ${weekday(w.due)}, for ${w.reason}.`));
      parts.push(banner);
    }

    if (load.practice && load.need !== 'no_list') parts.push(practiceBlock(load.practice));

    const grid = el('div', 'kos-sheet');
    const left = el('div', 'kos-column');
    const right = el('div', 'kos-column');
    let at = 0;
    for (const sec of sheet.sections) {
      if (isIdeas(sec)) left.append(conceptCard(sec, at++));
      else right.append(sidePanel(sec));
    }
    grid.append(left, right);
    parts.push(grid);

    const print = el('button', 'kos-link', 'Print my organiser');
    print.type = 'button';
    print.addEventListener('click', () => printOrganiser(sheet));
    parts.push(print);
    root.replaceChildren(...parts);
  }

  function showPractice(): void {
    stopAll();
    const host = el('div');
    root.replaceChildren(host);
    mountPractice(host, {
      classId: options.classId,
      load: load.practice!,
      api: options.api,
      onExit: () => (options.reload ? options.reload() : showOverview())
    });
  }

  showOverview();
  return root;
}
