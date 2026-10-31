import { el } from '@/quiz/dom';
import { paper, type Mark } from '@/blocks/peer-annotate';
import '@/styles/next-step-teacher.css';

/**
 * The student's own next-step pick, as the teacher sees it while marking: the
 * step they were shown, and the sentence they said they took it in, drawn
 * dashed in the code's colour under the teacher's highlights. It is the
 * student's mark, so it is never tappable and never saved as a teacher tag.
 */

export type StepPick = { code_id: string; line: string; start?: number; end?: number; skipped?: true };
type PickCode = { code: string; colour: string };

/** The layer a pick draws on, apart from every teacher highlight. */
const PICK_LAYER = -1;

export const pickInk = (code: PickCode | undefined): string => `var(--pastel-${code?.colour ?? 'blue'}-ink)`;

/** A pick to draw: placed, and inside the answer as it was handed in. */
export function placedPick(pick: StepPick | undefined | null, text: string): (StepPick & { start: number; end: number }) | null {
  if (!pick || pick.skipped || !Number.isInteger(pick.start) || !Number.isInteger(pick.end)) return null;
  return pick.start! >= 0 && pick.start! < pick.end! && pick.end! <= text.length ? (pick as StepPick & { start: number; end: number }) : null;
}

/** "Their next step · TS" with the line the student saw. */
export function stepHead(pick: StepPick, code: PickCode | undefined): HTMLElement {
  const head = el('div', 'mk-step-head');
  head.style.setProperty('--nst-ink', pickInk(code));
  head.append(el('span', 'mk-step-head__k', code ? `Their next step · ${code.code}` : 'Their next step'), document.createTextNode(pick.line));
  return head;
}

export function pickCaption(initials: string, code: PickCode | undefined): HTMLElement {
  return el('p', 'mk-pick-caption', `${initials}’s own ${code?.code ?? ''}${code ? ' ' : ''}pick.`);
}

/** The pick as a Mark, last so the teacher's own highlights keep their colour where they overlap it. */
export function pickMark(pick: { start: number; end: number }, code: PickCode | undefined): Mark {
  return { start: pick.start, end: pick.end, layer: PICK_LAYER, colour: pickInk(code) };
}

/**
 * Turns the pick's runs in a paper() sheet into dashed runs. Where no teacher
 * highlight covers a run it loses the highlight look (and so the tap that
 * opens a teacher tag); where one does, the teacher's highlight stays.
 */
export function drawPick(sheet: HTMLElement, pick: { start: number; end: number }, code: PickCode | undefined, teacher: readonly Mark[]): void {
  const runs = [...sheet.querySelectorAll<HTMLElement>('.pa-run')].filter((r) => Number(r.dataset.start) >= pick.start && Number(r.dataset.end) <= pick.end);
  runs.forEach((run, i) => {
    const a = Number(run.dataset.start);
    const b = Number(run.dataset.end);
    const over = teacher.filter((m) => m.start < b && m.end > a);
    run.classList.add('nst-pick-run');
    run.classList.toggle('nst-pick-run--first', i === 0);
    run.classList.toggle('nst-pick-run--last', i === runs.length - 1);
    run.style.setProperty('--nst-ink', pickInk(code));
    if (!over.length) {
      run.classList.remove('pa-run--mark', 'pa-run--both');
      run.style.removeProperty('--pa-mark');
      run.style.removeProperty('--pa-mark-2');
    } else if (new Set(over.map((m) => m.layer)).size < 2) {
      run.classList.remove('pa-run--both');
      run.style.removeProperty('--pa-mark-2');
    }
  });
}

/** A read-only answer with the pick, for views that show the answer without teacher highlights (quiz written answers). */
export function pickedAnswer(text: string, pick: StepPick, code: PickCode | undefined, initials: string | null): HTMLElement | null {
  const placed = placedPick(pick, text);
  if (!placed) return null;
  const wrap = el('div', 'mk-pick');
  const sheet = paper(text, [pickMark(placed, code)], null);
  drawPick(sheet, placed, code, []);
  wrap.append(stepHead(pick, code), sheet);
  if (initials) wrap.append(pickCaption(initials, code));
  return wrap;
}
