import type { Goal } from '@/schemas/goal';
import { agentBySlug } from '@/chat/agents';
import { describeGhost, orderReadsForStrip, REASON_LABEL, type GoalGhost, type GoalReadEnvelope } from '@/domain/goal-reads';
import { tasksApi } from '@/services/client-api';
import { errorMessage } from '@/views/feedback';
import { el } from '@/views/hub-kit';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { showHubToast } from '../../../../packages/design-kit/js/hub-feedback.js';
import { checkInProminent, checkInStripLine, openSundayCheckIn } from '@/views/goals-checkin';
import { sydneyToday } from '@/domain/goal-runway';

function avatar(): HTMLImageElement {
  const img = el('img');
  img.src = agentBySlug('hammond').avatarSrc;
  img.alt = '';
  return img;
}

function decide(ghost: GoalGhost, decision: 'accept' | 'dismiss', done: () => void): void {
  void tasksApi
    .decideGhost(ghost.id, decision)
    .then((result) => {
      showHubToast(result.receipt);
      done();
    })
    .catch((err) => showHubToast(errorMessage(err, 'That proposal could not be applied.')));
}

function confirmCard(ghost: GoalGhost, onAccepted: () => void): HTMLElement {
  const info = describeGhost(ghost);
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');
  card.append(el('p', 'hammond__kind', info.kind), el('p', 'hammond__title', info.title));
  if (info.why) card.append(el('p', 'hammond__why', info.why));
  if (info.diff) {
    const diff = el('div', 'hammond__diff');
    if (info.diff.before) diff.append(el('s', '', info.diff.before), el('br'));
    info.diff.after.forEach((line, index) => {
      if (index) diff.append(el('br'));
      diff.append(el('ins', '', line));
    });
    card.append(diff);
  }
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  discard.dataset.decision = 'dismiss';
  discard.addEventListener('click', () => decide(ghost, 'dismiss', () => card.remove()));
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  confirm.dataset.decision = 'accept';
  confirm.addEventListener('click', () => decide(ghost, 'accept', onAccepted));
  actions.append(discard, confirm);
  card.append(actions);
  return card;
}

function renderPanel(host: HTMLElement, goal: Goal, envelope: GoalReadEnvelope, onApplied: () => void): void {
  const root = el('section', 'hammond');
  root.setAttribute('aria-label', 'General Hammond');
  const who = el('div', 'hammond__who');
  const copy = el('div');
  const stamp = el('p', 'hammond__stamp');
  const read = envelope.read;
  stamp.append(
    document.createTextNode(
      read ? `Read ${formatDisplayDate(read.computed_on)} · ${REASON_LABEL[envelope.reason] ?? envelope.reason} · ` : 'No read yet · '
    )
  );
  const rescan = el('button', '', 'Rescan');
  rescan.type = 'button';
  rescan.addEventListener('click', () => {
    rescan.disabled = true;
    void tasksApi.rescanGoalRead(goal.id).then((next) => renderPanel(host, goal, next, onApplied));
  });
  stamp.append(rescan);
  copy.append(el('p', '', 'General Hammond'), stamp);
  who.append(avatar(), copy);
  root.append(who);
  if (read) {
    const verdict = el('p', 'hammond__read', read.verdict);
    if (read.verdict_source === 'model') {
      const mark = el('span', 'hammond__ai', '✦');
      mark.title = 'Written by Hammond (AI)';
      verdict.prepend(mark, document.createTextNode(' '));
    }
    root.append(verdict);
    const looked = el('div', 'hammond__looked');
    read.looked_at.forEach((label) => looked.append(el('span', '', label)));
    root.append(looked, el('p', 'hammond__head', 'Proposals · nothing changes until you confirm'));
    if (read.ghosts.length === 0) root.append(el('p', 'hammond__why', 'Nothing to propose right now. Keep going.'));
    read.ghosts.forEach((ghost) => root.append(confirmCard(ghost, onApplied)));
  }
  const ask = el('a', 'btn btn--secondary hammond__ask', 'Ask Hammond about this goal…') as HTMLAnchorElement;
  const move = goal.next_start ? ` Next move: ${goal.next_start}.` : '';
  ask.href = `#/clare?agent=hammond&prompt=${encodeURIComponent(`Help me with ${goal.title}.${move}`)}`;
  root.append(ask);
  host.replaceChildren(root);
}

