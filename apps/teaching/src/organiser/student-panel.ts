/** The Organiser tab on the student's progress page. */
import { el } from '@/quiz/dom';
import { printOrganiser } from './print';
import { mountPractice, nextCardsLine, type PracticeApi } from './practice';
import { mountTestMyself, type TestMyselfHandle } from './test-myself';
import { conceptColourAt, isIdeas, lineWords } from './editor-model';
import type { OrganiserLoad, Sheet, SheetLine, SheetSection } from './types';
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

const minutesFor = (n: number): number => Math.max(1, Math.round((n * 2) / 3));

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

  function conceptCard(sec: SheetSection, at: number): HTMLElement {
    const card = el('article', 'kos-concept');
    card.style.setProperty('--c', conceptColourAt(at));
    card.dataset.sec = sec.id;
    card.append(el('span', 'kos-capsule', sec.name));
    if (sec.sentence) card.append(el('p', 'kos-concept__line', sec.sentence));
    const stops = el('div', 'kos-stops');
    for (const line of sec.lines) {
      const stop = el('div', `kos-stop${line.fresh ? ' is-new' : ''}`, lineWords(sec, line).body);
      stop.append(...newMark(line));
      stops.append(stop);
    }
    const foot = el('div', 'kos-foot');
    foot.append(testToggle(sec, card));
    card.append(stops, foot);
    return card;
  }

  function sidePanel(sec: SheetSection): HTMLElement {
    const box = el('section', 'kos-panel');
    box.dataset.sec = sec.id;
    box.append(el('h3', 'kos-panel__name', sec.name));
    const row = (line: SheetLine): HTMLElement => {
      const { head, body } = lineWords(sec, line);
      const pair = el('div', 'kos-pair');
      if (head) pair.append(el('b', undefined, head));
      pair.append(document.createTextNode(body), ...newMark(line));
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

  function showOverview(): void {
    stopAll();
    const parts: HTMLElement[] = [];
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

    const prac = load.practice;
    if (prac && load.need !== 'no_list') {
      if (prac.today > 0 && prac.cards.length) {
        const box = el('div', 'kos-prac');
        const text = el('div');
        text.append(el('b', undefined, `Practise: ${prac.today} today`), el('span', undefined, `About ${minutesFor(prac.today)} minutes. New lines join after each lesson.`));
        const start = el('button', 'kos-btn', 'Start');
        start.type = 'button';
        start.addEventListener('click', showPractice);
        box.append(text, start);
        parts.push(box);
      } else {
        const box = el('div', 'kos-prac kos-prac--calm');
        const text = el('div');
        text.append(el('b', undefined, 'Practise: 0 today'), el('span', undefined, nextCardsLine(prac.next)));
        box.append(text);
        parts.push(box);
      }
    }

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
