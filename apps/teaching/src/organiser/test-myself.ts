/**
 * Test myself: Read, Cover, Check, for one section of the sheet.
 * Everything lives in this closure for the sitting. Nothing is saved, not even to local storage.
 */
import { el } from '@/quiz/dom';
import type { SheetSection } from './types';

const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';
type Step = 'sheet' | 'read' | 'cover' | 'check';

export type TestMyselfHandle = { dispose(): void };

function stepper(step: Step): HTMLElement {
  const ol = el('ol', 'kos-steps');
  for (const [k, n] of [['read', 'Read'], ['cover', 'Cover'], ['check', 'Check']] as const) {
    const li = el('li', undefined, n);
    if (k === step) li.setAttribute('aria-current', 'step');
    ol.append(li);
  }
  return ol;
}

function btn(text: string, kind: 'primary' | 'plain' | 'quiet', onClick: () => void): HTMLButtonElement {
  const b = el('button', `kos-btn${kind === 'primary' ? ' kos-btn--primary' : kind === 'quiet' ? ' kos-btn--quiet' : ''}`, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function mountTestMyself(host: HTMLElement, section: SheetSection): TestMyselfHandle {
  const table = section.kind === 'table' && !!section.columns?.length;
  const cols = section.columns ?? [];
  let step: Step = 'sheet';
  let hide = new Set<number>(cols.flatMap((c, i) => (c.hide ? [i] : [])));
  /** Rows already recalled in an earlier round: they stay uncovered. */
  let keep = new Set<number>();
  let got = new Set<number>();
  let wrote: Record<string, string> = {};
  let free = '';
  let disposed = false;

  const rows = section.lines.map((l) => l.cells);

  const go = (next: Step): void => {
    step = next;
    paint();
  };
  const covering = (r: number): boolean => hide.size > 0 && !keep.has(r);

  function tableView(): HTMLElement {
    const wrap = el('div', 'kos-scroll');
    const t = el('table', 'kos-t');
    const headRow = el('tr');
    for (const c of cols) {
      const th = el('th', undefined, c.label);
      th.scope = 'col';
      headRow.append(th);
    }
    if (step === 'check') headRow.append(el('th', 'kos-tick-col', 'Got it'));
    const thead = el('thead');
    thead.append(headRow);
    t.append(thead);
    const body = el('tbody');
    rows.forEach((row, r) => {
      const tr = el('tr');
      const cov = covering(r);
      if (step === 'check') tr.className = got.has(r) || !cov ? 'is-got' : 'is-open';
      cols.forEach((c, ci) => {
        const text = row[ci] ?? '';
        const td = el('td');
        td.dataset.label = c.label;
        const covered = cov && hide.has(ci);
        if (step === 'read' && covered) {
          td.className = 'is-hidden';
          td.textContent = text;
        } else if (step === 'cover' && covered) {
          td.className = 'is-write';
          const ta = el('textarea');
          ta.setAttribute('aria-label', `${c.label}, row ${r + 1}`);
          ta.value = wrote[`${r}:${ci}`] ?? '';
          ta.addEventListener('input', () => (wrote[`${r}:${ci}`] = ta.value));
          td.append(ta);
        } else if (step === 'check' && covered) {
          const w = (wrote[`${r}:${ci}`] ?? '').trim();
          td.append(el('span', `kos-wrote${w ? '' : ' kos-wrote--none'}`, w || 'Left for next round'), el('span', 'kos-answer', text));
        } else td.textContent = text;
        tr.append(td);
      });
      if (step === 'check') {
        const td = el('td', 'kos-tick-col');
        if (cov) {
          const tick = el('button', 'kos-tick');
          tick.type = 'button';
          tick.setAttribute('aria-label', `I got row ${r + 1}`);
          tick.setAttribute('aria-pressed', String(got.has(r)));
          tick.innerHTML = TICK;
          tick.addEventListener('click', () => {
            if (got.has(r)) got.delete(r);
            else got.add(r);
            paint();
          });
          td.append(tick);
        } else {
          const m = el('span', 'kos-tickmark');
          m.innerHTML = TICK;
          td.append(m);
        }
        tr.append(td);
      }
      body.append(tr);
    });
    t.append(body);
    wrap.append(t);
    return wrap;
  }

  const linesOf = (): string[] => section.lines.map((l) => l.cells[0] ?? '');

  function paint(): void {
    if (disposed) return;
    const out: HTMLElement[] = [];
    if (step !== 'sheet') out.push(stepper(step));
    const actions = el('div', 'kos-actions');
    const total = rows.length;

    if (step === 'sheet') {
      if (table) out.push(tableView());
      else out.push(listView(false));
      actions.append(btn('Test myself', 'primary', () => go('read')));
    }
    if (step === 'read') {
      out.push(el('p', 'kos-hint', table ? 'Read it through slowly, headings too. Then choose what to hide.' : 'Follow it through from first to last.'));
      if (table) {
        const pills = el('div', 'kos-pills');
        pills.append(el('span', 'kos-pills__label', 'Hide:'));
        cols.forEach((c, i) => {
          const p = el('button', 'kos-pill', c.label);
          p.type = 'button';
          p.setAttribute('aria-pressed', String(hide.has(i)));
          p.addEventListener('click', () => {
            if (hide.has(i)) hide.delete(i);
            else hide.add(i);
            paint();
          });
          pills.append(p);
        });
        out.push(pills, tableView());
      } else out.push(listView(false));
      const cover = btn('Cover it', 'primary', () => go('cover'));
      cover.disabled = table && hide.size === 0;
      actions.append(cover, btn('Back to the sheet', 'quiet', () => go('sheet')));
    }
    if (step === 'cover') {
      if (table) {
        out.push(el('p', 'kos-hint', 'Write what you can remember. Short notes are fine.'), tableView());
      } else {
        out.push(el('p', 'kos-hint', section.kind === 'sequence' ? 'Type the events in the order they happen, one on each line.' : 'Type what you can remember, one idea on each line.'));
        const ta = el('textarea', 'kos-write');
        ta.setAttribute('aria-label', `${section.name} from memory`);
        ta.value = free;
        ta.addEventListener('input', () => (free = ta.value));
        out.push(ta);
      }
      actions.append(btn('Check', 'primary', () => go('check')));
    }
    if (step === 'check') {
      if (table) {
        out.push(el('p', 'kos-hint', 'Compare, and tick each row you recalled.'), tableView());
        const done = new Set([...keep, ...got]);
        const remaining = done.size < total;
        const msg = !remaining
          ? 'You recalled all of it. Come back in a few days and see what stays.'
          : got.size
            ? `You recalled ${got.size} more this round. Go again on the rest.`
            : '';
        if (msg) {
          const tally = el('p', 'kos-tally', msg);
          tally.setAttribute('role', 'status');
          out.push(tally);
        }
        if (remaining)
          actions.append(
            btn('Go again', 'primary', () => {
              keep = new Set([...keep, ...got]);
              got = new Set();
              wrote = {};
              go('cover');
            })
          );
        actions.append(btn('Cover everything', remaining ? 'plain' : 'primary', () => {
          keep = new Set();
          got = new Set();
          wrote = {};
          go('cover');
        }));
      } else {
        const mine = free.trim();
        out.push(el('p', 'kos-hint', 'Compare your lines with the sheet.'));
        if (mine) {
          const block = el('div', 'kos-wroteblock');
          block.append(el('b', undefined, 'You wrote'), document.createTextNode(mine));
          out.push(block);
        }
        out.push(listView(true));
        actions.append(btn('Cover everything', 'primary', () => {
          free = '';
          go('cover');
        }));
      }
      actions.append(btn('Done for now', 'quiet', () => go('sheet')));
    }
    out.push(actions);
    host.replaceChildren(...out);
  }

  function listView(answer: boolean): HTMLElement {
    const sequence = section.kind === 'sequence';
    if (sequence) {
      const ol = el('ol', 'kos-flow');
      linesOf().forEach((t, i) => {
        const li = el('li');
        li.append(el('span', 'kos-n', String(i + 1)), el('span', answer ? 'kos-answer' : undefined, t));
        ol.append(li);
      });
      return ol;
    }
    const ul = el('ul', 'kos-bullets');
    for (const t of linesOf()) ul.append(el('li', answer ? 'kos-answer' : undefined, t));
    return ul;
  }

  paint();
  return {
    dispose() {
      disposed = true;
      host.replaceChildren();
    }
  };
}
