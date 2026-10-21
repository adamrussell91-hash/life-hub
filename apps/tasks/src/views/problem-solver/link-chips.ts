import './link-chips.css';
import { el } from '@/views/hub-kit';
import { problemSolverApi, type PsLinkedSession } from './api';

/**
 * Chips on a task or project page for the Problem Solver sessions that link to it. Hidden
 * until at least one session is found; a failed lookup leaves it hidden. A review chip
 * opens its session at Improve.
 */
export function problemSolverChips(
  ref: { kind: 'task' | 'project'; id: string },
  api: { linked: (ref: string) => Promise<PsLinkedSession[]> } = problemSolverApi
): HTMLSpanElement {
  const host = el('span', 'ps-linkchips') as HTMLSpanElement;
  host.hidden = true;
  void api.linked(`${ref.kind}:${ref.id}`).then((sessions) => {
    for (const s of sessions) {
      const review = s.role === 'review';
      const chip = el('a', 'ps-linkchip') as HTMLAnchorElement;
      chip.href = `#/problem-solver?id=${encodeURIComponent(s.id)}${review ? '&step=improve' : ''}`;
      const dot = el('span', 'ps-linkchip__dot');
      dot.setAttribute('aria-hidden', 'true');
      dot.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
      chip.append(dot, document.createTextNode(`${review ? 'Review in Problem Solver' : 'Problem Solver'}: ${s.title}`));
      host.append(chip);
    }
    host.hidden = host.childElementCount === 0;
  }, () => undefined);
  return host;
}
