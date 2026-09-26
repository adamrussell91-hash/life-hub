import { PENDING_CALENDAR_GHOSTS_PATH, appendPendingCalendarGhost } from '../calendar-ghosts.mjs';

/** Append one ghost to pending-calendar-ghosts.json. The same write chat.mjs does for propose_calendar_ghost. */
export async function enqueueCalendarGhost({ client, decodeBlob, entry }) {
  const tree = await client.resolveTree();
  const blob = (tree.tree ?? []).find((item) => item.path === PENDING_CALENDAR_GHOSTS_PATH && item.type === 'blob');
  const prior = blob ? decodeBlob(await client.readBlob(blob.sha)) : '[]';
  const { content, added } = appendPendingCalendarGhost(prior, entry);
  if (added) {
    await client.writeFile({
      path: PENDING_CALENDAR_GHOSTS_PATH,
      content,
      ...(blob?.sha ? { sha: blob.sha } : {}),
      message: `chore(calendar): propose ${entry.id}`
    });
  }
  return { added, id: entry.id };
}
