import { FIGURE_SVGS } from '../../../../../packages/walkthrus/glyphs';
import type { Block } from '@/schemas/block';
import { createGlyphSet } from '../../../../../packages/design-kit/js/glyph-set.js';
import { techniqueById } from '../../../../../packages/walkthrus/catalogue.mjs';
import { attachedTechniques } from './attach';
import { loadLiveGoal, loadWalkthruPictures, loadWalkthruText, type GoalLite, type WalkthruStepText } from './api';
import { miniNames, miniTimer, type StripState } from './mini-tools';
import { lessonSlots } from './note';
import { createStepTicks } from './ticks';

const glyphs = createGlyphSet({ svgs: FIGURE_SVGS, labelOf: (id: string) => techniqueById(id)?.name ?? id, className: 'wts__hex' });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const sentence = (label: string): string => label.charAt(0) + label.slice(1).toLowerCase();

/** Every bit of text in a block's content, for finding its question. */
function contentText(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value.replace(/<[^>]+>/g, ' '));
  else if (Array.isArray(value)) for (const item of value) contentText(item, out);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) if (key !== 'id') contentText(item, out);
  return out;
}

/** The first question the block asks, for a Say line's {question}. */
export function blockQuestion(block: Pick<Block, 'content'>): string | null {
  const text = contentText(block.content).join(' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const match = text.match(/[^.?!]*\?/);
  const question = match?.[0].trim();
  return question && question.length > 3 ? question : null;
}

/** A Say line with the picked student and the block's question dropped in. */
function sayLine(line: string, state: StripState, question: string | null): HTMLElement {
  const item = el('li');
  for (const part of line.split(/(\{name\}|\{question\})/)) {
    if (part === '{name}') {
      // Said aloud, so the first name; the picker under the step shows the full one.
      const name = el('span', 'wts__name', state.name?.split(/\s+/)[0] ?? 'name');
      if (!state.name) name.classList.add('is-empty');
      item.append(name);
    } else if (part === '{question}') item.append(question ?? 'your question');
    else if (part) item.append(part);
  }
  return item;
}

interface StripData { techniqueId: string; steps: WalkthruStepText[]; pictures: Array<string | null>; goal: GoalLite | null }

/**
 * Teacher view only: the WalkThru a teacher chose for this block. Closed, a slim bar. Open, the
 * five step pictures as a strip, small classroom tools under the steps that use one, and a cue
 * card for the step you are on: what to do, what to say, and the book's coaching folded away.
 * Display and student pages never get it (the chosen id is stripped from the published lesson).
 * In a lesson each step also carries a tick that saves against the lesson and class.
 */
export function renderTechniqueBadge(block: Block, ctx: { lessonId?: string; display?: boolean } = {}): HTMLElement | null {
  const [id] = attachedTechniques(block);
  const entry = id ? techniqueById(id) : null;
  if (!entry) return null;
  const details = el('details', 'wts');
  details.dataset.technique = entry.id;
  const summary = el('summary', 'wts__sum');
  summary.title = `${entry.name}: open the steps (only you see this)`;
  summary.append(glyphs.element(entry.id), el('span', 'wts__title', entry.name), el('span', 'wts__meta', '5 steps · only you see this'));
  const body = el('div', 'wts__body');
  details.append(summary, body);
  let loaded = false;
  details.addEventListener('toggle', () => {
    if (!details.open || loaded) return;
    loaded = true;
    body.append(el('p', 'wts__status', 'Loading the steps…'));
    Promise.all([
      loadWalkthruText(),
      loadWalkthruPictures(entry.id).catch(() => [null, null, null, null, null]),
      loadLiveGoal(entry.id).catch(() => null)
    ])
      .then(([text, pictures, goal]) => {
        const master = text.sets.flatMap((s) => s.techniques).find((t) => t.id === entry.id);
        if (!master) {
          body.replaceChildren(el('p', 'wts__status', 'The private file has no steps for this technique yet.'));
          return;
        }
        body.replaceChildren(...buildStrip({ techniqueId: entry.id, steps: master.steps, pictures, goal }, block, ctx));
      })
      .catch(() => body.replaceChildren(el('p', 'wts__status', 'The steps couldn’t be loaded. Check the private WalkThrus file.')));
  });
  return details;
}

function buildStrip(data: StripData, block: Block, ctx: { lessonId?: string; display?: boolean }): HTMLElement[] {
  const question = blockQuestion(block);
  const ticks = ctx.lessonId && !ctx.display
    ? createStepTicks({ techniqueId: data.techniqueId, lessonId: ctx.lessonId, slots: lessonSlots(ctx.lessonId), total: Math.min(9, data.steps.length) })
    : null;
  const strip = el('ol', 'wts__strip');
  const card = el('div', 'wts__card');
  card.setAttribute('aria-live', 'polite');
  const cells = new Map<number, HTMLElement>();
  let current = data.steps[0]?.n ?? 1;

  const state: StripState = {
    lessonId: ctx.lessonId,
    name: null,
    pool: null,
    picked: [],
    classLabel: '',
    onName: () => {
      strip.querySelectorAll('.wts-tool--names').forEach((tool) => tool.dispatchEvent(new Event('wts-names')));
      paintCard();
    },
    goTo: (n) => {
      if (!cells.has(n) || n === current) return;
      current = n;
      paintCells();
      paintCard();
    }
  };

  const paintCells = (): void => {
    for (const [n, cell] of cells) {
      const on = n === current;
      cell.classList.toggle('is-on', on);
      cell.querySelector('.wts__panel')?.setAttribute('aria-pressed', String(on));
      if (on && strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: cell.offsetLeft - strip.offsetLeft - 8, behavior: 'smooth' });
    }
  };

  const paintCard = (): void => {
    const step = data.steps.find((s) => s.n === current);
    if (!step) return;
    card.replaceChildren(el('p', 'wts__step', `${step.n}. ${sentence(step.label)}`));
    const cue = step.cue;
    if (cue) {
      if (cue.time) card.append(el('p', 'wts__time', cue.time));
      if (cue.do.length) {
        const list = el('ul', 'wts__do');
        for (const line of cue.do) list.append(el('li', '', line));
        card.append(el('p', 'wts__h', 'Do'), list);
      }
      if (cue.say.length) {
        const list = el('ul', 'wts__say');
        for (const line of cue.say) list.append(sayLine(line, state, question));
        card.append(el('p', 'wts__h', 'Say'), list);
      }
    }
    const adapted = data.goal?.walkthru?.adapted?.[String(step.n)];
    if (adapted) card.append(el('p', 'wts__adapted', adapted));
    const book = cue ? el('details', 'wts__book') : el('div', 'wts__book wts__book--open');
    if (cue) book.append(el('summary', '', 'The book’s coaching'));
    for (const para of step.text.split(/\n\s*\n/)) book.append(el('p', '', para));
    card.append(book);
    const next = data.steps.find((s) => s.n === step.n + 1);
    if (next) {
      const go = el('button', 'wts__next', `Next: ${sentence(next.label)} →`);
      go.type = 'button';
      go.addEventListener('click', () => state.goTo(next.n));
      card.append(go);
    }
  };

  for (const step of data.steps) {
    const cell = el('li', 'wts__cell');
    const panel = el('button', 'wts__panel');
    panel.type = 'button';
    const pic = el('span', 'wts__pic');
    const svg = data.pictures[step.n - 1];
    if (svg) pic.innerHTML = svg;
    else pic.classList.add('is-empty');
    const label = el('span', 'wts__label');
    label.append(el('b', '', String(step.n)), document.createTextNode(sentence(step.label)));
    panel.append(pic, label);
    panel.addEventListener('click', () => state.goTo(step.n));
    cell.append(panel);
    if (ticks) cell.append(ticks.button(step.n));
    const tool = step.cue?.tool;
    if (tool?.kind === 'timer') cell.append(miniTimer(tool.seconds, step.n, state));
    else if (tool?.kind === 'names') cell.append(miniNames(step.n, state));
    cells.set(step.n, cell);
    strip.append(cell);
  }
  paintCells();
  paintCard();
  return ticks ? [ticks.el, strip, card] : [strip, card];
}
