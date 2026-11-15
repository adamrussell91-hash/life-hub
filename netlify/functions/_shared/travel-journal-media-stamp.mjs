/**
 * Record one stored journal object (a photo copy or an original) on its media
 * row. The row is `backed_up` only once its original is stored: the copies go
 * up first, so a backed-up photo has everything, and a photo whose original is
 * still on the phone keeps showing from the phone.
 */
export function applyStoredJournalMedia(journal, stored) {
  const idx = journal.media.findIndex((item) => item.id === stored.media_id);
  if (idx < 0) {
    const err = new Error('Media not found in journal.');
    err.code = 'not_found';
    err.status = 404;
    throw err;
  }
  const media = { ...journal.media[idx] };
  if (stored.purpose === 'original') {
    media.upload_state = 'backed_up';
    media.original_key = stored.key;
    media.byte_size = stored.byte_size;
    media.checksum = stored.checksum;
    if (stored.content_type) media.content_type = stored.content_type;
  } else {
    const derivative_keys = { ...(media.derivative_keys ?? {}) };
    derivative_keys[String(stored.derivative_width)] = stored.key;
    media.derivative_keys = derivative_keys;
  }
  return {
    ...journal,
    revision: journal.revision + 1,
    media: journal.media.map((item, i) => (i === idx ? media : item))
  };
}

/**
 * Apply it to the latest journal rather than the client's version: uploads
 * finish in any order, and a version moved on by another save must not fail
 * the backup.
 */
export async function stampStoredJournalMedia(repo, stored) {
  for (let attempt = 0; ; attempt += 1) {
    const { journal, version } = await repo.getJournal(stored.trip_id);
    const next = applyStoredJournalMedia(journal, stored);
    try {
      return await repo.saveJournal(next, version, `travel-journal: verify media ${stored.media_id}`);
    } catch (error) {
      if (error?.code !== 'conflict' || attempt >= 3) throw error;
    }
  }
}
