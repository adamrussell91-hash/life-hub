// Seven days × four macros. Each row scales to its own week max (target included)
// so a dashed target line sits at the same height across the row.
export const WEEK_GRID_ROWS = [
  { key: 'protein', label: 'Protein', field: 'protein_g', target: 'protein_g', kind: 'target', unit: 'g' },
  { key: 'fat', label: 'Fat', field: 'fat_g', target: 'fat_ceiling_g', kind: 'ceiling', unit: 'g' },
  { key: 'energy', label: 'Energy', field: 'calories', target: 'calories', kind: 'band', unit: 'kcal' },
  { key: 'carbs', label: 'Carbs', field: 'carbs_g', target: null, kind: 'none', unit: 'g' }
];
const ENERGY_BAND = 0.1;

function cellState(kind, value, target) {
  if (kind === 'none' || !(target > 0)) return 'neutral';
  if (kind === 'target') return value >= target ? 'hit' : 'under';
  if (kind === 'ceiling') return value > target ? 'over' : 'ok';
  return Math.abs(value - target) / target <= ENERGY_BAND ? 'ok' : 'off';
}

function summary(row, cells) {
  const logged = cells.filter(cell => cell.logged);
  if (row.kind === 'none') return { text: 'no target', count: null, tone: 'muted' };
  if (row.kind === 'target') {
    const count = logged.filter(cell => cell.state === 'hit').length;
    return { text: `hit ${count}/7`, count, tone: 'muted' };
  }
  if (row.kind === 'ceiling') {
    const count = logged.filter(cell => cell.state === 'over').length;
    return { text: `over ${count}/7`, count, tone: count ? 'danger' : 'muted' };
  }
  const count = logged.filter(cell => cell.state === 'ok').length;
  return { text: `on target ${count}/7`, count, tone: 'muted' };
}

export function buildWeekGrid(days) {
  return WEEK_GRID_ROWS.map(row => {
    const values = days.map(day => (day.logged ? Number(day.totals?.[row.field]) : NaN));
    const targets = days.map(day => (row.target ? Number(day.targets?.[row.target]) || 0 : 0));
    const target = targets.find(value => value > 0) ?? 0;
    const max = Math.max(1, ...values.filter(Number.isFinite), ...targets);
    const cells = days.map((day, index) => {
      const value = values[index];
      if (!day.logged || !Number.isFinite(value)) {
        return { date: day.date, logged: false, value: null, pct: 0, state: 'none', target: targets[index] || target };
      }
      return {
        date: day.date,
        logged: true,
        value,
        pct: (value / max) * 100,
        state: cellState(row.kind, value, targets[index] || target),
        target: targets[index] || target
      };
    });
    return {
      ...row,
      max,
      targetPct: target > 0 ? (target / max) * 100 : null,
      cells,
      summary: summary(row, cells)
    };
  });
}
