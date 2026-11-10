import { button, el } from '@/blocks/peer-feedback-ui';
import { loadActivityState, saveActivityState, storageKey } from '@/blocks/learning-activity';
import { keepInitials, savedInitials, sendThinking } from '@/blocks/thinking-client';
import type { RenderContext } from '@/blocks/render';
import type { VennBlock } from './index';
import {
  byRegion, cleanState, fillFrame, isShared, MAX_POINTS, pointComplete, regionLabel, regionTexts, regionsFor,
  shouldNudge, textCount, textLabel, trimToRegion, withPreload, type Depth, type Region, type VennPoint, type VennState
} from './model';
import { depthTally, drawDiagram, gapList, legend, pointBody, regionCounts, regionTag } from './diagram';

/** How long after the last change the Venn goes to the teacher. */
export const SEND_DELAY_MS = 1500;

let seq = 0;
const uid = (prefix: string) => `${prefix}-${++seq}`;

function labelledArea(label: string, value: string, rows: number, max: number, onInput: (v: string) => void, placeholder = ''): HTMLElement {
  const id = uid('venn-f');
  const wrap = el('div', 'pf-field');
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const box = el('textarea', 'pf-field__input');
  box.id = id;
  box.rows = rows;
  box.maxLength = max;
  box.value = value;
  box.placeholder = placeholder;
  box.addEventListener('input', () => onInput(box.value));
  wrap.append(lab, box);
  return wrap;
}

function choiceRow<T extends string>(label: string, options: Array<{ value: T; label: string }>, value: T | null, onPick: (v: T) => void): HTMLElement {
  const wrap = el('div', 'pf-field');
  const head = el('p', 'pf-field__label', label);
  head.id = uid('venn-g');
  const row = el('div', 'venn-choices');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-labelledby', head.id);
  const paint = (current: T | null) => {
    for (const b of row.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.value === current));
  };
  for (const o of options) {
    const b = el('button', 'venn-choice', o.label);
    b.type = 'button';
    b.dataset.value = o.value;
    b.addEventListener('click', () => {
      paint(o.value);
      onPick(o.value);
    });
    row.append(b);
  }
  paint(value);
  wrap.append(head, row);
  return wrap;
}

const DEPTHS: Array<{ value: Depth; label: string }> = [
  { value: 'surface', label: 'Surface: plot, feature' },
  { value: 'deep', label: 'Deep: idea, concept, purpose' }
];

