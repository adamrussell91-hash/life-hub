import { apiPost } from '@/api/client';
import { button, el, errorText, isNotPublished } from '@/blocks/peer-feedback-ui';
import { LETTERS, percent, poller, type HingeBlock, type HingeTier } from './shared';

type Try = { pick: string; reason: string; sure: boolean | null; tier: HingeTier; flagged: boolean };
type Opt = { id: string; text: string; tier: HingeTier };
export type IndependentReport = {
  phase: 'independent';
  stale: boolean;
  ready: boolean;
  prompt: string;
  options: Opt[];
  correct_id: string;
  backup: { prompt: string; options: Opt[]; correct_id: string } | null;
  answered: number;
  tiers: Record<HingeTier, number>;
  sure_wrong: number;
  retry: { tried: number; right: number };
  stuck: string[];
  responses: Array<{ id: string; first: Try; retry: Try | null; stuck: boolean; done: boolean; at: string | null }>;
};

const TIER_LABEL: Record<HingeTier, string> = { right: 'Right', close: 'Close', mixup: 'Mix-up' };
const STALE = 'You’ve changed this question since publishing. Students still see the published one, so publish again.';

/**
 * The teacher's panel for an independent hinge: no round to run, just how
 * students are going. First tries by tier, how many were sure and wrong, the
 * back-up retries, who is still stuck, and each reason. On the Display view
 * the class can see the screen, so it shows only how many have answered.
 */
