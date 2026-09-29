/**
 * The train-home pass: about 60 seconds, big targets, thumb-reachable.
 *   1. Blocks that ended today: Mostly worked · Mixed · Blocked · Didn't start
 *   2. Tasks worked on today: "Where did you leave it?" (optional, one line)
 *   3. Tomorrow's first thing, shown, not asked.
 * Save writes outcomes to the work blocks and notes to the tasks (POST /api/day-review).
 * "Not today" writes nothing: an ignored pass is unknown, never a verdict.
 */
const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clock = (hours) => {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'pm' : 'am'}`;
};
const weekday = (date) => new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

export const OUTCOME_LABEL = Object.freeze({
  worked: 'Mostly worked',
  mixed: 'Mixed',
  blocked: 'Blocked',
  not_started: "Didn't start"
});

/** What the pass asks about (pure). */
export function reviewContent(model, today, nowHour) {
  const day = model?.days?.find((row) => row.date === today);
  if (!day) return { blocks: [], tasks: [], tomorrow: null };
  const blocks = (day.chips ?? [])
    .filter((chip) => chip.source === 'work_block' && !chip.ghost && chip.end <= nowHour + 0.01 && !chip.record?.outcome)
    .sort((a, b) => a.start - b.start)
    .slice(0, 4)
    .map((chip) => ({ id: chip.id, title: chip.title, when: `${clock(chip.start)}–${clock(chip.end)}` }));
  const seen = new Set();
  const tasks = [];
  const titleOf = new Map([...(day.due ?? []).map((row) => [row.id, row]), ...(day.chips ?? []).filter((c) => c.record?.task_id).map((c) => [c.record.task_id, c])]);
  for (const span of day.actual ?? []) {
    if (!span.taskId || seen.has(span.taskId)) continue;
    seen.add(span.taskId);
    const known = titleOf.get(span.taskId);
    if (known?.record?.status === 'done') continue;
    tasks.push({ id: span.taskId, title: span.title, previous: known?.record?.bookmark?.note ?? '' });
    if (tasks.length >= 3) break;
  }
  const next = model.days.find((row) => row.date > today);
  const first = next ? [...(next.chips ?? [])].filter((c) => !c.ghost).sort((a, b) => a.start - b.start)[0] : null;
  const tomorrow = next
    ? { date: next.date, text: first ? `${weekday(next.date)}: ${first.title} at ${clock(first.start)}` : `${weekday(next.date)}: nothing booked yet` }
    : null;
  return { blocks, tasks, tomorrow };
}

let openNode = null;

export function closeDayReview() {
  openNode?.remove();
  openNode = null;
}

/**
 * @param {{ doc: Document, model: object, today: string, nowHour: number, apiFetch?: Function, onSaved?: () => void }} opts
 */
export function openDayReview(opts) {
  closeDayReview();
  const { doc } = opts;
  const content = reviewContent(opts.model, opts.today, opts.nowHour);
  const node = doc.createElement('div');
  node.className = 'cal-rescue';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-modal', 'true');
  node.setAttribute('aria-label', 'Today, in 60 seconds');
  node.dataset.part = 'day-review';
  openNode = node;
  const choices = content.blocks.map((block) => `<div class="cal-review-q" data-block="${esc(block.id)}"><p><b>${esc(block.title)}</b> <span>${esc(block.when)}</span></p>`
    + `<div class="cal-review-q__opts" role="group" aria-label="How did ${esc(block.title)} go?">${Object.entries(OUTCOME_LABEL).map(([id, label]) => `<button type="button" aria-pressed="false" data-outcome="${id}">${label}</button>`).join('')}</div></div>`).join('');
  const notes = content.tasks.map((task) => `<label class="cal-rescue__tell" data-task="${esc(task.id)}"><span>Where did you leave ${esc(task.title)}?</span>`
    + `<input type="text" maxlength="280" placeholder="${esc(task.previous ? `Last time: ${task.previous}` : 'e.g. stopped at Q4 feedback')}"></label>`).join('');
  const empty = !content.blocks.length && !content.tasks.length;
  node.innerHTML = `<div class="cal-rescue__panel">`
    + `<div class="cal-rescue__head"><b>Today, in 60 seconds</b><button type="button" class="cal-rescue__x" data-review="close" aria-label="Close">×</button></div>`
    + (empty ? `<p class="cal-rescue__sub">Nothing to check off: no blocks ended today and nothing was tracked.</p>` : '')
    + (content.blocks.length ? `<p class="cal-rescue__label">How did these go?</p>${choices}` : '')
    + (content.tasks.length ? `<p class="cal-rescue__label">A way back in (optional)</p>${notes}` : '')
    + (content.tomorrow ? `<p class="cal-rescue__label">Tomorrow</p><p class="cal-rescue__sub">${esc(content.tomorrow.text)}</p>` : '')
    + `<p class="cal-review-err" role="alert" hidden></p>`
    + `<div class="cal-rescue__acts">${empty ? '' : '<button type="button" class="btn btn--primary" data-review="save">Save</button>'}<button type="button" class="btn btn--ghost" data-review="close">${empty ? 'Close' : 'Not today'}</button></div>`
    + `</div>`;
  (doc.body ?? doc.documentElement).append(node);
  node.querySelector('button')?.focus?.({ preventScroll: true });
  node.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDayReview(); });
  node.addEventListener('click', async (event) => {
    if (event.target === node) return closeDayReview();
    const button = event.target?.closest?.('button');
    if (!button) return;
    if (button.dataset.outcome) {
      button.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button && b.getAttribute('aria-pressed') !== 'true')));
      return;
    }
    if (button.dataset.review === 'close') return closeDayReview();
    if (button.dataset.review !== 'save') return;
    const outcomes = [...node.querySelectorAll('[data-block]')].map((row) => ({
      blockId: row.dataset.block,
      outcome: row.querySelector('[aria-pressed="true"]')?.dataset.outcome
    })).filter((row) => row.outcome);
    const bookmarks = [...node.querySelectorAll('[data-task]')].map((row) => ({
      taskId: row.dataset.task,
      note: row.querySelector('input')?.value?.trim() ?? ''
    })).filter((row) => row.note);
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const request = opts.apiFetch ?? globalThis.fetch;
      const response = await request('/api/day-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: opts.today, outcomes, bookmarks })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message || 'Could not save.');
      node.querySelector('.cal-rescue__panel').innerHTML = `<div class="cal-rescue__head"><b>Saved.</b><button type="button" class="cal-rescue__x" data-review="close" aria-label="Close">×</button></div>`
        + `<p class="cal-rescue__sub">${outcomes.length} block${outcomes.length === 1 ? '' : 's'} noted${bookmarks.length ? `, ${bookmarks.length} way${bookmarks.length === 1 ? '' : 's'} back in kept` : ''}. See you tomorrow.</p>`
        + `<div class="cal-rescue__acts"><button type="button" class="btn btn--primary" data-review="close">Close</button></div>`;
      opts.onSaved?.();
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Save';
      const err = node.querySelector('.cal-review-err');
      if (err) {
        err.textContent = `${error?.message || 'Could not save.'} Nothing was changed.`;
        err.hidden = false;
      }
    }
  });
}
