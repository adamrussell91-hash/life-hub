/** A saved career future, as `/api/career-futures` returns it. */
export type FutureRecord = {
  id: string;
  title: string;
  where: string | null;
  status: string;
  lane_order?: number;
  criteria?: Array<{ text: string; order?: number }>;
};

export type ApplicationPrefill = {
  position_title: string;
  /** Organisation name to look up and link, if the future names one. */
  where: string | null;
  selection_criteria: Array<{ criterion: string; order: number; completed: false }>;
};

/** Futures you can apply for: the ones on the river, not parked or only suggested. */
export function applicableFutures(futures: FutureRecord[] | null | undefined): FutureRecord[] {
  return (futures ?? []).filter((future) => future.status === 'active');
}

export function futureOptionLabel(future: FutureRecord): string {
  return future.where ? `${future.title} · ${future.where}` : future.title;
}

/** What the New application form takes from a chosen future. */
export function applicationPrefillFromFuture(future: FutureRecord): ApplicationPrefill {
  const criteria = [...(future.criteria ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c) => c.text.trim())
    .filter(Boolean);
  return {
    position_title: future.title,
    where: future.where?.trim() || null,
    selection_criteria: criteria.map((criterion, order) => ({ criterion, order, completed: false }))
  };
}
