import type { JournalDocument } from '@/api/journal';
import type { JournalMedia, JournalMoment } from '@/journal/types';

export interface ReimportOptions {
  /** When true, matching live media may receive incoming url/size metadata. */
  updateMediaBytes?: boolean;
}

function normChecksum(checksum?: string): string | null {
  const c = checksum?.trim().toLowerCase();
  return c && c.length >= 64 ? c : null;
}

function preserveManualMoment(existing: JournalMoment, incoming: JournalMoment): JournalMoment {
  const merged: JournalMoment = {
    ...incoming,
    id: existing.id,
    lifecycle: existing.lifecycle === 'deleted' ? 'deleted' : incoming.lifecycle,
    display_order: existing.display_order,
  };

  if (existing.lifecycle === 'deleted') {
    return { ...existing };
  }

  if (existing.location_source === 'manual') {
    merged.place = existing.place;
    merged.coordinates = existing.coordinates;
    merged.location_source = existing.location_source;
  }

  if (existing.local_time) merged.local_time = existing.local_time;
  if (existing.text?.trim()) merged.text = existing.text;

  const mediaIds = [...existing.media_ids];
  for (const id of incoming.media_ids) {
    if (!mediaIds.includes(id)) mediaIds.push(id);
  }
  merged.media_ids = mediaIds;

  return merged;
}

function mergeMedia(
  existing: JournalMedia[],
  incoming: JournalMedia[],
  opts: ReimportOptions,
): JournalMedia[] {
  const byChecksum = new Map<string, JournalMedia>();
  const deletedChecksums = new Set<string>();
  for (const row of existing) {
    const sum = normChecksum(row.checksum);
    if (!sum) continue;
    if (row.lifecycle === 'deleted') deletedChecksums.add(sum);
    else if (!byChecksum.has(sum)) byChecksum.set(sum, row);
  }

  const out = [...existing];
  const knownIds = new Set(existing.map((m) => m.id));

  for (const row of incoming) {
    const sum = normChecksum(row.checksum);
    if (sum && deletedChecksums.has(sum)) continue;

    if (sum && byChecksum.has(sum)) {
      if (!opts.updateMediaBytes) continue;
      const idx = out.findIndex((m) => m.id === byChecksum.get(sum)!.id);
      if (idx === -1) continue;
      out[idx] = {
        ...out[idx]!,
        url: row.url ?? out[idx]!.url,
        width: row.width ?? out[idx]!.width,
        height: row.height ?? out[idx]!.height,
      };
      continue;
    }

    if (knownIds.has(row.id)) continue;
    if (sum && deletedChecksums.has(sum)) continue;
    out.push(row);
    knownIds.add(row.id);
    if (sum) byChecksum.set(sum, row);
  }

  return out.map((row) => {
    const sum = normChecksum(row.checksum);
    if (!sum || row.caption?.trim()) return row;
    const incomingRow = incoming.find((m) => normChecksum(m.checksum) === sum);
    if (!incomingRow?.caption?.trim()) return row;
    return { ...row, caption: incomingRow.caption };
  });
}

function indexById<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}

export function applyReimport(
  existing: JournalDocument,
  incoming: JournalDocument,
  opts: ReimportOptions = {},
): JournalDocument {
  const media = mergeMedia(existing.media, incoming.media, opts);
  const mediaIds = new Set(media.map((m) => m.id));

  const existingMoments = indexById(existing.moments);
  const mergedMoments: JournalMoment[] = [];
  const seenMomentIds = new Set<string>();

  for (const row of existing.moments) {
    const next = incoming.moments.find((m) => m.id === row.id);
    if (next) {
      mergedMoments.push(preserveManualMoment(row, next));
    } else {
      mergedMoments.push(row);
    }
    seenMomentIds.add(row.id);
  }

  for (const row of incoming.moments) {
    if (seenMomentIds.has(row.id)) continue;
    if (row.media_ids.some((id) => !mediaIds.has(id))) continue;
    mergedMoments.push(row);
    seenMomentIds.add(row.id);
  }

  const existingTransitions = indexById(existing.transitions);
  const transitions = incoming.transitions.map((trn) => {
    const prev = existingTransitions.get(trn.id);
    if (!prev) return trn;
    if (prev.lifecycle === 'deleted') return prev;
    return {
      ...trn,
      display_override: prev.display_override ?? trn.display_override,
      lifecycle: prev.lifecycle,
    };
  });
  for (const trn of existing.transitions) {
    if (!incoming.transitions.some((t) => t.id === trn.id)) {
      transitions.push(trn);
    }
  }

  const keepDeleted = <T extends { id: string; lifecycle: string }>(
    existingRows: T[],
    incomingRows: T[],
  ): T[] => {
    const incomingById = indexById(incomingRows);
    const out = incomingRows.map((row) => {
      const prev = existingRows.find((r) => r.id === row.id);
      if (prev?.lifecycle === 'deleted') return prev;
      return row;
    });
    for (const row of existingRows) {
      if (row.lifecycle === 'deleted' && !incomingById.has(row.id)) out.push(row);
    }
    return out;
  };

  return {
    ...incoming,
    revision: existing.revision,
    media,
    moments: mergedMoments,
    transitions,
    legs: keepDeleted(existing.legs, incoming.legs),
    days: keepDeleted(existing.days, incoming.days),
  };
}
