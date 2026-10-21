import './link-chips.css';
import { el } from '@/views/hub-kit';
import { decisionBookApi, problemSolverApi, type PsLinkedSession } from './api';

type LinkedApi = { linked: (ref: string) => Promise<PsLinkedSession[]> };
/** A tool's chips: where they open, the review step a review chip opens at, and the tool's name. */
type ChipTool = { hash: string; reviewStep: string; name: string; tone: string };

/**
 * Chips on a task or project page for one tool's sessions that link to it. Hidden until at
 * least one session is found; a failed lookup leaves it hidden. A review chip opens its session
 * at the review step.
 */
function sessionChips(ref: { kind: 'task' | 'project'; id: string }, api: LinkedApi, tool: ChipTool): HTMLSpanElement {
  const host = el('span', 'ps-linkchips') as HTMLSpanElement;
  host.hidden = true;
  void api.linked(`${ref.kind}:${ref.id}`).then((sessions) => {
    for (const s of sessions) {
      const review = s.role === 'review';
      const chip = el('a', `ps-linkchip ps-linkchip--${tool.tone}`) as HTMLAnchorElement;
      chip.href = `${tool.hash}?id=${encodeURIComponent(s.id)}${review ? `&step=${tool.reviewStep}` : ''}`;
      const dot = el('span', 'ps-linkchip__dot');
      dot.setAttribute('aria-hidden', 'true');
      dot.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
      chip.append(dot, document.createTextNode(`${review ? `Review in ${tool.name}` : tool.name}: ${s.title}`));
      host.append(chip);
    }
    host.hidden = host.childElementCount === 0;
  }, () => undefined);
  return host;
}

/** Chips for the Problem Solver sessions that link to a task or project. */
export function problemSolverChips(ref: { kind: 'task' | 'project'; id: string }, api: LinkedApi = problemSolverApi): HTMLSpanElement {
  return sessionChips(ref, api, { hash: '#/problem-solver', reviewStep: 'improve', name: 'Problem Solver', tone: 'ps' });
}

/** Chips for the Decision Maker decisions that link to a task or project (a record page, a first step, a review). */
export function decisionMakerChips(ref: { kind: 'task' | 'project'; id: string }, api: LinkedApi = decisionBookApi): HTMLSpanElement {
  return sessionChips(ref, api, { hash: '#/decision-maker', reviewStep: 'review', name: 'Decision Maker', tone: 'dm' });
}
