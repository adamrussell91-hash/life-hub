import { chord } from './d3-layout.js';

function uniqueThemes(edges) {
  const themes = [];
  for (const edge of edges) {
    if (edge.themeA && !themes.includes(edge.themeA)) themes.push(edge.themeA);
    if (edge.themeB && !themes.includes(edge.themeB)) themes.push(edge.themeB);
  }
  return themes;
}

function equalArcs(themes) {
  const step = themes.length ? (2 * Math.PI) / themes.length : 0;
  return themes.map((key, index) => ({
    key,
    startAngle: index * step,
    endAngle: (index + 1) * step,
    value: 1
  }));
}

export function buildChordLayout(cooccurrence) {
  const edges = cooccurrence ?? [];
  const themes = uniqueThemes(edges);
  if (!themes.length) return { themes, arcs: [], ribbons: [] };
  try {
    const n = themes.length;
    const matrix = Array.from({ length: n }, () => Array(n).fill(0));
    for (const edge of edges) {
      const i = themes.indexOf(edge.themeA);
      const j = themes.indexOf(edge.themeB);
      if (i < 0 || j < 0) continue;
      matrix[i][j] += Number(edge.count) || 0;
      if (i !== j) matrix[j][i] += Number(edge.count) || 0;
    }
    const layout = chord()(matrix);
    return {
      themes,
      arcs: (layout.groups ?? []).map((group, index) => ({
        key: themes[index],
        startAngle: group.startAngle,
        endAngle: group.endAngle,
        value: group.value
      })),
      ribbons: [...layout]
    };
  } catch {
    return { themes, arcs: equalArcs(themes), ribbons: [] };
  }
}
