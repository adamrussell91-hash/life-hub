// The fuse bench: build a new technique from two or three on the board. Left, each parent's steps
// with "+ Use"; right, the fusion's own steps to reorder, rename and loop. Save, then (if Adam says
// yes) Claude draws its figure. Step text arrives at runtime through `stepsOf`; nothing is stored here.
import '../styles/walkthrus-fuse.css';
import type { Fusion, FusionStep } from '../../../../packages/walkthrus/board/fused';
import { fusedTileSvg } from '../../../../packages/walkthrus/board/fused';
import {
  draftProblem, draftToFusion, editStep, fromChip, isUsed, loopOptions, MAX_STEPS, moveStep, ownStep, removeStep, setLoop, stepHint, useStep,
  type SourceStep
} from '@/views/walkthrus-fuse-steps';

export interface FuseBenchOptions {
  /** Two or three technique ids. */
  parents: string[];
  clusterId: string | null;
  existing?: Fusion;
  /** The book's steps for a technique, loaded at runtime (private text). */
  stepsOf: (id: string) => Promise<Array<{ label: string; text: string }>>;
  titleOf: (id: string) => string;
  /** The book number shown in the tile tab, e.g. "90". */
  codeOf: (id: string) => string;
  onSave: (fusion: Fusion) => Promise<void>;
  onDraw: (fusion: Fusion, note?: string) => Promise<Fusion>;
  host?: HTMLElement;
  onClose?: () => void;
}

export interface FuseBench { root: HTMLElement; close: () => void }

export const DRAW_COST_TEXT = 'About A$0.10–0.25';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, className = 'btn btn--secondary', label?: string): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
}

function option(text: string, value: string): HTMLOptionElement {
  const o = el('option', undefined, text);
  o.value = value;
  return o;
}

let uid = 0;
function field(labelText: string, control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, className = 'wt-fuse__field'): HTMLLabelElement {
  const id = `wt-fuse-${++uid}`;
  control.id = id;
  const label = el('label', className);
  label.htmlFor = id;
  label.append(el('span', 'wt-fuse__label', labelText), control);
  return label;
}

