/** Pure fitness recent-row focus matching (chart dot → recent sessions). */

/**
 * @param {Array<{ date?: string | null }>} rows
 * @param {string | null | undefined} date
 * @returns {boolean[]}
 */
export function matchFitnessRecentRows(rows, date) {
  if (!date) return rows.map(() => false);
  return rows.map((row) => row?.date === date);
}
