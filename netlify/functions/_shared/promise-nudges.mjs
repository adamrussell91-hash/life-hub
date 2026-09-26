import { validateGhost } from '../../../packages/design-kit/js/calendar/ghost-writes.js';
import { createLedgerItemRepository } from './ledger-repository.mjs';
import { defaultGetProfessionalStore } from './professional-blobs.mjs';
import { enqueueCalendarGhost } from './calendar-ghost-queue.mjs';
import { createGitHubClient } from './github-client.mjs';
import { decodeBlob } from './decode-blob.mjs';
import { fetchPeopleNames } from './promise-nudges-names.mjs';

function daysBetween(fromKey, toKey) {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

export function selectLatePromises(items, todayKey, minDaysLate = 2) {
  return items.filter((item) => item.direction === 'you_owe' && item.status === 'open' && item.due && daysBetween(item.due, todayKey) >= minDaysLate);
}

/**
 * One draft per late promise. The draft is a starting point Adam edits and sends himself.
 * The id is stable per ledger item, so a dismissed nudge never comes back the next day.
 */
export function latePromiseGhosts(late, namesByRef, nowIso) {
  const today = nowIso.slice(0, 10);
  return late.map((item) => {
    const to = namesByRef[item.person_ref] ?? 'them';
    const days = daysBetween(item.due, today);
    const ghost = {
      id: `clare-nudge-${item.id}`,
      agent: 'clare',
      kind: 'draft_message',
      to,
      text: `Hi ${to.split(' ')[0]},\n\nSorry this is later than I said. ${item.text}.\n\n`,
      reason: `${days} days late`,
      ledger_id: item.id,
      created_at: nowIso,
      status: 'pending',
      via: 'promise-nudges'
    };
    validateGhost(ghost);
    return ghost;
  });
}

export async function runPromiseNudges({ env, now = new Date(), deps = {} }) {
  const store = await (deps.getStore ?? defaultGetProfessionalStore)(env);
  const ledger = createLedgerItemRepository({ store });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(now);
  const from = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(now.getTime() - 60 * 86_400_000));
  const late = selectLatePromises(await ledger.listDueBetween(from, today), today, 2);
  if (!late.length) return { queued: 0 };
  const names = await (deps.names ?? fetchPeopleNames)(env, late.map((item) => item.person_ref));
  const nowIso = `${today}T07:00:00+10:00`;
  let queued = 0;
  for (const entry of latePromiseGhosts(late, names, nowIso)) {
    const result = await (deps.enqueue ?? ((e) => enqueueCalendarGhost({ client: createGitHubClient({ env }), decodeBlob, entry: e })))(entry);
    if (result.added) queued += 1;
  }
  return { queued };
}
