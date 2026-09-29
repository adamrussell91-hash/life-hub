/**
 * "Day changed" sheet, shared by the Week (Tideline) and the Day dial.
 *   1. What happened? Running late (10/20/30/60) · Got derailed · Feeling worse · Plans changed · Tell me
 *   2. Hammond's proposals (queued as ghosts, nothing written yet) → Accept all · Not now
 *   3. One receipt: what moved, what stayed, what is still due today.
 * Accept goes through POST /api/calendar-ghosts, one ghost at a time, like any ghost.
 */
import { saveCalendarItem } from './calendar-item-actions.js';
import { buildRescuePlan, RESCUE_REASONS } from './rescue-plan.js';

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let open = null;

export function closeRescueSheet() {
  if (!open) return;
  open.node.remove();
  open.doc.removeEventListener('keydown', open.onKey, true);
  open.returnFocus?.focus?.({ preventScroll: true });
  open = null;
}

/**
 * @param {{ doc: Document, model: object, today: string, nowHour: number, lightsOut?: number,
 *   apiFetch?: Function, onQueued?: (ghosts: object[]) => void, onDone?: () => void }} opts
 */
export function openRescueSheet(opts) {
  closeRescueSheet();
  const { doc } = opts;
  const node = doc.createElement('div');
  node.className = 'cal-rescue';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-modal', 'true');
  node.setAttribute('aria-label', 'Day changed');
  node.dataset.part = 'rescue-sheet';
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeRescueSheet();
    }
  };
  open = { node, doc, onKey, returnFocus: doc.activeElement };
  doc.addEventListener('keydown', onKey, true);
  (doc.body ?? doc.documentElement).append(node);
  paintChoose(opts);
  node.addEventListener('click', (event) => {
    if (event.target === node) closeRescueSheet();
  });
}

function panel(html) {
  if (!open) return null;
  open.node.innerHTML = `<div class="cal-rescue__panel">${html}</div>`;
  const first = open.node.querySelector('button, input, textarea');
  first?.focus?.({ preventScroll: true });
  return open.node.querySelector('.cal-rescue__panel');
}

function paintChoose(opts) {
  const p = panel(
    `<div class="cal-rescue__head"><b>What changed?</b><button type="button" class="cal-rescue__x" data-rescue="close" aria-label="Close">×</button></div>`
    + `<p class="cal-rescue__sub">Hammond rearranges the rest of today. Lessons, appointments, Corey and anything social stay put. Nothing changes until you accept.</p>`
    + `<div class="cal-rescue__choices">`
    + `<button type="button" class="cal-rescue__choice" data-rescue="late"><b>${RESCUE_REASONS.late}</b><span>shift what's next</span></button>`
    + `<button type="button" class="cal-rescue__choice" data-rescue="derailed"><b>${RESCUE_REASONS.derailed}</b><span>keep today's must-do, move the rest</span></button>`
    + `<button type="button" class="cal-rescue__choice" data-rescue="worse"><b>${RESCUE_REASONS.worse}</b><span>clear the afternoon, protect a rest</span></button>`
    + `<button type="button" class="cal-rescue__choice" data-rescue="changed"><b>${RESCUE_REASONS.changed}</b><span>clear today's flexible work</span></button>`
    + `</div>`
    + `<div class="cal-rescue__late" hidden><span>How late?</span>`
    + [10, 20, 30, 60].map((m) => `<button type="button" class="btn btn--secondary" data-rescue-late="${m}">${m} min</button>`).join('')
    + `</div>`
    + `<label class="cal-rescue__tell"><span>Or tell me (optional)</span><textarea rows="2" name="note" placeholder="e.g. IT outage ate my free period"></textarea></label>`
    + `<div class="cal-rescue__acts"><button type="button" class="btn btn--secondary" data-rescue="tell">Use what I wrote</button></div>`
  );
  p?.addEventListener('click', (event) => {
    const button = event.target?.closest?.('button');
    if (!button) return;
    const note = p.querySelector('textarea')?.value ?? '';
    const act = button.dataset.rescue;
    if (act === 'close') return closeRescueSheet();
    if (act === 'late') {
      const late = p.querySelector('.cal-rescue__late');
      late.hidden = false;
      late.removeAttribute('hidden');
      late.querySelector('button')?.focus?.();
      return;
    }
    if (button.dataset.rescueLate) return void propose(opts, 'late', { lateMinutes: Number(button.dataset.rescueLate), note });
    if (act === 'tell') {
      if (!note.trim()) {
        p.querySelector('textarea')?.focus?.();
        return;
      }
      return void propose(opts, 'changed', { note });
    }
    if (act === 'derailed' || act === 'worse' || act === 'changed') return void propose(opts, act, { note });
  });
}