/** Hammond's column on a goal page. Reads are cached server-side; this call is cheap. */
export function mountHammondPanel(host: HTMLElement, goal: Goal, onApplied: () => void): void {
  host.replaceChildren(el('p', 'canvas-status', 'Hammond is reading this goal…'));
  void tasksApi
    .getGoalRead(goal.id)
    .then((envelope) => renderPanel(host, goal, envelope, onApplied))
    .catch((err) => host.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Hammond could not read this goal.'))));
}

/** The landing strip: coldest two verdicts and up to two proposal chips across all goals. */
export function renderHammondStrip(host: HTMLElement, envelopes: GoalReadEnvelope[], goals: Goal[], onApplied: () => void): void {
  const reads = orderReadsForStrip(envelopes.flatMap((e) => (e.read ? [e.read] : [])));
  const today = sydneyToday();
  if (!reads.length) {
    const strip = el('section', 'hammond-strip');
    strip.setAttribute('aria-label', 'General Hammond');
    const body = el('div');
    body.append(el('p', 'hammond__stamp', 'General Hammond'), el('p', 'empty-state', 'Hammond has no read yet.'));
    const checkBtn = el('button', `btn ${checkInProminent(today) ? 'btn--primary' : 'btn--ghost'}`, 'Sunday check-in');
    checkBtn.type = 'button';
    checkBtn.dataset.action = 'sunday-checkin';
    checkBtn.addEventListener('click', () => openSundayCheckIn(host, goals, envelopes, today, onApplied));
    body.append(checkBtn);
    strip.append(avatar(), body, el('span'));
    host.replaceChildren(strip);
    return;
  }
  const titles = new Map(goals.map((g) => [g.id, g.title]));
  const strip = el('section', 'hammond-strip');
  strip.setAttribute('aria-label', 'General Hammond');
  const body = el('div');
  const latest = envelopes.find((e) => e.read?.goal_id === reads[0]!.goal_id);
  body.append(
    el('p', 'hammond__stamp', `General Hammond · ${REASON_LABEL[latest?.reason ?? 'daily'] ?? 'daily read'}`),
    el('p', 'hammond-strip__read', reads.slice(0, 2).map((r) => `${titles.get(r.goal_id) ?? 'Goal'}: ${r.verdict}`).join(' '))
  );
  const chips = el('div', 'hammond-strip__chips');
  for (const ghost of reads.flatMap((r) => r.ghosts).slice(0, 2)) {
    const chip = el('span', 'hammond-chip', describeGhost(ghost).title);
    const discard = el('button', 'is-discard', 'Discard');
    discard.type = 'button';
    discard.addEventListener('click', () => decide(ghost, 'dismiss', () => chip.remove()));
    const confirm = el('button', 'is-confirm', 'Confirm');
    confirm.type = 'button';
    confirm.addEventListener('click', () => decide(ghost, 'accept', onApplied));
    chip.append(discard, confirm);
    chips.append(chip);
  }
  body.append(chips);
  if (![...reads.flatMap((r) => r.ghosts)].length) {
    body.append(el('p', 'empty-state', 'Nothing to change. Keep going.'));
  }
  const checkBtn = el('button', `btn ${checkInProminent(today) ? 'btn--primary' : 'btn--ghost'}`, 'Sunday check-in');
  checkBtn.type = 'button';
  checkBtn.dataset.action = 'sunday-checkin';
  checkBtn.addEventListener('click', () => openSundayCheckIn(host, goals, envelopes, today, onApplied));
  body.append(checkBtn);
  void tasksApi
    .getGoalCheckins()
    .then((data) => {
      const line = checkInStripLine(data?.checkin ?? null, today);
      if (line) body.append(el('p', 'hammond-strip__checkin', line));
    })
    .catch(() => undefined);
  strip.append(avatar(), body, el('span'));
  host.replaceChildren(strip);
}