export function mountIndependentTeacher(block: HingeBlock, lessonId: string, display = false): HTMLElement {
  const endpoint = `/api/lessons/${encodeURIComponent(lessonId)}/hinge/${encodeURIComponent(block.id)}`;
  const root = el('div', 'hq-run hq-ind-teacher');
  const notice = el('p', 'pf-note hq-stale');
  notice.hidden = true;
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const body = el('div', 'hq-teacher');
  root.append(notice, alert, body);
  let report: IndependentReport | null = null;
  let painted = '';
  const shown = new Set<string>();

  async function load(): Promise<void> {
    try {
      report = await apiPost<IndependentReport>(endpoint, { action: 'independent' });
      alert.hidden = true;
      paint();
    } catch (error) {
      if (!report && isNotPublished(error)) {
        const box = el('div', 'pf-panel pf-panel--quiet');
        box.append(
          el('p', 'pf-panel__title block-subtitle', 'Not live yet'),
          el('p', 'pf-panel__text block-body', 'Publish this lesson and block, and students can answer it on their own.')
        );
        body.replaceChildren(box);
        painted = 'not-live';
      } else if (!report) {
        alert.textContent = errorText(error);
        alert.hidden = false;
      }
    }
  }

  const letter = (options: Opt[], id: string) => LETTERS[options.findIndex((o) => o.id === id)] ?? '?';
  const sureText = (sure: boolean | null) => (sure === true ? 'Sure' : sure === false ? 'Not sure' : 'Didn’t say');

  function reasonText(text: string, flagged: boolean, key: string): HTMLElement {
    if (!flagged || shown.has(key)) return el('p', 'hq-ind-teacher__reason', text);
    const wrap = el('p', 'hq-ind-teacher__reason is-flagged');
    wrap.append(
      el('span', 'block-secondary', 'Held by the word check. '),
      button('Show', 'ghost', () => {
        shown.add(key);
        painted = '';
        paint();
      })
    );
    return wrap;
  }

  function tryLine(label: string, options: Opt[], t: Try, key: string): HTMLElement {
    const line = el('div', 'hq-ind-teacher__try');
    const head = el('div', 'hq-ind-teacher__try-head');
    head.append(
      el('span', 'block-secondary', label),
      el('span', 'hq-letter', letter(options, t.pick)),
      el('span', `pf-chip hq-tier hq-tier--${t.tier}`, TIER_LABEL[t.tier]),
      el('span', 'block-secondary', sureText(t.sure))
    );
    line.append(head, reasonText(t.reason, t.flagged, key));
    return line;
  }

  function spread(r: IndependentReport): HTMLElement {
    const picks = new Map<string, number>();
    for (const x of r.responses) picks.set(x.first.pick, (picks.get(x.first.pick) ?? 0) + 1);
    const list = el('ol', 'hq-spread');
    list.setAttribute('aria-label', 'First answers');
    r.options.forEach((o, i) => {
      const n = picks.get(o.id) ?? 0;
      const pct = percent(n, r.answered);
      const li = el('li', 'hq-spread__row');
      li.dataset.right = String(o.tier === 'right');
      const head = el('div', 'hq-spread__head');
      head.append(el('span', 'hq-letter', LETTERS[i] ?? '?'), el('span', 'hq-spread__text', o.text), el('span', `pf-chip hq-tier hq-tier--${o.tier}`, TIER_LABEL[o.tier]), el('span', 'hq-spread__count', `${n} · ${pct}%`));
      const bar = el('span', 'hq-bar');
      bar.style.setProperty('--hq-pct', `${pct}%`);
      li.append(head, bar);
      list.append(li);
    });
    return list;
  }

  function paint(): void {
    if (!report) {
      body.replaceChildren(el('p', 'pf-note block-secondary', 'Loading…'));
      return;
    }
    const r = report;
    notice.hidden = !r.stale;
    notice.textContent = STALE;
    const sig = JSON.stringify([r.answered, r.responses, r.options, r.stale, r.ready]);
    if (sig === painted) return;
    painted = sig;

    const intro = el('p', 'pf-note block-secondary', r.ready
      ? 'Students answer on their own from the lesson link, give a reason, and get one retry on the back-up if they miss.'
      : 'Finish the question and mark the right answer, then publish again.');
    if (display) {
      const box = el('div', 'pf-panel pf-panel--wait');
      box.append(el('p', 'pf-panel__title block-subtitle', `${r.answered} ${r.answered === 1 ? 'student has' : 'students have'} answered`), el('p', 'pf-panel__text block-body', 'Answer on the lesson link, on your own.'));
      body.replaceChildren(box);
      return;
    }
    if (!r.answered) {
      body.replaceChildren(intro, el('p', 'pf-note block-secondary', 'No answers yet. This updates by itself.'));
      return;
    }

    const stats = el('dl', 'hq-ind-teacher__stats');
    const stat = (label: string, value: string, kind = '') => {
      const item = el('div', `hq-ind-teacher__stat${kind ? ` hq-ind-teacher__stat--${kind}` : ''}`);
      item.append(el('dt', 'block-secondary', label), el('dd', 'hq-ind-teacher__value', value));
      stats.append(item);
    };
    stat('Answered', String(r.answered));
    stat('Right first go', String(r.tiers.right), 'right');
    stat('Close', String(r.tiers.close), 'close');
    stat('Mix-up', String(r.tiers.mixup), 'mixup');
    stat('Sure and wrong', String(r.sure_wrong), 'sneaky');
    if (r.backup) stat('Back-up retries right', `${r.retry.right} of ${r.retry.tried}`);
    stat('Still stuck', String(r.stuck.length), 'stuck');

    const parts: HTMLElement[] = [intro, stats, spread(r)];
    if (!r.backup && r.tiers.right < r.answered) {
      parts.push(el('p', 'pf-note block-secondary', 'Add a back-up question in the editor and students who miss get a fresh try.'));
    }

    const stuckRows = r.responses.filter((x) => x.stuck);
    const otherRows = r.responses.filter((x) => !x.stuck);
    const rows = (list: typeof r.responses) => {
      const ul = el('ul', 'hq-ind-teacher__list');
      for (const x of list) {
        const li = el('li', 'hq-ind-teacher__row');
        li.dataset.stuck = String(x.stuck);
        li.append(el('p', 'hq-ind-teacher__who', `Device ${x.id}`), tryLine('First', r.options, x.first, `${x.id}:first`));
        if (x.retry && r.backup) li.append(tryLine('Retry', r.backup.options, x.retry, `${x.id}:retry`));
        else if (x.first.tier !== 'right' && x.done && r.backup) li.append(el('p', 'block-secondary', 'Moved on without the retry.'));
        else if (!x.done) li.append(el('p', 'block-secondary', 'Retry not answered yet.'));
        ul.append(li);
      }
      return ul;
    };
    if (stuckRows.length) {
      const sec = el('section', 'hq-ind-teacher__group hq-ind-teacher__group--stuck');
      sec.append(el('h4', 'block-subtitle', 'Still stuck'), el('p', 'block-secondary', 'Missed it and didn’t get there on the retry. A word with each of these students is worth it.'), rows(stuckRows));
      parts.push(sec);
    }
    if (otherRows.length) {
      const sec = el('details', 'hq-ind-teacher__group');
      sec.open = !stuckRows.length;
      sec.append(el('summary', 'block-subtitle', `Everyone else’s reasons (${otherRows.length})`), rows(otherRows));
      parts.push(sec);
    }
    parts.push(el('p', 'hq-private block-secondary', 'Only you see this. Students see their own feedback, never anyone else’s answers.'));
    body.replaceChildren(...parts);
  }

  paint();
  poller(root, load);
  return root;
}