export function mountStudent(block: VennBlock, ctx: RenderContext): HTMLElement {
  const { content } = block;
  const count = textCount(content.texts);
  const labels = content.texts.map((t) => t.label);
  const regions = regionsFor(count);
  const scope = ctx.lessonId ?? ctx.saveScope;
  const key = scope ? `${storageKey(scope, block.id)}.venn` : null;
  const stored = cleanState(key ? loadActivityState<unknown>(key) : null, count);
  const state: VennState = { points: withPreload(stored.points, content.preload), synthesis: stored.synthesis };

  let picked: Region | null = null;
  let editing: string | null = null;
  let adding = false;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;

  const root = el('div', 'venn-student');

  // Initials: the teacher's list needs them.
  let initialsBox: HTMLInputElement | null = null;
  if (ctx.lessonId) {
    const wrap = el('div', 'pf-field venn-initials');
    const lab = el('label', 'pf-field__label', 'Your initials');
    const box = el('input', 'pf-field__input venn-initials__input');
    box.id = uid('venn-initials');
    lab.htmlFor = box.id;
    box.type = 'text';
    box.maxLength = 4;
    box.autocomplete = 'off';
    box.placeholder = 'e.g. JS';
    box.value = savedInitials();
    box.addEventListener('change', () => {
      box.value = keepInitials(box.value);
      if (hasWork()) schedule();
    });
    wrap.append(lab, el('p', 'pf-field__hint block-secondary', 'Your teacher sees your initials beside your Venn.'), box);
    initialsBox = box;
    root.append(wrap);
  }

  const board = el('div', 'venn-board');
  const diagramHost = el('div', 'venn-board__diagram');
  const depthHost = el('div', 'venn-board__depth');
  depthHost.setAttribute('aria-live', 'polite');

  // Synthesis: kept outside the repaint so typing keeps focus.
  const frameText = fillFrame(content.synthesis_frame, labels);
  const synthesis = el('div', 'venn-synthesis');
  const synthId = uid('venn-synth');
  const synthLabel = el('label', 'pf-field__label', 'Your synthesis sentence');
  synthLabel.htmlFor = synthId;
  const synthBox = el('textarea', 'pf-field__input venn-synthesis__input');
  synthBox.id = synthId;
  synthBox.rows = 3;
  synthBox.maxLength = 600;
  synthBox.value = state.synthesis ?? frameText;
  synthBox.addEventListener('input', () => {
    state.synthesis = synthBox.value;
    save();
  });
  synthesis.append(synthLabel, el('p', 'pf-field__hint block-secondary', 'Pull the comparison together in one sentence: what the texts share, then how they differ.'), synthBox);

  const tray = el('section', 'venn-tray');
  const addHost = el('div', 'venn-add');
  const columns = el('div', `venn-columns venn-columns--${count >= 3 ? 'three' : 'two'}`);
  const status = el('p', 'venn-status block-secondary');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  board.append(diagramHost, legend(count, labels), depthHost, synthesis);
  root.append(board, tray, addHost, columns, status);

  function hasWork(): boolean {
    return state.points.some((p) => !p.preload || p.region) || state.synthesis !== null;
  }

  function payload(): { points: VennPoint[]; synthesis: string } {
    return {
      points: state.points.filter((p) => p.text.trim()).map(trimToRegion),
      synthesis: state.synthesis ?? ''
    };
  }

  function save(): void {
    if (key) saveActivityState(key, { points: state.points, synthesis: state.synthesis });
    schedule();
  }

  function schedule(): void {
    if (!ctx.lessonId) return;
    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = setTimeout(send, SEND_DELAY_MS);
  }

  function send(): void {
    sendTimer = null;
    if (!ctx.lessonId) return;
    status.replaceChildren(document.createTextNode('Sending to your teacher…'));
    const initials = initialsBox ? keepInitials(initialsBox.value) : '';
    sendThinking(ctx.lessonId, block.id, initials, payload())
      .then(() => {
        status.replaceChildren(document.createTextNode(initials ? 'Saved for your teacher' : 'Saved for your teacher. Add your initials so they know it is yours.'));
      })
      .catch(() => {
        const retry = button('Try again', 'ghost', () => send());
        retry.classList.add('venn-status__retry');
        status.replaceChildren(document.createTextNode('Kept on this device. Try again to send it to your teacher. '), retry);
      });
  }

  function commit(): void {
    save();
    paint();
  }

  function update(id: string, patch: Partial<VennPoint>): void {
    state.points = state.points.map((p) => (p.id === id ? { ...p, ...patch } : p));
  }

  /* ── The add / edit form ───────────────────────────────────────── */

  function pointForm(start: VennPoint, isNew: boolean, done: (point: VennPoint | null) => void): HTMLElement {
    const draft: VennPoint = { ...start, quotes: { ...start.quotes }, differs: { ...start.differs } };
    const form = el('div', 'venn-form');
    form.setAttribute('role', 'group');
    form.setAttribute('aria-label', isNew ? 'Add a point' : 'Edit point');
    const alert = el('p', 'pf-alert');
    alert.hidden = true;
    if (draft.preload) {
      form.append(el('p', 'venn-form__given', draft.text));
    } else {
      form.append(labelledArea('Your point', draft.text, 2, 300, (v) => (draft.text = v), 'Both texts open with someone keeping time'));
    }
    const notes = el('div', 'venn-form__notes');
    const paintNotes = () => {
      const parts: HTMLElement[] = [];
      if (draft.region) for (const k of regionTexts(draft.region)) {
        const name = textLabel(k, labels);
        if (isShared(draft.region)) {
          parts.push(labelledArea(`How does ${name} treat it?`, draft.differs[k] ?? '', 2, 400, (v) => (draft.differs = { ...draft.differs, [k]: v })));
        }
        parts.push(labelledArea(`Quotation from ${name} (optional)`, draft.quotes[k] ?? '', 1, 300, (v) => (draft.quotes = { ...draft.quotes, [k]: v })));
      }
      if (isShared(draft.region)) parts.unshift(el('p', 'pf-field__hint block-secondary', 'A shared point says how each text treats it: that is where the comparison is.'));
      notes.replaceChildren(...parts);
    };
    form.append(
      choiceRow('Where does it go?', regions.map((r) => ({ value: r, label: regionLabel(r, labels, count) })), draft.region, (r) => {
        draft.region = r;
        paintNotes();
      }),
      choiceRow('Level', DEPTHS, draft.depth, (d) => (draft.depth = d)),
      notes,
      alert
    );
    paintNotes();
    const actions = el('div', 'pf-actions');
    actions.append(
      button(isNew ? 'Add point' : 'Save point', 'primary', () => {
        if (!draft.text.trim()) {
          alert.textContent = 'Write your point, then add it.';
          alert.hidden = false;
          return;
        }
        done(draft);
      }),
      button('Cancel', 'ghost', () => done(null))
    );
    form.append(actions);
    return form;
  }

  /* ── Painting ──────────────────────────────────────────────────── */

  function pointCard(point: VennPoint): HTMLElement {
    if (editing === point.id) {
      return pointForm(point, false, (next) => {
        editing = null;
        if (next) update(point.id, next);
        commit();
      });
    }
    const complete = pointComplete(point);
    const card = el('article', `venn-point${complete ? '' : ' venn-point--open'}`);
    card.dataset.pointId = point.id;
    card.append(...pointBody(point, labels));
    const gaps = gapList(point, labels);
    if (gaps) card.append(gaps);
    const actions = el('div', 'venn-point__actions');
    const edit = button(point.preload ? 'Edit or move' : 'Edit', 'ghost', () => {
      editing = point.id;
      adding = false;
      paint();
      columns.querySelector<HTMLElement>('.venn-form textarea, .venn-form button')?.focus();
    });
    edit.setAttribute('aria-label', `${point.preload ? 'Edit or move' : 'Edit'}: ${point.text}`);
    actions.append(edit);
    if (!point.preload) {
      const remove = button('Remove', 'ghost', () => {
        state.points = state.points.filter((p) => p.id !== point.id);
        commit();
      });
      remove.setAttribute('aria-label', `Remove: ${point.text}`);
      actions.append(remove);
    }
    card.append(actions);
    return card;
  }

  function paintTray(): void {
    const waiting = state.points.filter((p) => p.preload && !p.region);
    tray.hidden = !waiting.length;
    if (!waiting.length) {
      tray.replaceChildren();
      return;
    }
    const list = el('div', 'venn-tray__list');
    for (const p of waiting) {
      const card = el('article', 'venn-point venn-point--tray');
      card.dataset.pointId = p.id;
      card.append(el('p', 'venn-point__text', p.text));
      const row = el('div', 'venn-choices venn-tray__place');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', `Place: ${p.text}`);
      for (const r of regions) {
        const b = el('button', 'venn-choice', regionLabel(r, labels, count));
        b.type = 'button';
        b.dataset.value = r;
        b.addEventListener('click', () => {
          update(p.id, { region: r });
          editing = p.id;
          adding = false;
          commit();
        });
        row.append(b);
      }
      card.append(row);
      list.append(card);
    }
    tray.replaceChildren(
      el('h4', 'venn-tray__title block-subtitle', `To sort · ${waiting.length}`),
      el('p', 'block-secondary', 'Place each point in the Venn, then tag it and add your notes.'),
      list
    );
  }

  function paintAdd(): void {
    const own = state.points.filter((p) => !p.preload).length;
    if (adding) {
      const fresh: VennPoint = { id: `p${Date.now().toString(36)}${++seq}`, text: '', region: picked, depth: null, quotes: {}, differs: {} };
      addHost.replaceChildren(pointForm(fresh, true, (next) => {
        adding = false;
        if (next) state.points = [...state.points, next];
        commit();
      }));
      return;
    }
    if (own >= MAX_POINTS) {
      addHost.replaceChildren(el('p', 'block-secondary', `${MAX_POINTS} points is the most one Venn holds. Edit one to sharpen it.`));
      return;
    }
    const add = button('+ Add a point', 'secondary', () => {
      adding = true;
      editing = null;
      paint();
      addHost.querySelector<HTMLElement>('textarea')?.focus();
    });
    add.classList.add('venn-add__open');
    addHost.replaceChildren(add);
  }

  function paintColumns(): void {
    const groups = byRegion(state.points, count);
    const parts: HTMLElement[] = [];
    for (const [region, list] of groups) {
      if (picked && picked !== region) continue;
      const col = el('section', `venn-column venn-column--${region.length > 1 ? 'shared' : region}`);
      col.dataset.region = region;
      col.setAttribute('aria-label', regionLabel(region, labels, count));
      const head = el('h4', 'venn-column__head');
      head.append(el('span', 'venn-column__tag', regionTag(region)), document.createTextNode(` ${regionLabel(region, labels, count)}`));
      col.append(head);
      if (!list.length) col.append(el('p', 'venn-column__empty block-secondary', 'Add a point here.'));
      for (const p of list) col.append(pointCard(p));
      parts.push(col);
    }
    if (picked) {
      const all = button('Show every region', 'ghost', () => {
        picked = null;
        paint();
      });
      all.classList.add('venn-columns__all');
      parts.unshift(all);
    }
    columns.classList.toggle('venn-columns--picked', !!picked);
    columns.replaceChildren(...parts);
  }

  function paint(): void {
    diagramHost.replaceChildren(drawDiagram({
      count, labels, counts: regionCounts(state.points, count), picked,
      onPick: (region) => {
        picked = picked === region ? null : region;
        paint();
        const target = columns.querySelector<HTMLElement>(`[data-region="${region}"]`);
        target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      }
    }));
    const depth: HTMLElement[] = [depthTally(state.points)];
    if (shouldNudge(state.points, content.nudge)) {
      depth.push(el('p', 'venn-nudge', 'Add a point about an idea, a concept or a purpose: deep points carry the comparison.'));
    }
    depthHost.replaceChildren(...depth);
    paintTray();
    paintAdd();
    paintColumns();
  }

  paint();
  return root;
}