export function openFuseBench(opts: FuseBenchOptions): FuseBench {
  const host = opts.host ?? document.body;
  const parents = opts.parents.slice(0, 3);
  const sources = new Map<string, SourceStep[]>();
  let steps: FusionStep[] = opts.existing ? opts.existing.steps.map((s) => ({ ...s, from: s.from ? { ...s.from } : null })) : [];
  let saved: Fusion | null = opts.existing ?? null;
  let busy = false;

  const previous = document.activeElement as HTMLElement | null;
  const root = el('div', 'wt-fuse');
  const sheet = el('div', 'wt-fuse__sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const titleId = `wt-fuse-title-${++uid}`;
  sheet.setAttribute('aria-labelledby', titleId);
  root.append(sheet);

  // Head
  const head = el('header', 'wt-fuse__head');
  const heading = el('div');
  heading.append(el('p', 'wt-fuse__kicker', `Fuse · ${parents.map(opts.codeOf).join(' + ')}`));
  const title = el('h2', 'wt-fuse__title', parents.map(opts.titleOf).join(' + '));
  title.id = titleId;
  heading.append(title);
  const closeBtn = button('Close', 'wt-fuse__close');
  head.append(heading, closeBtn);

  // Left: the parents' steps
  const left = el('section', 'wt-fuse__sources');
  left.setAttribute('aria-label', 'Steps to use');
  const sourceLists = el('div', 'wt-fuse__parents');
  const own = button('+ A step of your own', 'wt-fuse__own btn btn--secondary');
  left.append(sourceLists, own);

  // Right: the fusion
  const right = el('section', 'wt-fuse__build');
  right.setAttribute('aria-label', 'Your fused technique');
  const name = el('input', 'wt-fuse__input');
  name.type = 'text';
  name.maxLength = 60;
  name.required = true;
  name.value = opts.existing?.name ?? '';
  name.placeholder = 'e.g. Call, then say it better';
  const why = el('input', 'wt-fuse__input');
  why.type = 'text';
  why.maxLength = 140;
  why.value = opts.existing?.why ?? '';
  why.placeholder = 'One line, shown above its Proof';
  const hint = el('p', 'wt-fuse__hint');
  hint.setAttribute('aria-live', 'polite');
  const list = el('ol', 'wt-fuse__steps');
  right.append(field('Name', name), field('Why fuse them?', why), hint, list);

  const grid = el('div', 'wt-fuse__grid');
  grid.append(left, right);

  // Foot: status, save, draw
  const foot = el('footer', 'wt-fuse__foot');
  const status = el('p', 'wt-fuse__status');
  status.setAttribute('role', 'status');
  const preview = el('div', 'wt-fuse__preview');
  const actions = el('div', 'wt-fuse__actions');
  const saveBtn = button('Save', 'btn btn--primary');
  actions.append(saveBtn);
  const drawBox = el('div', 'wt-fuse__draw');
  foot.append(preview, status, actions, drawBox);

  sheet.append(head, grid, foot);
  host.append(root);

  const sourceFor = (s: FusionStep): SourceStep | null => (s.from ? sources.get(s.from.id)?.find((x) => x.n === s.from!.n) ?? null : null);
  const setStatus = (text: string): void => { status.textContent = text; };

  function renderSources(): void {
    sourceLists.replaceChildren();
    for (const id of parents) {
      const box = el('div', 'wt-fuse__parent');
      box.append(el('h3', 'wt-fuse__parent-title', `${opts.codeOf(id)} · ${opts.titleOf(id)}`));
      const src = sources.get(id);
      if (!src) { box.append(el('p', 'wt-fuse__muted', 'Loading steps…')); sourceLists.append(box); continue; }
      if (!src.length) { box.append(el('p', 'wt-fuse__muted', 'No steps to show.')); sourceLists.append(box); continue; }
      const ol = el('ol', 'wt-fuse__source-steps');
      for (const s of src) {
        const used = isUsed(steps, id, s.n);
        const li = el('li', `wt-fuse__source${used ? ' is-used' : ''}`);
        const text = el('div', 'wt-fuse__source-text');
        text.append(el('p', 'wt-fuse__source-label', `${s.n}. ${s.label}`), el('p', 'wt-fuse__source-body', s.text));
        const use = button(used ? 'Used' : '+ Use', 'wt-fuse__use', `${used ? 'Already used' : 'Use'}: ${opts.titleOf(id)} step ${s.n}`);
        use.disabled = used || steps.length >= MAX_STEPS;
        use.addEventListener('click', () => { steps = useStep(steps, s); renderAll(); });
        li.append(text, use);
        ol.append(li);
      }
      box.append(ol);
      sourceLists.append(box);
    }
    own.disabled = steps.length >= MAX_STEPS;
  }

  function refreshChip(i: number): void {
    const chip = list.children[i]?.querySelector('.wt-fuse__chip');
    if (chip) chip.textContent = fromChip(steps[i]!, opts.titleOf);
  }

  function renderSteps(focus?: { index: number; selector: string }): void {
    list.replaceChildren();
    hint.textContent = stepHint(steps.length);
    if (!steps.length) {
      const empty = el('li', 'wt-fuse__empty', 'Use steps from the left, or add one of your own.');
      list.append(empty);
    }
    steps.forEach((s, i) => {
      const li = el('li', 'wt-fuse__step');
      li.dataset.index = String(i);
      const top = el('div', 'wt-fuse__step-top');
      const grip = button('⠿', 'wt-fuse__grip', `Drag to move step ${i + 1}`);
      grip.addEventListener('pointerdown', (e) => startDrag(e, i, li));
      top.append(grip, el('span', 'wt-fuse__num', String(i + 1)), el('span', 'wt-fuse__chip', fromChip(s, opts.titleOf)));
      const up = button('↑', 'wt-fuse__move', `Move step ${i + 1} up`);
      const down = button('↓', 'wt-fuse__move', `Move step ${i + 1} down`);
      const remove = button('Remove', 'wt-fuse__remove', `Remove step ${i + 1}`);
      up.disabled = i === 0;
      down.disabled = i === steps.length - 1;
      // Focus follows the moved step: the same arrow while it still works, else the other one.
      up.addEventListener('click', () => { steps = moveStep(steps, i, i - 1); renderAll({ index: i - 1, selector: `[data-move="${i - 1 === 0 ? 'down' : 'up'}"]` }); });
      down.addEventListener('click', () => { steps = moveStep(steps, i, i + 1); renderAll({ index: i + 1, selector: `[data-move="${i + 1 === steps.length - 1 ? 'up' : 'down'}"]` }); });
      up.dataset.move = 'up';
      down.dataset.move = 'down';
      remove.addEventListener('click', () => { steps = removeStep(steps, i); renderAll(); });
      const tools = el('span', 'wt-fuse__tools');
      tools.append(up, down, remove);
      top.append(tools);

      const label = el('input', 'wt-fuse__input');
      label.type = 'text';
      label.maxLength = 60;
      label.value = s.label;
      const text = el('textarea', 'wt-fuse__input wt-fuse__text');
      text.rows = 3;
      text.maxLength = 400;
      text.value = s.text;
      const edit = (): void => { steps = editStep(steps, i, { label: label.value, text: text.value }, sourceFor(steps[i]!)); refreshChip(i); };
      label.addEventListener('input', edit);
      text.addEventListener('input', edit);

      const loop = el('select', 'wt-fuse__input wt-fuse__loop');
      loop.append(option('No loop', ''));
      for (const n of loopOptions(steps, i)) loop.append(option(`↻ back to step ${n}`, String(n)));
      loop.value = s.loop_to ? String(s.loop_to) : '';
      loop.addEventListener('change', () => { steps = setLoop(steps, i, loop.value ? Number(loop.value) : null); });

      li.append(top, field('Heading', label), field('Instruction', text), field('Loop', loop, 'wt-fuse__field wt-fuse__field--inline'));
      list.append(li);
    });
    if (focus) (list.children[focus.index]?.querySelector(focus.selector) as HTMLElement | null)?.focus();
  }

  function renderAll(focus?: { index: number; selector: string }): void {
    renderSources();
    renderSteps(focus);
  }

  // Drag by the grip: pointer events, so a finger works too. Drops where the pointer lets go.
  function startDrag(e: PointerEvent, from: number, li: HTMLElement): void {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const grip = e.currentTarget as HTMLElement;
    try { grip.setPointerCapture(e.pointerId); } catch { /* not every runner supports capture */ }
    li.classList.add('is-dragging');
    let target = from;
    const items = [...list.querySelectorAll<HTMLElement>('.wt-fuse__step')];
    const mark = (): void => items.forEach((item, k) => item.classList.toggle('is-drop', k === target && k !== from));
    const move = (ev: PointerEvent): void => {
      const y = ev.clientY;
      let t = items.length - 1;
      for (let k = 0; k < items.length; k++) {
        const r = items[k]!.getBoundingClientRect();
        if (y < r.top + r.height / 2) { t = k; break; }
      }
      target = t;
      mark();
    };
    const end = (): void => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      li.classList.remove('is-dragging');
      if (target !== from) { steps = moveStep(steps, from, target); renderAll({ index: target, selector: '.wt-fuse__grip' }); }
      else items.forEach((item) => item.classList.remove('is-drop'));
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  function showPreview(f: Fusion): void {
    preview.innerHTML = fusedTileSvg(f, { size: 60 });
  }

  function renderDraw(): void {
    drawBox.replaceChildren();
    if (!saved) return;
    const drawn = saved.drawing.status === 'drawn';
    if (!drawn) {
      const ask = el('p', 'wt-fuse__ask', `Draw it? ${DRAW_COST_TEXT}`);
      if (saved.drawing.status === 'failed') ask.textContent = `The last drawing did not pass its checks. Try again? ${DRAW_COST_TEXT}`;
      const draw = button('Draw', 'btn btn--primary');
      const later = button('Not now', 'btn btn--secondary');
      draw.addEventListener('click', () => void runDraw());
      later.addEventListener('click', () => { drawBox.replaceChildren(el('p', 'wt-fuse__muted', 'It shows a dashed figure until drawn.')); });
      const row = el('div', 'wt-fuse__actions');
      row.append(draw, later);
      drawBox.append(ask, row);
      return;
    }
    const note = el('input', 'wt-fuse__input');
    note.type = 'text';
    note.maxLength = 200;
    note.placeholder = 'What should change?';
    const redraw = button('Redraw', 'btn btn--secondary');
    redraw.addEventListener('click', () => void runDraw(note.value.trim() || undefined));
    const row = el('div', 'wt-fuse__redraw');
    row.append(field(`Note for the redraw (${DRAW_COST_TEXT})`, note), redraw);
    drawBox.append(row);
  }

  async function runDraw(note?: string): Promise<void> {
    if (!saved || busy) return;
    busy = true;
    drawBox.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    setStatus('Drawing… this takes up to half a minute.');
    try {
      saved = await opts.onDraw(saved, note);
      showPreview(saved);
      setStatus(saved.drawing.status === 'drawn' ? 'Drawn.' : 'The drawing did not pass its checks, so nothing changed.');
    } catch (err) {
      setStatus(`Could not draw it: ${err instanceof Error ? err.message : 'try again'}`);
    } finally {
      busy = false;
      renderDraw();
    }
  }

  async function save(): Promise<void> {
    if (busy) return;
    const draft = { name: name.value, why: why.value, steps };
    const problem = draftProblem(draft);
    if (problem) { setStatus(problem); if (!name.value.trim()) name.focus(); return; }
    const fusion = draftToFusion(draft, { parents, clusterId: opts.clusterId, existing: saved });
    busy = true;
    saveBtn.disabled = true;
    setStatus('Saving…');
    try {
      await opts.onSave(fusion);
      saved = fusion;
      steps = fusion.steps.map((s) => ({ ...s }));
      renderAll();
      showPreview(fusion);
      setStatus('Saved.');
      renderDraw();
    } catch (err) {
      setStatus(`Could not save: ${err instanceof Error ? err.message : 'try again'}`);
    } finally {
      busy = false;
      saveBtn.disabled = false;
    }
  }

  function close(): void {
    root.remove();
    document.removeEventListener('keydown', onKey);
    previous?.focus?.();
    opts.onClose?.();
  }
  function onKey(e: KeyboardEvent): void { if (e.key === 'Escape' && !busy) close(); }

  own.addEventListener('click', () => { steps = ownStep(steps); renderAll({ index: steps.length - 1, selector: 'input' }); });
  saveBtn.addEventListener('click', () => void save());
  closeBtn.addEventListener('click', close);
  root.addEventListener('click', (e) => { if (e.target === root && !busy) close(); });
  document.addEventListener('keydown', onKey);

  renderAll();
  if (saved) { showPreview(saved); renderDraw(); }
  name.focus();

  void Promise.all(parents.map(async (id) => {
    try {
      const got = await opts.stepsOf(id);
      sources.set(id, got.map((s, k) => ({ id, n: k + 1, label: s.label, text: s.text })));
    } catch {
      sources.set(id, []);
      setStatus(`Could not load the steps for ${opts.titleOf(id)}.`);
    }
    renderSources();
  }));

  return { root, close };
}
