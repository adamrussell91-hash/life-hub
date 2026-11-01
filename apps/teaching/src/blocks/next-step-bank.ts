import { button, el } from '@/quiz/dom';
import { codeInk, type FeedbackCode } from '@/blocks/feedback-codes';
import { visitBlocks } from '@/blocks/walk-blocks';
import { makeNextSteps, type NextStepJobs, type NextStepTarget } from '@/blocks/next-step-run';
import { placeName } from '@/progress/story-text';
import { LADDER_MAX, RUNG_ORDER, bankSource, checkWording } from '@/progress/wording';
import type { NextStepBank, NextStepEntry } from '@/quiz/core';
import type { Block } from '@/schemas/block';
import '@/styles/next-step-teacher.css';

/**
 * Next steps for this box: the bank a writing question serves its students
 * from, one line per placement rung for each code linked to the box's skills.
 * Collapsed under the question in the builder. Every line is editable; an
 * edited line is kept when the code is regenerated. A line built from an older
 * question, skill list or ladder shows "Ladder changed".
 */

export type BankItem = { prompt?: string; quote?: string; skills?: string[]; next_steps?: NextStepBank };

const WRITTEN_QUIZ_KINDS = new Set(['extended_response', 'explain_effect']);

/** The rung a ladder or bank line is for, as the teacher reads it. */
export const rungLabel = (i: number): string => (i === 0 ? 'Building to Capable' : placeName(RUNG_ORDER[i] ?? null));

/** The question text a bank is built from. Must match questionText in ai/next-step-jobs.ts, or every bank reads as stale. */
export const boxQuestion = (q: BankItem): string => [q.prompt ?? '', q.quote ? `Quote: ${q.quote}` : ''].filter(Boolean).join('\n').trim();

/** Codes a box's skills link to: a skill and a full ladder (linkedCodes in ai/next-step-jobs.ts). */
export function boxCodes(skills: readonly string[], codes: readonly FeedbackCode[]): FeedbackCode[] {
  return codes.filter((c) => !c.hidden && c.skill && skills.includes(c.skill) && c.ladder?.length === RUNG_ORDER.length);
}

/** True when the entry was built from a different question, skill list or ladder than the box has now. */
export function entryStale(item: BankItem, code: FeedbackCode, entry: NextStepEntry | undefined = item.next_steps?.[code.id]): boolean {
  return !!entry && entry.source !== bankSource(boxQuestion(item), item.skills ?? [], code.ladder);
}

/** Codes on a box still to make: no entry yet, or a stale one. */
export function codesToMake(item: BankItem, codes: readonly FeedbackCode[]): FeedbackCode[] {
  return boxCodes(item.skills ?? [], codes).filter((c) => !item.next_steps?.[c.id] || entryStale(item, c));
}

/** Every writing box in a lesson with codes to make, for Make next steps for all boxes. */
export function nextStepTargets(blocks: readonly Block[], codes: readonly FeedbackCode[]): NextStepTarget[] {
  const out: NextStepTarget[] = [];
  const add = (block_id: string, index: number, item: BankItem) => {
    const todo = codesToMake(item, codes);
    if (!todo.length) return;
    const all = boxCodes(item.skills ?? [], codes).length === todo.length;
    out.push({ block_id, index, ...(all ? {} : { code_ids: todo.map((c) => c.id) }) });
  };
  visitBlocks(blocks as Block[], (block) => {
    if (block.block_type === 'question_set') {
      block.content.questions.forEach((q, i) => {
        if (q.kind === 'short_answer') add(block.id, i, q as BankItem);
      });
    }
    if (block.block_type === 'quiz_question') {
      const q = block.content.question as BankItem & { kind?: string };
      if (WRITTEN_QUIZ_KINDS.has(q.kind ?? '')) add(block.id, 0, q);
    }
  });
  return out;
}

/** Teacher-facing words for checkWording flags. Advisory: saving still works. */
export function flagText(flags: readonly string[]): string {
  return flags
    .map((f) => {
      if (f === 'empty') return 'Write a step here.';
      if (f === 'too_long') return `Keep it to one sentence of ${LADDER_MAX} characters or fewer.`;
      return `Try wording this as something to do (it has “${f.slice('word:'.length)}”).`;
    })
    .join(' ');
}

/** A code as its small lettered chip. */
export function codeChip(code: Pick<FeedbackCode, 'code' | 'colour'>): HTMLElement {
  const chip = el('span', 'fc-chip nst-code', code.code);
  chip.style.setProperty('--fc-ink', codeInk(code.colour));
  return chip;
}

export type BankPanel = {
  el: HTMLElement;
  /** Repaint with the box as it is now (question, skills, bank) and, once loaded, the code library. */
  update(item: BankItem, codes?: readonly FeedbackCode[] | null): void;
};

export type BankOptions = {
  /** Where the box sits in the lesson, for Make next steps. */
  target?: { block_id: string; index: number };
  jobs?: NextStepJobs;
};

