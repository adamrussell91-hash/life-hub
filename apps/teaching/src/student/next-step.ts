import { apiPost } from '@/api/client';
import { rungIndex } from '@/progress/wording';
import type { NextStepBank } from '@/quiz/core';
import { button, deviceToken, el } from '@/quiz/dom';
import '@/progress/progress.css';
import '@/styles/next-step.css';

/**
 * A writing box's next step, for the student. One line above the box (the
 * code chip they know from marking, then one positive step) and Done under it.
 * With a step, Done asks them to tap the sentence where they took it; Save or
 * Not this time, then the box shows their answer with the pick highlighted.
 * Without one, Done just shows the answer with a small Saved tick. Tapping the
 * answer opens it for editing again.
 */

export type StepCode = { id: string; code: string; colour: string; hits: number };
/** The `steps` profile reply, by `strand.sub`. */
export type StepSkills = Record<string, { rung: string | null; codes: StepCode[] }>;
/** Why a step is there: flagged in the student's recent writing ("do"), or gone from it ("keep"). */
export type StepWhy = {
  kind: 'do' | 'keep';
  /** Pieces (or vivas) it was flagged in; 0 for a next step the teacher wrote. */
  hits: number;
  of: number;
  href?: string;
  /** What the student handed in: writing by default. */
  unit?: 'piece' | 'viva';
};
export type NextStep = { code_id: string; code: string; colour: string; line: string; why?: StepWhy };
/** The `steps` reply's one directive, from the student's last few returned pieces of writing. */
export type Directive = { kind: 'do' | 'keep'; code_id: string; code: string; colour: string; line: string; hits: number; of: number; item: string };
export type StepPick = { code_id: string; line: string; start: number; end: number } | { code_id: string; line: string; skipped: true };
/** What a writing box carries for its step. */
export type StepItem = { skills?: string[]; next_steps?: NextStepBank };
/** The step for one box, fixed by `key` for the page session. */
export type StepFor = (item: StepItem, key: string) => Promise<NextStep | null>;

const COLOURS = new Set(['blue', 'sage', 'peach', 'gold', 'lilac']);

/**
 * The box's step: of its skills' repeating codes that the box's bank covers,
 * the code with most hits (the first on a tie), at the student's rung.
 * No rung on that skill yet gives the Capable line.
 */
export function chooseStep(item: StepItem, skills: StepSkills | null): NextStep | null {
  if (!skills || !item.skills?.length || !item.next_steps) return null;
  let best: { code: StepCode; line: string } | null = null;
  for (const skill of item.skills) {
    const s = skills[skill];
    for (const code of s?.codes ?? []) {
      const line = (item.next_steps[code.id]?.lines[rungIndex(s!.rung)] ?? '').trim();
      if (!line) continue;
      if (!best || code.hits > best.code.hits) best = { code, line };
      break;
    }
  }
  if (!best) return null;
  return { code_id: best.code.id, code: best.code.code, colour: COLOURS.has(best.code.colour) ? best.code.colour : 'blue', line: best.line };
}

export type Sentence = { text: string; start: number; end: number };

/** An answer's sentences, with their offsets in it. Breaks after . ! ? and at line breaks. */
export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const gap = /(?<=[.!?]["”’')\]]?)\s+|\n+/g;
  let from = 0;
  const add = (start: number, end: number) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (body) out.push({ text: body, start: start + lead, end: start + lead + body.length });
  };
  for (const m of text.matchAll(gap)) {
    add(from, m.index);
    from = m.index + m[0].length;
  }
  add(from, text.length);
  return out;
}

