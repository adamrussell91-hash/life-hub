import './unit-section.css';
import { createGlyphSet } from '../../../../../packages/design-kit/js/glyph-set.js';
import { CATALOGUE, SERIES, techniqueById } from '../../../../../packages/walkthrus/catalogue.mjs';
import { SYMBOL_SVGS } from '../../../../../packages/walkthrus/glyphs';
import type { Unit, WalkthruTie } from '@/schemas';
import type { DeepUnderstanding } from '@/deep/schema';
import { listAllReps, type Rep } from './api';
import { renderStepsInto } from './note';
import { ORGANISER_TIES, walkthruRows, withHow, type UnitLesson, type WalkthruRow, type WalkthruUse } from './unit-uses';

/**
 * WalkThrus in this unit: only the techniques in use, what each is tied to, and how it's being used.
 * Lesson blocks choose a technique in their own menu; the unit adds ties to its deep understandings
 * and organiser, and a how line for any use. Teacher view only: the published unit never carries ties.
 */

export interface UnitWalkthrusOptions {
  unit: Unit;
  lessons: Promise<UnitLesson[]>;
  save: (ties: WalkthruTie[]) => Promise<void>;
  onOpenLesson: (lessonId: string) => void;
}

const SAVE_DELAY_MS = 500;
const HOW_LIMIT = 200;
const STATE_WORD = { ran: 'Ran', partly: 'Partly', skipped: 'Didn’t get to it', planned: 'Planned' } as const;
const glyphs = createGlyphSet({ svgs: SYMBOL_SVGS, labelOf: (id: string) => techniqueById(id)?.name ?? id, className: 'wtu-hex' });

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(label: string, onClick: () => void, quiet = false): HTMLButtonElement {
  const node = h('button', `wtu__link${quiet ? ' wtu__link--quiet' : ''}`, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

export function mountUnitWalkthrus(host: HTMLElement, options: UnitWalkthrusOptions): { refresh(): void; dispose(): void } {
  const { unit } = options;
  const root = h('div', 'wtu');
  host.replaceChildren(root);

  let lessons: UnitLesson[] | null = null;
  let reps: Rep[] = [];
  let ties: WalkthruTie[] = (unit.walkthru_ties ?? []).slice();
  let adding: { technique?: string } | null = null;
  let message = '';
  let bad = false;
  let timer: number | undefined;
  let disposed = false;
  const open = new Set<string>();
  const stepsOpen = new Set<string>();

  const deep = (): DeepUnderstanding[] => (unit.deep_understandings ?? []) as DeepUnderstanding[];

  function say(text: string, isBad = false): void {
    message = text;
    bad = isBad;
    const line = root.querySelector('.wtu__msg');
    if (line) {
      line.textContent = text;
      line.classList.toggle('wtu__msg--bad', isBad);
    }
  }

  function flush(): void {
    window.clearTimeout(timer);
    timer = undefined;
    const sent = ties;
    options.save(sent).then(
      () => { if (ties === sent) say(''); },
      () => say('That didn’t save. Your changes are still on this page; try again.', true)
    );
  }

  function keep(next: WalkthruTie[], wait = 0): void {
    ties = next;
    say('Saving…');
    window.clearTimeout(timer);
    if (wait) timer = window.setTimeout(flush, wait);
    else flush();
  }

  function howField(row: WalkthruRow, use: WalkthruUse): HTMLTextAreaElement {
    const field = h('textarea', 'wtu-use__field');
    field.rows = 1;
    field.maxLength = HOW_LIMIT;
    field.value = use.how;
    field.placeholder = 'How you’re using it (optional)';
    field.setAttribute('aria-label', `How you’re using ${row.name} in ${use.where}`);
    const fit = (): void => {
      field.style.height = 'auto';
      if (field.scrollHeight) field.style.height = `${field.scrollHeight}px`;
    };
    field.addEventListener('input', () => {
      fit();
      keep(withHow(ties, row.technique, use.tie, field.value), SAVE_DELAY_MS);
    });
    field.addEventListener('change', () => { if (timer !== undefined) flush(); });
    requestAnimationFrame(fit);
    return field;
  }

  function useRow(row: WalkthruRow, use: WalkthruUse): HTMLElement {
    const box = h('div', 'wtu-use');
    const where = h('div', 'wtu-use__where');
    const lessonId = use.lesson_id;
    where.append(lessonId ? link(use.where, () => options.onOpenLesson(lessonId)) : h('span', 'wtu-use__name', use.where));
    if (use.sub) where.append(h('small', undefined, use.sub));
    const how = h('div', 'wtu-use__how');
    how.append(howField(row, use));
    if (use.note) how.append(h('span', 'wtu-use__note', `My notes: ${use.note}`));
    const right = h('div', 'wtu-use__right');
    if (use.state) right.append(h('span', `wtu-state wtu-state--${use.state}`, STATE_WORD[use.state]));
    if (use.tie.kind !== 'block') {
      const off = link('Take off', () => {
        keep(ties.filter((t) => !(t.technique === row.technique && t.kind === use.tie.kind && t.ref === use.tie.ref)));
        render();
      }, true);
      off.setAttribute('aria-label', `Take ${row.name} off ${use.where}`);
      right.append(off);
    }
    box.append(where, how, right);
    return box;
  }

  function rowCard(row: WalkthruRow): HTMLElement {
    const card = h('article', 'wtu-row');
    card.dataset.set = String(row.set);
    const on = open.has(row.technique);
    const top = h('button', 'wtu-row__top');
    top.type = 'button';
    top.setAttribute('aria-expanded', String(on));
    const middle = h('span');
    middle.append(h('span', 'wtu-row__name', row.name));
    const chips = h('span', 'wtu-chips');
    for (const chip of row.chips) chips.append(h('span', `wtu-chip wtu-chip--${chip.kind}`, chip.label));
    middle.append(chips);
    top.append(glyphs.element(row.technique), middle, h('span', 'wtu-row__count', row.count), h('span', 'wtu-row__chev', on ? '▾' : '▸'));
    top.addEventListener('click', () => {
      if (on) open.delete(row.technique);
      else open.add(row.technique);
      render();
    });
    card.append(top);
    if (!on) return card;

    const body = h('div', 'wtu-row__body');
    for (const use of row.uses) body.append(useRow(row, use));
    const foot = h('div', 'wtu-row__foot');
    const stepsShown = stepsOpen.has(row.technique);
    foot.append(
      link(stepsShown ? 'Close the five steps' : 'Open the five steps', () => {
        if (stepsShown) stepsOpen.delete(row.technique);
        else stepsOpen.add(row.technique);
        render();
      }),
      link('Tie to something else', () => {
        adding = { technique: row.technique };
        render();
      })
    );
    body.append(foot);
    if (stepsShown) {
      const steps = h('div', 'wtu-steps');
      renderStepsInto(steps, row.technique, {});
      body.append(steps);
    }
    card.append(body);
    return card;
  }

  function adder(): HTMLElement {
    const box = h('div', 'wtu-add');
    const pickLabel = h('label', undefined, 'WalkThru');
    const pick = h('select');
    for (const series of SERIES) {
      const entries = CATALOGUE.filter((e) => e.kind === 'technique' && e.series === series.key).sort((a, b) => a.name.localeCompare(b.name));
      if (!entries.length) continue;
      const group = h('optgroup');
      group.label = series.name;
      for (const entry of entries) group.append(new Option(entry.name, entry.id));
      pick.append(group);
    }
    if (adding?.technique) pick.value = adding.technique;
    pickLabel.append(pick);
    const tieLabel = h('label', undefined, 'Tie it to');
    const tie = h('select');
    deep().forEach((d, i) => tie.append(new Option(`Deep understanding ${i + 1}`, `du|${d.id}`)));
    for (const o of ORGANISER_TIES) tie.append(new Option(o.label, `organiser|${o.ref}`));
    tieLabel.append(tie);
    const add = h('button', 'btn btn--primary', 'Add');
    add.type = 'button';
    add.addEventListener('click', () => {
      const [kind, ...rest] = tie.value.split('|');
      const ref = rest.join('|');
      const technique = pick.value;
      const held = ties.some((t) => t.technique === technique && t.kind === kind && t.ref === ref);
      if (!held) keep([...ties, { technique, kind: kind as 'du' | 'organiser', ref }]);
      open.add(technique);
      adding = null;
      render();
    });
    box.append(pickLabel, tieLabel, add, link('Cancel', () => { adding = null; render(); }, true));
    return box;
  }

  function render(): void {
    if (disposed) return;
    root.replaceChildren();
    const head = h('div', 'wtu__head');
    head.append(h('h2', 'wtu__title', 'WalkThrus in this unit'));
    if (lessons) {
      head.append(link('+ Add a WalkThru', () => {
        adding = adding ? null : {};
        render();
      }));
    }
    root.append(head);
    const line = h('p', `wtu__msg${bad ? ' wtu__msg--bad' : ''}`, message);
    line.setAttribute('role', 'status');
    if (!lessons) {
      line.textContent = 'Reading the lessons…';
      root.append(line);
      return;
    }
    if (adding) root.append(adder());
    const rows = walkthruRows(lessons, deep(), ties, reps);
    if (!rows.length) {
      root.append(h('p', 'wtu__empty', 'No WalkThrus on this unit yet. Pick one for a lesson block from its ⋮ menu and it appears here, or add one for the whole unit.'));
    } else {
      const list = h('div', 'wtu__list');
      for (const row of rows) list.append(rowCard(row));
      root.append(list);
    }
    root.append(line);
  }

  render();
  void Promise.all([options.lessons, listAllReps().catch((): Rep[] => [])]).then(([read, logged]) => {
    lessons = read;
    reps = logged;
    render();
  });

  return {
    refresh() {
      // Never redraw under someone typing a how line.
      if (root.contains(document.activeElement) && document.activeElement?.tagName === 'TEXTAREA') return;
      render();
    },
    dispose() {
      if (timer !== undefined) flush();
      disposed = true;
      root.remove();
    }
  };
}
