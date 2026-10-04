// Thirty days of protein against the day's target, oldest first.
export function buildConsistencyStrip(month) {
  const goal = month.find(day => day.proteinTarget > 0)?.proteinTarget ?? 0;
  const max = Math.max(1, goal, ...month.map(day => Number(day.protein_g) || 0));
  let run = 0;
  let bestRun = 0;
  const bars = month.map((day, index) => {
    const protein = Number(day.protein_g) || 0;
    const state = protein <= 0 ? 'none' : day.hitProtein ? 'hit' : 'under';
    run = state === 'hit' ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
    return {
      date: day.date,
      protein_g: protein,
      target: day.proteinTarget ?? 0,
      pct: (protein / max) * 100,
      state,
      label: (index % 7 === 0 && index < month.length - 3) || index === month.length - 1
    };
  });
  return {
    bars,
    goalPct: goal > 0 ? (goal / max) * 100 : null,
    hits: bars.filter(bar => bar.state === 'hit').length,
    bestRun,
    days: month.length
  };
}