/** A pick as kept on the device (`{ pick: '<json>' }`, a question set's step part) or by the quiz. Null for anything else. */
export function readStepPick(raw: unknown): StepPick | null {
  let v: unknown = raw;
  if (v && typeof v === 'object' && 'pick' in v) {
    try {
      v = JSON.parse(String((v as { pick: unknown }).pick));
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  if (typeof p.code_id !== 'string' || typeof p.line !== 'string') return null;
  if (p.skipped === true) return { code_id: p.code_id, line: p.line, skipped: true };
  return Number.isInteger(p.start) && Number.isInteger(p.end) ? { code_id: p.code_id, line: p.line, start: p.start as number, end: p.end as number } : null;
}

type StepsReply = { need: 'initials' | null; skills?: StepSkills; directive?: Directive | null };
type Loaded = { skills: StepSkills; directive: Directive | null };

/**
 * The step a box shows. The directive from recent writing comes first, in the
 * box's own bank wording when the bank covers that code. With no directive,
 * the bank's step as before. Any box gets the directive, bank or not.
 */
export function stepForBox(item: StepItem, loaded: Loaded | null, href?: string): NextStep | null {
  if (!loaded) return null;
  const d = loaded.directive;
  if (d) {
    const rung = item.skills?.map((k) => loaded.skills[k]?.rung).find((r) => r !== undefined) ?? null;
    const own = d.kind === 'do' ? (item.next_steps?.[d.code_id]?.lines[rungIndex(rung)] ?? '').trim() : '';
    return { code_id: d.code_id, code: d.code, colour: COLOURS.has(d.colour) ? d.colour : 'peach', line: own || d.line, why: { kind: d.kind, hits: d.hits, of: d.of, ...(href ? { href } : {}) } };
  }
  return chooseStep(item, loaded.skills);
}

/**
 * Asks the class profile for this student's codes and rungs, once per lesson
 * load. A device with no initials yet asks again a little later, since the
 * quiz or the work bar may claim them in the meantime. Each box's step is
 * worked out once, so it holds still while the student writes.
 */
export function stepsLoader(classId: string, lessonId: string, call?: () => Promise<StepsReply>): StepFor {
  const ask = call ?? (() => apiPost<StepsReply>(`/api/published/profile/${encodeURIComponent(classId)}`, { action: 'steps', lesson_id: lessonId, class_token: deviceToken(`class:${classId}`) }));
  let skills: Promise<Loaded | null> | null = null;
  const href = `/s/classes/${encodeURIComponent(classId)}/profile?tab=returned`;
  let claimed = false;
  let askedAt = 0;
  const fixed = new Map<string, Promise<NextStep | null>>();
  const load = (): Promise<Loaded | null> => {
    if (!skills || (!claimed && Date.now() - askedAt > 5000)) {
      askedAt = Date.now();
      skills = ask().then(
        (r) => {
          if (r.need === 'initials') return null;
          claimed = true;
          return { skills: r.skills ?? {}, directive: r.directive ?? null };
        },
        () => null
      );
    }
    return skills;
  };
  return (item, key) => {
    const held = fixed.get(key);
    if (held) return held;
    const step = load().then((s) => stepForBox(item, s, href));
    fixed.set(key, step);
    // A box drawn before the initials claim may find its step on a later draw.
    void step.then(() => {
      if (!claimed) fixed.delete(key);
    });
    return step;
  };
}

export type MountNextStepOptions = {
  /** The box's answer area, already in the page. The line goes above it, Done and the read view below. */
  input: HTMLTextAreaElement;
  step: Promise<NextStep | null> | null;
  /** The pick saved earlier, to show again on reload. */
  pick?: StepPick | null;
  /** Saves a pick, or clears it with null. Resolves once it is safe to show as saved. */
  onPick(pick: StepPick | null): void | Promise<void>;
};

const TICK = 'M3 8.5l3 3 7-7';

function tickIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ns-tick__icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', TICK);
  svg.append(path);
  return svg;
}

function arrowIcon(keep: boolean): HTMLElement {
  const wrap = el('span', 'ns-line__arrow');
  wrap.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', keep ? 'M5 12.5l4.5 4.5L19 7.5' : 'M4 12h15M13 6l6 6-6 6');
  svg.append(path);
  wrap.append(svg);
  return wrap;
}

/** Fills `box` as the Do this line: arrow, "Do this" (or green "Keep doing this"), the step, and why. */
function fillDoThis(box: HTMLElement, step: NextStep): void {
  const keep = step.why?.kind === 'keep';
  box.className = `ns-line ns--${step.colour}${keep ? ' ns-line--keep' : ''}`;
  const main = el('span', 'ns-line__main');
  main.append(el('span', 'ns-line__label', keep ? 'Keep doing this' : 'Do this'), el('span', 'ns-line__text', step.line));
  const why = whyLine(step);
  if (why) main.append(why);
  box.replaceChildren(arrowIcon(keep), main);
}

/** The Do this line on its own, for a block with no writing box (a viva). */
export function doThisBox(step: NextStep): HTMLElement {
  const box = el('p', 'ns-line');
  fillDoThis(box, step);
  return box;
}

/** "[AS] flagged in your last 4 pieces · See last time", or how long it has been gone. */
export function whyLine(step: NextStep): HTMLElement | null {
  const why = step.why;
  if (!why) return null;
  const p = el('span', 'ns-line__why');
  const unit = why.unit ?? 'piece';
  const pieces = (n: number) => (n === 1 ? unit : `${unit}s`);
  const words =
    why.kind === 'keep'
      ? ` not flagged in your last 2 ${pieces(2)}`
      : why.hits === 0
        ? `Your teacher’s next step from your last ${unit}`
        : why.hits === 1
          ? ` flagged in your last ${unit}`
          : why.hits === why.of
            ? ` flagged in your last ${why.of} ${pieces(why.of)}`
            : ` flagged in ${why.hits} of your last ${why.of} ${pieces(why.of)}`;
  if (step.code) p.append(chip(step));
  p.append(document.createTextNode(step.code ? words : words.trimStart()));
  if (why.href && why.kind === 'do') {
    const a = el('a', 'ns-line__link', 'See last time');
    a.href = why.href;
    p.append(document.createTextNode(' · '), a);
  }
  return p;
}

function chip(step: NextStep): HTMLElement {
  return el('span', `pg-code pg-code--${step.colour}`, step.code);
}

/** A pick still points at a whole sentence of this answer. */
function pickFits(pick: StepPick | null | undefined, sentences: Sentence[]): pick is Extract<StepPick, { start: number }> {
  return !!pick && !('skipped' in pick) && sentences.some((s) => s.start === pick.start && s.end === pick.end);
}

export function mountNextStep(options: MountNextStepOptions): void {
  const { input } = options;
  let step: NextStep | null = null;
  let pick: StepPick | null = options.pick ?? null;
  let chosen: Sentence | null = null;
  let mode: 'edit' | 'pick' | 'read' = 'edit';

  const line = el('p', 'ns-line');
  line.hidden = true;
  const prompt = el('div', 'ns-prompt');
  const read = el('div', 'ns-read');
  const tick = el('p', 'ns-tick');
  tick.setAttribute('role', 'status');
  const foot = el('div', 'ns-foot');
  const done = button('Done', 'primary', () => finish());
  const save = button('Save', 'primary', () => keep(chosen ? { code_id: step!.code_id, line: step!.line, start: chosen.start, end: chosen.end } : null));
  const skip = button('Not this time', 'ghost', () => keep(step ? { code_id: step.code_id, line: step.line, skipped: true } : null));
  input.classList.add('ns-host');
  // Above the box's "Your response" label when it has one, so the label stays with the box.
  const label = input.previousElementSibling;
  (label?.classList.contains('block-question-set__answer-label') ? label : input).before(line);
  input.after(prompt, read, tick, foot);

  const writing = () => line.classList.toggle('ns-line--writing', !!input.value.trim());
  input.addEventListener('input', () => {
    writing();
    done.disabled = !input.value.trim();
  });

  function paintLine(): void {
    line.hidden = !step || mode === 'pick';
    if (!step) return;
    fillDoThis(line, step);
    writing();
  }

  function paintRead(): void {
    const text = input.value;
    const sentences = splitSentences(text);
    const picked = mode === 'read' && pickFits(pick, sentences) ? pick : null;
    read.replaceChildren();
    read.classList.toggle('ns-read--picking', mode === 'pick');
    if (step) read.classList.add(`ns--${step.colour}`);
    let at = 0;
    const gap = (to: number) => read.append(el('span', 'ns-gap', text.slice(at, to)));
    for (const s of sentences) {
      if (s.start > at) gap(s.start);
      const on = mode === 'pick' ? chosen?.start === s.start : picked?.start === s.start;
      const node = mode === 'pick' ? el('button', 'ns-sent') : el('span', 'ns-sent');
      if (node instanceof HTMLButtonElement) {
        node.type = 'button';
        node.setAttribute('aria-pressed', String(on));
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          chosen = s;
          paint();
          (read.querySelector('.ns-sent--on') as HTMLElement | null)?.focus();
        });
      }
      if (on && step) {
        node.classList.add('ns-sent--on');
        node.append(el('span', 'ns-sent__tag', step.code));
      }
      node.append(document.createTextNode(s.text));
      read.append(node);
      at = s.end;
    }
    if (at < text.length) gap(text.length);
  }

  function paint(): void {
    paintLine();
    input.hidden = mode !== 'edit';
    read.hidden = mode === 'edit';
    prompt.hidden = mode !== 'pick';
    tick.hidden = mode !== 'read';
    // The read view is one tap target for editing; while picking, its sentences are.
    if (mode === 'read') {
      read.tabIndex = 0;
      read.setAttribute('role', 'button');
      read.setAttribute('aria-label', `Your answer: ${input.value.trim().slice(0, 80)}. Tap to edit.`);
    } else {
      read.removeAttribute('tabindex');
      read.removeAttribute('role');
      read.removeAttribute('aria-label');
    }
    if (mode !== 'edit') paintRead();
    if (mode === 'pick' && step) {
      prompt.className = `ns-prompt ns--${step.colour}`;
      prompt.replaceChildren(chip(step), el('span', 'ns-prompt__text'));
      const words = prompt.lastElementChild as HTMLElement;
      words.append(el('b', '', 'Where did you take this step?'), el('span', 'ns-prompt__sub', 'Tap that sentence.'));
    }
    if (mode === 'read') {
      const took = !!step && pickFits(pick, splitSentences(input.value)) && pick?.code_id === step.code_id;
      tick.className = `ns-tick${took && step ? ` ns-tick--step ns--${step.colour}` : ''}`;
      tick.replaceChildren(tickIcon(), el('span', '', took ? 'Step taken.' : 'Saved'));
    }
    save.disabled = !chosen;
    done.disabled = !input.value.trim();
    foot.replaceChildren(...(mode === 'edit' ? [done] : mode === 'pick' ? [skip, save] : []));
    foot.hidden = mode === 'read';
  }

  function finish(): void {
    if (!input.value.trim()) return;
    const sentences = splitSentences(input.value);
    // "Keep doing this" is a reminder, not a step to find.
    if (!step || step.why?.kind === 'keep') {
      mode = 'read';
      paint();
      return;
    }
    // An earlier pick that still fits starts chosen; one the edit moved is let go.
    chosen = pickFits(pick, sentences) ? sentences.find((s) => s.start === (pick as { start: number }).start) ?? null : null;
    if (pick && !('skipped' in pick) && !chosen) {
      pick = null;
      void options.onPick(null);
    }
    mode = 'pick';
    paint();
    (read.querySelector('.ns-sent') as HTMLElement | null)?.focus();
  }

  async function keep(next: StepPick | null): Promise<void> {
    if (!next) return;
    save.disabled = skip.disabled = true;
    try {
      await options.onPick(next);
      pick = next;
    } finally {
      save.disabled = !chosen;
      skip.disabled = false;
    }
    mode = 'read';
    paint();
  }

  // Tapping the answer opens it for editing again.
  read.addEventListener('click', () => {
    if (mode !== 'read') return;
    mode = 'edit';
    paint();
    input.focus();
  });
  read.addEventListener('keydown', (e) => {
    if (mode === 'read' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      read.click();
    }
  });

  // A box reloaded with its pick, or a step skipped, opens as it was left.
  const restore = (): void => {
    if (!input.value.trim() || !pick) return;
    if ('skipped' in pick || pickFits(pick, splitSentences(input.value))) mode = 'read';
  };

  paint();
  if (options.step) {
    void options.step.then((s) => {
      if (!s || !input.isConnected) return;
      step = s;
      // A saved pick for another code belongs to an older step: it stays with the server, unshown.
      if (pick && pick.code_id !== s.code_id) pick = null;
      if (mode === 'edit') restore();
      paint();
    });
  }
}
