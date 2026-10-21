import type { Block } from '@/schemas/block';
import { findBlockById } from './find-block';
import {
  DISCERN_SHAPES, DISCERN_STATE_EVENT, DISCERN_STEP_NAMES, classifyTail, discernQuestionText, discernStateKey,
  discernSteps, loadDiscernState, saveDiscernState
} from './discern';
import { renderTailGraph } from './discern-graph';
import { button, discernSymbol, el, jotField, sendDiscernTail, settledScale } from './discern-view';

type ConfirmBlock = Extract<Block, { block_type: 'discern_confirm' }>;
type Mode = 'student' | 'teacher' | 'print';

/** Short name for the linked block, e.g. "Q1 · How much do you agree…". */
function hostName(host: Block): string {
  const text = discernQuestionText(host).trim();
  return text ? (text.length > 70 ? `${text.slice(0, 68)}…` : text) : host.block_type.replaceAll('_', ' ');
}

function badge(host: Block | null): HTMLElement {
  const link = el('a', 'discern-badge');
  link.append(discernSymbol(), document.createTextNode(host ? 'Confirm · linked to the activity above' : 'Confirm · not linked'));
  if (host) {
    link.href = `#block-${host.id}`;
    link.title = hostName(host);
    link.addEventListener('click', (event) => {
      const target = document.querySelector(`[data-block-id="${CSS.escape(host.id)}"]`);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  return link;
}

export function renderDiscernConfirm(block: ConfirmBlock, mode: Mode, ctx: { lessonId?: string; pageBlocks?: Block[] }): HTMLElement {
  const root = el('div', 'discern-confirm');
  const host = findBlockById(ctx.pageBlocks ?? [], block.content.target_block_id);
  const q = host?.discern;
  root.append(badge(q ? host : null));

  if (!host || !q) {
    if (mode === 'teacher') {
      root.append(el('p', 'discern-caption', 'This Confirm card has no Discern activity to finish. Add Discern to a block again, or delete this card.'));
    }
    return root;
  }
  const steps = discernSteps(q);
  const own = q.mode === 'own';
  const who = q.who.trim() || 'they';

  if (mode === 'print') {
    root.append(el('p', 'discern-confirm__title', `Confirm: ${hostName(host)}`), el('p', undefined, steps[4]!.prompt));
    return root;
  }
  if (mode === 'teacher') {
    root.append(
      el('p', 'discern-confirm__title', `Confirm for: ${hostName(host)}`),
      el('p', 'discern-caption', 'Students reread their answer here, add the last dot and read the shape of their tail. Drag this card anywhere later in the lesson; it stays linked.'),
      el('p', 'discern-step__prompt', steps[4]!.prompt)
    );
    return root;
  }

  const live = !!ctx.lessonId;
  const key = live ? discernStateKey(ctx.lessonId!, host.id) : undefined;
  const body = el('div');
  root.append(body);

  function draw(): void {
    const state = loadDiscernState(key);
    body.replaceChildren();
    if (!state.drawn || !state.dots.slice(0, 4).every((d) => d > 0)) {
      body.append(
        el('p', 'discern-confirm__title', `Confirm your ${own ? 'answer' : 'verdict'}`),
        el('p', 'discern-caption', 'This opens once you have worked through Discern on the activity it links to. If your earlier dots are not here, they are in your book: add your last dot there.')
      );
      return;
    }
    const recall = el('p', 'discern-recall');
    recall.append(
      el('b', undefined, own ? `You started at ${state.position},` : `Your initial verdict was ${state.position},`),
      document.createTextNode(own ? ` pulled by “${state.notes[0]}”.` : ` with ${who} pulled by “${state.notes[0]}”.`)
    );
    body.append(el('p', 'discern-confirm__title', 'Reread your answer. Then confirm.'), recall, el('p', 'discern-step__prompt', steps[4]!.prompt));
    const finish = button('Finish my tail', 'btn btn--secondary', () => {
      const s = loadDiscernState(key);
      s.notes[4] = draft.note;
      s.dots[4] = draft.dot;
      saveDiscernState(key, s);
      if (live) sendDiscernTail(ctx.lessonId!, host!.id, q!, s);
      draw();
    });
    const draft = { note: state.notes[4] ?? '', dot: state.dots[4] ?? 0 };
    const ready = () => { finish.disabled = !(draft.note.trim() && draft.dot); };
    body.append(
      jotField(steps[4]!.jot, draft.note, (v) => { draft.note = v; ready(); }),
      settledScale(`How settled are you in your ${own ? 'answer' : 'verdict'} now?`, draft.dot, (n) => { draft.dot = n; ready(); })
    );
    const actions = el('div', 'discern-actions');
    actions.append(finish);
    body.append(actions);
    ready();

    if (state.dots[4]) {
      const shape = DISCERN_SHAPES[classifyTail(state.dots)];
      const head = el('div', 'discern-tail-head');
      head.append(el('h4', undefined, 'Your whole tail'), el('span', 'discern-book', 'Add the last dot in your book'));
      const reading = el('div', 'discern-reading');
      reading.append(el('h5', undefined, `Reading your tail: ${shape.name}`), el('p', undefined, shape.reading));
      body.append(head, renderTailGraph({ columns: DISCERN_STEP_NAMES, values: state.dots, labels: state.notes }), reading,
        el('p', 'discern-caption', 'The shape does not tell you if you are right. It tells you where to look next.'));
    }
  }
  draw();

  if (key) {
    document.addEventListener(DISCERN_STATE_EVENT, function sync(event) {
      if (!root.isConnected && root.dataset.mounted) { document.removeEventListener(DISCERN_STATE_EVENT, sync); return; }
      if ((event as CustomEvent<{ key: string }>).detail.key === key && !root.contains(document.activeElement)) draw();
    });
    queueMicrotask(() => { if (root.isConnected) root.dataset.mounted = 'true'; });
  }
  return root;
}