export function nextStepBank(item: BankItem, codes: readonly FeedbackCode[] | null, onChange: (bank: NextStepBank | undefined) => void, options: BankOptions = {}): BankPanel {
  const root = el('div', 'nst-bank');
  let current = item;
  let library = codes;
  let open = false;
  let tab: string | null = null;
  const status = el('div', 'nst-bank__status');
  status.setAttribute('role', 'status');

  const make = (codeIds?: string[]) => {
    if (!options.jobs || !options.target) return;
    void makeNextSteps(status, options.jobs, [{ ...options.target, ...(codeIds?.length ? { code_ids: codeIds } : {}) }]);
  };

  function setLine(code: FeedbackCode, i: number, text: string): NextStepEntry {
    const bank: NextStepBank = structuredClone(current.next_steps ?? {});
    const entry = bank[code.id]!;
    entry.lines[i] = text.slice(0, LADDER_MAX);
    entry.edited[i] = true;
    current = { ...current, next_steps: bank };
    onChange(bank);
    return entry;
  }

  function rows(code: FeedbackCode, entry: NextStepEntry): HTMLElement {
    const list = el('div', 'nst-ladder');
    RUNG_ORDER.forEach((_, i) => {
      const row = el('div', 'nst-rung');
      row.classList.toggle('is-edited', entry.edited[i] === true);
      const name = el('span', 'nst-rung__name', rungLabel(i));
      const tag = el('span', 'nst-rung__tag', 'edited');
      tag.hidden = entry.edited[i] !== true;
      name.append(tag);
      const text = el('span', 'nst-rung__text', entry.lines[i] ?? '');
      text.contentEditable = 'true';
      text.setAttribute('role', 'textbox');
      text.setAttribute('aria-label', `${code.code} next step, ${rungLabel(i)}`);
      text.spellcheck = true;
      const flag = el('p', 'nst-flag');
      const showFlags = (line: string) => {
        flag.textContent = flagText(checkWording(line));
        flag.hidden = !flag.textContent;
      };
      showFlags(entry.lines[i] ?? '');
      text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          text.blur();
        }
      });
      text.addEventListener('input', () => {
        const line = (text.textContent ?? '').replace(/\s+/g, ' ');
        setLine(code, i, line.trim());
        row.classList.add('is-edited');
        tag.hidden = false;
        showFlags(line);
      });
      row.append(name, text, flag);
      list.append(row);
    });
    return list;
  }

  function paint(): void {
    const skills = current.skills ?? [];
    root.hidden = !skills.length || !library;
    if (root.hidden) return;
    const linked = boxCodes(skills, library ?? []);
    const bank = current.next_steps ?? {};
    const made = linked.filter((c) => bank[c.id]);
    const stale = made.filter((c) => entryStale(current, c));
    if (!tab || !linked.some((c) => c.id === tab)) tab = linked[0]?.id ?? null;

    const head = el('button', 'nst-bank__head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(open));
    const meta = !linked.length
      ? 'No codes linked to these skills'
      : made.length
        ? `${made.length} ${made.length === 1 ? 'code' : 'codes'} · ${made.length * RUNG_ORDER.length} lines${stale.length ? ' · Ladder changed' : ''}`
        : 'Not made yet';
    head.append(el('b', undefined, 'Next steps for this box'), el('span', 'nst-bank__meta', meta), el('span', 'nst-bank__chev', '›'));
    head.addEventListener('click', () => {
      open = !open;
      paint();
      root.querySelector<HTMLElement>('.nst-bank__head')?.focus();
    });
    root.classList.toggle('is-open', open);
    root.replaceChildren(head);
    if (!open) return;

    const body = el('div', 'nst-bank__body');
    if (!linked.length) {
      body.append(el('p', 'nst-bank__note', 'Give a feedback code one of these skills and a ladder (Feedback codes), and its next steps can be made here.'));
      root.append(body);
      return;
    }
    if (!made.length) {
      body.append(el('p', 'nst-bank__note', `Students see one line from here, picked by their repeating code and rung. ${linked.map((c) => c.code).join(', ')} link to this box.`));
      const foot = el('div', 'nst-bank__foot');
      if (options.jobs && options.target) foot.append(button('Make next steps', 'primary', () => make()));
      else foot.append(el('span', 'nst-bank__note', 'Next steps are made from the lesson builder.'));
      body.append(foot, status);
      root.append(body);
      return;
    }

    const tabs = el('div', 'nst-bank__tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Code');
    for (const c of linked) {
      const t = el('button', 'nst-tab');
      t.type = 'button';
      t.setAttribute('aria-pressed', String(c.id === tab));
      t.append(codeChip(c), document.createTextNode(c.label));
      t.addEventListener('click', () => {
        tab = c.id;
        paint();
        root.querySelector<HTMLElement>('.nst-tab[aria-pressed="true"]')?.focus();
      });
      tabs.append(t);
    }
    body.append(tabs);

    const code = linked.find((c) => c.id === tab)!;
    const entry = bank[code.id];
    const foot = el('div', 'nst-bank__foot');
    if (entry) {
      body.append(rows(code, entry));
      if (options.jobs && options.target) foot.append(button(`Regenerate ${code.code}`, 'ghost', () => make([code.id])));
      foot.append(el('span', 'nst-bank__note', `Built from the ${code.code} ladder and this question. Edited lines stay.`));
      if (entryStale(current, code)) foot.append(el('span', 'nst-stale', 'Ladder changed'));
    } else {
      body.append(el('p', 'nst-bank__note', `No ${code.code} steps for this box yet.`));
      if (options.jobs && options.target) foot.append(button(`Make ${code.code} steps`, 'primary', () => make(linked.filter((c) => !bank[c.id]).map((c) => c.id))));
    }
    body.append(foot, status);
    root.append(body);
  }

  paint();
  return {
    el: root,
    update(next, codes) {
      current = next;
      if (codes !== undefined) library = codes;
      // Repainting mid-edit would drop the caret, so a line being typed keeps its row.
      if (root.contains(document.activeElement) && document.activeElement?.classList.contains('nst-rung__text')) return;
      paint();
    }
  };
}
