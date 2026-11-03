/** The Organiser tab on the student's progress page. */
import { el } from '@/quiz/dom';
import { printOrganiser } from './print';
import { mountPractice, nextCardsLine, type PracticeApi } from './practice';
import { mountTestMyself, type TestMyselfHandle } from './test-myself';
import type { OrganiserLoad, Sheet, SheetSection } from './types';
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

  function foldFor(sec: SheetSection): HTMLElement {
    const fold = el('div', 'kos-fold');
    const head = el('button', 'kos-fold__head');
    head.type = 'button';
    const fresh = sec.lines.filter((l) => l.fresh).length;
    const name = el('span');
    name.append(el('b', undefined, sec.name));
    if (fresh) name.append(el('span', 'kos-new', `${fresh} new`));
    head.append(name, el('span', 'kos-fold__meta', String(sec.lines.length)));
    let body: HTMLElement | null = null;
    const sync = (): void => {
      const on = open.has(sec.id);
      head.setAttribute('aria-expanded', String(on));
      if (on && !body) {
        body = el('section', 'kos-sec');
        body.dataset.sec = sec.id;
        live.set(sec.id, mountTestMyself(body, sec));
        fold.append(body);
      } else if (!on && body) {
        live.get(sec.id)?.dispose();
        live.delete(sec.id);
        body.remove();
        body = null;
      }
    };
    head.addEventListener('click', () => {
      if (open.has(sec.id)) open.delete(sec.id);
      else open.add(sec.id);
      sync();
    });
    fold.append(head);
    sync();
    return fold;
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

    const folds = el('div', 'kos-folds');
    for (const sec of sheet.sections) folds.append(foldFor(sec));
    parts.push(folds);

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
