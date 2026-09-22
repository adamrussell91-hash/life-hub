/** Weight and composition files used by Body chart browser tests. Same series as tests/unit/body-charts.test.js. */

const WEIGHTS = [
  ['2024-01-10', 118.0],
  ['2024-04-12', 130.2],
  ['2024-07-01', 121.4],
  ['2024-10-01', 112.0],
  ['2025-04-01', 96.5],
  ['2025-05-19', 95.9],
  ['2025-10-01', 90.0],
  ['2026-08-11', 87.4],
  ['2026-09-01', 87.0],
  ['2026-09-19', 86.9],
  ['2026-09-22', 86.3]
];

const COMPOSITIONS = [
  ['2023-11-04', { body_fat_pct: 59.2 }],
  ['2025-05-20', { body_fat_pct: 24.8, skeletal_muscle_kg: 36.0 }],
  ['2026-08-10', { body_fat_pct: 20.0, skeletal_muscle_kg: 39.9 }],
  ['2026-09-01', { body_fat_pct: 19.6, skeletal_muscle_kg: 39.9 }],
  ['2026-09-20', { body_fat_pct: 18.9, skeletal_muscle_kg: 40.2, weight_kg: 86.5 }]
];

function frontmatter(fields) {
  return `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n`;
}

function datedPath(date, slug) {
  return `data/body/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}-${slug}.md`;
}

export function bodyChartExtraFiles() {
  const files = WEIGHTS.map(([date, weight_kg]) => ({
    path: datedPath(date, 'weight'),
    content: frontmatter({
      schema_version: 1,
      id: `weight-${date}`,
      type: 'weight',
      date,
      time: '12:00',
      created_at: `${date}T12:00:00+10:00`,
      updated_at: `${date}T12:00:00+10:00`,
      source: 'test_fixture',
      weight_kg
    })
  }));
  for (const [date, fields] of COMPOSITIONS) {
    files.push({
      path: datedPath(date, 'composition'),
      content: frontmatter({
        schema_version: 1,
        id: `composition-${date}`,
        type: 'composition',
        date,
        time: '12:00',
        created_at: `${date}T12:00:00+10:00`,
        updated_at: `${date}T12:00:00+10:00`,
        source: 'test_fixture',
        ...fields
      })
    });
  }
  return files;
}