async function propose(opts, reason, { lateMinutes = 0, note = '' } = {}) {
  const plan = buildRescuePlan({
    model: opts.model,
    today: opts.today,
    nowHour: opts.nowHour,
    reason,
    lateMinutes,
    note,
    lightsOut: opts.lightsOut ?? 22
  });
  if (!plan.ghosts.length) {
    paintReceipt({ moved: [], failed: [], plan, headline: 'Nothing needs to move.', lead: 'The rest of today is fixed commitments or already clear.' });
    return;
  }
  panel(`<p class="cal-rescue__sub">Hammond is lining that up…</p>`);
  let queued;
  try {
    const request = opts.apiFetch ?? globalThis.fetch;
    const response = await request('/api/calendar-rescue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason, ghosts: plan.ghosts })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message || 'Could not queue the rescue.');
    queued = payload.data?.ghosts ?? [];
  } catch (error) {
    panel(`<div class="cal-rescue__head"><b>Not queued</b><button type="button" class="cal-rescue__x" data-rescue="close" aria-label="Close">×</button></div>`
      + `<p class="cal-rescue__sub">${esc(error?.message || 'Could not reach the server.')} Nothing changed.</p>`)
      ?.addEventListener('click', (event) => { if (event.target?.closest?.('[data-rescue="close"]')) closeRescueSheet(); });
    return;
  }
  opts.onQueued?.(queued);
  paintProposals(opts, plan, queued);
}

function list(title, rows, cls = '') {
  if (!rows.length) return '';
  return `<p class="cal-rescue__label">${esc(title)}</p><ul class="cal-rescue__list ${cls}">${rows.map((row) => `<li>${esc(row)}</li>`).join('')}</ul>`;
}

function paintProposals(opts, plan, queued) {
  // Dock aside so the proposals can be watched sliding into place on the calendar.
  open?.node?.classList?.add?.('is-docked');
  open?.node?.setAttribute?.('aria-modal', 'false');
  const p = panel(
    `<div class="cal-rescue__head"><b>${esc(plan.why)}</b><button type="button" class="cal-rescue__x" data-rescue="close" aria-label="Close">×</button></div>`
    + `<p class="cal-rescue__sub">Hammond suggests ${queued.length} change${queued.length === 1 ? '' : 's'}. They're on the calendar as dashed proposals.</p>`
    + list('Would change', queued.map((ghost) => ghost.kind === 'protect_block'
      ? `Protect ${ghost.start}–${ghost.end} to rest`
      : plan.moved.find((row) => row.startsWith(ghost.title)) ?? ghost.label))
    + list('Stays as it is', plan.kept.slice(0, 6), 'is-kept')
    + list('Still due today (your call)', plan.dueToday.slice(0, 4), 'is-due')
    + `<div class="cal-rescue__acts"><button type="button" class="btn btn--primary" data-rescue="accept">Accept all</button><button type="button" class="btn btn--ghost" data-rescue="later">Not now</button></div>`
  );
  p?.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('button');
    if (!button) return;
    if (button.dataset.rescue === 'close' || button.dataset.rescue === 'later') {
      closeRescueSheet();
      return;
    }
    if (button.dataset.rescue !== 'accept') return;
    p.querySelectorAll('button').forEach((btn) => { btn.disabled = true; });
    button.textContent = 'Saving…';
    const moved = [];
    const failed = [];
    const request = opts.apiFetch ?? globalThis.fetch;
    for (const ghost of queued) {
      try {
        const response = await request('/api/calendar-ghosts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: ghost.id, decision: 'accept' })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || 'not saved');
        moved.push(typeof payload?.receipt === 'string' && payload.receipt ? payload.receipt : ghost.label);
      } catch (error) {
        failed.push(`${ghost.label}: ${error?.message || 'not saved'}`);
      }
    }
    paintReceipt({ moved, failed, plan, headline: failed.length ? 'Partly done.' : 'Done.', apiFetch: opts.apiFetch, onDone: opts.onDone });
    opts.onDone?.();
  });
}

function bookmarkFields(rows) {
  if (!rows?.length) return '';
  return `<section class="cal-rescue__bookmarks" data-part="rescue-bookmarks"><b>Leave yourself a way back in?</b>`
    + rows.map((row) => `<label class="cal-rescue__bm"><span>${esc(row.title)}</span>`
      + `<input type="text" maxlength="280" data-task="${esc(row.taskId)}" placeholder="${esc(row.previous ? `Last time: ${row.previous}` : 'Where you were up to')}"></label>`).join('')
    + `<div class="cal-rescue__acts"><button type="button" class="btn btn--secondary" data-rescue="bookmarks">Keep these</button></div></section>`;
}

async function saveBookmarks(section, apiFetch, onDone) {
  const inputs = [...section.querySelectorAll('input[data-task]')].filter((input) => input.value.trim());
  const button = section.querySelector('[data-rescue="bookmarks"]');
  if (!inputs.length) {
    section.remove();
    return;
  }
  if (button) button.disabled = true;
  let failed = 0;
  for (const input of inputs) {
    try {
      await saveCalendarItem(apiFetch, { record: { type: 'task', id: input.dataset.task } }, { bookmark: input.value });
    } catch {
      failed += 1;
    }
  }
  section.innerHTML = failed
    ? `<p class="cal-rescue__sub is-failed">${failed} not saved. Add it from the task card.</p>`
    : '<p class="cal-rescue__sub">Kept. They will be waiting on the tasks.</p>';
  onDone?.();
}

function paintReceipt({ moved, failed, plan, headline, lead = '', apiFetch, onDone }) {
  const p = panel(
    `<div class="cal-rescue__head"><b>${esc(headline)}</b><button type="button" class="cal-rescue__x" data-rescue="close" aria-label="Close">×</button></div>`
    + (lead ? `<p class="cal-rescue__sub">${esc(lead)}</p>` : '')
    + list('Changed', moved)
    + list('Not saved (still pending, try from Review)', failed, 'is-failed')
    + list('Untouched', plan.kept.slice(0, 6), 'is-kept')
    + list('Still due today (your call)', plan.dueToday.slice(0, 4), 'is-due')
    + (moved.length ? bookmarkFields(plan.interrupted) : '')
    + `<p class="cal-rescue__sub">Receipts are in Central Node › Recent Agent Actions.</p>`
    + `<div class="cal-rescue__acts"><button type="button" class="btn btn--primary" data-rescue="close">Close</button></div>`
  );
  p?.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-rescue="close"]')) closeRescueSheet();
    const keep = event.target?.closest?.('[data-rescue="bookmarks"]');
    if (keep) void saveBookmarks(keep.closest('[data-part="rescue-bookmarks"]'), apiFetch, onDone);
  });
}
